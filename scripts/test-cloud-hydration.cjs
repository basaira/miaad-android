const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(process.env.MIAAD_ASSET_ROOT||path.join(__dirname,'../app/src/main/assets'));
const {createMiaadDomain}=require(path.join(root,'app-domain.js'));
const core=fs.readFileSync(path.join(root,'app-core.js'),'utf8');
const integration=fs.readFileSync(path.join(root,'app-integration.js'),'utf8');
const start=core.indexOf('function classifyCloudDomainPayload(');
const end=core.indexOf('window.__miaadNativeStatus',start);
const classStart=integration.indexOf('function isDomainMap(');
const classEnd=integration.indexOf('const nativeDomainSeed',classStart);
const classifiers=classStart>=0&&classEnd>classStart?integration.slice(classStart,classEnd):null;
assert.ok(start>=0&&end>start&&classifiers,'actual receiver and Domain predicates must be present');
const receiver=core.slice(start,end);
const clone=x=>JSON.parse(JSON.stringify(x));
const date='2026-09-21';
const clock=()=>new Date('2026-09-21T12:00:00Z');
function fixture(){
 const d=createMiaadDomain({settings:{teacherTimeZone:'Africa/Cairo'}},{},clock);
 const s=d.saveStudent({id:'student',name:'Student',startDate:'2026-09-01',custom:false,settings:{}});
 const save=(id,repeat='weekly',phase)=>d.saveSchedule({id,studentId:s.id,name:s.name,day:1,start:'10:00',duration:30,repeat,...(phase===undefined?{}:{phase})},date);
 save('historical');
 d.record({...d.resolveScheduleOccurrence('historical',date),status:'entered',note:'canonical',actualMinutes:23,countOverride:false});
 d.saveSchedule({id:'historical',studentId:s.id,name:s.name,day:1,start:'11:00',duration:45,repeat:'weekly'},'2026-09-28');
 save('tombstone');d.removeRecord(d.resolveScheduleOccurrence('tombstone',date));
 save('biweekly','biweekly',0);
 d.record({...d.resolveScheduleOccurrence('biweekly',date),status:'absent',note:'phase zero'});
 assert.equal(d.resolveScheduleOccurrence('biweekly','2026-09-28'),null);
 return d
}
function harness(){
 const domain=fixture(),calls={save:0,render:0,toast:0};
 const context={window:null,domain,lastUpdatedAt:1,lessons:[{id:'local'}],sessionState:{local:'entered'},sessionNotes:{local:'note'},sessionAudit:{a:1},idrisPhase:3,nativeSyncState:'cloud-ready',
  normalizeSchedule:clone,saveLocalState:()=>calls.save++,renderAll:()=>calls.render++,showToast:()=>calls.toast++,
  refreshLegacyOccurrenceMirrors:()=>{const state={},notes={};for(const r of Object.values(domain.data.records)){if(r.deleted)continue;if(r.status&&r.status!=='pending')state[r.id]=r.status;if(r.note)notes[r.id]=r.note}context.sessionState=state;context.sessionNotes=notes}
 };
 context.window=context;vm.createContext(context);vm.runInContext(classifiers+'\n'+receiver,context);
 const snapshot=()=>clone({domain:domain.data,lessons:context.lessons,sessionState:context.sessionState,sessionNotes:context.sessionNotes,sessionAudit:context.sessionAudit,idrisPhase:context.idrisPhase,lastUpdatedAt:context.lastUpdatedAt,nativeSyncState:context.nativeSyncState,calls});
 return{context,domain,calls,snapshot,receive:data=>context.__miaadReceiveCloud(JSON.stringify(data))}
}
const lesson={id:'legacy-cloud',name:'Legacy Cloud Student',day:1,start:'10:00',duration:30,repeat:'weekly'};
const key=date+'__legacy-cloud';
const legacy={updatedAt:100,lessons:[lesson,{id:'off-week',name:'Off Week',day:1,start:'13:00',duration:30,repeat:'biweekly',phase:0}],sessionState:{[key]:'entered','2026-09-28__off-week':'entered'},sessionNotes:{[key]:'cloud note'}};
const cases=[];
function check(label,fn){fn();cases.push(label);console.log('PASS '+label)}
function rejected(label,payload){check(label,()=>{const h=harness(),before=h.snapshot();h.receive(payload);assert.deepEqual(h.snapshot(),before)})}

