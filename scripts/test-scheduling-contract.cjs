const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(process.env.MIAAD_ASSET_ROOT||path.join(__dirname,'../app/src/main/assets'));
const {createMiaadDomain}=require(path.join(root,'app-domain.js'));

let now=new Date('2026-09-14T08:00:00');
const domain=createMiaadDomain({}, {},()=>new Date(now));
const student=domain.saveStudent({id:'s-contract',name:'Contract student',startDate:'2026-09-01',custom:false,settings:{}});
const sid=student.id;
const pad=n=>String(n).padStart(2,'0');
const startOfDay=d=>{const x=new Date(d);x.setHours(0,0,0,0);return x};
const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
const getSunday=d=>{const x=startOfDay(d);x.setDate(x.getDate()-x.getDay());return x};
const dateKey=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const hasFixedTime=l=>/^([01]\d|2[0-3]):[0-5]\d$/.test(l.start||'');
const toMinutes=t=>{const [h,m]=String(t||'00:00').split(':').map(Number);return h*60+m};
const toSeconds=t=>{const [h,m,s=0]=String(t||'00:00').split(':').map(Number);return h*3600+m*60+s};
const timeDate=(d,t)=>{const x=new Date(d),[h,m,s=0]=String(t||'00:00').split(':').map(Number);x.setHours(h,m,s,0);return x};
const selectedDate=new Date('2026-09-14T12:00:00');
let lessons=[];
function lessonsForDate(d){return domain.occurrences(dateKey(d)).filter(r=>!['student_cancelled','missed','notheld','rescheduled'].includes(r.status)).map(r=>({...r.schedule,id:r.scheduleId||r.id,recordId:r.id,studentId:r.studentId,name:r.name,start:r.time,displayTime:r.displayTime,duration:r.duration,maxDuration:r.maxDuration,day:d.getDay(),status:r.status}))}
const context={console,Date,Math,Map,Set,JSON,domain,dateKey,hasFixedTime,toMinutes,toSeconds,startOfDay,addDays,getSunday,timeDate,selectedDate,lessons,lessonsForDate,NATIVE:null,buildNativeReminders:()=>[]};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root,'app-engine.js'),'utf8'),context);
const engine=vm.runInContext('SmartScheduleEngine',context);

const cases=[];
function check(id,fn){try{fn();cases.push({id,ok:true})}catch(error){cases.push({id,ok:false,error:error.message})}}
function resetSettings(){const s=domain.copy(domain.defaults);domain.saveSettings(s)}
function clearSchedules(){domain.data.schedules={};domain.data.records={};}
function save(l,effective='2026-09-14'){return domain.saveSchedule({studentId:sid,name:student.name,repeat:'weekly',duration:30,...l},effective)}
function hard(date,start,duration,exclude=''){return engine.conflict(new Date(date+'T12:00:00'),toSeconds(start),duration,exclude).hard}

resetSettings();clearSchedules();save({id:'adj',day:1,start:'10:00',duration:30});
check('S01 exact adjacency',()=>assert.equal(hard('2026-09-14','10:30',30).length,0));
check('S02 one-minute overlap',()=>assert.ok(hard('2026-09-14','10:29',30).length>0));

resetSettings();const cfgBuffer=domain.copy(domain.data.settings);cfgBuffer.buffer=15;domain.saveSettings(cfgBuffer);
check('S03 configured buffer is hard conflict',()=>assert.ok(hard('2026-09-14','10:35',5).length>0));

resetSettings();clearSchedules();save({id:'max',day:1,start:'10:00',duration:30,maxDuration:60});
check('S04 maxDuration reserved',()=>assert.ok(hard('2026-09-14','10:45',10).length>0));

resetSettings();clearSchedules();save({id:'overnight',day:0,start:'23:30',duration:30,maxDuration:120},'2026-09-20');
check('S05 lesson crosses midnight',()=>assert.ok(hard('2026-09-21','00:30',15).length>0));
check('S06 previous-day overrun blocks current day',()=>assert.ok(hard('2026-09-21','01:00',15).length>0));
save({id:'nextday',day:1,start:'00:30',duration:30},'2026-09-20');
check('S07 requested current-day interval conflicts next day',()=>assert.ok(engine.conflict(new Date('2026-09-20T12:00:00'),23*3600+50*60,60,'overnight').hard.some(x=>x.id==='nextday'||x.name==='Contract student')));

