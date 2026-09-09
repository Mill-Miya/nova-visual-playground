// Runs the production renderer in a deterministic host. It tests behavior, not pixel quality.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
let width=1440,height=900,queries=0,measurements=0,drawingCalls=0,now=0,serial=0;
const elements=new Map(),windowListeners={},documentListeners={},motionListeners={},frames=new Map(),events=[];
class Element {
 constructor(name=''){this.name=name;this.dataset={};this.style={setProperty:(k,v)=>this.style[k]=String(v)};this.attrs={};this.hidden=false;this.checked=false;this.listeners={};this.textContent='';this.children=new Map();}
 setAttribute(k,v){this.attrs[k]=String(v);}
 addEventListener(k,f){this.listeners[k]=f;}
 querySelector(k){queries++;if(!this.children.has(k))this.children.set(k,new Element(k));return this.children.get(k);}
 getBoundingClientRect(){measurements++;assert.equal(this.name,'#stage','Only the stage may be measured');return {left:0,top:0,width,height};}
 matches(){return false;}
}
const el=k=>{if(!elements.has(k))elements.set(k,new Element(k));return elements.get(k);};
const modes=['idle','active','listening','thinking','speaking','scanning','notification','error','full'];
const buttons=modes.map(mode=>{const b=new Element();b.dataset.mode=mode;return b;});
const panels=Array.from({length:3},(_,i)=>el(`#hud-${i}`));
const chrome=[el('.masthead'),el('.idle-invite'),el('.stage-footer')];
const gradient={addColorStop(){}};
let stack=0;
const ctx=new Proxy({globalAlpha:1}, {get(target,key){if(key in target)return target[key];if(key==='createRadialGradient')return (...args)=>{args.forEach(a=>assert.ok(Number.isFinite(a)));return gradient;};return (...args)=>{if(key==='save')stack++;if(key==='restore')assert.ok(--stack>=0);for(const a of args)if(typeof a==='number')assert.ok(Number.isFinite(a),`Nonfinite Canvas ${key}`);drawingCalls++;};},set(target,key,value){if(typeof value==='number')assert.ok(Number.isFinite(value));target[key]=value;return true;}});
el('#field').getContext=()=>ctx;
el('#controls').hidden=true;
const motion={matches:false,addEventListener:(k,f)=>motionListeners[k]=f};
const document={body:new Element(),hidden:false,querySelector:k=>{queries++;return el(k);},querySelectorAll:k=>{queries++;return k==='[data-mode]'?buttons:k==='.hud'?panels:k==='.lab-chrome'?chrome:[];},addEventListener:(k,f)=>documentListeners[k]=f};
const host={document,devicePixelRatio:3,matchMedia:()=>motion,requestAnimationFrame:fn=>{frames.set(++serial,fn);return serial;},cancelAnimationFrame:id=>frames.delete(id),CustomEvent:class{constructor(type,opts){this.type=type;this.detail=opts.detail;}},console};
host.window={addEventListener:(k,f)=>windowListeners[k]=f,dispatchEvent:e=>events.push(e)};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'app.js'),'utf8'),host);
const api=host.window.nova;
function tick(count=1){for(let i=0;i<count;i++){now+=1000/60;const callbacks=[...frames.values()];frames.clear();assert.ok(callbacks.length<=1,'Only one render loop');callbacks.forEach(fn=>fn(now));assert.equal(stack,0,'Balanced Canvas save/restore');}}
function seconds(n){tick(Math.ceil(n*60));}
function visibleKinds(){return panels.filter(p=>!p.hidden&&p.attrs['aria-hidden']==='false').map(p=>p.dataset.kind);}
function click(id){el(id).listeners.click();}
assert.deepEqual(Object.keys(api.getState()).sort(),['level','simulated','state']);
assert.deepEqual(Array.from(api.states),modes);assert.equal(api.getState().state,'idle');assert.equal(el('#field').width,width*2,'DPR cap');
const expected={idle:[],active:[],full:['CORE','MEMORY','SYSTEM'],listening:['AUDIO','SIGNAL'],thinking:['CORE','PROCESS'],speaking:['AUDIO OUT'],scanning:['VISION','TARGET','ANALYSIS'],notification:['EVENT','SOURCE'],error:['DIAGNOSTIC','RECOVERY']};
for(const mode of modes){const before=drawingCalls;api.setState(mode);seconds(3);assert.equal(api.getState().state,mode);assert.equal(document.body.dataset.state,mode);assert.equal(buttons.filter(b=>b.attrs['aria-pressed']==='true').length,1);assert.ok(drawingCalls>before,`${mode} rendered`);assert.deepEqual(visibleKinds(),expected[mode]);}
api.setState('scanning');seconds(2.4);assert.equal(el('#scan-label').dataset.locked,'false');seconds(.3);assert.equal(el('#scan-label').dataset.locked,'true');assert.match(el('#scan-label').textContent,/TARGET ACQUIRED/);
api.setState('error');seconds(5.8);assert.equal(el('#state-label').textContent,'SIGNAL RESTORED');
for(let i=0;i<50;i++){api.setState(modes[i%9]);tick(2);}api.setState('idle');seconds(3);assert.deepEqual(visibleKinds(),[]);assert.equal(api.getState().level,'idle');
// Staggering: first panel text precedes the third, never all-at-once.
api.setState('full');seconds(1.15);assert.ok(Number(panels[0].style['--text'])>Number(panels[2].style['--text']));seconds(2);
const savedQueries=queries,savedMeasurements=measurements;seconds(2);assert.equal(queries,savedQueries,'No frame-time DOM queries');assert.equal(measurements,savedMeasurements,'No frame-time layout reads');
for(const [ww,hh] of [[390,844],[320,568],[844,390],[667,375],[1440,900]]){width=ww;height=hh;windowListeners.resize();for(const mode of modes){api.setState(mode);tick(3);}}
api.setCinematic(true);assert.equal(document.body.dataset.cinematic,'true');assert.equal(el('#cinematic').checked,true);api.setCinematic(false);assert.equal(document.body.dataset.cinematic,'false');
el('#cinematic').listeners.change({target:{checked:true}});assert.equal(document.body.dataset.cinematic,'true');
el('#stage').listeners.pointermove({clientX:width/2+100,clientY:height*.46});seconds(1);el('#stage').listeners.pointerleave();seconds(1);
for(const name of ['boot','shutdown','device']){
 click(`#${name}`);const stages=new Set();for(let i=0;i<(name==='device'?370:140);i++){tick();stages.add(document.body.dataset.demoStage);}
 assert.ok(stages.size>3,`${name} phases`);assert.equal(api.getState().state,'idle');assert.equal(document.body.dataset.demo,name==='shutdown'?'off':'none');
}
api.setState('active');assert.equal(document.body.dataset.demo,'none');
api.playDemo('device');seconds(1);api.setState('thinking');seconds(6);assert.equal(api.getState().state,'thinking');assert.equal(document.body.dataset.demo,'none','State selection cancels demo');
click('#sequence');assert.equal(el('#sequence').textContent,'■ STOP');seconds(3);assert.equal(api.getState().state,'active');click('#sequence');const stopped=api.getState().state;seconds(5);assert.equal(api.getState().state,stopped);assert.equal(el('#sequence').textContent,'▶ SEQUENCE');
click('#sequence');seconds(42);assert.equal(api.getState().state,'idle');assert.equal(el('#sequence').textContent,'▶ SEQUENCE');
click('#sequence');document.hidden=true;documentListeners.visibilitychange();assert.equal(frames.size,0);assert.equal(el('#sequence').textContent,'▶ SEQUENCE');const calls=drawingCalls;seconds(2);assert.equal(drawingCalls,calls);document.hidden=false;documentListeners.visibilitychange();documentListeners.visibilitychange();assert.equal(frames.size,1);tick();
api.setState('full');windowListeners.keydown({key:'Escape',target:{matches:()=>true}});assert.equal(api.getState().state,'idle','Escape works while input is focused');
motion.matches=true;motionListeners.change();
for(const mode of modes){api.setState(mode);seconds(3);assert.deepEqual(visibleKinds(),expected[mode]);}
api.setState('idle');seconds(3);const stableDraws=drawingCalls;seconds(2);assert.equal(drawingCalls,stableDraws,'Reduced-motion idle does not redraw');
el('#stage').listeners.pointermove({clientX:width/2+100,clientY:height*.46});tick();assert.equal(drawingCalls,stableDraws);
for(const name of ['boot','shutdown','device']){api.playDemo(name);seconds(name==='device'?6.2:2.4);assert.equal(document.body.dataset.demo,name==='shutdown'?'off':'none');}
api.setState('full');api.setState('invalid');assert.equal(api.getState().state,'full');
for(const name of ['start','expand','lock','notify','error','close'])assert.ok(events.some(e=>e.type==='nova:sound'&&e.detail.name===name),`sound event: ${name}`);
assert.ok(events.filter(e=>e.type==='nova:statechange').every(e=>e.detail.simulated===true));
console.log(`PASS: 9-state API, finite Canvas (${drawingCalls} calls), HUD sets/stagger, rapid transitions, scan lock, recovery, demos/cancellation, cinematic, pointer, sequence full-run/cancellation, hidden-tab single-loop, DPR cap, reduced-motion idle, 6 sound events, zero frame-time DOM queries/layout reads.`);
