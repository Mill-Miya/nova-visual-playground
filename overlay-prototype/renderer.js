(() => {
 'use strict';
 const bridge=window.novaOverlay;
 if(!bridge)return;
 const core=document.querySelector('#core-hit'),menu=document.querySelector('#core-menu');
 const buttons=[...menu.querySelectorAll('button')],status=document.querySelector('#command-status'),slider=document.querySelector('#size');
 document.querySelector('#stage').appendChild(core);
 let receiving=false,active=false,open=false,pending=false,available=[],last=-Infinity;
 const messages={unavailable:'University AI に接続できません',busy:'操作中です',invalid:'操作を受け付けられません',failed:'操作を開始できません',timeout:'応答を確認できません',disconnected:'接続が切れました',duplicate:'操作は送信済みです'};
 function displayMenu(value){
  open=active&&value;menu.hidden=!open;document.body.dataset.menuOpen=String(open);
  core.setAttribute('aria-expanded',String(open));
 }
 function requestMenu(value){displayMenu(value);bridge.menu(open);}
 core.setAttribute('aria-label','University AI メニュー');core.setAttribute('aria-controls','core-menu');
 core.title='クリックでメニュー / Escで収納';
 core.addEventListener('click',event=>{
  event.preventDefault();event.stopImmediatePropagation();
  if(active&&!pending){requestMenu(!open);status.textContent=available.length?'':messages.unavailable;}
 },true);
 window.addEventListener('pointerdown',event=>{
  if(open&&!menu.contains(event.target)&&!core.contains(event.target))requestMenu(false);
 },true);
 for(const button of buttons)button.addEventListener('click',async()=>{
  if(!active||!open||pending||!available.includes(button.dataset.command)||performance.now()-last<400)return;
  pending=true;last=performance.now();
  // Main closes its menu gate atomically when the invoke arrives.
  displayMenu(false);
  try{const result=await bridge.command(button.dataset.command);status.textContent=result.ok?'':messages[result.error]||messages.failed;}
  catch{status.textContent=messages.disconnected;}finally{pending=false;}
 });
 bridge.onSettings(settings=>{
  receiving=true;active=settings.active;available=settings.commands||[];
  window.nova.setCinematic(true);
  slider.value=String(settings.coreSize);slider.dispatchEvent(new Event('input',{bubbles:true}));
  const next=settings.state||(active?'active':'idle');
  if(window.nova.getState().state!==next)window.nova.setState(next);
  core.setAttribute('aria-label','University AI メニュー');
  document.body.dataset.overlayInteractive=String(active);displayMenu(!!settings.menuOpen);
  for(const button of buttons)button.disabled=!available.includes(button.dataset.command);
  if(!available.length&&active)status.textContent=messages.unavailable;
  else if(!pending)status.textContent='';
  document.body.dataset.overlayReady='true';receiving=false;
 });
 window.addEventListener('nova:statechange',event=>{core.setAttribute('aria-label','University AI メニュー');if(!receiving&&event.detail.state==='idle'){displayMenu(false);bridge.idle();}});
 window.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();open?requestMenu(false):bridge.idle();}
  else if(/^[1-9hH]$/.test(event.key)){event.preventDefault();event.stopImmediatePropagation();}
 },true);
 bridge.ready();
})();
