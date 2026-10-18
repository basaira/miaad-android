// Admission is shared with Cloud: classifyCloudDomainPayload() is pure and
// is defined by app-core.js. app-domain.js supplies MiaadTemporal before this
// script executes. Never evaluate against an incompletely constructed domain.
const localDomainRaw=store.get('miaadDomainV4');
const localDomainSeed=loadJSON('miaadDomainV4',null);
function isDomainMap(value){return !!value&&typeof value==='object'&&!Array.isArray(value)}
function isModernDomainPayload(value){return isDomainMap(value)&&Number(value.version)===4&&isDomainMap(value.students)&&isDomainMap(value.records)&&isDomainMap(value.schedules)&&isDomainMap(value.settings)}
const initialOwn=(value,key)=>isDomainMap(value)&&Object.prototype.hasOwnProperty.call(value,key);
const validInitialLessons=value=>Array.isArray(value)&&value.every(item=>isDomainMap(item)&&typeof item.id==='string'&&!!item.id);
const validInitialTimestamp=value=>value===undefined||value===null||
 (typeof value==='number'||typeof value==='string'&&/^(0|[1-9]\d*)$/.test(value))&&
 Number.isSafeInteger(+value)&&+value>=0;
function initialModernState(value){return classifyCloudDomainPayload({domain:value})==='modern'?'modern':'invalid'}
function nativeInitialState(){
 if(nativeSnapshotParseFailed)return'invalid';
 if(nativeInitial===null)return'missing';
 if(!isDomainMap(nativeInitial))return'invalid';
 if(!validInitialTimestamp(nativeInitial.updatedAt))return'invalid';
 for(const key of ['sessionState','sessionNotes','sessionAudit'])
  if(initialOwn(nativeInitial,key)&&!isDomainMap(nativeInitial[key]))return'invalid';
 if(initialOwn(nativeInitial,'idrisPhase')&&(!Number.isInteger(+nativeInitial.idrisPhase)||![0,1].includes(+nativeInitial.idrisPhase)))return'invalid';
 if(initialOwn(nativeInitial,'lessons')&&!validInitialLessons(nativeInitial.lessons))return'invalid';
 if(initialOwn(nativeInitial,'domain'))return initialModernState(nativeInitial.domain);
 return validInitialLessons(nativeInitial.lessons)?'legacy':'invalid'
}
const localLegacyKeys=[STORAGE.lessons,STORAGE.state,STORAGE.notes,STORAGE.audit,STORAGE.phase,'miadLessonsV1','miadSessionStateV1','miadSessionNotesV1','miadIdrisPhaseV1'];
const localHasLegacy=localLegacyKeys.some(key=>store.get(key)!==null);
function validatedLegacyStore(){
 for(const key of localLegacyKeys){
  const raw=store.get(key);if(raw===null)continue;
  let value;try{value=JSON.parse(raw)}catch{return false}
  if(value===null)return false;
  const array=key===STORAGE.lessons||key==='miadLessonsV1';
  const phase=key===STORAGE.phase||key==='miadIdrisPhaseV1';
  if(array?!validInitialLessons(value):phase?![0,1].includes(Number(value)):!isDomainMap(value))return false
 }
 return true
}
const corruptLegacyEvidence=localHasLegacy&&!validatedLegacyStore();
const localInitialState=corruptLegacyEvidence?'invalid':
 localDomainRaw===null?(localHasLegacy?'legacy':'missing'):initialModernState(localDomainSeed);
function canonicalAcademic(value){
 if(Array.isArray(value))return value.map(canonicalAcademic);
 if(isDomainMap(value))return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonicalAcademic(value[key])]));
 return value
}
const academicDivergence=(a,b)=>JSON.stringify(canonicalAcademic(a))!==JSON.stringify(canonicalAcademic(b));
const nativeInitialClassification=nativeInitialState();
const modernConflict=nativeInitialClassification==='modern'&&localInitialState==='modern'&&academicDivergence(nativeInitial.domain,localDomainSeed);
const selectedInitialSource=corruptLegacyEvidence?'recovery-corrupt-legacy':
 modernConflict?'conflict':
 nativeInitialClassification==='modern'?'native-modern':
 localInitialState==='modern'?'local-modern':
 nativeInitialClassification==='legacy'?'native-legacy':
 localInitialState==='legacy'?'local-legacy':
 nativeInitialClassification==='missing'&&localInitialState==='missing'?'fresh':'recovery';
let startupRecoveryBlocked=['recovery','conflict','recovery-corrupt-legacy'].includes(selectedInitialSource);
const startupPreservedEvidence=Object.freeze({native:nativeInitial,localDomainRaw,localLegacyKeys:localLegacyKeys.filter(k=>store.get(k)!==null),
 nativeTimestamp:nativeInitial?.updatedAt??null,localTimestamp:store.get(STORAGE.updated)});
