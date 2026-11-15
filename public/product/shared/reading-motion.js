'use strict';
// A same-origin embedded document follows the user's existing workspace preference.
// OS reduced-motion remains a CSS media query; no storage or application calls.
(() => {
  const animations=new WeakMap();
  const reduced=()=>document.documentElement.classList.contains('reduce-motion')||document.body?.classList.contains('reduce-motion')||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  window.LunaReadingMotion={reduced,enter(element){
    if(!element)return;
    const previous=animations.get(element);
    // Do not restart the same entrance while it is already in progress: doing
    // so resets opacity to .65 and makes rapid switches visibly flash.
    if(previous&&!reduced())return;
    if(previous){previous.cancel();animations.delete(element)}
    if(reduced()||!element.animate)return;
    const animation=element.animate([{opacity:.65,transform:'translateY(6px)'},{opacity:1,transform:'none'}],{duration:240,easing:'cubic-bezier(.22,.8,.25,1)'});
    animations.set(element,animation);
    animation.finished.catch(()=>{}).finally(()=>{if(animations.get(element)===animation)animations.delete(element)});
  }};
  if(window.parent===window)return;
  let parentBody;
  try{parentBody=window.parent.document.body}catch{return}
  if(!parentBody)return;
  const sync=()=>document.documentElement.classList.toggle('reduce-motion',parentBody.classList.contains('reduce-motion'));
  const observer=new MutationObserver(sync);
  observer.observe(parentBody,{attributes:true,attributeFilter:['class']});sync();
  window.addEventListener('pagehide',()=>observer.disconnect(),{once:true});
  window.addEventListener('pageshow',()=>{observer.observe(parentBody,{attributes:true,attributeFilter:['class']});sync()});
})();
