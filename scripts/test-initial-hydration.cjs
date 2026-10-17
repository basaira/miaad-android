// Phase 1C V1R6: exercise shipping core + Domain + integration startup, not
// synthetic payload classifiers. Deterministic, read-only Node VM with isolated
// Native and local storage input/output and real Domain consumers.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(process.env.MIAAD_ASSET_ROOT||path.join(__dirname,'../app/src/main/assets'));
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const {createMiaadDomain}=require(path.join(root,'app-domain.js'));
const clone=x=>JSON.parse(JSON.stringify(x));
const clock=()=>new Date('2026-09-21T12:00:00Z');
const date='2026-09-21';
function fixture(){
 const d=createMiaadDomain({settings:{teacherTimeZone:'Africa/Cairo'}},{},clock);
 const s=d.saveStudent({id:'s',name:'Student',startDate:'2026-09-01',custom:false,settings:{}});
 const l={id:'sched',studentId:s.id,name:s.name,day:1,start:'10:00',duration:30,repeat:'weekly'};
 d.saveSchedule(l,date);
 d.record({...d.resolveScheduleOccurrence(l.id,date),status:'entered',note:'canonical',countOverride:false});
 const del=d.saveSchedule({id:'deleted',studentId:s.id,name:s.name,day:1,start:'11:00',duration:30,repeat:'weekly'},date);
 d.deleteSchedule(del.id);
 d.createPeriod('s','2026-09-01','2026-09-30');
 d.data.students.s.custom=true;
 d.data.students.s.settings={target:1,autoCycle:true};
 return clone(d.data)
}
const original=fixture();
const lesson={id:'sched',studentId:'s',name:'Student',day:1,start:'10:00',duration:30,repeat:'weekly'};
const legacyLesson={id:'old',name:'Old student',day:1,start:'11:00',duration:30,repeat:'weekly'};
const legacyKey='2026-09-21__old';
function nativeEnvelope(domain=original,updatedAt=100){
 return {schemaVersion:4,updatedAt,lessons:[lesson],sessionState:{},sessionNotes:{},sessionAudit:{},idrisPhase:0,domain:clone(domain)}
}
const badTarget=(v,invalid)=>{const c=clone(v);c.students.s.settings.target=invalid;return c};
const invalidSchedule=v=>{const c=clone(v);c.schedules.sched[0].lesson.day=9;return c};
const partial=v=>{const c=clone(v);delete c.records;return c};
function execute({native,local,legacyLocal=false,rawNative,rawLocal,localStamp='200'}={}){
 const memory={};const writes=[];
 if(local!==undefined||rawLocal!==undefined)memory.miaadDomainV4=rawLocal!==undefined?rawLocal:JSON.stringify(local);
 if(legacyLocal||local!==undefined){
  memory.miadLessonsV2=JSON.stringify(legacyLocal?[legacyLesson]:[lesson]);
  memory.miadSessionStateV2=JSON.stringify(legacyLocal?{[legacyKey]:'entered'}:{});
  memory.miadSessionNotesV2=JSON.stringify(legacyLocal?{[legacyKey]:'legacy-note'}:{});
  memory.miadUpdatedAtV1=localStamp;
 }
 const originalMemory=clone(memory);
 const text=rawNative!==undefined?rawNative:native===undefined?'':JSON.stringify(native);
 const nativeBridge={loadSnapshot:()=>text,saveSnapshot:x=>writes.push(JSON.parse(x)),syncReminders:()=>{}};
 const node={window:null,document:{querySelectorAll:()=>[],getElementById:()=>({innerHTML:'',remove(){}})},console,Intl,Date,Number,String,JSON,Array,Object,Math,Set,Map,RegExp,Error,
  localStorage:{getItem:k=>Object.prototype.hasOwnProperty.call(memory,k)?memory[k]:null,setItem(k,v){memory[k]=String(v)}},
  AndroidBridge:nativeBridge,syncNativeReminders:()=>{},renderAll:()=>{},showToast:()=>{}};
 node.window=node;vm.createContext(node);
 for(const file of ['app-core.js','app-domain.js','app-integration.js'])
  vm.runInContext(read(file),node,{filename:file,timeout:10000});
 const readState=()=>JSON.parse(vm.runInContext("JSON.stringify({origin:selectedInitialSource,decision:startupInitialEvidence,blocked:startupRecoveryBlocked,legacy:migrateInitialLegacy,stamp:lastUpdatedAt,lessons:lessons.map(l=>l.id),records:domain.data.records,schedules:domain.data.schedules,students:domain.data.students,periods:domain.data.periods,cycles:domain.data.cycles,activity:domain.data.activity,sync:nativeSyncState})",node));
 const before=readState();
 const trigger=()=>vm.runInContext('domain.notifications()',node,{timeout:10000});
 const save=()=>vm.runInContext('saveLocalState()',node,{timeout:10000});
 return{node,memory,originalMemory,writes,before,readState,trigger,save}
}
let n=0;
function check(label,action){try{action();n++;console.log('PASS '+label)}catch(e){console.error('FAIL '+label);throw e}}
for(const value of [0,null,'bad']){
 check('V1R6 invalid Native target '+JSON.stringify(value)+' falls back to valid Local',()=>{
  const h=execute({native:nativeEnvelope(badTarget(original,value),400),local:original});
  const b=h.before;assert.equal(b.origin,'local-modern');assert.equal(b.stamp,200);
  assert.equal(b.students.s.settings.target,1);assert.equal(b.records[date+'__sched'].countOverride,false);
  assert.ok(b.schedules.deleted.some(x=>x.lesson===null));
  h.trigger();const a=h.readState();
  assert.equal(a.cycles[Object.keys(a.cycles)[0]].target,1);
  assert.equal(h.writes.length,0);
  h.save();assert.equal(JSON.parse(h.memory.miaadDomainV4).students.s.settings.target,1)
 })
}
check('V1R6 good Native beats bad Local without mixing mirrors',()=>{
 const h=execute({native:nativeEnvelope(original,100),local:badTarget(original,0)});
 assert.equal(h.before.origin,'native-modern');assert.equal(h.before.students.s.settings.target,1);
 assert.deepEqual(h.before.lessons,['sched']);assert.equal(h.before.stamp,100);
});
check('V1R6 both valid keep established Native precedence over newer Local timestamp',()=>{
 const h=execute({native:nativeEnvelope(original,100),local:original,localStamp:'900'});
 assert.equal(h.before.origin,'native-modern');assert.equal(h.before.stamp,100);
});
check('V1R6 missing Native uses verified Local with coherent canonical schedules',()=>{
 const h=execute({local:original});
 assert.equal(h.before.origin,'local-modern');assert.equal(h.before.schedules.sched[0].lesson.id,'sched');
});
check('V1R6 valid Native with missing Local remains valid',()=>{
 const h=execute({native:nativeEnvelope(original)});
 assert.equal(h.before.origin,'native-modern');assert.equal(h.before.students.s.settings.target,1)
});
for(const [kind,bad] of [['target0',badTarget(original,0)],['targetNull',badTarget(original,null)],['targetText',badTarget(original,'bad')],['partial',partial(original)],['schedule',invalidSchedule(original)]]){
 check('V1R6 invalid Local '+kind+' falls back to good Native',()=>{
  const h=execute({native:nativeEnvelope(original),local:bad});
  assert.equal(h.before.origin,'native-modern');assert.equal(h.before.students.s.settings.target,1)
 });
 check('V1R6 both invalid '+kind+' quarantine blocks all persistence',()=>{
  const h=execute({native:nativeEnvelope(badTarget(original,0)),local:bad});
  assert.equal(h.before.origin,'recovery');assert.equal(h.before.blocked,true);
  assert.equal(h.before.sync,'recovery-required');assert.equal(Object.keys(h.before.records).length,0);
  const old=clone(h.memory);
  h.save();vm.runInContext('persist()',h.node);
  assert.deepEqual(h.memory,old);assert.equal(h.writes.length,0);
  assert.equal(h.readState().stamp,0)
 })
}
check('V1R6 corrupted Native JSON falls back to good Local',()=>{
 const h=execute({rawNative:'{"corrupt',local:original});
 assert.equal(h.before.origin,'local-modern');assert.equal(h.before.students.s.settings.target,1)
});
check('V1R6 corrupted Native lessons cannot execute unsafe normalizeSchedule',()=>{
 const h=execute({native:{...nativeEnvelope(original),lessons:[null]},local:original});
 assert.equal(h.before.origin,'local-modern');assert.equal(h.before.students.s.settings.target,1)
});
check('V1R6 invalid Native timestamp selects valid Local',()=>{
 const h=execute({native:nativeEnvelope(original,'garbage'),local:original});
 assert.equal(h.before.origin,'local-modern');assert.equal(h.before.stamp,200)
});
check('V1R6 invalid local timestamp does not advance sync metadata',()=>{
 const h=execute({local:original,localStamp:'not-a-time'});
 assert.equal(h.before.origin,'local-modern');assert.equal(h.before.stamp,0)
});
check('V1R6 valid historical missing optional settings remains admitted',()=>{
 const d=clone(original);delete d.settings.showNotes;delete d.settings.notifications.dailyTime;delete d.students.s.settings.autoCycle;
 const h=execute({local:d});assert.equal(h.before.origin,'local-modern');
 assert.equal(h.before.students.s.settings.target,1);h.trigger()
});
check('V1R6 Native genuine Legacy follows bounded migration',()=>{
 const h=execute({native:{schemaVersion:2,lessons:[legacyLesson],sessionState:{[legacyKey]:'entered'},sessionNotes:{[legacyKey]:'legacy-note'}}});
 assert.equal(h.before.origin,'native-legacy');assert.equal(h.before.legacy,true);
 assert.ok(h.before.schedules.old);assert.equal(h.before.records[legacyKey]?.status,'entered')
});
check('V1R6 Local genuine Legacy follows bounded migration',()=>{
 const h=execute({legacyLocal:true});
 assert.equal(h.before.origin,'local-legacy');assert.equal(h.before.legacy,true);
 assert.equal(h.before.records[legacyKey]?.status,'entered')
});
check('V1R6 malformed modern Native cannot masquerade as Legacy',()=>{
 const h=execute({native:nativeEnvelope(badTarget(original,0)),legacyLocal:true});
 assert.equal(h.before.origin,'local-legacy');assert.equal(h.before.legacy,true);
 assert.equal(h.before.records[legacyKey]?.status,'entered')
});
check('V1R6 valid Local modern beats Native genuine Legacy',()=>{
 const h=execute({native:{lessons:[legacyLesson],sessionState:{[legacyKey]:'entered'}},local:original});
 assert.equal(h.before.origin,'local-modern');assert.equal(h.before.records[legacyKey],undefined)
});
check('V1R6 valid Native modern beats Local genuine Legacy',()=>{
 const h=execute({native:nativeEnvelope(original),legacyLocal:true});
 assert.equal(h.before.origin,'native-modern');assert.equal(h.before.records[legacyKey],undefined)
});
check('V1R6 missing both initializes controlled fresh state',()=>{
 const h=execute({});assert.equal(h.before.origin,'fresh');assert.equal(h.before.legacy,true);
 assert.ok(h.before.lessons.length>0);assert.equal(h.before.blocked,false)
});
check('V1R6 corrupt Local JSON with no recoverable source quarantines',()=>{
 const h=execute({rawLocal:'{not-json'});
 assert.equal(h.before.origin,'recovery');const before=clone(h.memory);h.save();
 assert.deepEqual(h.memory,before)
});
check('V1R6 valid Cloud payload releases quarantine only after admission',()=>{
 const h=execute({native:nativeEnvelope(badTarget(original,0)),local:badTarget(original,null)});
 assert.equal(h.before.blocked,true);
 const data={updatedAt:501,lessons:[lesson],domain:original,sessionState:{},sessionNotes:{},sessionAudit:{},idrisPhase:0};
 vm.runInContext('window.__miaadReceiveCloud('+JSON.stringify(JSON.stringify(data))+')',h.node);
 assert.equal(h.readState().blocked,false);
 assert.equal(h.readState().sync,'synced');assert.equal(h.readState().students.s.settings.target,1);
 assert.equal(h.readState().stamp,501);
 assert.equal(h.writes.length,0)
});
console.log('INITIAL HYDRATION CONTRACT PASS: '+n+'/'+n);
