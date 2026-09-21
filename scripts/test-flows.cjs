const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright'),path=require('path'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'}),context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
await page.addInitScript(()=>{delete Array.prototype.at;const OriginalDate=Date;window.Date=class extends OriginalDate{constructor(...args){super(...(args.length?args:['2026-09-15T10:00:00']))}static now(){return +new OriginalDate('2026-09-15T10:00:00')}};if(!localStorage.getItem('test-seeded')){localStorage.setItem('miadLessonsV2',JSON.stringify([{id:'existing',name:'طالب محفوظ',day:2,start:'17:00',duration:30,repeat:'weekly',reminder:20},{id:'bi-review',name:'طالب محفوظ',day:1,start:'11:00',duration:30,repeat:'biweekly',reminder:20,note:'phase-note'}]));localStorage.setItem('miadSessionStateV2',JSON.stringify({'2026-09-08__existing':'entered'}));localStorage.setItem('miadSessionNotesV2',JSON.stringify({'2026-09-08__existing':'ملاحظة محفوظة'}));localStorage.setItem('test-seeded','1')}});
const assetRoot=path.resolve(process.env.MIAAD_ASSET_ROOT||path.join(__dirname,'../app/src/main/assets'));await page.goto('file:///'+path.join(assetRoot,'index.html').replaceAll('\\','/'));
await page.locator('[data-view="students"]').click();await page.locator('[data-student]').click();await page.locator('[data-schedule="existing"]').click();await page.locator('#fStart').fill('18:00');await page.locator('#fDuration').fill('45');await page.locator('#saveLesson').click();
assert.deepEqual(await page.evaluate(()=>domain.occurrences('2026-09-08').map(r=>[r.time,r.duration,r.note])),[['17:00',30,'ملاحظة محفوظة']]);assert.equal(await page.evaluate(()=>domain.occurrences('2026-09-22').find(r=>r.scheduleId==='existing').time),'18:00');
// Phase-0 control through the real recurring editor: changing reminder must not change alternating weeks.
await page.locator('[data-schedule="bi-review"]').click();await page.locator('#fReminder').selectOption('30');await page.locator('#saveLesson').click();
assert.deepEqual(await page.evaluate(()=>(()=>{const l=domain.versionAt('bi-review',domain.teacherNow().date);return[l.phase,lessons.find(x=>x.id==='bi-review').phase,domain.occurrences('2026-09-21').some(r=>r.scheduleId==='bi-review'),domain.occurrences('2026-09-28').some(r=>r.scheduleId==='bi-review'),domain.versionAt('bi-review','2026-09-08').phase,domain.data.schedules['bi-review'].length]})()),[0,0,true,false,0,2]);
// Establish phase 1 through the actual shipping phase-toggle mechanism.
await page.locator('[data-view="settings"]').click();await page.locator('#toggleIdrisPhase').click();
assert.deepEqual(await page.evaluate(()=>(()=>{const l=domain.versionAt('bi-review',domain.teacherNow().date);return[idrisPhase,l.phase,lessons.find(x=>x.id==='bi-review').phase,domain.occurrences('2026-09-21').some(r=>r.scheduleId==='bi-review'),domain.occurrences('2026-09-28').some(r=>r.scheduleId==='bi-review'),domain.data.schedules['bi-review'].length]})()),[1,1,1,false,true,2]);
// Mandatory regression: duration-only edit must preserve phase 1 and the same alternating dates.
await page.locator('[data-view="students"]').click();await page.locator('[data-schedule="bi-review"]').click();await page.locator('#fDuration').fill('45');await page.locator('#saveLesson').click();
assert.deepEqual(await page.evaluate(()=>(()=>{const l=domain.versionAt('bi-review',domain.teacherNow().date);return[l.phase,lessons.find(x=>x.id==='bi-review').phase,l.duration,domain.occurrences('2026-09-21').some(r=>r.scheduleId==='bi-review'),domain.occurrences('2026-09-28').some(r=>r.scheduleId==='bi-review'),domain.versionAt('bi-review','2026-09-08').phase,domain.data.schedules['bi-review'].length]})()),[1,1,45,false,true,0,2]);
// Other exposed recurrence edits must not mutate the unexposed authoritative phase.
for(const [selector,value,kind] of [['#fStart','11:15','fill'],['#fNote','phase-one-note','fill'],['#fMaxDuration','60','fill']]){await page.locator('[data-schedule="bi-review"]').click();if(kind==='fill')await page.locator(selector).fill(value);await page.locator('#saveLesson').click();assert.equal(await page.evaluate(()=>domain.versionAt('bi-review',domain.teacherNow().date).phase),1);assert.equal(await page.evaluate(()=>lessons.find(x=>x.id==='bi-review').phase),1);assert.equal(await page.evaluate(()=>domain.data.schedules['bi-review'].length),2)}
assert.equal(await page.evaluate(()=>[0,1].includes(domain.versionAt('bi-review',domain.teacherNow().date).phase)),true);