resetSettings();clearSchedules();let cfg=domain.copy(domain.data.settings);cfg.working[0]=[['22:00','02:00']];cfg.working[1]=[];domain.saveSettings(cfg);
check('S08 overnight working carry',()=>assert.deepEqual(domain.availability('2026-09-21').map(x=>[x.start,x.end]),[[0,120]]));
cfg=domain.copy(domain.data.settings);cfg.blocked=[{day:0,start:'23:30',end:'01:00'}];domain.saveSettings(cfg);
check('S09 overnight blocked interval',()=>assert.deepEqual(domain.availability('2026-09-21').map(x=>[x.start,x.end]),[[60,120]]));

resetSettings();cfg=domain.copy(domain.data.settings);cfg.working[1]=[['09:00','17:00']];cfg.blocked=[{day:1,start:'12:00',end:'13:00'}];cfg.minSlot=1;domain.saveSettings(cfg);
check('S10 blocked interval unavailable',()=>assert.ok(hard('2026-09-14','12:15',15).length>0));
check('S10b outside working interval unavailable',()=>assert.ok(hard('2026-09-14','08:30',15).length>0));
cfg.blocked=[{day:1,start:'08:00',end:'09:00'},{day:1,start:'17:00',end:'18:00'}];domain.saveSettings(cfg);
check('S11 blocked touching working boundary no phantom gap',()=>assert.deepEqual(domain.availability('2026-09-14').map(x=>[x.start,x.end]),[[540,1020]]));
cfg.blocked=[{day:1,start:'10:00',end:'11:00'},{day:1,start:'10:30',end:'12:00'}];domain.saveSettings(cfg);
check('S12 overlapping blocked merges deterministically',()=>assert.deepEqual(domain.availability('2026-09-14').map(x=>[x.start,x.end]),[[540,600],[720,1020]]));
clearSchedules();save({id:'inside-block',day:1,start:'10:45',duration:30});
check('S13 blocked plus lesson overlap coherent',()=>assert.deepEqual(domain.occupied('2026-09-14').hard.filter(x=>x.start<720&&x.end>600).map(x=>[x.start,x.end]),[[600,720]]));

resetSettings();clearSchedules();save({id:'flex',day:1,start:'',displayTime:'بعد المغرب',duration:30,repeat:'flex'});
check('S14 flexible lesson remains soft uncertainty',()=>{const c=engine.conflict(new Date('2026-09-14T12:00:00'),18*3600,30);assert.equal(c.hard.length,0);assert.ok(c.soft.length>0)});

resetSettings();clearSchedules();save({id:'edit',day:1,start:'10:00',duration:30});
check('S15 exclude edited lesson avoids self-conflict',()=>assert.equal(hard('2026-09-14','10:00',30,'edit').length,0));
check('S16 stable schedule identity no duplicate same effective version',()=>{save({id:'edit',day:1,start:'11:00',duration:30});assert.equal(domain.data.schedules.edit.length,1);assert.equal(domain.data.schedules.edit[0].lesson.id,'edit')});

clearSchedules();domain.saveSchedule({id:'bi',studentId:sid,name:student.name,day:1,start:'11:00',duration:30,repeat:'biweekly',phase:0},'2026-09-21');
check('S17 biweekly phase',()=>{assert.equal(domain.occurrences('2026-09-21').some(r=>r.scheduleId==='bi'),true);assert.equal(domain.occurrences('2026-09-28').some(r=>r.scheduleId==='bi'),false)});

clearSchedules();now=new Date('2026-09-14T12:00:00');save({id:'versioned',day:1,start:'09:00',duration:30});domain.record({...domain.occurrences('2026-09-14').find(r=>r.scheduleId==='versioned'),status:'entered'});domain.saveSchedule({id:'versioned',studentId:sid,name:student.name,day:1,start:'10:00',duration:45,repeat:'weekly'},'2026-09-21');
check('S18 effective-dated edit keeps history',()=>{assert.equal(domain.occurrences('2026-09-14').find(r=>r.scheduleId==='versioned').time,'09:00');assert.equal(domain.occurrences('2026-09-21').find(r=>r.scheduleId==='versioned').time,'10:00')});
now=new Date('2026-09-21T12:00:00');domain.deleteSchedule('versioned');
check('S19 deletion keeps historical row',()=>{assert.equal(domain.occurrences('2026-09-14').find(r=>r.scheduleId==='versioned').time,'09:00');assert.equal(domain.occurrences('2026-09-22').some(r=>r.scheduleId==='versioned'),false)});

