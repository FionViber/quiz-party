/* Portable and versioned saves. No filesystem permissions or server APIs. */
(function (root) {
'use strict';
const SAVE_VERSION=2, READER_VERSION=6, APP_VERSION='5.9.0';
const ResultsHistory=(typeof module!=='undefined'&&module.exports)?require('./results-history.js'):root.NeoResultsHistory;
const PlayerNames=(typeof module!=='undefined'&&module.exports)?require('./player-names.js'):root.NeoPlayerNames;
const Clock=(typeof module!=='undefined'&&module.exports)?require('./game-clock.js'):root.NeoGameClock;
const isObject=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const HIDDEN_ID=/^[A-Za-z0-9._-]{1,120}$/;
const HIDDEN_LANGUAGES=['en','zh-Hans','zh-Hant'];
function archiveError(code,message,params={}) {
 const err=new Error(message);err.code=code;err.params=Object.freeze({...params});return err;
}
function ordered(v) {
  if (Array.isArray(v)) return '['+v.map(ordered).join(',')+']';
  if (isObject(v)) return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+ordered(v[k])).join(',')+'}';
  return JSON.stringify(v);
}
/* Fast stable 64-bit (two distinct 32-bit FNV passes), not a security signature. */
function fingerprint(pack) {
  const s=ordered(pack);let a=2166136261,b=0x811c9dc7;
  for(let i=0;i<s.length;i++) {const n=s.charCodeAt(i);a=Math.imul((a^n),16777619);b=Math.imul((b^n),2246822519);}
  return [a,b].map(n=>(n>>>0).toString(16).padStart(8,'0')).join('')+'-'+s.length;
}
function validPlayerName(name,rulesVersion) {
 if(typeof name!=='string'||!name.length) return false;
 if(rulesVersion>=4) return PlayerNames ? PlayerNames.normalize(name,true)===name : name.trim()===name&&name.length<=120;
 return name.length<=40;
}
function exportSave({game,lang,prefs,hidden,activePack,setup,resultsHistory=[]}) {
 if(!game||!isObject(game.pack)) throw archiveError('saveIncomplete','No current game');
 const {pack,...round}=game;
 // Preserve legacy V1 rounds whose frozen board predates the V2 12-question step.
 const legacyRound=Number.isInteger(round.questionTarget)&&round.questionTarget>0&&round.questionTarget===round.board?.length&&round.questionTarget%12!==0;
 const history=ResultsHistory?ResultsHistory.normalize(resultsHistory,{strict:true}):[];
 const historyNeedsV6=history.some(item=>item?.game?.rulesVersion>=4);
 const minReaderVersion=Math.max(pack.schemaVersion>=3?5:(history.length?4:(legacyRound?1:(round.rulesVersion>=3?3:2))),round.rulesVersion>=4||historyNeedsV6?6:0);
 return {kind:'partyquiz-save',saveSchemaVersion:legacyRound?1:SAVE_VERSION,minReaderVersion,writerAppVersion:APP_VERSION,exportedAt:new Date().toISOString(),questionPack:{id:pack.id,version:pack.version,schemaVersion:pack.schemaVersion,fingerprint:fingerprint(pack)},state:{lang,prefs,hidden,activePack,setup,game:round,resultsHistory:history}};
}
function normalizeHidden(value, strict=false) {
 const fail=()=>{throw archiveError(strict?'saveHiddenRecordsInvalid':'invalidHidden','Invalid hidden question records');};
 if(!isObject(value)) {if(strict)fail();return {};}
 const out=Object.create(null), now=()=>new Date().toISOString();
 const dictionary=(raw,name)=>{
   if(raw===undefined)return undefined;
   if(!isObject(raw)) {if(strict)fail();return undefined;}
   const clean=Object.create(null);
   for(const [language,text] of Object.entries(raw)) {
     if(!HIDDEN_LANGUAGES.includes(language)||typeof text!=='string'||text.length>12000) {if(strict)fail();continue;}
     clean[language]=text;
   }
   return clean;
 };
 for(const [key,raw] of Object.entries(value)) {
   if(!isObject(raw)||typeof raw.packId!=='string'||typeof raw.questionId!=='string'||!HIDDEN_ID.test(raw.packId)||!HIDDEN_ID.test(raw.questionId)||key!==`${raw.packId}::${raw.questionId}`) {if(strict)fail();continue;}
   const record={packId:raw.packId,questionId:raw.questionId};
   for(const name of ['hiddenAt','deletedAt']) {
     if(raw[name]===undefined)continue;
     if(typeof raw[name]!=='string'||raw[name].length>80) {if(strict)fail();continue;}
     record[name]=raw[name];
   }
   record.hiddenAt=record.hiddenAt||record.deletedAt||now();
   const packTitle=dictionary(raw.packTitle,'packTitle'),prompts=dictionary(raw.prompts,'prompts');
   if(packTitle!==undefined)record.packTitle=packTitle;
   if(prompts!==undefined)record.prompts=prompts;
   out[key]=record;
 }
 return out;
}
function inspectSave(doc,packs,core) {
 if(!isObject(doc)||doc.kind!=='partyquiz-save') throw archiveError('saveNotRecognized','Not a PARTY QUIZ save JSON');
 if(!Number.isInteger(doc.saveSchemaVersion)||doc.saveSchemaVersion<1) throw archiveError('saveFormatInvalid','Invalid save format');
 const minReader=doc.minReaderVersion===undefined?1:doc.minReaderVersion;
 if(!Number.isInteger(minReader)||minReader<1) throw archiveError('saveFormatInvalid','Invalid save format');
 if(doc.saveSchemaVersion>SAVE_VERSION||minReader>READER_VERSION) throw archiveError('saveRequiresUpdate','Save requires a newer game version');
 // Future schema versions must explicitly migrate older saves here.
 if(![1,2].includes(doc.saveSchemaVersion)) throw archiveError('saveRequiresUpdate','No compatible save migrator');
 if(!isObject(doc.questionPack)||!isObject(doc.state)||!isObject(doc.state.game))throw archiveError('saveIncomplete','Incomplete save');
 const identity=doc.questionPack;
 if(!Object.prototype.hasOwnProperty.call(identity,'id')||!Object.prototype.hasOwnProperty.call(identity,'version')||!Object.prototype.hasOwnProperty.call(identity,'schemaVersion')||!Object.prototype.hasOwnProperty.call(identity,'fingerprint')||identity.id==null||identity.version==null||identity.schemaVersion==null||identity.fingerprint==null)throw archiveError('saveIncomplete','Incomplete save');
 if(typeof identity.id!=='string'||!identity.id.trim()||typeof identity.version!=='string'||!identity.version.trim()||!Number.isInteger(identity.schemaVersion)||identity.schemaVersion<1||typeof identity.fingerprint!=='string'||!/^[0-9a-f]{16}-\d+$/.test(identity.fingerprint))throw archiveError('saveFormatInvalid','Invalid save format');
 const pack=packs.find(p=>p.id===identity.id);
 if(!pack) throw archiveError('savePackMissing','Required question pack is not installed: '+identity.id,{packId:identity.id});
 if(pack.version!==identity.version)throw archiveError('savePackVersionMismatch','Question pack version does not match. Save expects '+identity.version+', installed '+String(pack.version),{packId:identity.id,expectedVersion:identity.version,installedVersion:pack.version});
 if(pack.schemaVersion!==identity.schemaVersion)throw archiveError('savePackSchemaMismatch','Question pack schema does not match',{packId:identity.id});
 if(fingerprint(pack)!==identity.fingerprint)throw archiveError('savePackContentMismatch','Question pack content differs from this save, even though the version string matches',{packId:identity.id});
 const g=JSON.parse(JSON.stringify(doc.state.game));g.pack=JSON.parse(JSON.stringify(pack));
 if(Clock&&!Clock.validate(g))throw archiveError('saveRoundStateInvalid','Invalid game timestamps');
 // Migrate v1 saves that used the whole allocated board without a round target.
 if(doc.saveSchemaVersion===1 && g.questionTarget===undefined)g.questionTarget=g.board?.length;
 if(doc.saveSchemaVersion===2 && (!Number.isInteger(g.questionTarget)||g.questionTarget<12||g.questionTarget%12!==0||g.questionTarget!==g.board?.length))throw archiveError('saveRoundCountInvalid','Invalid round question count');
 if(!core.SUPPORTED_RULES_VERSIONS.includes(g.rulesVersion)||!core.MODES.includes(g.mode)||!Array.isArray(g.players)||g.players.length<2||g.players.length>8||g.players.some(n=>!validPlayerName(n,g.rulesVersion))||!Array.isArray(g.history)||typeof g.finished!=='boolean'||(g.current!==null&&!isObject(g.current))||!core.validBoard(g))throw archiveError('saveRoundStateInvalid','Invalid round state');
 const variants=new Map(g.board.map(s=>[s.qid,core.variant(g.pack.questions.find(q=>q.id===s.qid),s.level)]));
 const historyIds=new Set(),committedHistoryIds=new Set();
 for(const h of g.history){
   if(!isObject(h)) throw archiveError('saveScoringHistoryInvalid','Invalid scoring history');
   const q=variants.get(h?.qid);
   if(!q||historyIds.has(h.qid)||h.level!==q.level||h.type!==q.type||h.points!==q.points||typeof h.voided!=='boolean'||h.key!==core.key(pack.id,q.id)||!Array.isArray(h.deltas)||h.deltas.length!==g.players.length||!h.deltas.every(Number.isFinite)||!g.seen.includes(q.id))throw archiveError('saveScoringHistoryInvalid','Invalid scoring history');
   const collective=core.isCollective(g.mode,q), legacyVoidedAnswerer=(h.voided&&h.answerer===undefined), legacyVoidedSelection=(h.voided&&h.selected===undefined);
   const answererValid=legacyVoidedAnswerer||(h.answerer===null||(Number.isInteger(h.answerer)&&h.answerer>=0&&h.answerer<g.players.length));
   const selectedValid=legacyVoidedSelection||(h.selected===null||(q.type==='choice'&&typeof h.selected==='string'&&q.options.includes(h.selected)));
   if(!answererValid||(!legacyVoidedAnswerer&&!collective&&h.answerer===null)||(!legacyVoidedAnswerer&&collective&&h.answerer!==null)||!selectedValid||(!legacyVoidedSelection&&q.type==='open'&&h.selected!==null))throw archiveError('saveScoringHistoryInvalid','Invalid scoring history');
   if(g.rulesVersion>=3&&g.mode==='turns'&&!h.voided&&h.answerer!==committedHistoryIds.size%g.players.length)throw archiveError('saveTurnOrderInvalid','Invalid turn order');
   historyIds.add(h.qid);
   if(!Array.isArray(h.judgments)||h.judgments.length!==g.players.length||h.judgments.some(v=>v!==null&&typeof v!=='boolean'))throw archiveError('saveJudgmentsInvalid','Invalid adjudication record');
   if(!h.voided){
      committedHistoryIds.add(h.qid);
      let expected;
      try{expected=core.scoreQuestion(g.mode,q,h.judgments,h.answerer,g.players.length,g.rulesVersion)}catch(_){throw archiveError('saveScoreIncomplete','Incomplete score record');}
      if(expected.some((x,i)=>x!==h.deltas[i]))throw archiveError('saveScoreMismatch','Score verification failed');
   }
 }
 if(g.current){
   const c=g.current,q=variants.get(c.qid);
   const collective=q&&core.isCollective(g.mode,q),choice=q?.type==='choice';
   const answererValid=c.answerer===null||(Number.isInteger(c.answerer)&&c.answerer>=0&&c.answerer<g.players.length);
   const selectedValid=c.selected===null||(choice&&typeof c.selected==='string'&&q.options.includes(c.selected));
   const turnAnswerer=g.rulesVersion>=3&&g.mode==='turns'&&c.phase!=='scored' ? core.currentPlayer(g) : null;
   if(!q||!g.seen.includes(c.qid)||c.level!==q.level||!['answer','judge','scored'].includes(c.phase)||!Array.isArray(c.judgments)||c.judgments.length!==g.players.length||c.judgments.some(v=>v!==null&&typeof v!=='boolean')||!answererValid||!selectedValid||(!collective&&c.phase!=='answer'&&c.answerer===null)||(collective&&c.answerer!==null)||(collective&&c.selected!==null)||(q.type==='open'&&c.selected!==null)||(!collective&&choice&&c.phase!=='answer'&&c.selected===null)||(turnAnswerer!==null&&c.answerer!==turnAnswerer))throw archiveError('saveActiveQuestionInvalid','Invalid active question');
   if(c.phase==='scored'){
     if(!committedHistoryIds.has(c.qid))throw archiveError('saveCommittedScoreMissing','Missing committed score');
     const committed=g.history.find(h=>h.qid===c.qid&&!h.voided);
     if(!committed||committed.judgments.some((v,i)=>v!==c.judgments[i]))throw archiveError('saveActiveScoreMismatch','Active score does not match history');
   }
 }
 let hidden;try{hidden=normalizeHidden(doc.state.hidden,true);}catch(err){if(err.code==='saveHiddenRecordsInvalid')throw err;throw archiveError('saveHiddenRecordsInvalid',err.message);}
 const resultsHistory=ResultsHistory?ResultsHistory.normalize(doc.state.resultsHistory,{strict:true}):[];
 return {game:g,lang:core.LANGUAGES.includes(doc.state.lang)?doc.state.lang:'zh-Hans',prefs:isObject(doc.state.prefs)?doc.state.prefs:{},hidden,activePack:pack.id,setup:isObject(doc.state.setup)?doc.state.setup:null,resultsHistory};
}
const api={SAVE_VERSION,READER_VERSION,APP_VERSION,fingerprint,exportSave,normalizeHidden,inspectSave};
root.NeoArchive=api;
if(typeof module!=='undefined'&&module.exports) module.exports=api;
})(typeof window==='undefined'?globalThis:window);
