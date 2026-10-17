const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(process.env.MIAAD_ASSET_ROOT||path.join(__dirname,'../app/src/main/assets'));
const {createMiaadDomain,MiaadTemporal}=require(path.join(root,'app-domain.js'));
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
 const context={window:null,domain,MiaadTemporal,lastUpdatedAt:1,lessons:[{id:'local'}],sessionState:{local:'entered'},sessionNotes:{local:'note'},sessionAudit:{a:1},idrisPhase:3,nativeSyncState:'cloud-ready',
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

// V1R3: exercise the real Cloud receiver (not only a duplicate classifier).
function settingsRejected(label,edit){
 invalidDomain(label,v=>edit(v.settings))
}
function settingsAccepted(label,edit,verify=()=>{}){
 check(label,()=>{
  const h=harness(),incoming=fixture().data;
  edit(incoming.settings);
  const p={...legacy,domain:clone(incoming),sessionState:{stale:'missed'},sessionNotes:{stale:'old'}};
  assert.equal(h.context.classifyCloudDomainPayload(p),'modern');
  h.receive(p);
  assert.equal(h.context.nativeSyncState,'synced');
  assert.equal(h.context.lastUpdatedAt,100);
  assert.deepEqual(h.calls,{save:1,render:1,toast:1});
  assert.deepEqual(clone(h.domain.data.records),clone(incoming.records));
  assert.deepEqual(clone(h.domain.data.schedules),clone(incoming.schedules));
  assert.equal(h.domain.data.records[date+'__tombstone'].deleted,true);
  assert.equal(h.context.sessionState.stale,undefined);
  assert.equal(h.context.sessionNotes.stale,undefined);
  assert.doesNotThrow(()=>h.domain.availability(date));
  assert.doesNotThrow(()=>h.domain.availability('2026-09-22'));
  verify(h)
 })
}
const invalidSettings=[
 ['working null',s=>s.working=null],
 ['blocked null',s=>s.blocked=null],
 ['working array',s=>s.working=[]],
 ['working scalar',s=>s.working='bad'],
 ['working unexpected weekday',s=>s.working={'7':[['12:00','13:00']]}],
 ['working day not an array',s=>s.working={'1':{}}],
 ['working day null',s=>s.working={'1':null}],
 ['working pair null',s=>s.working={'1':[null]}],
 ['working pair not an array',s=>s.working={'1':[{start:'10:00',end:'12:00'}]}],
 ['working pair wrong length',s=>s.working={'1':[['10:00']]}],
 ['working start 24:00',s=>s.working={'1':[['24:00','01:00']]}],
 ['working end 24:01',s=>s.working={'1':[['23:00','24:01']]}],
 ['working end 24:00:00',s=>s.working={'1':[['23:00','24:00:00']]}],
 ['working identical times',s=>s.working={'1':[['10:00','10:00']]}],
 ['working invalid minute',s=>s.working={'1':[['12:60','13:00']]}],
 ['blocked map',s=>s.blocked={}],
 ['blocked null item',s=>s.blocked=[null]],
 ['blocked missing end',s=>s.blocked=[{day:1,start:'12:00'}]],
 ['blocked missing day/date',s=>s.blocked=[{start:'12:00',end:'13:00'}]],
 ['blocked invalid civil date',s=>s.blocked=[{date:'2026-02-30',start:'12:00',end:'13:00'}]],
 ['blocked invalid leap day',s=>s.blocked=[{date:'2025-02-29',start:'12:00',end:'13:00'}]],
 ['blocked weekday 7',s=>s.blocked=[{day:7,start:'12:00',end:'13:00'}]],
 ['blocked weekday string',s=>s.blocked=[{day:'1',start:'12:00',end:'13:00'}]],
 ['blocked invalid date alongside valid day',s=>s.blocked=[{date:'2026-02-30',day:1,start:'12:00',end:'13:00'}]],
 ['blocked 24:00 as start',s=>s.blocked=[{day:1,start:'24:00',end:'01:00'}]],
 ['blocked 24:01 as end',s=>s.blocked=[{day:1,start:'23:00',end:'24:01'}]],
 ['notifications null',s=>s.notifications=null],
 ['notifications dailyTime 24:00',s=>s.notifications={dailyTime:'24:00'}],
 ['rules null',s=>s.rules=null],
 ['negative buffer',s=>s.buffer=-1],
 ['zero minSlot',s=>s.minSlot=0]
];
for(const [label,edit] of invalidSettings)settingsRejected('V1R3 reject '+label+' without mutations',edit);
settingsAccepted('V1R3 valid full settings',()=>{});
settingsAccepted('V1R3 optional working omitted',s=>{delete s.working},h=>assert.ok(h.domain.data.settings.working[1]));
settingsAccepted('V1R3 optional blocked omitted',s=>{delete s.blocked},h=>assert.deepEqual(h.domain.data.settings.blocked,[]));
settingsAccepted('V1R3 working and blocked omitted',s=>{delete s.working;delete s.blocked});
settingsAccepted('V1R3 partial working weekday and day off',s=>{s.working={'1':[]}},h=>assert.deepEqual(h.domain.availability(date),[]));
settingsAccepted('V1R3 end 24:00 is allowed',s=>{s.working={'1':[['00:00','24:00']]}});
settingsAccepted('V1R3 overnight working is allowed',s=>{s.working={'1':[['23:00','01:30']]}},h=>assert.ok(h.domain.availability('2026-09-22').some(w=>w.start===0&&w.end>=90)));
settingsAccepted('V1R3 overnight blocked date is allowed',s=>{s.blocked=[{date, start:'23:00',end:'01:30'}]},h=>assert.ok(h.domain.availability('2026-09-22').every(w=>w.start>=90)));
settingsAccepted('V1R3 blocked weekday with 24:00 end',s=>{s.blocked=[{day:1,start:'23:00',end:'24:00'}]});
settingsAccepted('V1R3 real leap day is valid',s=>{s.blocked=[{date:'2028-02-29',start:'09:00',end:'10:00'}]});
settingsAccepted('V1R3 omitted rules',s=>{delete s.rules});
settingsAccepted('V1R3 omitted notifications',s=>{delete s.notifications});
settingsAccepted('V1R3 partial notifications defaults',s=>{s.notifications={daily:true}},h=>assert.equal(h.domain.data.settings.notifications.dailyTime,'08:00'));
settingsAccepted('V1R3 empty timezone falls back to existing valid IANA',s=>{s.teacherTimeZone=''},h=>assert.equal(h.domain.data.settings.teacherTimeZone,'Africa/Cairo'));
settingsAccepted('V1R3 valid numeric-string duration from older v4',s=>{s.duration='30'},h=>assert.equal(h.domain.data.settings.duration,'30'));


// V1R4 Boolean contract derives from Domain defaults + actual settings UI writers.
// Test both top-level and per-student custom overrides: exact booleans, omissions,
// and every malformed JSON type. Receiver snapshots include all mirrors/UI effects.
const v1r4Rules=['entered','absent','student_cancelled','missed','notheld','rescheduled','makeup'];
const v1r4Notifications=['upcoming','cycle','period','pending','daily','availability'];
const v1r4Fields=['autoCycle','autoPeriod','showNotes',...v1r4Rules.map(k=>'rules.'+k),...v1r4Notifications.map(k=>'notifications.'+k)];
const v1r4Bad=[['null',null],['string true','true'],['string false','false'],['zero',0],['one',1],['array',[]],['object',{}]];
function v1r4Settings(domainValue,scope){
 if(scope==='global')return domainValue.settings;
 domainValue.students.student.custom=true;
 return domainValue.students.student.settings;
}
function v1r4Set(settings,field,value){
 const [outer,inner]=field.split('.');
 if(inner){settings[outer]??={};settings[outer][inner]=value}
 else settings[outer]=value
}
function v1r4Delete(settings,field){
 const [outer,inner]=field.split('.');
 if(inner){if(settings[outer])delete settings[outer][inner]}
 else delete settings[outer]
}
function v1r4Send(h,incoming){
 const payload={...legacy,domain:incoming,sessionState:{stale:'absent'},sessionNotes:{stale:'wrong'}};
 const classification=h.context.classifyCloudDomainPayload(payload);
 h.receive(payload);
 return classification
}
for(const scope of ['global','student'])for(const field of v1r4Fields)for(const [kind,bad] of v1r4Bad){
 check('V1R4 rejects '+scope+' '+field+' '+kind+' without state or UI mutation',()=>{
  const h=harness(),before=h.snapshot(),incoming=clone(fixture().data);
  v1r4Set(v1r4Settings(incoming,scope),field,bad);
  assert.equal(v1r4Send(h,incoming),'invalid');
  assert.deepEqual(h.snapshot(),before)
 })
}
for(const scope of ['global','student'])for(const field of v1r4Fields)for(const value of [true,false]){
 check('V1R4 accepts '+scope+' '+field+' '+value+' with real consumer',()=>{
  const h=harness(),incoming=clone(fixture().data);
  v1r4Set(v1r4Settings(incoming,scope),field,value);
  assert.equal(v1r4Send(h,incoming),'modern');
  assert.equal(h.context.nativeSyncState,'synced');
  assert.equal(h.context.lastUpdatedAt,100);
  assert.deepEqual(h.calls,{save:1,render:1,toast:1});
  assert.deepEqual(clone(h.domain.data.records),clone(incoming.records));
  assert.deepEqual(clone(h.domain.data.schedules),clone(incoming.schedules));
  const [a,b]=field.split('.'),prefs=h.domain.prefs('student');
  assert.equal(b?prefs[a][b]:prefs[a],value);
  if(a==='rules')assert.equal(h.domain.counts({studentId:'student',status:b,deleted:false}),value)
 })
}
for(const scope of ['global','student'])for(const field of v1r4Fields){
 check('V1R4 preserves optional v4 omission '+scope+' '+field,()=>{
  const h=harness(),incoming=clone(fixture().data);
  v1r4Delete(v1r4Settings(incoming,scope),field);
  assert.equal(v1r4Send(h,incoming),'modern');
  assert.doesNotThrow(()=>h.domain.availability(date));
  const [a,b]=field.split('.'),prefs=h.domain.prefs('student');
  assert.equal(typeof (b?prefs[a][b]:prefs[a]),'boolean')
 })
}
for(const enabled of [false,true]){
 check('V1R4 consumer autoCycle '+enabled,()=>{
  const h=harness(),incoming=clone(fixture().data);
  incoming.settings.autoCycle=enabled;incoming.settings.target=1;
  assert.equal(v1r4Send(h,incoming),'modern');
  h.domain.notifications();
  assert.equal(Object.keys(h.domain.data.cycles).length,enabled?2:1)
 });
 check('V1R4 consumer student autoCycle '+enabled,()=>{
  const h=harness(),incoming=clone(fixture().data);
  incoming.students.student.custom=true;
  incoming.students.student.settings={autoCycle:enabled,target:1};
  assert.equal(v1r4Send(h,incoming),'modern');
  h.domain.notifications();
  assert.equal(Object.keys(h.domain.data.cycles).length,enabled?2:1)
 });
 check('V1R4 consumer autoPeriod '+enabled,()=>{
  const h=harness(),incoming=clone(fixture().data);
  incoming.settings.autoPeriod=enabled;
  assert.equal(v1r4Send(h,incoming),'modern');
  h.domain.createPeriod('student','2026-09-01','2026-09-20');
  h.domain.notifications();
  assert.equal(Object.keys(h.domain.data.periods).length,enabled?2:1)
 });
 check('V1R4 consumer archived showNotes '+enabled,()=>{
  const h=harness(),incoming=clone(fixture().data);
  incoming.settings.showNotes=enabled;
  assert.equal(v1r4Send(h,incoming),'modern');
  const p=h.domain.createPeriod('student','2026-09-01','2026-09-30');
  assert.equal(h.domain.archive(p).showNotes,enabled)
 });
 for(const key of v1r4Notifications){
  check('V1R4 actual notification '+key+' '+enabled,()=>{
   const h=harness(),incoming=clone(fixture().data);
   incoming.settings.notifications[key]=enabled;
   if(key==='cycle')incoming.settings.target=1;
   assert.equal(v1r4Send(h,incoming),'modern');
   if(key==='period')h.domain.createPeriod('student','2026-09-01','2026-09-20');
   if(key==='availability'){h.domain.data.availabilityDate=date;h.domain.data.availabilityFingerprint='different'}
   if(key==='pending')h.domain.saveSchedule({id:'earlier',studentId:'student',name:'Student',day:1,start:'08:00',duration:30,repeat:'weekly'},date);
   if(key==='upcoming')h.domain.saveSchedule({id:'soon',studentId:'student',name:'Student',day:1,start:'15:30',duration:30,repeat:'weekly',reminder:60},date);
   const notices=h.domain.notifications(),seen=notices.some(n=>n.type===key&&(key==='daily'||key==='availability'||n.studentId==='student'));
   assert.equal(seen,enabled)
  })
 }
}
check('V1R4 accepts older partial Boolean settings and operates Domain',()=>{
 const h=harness(),incoming=clone(fixture().data);
 for(const field of v1r4Fields)v1r4Delete(incoming.settings,field);
 incoming.students.student.custom=true;incoming.students.student.settings={};
 assert.equal(v1r4Send(h,incoming),'modern');
 assert.doesNotThrow(()=>h.domain.notifications());
 assert.equal(h.domain.prefs('student').rules.entered,true);
 // The historical fixture has an explicit countOverride:false: never erase it.
 assert.equal(h.domain.counts(h.domain.data.records[date+'__historical']),false);
 assert.equal(h.domain.counts({studentId:'student',status:'entered',deleted:false}),true)
});


// V1R5 — systematic Domain v4 settings contract, checked through the actual
// Cloud receiver and Domain. The 420 frozen V1R4 tests above remain untouched.
const contractScalars={
 target:{bad:[null,'bad',0,-1,1.5,'0','-2','1.5',[],{},true],good:[1,12,'15']},
 duration:{bad:[null,'bad',0,-1,1.5,'0','-2',[],{},true],good:[1,45,'30']},
 minSlot:{bad:[null,'bad',0,-1,1.5,'0','-2',[],{},true],good:[1,30,'45']},
 buffer:{bad:[null,'bad',-1,'-1',' ',[],{},true],good:[0,7,'2.5',2.5]},
 periodDay:{bad:[null,'bad',0,32,-1,1.5,'0','32',[],{},true],good:[1,15,31,'15']},
 periodMode:{bad:[null,'bad','weekly','',0,[],{},false],good:['calendar','monthly','custom']},
 language:{bad:[null,'zz','',0,[],{},true],good:['ar','en']},
 teacherTimeZone:{bad:[null,'Invalid/Zone',0,[],{},true],good:['UTC','Africa/Cairo','']}
};
const malformedSettings={
 working:[null,[],{'1':null},{'1':[['24:00','01:00']]},{'1':[['11:00','11:00']]}],
 blocked:[null,{},[null],[{date:'2026-02-30',start:'12:00',end:'13:00'}],[{day:7,start:'10:00',end:'11:00'}]],
 rules:[null,[],{entered:null},{entered:'false'}],
 notifications:[null,[],{dailyTime:'24:00'},{upcoming:'false'}]
};
const contractClone=x=>JSON.parse(JSON.stringify(x));
const contractScopes=['global','student'];
function contractSettings(v,scope){
 if(scope==='global')return v.settings;
 v.students.student.custom=true;
 v.students.student.settings??={};
 return v.students.student.settings;
}
function contractRejected(label,scope,key,bad){
 invalidDomain('V1R5 no mutation '+label+' / '+scope,v=>{contractSettings(v,scope)[key]=contractClone(bad)})
}
function contractAccepted(label,scope,key,value,verify=()=>{}){
 check('V1R5 accept '+label+' / '+scope,()=>{
  const h=harness(),incoming=contractClone(fixture().data);
  contractSettings(incoming,scope)[key]=contractClone(value);
  const p={...legacy,domain:incoming};
  assert.equal(h.context.classifyCloudDomainPayload(p),'modern');
  h.receive(p);
  assert.equal(h.context.nativeSyncState,'synced');
  assert.equal(h.context.lastUpdatedAt,100);
  assert.deepEqual(h.calls,{save:1,render:1,toast:1});
  assert.deepEqual(contractClone(h.domain.data.records),contractClone(incoming.records));
  assert.deepEqual(contractClone(h.domain.data.schedules),contractClone(incoming.schedules));
  assert.equal(h.domain.data.records[date+'__tombstone'].deleted,true);
  assert.doesNotThrow(()=>h.domain.availability(date));
  assert.doesNotThrow(()=>h.domain.notifications());
  const pr=h.domain.prefs('student');
  if(key==='notifications'&&scope==='student'){
   for(const [k,val] of Object.entries(value))assert.deepEqual(pr.notifications[k],val)
  }else if(key==='teacherTimeZone'&&value===''&&scope==='global'){
   assert.equal(pr.teacherTimeZone,'Africa/Cairo')
  }else assert.deepEqual(contractClone(pr[key]),contractClone(scope==='global'?h.domain.data.settings[key]:value));
  verify(h,pr)
 })
}
for(const scope of contractScopes){
 for(const [key,spec] of Object.entries(contractScalars)){
  for(const [i,bad] of spec.bad.entries())contractRejected(key+' invalid '+i,scope,key,bad);
  for(const [i,good] of spec.good.entries())contractAccepted(key+' valid '+i,scope,key,good,(h,p)=>{
   if(key==='target')assert.equal(h.domain.cycle('student').target,p.target);
   if(key==='periodMode'||key==='periodDay')assert.doesNotThrow(()=>h.domain.period('student'));
   if(key==='language')assert.ok(['ar','en'].includes(p.language));
   if(key==='teacherTimeZone'&&scope==='global')assert.ok(h.domain.validTimeZone(h.domain.teacherZone()));
   if(key==='buffer'&&scope==='global')assert.doesNotThrow(()=>h.domain.schedulingConflict(date,14*60,30));
  });
  check('V1R5 omitted '+scope+' '+key,()=>{
   const h=harness(),incoming=contractClone(fixture().data);
   delete contractSettings(incoming,scope)[key];
   const p={...legacy,domain:incoming};
   assert.equal(h.context.classifyCloudDomainPayload(p),'modern');
   h.receive(p);
   assert.equal(h.context.nativeSyncState,'synced');
   assert.doesNotThrow(()=>h.domain.notifications())
  })
 }
 for(const [key,bads] of Object.entries(malformedSettings)){
  for(const [i,bad] of bads.entries())contractRejected(key+' nested invalid '+i,scope,key,bad)
 }
}
for(const scope of contractScopes)for(const target of [null,'bad',0])for(const auto of [false,true]){
 invalidDomain('V1R5 cross invalid target '+JSON.stringify(target)+' auto='+auto+' scope='+scope,v=>{
  const s=contractSettings(v,scope);s.target=target;s.autoCycle=auto
 })
}
for(const scope of contractScopes)for(const target of [1,'1'])for(const enabled of [false,true]){
 check('V1R5 counted cycle '+scope+' target='+target+' auto='+enabled,()=>{
  const h=harness(),incoming=contractClone(fixture().data),s=contractSettings(incoming,scope);
  s.target=target;s.autoCycle=enabled;
  const p={...legacy,domain:incoming};
  assert.equal(h.context.classifyCloudDomainPayload(p),'modern');h.receive(p);
  const eligible=h.domain.data.records[date+'__historical'];
  assert.equal(eligible.countOverride,false);
  assert.equal(h.domain.counts({...eligible,countOverride:null}),true);
  h.domain.record({studentId:'student',date:'2026-09-20',time:'16:00',duration:30,status:'entered',countOverride:null});
  h.domain.notifications();
  assert.equal(Object.keys(h.domain.data.cycles).length,enabled?2:1)
 })
}
for(const scope of contractScopes){
 contractAccepted('monthly period with midmonth boundary',scope,'periodMode','monthly',(h)=>{
  const p=h.domain.period('student');assert.equal(p.mode,'monthly');assert.equal(p.end,'2026-09-30')
 });
 contractAccepted('valid overnight working',scope,'working',{'1':[['23:00','01:30']]},h=>{
  if(scope==='global')assert.ok(h.domain.availability('2026-09-22').some(w=>w.start===0))
 });
 contractAccepted('valid overnight block',scope,'blocked',[{date:'2026-09-21',start:'23:00',end:'01:30'}]);
 contractAccepted('daily notification valid time',scope,'notifications',{daily:true,dailyTime:'08:00'})
}
let contractSeed=0x1c05;
const seededRandom=()=>((contractSeed=(Math.imul(contractSeed,1664525)+1013904223)>>>0)/4294967296);
for(let i=0;i<48;i++){
 const scope=contractScopes[Math.floor(seededRandom()*2)];
 const fields=['target','duration','minSlot','periodDay'];
 const key=fields[Math.floor(seededRandom()*fields.length)];
 const n=[0,-1,1.5,32.5,'NaN'][Math.floor(seededRandom()*5)];
 contractRejected('seed=0x1c05 mutation='+i+' '+key,scope,key,n)
}

console.log('CLOUD HYDRATION RECEIVER REGRESSION PASS: '+cases.length+'/'+cases.length);