resetSettings();clearSchedules();save({id:'midnight',day:1,start:'00:00',duration:30},'2026-09-21');
check('S21 00:00 is valid fixed time',()=>assert.equal(domain.versionAt('midnight','2026-09-21').start,'00:00'));
check('S22 24:00 is not a valid lesson start',()=>assert.throws(()=>domain.saveSchedule({id:'bad-24',studentId:sid,name:student.name,day:1,start:'24:00',duration:30,repeat:'weekly'},'2026-09-21')));
check('S23 current interval is [start,end)',()=>{const atEnd=engine.activeBlock(new Date('2026-09-21T00:30:00'));assert.ok(!atEnd||atEnd.id!=='midnight')});

resetSettings();clearSchedules();cfg=domain.copy(domain.data.settings);cfg.working[1]=[['09:00','13:00']];cfg.blocked=[{day:1,start:'10:00',end:'11:00'}];cfg.buffer=15;cfg.minSlot=1;domain.saveSettings(cfg);save({id:'candidate-blocker',day:1,start:'12:00',duration:30},'2026-09-21');
check('S25 candidates never enter authoritative hard conflict',()=>{for(const c of engine.scoreCandidates(new Date('2026-09-21T12:00:00'),30))assert.equal(engine.conflict(new Date('2026-09-21T12:00:00'),c.start,30).hard.length,0)});
check('LIVE blocked interval uses hard authority',()=>assert.ok(engine.activeBlock(new Date('2026-09-21T10:15:00'))));
check('LIVE buffer interval uses hard authority',()=>assert.ok(engine.activeBlock(new Date('2026-09-21T11:50:00'))));

resetSettings();clearSchedules();cfg=domain.copy(domain.data.settings);cfg.working[1]=[['10:00','10:25']];cfg.minSlot=30;domain.saveSettings(cfg);
check('S20 minSlot current characterization only',()=>{assert.equal(domain.availability('2026-09-21').length,0);assert.equal(engine.scoreCandidates(new Date('2026-09-21T12:00:00'),20).length,0)});

now=new Date('2026-09-21T08:00:00');
function validationFixture(){const d=createMiaadDomain({}, {},()=>new Date(now)),st=d.saveStudent({id:'v-student',name:'Validation student',startDate:'2026-09-01',custom:false,settings:{}}),good={id:'valid',studentId:st.id,name:st.name,day:1,start:'10:00',duration:30,maxDuration:45,repeat:'weekly',phase:0};d.saveSchedule(good,'2026-09-21');return {d,st,good}}
for(const [label,makeBad] of [
 ['id',g=>({...g,id:''})],['student',g=>({...g,id:'bad-student',studentId:'missing'})],['day',g=>({...g,id:'bad-day',day:7})],['start',g=>({...g,id:'bad-start',start:'25:00'})],['flex-label',g=>({...g,id:'bad-flex',start:'',displayTime:''})],['duration',g=>({...g,id:'bad-duration',duration:-1})],['maxDuration',g=>({...g,id:'bad-max',maxDuration:20})],['repeat',g=>({...g,id:'bad-repeat',repeat:'monthly'})],['phase',g=>({...g,id:'bad-phase',repeat:'biweekly',phase:2})]
])check('VALIDATE '+label,()=>{const {d,good}=validationFixture(),before=JSON.stringify(d.data);assert.throws(()=>d.saveSchedule(makeBad(good),'2026-09-21'));assert.equal(JSON.stringify(d.data),before)});
check('VALIDATE effective date',()=>{const {d,good}=validationFixture(),before=JSON.stringify(d.data);assert.throws(()=>d.saveSchedule({...good,id:'bad-effective'},'2026-02-30'));assert.equal(JSON.stringify(d.data),before)});
check('VALIDATE legacy name-only identity remains accepted',()=>{const {d}=validationFixture(),l=d.saveSchedule({id:'legacy-name-only',name:'Legacy Name',day:1,start:'',displayTime:'بعد المغرب',duration:0,repeat:'flex'},'2026-09-21');assert.ok(l.studentId);assert.equal(l.start,'')});

const failures=cases.filter(x=>!x.ok);
if(failures.length){console.error('SCHEDULING CONTRACT FAILURES');for(const f of failures)console.error(`- ${f.id}: ${f.error}`);console.error(`FAILED ${failures.length}/${cases.length} cases`);process.exit(1)}
console.log(`PHASE 1B SCHEDULING CONTRACT PASS: ${cases.length} focused cases`);
