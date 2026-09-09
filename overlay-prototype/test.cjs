'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {EventEmitter}=require('node:events');
const {pathToFileURL}=require('node:url');
const {normalizeSettings,fitPosition,defaultPosition}=require('./window-state.cjs');
const {buildEntry}=require('./prepare.cjs');
const {createHost}=require('./main.cjs');
const screens=[{x:0,y:0,width:1920,height:1040},{x:-1280,y:0,width:1280,height:984}];
assert.deepEqual(normalizeSettings({coreSize:200,position:{x:Infinity,y:NaN}}),{version:1,coreSize:70,position:null});
assert.equal(normalizeSettings({coreSize:-5}).coreSize,40);
assert.equal(normalizeSettings(null).coreSize,58);
assert.deepEqual(fitPosition({x:-800,y:200},screens),{x:-800,y:200});
assert.deepEqual(fitPosition({x:3000,y:2000},screens),{x:1600,y:720});
assert.deepEqual(fitPosition({x:-800,y:200},[screens[0]]),{x:0,y:200});
const initial=defaultPosition(screens[0]);assert.ok(initial.x>1400&&initial.y>500);
const html=buildEntry();assert.ok(html.includes('data-surface="overlay"'));assert.ok(html.includes('Content-Security-Policy'));assert.ok(html.includes('../../visual-playground/app.js'));assert.ok(!html.includes('<script src="app.js'));
const file=path.join(__dirname,'.test-profile/unit/settings.json');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'broken JSON');
function environment(registers=true){
 const app=new EventEmitter();app.quit=()=>{app.emit('before-quit');app.emit('will-quit');};
 const ipcMain=new EventEmitter();
 const screen=new EventEmitter();screen.getAllDisplays=()=>screens.map(workArea=>({workArea}));screen.getPrimaryDisplay=()=>({workArea:screens[0]});
 class Window extends EventEmitter{
  constructor(options){super();this.options=options;this.bounds={x:options.x,y:options.y,width:options.width,height:options.height};this.messages=[];this.webContents=new EventEmitter();this.webContents.mainFrame={url:pathToFileURL(path.join(__dirname,'.generated/index.html')).href};this.webContents.send=(...message)=>this.messages.push(message);this.webContents.setWindowOpenHandler=fn=>this.openHandler=fn;this.webContents.session={setPermissionRequestHandler:fn=>this.permissionHandler=fn,setPermissionCheckHandler:fn=>this.permissionCheck=fn,webRequest:{onBeforeRequest:fn=>this.requestHandler=fn}};}
  setAlwaysOnTop(v){this.top=v;}setIgnoreMouseEvents(v){this.ignored=v;}setFocusable(v){this.focusable=v;}
  setMenu(){}show(){}focus(){this.focused=true;}blur(){this.focused=false;}showInactive(){}isDestroyed(){return false;}
  loadFile(file){this.loaded=file;}getBounds(){return {...this.bounds};}setPosition(x,y){this.bounds.x=x;this.bounds.y=y;}
 }
 class Tray extends EventEmitter{setToolTip(t){this.tooltip=t;}setContextMenu(m){this.menu=m;}destroy(){this.destroyed=true;}popUpContextMenu(){}}
 const globalShortcut={register:(key,fn)=>{globalShortcut.callback=fn;return registers;},unregisterAll:()=>globalShortcut.cleaned=true};
 return {app,ipcMain,screen,BrowserWindow:Window,Tray,Menu:{buildFromTemplate:m=>m},nativeImage:{createFromBitmap:(data,size)=>({data,size})},globalShortcut};
}
const e=environment(),host=createHost(e,{settingsFile:file});
assert.equal(host.win.options.transparent,true);assert.equal(host.win.options.frame,false);assert.equal(host.win.options.hasShadow,false);assert.equal(host.win.top,true);assert.equal(host.win.ignored,true);assert.equal(host.win.options.webPreferences.sandbox,true);assert.equal(host.win.options.webPreferences.contextIsolation,true);assert.equal(host.win.options.webPreferences.nodeIntegration,false);
const trusted={sender:host.win.webContents,senderFrame:host.win.webContents.mainFrame};
e.ipcMain.emit('nova-overlay:ready',{sender:{},senderFrame:{}});assert.equal(host.isReady(),false);
e.ipcMain.emit('nova-overlay:ready',trusted);assert.equal(host.isReady(),true);assert.equal(host.win.messages.at(-1)[1].active,false);
e.globalShortcut.callback();assert.equal(host.isActive(),true);assert.equal(host.win.ignored,false);assert.equal(host.win.focusable,true);
e.ipcMain.emit('nova-overlay:idle',{sender:host.win.webContents,senderFrame:{url:'https://example.com'}});assert.equal(host.isActive(),true);
let prevented=false;host.win.webContents.emit('before-input-event',{preventDefault:()=>prevented=true},{type:'keyDown',key:'Escape'});assert.ok(prevented);assert.equal(host.isActive(),false);assert.equal(host.win.ignored,true);assert.equal(host.win.focusable,false);
host.setActive(true);e.ipcMain.emit('nova-overlay:idle',trusted);assert.equal(host.isActive(),false);
host.setCoreSize(70);host.win.setPosition(-800,240);host.save();assert.deepEqual(JSON.parse(fs.readFileSync(file,'utf8')).position,{x:-800,y:240});assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).coreSize,70);
let permission;host.win.permissionHandler(null,'media',v=>permission=v);assert.equal(permission,false);assert.equal(host.win.permissionCheck(),false);assert.equal(host.win.openHandler().action,'deny');
for(const [url,expected] of [['https://example.com',true],[pathToFileURL(path.join(__dirname,'../visual-playground/app.js')).href,false],[pathToFileURL(file).href,true]]){let cancel;host.win.requestHandler({url},r=>cancel=r.cancel);assert.equal(cancel,expected);}
e.screen.getAllDisplays=()=>[{workArea:screens[0]}];e.screen.emit('display-removed');assert.equal(host.win.bounds.x,0);
e.app.quit();assert.equal(e.globalShortcut.cleaned,true);assert.equal(host.tray.destroyed,true);assert.equal(e.ipcMain.listenerCount('nova-overlay:ready'),0);
const fallback=environment(false),second=createHost(fallback,{settingsFile:file});assert.equal(second.hotkeyRegistered(),false);assert.ok(second.tray.menu.some(item=>item.label?.includes('Activate')));assert.equal(second.getSettings().coreSize,70);fallback.app.quit();
console.log('PASS: entry reuse, native window flags, click-through transitions, Escape/hotkey/tray fallback, bounded IPC and resources, position persistence, disconnected displays, core-size limits, cleanup.');
