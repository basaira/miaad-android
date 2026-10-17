// Real shipping WebView startup in Chromium; seed Native bridge + local storage
// before all production scripts, assert first render, persistence and restart.
'use strict';
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const assert=require('node:assert/strict'),path=require('node:path');
const {createMiaadDomain}=require(path.resolve(process.env.MIAAD_ASSET_ROOT||path.join(__dirname,'../app/src/main/assets'),'app-domain.js'));
const root=path.resolve(process.env.MIAAD_ASSET_ROOT||path.join(__dirname,'../app/src/main/assets'));
const clone=x=>JSON.parse(JSON.stringify(x));
const clock=()=>new Date('2026-09-21T12:00:00Z');
const domain=createMiaadDomain({settings:{teacherTimeZone:'Africa/Cairo'}},{},clock);
const s=domain.saveStudent({id:'s',name:'Student',startDate:'2026-09-01',custom:false,settings:{}});
const lesson={id:'s-one',studentId:'s',name:'Student',day:1,start:'10:00',duration:30,repeat:'weekly'};
domain.saveSchedule(lesson,'2026-09-21');
domain.record({...domain.resolveScheduleOccurrence('s-one','2026-09-21'),status:'entered',note:'kept-note',countOverride:false});
domain.data.students.s.custom=true;domain.data.students.s.settings={target:1,autoCycle:true};
const good=clone(domain.data),bad=clone(good);bad.students.s.settings.target=0;
const validSnapshot={schemaVersion:4,updatedAt:100,domain:good,lessons:[lesson],sessionState:{},sessionNotes:{},sessionAudit:{},idrisPhase:0};
const brokenSnapshot={...validSnapshot,updatedAt:1000,domain:bad};
async function run(browser,label,native,local,expected){
 const ctx=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
 const page=await ctx.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({native,local,lesson})=>{
  window.__v1r6NativeWrites=[];
  window.AndroidBridge={loadSnapshot:()=>native===null?'':JSON.stringify(native),saveSnapshot:json=>window.__v1r6NativeWrites.push(json),syncReminders:()=>{},printReport:()=>{}};
  if(local!==null&&!localStorage.getItem('__v1r6_seeded')){
   localStorage.setItem('miaadDomainV4',JSON.stringify(local));
   localStorage.setItem('miadLessonsV2',JSON.stringify([lesson]));
   localStorage.setItem('miadUpdatedAtV1','200');
   localStorage.setItem('__v1r6_seeded','1');
  }
 },{native,local,lesson});
 const url='file:///'+path.join(root,'index.html').replaceAll('\\','/');
 await page.goto(url,{waitUntil:'load'});
 await page.waitForFunction(()=>document.getElementById('syncStatus')!==null);
 const inspect=()=>page.evaluate(()=>({selected:selectedInitialSource,blocked:startupRecoveryBlocked,target:domain.data.students.s?.settings?.target,record:domain.data.records['2026-09-21__s-one']?.status,notes:domain.data.records['2026-09-21__s-one']?.note,stored:localStorage.getItem('miaadDomainV4'),nativeWrites:window.__v1r6NativeWrites.length,overlay:!!document.getElementById('miaadStartupRecoveryBlock'),sync:nativeSyncState,rendered:!!document.querySelector('[data-view="students"]')}));
 let first=await inspect();
 assert.equal(first.selected,expected.source,label+': initial source');
 assert.equal(first.blocked,expected.blocked,label+': blocked');
 assert.equal(first.overlay,expected.blocked,label+': recovery notice');
 assert.equal(first.rendered,true,label+': first render');
 if(expected.target!==undefined){assert.equal(first.target,expected.target,label+': target');assert.equal(first.record,'entered',label+': canonical');assert.equal(first.notes,'kept-note',label+': notes')}
 if(expected.blocked){
  assert.equal(first.nativeWrites,0,label+': no native write');
  assert.equal(first.stored,JSON.stringify(local),label+': non-destructive Local storage');
  assert.notEqual(first.sync,'synced',label+': no false sync')
 }
 await page.reload({waitUntil:'load'});
 const again=await inspect();
 assert.equal(again.selected,first.selected,label+': restart selection');
 assert.equal(again.blocked,first.blocked,label+': restart quarantine');
 if(expected.target!==undefined){assert.equal(again.target,expected.target,label+': restart target');assert.equal(again.record,'entered',label+': restart record')}
 if(expected.blocked){assert.equal(again.stored,first.stored,label+': restart no overwrite');assert.equal(again.nativeWrites,0,label+': restart no Native save')}
 assert.deepEqual(errors,[],label+': runtime errors');
 await ctx.close();
 console.log('PASS initial browser '+label)
}
(async()=>{
 const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
 try{
  await run(browser,'invalid Native / valid Local',brokenSnapshot,good,{source:'local-modern',blocked:false,target:1});
  await run(browser,'valid Native / invalid Local',validSnapshot,bad,{source:'native-modern',blocked:false,target:1});
  await run(browser,'both invalid non-destructive',brokenSnapshot,bad,{source:'recovery',blocked:true});
  await run(browser,'missing Native / good Local',null,good,{source:'local-modern',blocked:false,target:1});
 }finally{await browser.close()}
 console.log('INITIAL BROWSER STARTUP PASS: 4/4')
})().catch(err=>{console.error(err);process.exitCode=1});
