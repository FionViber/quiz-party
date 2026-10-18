/* Stable, localized error boundaries for user-selected JSON files. */
(function(root){
'use strict';
const KNOWN=new Set([
 'saveNotRecognized','saveFormatInvalid','saveRequiresUpdate','saveIncomplete','savePackMissing',
 'savePackVersionMismatch','savePackSchemaMismatch','savePackContentMismatch','saveRoundCountInvalid',
 'saveRoundStateInvalid','saveScoringHistoryInvalid','saveTurnOrderInvalid','saveJudgmentsInvalid',
 'saveScoreIncomplete','saveScoreMismatch','saveActiveQuestionInvalid','saveCommittedScoreMissing',
 'saveActiveScoreMismatch','saveHiddenRecordsInvalid','saveResultsHistoryInvalid','invalidHidden',
 'packStorageFailed','importJsonInvalid','importFileReadFailed','fileLarge','saveFileLarge','importUnexpectedError'
]);
const contextOf=context=>typeof context==='string'?context:(context?.kind||context?.type||'');
function makeError(code,message,params={}){const err=new Error(message||code);err.code=code;err.params=Object.freeze({...params});return err;}
async function readJsonFile(file){
 let text;
 try{text=await file.text();}catch(cause){const err=makeError('importFileReadFailed','File text could not be read');err.cause=cause;throw err;}
 try{return JSON.parse(String(text).replace(/^\uFEFF/,''));}
 catch(cause){const err=makeError('importJsonInvalid','Invalid JSON');err.cause=cause;throw err;}
}
function resolveImportError(error,context){
 const kind=contextOf(context), raw=error&&typeof error.code==='string'?error.code:'';
 let key=KNOWN.has(raw)?raw:'importUnexpectedError';
 if(key==='saveHiddenRecordsInvalid'&&kind!=='save')key='invalidHidden';
 if(key==='invalidHidden'&&kind==='save')key='saveHiddenRecordsInvalid';
 if(key==='fileLarge'&&kind==='save')key='saveFileLarge';
 if(key==='saveFileLarge'&&kind!=='save')key='fileLarge';
 const params=error&&error.params&&typeof error.params==='object'?{...error.params}:{};
 return {key,params};
}
const api={KNOWN,makeError,readJsonFile,resolveImportError};
root.NeoImportErrors=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window==='undefined'?globalThis:window);
