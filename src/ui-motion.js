/* Transitions always settle, including cancellation and background tabs. */
(function(root){
  'use strict';
  const active=new WeakMap();
  function cancel(element){active.get(element)?.();}
  async function play(element,frames,{duration=150,reduced=false}={}){
    cancel(element);
    const doc=element?.ownerDocument||root.document;
    if(reduced||doc?.hidden||!element?.animate)return;
    let animation;
    try{animation=element.animate(frames,{duration,fill:'forwards',easing:'ease-out'});}catch(_){return;}
    let timer,settle;
    const stop=new Promise(resolve=>{settle=resolve;});
    const onHidden=()=>{if(doc?.hidden)settle();};
    active.set(element,settle);
    doc?.addEventListener?.('visibilitychange',onHidden);
    timer=setTimeout(settle,Math.max(350,duration+200));
    try{await Promise.race([Promise.resolve(animation.finished).catch(()=>{}),stop]);}
    finally{
      clearTimeout(timer);doc?.removeEventListener?.('visibilitychange',onHidden);
      if(active.get(element)===settle)active.delete(element);
      try{animation.cancel();}catch(_){}
    }
  }
  const api={play,cancel};root.NeoMotion=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='object'?window:globalThis);
