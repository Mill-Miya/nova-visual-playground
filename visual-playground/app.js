/* N.O.V.A. visual-only renderer. No backend, device or microphone access. */
(() => {
'use strict';
const $ = s => document.querySelector(s);
const canvas = $('#field'), ctx = canvas.getContext('2d');
const modes = ['idle','active','listening','thinking','speaking','scanning','notification','error','full'];
const labels = {idle:'IDLE',active:'READY',listening:'LISTENING',thinking:'THINKING',speaking:'SPEAKING',scanning:'SCANNING',notification:'LINK ESTABLISHED',error:'SIGNAL DEGRADED',full:'CORE ACTIVE'};
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let w=0,h=0,dpr=1,mode='idle',level='idle',idleSize=58,phase=0,target=0,last=0,time=0,entered=0,frameId=0,sequenceTimer=0,sequenceIndex=0;
let audioContext;
const sequence = ['idle','active','listening','thinking','speaking','full','scanning','notification','error','active','idle'];
const durations = [2200,2800,3500,4000,3500,4500,5000,4000,3500,2200,1800];
let lockPlayed=false, collapseUntil=0;
function emitSound(name){
 window.dispatchEvent(new CustomEvent('nova:sound',{detail:{name,simulated:true}}));
 if(!$('#sound').checked)return;
 try{
 audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
 void audioContext.resume();
 const frequencies={start:660,expand:780,lock:1050,notify:880,error:240,close:440};
 const now=audioContext.currentTime;
 const gain=audioContext.createGain();gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(.024,now+.018);gain.gain.exponentialRampToValueAtTime(.0001,now+.24);gain.connect(audioContext.destination);
 const osc=audioContext.createOscillator();osc.type='sine';osc.frequency.setValueAtTime(frequencies[name]||660,now);osc.frequency.exponentialRampToValueAtTime((frequencies[name]||660)*(name==='close'?.7:1.12),now+.2);osc.connect(gain);osc.start(now);osc.stop(now+.25);osc.onended=()=>{osc.disconnect();gain.disconnect();};
 }catch{ $('#sound').checked=false; }
}
function stopSequence(){clearTimeout(sequenceTimer);sequenceTimer=0;$('#sequence').textContent='▶ SEQUENCE';}
function setMode(next,{automatic=false}={}){
 if(!modes.includes(next))return;
 if(!automatic)stopSequence();
 const old=mode;mode=next;entered=time;lockPlayed=false;
 level=next==='idle'?'idle':['full','scanning','error'].includes(next)?'full':'active';
 const nextTarget=level==='idle'?0:level==='active'?1:2;
 collapseUntil=nextTarget<target?time+.5:0;target=nextTarget;
 document.body.dataset.level=level;document.body.dataset.state=mode;
 document.querySelectorAll('.hud').forEach(panel=>panel.setAttribute('aria-hidden',String(level!=='full')));
 document.querySelector('.core-caption').setAttribute('aria-hidden',String(level==='idle'));
 document.querySelector('#notice').setAttribute('aria-hidden',String(mode!=='notification'));
 document.querySelector('#scan-label').setAttribute('aria-hidden',String(mode!=='scanning'));
 $('#state-label').textContent=labels[mode];
 $('#level-readout').textContent={idle:'L1 / FLOATING',active:'L2 / ACTIVE',full:'L3 / FULL HUD'}[level];
 $('#core-hit').setAttribute('aria-label',level==='idle'?'N.O.V.A.を呼び出す':level==='active'?'Full HUDを展開する':'Floating Coreへ収納する');
 $('#audio-value').textContent=mode==='listening'?'RECEIVING':mode==='speaking'?'TRANSMITTING':'READY';
 $('#vision-value').textContent=mode==='scanning'?'SCANNING':'STANDBY';
 $('#diagnostic').textContent=mode==='error'?'SIGNAL RECOVERY':'FIELD BALANCED';
 $('#field-caption').textContent=mode==='error'?'PARTIAL SIGNAL LOSS / CORE PRESERVED':'CORE ACTIVE / ALL SYSTEMS NOMINAL';
 document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
 if(old!==next){emitSound(next==='idle'?'close':next==='notification'?'notify':next==='error'?'error':old==='idle'?'start':'expand');window.dispatchEvent(new CustomEvent('nova:statechange',{detail:{state:mode,level,simulated:true}}));}
}
function advanceSequence(){setMode(sequence[sequenceIndex],{automatic:true});if(sequenceIndex===sequence.length-1){sequenceTimer=setTimeout(stopSequence,durations[sequenceIndex]);return;}sequenceTimer=setTimeout(()=>{sequenceIndex++;advanceSequence();},durations[sequenceIndex]);}
$('#sequence').addEventListener('click',()=>{if(sequenceTimer){stopSequence();return;}sequenceIndex=0;$('#sequence').textContent='■ STOP';advanceSequence();});
document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
$('#core-hit').addEventListener('click',()=>setMode(level==='idle'?'active':level==='active'?'full':'idle'));
$('#home').addEventListener('click',e=>{e.preventDefault();setMode('idle');});
$('#size').addEventListener('input',e=>{idleSize=Number(e.target.value);$('#size-value').textContent=`${idleSize}px`;});
function toggleControls(){const hidden=!$('#controls').hidden;$('#controls').hidden=hidden;$('#toggle-controls').setAttribute('aria-expanded',String(!hidden));$('#toggle-controls span').textContent=hidden?'+':'−';}
$('#toggle-controls').addEventListener('click',toggleControls);
window.addEventListener('keydown',e=>{if(e.target.matches('input,textarea,select')||e.ctrlKey||e.metaKey||e.altKey)return;if(e.key==='Escape'){setMode('idle');}else if(e.key.toLowerCase()==='h'){toggleControls();}else if(/^[1-9]$/.test(e.key)){setMode(modes[Number(e.key)-1]);}});
for(let i=0;i<40;i++){const bar=document.createElement('span');bar.style.setProperty('--bar',`${15+65*Math.abs(Math.sin(i*1.81))*Math.sin((i+1)/41*Math.PI)}%`);$('#wave-chart').append(bar);}
function resize(){w=innerWidth;h=innerHeight;dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);}
window.addEventListener('resize',resize);resize();
const TAU=Math.PI*2,cyan=[102,206,239],pale=[192,243,255],amber=[237,183,92];
const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const mix=(a,b,t)=>a+(b-a)*t;
function color(rgb,a=1){return `rgba(${rgb.join(',')},${clamp(a)})`;}
function arc(r,start,end,alpha=.4,width=.7,rgb=cyan){ctx.beginPath();ctx.arc(0,0,Math.max(.1,r),start,end);ctx.strokeStyle=color(rgb,alpha);ctx.lineWidth=width;ctx.stroke();}
function line(x1,y1,x2,y2,alpha=.2,rgb=cyan,width=.6){ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.strokeStyle=color(rgb,alpha);ctx.lineWidth=width;ctx.stroke();}
function dot(x,y,r=1,alpha=1,rgb=pale,glow=8){ctx.save();ctx.shadowColor=color(rgb,.7);ctx.shadowBlur=glow;ctx.fillStyle=color(rgb,alpha);ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();ctx.restore();}
function halo(r,alpha,rgb=cyan){const g=ctx.createRadialGradient(0,0,0,0,0,r);g.addColorStop(0,color(rgb,alpha));g.addColorStop(.3,color(rgb,alpha*.32));g.addColorStop(1,color(rgb,0));ctx.fillStyle=g;ctx.fillRect(-r,-r,r*2,r*2);}
function background(full,t){
 const grid=42;ctx.lineWidth=.5;ctx.strokeStyle=`rgba(72,134,159,${.018+full*.032})`;ctx.beginPath();for(let x=w/2%grid;x<w;x+=grid){ctx.moveTo(x,90);ctx.lineTo(x,h-70);}for(let y=h*.46%grid;y<h-65;y+=grid){ctx.moveTo(35,y);ctx.lineTo(w-35,y);}ctx.stroke();
 for(let i=0;i<65;i++){const x=(Math.sin(i*127.1)*.5+.5)*w,y=(Math.cos(i*311.7)*.5+.5)*h;ctx.fillStyle=color(cyan,(.05+.09*full)*(.7+.3*Math.sin(t*.3+i)));ctx.fillRect(x,y,1,1);}
 const a=.16;line(22,24,22,44,a);line(22,24,42,24,a);line(w-22,24,w-42,24,a);line(w-22,24,w-22,44,a);
}
function sphere(r,t,activity){
 const breath=1+Math.sin(t*.85)*.07;
 halo(r*1.9,.08*breath);
 const glass=ctx.createRadialGradient(-r*.37,-r*.42,r*.02,0,0,r);
 glass.addColorStop(0,'#3e91b943');glass.addColorStop(.24,'#16485d30');glass.addColorStop(.7,'#04131d88');glass.addColorStop(.93,'#15485b5c');glass.addColorStop(1,'#94deee70');
 ctx.fillStyle=glass;ctx.beginPath();ctx.arc(0,0,r,0,TAU);ctx.fill();
 ctx.save();ctx.beginPath();ctx.arc(0,0,r*.97,0,TAU);ctx.clip();
 ctx.rotate(-.32);
 for(let i=-3;i<=3;i++){ctx.beginPath();ctx.ellipse(0,i*r*.23,r*Math.sqrt(1-(i*.23)**2),r*.12,0,0,TAU);ctx.strokeStyle=color(cyan,.10+activity*.035);ctx.lineWidth=.45;ctx.stroke();}
 for(let i=0;i<7;i++){let longitude=Math.sin(t*.045+i*Math.PI/7);ctx.beginPath();ctx.ellipse(0,0,Math.max(.01,Math.abs(longitude)*r),r,0,0,TAU);ctx.strokeStyle=color(cyan,.11);ctx.stroke();}
 for(let i=0;i<36;i++){const a=i*2.399+t*(.035+activity*.03),dist=r*(.18+.7*((i*17%37)/37));const x=Math.cos(a)*dist,y=Math.sin(a)*dist*.8;dot(x,y,r>80?.75:.45,.2+.35*(.5+.5*Math.sin(i+t*.6)),i%13===0?amber:cyan,2);}
 ctx.restore();
 arc(r*.985,Math.PI*1.05,Math.PI*1.79,.65,.85,pale);arc(r*.93,.1,2.1,.22,1.2);arc(r*.78,2.9,4.65,.16,.5);
 halo(r*.7,(.13+activity*.1)*breath);
 ctx.save();ctx.scale(1,.26);halo(r*.65,.28*breath,pale);ctx.restore();
 halo(r*.20,.6*breath,pale);dot(0,0,Math.max(1.4,r*.025),.95,pale,14+activity*8);
}
function draw(t,dt){
 const delta=target-phase;phase=reduced.matches?target:time<collapseUntil?phase:phase+delta*(1-Math.exp(-dt*3.6));if(Math.abs(delta)<.0001)phase=target;
 const active=smooth(phase),full=smooth(phase-1),age=t-entered;
 const drift=reduced.matches?0:1;const cx=w*.5+Math.sin(t*.22)*2*drift,cy=h*.46+Math.sin(t*.48)*3*drift;
 $('#core-anchor').style.left=`${cx}px`;$('#core-anchor').style.top=`${cy}px`;
 const outerFull=Math.min(w*.27,h*.29,280),outer=mix(mix(idleSize*.5,74,active),outerFull,full);
 const r=outer*mix(.77,.62,full);const moving=reduced.matches?0:t;
 const activity=mode==='thinking'?1:mode==='speaking'?.65:mode==='scanning'?.45:active*.2;
 ctx.clearRect(0,0,w,h);background(full,moving);ctx.save();ctx.translate(cx,cy);
 // Precision field geometry is generated outward from the sphere.
 if(full>.01){
  ctx.save();ctx.globalAlpha=full;
  arc(outer*1.12,0,TAU,.16,.6);ctx.setLineDash([1,5]);arc(outer*1.21,0,TAU,.25,.7);ctx.setLineDash([]);
  line(-outer*1.31,0,outer*1.31,0,.22);line(0,-outer*1.18,0,outer*1.17,.22);
  for(let i=0;i<4;i++){const a=i*Math.PI/2;const x=Math.cos(a)*outer*1.15,y=Math.sin(a)*outer*1.15;line(x-3,y,x+3,y,.55);line(x,y-3,x,y+3,.55);}
  ctx.restore();
  const extend=smooth((phase-1.18)/.68)*(target<2?1-smooth(age/.5):1);
  ctx.save();ctx.globalAlpha=extend*.65;
  document.querySelectorAll('.hud').forEach(panel=>{const box=panel.getBoundingClientRect(),left=box.x<w/2,sx=(left?-1:1)*outer*.88,sy=(box.y<h*.45?-1:1)*outer*.40,ex=(left?box.right:box.left)-cx,ey=box.y+22-cy;const mx=mix(sx,ex,.58);line(sx,sy,mix(sx,mx,extend),mix(sy,ey,extend),.38);if(extend>.8)line(mx,ey,mix(mx,ex,(extend-.8)*5),ey,.38);dot(sx,sy,1,.7,cyan,3);});
  ctx.restore();
 }
 sphere(r,moving,activity);
 if(active>0 && age<.6)halo(r*1.3,.08*Math.sin(age/.6*Math.PI),pale);
 ctx.save();ctx.rotate(moving*.035);ctx.scale(1,.88);arc(outer*.93,0,TAU,.35,.6);arc(outer*.97,.5,1.6,.45,.85);ctx.restore();
 if(active>.005){
  ctx.save();ctx.globalAlpha=active;
  const spin=moving*(mode==='thinking'?.42:.075);
  arc(outer*.80,-spin,-spin+TAU*.83,.40,.65);
  arc(outer,spin+.3,spin+2.2,.65,1.3);arc(outer,spin+3.5,spin+5.1,.32,.8);
  arc(outer*1.035,-spin+.4,-spin+1.6,.30,.55,amber);
  const ticks=Math.floor(120*smooth((phase-.20)/.65));
  for(let i=0;i<ticks;i++){const a=i/120*TAU;const major=i%10===0;line(Math.cos(a)*outer*1.055,Math.sin(a)*outer*1.055,Math.cos(a)*outer*(major?1.10:1.072),Math.sin(a)*outer*(major?1.10:1.072),major?.5:.22,cyan,major?.7:.4);}
  for(let i=0;i<3;i++){const a=spin*(i%2?-1:1)+i*2.3;dot(Math.cos(a)*outer,Math.sin(a)*outer,i===0?1.7:1,.85,i===0?amber:pale,9);}
  if(full>.01){ctx.globalAlpha=full;for(let j=0;j<5;j++){const rad=outer*(.70+j*.065);arc(rad,0,TAU,.12,.5);for(let i=0;i<3;i++){const a=i*2.1+j*.51+spin*(j%2?1:-1);arc(rad,a,a+.25+j*.12,j===3?.5:.23,j===3?2:.7,j===1?amber:cyan);}}
   for(let i=0;i<48;i++){const a=i*TAU/48;dot(Math.cos(a)*outer*.85,Math.sin(a)*outer*.85,.5,.4,cyan,0);}
  }
  ctx.restore();
 }
 if(mode==='listening'||mode==='speaking'){
  const speaking=mode==='speaking';ctx.save();
  for(let k=0;k<3;k++){const p=reduced.matches?k/3:(t*.42+k/3)%1;arc(outer*(1+p*.48),0,TAU,(1-p)*.21,.65);}
  ctx.beginPath();for(let i=0;i<=180;i++){const a=i/180*TAU;const wave=speaking?(Math.sin(a*13+moving*4)*Math.sin(moving*3+a*2)+Math.sin(a*23-moving*6)*.3)*4:Math.sin(a*8+moving*3)*1.8;const rr=outer*1.15+wave;const x=Math.cos(a)*rr,y=Math.sin(a)*rr;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.strokeStyle=color(cyan,.6);ctx.lineWidth=.8;ctx.stroke();ctx.restore();
 }
 if(mode==='thinking'){const a=moving*1.7;for(let i=0;i<15;i++){const p=a-i*.025;dot(Math.cos(p)*outer*1.035,Math.sin(p)*outer*1.035,i===0?1.6:.6,(1-i/15)*.8,amber,4);}}
 if(mode==='notification'){halo(outer*1.6,.10*Math.exp(-age*1.5),amber);arc(outer*1.10,-.45,.45,.55,.9,amber);line(outer*1.1,0,outer*1.45,0,.45,amber);}
 if(mode==='scanning'){
  const a=moving*.65;ctx.save();ctx.rotate(a);for(let i=0;i<28;i++)arc(outer*.92,-i*.012,-i*.012+.014,(1-i/28)*.15,outer*.09);line(0,0,outer*.95,0,.5);ctx.restore();
  ctx.save();ctx.beginPath();ctx.arc(0,0,r*.97,0,TAU);ctx.clip();const scanY=reduced.matches?0:Math.sin(t*.85)*r;line(-r,scanY,r,scanY,.55,pale,1);ctx.restore();
  const lock=smooth(age/2.6),s=outer*mix(.94,.50,lock);for(const x of [-1,1])for(const y of [-1,1]){line(x*s,y*s,x*(s-12),y*s,.65,lock>.98?amber:cyan);line(x*s,y*s,x*s,y*(s-12),.65,lock>.98?amber:cyan);}arc(s*.65,0,TAU,.20,.5);line(-6,0,6,0,.7,pale);line(0,-6,0,6,.7,pale);
  if(age>2.6&&!lockPlayed){lockPlayed=true;emitSound('lock');$('#scan-label').innerHTML='TARGET ACQUIRED <span>X 042.8 / Y 018.6 · SIMULATED</span>';$('#vision-value').textContent='LOCKED';}else if(!lockPlayed){$('#scan-label').innerHTML='ACQUIRING FIELD <span>X 042.8 / Y 018.6</span>';}
 }
 if(mode==='error'){const wobble=Math.sin(moving*4)*.015;arc(outer*1.04,1.0+wobble,1.55+wobble,.7,1.3,amber);arc(outer*.84,3.3-wobble,3.45-wobble,.5,.9,[218,107,93]);for(let i=0;i<4;i++){const y=outer*(.3+i*.06);line(outer*.65,y,outer*(.72+.03*Math.sin(moving*2+i)),y,.15,amber);}}
 ctx.restore();
}
function frame(now){const dt=last?Math.min((now-last)/1000,.05):1/60;last=now;time+=dt;draw(time,dt);$('#clock').textContent=new Date().toLocaleTimeString('en-GB',{hour12:false});frameId=requestAnimationFrame(frame);}
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frameId);last=0;stopSequence();}else{frameId=requestAnimationFrame(frame);}});
window.nova=Object.freeze({setState:state=>setMode(state),getState:()=>({state:mode,level,simulated:true}),states:Object.freeze([...modes])});
setMode('idle');
frameId=requestAnimationFrame(frame);
})();
