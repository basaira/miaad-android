const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.join(__dirname,'../app/src/main/assets');
const context={assert,console,Date,setTimeout,clearTimeout,navigator:{},
 document:{querySelectorAll:()=>[],getElementById:()=>({innerHTML:'',classList:{toggle(){}}})},
 window:{localStorage:{getItem:()=>null}},};
vm.createContext(context);
for(const file of ['app-core.js','app-engine.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
vm.runInContext(`
assert.equal(BASE.find(l=>l.id==='abd-sun').start,'08:00');
assert.equal(BASE.filter(l=>l.name==='محبة الله — روسيا').length,3);
assert.equal(BASE.filter(l=>l.name==='عمر — أمريكا'&&l.day===1).length,0);
assert.ok(BASE.filter(l=>l.id.startsWith('moh-sw')).every(l=>l.start===''&&l.displayTime==='بعد المغرب'));
// Native reminder plan is covered by the actual browser acceptance suite.
assert.ok(!buildOccurrences(30).some(r=>r.lesson.id.startsWith('moh-sw')));
const sunday=new Date(2026,8,6);
assert.ok(SmartScheduleEngine.conflict(sunday,19*3600+45*60,15).hard.some(l=>l.id==='omi-sun'));
assert.ok(!SmartScheduleEngine.conflict(sunday,20*3600,15).hard.some(l=>l.id==='omi-sun'));
const wednesday=new Date(2026,8,9);
assert.ok(SmartScheduleEngine.blocks(wednesday).some(l=>l.name==='إدريس'));
assert.ok(!SmartScheduleEngine.blocks(addDays(wednesday,7)).some(l=>l.name==='إدريس'));
idrisPhase=1;
assert.ok(!SmartScheduleEngine.blocks(wednesday).some(l=>l.name==='إدريس'));
assert.ok(SmartScheduleEngine.blocks(addDays(wednesday,7)).some(l=>l.name==='إدريس'));
idrisPhase=0;
const monday=new Date(2026,8,7);
assert.ok(SmartScheduleEngine.freeWindows(monday).every(w=>w.softRisks.some(l=>l.id==='moh-sw-mon')));
assert.ok(SmartScheduleEngine.scoreCandidates(monday,30).every(c=>c.softHits.some(l=>l.id==='moh-sw-mon')));
const original=lessons;
lessons=[{id:'overnight',name:'اختبار',day:0,start:'23:30',duration:30,maxDuration:120,repeat:'weekly'},
 {id:'next',name:'التالي',day:1,start:'01:20',duration:30,repeat:'weekly'}];
assert.equal(SmartScheduleEngine.blocks(monday).find(l=>l.id==='overnight').end,5400);
assert.ok(SmartScheduleEngine.conflict(monday,3600,30).hard.some(l=>l.id==='overnight'));
assert.ok(SmartScheduleEngine.conflict(sunday,23*3600+50*60,120,'overnight').hard.some(l=>l.id==='next'));
assert.equal(SmartScheduleEngine.freeWindows(monday)[0].start,6600);
assert.ok(!SmartScheduleEngine.conflict(sunday,23*3600+50*60,60,'overnight').hard.some(l=>l.id==='next'));
lessons=[{id:'named-time',name:'اختبار',day:1,start:'18:10',duration:30,displayTime:'بعد العصر',repeat:'weekly'}];
assert.equal(SmartScheduleEngine.blocks(monday)[0].soft,false);
lessons=original;
const customized={id:'moh-sw-mon',start:'19:00',repeat:'flex',displayTime:'بعد المغرب',note:'اختيار المستخدم'};
assert.equal(normalizeSchedule([customized])[0],customized);
assert.equal(humanDuration(6000),'ساعة و 40 دقيقة');
assert.ok(freeWindowLabel({start:80400,end:86400}).includes('نهاية اليوم'));
console.log('Schedule regression PASS: seed facts, unknown times, max duration, midnight carryover, adjacency, Idris phase and saved edits.');
`,context);
