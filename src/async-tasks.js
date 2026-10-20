/* Latest-read cancellation and exclusive writes share one lifecycle. */
(function(root){
  'use strict';
  function create(onBusyChange=()=>{}){
    let revision=0,locked=false;
    return Object.freeze({
      get busy(){return locked;},
      invalidate(){revision++;},
      beginRead(){return locked?null:++revision;},
      isCurrent(token){return token!==null&&token===revision&&!locked;},
      async run(work){
        if(locked)return false;
        locked=true;revision++;
        try{onBusyChange(true);return await work();}
        finally{locked=false;onBusyChange(false);}
      }
    });
  }
  const api={create};root.NeoAsyncTasks=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='object'?window:globalThis);
