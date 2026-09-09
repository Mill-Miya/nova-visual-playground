/* N.O.V.A. II — local visual simulation. No device, network or microphone access. */
(() => {
'use strict';
const $ = selector => document.querySelector(selector);
const ui = Object.fromEntries(['stage','field','core-anchor','core-hit','state-label','level-readout','clock','size','size-value','sound','sequence','controls','toggle-controls','cinematic','boot','shutdown','device','scan-label','demo-label'].map(id=>[id,$(`#${id}`)]));
ui.caption=$('.core-caption'); ui.invite=$('.idle-invite'); ui.controlMark=$('#toggle-controls span');
const buttons=[...document.querySelectorAll('[data-mode]')];
const chrome=[...document.querySelectorAll('.lab-chrome')];
const panels=[...document.querySelectorAll('.hud')].map(el=>({el,head:el.querySelector('.panel-head'),title:el.querySelector('h2'),rows:el.querySelector('dl'),footer:el.querySelector('footer'),kind:'',x:0,y:0,width:0,wire:0}));
const ctx=ui.field.getContext('2d'), reduced=matchMedia('(prefers-reduced-motion: reduce)');
const overlaySurface=document.body.dataset.surface==='overlay';
const modes=Object.freeze(['idle','active','listening','thinking','speaking','scanning','notification','error','full']);
const labels={idle:'IDLE',active:'READY',listening:'LISTENING',thinking:'THINKING',speaking:'SPEAKING',scanning:'SCANNING',notification:'EVENT RECEIVED',error:'SIGNAL DEGRADED',full:'CORE ACTIVE'};
// Each state has a deliberate, sparse set; no state displays more than three panels.
const hudSets={idle:[],active:[],full:['CORE','MEMORY','SYSTEM'],listening:['AUDIO','SIGNAL'],thinking:['CORE','PROCESS'],speaking:['AUDIO OUT'],scanning:['VISION','TARGET','ANALYSIS'],notification:['EVENT','SOURCE'],error:['DIAGNOSTIC','RECOVERY']};
const data={
 CORE:['COHERENT',[['INTEGRITY','100.00 %'],['NEURAL FIELD','STABLE']]],
 MEMORY:['CONTEXT LINK',[['LINK','AVAILABLE'],['SYNC','LOCAL']]],
 SYSTEM:['QUIETLY PRESENT',[['HOST','N–07'],['POWER','NOMINAL']]],
 AUDIO:['RECEPTIVE',[['DIRECTION','INWARD'],['INPUT','SIMULATED']]],
 SIGNAL:['ATTENDING',[['FOCUS','NEAR FIELD'],['NOISE FLOOR','−62 dB']]],
 PROCESS:['CONCENTRATING',[['FLOW','CONVERGENT'],['CONTEXT','RESOLVING']]],
 'AUDIO OUT':['RESONANCE',[['DIRECTION','OUTWARD'],['OUTPUT','SIMULATED']]],
 VISION:['FIELD SCAN',[['MODE','PASSIVE'],['SENSOR','SIMULATED']]],
 TARGET:['ACQUIRING',[['OBJECT','VIRTUAL 01'],['POSITION','042.8 / 018.6']]],
 ANALYSIS:['EVALUATING',[['CONFIDENCE','PENDING'],['REGION','LOCAL FIELD']]],
 EVENT:['MEMORY LINK',[['STATUS','ESTABLISHED'],['PRIORITY','NORMAL']]],
 SOURCE:['LOCAL NODE',[['ORIGIN','N–07'],['CHANNEL','SIMULATED']]],
 DIAGNOSTIC:['PHASE OFFSET',[['CORE','PRESERVED'],['SIGNAL','DEGRADED']]],
 RECOVERY:['RESYNCHRONIZING',[['METHOD','PHASE ALIGN'],['ACTION','AUTOMATIC']]]
};
const TAU=Math.PI*2, cyan=[102,206,239], pale=[204,245,255], amber=[237,183,92];
const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const mix=(a,b,t)=>a+(b-a)*t;
let w=1,h=1,stageX=0,stageY=0,idleSize=58,mode='idle',level='idle',phase=0,target=0,time=0,last=null,entered=0;
let frameId=0,dirty=true,lastDraw=-1,lastClock=-1,collapseUntil=0,lockPlayed=false,recovered=false,completionAt=-10;
let orbit=0,orbitSpeed=.008,nodePhase=.7,particlePhase=0,particleSpeed=.011,nucleusX=0,nucleusY=0,cinematic=false;
let sweepStarted=-10,sweepProgress=1;
let pointer={x:0,y:0,inside:false}, audioContext, demo=null, demoStage='',powered=true;
let hudEpoch=0,retireAt=null,desiredKinds=[],hudKindKey='';
let sequenceIndex=-1,sequenceDue=0;
const sequence=['idle','active','listening','thinking','speaking','full','scanning','notification','error','active','idle'];
const durations=[2.2,2.8,3.5,4,3.5,4.5,5,4,6.5,2.2,1.8];

function emitSound(name){
 window.dispatchEvent(new CustomEvent('nova:sound',{detail:{name,simulated:true}}));
 if(!ui.sound.checked)return;
 try{
  audioContext ||= new (window.AudioContext||window.webkitAudioContext)();
  void audioContext.resume().catch(()=>{ui.sound.checked=false;});
  const frequencies={start:660,expand:780,lock:1050,notify:880,error:240,close:440},now=audioContext.currentTime;
  const gain=audioContext.createGain();gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(.024,now+.018);gain.gain.exponentialRampToValueAtTime(.0001,now+.24);gain.connect(audioContext.destination);
  const osc=audioContext.createOscillator();osc.type='sine';osc.frequency.setValueAtTime(frequencies[name],now);osc.frequency.exponentialRampToValueAtTime(frequencies[name]*(name==='close'?.7:1.12),now+.2);osc.connect(gain);osc.start(now);osc.stop(now+.25);osc.onended=()=>{osc.disconnect();gain.disconnect();};
 }catch{ui.sound.checked=false;}
}
function stopSequence(){sequenceIndex=-1;ui.sequence.textContent='▶ SEQUENCE';}
function accessibility(){
 ui.caption.setAttribute('aria-hidden',String(level==='idle'||!powered||!!demo));
 ui.invite.setAttribute('aria-hidden',String(level!=='idle'||cinematic||!!demo||!powered));
 for(const el of chrome)if(el!==ui.invite)el.setAttribute('aria-hidden',String(cinematic));
 ui['scan-label'].hidden=mode!=='scanning';ui['scan-label'].setAttribute('aria-hidden',String(mode!=='scanning'));
}
function setCinematic(value){cinematic=!!value;ui.cinematic.checked=cinematic;document.body.dataset.cinematic=String(cinematic);accessibility();dirty=true;}
function clearDemo(){demo=null;demoStage='';powered=true;document.body.dataset.demo='none';document.body.dataset.demoStage='';ui['demo-label'].textContent='';}
function setMode(next,{automatic=false,keepDemo=false}={}){
 if(!modes.includes(next))return;
 if(!automatic)stopSequence();
 if(!keepDemo)clearDemo();
 const old=mode,previousTarget=target;
 if(old!==next){sweepStarted=time;sweepProgress=0;}
 mode=next;entered=time;lockPlayed=false;recovered=false;
 if(old==='thinking'&&next!=='thinking')completionAt=time;
 level=next==='idle'?'idle':['full','scanning','error'].includes(next)?'full':'active';
 target=level==='idle'?0:level==='active'?1:2;
 collapseUntil=target<previousTarget?time+.62:0;
 document.body.dataset.level=level;document.body.dataset.state=mode;
 ui['state-label'].textContent=labels[mode];
 ui['level-readout'].textContent={idle:'L1 / FLOATING',active:'L2 / ACTIVE',full:'L3 / FULL HUD'}[level];
 ui['core-hit'].setAttribute('aria-label',level==='idle'?'N.O.V.A.を呼び出す':level==='active'?'Full HUDを展開する':'Floating Coreへ収納する');
 buttons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
 ui['scan-label'].textContent='ACQUIRING FIELD';ui['scan-label'].dataset.locked='false';
 requestHUD(hudSets[mode]);accessibility();dirty=true;
 if(old!==next){emitSound(next==='idle'?'close':next==='notification'?'notify':next==='error'?'error':old==='idle'?'start':'expand');window.dispatchEvent(new CustomEvent('nova:statechange',{detail:{state:mode,level,simulated:true}}));}
}
function fillPanel(panel,kind){
 panel.kind=kind;panel.el.dataset.kind=kind;panel.el.setAttribute('aria-label',kind);
 if(!kind)return;
 const [title,rows]=data[kind];panel.head.textContent=kind;panel.title.textContent=title;
 // All strings are owned static demo data. No user content is interpolated.
 panel.rows.innerHTML=rows.map(([key,value])=>`<div><dt>${key}</dt><dd>${value}</dd></div>`).join('');
 panel.footer.textContent='N–07 / VISUAL SIMULATION';
}
function installHUD(){
 hudKindKey=desiredKinds.join('|');hudEpoch=time;retireAt=null;
 panels.forEach((p,i)=>{fillPanel(p,desiredKinds[i]||'');p.el.hidden=!p.kind;p.wire=0;p.frame=p.text=-1;p.el.setAttribute('aria-hidden','true');});
 layoutHUD();dirty=true;
}
function requestHUD(kinds){
 desiredKinds=[...kinds];
 if(hudKindKey===kinds.join('|')&&retireAt===null)return;
 if(reduced.matches||!panels.some(p=>p.kind)){installHUD();return;}
 // Preserve outgoing panel content until text, frame and wire have retracted.
 if(retireAt===null){retireAt=time;panels.forEach(p=>{p.retiring={frame:Math.max(0,p.frame||0),text:Math.max(0,p.text||0),wire:p.wire};});}
}
function layoutHUD(){
 const narrow=w<=720,short=h<=540;
 const width=narrow?Math.min(152,w*.43):short?Math.min(172,w*.25):Math.min(218,w*.23);
 const margin=narrow?w*.055:w*.065;
 const slots=narrow?[[margin,h*.14],[w-margin-width,h*.14],[w-margin-width,h*.72]]:
  [[margin,h*(short?.23:.28)],[w-margin-width,h*(short?.20:.28)],[w-margin-width,h*(short?.58:.59)]];
 panels.forEach((p,i)=>{p.x=slots[i][0];p.y=slots[i][1];p.width=width;p.el.style.left=`${p.x}px`;p.el.style.top=`${p.y}px`;p.el.style.width=`${width}px`;});
}
function updateHUD(){
 if(retireAt!==null&&time-retireAt>=.6)installHUD();
 panels.forEach((p,i)=>{
  if(!p.kind)return;
  let frame,text,wire;
  if(retireAt!==null){const a=time-retireAt;text=p.retiring.text*(1-smooth(a/.12));frame=p.retiring.frame*(1-smooth((a-.12)/.18));wire=p.retiring.wire*(1-smooth((a-.30)/.30));}
  else if(reduced.matches){frame=text=wire=1;}
  else{const a=time-hudEpoch-i*.11;wire=smooth((a-.36)/.27);frame=smooth((a-.71)/.27);text=smooth((a-1.03)/.22);}
  if(frame!==p.frame||text!==p.text){p.el.style.setProperty('--frame',frame);p.el.style.setProperty('--text',text);p.el.style.setProperty('--clip',`${(1-frame)*100}%`);p.el.setAttribute('aria-hidden',String(text<.5));}
  p.wire=wire;p.frame=frame;p.text=text;
 });
}
function updatePanel(kind,title,rows){const p=panels.find(p=>p.kind===kind);if(!p)return;p.title.textContent=title;if(rows)p.rows.innerHTML=rows.map(([k,v])=>`<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');}
function resize(){
 const box=ui.stage.getBoundingClientRect();w=Math.max(1,box.width);h=Math.max(1,box.height);stageX=box.left;stageY=box.top;
 const dpr=Math.min(devicePixelRatio||1,2);ui.field.width=Math.round(w*dpr);ui.field.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);layoutHUD();dirty=true;
}
function setDemoStage(stage,label){if(stage===demoStage)return;demoStage=stage;document.body.dataset.demoStage=stage;ui['demo-label'].textContent=label;dirty=true;}
function playDemo(name){
 if(!['boot','shutdown','device'].includes(name))return;
 stopSequence();setMode('idle',{automatic:true});
 demo={name,start:time};document.body.dataset.demo=name;demoStage='';completionAt=-10;
 if(name==='boot'){phase=0;emitSound('start');}
 if(name==='device'){setMode('active',{automatic:true,keepDemo:true});requestHUD([]);}
 if(name==='shutdown')emitSound('close');
 accessibility();dirty=true;
}
function updateDemo(){
 if(!demo)return;
 const a=time-demo.start;
 if(demo.name==='boot'){
  const stages=[[.18,'point'],[.48,'nucleus'],[.9,'shell'],[1.35,'orbit'],[1.7,'amber node'],[2.2,'pulse']];
  setDemoStage(stages.find(([end])=>a<end)?.[1]||'idle','');
  if(a>=2.2){clearDemo();accessibility();}
 }else if(demo.name==='shutdown'){
  const stages=[[.6,'HUD collapse'],[.95,'orbit disappears'],[1.3,'particles converge'],[1.65,'sphere shrinks'],[1.85,'white point'],[2,'disappear']];
  setDemoStage(stages.find(([end])=>a<end)?.[1]||'off','');
  if(a>=2){demo=null;powered=false;document.body.dataset.demo='off';setDemoStage('off','');accessibility();}
 }else{
  const stages=[[.8,'detected','DEVICE DETECTED'],[1.5,'alignment','ORBIT ALIGNMENT'],[2.1,'channel','LINK CHANNEL'],[3.5,'qr','QR / VISUAL DEMO ONLY'],[4.5,'transfer','TRANSFER / SIMULATED'],[5.1,'linked','LINK ESTABLISHED'],[6,'collapse','']];
  const item=stages.find(([end])=>a<end);
  if(item){const previous=demoStage;setDemoStage(item[1],item[2]);if(item[1]==='linked'&&previous!=='linked')emitSound('lock');}
  else{clearDemo();setMode('idle',{automatic:true});}
 }
}
function advanceSequence(){
 if(sequenceIndex<0||time<sequenceDue)return;
 sequenceIndex++;
 if(sequenceIndex>=sequence.length){stopSequence();return;}
 setMode(sequence[sequenceIndex],{automatic:true});sequenceDue=time+durations[sequenceIndex];
}
function toggleControls(){ui.controls.hidden=!ui.controls.hidden;ui['toggle-controls'].setAttribute('aria-expanded',String(!ui.controls.hidden));ui.controlMark.textContent=ui.controls.hidden?'+':'−';}
buttons.forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
ui['core-hit'].addEventListener('click',()=>{if(!powered||demo){playDemo('boot');return;}setMode(level==='idle'?'active':level==='active'?'full':'idle');});
$('#home').addEventListener('click',e=>{e.preventDefault();setMode('idle');});
ui.size.addEventListener('input',e=>{const value=Number(e.target.value);if(Number.isFinite(value)){idleSize=Math.max(40,Math.min(70,value));ui['size-value'].textContent=`${idleSize}px`;dirty=true;}});
ui.cinematic.addEventListener('change',e=>setCinematic(e.target.checked));
ui['toggle-controls'].addEventListener('click',toggleControls);
for(const name of ['boot','shutdown','device'])ui[name].addEventListener('click',()=>playDemo(name));
ui.sequence.addEventListener('click',()=>{if(sequenceIndex>=0){stopSequence();return;}clearDemo();sequenceIndex=0;setMode(sequence[0],{automatic:true});sequenceDue=time+durations[0];ui.sequence.textContent='■ STOP';});
window.addEventListener('keydown',e=>{
 if(e.key==='Escape'){setMode('idle');return;}
 if(e.ctrlKey||e.metaKey||e.altKey)return;
 if(e.key.toLowerCase()==='h'){toggleControls();return;}
 if(e.target.matches('input,textarea,select'))return;
 if(/^[1-9]$/.test(e.key))setMode(modes[Number(e.key)-1]);
});
ui.stage.addEventListener('pointermove',e=>{pointer={x:e.clientX-stageX,y:e.clientY-stageY,inside:true};});
ui.stage.addEventListener('pointerleave',()=>{pointer.inside=false;});
window.addEventListener('resize',resize);
if(typeof ResizeObserver!=='undefined')new ResizeObserver(resize).observe(ui.stage);
reduced.addEventListener('change',()=>{nucleusX=nucleusY=0;dirty=true;});

function color(rgb,a=1){return `rgba(${rgb.join(',')},${clamp(a)})`;}
function arc(r,start,end,alpha=.4,width=.7,rgb=cyan){ctx.beginPath();ctx.arc(0,0,Math.max(.01,r),start,end);ctx.strokeStyle=color(rgb,alpha);ctx.lineWidth=width;ctx.stroke();}
function line(x1,y1,x2,y2,alpha=.2,rgb=cyan,width=.6){ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.strokeStyle=color(rgb,alpha);ctx.lineWidth=width;ctx.stroke();}
function dot(x,y,r=1,alpha=1,rgb=pale,glow=8){ctx.save();ctx.shadowColor=color(rgb,.7);ctx.shadowBlur=glow;ctx.fillStyle=color(rgb,alpha);ctx.beginPath();ctx.arc(x,y,Math.max(.01,r),0,TAU);ctx.fill();ctx.restore();}
function halo(r,alpha,rgb=cyan){r=Math.max(.01,r);const g=ctx.createRadialGradient(0,0,0,0,0,r);g.addColorStop(0,color(rgb,alpha));g.addColorStop(.3,color(rgb,alpha*.32));g.addColorStop(1,color(rgb,0));ctx.fillStyle=g;ctx.fillRect(-r,-r,r*2,r*2);}
function background(full){
 if(overlaySurface)return;
 if(cinematic&&mode==='idle')return;
 ctx.lineWidth=.5;ctx.strokeStyle=color(cyan,.012+full*.021);ctx.beginPath();
 for(let x=w/2%48;x<w;x+=48){ctx.moveTo(x,90);ctx.lineTo(x,h-65);}for(let y=h*.46%48;y<h-65;y+=48){ctx.moveTo(35,y);ctx.lineTo(w-35,y);}ctx.stroke();
}
function sphere(r,t,focus,converge,shell=1,nucleus=1,errorOffset=0){
 // Six-second breath, only ±2%. The bright opaque nucleus sits inside a dark glass volume.
 const breath=1+Math.sin(t*TAU/6)*.02;
 ctx.save();ctx.globalAlpha*=shell;
 halo(r*1.75,.046*breath);
 const glass=ctx.createRadialGradient(-r*.38,-r*.45,r*.02,0,0,r);
 glass.addColorStop(0,'#c7e4dfb0');glass.addColorStop(.14,'#477f997d');glass.addColorStop(.42,'#143346a8');glass.addColorStop(.70,'#020a15f5');glass.addColorStop(.90,'#0e263898');glass.addColorStop(.98,'#6595a63d');glass.addColorStop(1,'#ccecf24d');
 ctx.fillStyle=glass;ctx.beginPath();ctx.arc(0,0,r,0,TAU);ctx.fill();
 ctx.save();ctx.beginPath();ctx.arc(0,0,r*.96,0,TAU);ctx.clip();ctx.rotate(-.32+errorOffset);
 for(let i=-3;i<=3;i++){ctx.beginPath();ctx.ellipse(0,i*r*.23,r*Math.sqrt(1-(i*.23)**2),r*.10,0,0,TAU);ctx.strokeStyle=color(cyan,.075);ctx.lineWidth=.45;ctx.stroke();}
 for(let i=0;i<6;i++){ctx.beginPath();ctx.ellipse(0,0,Math.max(.01,Math.abs(Math.sin(i*Math.PI/6+.3))*r),r,0,0,TAU);ctx.strokeStyle=color(cyan,.075);ctx.stroke();}
 for(let i=0;i<34;i++){
  const a=i*2.399+(reduced.matches?0:particlePhase),latitude=Math.sin(i*1.73)*.72;
  const radius=r*(.45+.39*((i*17%37)/37))*(1-converge*.30);
  const latitudeScale=Math.sqrt(1-latitude*latitude),depth=Math.sin(a)*latitudeScale;
  const perspective=1+depth*.13;
  const x=Math.cos(a)*latitudeScale*radius*perspective;
  const y=(latitude*.83+depth*.22)*radius*perspective;
  const tint=i%11===0&&!(overlaySurface&&mode==='idle')?[225,202,154]:i%5===0?[215,226,215]:cyan;
  dot(x,y,(r>80?.58:.38)*(1+depth*.25),.09+.21*(depth+1)/2,tint,depth>0?1.5:0);
 }
 // Offset specular glint and warm reflected rim make the shell read as a volume.
 ctx.save();ctx.translate(-r*.35,-r*.43);ctx.scale(1,.55);halo(r*.34,.24,[217,231,226]);ctx.restore();
 ctx.restore();arc(r*.99,3.45,5.30,.36,.45,pale);arc(r*.95,.13,1.92,.16,.45);if(!(overlaySurface&&mode==='idle'))arc(r*.94,.50,.88,.21,.5,[223,190,128]);arc(r*.83,3.7,4.4,.10,.35);
 ctx.restore();
 ctx.save();ctx.globalAlpha*=nucleus;ctx.translate(nucleusX,nucleusY);
 halo(r*.64,(.12+focus*.10)*breath,pale);halo(r*.21,(.45+focus*.15)*breath,pale);
 const nr=Math.max(1.65,r*.063),core=ctx.createRadialGradient(-nr*.2,-nr*.2,0,0,0,nr);
 core.addColorStop(0,'#ffffff');core.addColorStop(.42,'#e9fcff');core.addColorStop(.82,'#a3dced');core.addColorStop(1,'#426e87');
 ctx.fillStyle=core;ctx.beginPath();ctx.arc(0,0,nr,0,TAU);ctx.fill();ctx.restore();
}
function orbitPoint(outer,angle){return {x:Math.cos(angle)*outer*1.035,y:Math.sin(angle)*outer*1.035};}
function signature(outer,active,full,age,alpha,nodeAlpha,errorAmount){
 ctx.save();ctx.globalAlpha*=alpha;
 // Circular, centered structure with unequal highlights; no tilted external orbits.
 arc(outer*.91,0,TAU,.12,.4);
 arc(outer*1.035,0,TAU,.085,.3);
 const turn=orbit*.14+errorAmount*.055;
 arc(outer*1.035,turn+.13,turn+2.33,.24,.4,pale);
 arc(outer*1.035,turn+3.64,turn+5.67,.15,.35,pale);
 if(!(overlaySurface&&mode==='idle'))arc(outer*.98,turn+5.02,turn+5.24,.27,.8,[223,190,128]);
 if(active>.01){
  ctx.save();ctx.globalAlpha*=active;
  for(let i=0;i<2;i++){
   arc(outer*.83,orbit+i*Math.PI+.2,orbit+i*Math.PI+(i?2.15:2.7),i?.14:.24,.6);
   arc(outer*.98,-orbit+i*Math.PI+.8,-orbit+i*Math.PI+(i?1.17:1.45),i?.22:.36,.7);
  }
  for(let i=0;i<72;i++){const a=i/72*TAU,major=i%6===0;line(Math.cos(a)*outer*1.055,Math.sin(a)*outer*1.055,Math.cos(a)*outer*(major?1.084:1.066),Math.sin(a)*outer*(major?1.084:1.066),major?.31:.13,cyan,major?.6:.4);}
  if(full>.01){ctx.globalAlpha*=full;arc(outer*1.14,0,TAU,.07,.3);ctx.setLineDash([1,6]);arc(outer*1.21,0,TAU,.09,.3);ctx.setLineDash([]);for(let j=0;j<3;j++)for(let i=0;i<2;i++)arc(outer*(.72+j*.08),orbit+j*.4+i*Math.PI,orbit+j*.4+i*Math.PI+1.2,.18,.7);}
  ctx.restore();
 }
 // One amber node, shared by every mode. Error leaves the orbit once, then rejoins it.
 const detour=mode==='error'&&!reduced.matches?Math.sin(Math.PI*clamp(age/1.8))*.14:0;
 let angle=reduced.matches?.7:nodePhase;

 if(demo?.name==='device')angle=mix(angle,0,smooth((time-demo.start-.8)/.7));
 const p=orbitPoint(outer*(1+detour),angle);
 if(!(overlaySurface&&mode==='idle'))dot(p.x,p.y,active>0?1.5:1.05,nodeAlpha,amber,active>0?7:4);
 ctx.restore();
}
function drawWires(cx,cy,outer){
 for(const p of panels){if(!p.kind||p.wire<=0)continue;
  const side=p.x<w/2?-1:1,ex=(side<0?p.x+p.width:p.x)-cx,ey=p.y+20-cy;
  const a=Math.atan2(ey,ex),sx=Math.cos(a)*outer,sy=Math.sin(a)*outer*.8,mx=mix(sx,ex,.62),wire=p.wire;
  line(sx,sy,mix(sx,mx,clamp(wire*1.6)),mix(sy,ey,clamp(wire*1.6)),.3);
  if(wire>.625)line(mx,ey,mix(mx,ex,(wire-.625)/.375),ey,.3);
  if(wire>.96)dot(ex,ey,1,.6,cyan,3);
 }
}
function directionWaves(outer,t,inward){
 for(let k=0;k<3;k++){
  const p=reduced.matches?(k+.5)/3:(t*.36+k/3)%1;
  const radius=outer*(inward?mix(1.55,.73,p):mix(.73,1.55,p));
  const alpha=Math.sin(p*Math.PI)*.25;arc(radius,inward?-.85:0,inward?1.05:TAU,alpha,.7);
  if(inward){arc(radius,Math.PI-.85,Math.PI+1.05,alpha*.7,.6);}
 }
 if(!inward){ctx.beginPath();for(let i=0;i<=180;i++){const a=i/180*TAU,rr=outer*(1+Math.sin(a*7+t*3)*Math.sin(t*2)*.018);const x=Math.cos(a)*rr,y=Math.sin(a)*rr;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.strokeStyle=color(cyan,.39);ctx.lineWidth=.8;ctx.stroke();}
}
function scan(outer,r,t,age){
 const angle=t*.45;ctx.save();ctx.rotate(angle);for(let i=0;i<24;i++)arc(outer*.9,-i*.016,-i*.016+.018,(1-i/24)*.10,outer*.055);line(0,0,outer*.9,0,.25);ctx.restore();
 ctx.save();ctx.beginPath();ctx.arc(0,0,r*.96,0,TAU);ctx.clip();line(-r,Math.sin(t*.7)*r,r,Math.sin(t*.7)*r,.35,pale);ctx.restore();
 const tx=outer*1.01,ty=-outer*.99,size=Math.max(11,outer*.13),rgb=lockPlayed?amber:cyan;
 line(r*.7,-r*.45,tx-size,ty+size,.27,rgb);
 const s=size*(1+.5*(1-smooth(age/2.6)));
 for(const x of [-1,1])for(const y of [-1,1]){line(tx+x*s,ty+y*s,tx+x*(s-6),ty+y*s,.65,rgb);line(tx+x*s,ty+y*s,tx+x*s,ty+y*(s-6),.65,rgb);}
 line(tx-3,ty,tx+3,ty,.45,rgb);line(tx,ty-3,tx,ty+3,.45,rgb);
 ui['scan-label'].style.left=`${w*.5+tx-size}px`;ui['scan-label'].style.top=`${h*.46+ty+size+9}px`;
}
// Deliberately non-decodable QR-like art: no pairing URL, token, permission or transfer.
const qrCells=[];
for(let y=0;y<21;y++)for(let x=0;x<21;x++){
 const finder=[[0,0],[14,0],[0,14]].find(([fx,fy])=>x>=fx&&x<fx+7&&y>=fy&&y<fy+7);
 const on=finder?((x-finder[0])===0||(x-finder[0])===6||(y-finder[1])===0||(y-finder[1])===6||((x-finder[0])>=2&&(x-finder[0])<=4&&(y-finder[1])>=2&&(y-finder[1])<=4)):(x*17+y*23+x*y)%7<3;
 if(on)qrCells.push([x,y]);
}
function deviceLink(outer,age){
 const qx=w<=720?0:Math.min(outer+145,w*.32),qy=w<=720?-145:-35,unit=3.1,side=21*unit;
 if(age>=1.5&&age<5.8){line(outer*.75,-outer*.1,qx-side*.5,qy,.25,cyan);}
 if(age>=2.1&&age<6){
  const collapse=reduced.matches?(age>=5.1?1:0):smooth((age-5.1)/.9),alpha=(1-collapse)*smooth((age-2.1)/.3);
  ctx.fillStyle=color(pale,alpha*.78);
  for(const [x,y] of qrCells){const stagger=clamp(collapse*1.25-(x+y)/200),xx=(qx+(x-10.5)*unit)*(1-stagger),yy=(qy+(y-10.5)*unit)*(1-stagger);ctx.fillRect(xx,yy,unit*.76*(1-stagger),unit*.76*(1-stagger));}
  if(age>3.5&&age<4.5){const p=reduced.matches?.5:(age-3.5);dot(mix(qx,0,p),mix(qy,0,p),1.2,.7,cyan,4);}
 }
}
function draw(dt){
 const age=time-entered,delta=target-phase;
 phase=reduced.matches?target:time<collapseUntil?phase:phase+delta*(1-Math.exp(-dt*3.6));if(Math.abs(delta)<.001)phase=target;
 const active=smooth(phase),full=smooth(phase-1),t=reduced.matches?0:time;
 const focus=mode==='thinking'?smooth(age/1.6):0;
 const errorAmount=mode==='error'?1-smooth((age-1.8)/3.8):0;
 // Deceleration has a 0.4s envelope; only the amber node accelerates during thought.
 const speed=mode==='thinking'?.055*(1-smooth(age/.4))+.003:mode==='idle'?.008:.055;
 const sweeping=time-sweepStarted<.85;
 const progress=smooth((time-sweepStarted)/.85);
 const sweepDelta=Math.max(0,progress-sweepProgress)*TAU;
 sweepProgress=progress;
 orbitSpeed=speed;if(!reduced.matches){orbit+=orbitSpeed*dt;nodePhase+=sweepDelta+(sweeping?0:dt*(mode==='thinking'?.35:mode==='idle'?.028:.09));}
 const desiredParticleSpeed=mode==='idle'?.011:mode==='thinking'?.035:.38;
 particleSpeed=mix(particleSpeed,desiredParticleSpeed,1-Math.exp(-dt*2.7));
 if(!reduced.matches)particlePhase+=sweepDelta+(sweeping?0:particleSpeed*dt);
 const cx=w*.5+(reduced.matches?0:Math.sin(t*.19)*.8),cy=h*.46+(reduced.matches?0:Math.sin(t*.37)*1.2);
 let nx=0,ny=0;
 if(pointer.inside&&!reduced.matches){const dx=pointer.x-cx,dy=pointer.y-cy,dist=Math.hypot(dx,dy);if(dist<300&&dist>0){const offset=4*smooth(dist/70)*(1-smooth((dist-150)/150));nx=dx/dist*offset;ny=dy/dist*offset;}}
 nucleusX=mix(nucleusX,nx,1-Math.exp(-dt*4));nucleusY=mix(nucleusY,ny,1-Math.exp(-dt*4));
 ui['core-anchor'].style.left=`${cx}px`;ui['core-anchor'].style.top=`${cy}px`;
 let outer=mix(mix(idleSize*.5,70,active),Math.min(w*.245,h*.25,235),full);
 const buildAge=time-hudEpoch;
 if(!reduced.matches&&panels.some(p=>p.kind)&&retireAt===null&&buildAge<.35)outer*=1-.055*Math.sin(clamp(buildAge/.35)*Math.PI);
 let shell=1,nucleus=1,orbitAlpha=1,nodeAlpha=1,converge=focus;
 if(demo?.name==='boot'){
  const a=time-demo.start;
  shell=reduced.matches?(a>.48?1:0):smooth((a-.48)/.45);nucleus=smooth(a/.35);orbitAlpha=smooth((a-.9)/.45);nodeAlpha=smooth((a-1.35)/.35);
  if(!reduced.matches)outer*=mix(.15,1,smooth((a-.18)/.7));
 }else if(demo?.name==='shutdown'){
  const a=time-demo.start;orbitAlpha=1-smooth((a-.60)/.35);converge=smooth((a-.85)/.45);shell=1-smooth((a-1.25)/.4);nucleus=1-smooth((a-1.8)/.2);
  if(!reduced.matches)outer*=mix(1,.035,smooth((a-1.25)/.55));
 }
 ctx.clearRect(0,0,w,h);background(full);ctx.save();ctx.translate(cx,cy);drawWires(cx,cy,outer);
 if(powered){
  const r=Math.max(.1,outer*mix(.75,.64,full));
  sphere(r,t,focus,converge,shell,nucleus,errorAmount*(reduced.matches?.02:Math.sin(t*1.5)*.035));
  signature(outer,active,full,age,orbitAlpha,nodeAlpha,errorAmount);
  if(mode==='listening'||mode==='speaking')directionWaves(outer,t,mode==='listening');
  if(mode==='thinking'){
   for(let i=0;i<8;i++){const p=reduced.matches?.6:(age*.16+i/8)%1,a=i*TAU/8+orbit,dist=outer*mix(.8,.14,p);dot(Math.cos(a)*dist,Math.sin(a)*dist,.7,Math.sin(p*Math.PI)*.4,cyan,2);}
  }
  if(mode==='scanning')scan(outer,r,t,age);
  if(mode==='error'&&errorAmount>.01){arc(outer*.89,3.4,3.52,errorAmount*.45,.7,[205,104,83]);}
  if(mode==='notification'&&age<1.2)halo(outer*1.5,.07*(1-smooth(age/1.2)),amber);
  const pulse=time-completionAt;
  if(!reduced.matches&&pulse>=0&&pulse<1)arc(outer*(.65+pulse*.9),0,TAU,Math.sin(pulse*Math.PI)*.28,.85,pale);
  if(demo?.name==='boot'&&!reduced.matches){const p=(time-demo.start-1.7)/.5;if(p>0&&p<1)arc(outer*(.7+p*.9),0,TAU,Math.sin(p*Math.PI)*.25,.7,pale);}
  if(demo?.name==='device')deviceLink(outer,time-demo.start);
 }
 ctx.restore();
}
function update(){
 advanceSequence();updateDemo();
 if(mode==='scanning'&&!lockPlayed&&time-entered>=2.6){lockPlayed=true;ui['scan-label'].dataset.locked='true';ui['scan-label'].textContent='TARGET ACQUIRED';updatePanel('TARGET','LOCKED');updatePanel('ANALYSIS','REGION RESOLVED',[['CONFIDENCE','99.2 %'],['POSITION','042.8 / 018.6']]);emitSound('lock');dirty=true;}
 if(mode==='error'&&!recovered&&time-entered>=5.6){recovered=true;ui['state-label'].textContent='SIGNAL RESTORED';updatePanel('DIAGNOSTIC','PHASE ALIGNED');updatePanel('RECOVERY','RESYNCHRONIZED');dirty=true;}
}
function frame(now){
 const dt=last===null?1/60:Math.min((now-last)/1000,.05);last=now;time+=dt;
 update();const second=Math.floor(now/1000);if(second!==lastClock){lastClock=second;ui.clock.textContent=new Date().toLocaleTimeString('en-GB',{hour12:false});}
 const transitioning=retireAt!==null||Math.abs(target-phase)>.001||time-hudEpoch<1.6;
 if(!reduced.matches||dirty||transitioning||demo){updateHUD();draw(lastDraw<0?dt:Math.min(time-lastDraw,.1));lastDraw=time;dirty=false;}
 frameId=requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frameId);frameId=0;last=null;pointer.inside=false;stopSequence();}else if(!frameId){dirty=true;frameId=requestAnimationFrame(frame);}});
window.nova=Object.freeze({setState:state=>setMode(state),getState:()=>({state:mode,level,simulated:true}),states:modes,playDemo,setCinematic});
resize();setMode('idle');frameId=requestAnimationFrame(frame);
})();
