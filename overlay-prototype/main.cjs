'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL,fileURLToPath}=require('node:url');
const {WINDOW_SIZE,normalizeSettings,fitPosition,defaultPosition,settingsForDisk}=require('./window-state.cjs');
const {buildEntry}=require('./prepare.cjs');
const TITLE='N.O.V.A. Overlay Prototype';
const DEFAULT_HOTKEY='Control+Alt+Space';

function trayImage(nativeImage){
 const size=32,pixels=Buffer.alloc(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const d=Math.hypot(x-15.5,y-15.5),ring=Math.abs(d-11)<.8,core=d<3;
  const a=core?245:ring?180:Math.max(0,50-d*5);
  const i=(y*size+x)*4;pixels[i]=220;pixels[i+1]=195;pixels[i+2]=core?220:85;pixels[i+3]=a;
 }
 return nativeImage.createFromBitmap(pixels,{width:size,height:size,scaleFactor:1});
}
function createHost(electron,{settingsFile,hotkey=DEFAULT_HOTKEY,smoke=false}={}){
 const {app,BrowserWindow,Tray,Menu,nativeImage,globalShortcut,ipcMain,screen}=electron;
 let ready=false,active=false,menuOpen=false,saveTimer=null,quitting=false,externalState='idle',commands=[],commandSender=null;
 let settings;
 try{settings=normalizeSettings(JSON.parse(fs.readFileSync(settingsFile,'utf8')));}catch{settings=normalizeSettings({});}
 const areas=()=>screen.getAllDisplays().map(display=>display.workArea);
 const position=fitPosition(settings.position,areas());
 const entry=path.join(__dirname,'.generated/index.html'),entryURL=pathToFileURL(entry).href;
 const win=new BrowserWindow({
  title:TITLE,...position,width:WINDOW_SIZE,height:WINDOW_SIZE,
  transparent:true,backgroundColor:'#00000000',frame:false,hasShadow:false,
  alwaysOnTop:true,skipTaskbar:true,show:false,focusable:false,
  resizable:false,maximizable:false,minimizable:false,fullscreenable:false,
  webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false,backgroundThrottling:true,spellcheck:false,partition:smoke?'nova-overlay-test':'nova-overlay'}
 });
 win.setAlwaysOnTop(true,'screen-saver');
 win.setIgnoreMouseEvents(true,{forward:true});
 win.setMenu(null);
 const allowedFiles=new Set([entry,path.join(__dirname,'overlay.css'),path.join(__dirname,'renderer.js'),path.join(__dirname,'../visual-playground/app.js'),path.join(__dirname,'../visual-playground/style.css')].map(p=>path.resolve(p)));
 win.webContents.session.setPermissionRequestHandler((_webContents,_permission,callback)=>callback(false));
 win.webContents.session.setPermissionCheckHandler(()=>false);
 win.webContents.session.webRequest.onBeforeRequest((details,callback)=>{
  let permitted=false;try{permitted=allowedFiles.has(path.resolve(fileURLToPath(details.url)));}catch{}
  callback({cancel:!permitted});
 });
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 win.webContents.on('will-navigate',event=>event.preventDefault());
 win.webContents.on('will-attach-webview',event=>event.preventDefault());
 win.on('page-title-updated',event=>event.preventDefault());
 const tray=new Tray(trayImage(nativeImage));
 const send=()=>{if(ready&&!win.isDestroyed())win.webContents.send('nova-overlay:settings',{active,menuOpen,commands,coreSize:settings.coreSize,state:externalState==='idle'&&active?'active':externalState});};
 function setCommands(value){commands=value;if(!commands.length)menuOpen=false;send();}
 function setMenuOpen(value){menuOpen=active&&value===true;send();}
 function setExternalState(state){
  if(!Object.hasOwn(require('./integration.cjs').PRIORITY,state))return;
  if(state==='idle'&&externalState!=='idle')menuOpen=false;
  externalState=state;send();
 }
 function save(){
  clearTimeout(saveTimer);saveTimer=null;if(win.isDestroyed())return;
  settings=settingsForDisk(settings,win.getBounds());
  try{fs.mkdirSync(path.dirname(settingsFile),{recursive:true});const temp=settingsFile+'.tmp';fs.writeFileSync(temp,JSON.stringify(settings,null,2));fs.renameSync(temp,settingsFile);}
  catch(error){console.error('NOVA position save failed:',error.message);}
 }
 function resetPosition(){const p=defaultPosition(screen.getPrimaryDisplay().workArea);const fitted=fitPosition(p,areas());win.setPosition(fitted.x,fitted.y);save();}
 function setCoreSize(size){settings=normalizeSettings({...settings,coreSize:size});send();save();updateTray();}
 function updateTray(){
  tray.setToolTip(`N.O.V.A. — ${active?'Active / click Core for actions':'Idle / click-through'}\n${registered?hotkey:'Use tray menu to activate'}`);
  tray.setContextMenu(Menu.buildFromTemplate([
   {label:active?'Return to Idle (click-through)':'Activate Core (interactive)',click:()=>setActive(!active)},
   {label:'Idle / Esc',click:()=>setActive(false)},
   {type:'separator'},
   {label:'Core size',submenu:[40,50,58,64,70].map(size=>({label:`${size}px`,type:'radio',checked:settings.coreSize===size,click:()=>setCoreSize(size)}))},
   {label:'Reset position',click:resetPosition},
   {label:`Hotkey: ${registered?hotkey:'unavailable — use this menu'}`,enabled:false},
   {type:'separator'},{label:'Quit N.O.V.A.',click:()=>app.quit()}
  ]));
 }
 function setActive(value){
  active=!!value;
  if(!active)menuOpen=false;
  win.setIgnoreMouseEvents(!active,{forward:true});
  win.setFocusable(active);
  if(active){win.show();win.focus();}else{win.blur();win.showInactive();}
  // Windows may recalculate z-order when focusability or visibility changes.
  win.setAlwaysOnTop(true,'screen-saver');
  send();updateTray();
 }
 function authorized(event){return event.sender===win.webContents&&event.senderFrame===win.webContents.mainFrame&&event.senderFrame.url===entryURL;}
 const onReady=event=>{if(!authorized(event))return;ready=true;send();win.showInactive();win.setAlwaysOnTop(true,'screen-saver');};
 const onIdle=event=>{if(authorized(event))setActive(false);};
 const onMenu=(event,value)=>{if(authorized(event)&&typeof value==='boolean')setMenuOpen(value);};
 const onCommand=async(event,command)=>{
  if(!authorized(event)||!require('./integration.cjs').COMMANDS.includes(command))return {ok:false,error:'invalid'};
  if(!active||!menuOpen||!commands.includes(command)||!commandSender)return {ok:false,error:'unavailable'};
  // Release native focus before Qt creates a dialog or region selection.
  setActive(false);
  try{return await commandSender(command);}catch{return {ok:false,error:'disconnected'};}
 };
 ipcMain.on('nova-overlay:ready',onReady);ipcMain.on('nova-overlay:idle',onIdle);
 ipcMain.on('nova-overlay:menu',onMenu);ipcMain.handle('nova-overlay:command',onCommand);
 win.webContents.on('before-input-event',(event,input)=>{if(active&&input.type==='keyDown'&&input.key==='Escape'){event.preventDefault();menuOpen?setMenuOpen(false):setActive(false);}});
 win.on('blur',()=>{if(active)setActive(false);});
 win.webContents.on('render-process-gone',()=>{console.error('NOVA renderer stopped. Exiting to avoid an invisible input-blocking window.');smoke?app.exit(1):app.quit();});
 win.webContents.on('did-fail-load',(_event,code,description)=>{if(code!==-3){console.error('NOVA entry failed:',description);smoke?app.exit(1):app.quit();}});
 let registered=false;
 try{registered=globalShortcut.register(hotkey,()=>setActive(!active));}catch(error){console.error('Hotkey unavailable:',error.message);}
 if(!registered)console.warn(`NOVA hotkey ${hotkey} is unavailable. Activate/quit through the tray menu.`);
 tray.on('double-click',()=>setActive(!active));
 win.webContents.on('context-menu',()=>{if(active)tray.popUpContextMenu();});
 win.on('move',()=>{clearTimeout(saveTimer);saveTimer=setTimeout(save,250);});
 const displayChanged=()=>{const p=fitPosition(win.getBounds(),areas());win.setPosition(p.x,p.y);save();};
 screen.on('display-removed',displayChanged);screen.on('display-metrics-changed',displayChanged);
 win.on('close',save);
 win.on('closed',()=>{if(!quitting)app.quit();});
 app.on('before-quit',()=>{quitting=true;save();});
 app.on('will-quit',()=>{clearTimeout(saveTimer);globalShortcut.unregisterAll();tray.destroy();ipcMain.removeListener('nova-overlay:ready',onReady);ipcMain.removeListener('nova-overlay:idle',onIdle);screen.removeListener('display-removed',displayChanged);screen.removeListener('display-metrics-changed',displayChanged);});
 app.on('second-instance',(_event,_argv,_cwd,data)=>{if(!data?.integration)setActive(true);});
 app.on('will-quit',()=>{ipcMain.removeListener('nova-overlay:menu',onMenu);ipcMain.removeHandler('nova-overlay:command');});
 updateTray();win.loadFile(entry);
 return {win,tray,setActive,setExternalState,setCommands,setMenuOpen,setCommandSender:sender=>{commandSender=sender;},setCoreSize,resetPosition,save,getSettings:()=>({...settings}),isActive:()=>active,isMenuOpen:()=>menuOpen,isReady:()=>ready,hotkeyRegistered:()=>registered};
}

