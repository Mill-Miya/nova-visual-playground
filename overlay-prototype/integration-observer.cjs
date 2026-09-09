'use strict';
// Explicit native test mode only. Observes rendered state; never accepts scripts over IPC.
const fs=require('node:fs');
const path=require('node:path');
module.exports=(host,app,profile)=>{
 fs.mkdirSync(profile,{recursive:true});
 const file=path.join(profile,'states.jsonl');
 fs.writeFileSync(file,'');
 let previous=null,pending=false;
 const timer=setInterval(async()=>{
  if(pending||!host.isReady()||host.win.isDestroyed())return;
  pending=true;
  try{
   const state=await host.win.webContents.executeJavaScript('window.nova.getState().state');
   if(state!==previous){fs.appendFileSync(file,JSON.stringify({state,at:Date.now()})+'\n');previous=state;}
  }catch{}finally{pending=false;}
 },50);
 app.on('will-quit',()=>clearInterval(timer));
};
