/* Game duration helpers. A finished legacy game without an end timestamp has no fabricated duration. */
(function(root){
'use strict';
function time(value){const n=typeof value==='number'?value:Date.parse(value);return Number.isFinite(n)?n:null;}
function duration(game,now=Date.now()){
 if(!game||typeof game!=='object')return null;
 const start=time(game.startedAt);if(start===null)return null;
 const end=game.finished?time(game.finishedAt):time(now);
 if(end===null||end<start)return null;
 return Math.max(0,Math.round(end-start));
}
function finish(game,now=new Date()){
 if(!game||typeof game!=='object')throw new TypeError('A game is required');
 if(game.finished)return game;
 const start=time(game.startedAt),requested=now instanceof Date?now.getTime():time(now);
 if(requested===null||!Number.isFinite(requested))throw new TypeError('Invalid finish time');
 if(start!==null){const end=Math.max(start,requested);game.finishedAt=new Date(end).toISOString();game.durationMs=end-start;}
 game.finished=true;
 return game;
}
function validate(game,{strict=false}={}){
 if(!game||typeof game!=='object')return false;
 if(game.finishedAt===undefined&&game.durationMs===undefined)return !strict;
 const start=time(game.startedAt),end=time(game.finishedAt),ms=game.durationMs;
 return game.finished===true&&typeof game.startedAt==='string'&&typeof game.finishedAt==='string'&&start!==null&&end!==null&&end>=start&&Number.isSafeInteger(ms)&&ms>=0&&ms===end-start;
}
function format(ms,language='en'){
 if(!Number.isFinite(ms)||ms<0)return '';
 const sec=Math.floor(ms/1000),h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),s=sec%60;
 if(language==='zh-Hans')return h?h+'小时 '+m+'分 '+s+'秒':m?m+'分 '+s+'秒':s+'秒';
 if(language==='zh-Hant')return h?h+'小時 '+m+'分 '+s+'秒':m?m+'分 '+s+'秒':s+'秒';
 return h?h+'h '+m+'m '+s+'s':m?m+'m '+s+'s':s+'s';
}
const api={time,duration,finish,validate,format};root.NeoGameClock=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window==='undefined'?globalThis:window);
