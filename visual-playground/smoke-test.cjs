// Dependency-free runtime smoke test: runs the real renderer with a minimal DOM/Canvas host.
// Pixel appearance still requires a real-browser visual review.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const modes = ['idle','active','listening','thinking','speaking','scanning','notification','error','full'];
const elements = new Map();
class Element {
  constructor(){this.dataset={};this.style={setProperty(){}};this.attrs={};this.checked=false;this.hidden=false;this.listeners={};this.textContent='';}
  setAttribute(k,v){this.attrs[k]=v;}
  addEventListener(k,f){this.listeners[k]=f;}
  append(){}
  matches(){return false;}
  getBoundingClientRect(){return {x:70,y:180,left:70,right:292,width:222,height:180};}
}
const element = selector => {if(!elements.has(selector))elements.set(selector,new Element());return elements.get(selector);};
const buttons=modes.map(mode=>{const e=new Element();e.dataset.mode=mode;return e;});
const panels=Array.from({length:4},()=>new Element());
let drawingCalls=0;
const gradient={addColorStop(){}};
const ctx = new Proxy({}, {get(target,key){if(key==='createRadialGradient')return ()=>gradient;return (...args)=>{for(const arg of args)if(typeof arg==='number')assert.ok(Number.isFinite(arg),`non-finite Canvas argument: ${key}`);drawingCalls++;};},set(){return true;}});
element('#field').getContext=()=>ctx;
let raf, nextTimer=0;
const timers=new Map(), events=[];
const document={body:new Element(),hidden:false,querySelector:element,querySelectorAll:s=>s==='[data-mode]'?buttons:s==='.hud'?panels:[],createElement:()=>new Element(),addEventListener(){}};
const motion={matches:false}; const listeners={};
const host={document,innerWidth:1440,innerHeight:900,devicePixelRatio:2,matchMedia:()=>motion,requestAnimationFrame:f=>{raf=f;return 1;},cancelAnimationFrame(){},setTimeout:(f)=>{timers.set(++nextTimer,f);return nextTimer;},clearTimeout:id=>timers.delete(id),CustomEvent:class{constructor(type,opts){this.type=type;this.detail=opts.detail;}},console};
host.window={addEventListener:(name,fn)=>listeners[name]=fn,dispatchEvent:e=>events.push(e)};
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'app.js'),'utf8'),host);
let now=0;
function render(count=180){for(let i=0;i<count;i++){now+=1000/60;raf(now);}}
assert.equal(host.window.nova.getState().state,'idle');
for(const mode of modes){host.window.nova.setState(mode);render();assert.equal(document.body.dataset.state,mode);assert.equal(buttons.filter(b=>b.attrs['aria-pressed']==='true').length,1);assert.ok(drawingCalls>0);if(mode==='scanning')assert.match(element('#scan-label').innerHTML,/TARGET ACQUIRED/);}
for(const width of [390,720,1440]){host.innerWidth=width;listeners.resize();for(const mode of modes){host.window.nova.setState(mode);render(4);}}
host.window.nova.setState('idle');render(180);assert.ok(panels.every(p=>p.attrs['aria-hidden']==='true'));
for(let i=0;i<30;i++){host.window.nova.setState(modes[i%9]);render(1);}host.window.nova.setState('idle');render();assert.equal(host.window.nova.getState().level,'idle');
motion.matches=true;host.window.nova.setState('full');render(2);
host.window.nova.setState('invalid');assert.equal(host.window.nova.getState().state,'full');
element('#sequence').listeners.click();assert.equal(element('#sequence').textContent,'■ STOP');element('#sequence').listeners.click();assert.equal(timers.size,0);
for(const name of ['start','expand','lock','notify','error','close'])assert.ok(events.some(e=>e.type==='nova:sound'&&e.detail.name===name),`missing sound event ${name}`);
console.log(`PASS: 9 states, finite Canvas rendering, rapid transitions, scan lock, collapse semantics, reduced-motion branch, sequence cancellation, 6 sound events (${drawingCalls} drawing calls).`);