check('genuine Legacy without Domain migrates valid occurrence and rejects off-week',()=>{
 const h=harness();h.receive(legacy);assert.equal(h.context.nativeSyncState,'synced');assert.equal(h.context.lastUpdatedAt,100);assert.equal(h.calls.save,1);
 assert.equal(h.domain.data.records[date+'__historical'].note,'canonical');
 assert.equal(h.domain.data.records[key].status,'entered');assert.equal(h.domain.data.records[key].note,'cloud note');
 assert.equal(h.domain.data.records['2026-09-28__off-week'],undefined);
 assert.equal(h.context.sessionState[key],'entered');assert.equal(h.context.sessionNotes[key],'cloud note')
});
check('complete modern Domain wins over stale mirrors and retains canonical facts',()=>{
 const h=harness(),incoming=fixture().data,canonical=clone(incoming),stale={...legacy,domain:canonical,sessionState:{[date+'__historical']:'missed',[date+'__tombstone']:'entered',orphan:'entered'},sessionNotes:{[date+'__historical']:'stale',orphan:'stale'}};
 h.receive(stale);assert.equal(h.context.nativeSyncState,'synced');assert.equal(h.calls.save,1);
 assert.deepEqual(clone(h.domain.data.records),canonical.records);
 const hist=h.domain.data.records[date+'__historical'];
 assert.deepEqual([hist.status,hist.note,hist.actualMinutes,hist.countOverride,hist.time,hist.duration],['entered','canonical',23,false,'10:00',30]);
 assert.equal(h.domain.data.records[date+'__tombstone'].deleted,true);
 assert.equal(h.domain.data.records[date+'__biweekly'].status,'absent');
 assert.equal(h.domain.resolveScheduleOccurrence('biweekly','2026-09-28'),null);
 assert.equal(h.domain.data.records[key],undefined);
 assert.equal(h.context.sessionState.orphan,undefined);assert.equal(h.context.sessionNotes.orphan,undefined);
 assert.equal(h.context.sessionState[date+'__tombstone'],undefined);
 assert.equal(h.context.sessionNotes[date+'__historical'],'canonical');
 assert.equal(h.domain.data.settings.teacherTimeZone,'Africa/Cairo')
});
rejected('empty Domain object fails closed', {...legacy,domain:{}});
rejected('partial version-4 Domain fails closed', {...legacy,domain:{version:4,settings:{teacherTimeZone:'Africa/Cairo'}}});
rejected('version-4 Domain missing records fails closed', {...legacy,domain:{...clone(fixture().data),records:undefined}});
rejected('version-4 Domain missing activity fails closed', {...legacy,domain:{...clone(fixture().data),activity:undefined}});
rejected('malformed Domain array fails closed', {...legacy,domain:[]});
rejected('malformed Domain records map fails closed', {...legacy,domain:{...clone(fixture().data),records:[]}});
rejected('malformed null canonical record fails closed', {...legacy,domain:{...clone(fixture().data),records:{broken:null}}});
rejected('malformed schedule revision fails closed', {...legacy,domain:{...clone(fixture().data),schedules:{broken:[null]}}});
rejected('malformed Domain version fails closed', {...legacy,domain:{...clone(fixture().data),version:'4'}});
rejected('invalid teacher timezone fails before any state mutation', {...legacy,domain:{...clone(fixture().data),settings:{teacherTimeZone:'Invalid/Zone'}}});
rejected('invalid timestamp fails closed', {...legacy,updatedAt:'not-a-time'});
console.log('CLOUD HYDRATION RECEIVER REGRESSION PASS: '+cases.length+'/'+cases.length);