// Phase 1C C1: authoritative record must defeat deliberately stale compatibility mirrors in the real recurring editor.
await page.evaluate(()=>{const r=domain.resolveScheduleOccurrence('existing','2026-09-15');domain.record({...r,status:'entered',note:'canonical-occurrence',actualMinutes:23,countOverride:false});sessionState[r.id]='absent';sessionNotes[r.id]='stale-legacy-note';saveLocalState();openSheetWithContext(lessons.find(x=>x.id==='existing'),domain.parse('2026-09-15'),'occurrence')});
assert.equal(await page.locator('#sessionStatePicker button.active').getAttribute('data-state'),'entered');
assert.equal(await page.locator('#fSessionNote').inputValue(),'canonical-occurrence');
await page.locator('#fReminder').selectOption('30');await page.locator('#saveLesson').click();
assert.deepEqual(await page.evaluate(()=>{const r=domain.data.records['2026-09-15__existing'];return[r.status,r.note,r.actualMinutes,r.countOverride,sessionState[r.id],sessionNotes[r.id]]}),['entered','canonical-occurrence',23,false,'entered','canonical-occurrence']);
await page.reload();
assert.deepEqual(await page.evaluate(()=>{const r=domain.data.records['2026-09-15__existing'];return[r.status,r.note,r.actualMinutes,r.countOverride,sessionState[r.id],sessionNotes[r.id]]}),['entered','canonical-occurrence',23,false,'entered','canonical-occurrence']);

// Phase 1C C2 real-D: explicit calendar provenance may create exactly the proven occurrence record.
await page.evaluate(()=>openSheetWithContext(null,domain.parse('2026-09-15'),'calendar'));
await page.locator('#editId').evaluate(el=>el.value='ui-real');await page.locator('#fName').fill('Calendar Real');await page.locator('#fDay').selectOption('2');await page.locator('#fStart').fill('20:00');await page.locator('#fRepeat').selectOption('weekly');await page.locator('#sessionStatePicker button[data-state="entered"]').click();await page.locator('#fSessionNote').fill('real-occurrence-note');await page.locator('#saveLesson').click();
assert.deepEqual(await page.evaluate(()=>{const rows=Object.values(domain.data.records).filter(r=>r.id==='2026-09-15__ui-real');return[rows.length,rows[0]?.status,rows[0]?.note,sessionState['2026-09-15__ui-real'],sessionNotes['2026-09-15__ui-real']]}),[1,'entered','real-occurrence-note','entered','real-occurrence-note']);
await page.reload();assert.equal(await page.evaluate(()=>domain.data.records['2026-09-15__ui-real']?.status),'entered');

// Phase 1C C2 invalid-D: wrong weekday rolls back schedule and occurrence atomically.
await page.evaluate(()=>openSheetWithContext(null,domain.parse('2026-09-15'),'calendar'));
await page.locator('#editId').evaluate(el=>el.value='ui-invalid-weekday');await page.locator('#fName').fill('Invalid Weekday');await page.locator('#fDay').selectOption('3');await page.locator('#fStart').fill('21:00');await page.locator('#fRepeat').selectOption('weekly');await page.locator('#sessionStatePicker button[data-state="entered"]').click();await page.locator('#saveLesson').click();
assert.deepEqual(await page.evaluate(()=>[domain.data.schedules['ui-invalid-weekday'],domain.data.records['2026-09-15__ui-invalid-weekday'],sessionState['2026-09-15__ui-invalid-weekday'],sessionNotes['2026-09-15__ui-invalid-weekday']]),[undefined,undefined,undefined,undefined]);
await page.evaluate(()=>closeSheet(true));