const startupInitialEvidence=Object.freeze({native:nativeInitialClassification,local:localInitialState,selected:selectedInitialSource});
const nativeSelected=selectedInitialSource.startsWith('native-');
const localSelected=selectedInitialSource.startsWith('local-');
const primaryDomainModern=selectedInitialSource==='native-modern'||selectedInitialSource==='local-modern';
const migrateInitialLegacy=selectedInitialSource==='native-legacy'||selectedInitialSource==='local-legacy'||selectedInitialSource==='fresh';
const localDomainMap=isDomainMap(localDomainSeed)?localDomainSeed:{};
const nativeDomainSeed=initialOwn(nativeInitial,'domain')?nativeInitial.domain:null;
const primaryDomainSeed=primaryDomainModern?(nativeSelected?nativeDomainSeed:localDomainMap):{};
function canonicalStartupLessons(seed){
 const out=[];
 for(const [id,revisions] of Object.entries(seed?.schedules||{})){
  const lesson=Array.isArray(revisions)?revisions.at(-1)?.lesson:null;
  if(isDomainMap(lesson))out.push({...lesson,id});
 }
 return out
}
const initialLocalLessons=loadJSON(STORAGE.lessons,loadJSON('miadLessonsV1',BASE));
if(nativeSelected){
 lessons=Array.isArray(nativeInitial.lessons)?nativeInitial.lessons:canonicalStartupLessons(primaryDomainSeed);
 sessionState=isDomainMap(nativeInitial.sessionState)?nativeInitial.sessionState:{};
 sessionNotes=isDomainMap(nativeInitial.sessionNotes)?nativeInitial.sessionNotes:{};
 sessionAudit=isDomainMap(nativeInitial.sessionAudit)?nativeInitial.sessionAudit:isDomainMap(sessionAudit)?sessionAudit:{};
 idrisPhase=Number(nativeInitial.idrisPhase??0);
 lastUpdatedAt=Number(nativeInitial.updatedAt??0)
}else if(localSelected){
 if(primaryDomainModern){
  const canonical=canonicalStartupLessons(primaryDomainSeed);
  const byId=new Map(validInitialLessons(initialLocalLessons)?initialLocalLessons.map(item=>[item.id,item]):[]);
  lessons=canonical.map(item=>({...item,...(byId.get(item.id)||{}),...item}))
 }else lessons=validInitialLessons(initialLocalLessons)?initialLocalLessons:[];
 sessionState=loadJSON(STORAGE.state,loadJSON('miadSessionStateV1',{}));
 sessionNotes=loadJSON(STORAGE.notes,loadJSON('miadSessionNotesV1',{}));
 sessionAudit=loadJSON(STORAGE.audit,{});
 idrisPhase=Number(store.get(STORAGE.phase)??store.get('miadIdrisPhaseV1')??0);
 lastUpdatedAt=Number(store.get(STORAGE.updated)??0)
}else if(selectedInitialSource==='fresh'){
 lessons=BASE.map(l=>({...l}));sessionState={};sessionNotes={};sessionAudit={};idrisPhase=0;lastUpdatedAt=0
}else{
 // Do not invent a recovered Domain or persist it over invalid evidence.
 lessons=[];sessionState={};sessionNotes={};sessionAudit={};idrisPhase=0;lastUpdatedAt=0;
 nativeSyncState=selectedInitialSource==='conflict'?'conflict-required':'recovery-required'
}
lessons=normalizeSchedule(lessons);
if(!isDomainMap(sessionState))sessionState={};
if(!isDomainMap(sessionNotes))sessionNotes={};
if(!isDomainMap(sessionAudit))sessionAudit={};
if(![0,1].includes(idrisPhase))idrisPhase=0;
if(!Number.isSafeInteger(lastUpdatedAt)||lastUpdatedAt<0)lastUpdatedAt=0;
const verifiedFallbackZone=localInitialState==='modern'?localDomainMap:{};
const domain=createMiaadDomain(stabilizeMiaadTeacherTimeZoneSeed(primaryDomainSeed,verifiedFallbackZone),
 {lessons,sessionState,sessionNotes,sessionAudit,idrisPhase},undefined,{migrateLegacy:migrateInitialLegacy});
for(const l of lessons){const v=domain.data.schedules[l.id]?.at(-1)?.lesson;if(v)l.studentId=v.studentId}
function buildLegacyOccurrenceMirrors(records=domain.data.records){
 const state={},notes={};
 for(const r of Object.values(records||{})){if(r?.deleted)continue;if(r.status&&r.status!=='pending')state[r.id]=r.status;if(r.note)notes[r.id]=r.note}
 return{state,notes}
}
function refreshLegacyOccurrenceMirrors(){const mirrors=buildLegacyOccurrenceMirrors();sessionState=mirrors.state;sessionNotes=mirrors.notes;return mirrors}
refreshLegacyOccurrenceMirrors();
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function domainCommit(){
 if(startupRecoveryBlocked)throw Error('تعذر حفظ التعديلات قبل استعادة نسخة صحيحة من البيانات');
 refreshLegacyOccurrenceMirrors();
 persist();renderAll();
}
