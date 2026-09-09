'use strict';
const assert = require('node:assert/strict');
const net = require('node:net');
const path = require('node:path');
const {once} = require('node:events');
const {startIntegration, validPacket, PRIORITY} = require('./integration.cjs');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function connect(descriptor) {
  const socket = net.connect(descriptor.port, '127.0.0.1');
  socket.on('error', () => {});
  await once(socket, 'connect');
  return socket;
}
async function send(socket, descriptor, fields) {
  const reply = once(socket, 'data');
  socket.write(JSON.stringify({v:1,token:descriptor.token,...fields})+'\n');
  assert.deepEqual(JSON.parse((await reply)[0]), {v:1,ok:true});
}
async function run() {
  for (const state of Object.keys(PRIORITY)) assert.ok(validPacket({v:1,op:'state',token:'x',state}));
  for (const state of ['full','listening','invalid','__proto__',null,{},1]) assert.equal(validPacket({v:1,op:'state',token:'x',state}),false);
  assert.equal(validPacket({v:1,op:'state',token:'x',state:'idle',code:'alert(1)'}),false);
  assert.equal(validPacket({v:1,op:'state',token:'x',state:'idle',message:'x'.repeat(513)}),false);
  const states = []; let shutdowns = 0;
  const file = path.join(__dirname,'.test-profile','integration-endpoint.json');
  let server = await startIntegration({file,onState:state=>states.push(state),onShutdown:()=>shutdowns++,owner:'b'.repeat(64),leaseMs:250});
  const sockets = [];
  try {
    const d = server.descriptor, a = await connect(d), b = await connect(d); sockets.push(a,b);
    await send(a,d,{op:'state',state:'thinking'});
    await send(b,d,{op:'state',state:'notification'}); assert.equal(states.at(-1),'thinking');
    await send(b,d,{op:'state',state:'scanning'}); assert.equal(states.at(-1),'scanning');
    b.destroy(); await wait(30); assert.equal(states.at(-1),'thinking');
    await send(a,d,{op:'state',state:'error'}); assert.equal(states.at(-1),'error');
    await wait(600); assert.equal(states.at(-1),'idle','leases must expire without a disconnect');
    await send(a,d,{op:'state',state:'active'}); assert.equal(states.at(-1),'active');
    for (const fields of [{op:'state',state:'invalid'},{op:'state',state:'idle',token:'0'.repeat(64)},{op:'state',state:'idle',javascript:'x'}]) {
      const bad = await connect(d); sockets.push(bad); const closed = once(bad,'close');
      bad.write(JSON.stringify({v:1,token:d.token,...fields})+'\n'); await closed;
    }
    const large = await connect(d); sockets.push(large); const closed = once(large,'close'); large.write('x'.repeat(4097)); await closed;
    const split = await connect(d); sockets.push(split);
    const packet=JSON.stringify({v:1,token:d.token,op:'state',state:'speaking',message:'状態のみ'});
    split.write(packet.slice(0,12)); const response=once(split,'data'); split.write(packet.slice(12)+'\n'); await response;
    assert.equal(states.at(-1),'speaking');
    await send(split,d,{op:'shutdown',owner:null}); await wait(20); assert.equal(shutdowns,0);
    const owned = await connect(d); sockets.push(owned);
    await send(owned,d,{op:'shutdown',owner:'b'.repeat(64)}); await wait(20); assert.equal(shutdowns,1);
    server.close(); await wait(30);
    server = await startIntegration({file,onState:state=>states.push(state)});
    assert.notEqual(server.descriptor.token,d.token);
    const fresh=await connect(server.descriptor); sockets.push(fresh);
    await send(fresh,server.descriptor,{op:'state',state:'thinking'}); assert.equal(states.at(-1),'thinking');
    await send(fresh,server.descriptor,{op:'shutdown',owner:'b'.repeat(64)}); await wait(20); assert.equal(shutdowns,1);
  } finally { for(const socket of sockets)socket.destroy(); server.close(); }
  console.log('PASS: loopback IPC, fixed schema/auth, size limits, fragmented packets, priority, leases, disconnect/reconnect, ownership-safe shutdown.');
}
if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={connect,send};