// Phase 1C C2 invalid-D: matching weekday but wrong biweekly phase also rolls back, including note-only intent.
await page.evaluate(()=>openSheetWithContext(null,domain.parse('2026-09-28'),'calendar'));
await page.locator('#editId').evaluate(el=>el.value='ui-invalid-phase');await page.locator('#fName').fill('Invalid Phase');await page.locator('#fDay').selectOption('1');await page.locator('#fStart').fill('21:30');await page.locator('#fRepeat').selectOption('biweekly');await page.locator('#fSessionNote').fill('must-not-survive');await page.locator('#saveLesson').click();
assert.deepEqual(await page.evaluate(()=>[domain.data.schedules['ui-invalid-phase'],domain.data.records['2026-09-28__ui-invalid-phase'],sessionState['2026-09-28__ui-invalid-phase'],sessionNotes['2026-09-28__ui-invalid-phase']]),[undefined,undefined,undefined,undefined]);
await page.evaluate(()=>closeSheet(true));

// Schedule-only context exposes no implicit occurrence authority.
await page.evaluate(()=>openSheetWithContext(null,selectedDate,'schedule'));
assert.equal(await page.locator('#fSessionNote').isDisabled(),true);assert.equal(await page.locator('#sessionStatePicker button').first().isDisabled(),true);
await page.locator('#editId').evaluate(el=>el.value='ui-generic');await page.locator('#fName').fill('Generic Schedule');await page.locator('#fDay').selectOption('2');await page.locator('#fStart').fill('22:00');await page.locator('#saveLesson').click();
assert.deepEqual(await page.evaluate(()=>[!!domain.data.schedules['ui-generic'],Object.keys(domain.data.records).some(k=>k.endsWith('__ui-generic'))]),[true,false]);

assert.equal(await page.evaluate(()=>domain.versionAt('existing',domain.teacherNow().date).repeat),'weekly');assert.equal(await page.evaluate(()=>domain.occurrences('2026-09-22').some(r=>r.scheduleId==='existing')),true);assert.equal(await page.evaluate(()=>domain.occurrences('2026-09-29').some(r=>r.scheduleId==='existing')),true);
const existingStudentId=await page.evaluate(()=>domain.versionAt('existing',domain.teacherNow().date).studentId);
await page.locator('[data-view="students"]').click();
const existingStudentCard=page.locator(`[data-student="${existingStudentId}"]`);assert.equal(await existingStudentCard.count(),1);await existingStudentCard.click();
await page.locator('[data-record="2026-09-08__existing"]').click();await page.locator('.record-form [name="status"]').selectOption('student_cancelled');await page.locator('.record-form button:not([type])').click();assert.match(await page.locator('.cycle-progress').innerText(),/0 \/ 12/);
await page.locator('#periodCreate').click();await page.locator('#periodForm [name="operation"]').selectOption('edit');await page.locator('#periodForm [name="mode"]').selectOption('monthly');await page.locator('#periodForm [name="start"]').fill('2026-09-08');await page.locator('#periodForm [name="end"]').fill('2026-10-07');await page.locator('#periodForm button').click();assert.equal(await page.evaluate(()=>domain.period(selectedStudent).end),'2026-10-07');
await page.locator('#periodNext').click();assert.equal(await page.evaluate(()=>domain.period(selectedStudent).end),'2026-11-07');assert.equal(await page.locator('[data-period]').count(),1);
await page.locator('[data-view="settings"]').click();await page.locator('#globalSettings [name="working_2"]').fill('17:30-19:00');await page.locator('#globalSettings [name="minSlot"]').fill('30');await page.locator('#globalSettings button.save-btn').click();assert.deepEqual(await page.evaluate(()=>domain.availability('2026-09-15').map(w=>[w.start,w.end])),[[1050,1080]]);

