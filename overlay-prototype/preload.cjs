'use strict';
const {contextBridge,ipcRenderer}=require('electron');
// Narrow bridge: no arbitrary IPC, file access, eval or shell execution.
contextBridge.exposeInMainWorld('novaOverlay',Object.freeze({
 ready:()=>ipcRenderer.send('nova-overlay:ready'),
 idle:()=>ipcRenderer.send('nova-overlay:idle'),
 menu:value=>ipcRenderer.send('nova-overlay:menu',value),
 command:id=>ipcRenderer.invoke('nova-overlay:command',id),
 onSettings:callback=>{
  const listener=(_event,settings)=>callback(settings);
  ipcRenderer.on('nova-overlay:settings',listener);
  return ()=>ipcRenderer.removeListener('nova-overlay:settings',listener);
 }
}));
