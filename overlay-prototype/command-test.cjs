'use strict';
const assert=require('node:assert/strict');
const net=require('node:net');
const path=require('node:path');
const {startIntegration,validPacket,COMMANDS}=require('./integration.cjs');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function peer(descriptor){
 const socket=net.createConnection({host:'127.0.0.1',port:descriptor.port});
 await new Promise((r,j)=>{socket.once('connect',r);socket.once('error',j);});
 let buffer='',packets=[],readers=[];
 socket.on('data',chunk=>{buffer+=chunk;let i;while((i=buffer.indexOf('\n'))>=0){const p=JSON.parse(buffer.slice(0,i));buffer=buffer.slice(i+1);readers.length?readers.shift()(p):packets.push(p);}});
 socket.on('error',()=>{});
 const read=()=>packets.length?Promise.resolve(packets.shift()):new Promise(r=>readers.push(r));
 const write=packet=>socket.write(JSON.stringify({v:1,token:descriptor.token,...packet})+'\n');
 return {socket,read,write,async send(p){write(p);assert.deepEqual(await read(),{v:1,ok:true});},packets};
}
async function run(){
 const updates=[];
 const server=await startIntegration({file:path.join(__dirname,'.test-profile/commands/endpoint.json'),onCommands:c=>updates.push(c),commandTimeoutMs:250});
 let p;
 try{
  assert.deepEqual(await server.requestCommand('exec'),{ok:false,error:'invalid'});
  assert.deepEqual(await server.requestCommand('ask_ai'),{ok:false,error:'unavailable'});
  for(const extra of [{path:'x'},{command:'exec'},{error:'traceback'},{request_id:true},{ok:'yes'}])
   assert.equal(validPacket({v:1,op:'command_result',token:'a',request_id:1,command:'ask_ai',ok:true,...extra}),false);
  assert.equal(validPacket({v:1,op:'register_commands',token:'a',commands:['ask_ai','ask_ai']}),false);
  p=await peer(server.descriptor);
  await p.send({op:'register_commands',commands:COMMANDS});
  assert.deepEqual(updates.at(-1),COMMANDS);
  let result=server.requestCommand('ask_ai');const command=await p.read();
  assert.deepEqual(command,{v:1,op:'command',token:server.descriptor.token,request_id:1,command:'ask_ai'});
  assert.deepEqual(await server.requestCommand('ask_region'),{ok:false,error:'busy'});
  await p.send({...command,op:'command_result',ok:true});
  assert.deepEqual(await result,{ok:true});
  await wait(410);
  result=server.requestCommand('ask_region');const second=await p.read();
  await p.send({...second,op:'command_result',ok:false,error:'unavailable'});
  assert.deepEqual(await result,{ok:false,error:'unavailable'});
  await wait(410);
  result=server.requestCommand('ask_ai');await p.read();p.socket.destroy();
  assert.deepEqual(await result,{ok:false,error:'disconnected'});
  p=await peer(server.descriptor);await p.send({op:'register_commands',commands:COMMANDS});
  await wait(410);assert.equal(p.packets.length,0,'No command replay on reconnect');
  result=server.requestCommand('open_settings');const third=await p.read();
  assert.equal(third.request_id,1,'Request sequence belongs to a connection');
  await p.send({...third,op:'command_result',ok:true});assert.deepEqual(await result,{ok:true});
  const ambiguous=await peer(server.descriptor);await ambiguous.send({op:'register_commands',commands:COMMANDS});
  assert.deepEqual(await server.requestCommand('ask_ai'),{ok:false,error:'unavailable'});ambiguous.socket.destroy();
  await wait(410);result=server.requestCommand('ask_ai');await p.read();
  assert.deepEqual(await result,{ok:false,error:'timeout'});
  console.log('PASS: fixed commands/schema, registration, authenticated reverse packets, success/failure, inflight guard, disconnect, no replay, reconnect, ambiguous clients, timeout.');
 }finally{p?.socket.destroy();server.close();}
}
if(require.main===module)run().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={peer};