// Phase 1C Review Fix RF2: actual shipping legacy import may fill only missing proven occurrences.
await page.evaluate(()=>{const sid=domain.studentFor('Legacy import tombstone').id,saved=domain.saveSchedule({id:'legacy-import-tomb',studentId:sid,name:domain.data.students[sid].name,day:2,start:'12:45',duration:30,repeat:'weekly'},domain.teacherNow().date);if(!lessons.some(x=>x.id===saved.id))lessons.push(saved);const r=domain.resolveScheduleOccurrence(saved.id,'2026-09-15');domain.removeRecord(r);refreshLegacyOccurrenceMirrors();persist()});
const legacyImport={
 lessons:[
  {id:'legacy-status-only',name:'Legacy Status Only',day:2,start:'12:00',duration:30,repeat:'weekly'},
  {id:'legacy-note-only',name:'Legacy Note Only',day:2,start:'12:15',duration:30,repeat:'weekly'},
  {id:'legacy-both',name:'Legacy Both',day:2,start:'12:30',duration:30,repeat:'weekly'},
  {id:'legacy-import-tomb',name:'Legacy import tombstone',day:2,start:'12:45',duration:30,repeat:'weekly'},
  {id:'legacy-wrong-day',name:'Legacy Wrong Day',day:3,start:'13:00',duration:30,repeat:'weekly'},
  {id:'legacy-off-phase',name:'Legacy Off Phase',day:2,start:'13:15',duration:30,repeat:'biweekly',phase:0}
 ],
 sessionState:{
  '2026-09-15__existing':'absent',
  '2026-09-15__legacy-status-only':'absent',
  '2026-09-15__legacy-both':'entered',
  '2026-09-15__legacy-import-tomb':'entered',
  '2026-09-15__legacy-wrong-day':'entered',
  '2026-09-15__legacy-off-phase':'entered'
 },
 sessionNotes:{
  '2026-09-15__existing':'stale-import',
  '2026-09-15__legacy-note-only':'important note',
  '2026-09-15__legacy-both':'both note',
  '2026-09-15__legacy-import-tomb':'resurrect',
  '2026-09-15__legacy-wrong-day':'wrong',
  '2026-09-15__legacy-off-phase':'off'
 },
 sessionAudit:{}
};
await page.locator('#importFile').setInputFiles({name:'legacy-rf2.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacyImport))});await page.waitForTimeout(300);
assert.deepEqual(await page.evaluate(()=>(()=>{const existing=domain.data.records['2026-09-15__existing'],tomb=domain.data.records['2026-09-15__legacy-import-tomb'],status=domain.data.records['2026-09-15__legacy-status-only'],note=domain.data.records['2026-09-15__legacy-note-only'],both=domain.data.records['2026-09-15__legacy-both'];return{
 existing:[existing.status,existing.note,existing.actualMinutes,existing.countOverride],
 tomb:[tomb.deleted,sessionState[tomb.id],sessionNotes[tomb.id]],
 status:[status.status,status.note],
 note:[note.status,note.note],
 both:[both.status,both.note],
 wrong:domain.data.records['2026-09-15__legacy-wrong-day'],
 off:domain.data.records['2026-09-15__legacy-off-phase'],
 orphanState:sessionState['2026-09-15__legacy-wrong-day'],
 orphanNote:sessionNotes['2026-09-15__legacy-wrong-day']
}})()),{
 existing:['entered','canonical-occurrence',23,false],
 tomb:[true,undefined,undefined],
 status:['absent',''],
 note:['pending','important note'],
 both:['entered','both note'],
 wrong:undefined,
 off:undefined,
 orphanState:undefined,
 orphanNote:undefined
});


// Phase 1C Review Fix 2 RF3: historical legacy import preserves valid starts for NEW students only.
await page.evaluate(()=>domain.saveStudent({id:'rf3-existing-student',name:'RF3 Existing Student',startDate:'2026-09-10',custom:false,settings:{}}));
const rf3Import={
 lessons:[
  {id:'rf3-status',name:'RF3 New Historical',day:2,start:'13:30',duration:30,repeat:'weekly'},
  {id:'rf3-note',name:'RF3 New Historical',day:2,start:'14:00',duration:30,repeat:'weekly'},
  {id:'rf3-both',name:'RF3 New Historical',day:2,start:'14:30',duration:30,repeat:'weekly'},
  {id:'rf3-wrong',name:'RF3 New Historical',day:3,start:'15:00',duration:30,repeat:'weekly'},
  {id:'rf3-off',name:'RF3 New Historical',day:2,start:'15:30',duration:30,repeat:'biweekly',phase:0},
  {id:'rf3-existing-schedule',name:'RF3 Existing Student',day:2,start:'16:00',duration:30,repeat:'weekly'}
 ],
 sessionState:{
  '2026-09-08__rf3-status':'absent',
  '2026-09-08__rf3-both':'entered',
  '2026-09-01__rf3-wrong':'entered',
  '2026-09-01__rf3-off':'entered',
  '2026-09-08__rf3-existing-schedule':'entered',
  '2026-09-15__existing':'absent',
  '2026-09-15__legacy-import-tomb':'entered'
 },
 sessionNotes:{
  '2026-09-08__rf3-note':'historical note-only',
  '2026-09-08__rf3-both':'historical both',
  '2026-09-01__rf3-wrong':'wrong-day',
  '2026-09-01__rf3-off':'off-phase',
  '2026-09-08__rf3-existing-schedule':'must-not-backdate',
  '2026-09-15__existing':'stale-again',
  '2026-09-15__legacy-import-tomb':'resurrect-again'
 },
 sessionAudit:{}
};
await page.locator('#importFile').setInputFiles({name:'legacy-rf3.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(rf3Import))});await page.waitForTimeout(300);
assert.deepEqual(await page.evaluate(()=>(()=>{const s=Object.values(domain.data.students).find(x=>x.name==='RF3 New Historical'),existingStudent=domain.data.students['rf3-existing-student'],status=domain.data.records['2026-09-08__rf3-status'],note=domain.data.records['2026-09-08__rf3-note'],both=domain.data.records['2026-09-08__rf3-both'],existing=domain.data.records['2026-09-15__existing'],tomb=domain.data.records['2026-09-15__legacy-import-tomb'];return{
 newStart:s.startDate,
 status:[status.status,status.note],
 note:[note.status,note.note],
 both:[both.status,both.note],
 wrong:domain.data.records['2026-09-01__rf3-wrong'],
 off:domain.data.records['2026-09-01__rf3-off'],
 existingStudentStart:existingStudent.startDate,
 preStartRecord:domain.data.records['2026-09-08__rf3-existing-schedule'],
 existing:[existing.status,existing.note,existing.actualMinutes,existing.countOverride],
 tomb:[tomb.deleted,sessionState[tomb.id],sessionNotes[tomb.id]]
}})()),{
 newStart:'2026-09-08',
 status:['absent',''],
 note:['pending','historical note-only'],
 both:['entered','historical both'],
 wrong:undefined,
 off:undefined,
 existingStudentStart:'2026-09-10',
 preStartRecord:undefined,
 existing:['entered','canonical-occurrence',23,false],
 tomb:[true,undefined,undefined]
});

const backup=await page.evaluate(()=>JSON.stringify(snapshotData())),before=await page.evaluate(()=>[Object.keys(domain.data.records).length,Object.keys(domain.data.periods).length]);await page.locator('#importFile').setInputFiles({name:'roundtrip.json',mimeType:'application/json',buffer:Buffer.from(backup)});await page.waitForTimeout(300);assert.deepEqual(await page.evaluate(()=>[Object.keys(domain.data.records).length,Object.keys(domain.data.periods).length]),before);
await page.reload();assert.equal(await page.evaluate(()=>domain.occurrences('2026-09-08')[0].time),'17:00');assert.deepEqual(await page.evaluate(()=>(()=>{const l=domain.versionAt('bi-review',domain.teacherNow().date);return[l.phase,lessons.find(x=>x.id==='bi-review').phase,domain.occurrences('2026-09-21').some(r=>r.scheduleId==='bi-review'),domain.occurrences('2026-09-28').some(r=>r.scheduleId==='bi-review'),domain.versionAt('bi-review','2026-09-08').phase,domain.data.schedules['bi-review'].length]})()),[1,1,false,true,0,2]);assert.deepEqual(errors,[]);await browser.close();require('./test-biweekly-phase-domain-control.cjs');console.log('PASS: real UI legacy migration, recurrence edit preserving history, biweekly phase preservation across editor/reload, reversal, custom period editing/renewal/archive, availability settings, backup import deduplication and reload');})().catch(e=>{console.error(e);process.exit(1)});