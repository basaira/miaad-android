const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(process.env.MIAAD_ASSET_ROOT||path.join(__dirname,'../app/src/main/assets'));
const {createMiaadDomain}=require(path.join(root,'app-domain.js'));
const core=fs.readFileSync(path.join(root,'app-core.js'),'utf8');
const integration=fs.readFileSync(path.join(root,'app-integration.js'),'utf8');
const start=core.indexOf('function cloudCivilDate(');
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
function invalidDomain(label,mutate){const value=clone(fixture().data);mutate(value);const payload={...legacy,domain:value};check(label,()=>{const h=harness(),before=h.snapshot();assert.equal(h.context.classifyCloudDomainPayload(payload),'invalid');h.receive(payload);assert.deepEqual(h.snapshot(),before)})}

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
check('real deleteSchedule tombstone hydrates with historical revision, standalone record and archive',()=>{
 const incoming=fixture();
 incoming.importLegacySchedule({id:'deleted',studentId:'student',name:'Student',day:1,start:'14:00',duration:30,repeat:'weekly'});
 const prior=incoming.resolveScheduleOccurrence('deleted','2026-09-14');
 const standalone=incoming.record({studentId:'student',date:'2026-09-20',time:'16:00',duration:35,status:'entered',note:'independent past',countOverride:true});
 const archive=incoming.createPeriod('student','2026-09-01','2026-09-30');incoming.archive(archive);
 incoming.deleteSchedule('deleted');
 assert.equal(incoming.data.schedules.deleted[0].from,'0001-01-01');
 assert.equal(incoming.data.schedules.deleted[1].lesson,null);
 const h=harness();h.receive({...legacy,domain:clone(incoming.data),sessionState:{[prior.id]:'absent',[standalone.id]:'missed'}});
 assert.equal(h.context.nativeSyncState,'synced');assert.equal(h.context.lastUpdatedAt,100);assert.equal(h.calls.save,1);
 assert.deepEqual(clone(h.domain.data.schedules.deleted),clone(incoming.data.schedules.deleted));
 assert.deepEqual(clone(h.domain.data.records),clone(incoming.data.records));
 assert.deepEqual(clone(h.domain.data.periods[archive.id]),clone(incoming.data.periods[archive.id]));
 assert.equal(h.domain.resolveScheduleOccurrence('deleted','2026-09-14').id,prior.id);
 assert.equal(h.domain.resolveScheduleOccurrence('deleted','2026-09-21'),null);
 assert.equal(h.domain.data.records[standalone.id].scheduleId,undefined);
 assert.equal(h.context.sessionState[standalone.id],'entered');
 const reloaded=createMiaadDomain(clone(h.domain.data),{},clock,{migrateLegacy:false});
 assert.deepEqual(clone(reloaded.data.schedules.deleted),clone(incoming.data.schedules.deleted));
 assert.equal(reloaded.resolveScheduleOccurrence('deleted','2026-09-21'),null);
 assert.equal(reloaded.data.records[standalone.id].note,'independent past')
});
check('historical numeric-string schedule duration and optional student settings remain compatible',()=>{
 const incoming=fixture();
 incoming.saveStudent({id:'optional',name:'Optional Student',startDate:'2026-09-01',custom:false});
 incoming.saveSchedule({id:'numeric-string',studentId:'optional',name:'Optional Student',day:1,start:'17:00',duration:'30',repeat:'weekly'},date);
 const h=harness();h.receive({...legacy,domain:clone(incoming.data)});
 assert.equal(h.context.nativeSyncState,'synced');
 assert.equal(h.domain.data.schedules['numeric-string'][0].lesson.duration,'30');
 assert.equal(h.domain.data.students.optional.settings,undefined)
});
invalidDomain('empty canonical record rejected before mutation',v=>{v.records={'bad':{}}});
invalidDomain('empty canonical student rejected before mutation',v=>{v.students={'bad':{}}});
invalidDomain('record identity mismatch rejected',v=>{v.records['2026-09-21__historical'].id='elsewhere'});
invalidDomain('record with invalid civil date rejected',v=>{v.records['2026-09-21__historical'].date='2026-02-30'});
invalidDomain('record with unknown status rejected',v=>{v.records['2026-09-21__historical'].status='unknown'});
invalidDomain('record without duration rejected',v=>{delete v.records['2026-09-21__historical'].duration});
invalidDomain('record with missing student rejected',v=>{v.records['2026-09-21__historical'].studentId='missing'});
invalidDomain('record with invalid optional countOverride rejected',v=>{v.records['2026-09-21__historical'].countOverride='yes'});
invalidDomain('record with invalid optional actualMinutes rejected',v=>{v.records['2026-09-21__historical'].actualMinutes=-1});
invalidDomain('student identity mismatch rejected',v=>{v.students.student.id='elsewhere'});
invalidDomain('student without name rejected',v=>{v.students.student.name=''});
invalidDomain('student with invalid start date rejected',v=>{v.students.student.startDate='2026-02-30'});
invalidDomain('schedule deletion with invalid effective date rejected',v=>{v.schedules.historical.push({from:'2026-02-30',lesson:null})});
invalidDomain('out-of-order schedule revisions rejected',v=>{v.schedules.historical.reverse()});
invalidDomain('empty schedule revision list rejected',v=>{v.schedules.historical=[]});
invalidDomain('schedule revision with wrong lesson identity rejected',v=>{v.schedules.historical[0].lesson.id='wrong'});
invalidDomain('schedule revision with missing student rejected',v=>{v.schedules.historical[0].lesson.studentId='missing'});
invalidDomain('schedule revision with null duration rejected',v=>{v.schedules.historical[0].lesson.duration=null});
console.log('CLOUD HYDRATION RECEIVER REGRESSION PASS: '+cases.length+'/'+cases.length);