async function run(){
 const electron=require('electron'),{app}=electron,smoke=process.argv.includes('--smoke'),integrationSmoke=process.argv.includes('--integration-smoke');
 app.setName(TITLE);
 const userData=integrationSmoke?path.join(__dirname,'.test-profile/integration-native'):smoke?path.join(__dirname,'.test-profile'):path.join(app.getPath('appData'),'NOVA Overlay Prototype');
 app.setPath('userData',userData);
 if(!app.requestSingleInstanceLock({integration:!!process.env.NOVA_OVERLAY_OWNER_TOKEN})){smoke?app.exit(1):app.quit();return;}
 await app.whenReady();buildEntry();
 const host=createHost(electron,{settingsFile:path.join(userData,'settings.json'),hotkey:process.env.NOVA_OVERLAY_HOTKEY||DEFAULT_HOTKEY,smoke});
 if(integrationSmoke)require('./integration-observer.cjs')(host,app,userData);
 try{
  const integration=await require('./integration.cjs').startIntegration({
   ...(smoke?{file:path.join(userData,'endpoint.json')}:{}),
   onState:state=>host.setExternalState(state),onCommands:commands=>host.setCommands(commands),onShutdown:()=>app.quit()
  });
  host.integration=integration;
  host.setCommandSender(command=>integration.requestCommand(command));
  app.on('will-quit',()=>integration.close());
 }catch(error){console.error('NOVA integration unavailable:',error.message);}
 if(smoke){try{await require('./native-smoke.cjs')(host,userData);console.log('NOVA native smoke passed.');app.quit();}catch(error){console.error(error);app.exit(1);}}
}
// Electron's app loader does not guarantee Node's require.main identity.
if(process.versions.electron&&process.type==='browser')run().catch(error=>{console.error(error);require('electron').app.exit(1);});
module.exports={createHost,trayImage};
