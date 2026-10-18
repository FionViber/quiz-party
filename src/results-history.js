/* Compact, self-contained finished-game snapshots that travel with saves. */
(function(root){
'use strict';
const SCHEMA_VERSION=1, MAX_JSON=4*1024*1024;
const isObject=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const clone=v=>JSON.parse(JSON.stringify(v));
const core=()=>root.NeoCore||(typeof module!=='undefined'&&module.exports?require('./core.js'):null);
const PlayerNames=(typeof module!=='undefined'&&module.exports)?require('./player-names.js'):root.NeoPlayerNames;
const Clock=(typeof module!=='undefined'&&module.exports)?require('./game-clock.js'):root.NeoGameClock;
function historyError(message){const err=new Error(message);err.code='saveResultsHistoryInvalid';err.params=Object.freeze({});return err;}
function validPlayerName(name,rulesVersion){
  if(typeof name!=='string'||!name.length) return false;
  if(rulesVersion>=4) return PlayerNames ? PlayerNames.normalize(name,true)===name : name.trim()===name&&name.length<=120;
  return name.length<=40;
}
function cleanHistory(list){return list.map(raw=>{const h=clone(raw);if(h&&h.voided){if(h.answerer===undefined)h.answerer=null;if(h.selected===undefined)h.selected=null;}return h;});}
function expectedPoints(pack,q){
  if(q.type==='choice')return q.level*100;
  return pack?.schemaVersion>=3?(q.level-4)*200:q.level*100;
}
function validTimes(game){
  if(game.startedAt!==undefined&&(typeof game.startedAt!=='string'||!Number.isFinite(Date.parse(game.startedAt))))return false;
  if(game.finishedAt!==undefined&&(typeof game.finishedAt!=='string'||!Number.isFinite(Date.parse(game.finishedAt))))return false;
  if(game.durationMs!==undefined&&(!Number.isFinite(game.durationMs)||game.durationMs<0))return false;
  if(Clock&&(game.finishedAt!==undefined||game.durationMs!==undefined)&&!Clock.validate(game,{strict:true}))return false;
  return true;
}
function snapshot(game,recordedAt=new Date().toISOString()) {
  const C=core();
  if(!isObject(game)||game.finished!==true||typeof game.id!=='string'||!game.id||!isObject(game.pack)||!Array.isArray(game.players)||game.players.length<2||game.players.length>8||!Array.isArray(game.history))throw historyError('A finished game is required');
  const variants=[];
  for(const slot of (game.board||[])){
    const base=game.pack.questions?.find(q=>q.id===slot.qid);if(!base)throw historyError('Finished game has an unknown question');
    const q=C.variant(base,slot.level);
    variants.push({id:q.id,level:q.level,type:q.type,points:q.points,...(q.type==='choice'?{options:[...q.options],correctOptionId:q.correctOptionId}:{})});
  }
  if(!validTimes(game))throw historyError('Invalid game duration');
  const compact={rulesVersion:game.rulesVersion,id:game.id,startedAt:game.startedAt,finishedAt:game.finishedAt,durationMs:game.durationMs,finished:true,mode:game.mode,players:[...game.players],questionTarget:game.questionTarget||game.board?.length||0,history:cleanHistory(game.history),current:null,pack:{id:game.pack.id,version:game.pack.version,schemaVersion:game.pack.schemaVersion,title:clone(game.pack.title)},questionVariants:variants};
  const out={schemaVersion:SCHEMA_VERSION,id:game.id,recordedAt,game:compact};
  if(JSON.stringify(out).length>MAX_JSON)throw historyError('Results history record is too large');
  validateRecord(out);return out;
}
function validateRecord(raw){
  if(!isObject(raw)||raw.schemaVersion!==SCHEMA_VERSION||typeof raw.id!=='string'||raw.id.length<1||raw.id.length>160||typeof raw.recordedAt!=='string'||!Number.isFinite(Date.parse(raw.recordedAt))||!isObject(raw.game)||raw.game.finished!==true||typeof raw.game.id!=='string'||raw.game.id!==raw.id||!['together','buzz','turns'].includes(raw.game.mode)||!isObject(raw.game.pack)||typeof raw.game.pack.id!=='string'||typeof raw.game.pack.version!=='string'||!isObject(raw.game.pack.title)||['en','zh-Hans','zh-Hant'].some(l=>typeof raw.game.pack.title[l]!=='string'||!raw.game.pack.title[l].trim())||!Number.isInteger(raw.game.questionTarget)||raw.game.questionTarget<1||!Array.isArray(raw.game.players)||raw.game.players.length<2||raw.game.players.length>8||!Array.isArray(raw.game.questionVariants)||!Array.isArray(raw.game.history)||raw.game.current!==null||JSON.stringify(raw).length>MAX_JSON)throw historyError('Invalid results history');
  if(!validTimes(raw.game))throw historyError('Invalid results history');
  const C=core(), variants=new Map();
  if(!C.SUPPORTED_RULES_VERSIONS.includes(raw.game.rulesVersion)) throw historyError('Invalid results history');
  if(raw.game.players.some(n=>!validPlayerName(n,raw.game.rulesVersion))) throw historyError('Invalid results history');
  for(const q of raw.game.questionVariants){
    if(!isObject(q)||typeof q.id!=='string'||!Number.isInteger(q.level)||q.level<1||q.level>8||!['choice','open'].includes(q.type)||q.points!==expectedPoints(raw.game.pack,q)||variants.has(q.id))throw historyError('Invalid results history');
    if(q.type==='choice'&&(!Array.isArray(q.options)||!q.options.length||typeof q.correctOptionId!=='string'||!q.options.includes(q.correctOptionId)))throw historyError('Invalid results history');
    variants.set(q.id,q);
  }
  const ids=new Set();
  for(const h of raw.game.history){
    if(!isObject(h)||typeof h.qid!=='string'||ids.has(h.qid)||!variants.has(h.qid)||typeof h.level!=='number'||typeof h.type!=='string'||typeof h.points!=='number'||typeof h.voided!=='boolean'||!Array.isArray(h.deltas)||h.deltas.length!==raw.game.players.length||!h.deltas.every(Number.isFinite)||!Array.isArray(h.judgments)||h.judgments.length!==raw.game.players.length||h.judgments.some(v=>v!==null&&typeof v!=='boolean'))throw historyError('Invalid results history');
    const q=variants.get(h.qid);if(h.level!==q.level||h.type!==q.type||h.points!==q.points)throw historyError('Invalid results history');
    if(h.answerer!==null&&!Number.isInteger(h.answerer))throw historyError('Invalid results history');
    if(h.selected!==null&&typeof h.selected!=='string')throw historyError('Invalid results history');
    if(q.type==='choice'&&h.selected!==null&&!q.options.includes(h.selected))throw historyError('Invalid results history');
    if(q.type==='open'&&h.selected!==null)throw historyError('Invalid results history');
    if(!h.voided){let expected;try{expected=C.scoreQuestion(raw.game.mode,q,h.judgments,h.answerer,raw.game.players.length,raw.game.rulesVersion);}catch(_){throw historyError('Invalid results history');}if(expected.some((v,i)=>v!==h.deltas[i]))throw historyError('Invalid results history');}
    ids.add(h.qid);
  }
  return raw;
}
function normalize(value,{strict=true}={}) {if(value===undefined||value===null)return [];if(!Array.isArray(value))throw historyError('Invalid results history');const ids=new Set();return value.map(item=>{let copy;try{copy=clone(item);}catch(_){throw historyError('Invalid results history');}if(ids.has(copy?.id))throw historyError('Invalid results history');ids.add(copy?.id);if(copy?.game?.history)copy.game.history=cleanHistory(copy.game.history);validateRecord(copy);return copy;});}
function upsert(list,game,recordedAt=new Date().toISOString()) {const out=normalize(list),item=snapshot(game,recordedAt),index=out.findIndex(x=>x.id===item.id);if(index>=0)out[index]=item;else out.push(item);return out;}
function find(list,id){return normalize(list).find(x=>x.id===id)||null;}
const api={SCHEMA_VERSION,MAX_JSON,snapshot,normalize,upsert,find,validateRecord};root.NeoResultsHistory=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window==='undefined'?globalThis:window);
