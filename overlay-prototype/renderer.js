(() => {
 'use strict';
 const bridge=window.novaOverlay;
 if(!bridge)return;
 let receiving=false;
 const core=document.querySelector('#core-hit');
 // Native drag rectangles must not depend on the zero-size browser anchor.
 document.querySelector('#stage').appendChild(core);
 const labelCore=()=>{
  core.setAttribute('aria-label','N.O.V.A. Core — Active時にドラッグで移動');
  core.title='Ctrl+Alt+Spaceで呼び出し / ドラッグで移動 / Escで収納';
 };
 core.addEventListener('click',event=>{event.preventDefault();event.stopImmediatePropagation();},true);
 bridge.onSettings(settings=>{
  receiving=true;
  window.nova.setCinematic(true);
  const slider=document.querySelector('#size');
  slider.value=String(settings.coreSize);
  slider.dispatchEvent(new Event('input',{bubbles:true}));
  const next=settings.state||(settings.active?'active':'idle');
  if(window.nova.getState().state!==next)window.nova.setState(next);
  document.body.dataset.overlayInteractive=String(settings.active);
  labelCore();
  document.body.dataset.overlayReady='true';
  receiving=false;
 });
 // Existing renderer Escape and public API still work; native click-through follows Idle.
 window.addEventListener('nova:statechange',event=>{
  labelCore();
  if(!receiving&&event.detail.state==='idle')bridge.idle();
 });
 // The first overlay stage deliberately exposes only native Idle/Active controls.
 window.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();bridge.idle();}
  else if(/^[1-9hH]$/.test(event.key)){event.preventDefault();event.stopImmediatePropagation();}
 },true);
 bridge.ready();
})();
