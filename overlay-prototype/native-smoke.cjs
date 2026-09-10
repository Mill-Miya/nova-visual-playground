'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
module.exports=async function nativeSmoke(host,profile){
 const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const until=async predicate=>{const deadline=Date.now()+10000;while(!predicate()){if(Date.now()>deadline)throw new Error('Native renderer ready timeout');await wait(50);}};
 await until(()=>host.isReady());
 await wait(1400);
 console.log('Native window:',{visible:host.win.isVisible(),top:host.win.isAlwaysOnTop(),bounds:host.win.getBounds()});
 assert.equal(host.win.isAlwaysOnTop(),true);
 assert.equal(host.win.isFocusable(),false);
 assert.equal(host.isActive(),false);
 const inspect=()=>host.win.webContents.executeJavaScript(`({state:window.nova.getState(), ready:document.body.dataset.overlayReady, surface:document.body.dataset.surface, background:getComputedStyle(document.querySelector('#stage')).backgroundColor, nodeAccess:typeof require, textVisible:[...document.querySelectorAll('.lab-chrome,.hud,.core-caption')].some(e=>getComputedStyle(e).display!=='none'),dragRegion:getComputedStyle(document.querySelector('#core-hit')).webkitAppRegion})`);
 const idle=await inspect();assert.equal(idle.ready,'true');assert.equal(idle.surface,'overlay');assert.equal(idle.background,'rgba(0, 0, 0, 0)');assert.equal(idle.state.state,'idle');assert.equal(idle.nodeAccess,'undefined');assert.equal(idle.textVisible,false);
 const capture=async name=>{
  const image=await host.win.webContents.capturePage();const {width,height}=image.getSize(),bitmap=image.toBitmap();
  for(const [x,y] of [[0,0],[width-1,0],[0,height-1],[width-1,height-1]])assert.equal(bitmap[(y*width+x)*4+3],0,'Window corners must be fully transparent');
  let visible=0;for(let i=3;i<bitmap.length;i+=4)if(bitmap[i]>0)visible++;
  assert.ok(visible>20,'Core must be rendered');assert.ok(visible<width*height*.5,'Most window pixels must be transparent');
  fs.writeFileSync(path.join(profile,name+'.png'),image.toPNG());return visible;
 };
 const idlePixels=await capture('idle');
 host.setActive(true);await wait(1500);
 const active=await inspect();assert.equal(active.state.state,'active');assert.equal(active.dragRegion,'no-drag');assert.equal(host.win.isFocusable(),true);
 const activePixels=await capture('active');assert.ok(activePixels>idlePixels,'Active Core must enlarge');
 await host.win.webContents.executeJavaScript("document.querySelector('#core-hit').click()");
 await wait(100);assert.equal(host.isMenuOpen(),true);assert.equal(await host.win.webContents.executeJavaScript("document.querySelector('#core-menu').hidden"),false);
 await capture('menu');
 assert.equal((await inspect()).state.state,'active','Overlay click must not open browser Full HUD');
 const original=host.win.getBounds();
 host.win.setPosition(original.x-20,original.y-20);
 await wait(400);
 const moved=JSON.parse(fs.readFileSync(path.join(profile,'settings.json'),'utf8'));
 assert.deepEqual(moved.position,{x:original.x-20,y:original.y-20},'Native move event must persist position');
 host.win.setPosition(original.x,original.y);
 host.setCoreSize(70);await wait(80);assert.equal(await host.win.webContents.executeJavaScript("document.querySelector('#size').value"),'70');
 host.win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});
 await wait(100);assert.equal(host.isMenuOpen(),false);assert.equal(host.isActive(),true);
 host.win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});
 await wait(1400);assert.equal((await inspect()).state.state,'idle');assert.equal(host.win.isFocusable(),false);
 host.save();const saved=JSON.parse(fs.readFileSync(path.join(profile,'settings.json'),'utf8'));assert.equal(saved.coreSize,70);assert.ok(Number.isFinite(saved.position.x));
 assert.ok(host.integration,'Native smoke must start the IPC listener');
 const {connect,send}=require('./integration-test.cjs'),descriptor=host.integration.descriptor;
 const socket=await connect(descriptor);
 try{
  for(const state of ['active','scanning','thinking','speaking','notification','error','idle']){
   await send(socket,descriptor,{op:'state',state});await wait(100);
   assert.equal((await inspect()).state.state,state);
   assert.equal(host.win.isFocusable(),false,'External activity must not steal focus');
  }
  await send(socket,descriptor,{op:'state',state:'thinking'});await wait(50);
 }finally{socket.destroy();}
 await wait(100);assert.equal((await inspect()).state.state,'idle','Disconnect returns to Idle');
 const reconnect=await connect(descriptor);
 await send(reconnect,descriptor,{op:'state',state:'notification'});await wait(100);
 assert.equal((await inspect()).state.state,'notification');reconnect.destroy();
 await wait(100);assert.equal((await inspect()).state.state,'idle');
 const {peer}=require('./command-test.cjs'),commands=require('./integration.cjs').COMMANDS;
 const appPeer=await peer(descriptor);
 try{
  await appPeer.send({op:'register_commands',commands});await wait(100);
  host.setActive(true);await wait(100);
  await host.win.webContents.executeJavaScript("document.querySelector('#core-hit').click()");await wait(100);
  await capture('menu-connected');
  await host.win.webContents.executeJavaScript("document.querySelector('[data-command=ask_ai]').click()");
  const request=await appPeer.read();assert.equal(request.command,'ask_ai');assert.equal(host.isActive(),false);
  await appPeer.send({...request,op:'command_result',ok:true});await wait(100);
  host.setActive(true);await wait(100);await host.win.webContents.executeJavaScript("document.querySelector('#core-hit').click()");await wait(100);
  await host.win.webContents.executeJavaScript("document.body.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))");await wait(100);assert.equal(host.isMenuOpen(),false);
  await host.win.webContents.executeJavaScript("document.querySelector('#core-hit').click()");await wait(100);assert.equal(host.isMenuOpen(),true);
  appPeer.socket.destroy();await wait(150);assert.equal(host.isMenuOpen(),false);
  host.setActive(false);
 }finally{appPeer.socket.destroy();}
 fs.writeFileSync(path.join(profile,'native-report.json'),JSON.stringify({idle,active,idlePixels,activePixels,integration:true,alwaysOnTop:host.win.isAlwaysOnTop(),hotkeyRegistered:host.hotkeyRegistered(),saved,passed:true},null,2));
};
