'use strict';
const WINDOW_SIZE=320;
const clamp=(value,min,max)=>Math.min(Math.max(value,min),Math.max(min,max));
function normalizeSettings(value){
 const position=value?.position;
 return {
  version:1,
  coreSize:Number.isFinite(value?.coreSize)?Math.round(clamp(value.coreSize,40,70)):58,
  position:Number.isFinite(position?.x)&&Number.isFinite(position?.y)?{x:Math.round(position.x),y:Math.round(position.y)}:null
 };
}
function defaultPosition(area,size=WINDOW_SIZE){return {x:Math.round(area.x+area.width-size-28),y:Math.round(area.y+area.height*.72-size*.46)};}
function fitPosition(position,areas,size=WINDOW_SIZE){
 const p=position||defaultPosition(areas[0],size);
 const center={x:p.x+size/2,y:p.y+size*.46};
 const nearest=areas.reduce((best,area)=>{
  const x=clamp(center.x,area.x,area.x+area.width),y=clamp(center.y,area.y,area.y+area.height);
  const distance=(x-center.x)**2+(y-center.y)**2;
  return !best||distance<best.distance?{area,distance}:best;
 },null).area;
 return {x:Math.round(clamp(p.x,nearest.x,nearest.x+nearest.width-size)),y:Math.round(clamp(p.y,nearest.y,nearest.y+nearest.height-size))};
}
function settingsForDisk(settings,bounds){return normalizeSettings({coreSize:settings.coreSize,position:bounds});}
module.exports={WINDOW_SIZE,normalizeSettings,defaultPosition,fitPosition,settingsForDisk};
