const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'}),context=await browser.newContext({viewport:{width:390,height:844},locale:'ar-EG',reducedMotion:'reduce'}),page=await context.newPage();
 await page.goto('file:///'+path.join(__dirname,'../app/src/main/assets/index.html').replaceAll('\\','/'),{waitUntil:'load'});
 const result=await page.evaluate(()=>{
  const assert=(v,m)=>{if(!v)throw Error(m)};
  const teacher=domain.copy(domain.data.settings);teacher.teacherTimeZone='Europe/London';teacher.showNotes=true;domain.saveSettings(teacher);
  const custom=domain.copy(domain.data.settings);custom.showNotes=true;custom.target=12;custom.duration=30;
  const s=domain.saveStudent({name:'Archived zone invariant',startDate:'2026-03-01',timeZone:'America/New_York',custom:true,settings:custom});
  const r=domain.record({id:'tz-record',studentId:s.id,name:s.name,date:'2026-03-20',time:'09:00',duration:30,status:'entered',note:'تحسن واضح',noteAr:'تحسن واضح',noteEn:'Clear improvement'});
  const p=domain.createPeriod(s.id,'2026-03-01','2026-03-31','custom');domain.archive(p);
  reportSelection={studentId:s.id,periodId:p.id,language:'en'};let data=reportData(),markup=reportMarkup(data,'en');
  const firstLocal=(markup.match(/Student local time:\s*([^<]+)/)||[])[1]||'';
  assert(p.studentTimeZone==='America/New_York','student zone snapshot missing');assert(p.teacherTimeZone==='Europe/London','teacher zone snapshot missing');assert(p.showNotes===true,'showNotes snapshot missing');assert(firstLocal,'archived local time missing');
  s.timeZone='Asia/Tokyo';domain.data.settings.teacherTimeZone='Africa/Cairo';s.settings.showNotes=false;
  data=reportData();markup=reportMarkup(data,'en');const secondLocal=(markup.match(/Student local time:\s*([^<]+)/)||[])[1]||'';
  assert(secondLocal===firstLocal,'archived local time changed after profile timezone edit');assert(markup.includes('America/New_York')&&markup.includes('Europe/London'),'archived zone labels changed');assert(markup.includes('Clear improvement'),'archived note visibility changed after preference edit');

  const hiddenSettings=domain.copy(domain.data.settings);hiddenSettings.showNotes=false;hiddenSettings.target=12;hiddenSettings.duration=30;
  const h=domain.saveStudent({name:'Hidden notes invariant',startDate:'2026-04-01',timeZone:'UTC',custom:true,settings:hiddenSettings});
  domain.record({id:'hidden-record',studentId:h.id,name:h.name,date:'2026-04-02',time:'10:00',duration:30,status:'entered',note:'ملاحظة لا ينبغي تصديرها'});
  const hp=domain.createPeriod(h.id,'2026-04-01','2026-04-30','custom');domain.archive(hp);h.settings.showNotes=true;
  reportSelection={studentId:h.id,periodId:hp.id,language:'en'};const hd=reportData();
  assert(hp.showNotes===false,'hidden-note archive policy not snapped');assert(miaadReportMissingTranslations(hd,'en').length===0,'hidden note incorrectly blocks translation/export');assert(!reportMarkup(hd,'en').includes('ملاحظة لا ينبغي تصديرها'),'hidden note leaked into archived report');

  const march=miaadWallClockInstant('2026-03-20','09:00','Europe/London'),april=miaadWallClockInstant('2026-04-20','09:00','Europe/London');
  const hour=d=>new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'2-digit',hour12:false}).format(d);
  assert(hour(march)==='05','US/UK DST transition handling wrong in March');assert(hour(april)==='04','US/UK DST transition handling wrong in April');
  return {archivedZoneStable:true,archivedShowNotesStable:true,hiddenNotesDoNotBlockExport:true,dstMarch:hour(march),dstApril:hour(april)};
 });
 assert.equal(result.archivedZoneStable,true);await browser.close();console.log('REPORT INVARIANTS PASS',result);
})().catch(e=>{console.error(e);process.exit(1)});
