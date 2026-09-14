const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const cp=require('node:child_process');
const root=path.resolve(process.env.MIAAD_ASSET_ROOT||path.join(__dirname,'../app/src/main/assets'));
const {createMiaadDomain,MiaadTemporal,stabilizeMiaadTeacherTimeZoneSeed}=require(path.join(root,'app-domain.js'));

function browserProbe(fixedIso){
 const epoch=Date.parse(fixedIso);
 class FakeDate extends Date{constructor(...args){super(...(args.length?args:[epoch]))}static now(){return epoch}}
 const domain=createMiaadDomain({settings:{teacherTimeZone:'Asia/Tokyo'}},{},()=>new Date(epoch));
 const s=domain.saveStudent({id:'s1',name:'Student',startDate:'2026-09-01',timeZone:'America/Chicago',custom:false,settings:{}});
 const settings=domain.copy(domain.data.settings);settings.working={0:[],1:[],2:[],3:[],4:[['06:00','10:00']],5:[],6:[]};settings.blocked=[{day:4,start:'07:15',end:'07:45'}];settings.minSlot=1;domain.saveSettings(settings);
 domain.saveSchedule({id:'current',studentId:s.id,name:s.name,day:4,start:'07:00',duration:60,maxDuration:60,repeat:'weekly',reminder:20},'2026-10-01');
 domain.saveSchedule({id:'next',studentId:s.id,name:s.name,day:4,start:'08:00',duration:30,maxDuration:30,repeat:'weekly',reminder:30},'2026-10-01');
 const pad=n=>String(n).padStart(2,'0');
 let selectedDate=new FakeDate(),idrisPhase=0,lessons=[];
 let startOfDay=d=>{const x=new FakeDate(d);x.setHours(0,0,0,0);return x};
 let addDays=(d,n)=>{const x=new FakeDate(d);x.setDate(x.getDate()+n);return x};
 let getSunday=d=>{const x=startOfDay(d);x.setDate(x.getDate()-x.getDay());return x};
 let dateKey=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
 const hasFixedTime=l=>/^([01]\d|2[0-3]):[0-5]\d$/.test(l.start||'');
 const toMinutes=t=>{const [h,m]=String(t||'00:00').split(':').map(Number);return h*60+m};
 const toSeconds=t=>{const [h,m,s=0]=String(t||'00:00').split(':').map(Number);return h*3600+m*60+s};
 let timeDate=(d,t)=>{const x=new FakeDate(d),[h,m,s=0]=String(t||'00:00').split(':').map(Number);x.setHours(h,m,s,0);return x};
 let fmtDate=d=>String(d),weekIndex=()=>0,idrisActive=()=>true,monthBounds=()=>({start:new FakeDate(),end:new FakeDate()});
 function lessonsForDate(d){return domain.occurrences(dateKey(d)).filter(r=>!['student_cancelled','missed','notheld','rescheduled'].includes(r.status)).map(r=>({...r.schedule,id:r.scheduleId||r.id,recordId:r.id,studentId:r.studentId,name:r.name,start:r.time,displayTime:r.displayTime,duration:r.duration,maxDuration:r.maxDuration,day:d.getDay(),status:r.status}))}
 const doc={getElementById:()=>null,querySelector:()=>null};
 const context={console,Date:FakeDate,Math,Map,Set,JSON,Intl,Object,Array,String,Number,RegExp,domain,dateKey,hasFixedTime,toMinutes,toSeconds,startOfDay,addDays,getSunday,timeDate,fmtDate,weekIndex,idrisActive,monthBounds,selectedDate,idrisPhase,lessons,lessonsForDate,NATIVE:null,buildNativeReminders:()=>[],renderHeader:()=>{},renderClock:()=>{},readPrefs:(f,b)=>domain.copy(b),renderFeatureSettings:()=>{},studentForm:()=>{},document:doc,window:null,escapeHtml:s=>String(s),FormData:global.FormData,showToast:()=>{},setTimeout:()=>0,addEventListener:()=>{},DAYS:['Sun','Mon','Tue','Wed','Thu','Fri','Sat']};
 context.window=context;vm.createContext(context);
 vm.runInContext(fs.readFileSync(path.join(root,'app-engine.js'),'utf8'),context);
 vm.runInContext(fs.readFileSync(path.join(root,'app-timezone-bridge.js'),'utf8'),context);
 const result=vm.runInContext(`(()=>{const n=nextOccurrence(),c=currentOrNextOccurrence(),live=SmartScheduleEngine.liveFree(new Date()),block=SmartScheduleEngine.activeBlock(new Date()),items=buildNativeReminders(2);return {today:dateKey(new Date()),selected:dateKey(selectedDate),next:n&&{id:n.lesson.id,date:dateKey(n.date),at:n.start.toISOString()},current:c&&{id:c.lesson.id,date:dateKey(c.date),at:c.start.toISOString(),inProgress:!!c.inProgress},live:live&&[live.start,live.end],block:block&&{id:block.id,reason:block.reason},upcoming:items.find(x=>x.id==='upcoming:2026-10-01__next')||null,pending:items.find(x=>x.id==='pending:2026-10-01__current')||null,defaultMonth:dateKey(new Date()).slice(0,7)}})()`,context);
 return result;
}

if(process.argv[2]==='--probe'){
 const fixed=process.argv[3]||'2026-09-30T22:29:00.000Z';
 process.stdout.write(JSON.stringify(browserProbe(fixed)));process.exit(0);
}
if(process.argv[2]==='--legacy-zone'){
 const d=createMiaadDomain({}, {},()=>new Date('2026-09-30T22:30:00Z'));process.stdout.write(d.data.settings.teacherTimeZone);process.exit(0);
}
if(process.argv[2]==='--seed-zone'){
 const seed=JSON.parse(Buffer.from(process.argv[3]||'', 'base64').toString('utf8'));
 const d=createMiaadDomain(seed,{},()=>new Date('2026-09-30T22:30:00Z'));process.stdout.write(d.data.settings.teacherTimeZone);process.exit(0);
}
if(process.argv[2]==='--hotfix-civil'){
 const d=createMiaadDomain({settings:{teacherTimeZone:'UTC'}},{},()=>new Date('2026-09-30T22:30:00Z'));
 const source=fs.readFileSync(path.join(root,'app-ui-hotfix.js'),'utf8'),lines=source.split('\n');
 const civilLine=lines.find(line=>line.includes('const civilKey=')),localLine=lines.find(line=>line.includes('const localDate='));
 if(!civilLine||!localLine)throw new Error('canonical hotfix factory not found');
 const value=vm.runInNewContext(`${civilLine}\n${localLine}\ndomain.day(localDate(2026,0,1))`,{window:{miaadCivilDate:key=>d.parse(key)},domain:d,String,Error});
 process.stdout.write(value);process.exit(0);
}

const cases=[];function check(id,fn){try{fn();cases.push({id,ok:true})}catch(error){cases.push({id,ok:false,error:error.stack||error.message})}}
const spawn=(tz,args=['--probe','2026-09-30T22:29:00.000Z'])=>JSON.parse(cp.execFileSync(process.execPath,[__filename,...args],{env:{...process.env,TZ:tz},encoding:'utf8'}));
const la=spawn('America/Los_Angeles'),cairoDevice=spawn('Africa/Cairo');

check('A teacher zone equals device zone preserves civil clock',()=>{const x=createMiaadDomain({settings:{teacherTimeZone:'Africa/Cairo'}},{},()=>new Date('2026-09-30T21:30:00Z')).teacherNow();assert.equal(x.date,'2026-10-01');assert.equal(x.time,'00:30:00')});
check('B differing device zones preserve teacher today',()=>assert.equal(la.today,cairoDevice.today));
check('C midnight boundary uses teacher next day',()=>assert.equal(la.today,'2026-10-01'));
check('D nextOccurrence independent of device timezone',()=>assert.deepEqual(la.next,cairoDevice.next));
check('E currentOrNextOccurrence independent of device timezone',()=>assert.deepEqual(la.current,cairoDevice.current));
check('F activeBlock uses teacher civil minute',()=>{assert.equal(la.block.reason,'occurrence');assert.equal(la.block.id,'current');assert.deepEqual(la.block,cairoDevice.block)});
check('F2 liveFree uses teacher civil minute',()=>assert.equal(la.live,null));

check('G saveSchedule effective today uses teacher date',()=>{const now=new Date('2026-09-30T16:30:00Z'),d=createMiaadDomain({settings:{teacherTimeZone:'Asia/Tokyo'}},{},()=>now),s=d.saveStudent({id:'g',name:'G',startDate:'2026-09-01',custom:false,settings:{}});assert.throws(()=>d.saveSchedule({id:'old',studentId:s.id,name:s.name,day:3,start:'09:00',duration:30,repeat:'weekly'},'2026-09-30'));assert.doesNotThrow(()=>d.saveSchedule({id:'today',studentId:s.id,name:s.name,day:4,start:'09:00',duration:30,repeat:'weekly'},'2026-10-01'))});
check('H future attendance validation uses teacher date',()=>{const now=new Date('2026-09-30T16:30:00Z'),d=createMiaadDomain({settings:{teacherTimeZone:'Asia/Tokyo'}},{},()=>now),s=d.saveStudent({id:'h',name:'H',startDate:'2026-09-01',custom:false,settings:{}});assert.throws(()=>d.record({studentId:s.id,name:s.name,date:'2026-10-02',time:'09:00',duration:30,status:'entered'}));assert.doesNotThrow(()=>d.record({studentId:s.id,name:s.name,date:'2026-10-01',time:'09:00',duration:30,status:'entered'}))});
check('I weekly occurrence generation uses civil weekday',()=>{const d=createMiaadDomain({settings:{teacherTimeZone:'Asia/Tokyo'}},{},()=>new Date('2026-09-30T16:30:00Z')),s=d.saveStudent({id:'i',name:'I',startDate:'2026-09-01',custom:false,settings:{}});d.saveSchedule({id:'thu',studentId:s.id,name:s.name,day:4,start:'09:00',duration:30,repeat:'weekly'},'2026-10-01');assert.equal(d.occurrences('2026-10-01').some(x=>x.scheduleId==='thu'),true);assert.equal(d.occurrences('2026-09-30').some(x=>x.scheduleId==='thu'),false)});
check('J biweekly phase stable across device zones',()=>{const a=spawn('Pacific/Honolulu'),b=spawn('Pacific/Kiritimati');assert.equal(a.today,b.today);assert.equal(a.current.id,b.current.id)});
check('K overnight lesson canonical instant is correct',()=>{const d=createMiaadDomain({settings:{teacherTimeZone:'America/New_York'}},{},()=>new Date('2026-09-30T12:00:00Z')),s=d.saveStudent({id:'k',name:'K',startDate:'2026-01-01',custom:false,settings:{}});d.saveSchedule({id:'overnight',studentId:s.id,name:s.name,day:0,start:'23:30',duration:120,maxDuration:120,repeat:'weekly'},'2026-10-04');const r=d.occurrences('2026-10-04').find(x=>x.scheduleId==='overnight');assert.equal(d.ended(r,new Date('2026-10-05T04:15:00Z')),false);assert.equal(d.ended(r,new Date('2026-10-05T05:31:00Z')),true)});
check('L reminder epoch independent of device zone',()=>assert.equal(la.upcoming.at,cairoDevice.upcoming.at));
check('M native reminder threshold matches in-app upcoming instant',()=>{const start=MiaadTemporal.resolveWallClock('2026-10-01','08:00','Asia/Tokyo'),reminderAt=+start-30*60000;assert.equal(la.upcoming.at,reminderAt);const d=createMiaadDomain({settings:{teacherTimeZone:'Asia/Tokyo'}},{},()=>new Date(reminderAt)),s=d.saveStudent({id:'m',name:'M',startDate:'2026-09-01',custom:false,settings:{}});d.saveSchedule({id:'m-lesson',studentId:s.id,name:s.name,day:4,start:'08:00',duration:30,repeat:'weekly',reminder:30},'2026-10-01');assert.ok(d.notifications(new Date(reminderAt)).some(n=>n.id==='upcoming:2026-10-01__m-lesson'))});
check('N report default month follows teacher month',()=>assert.equal(la.defaultMonth,'2026-10'));
check('O archived report freezes teacher timezone',()=>{const d=createMiaadDomain({settings:{teacherTimeZone:'Africa/Cairo'}},{},()=>new Date('2026-09-20T12:00Z')),s=d.saveStudent({id:'o',name:'O',startDate:'2026-09-01',custom:false,settings:{}}),p=d.createPeriod(s.id,'2026-09-01','2026-09-30');d.archive(p);const saved=p.teacherTimeZone;const st=d.copy(d.data.settings);st.teacherTimeZone='Europe/London';d.saveSettings(st);assert.equal(p.teacherTimeZone,saved);assert.equal(saved,'Africa/Cairo')});
check('P archived report freezes student timezone',()=>{const d=createMiaadDomain({settings:{teacherTimeZone:'Africa/Cairo'}},{},()=>new Date('2026-09-20T12:00Z')),s=d.saveStudent({id:'p',name:'P',startDate:'2026-09-01',timeZone:'Asia/Tashkent',custom:false,settings:{}}),p=d.createPeriod(s.id,'2026-09-01','2026-09-30');d.archive(p);d.data.students[s.id].timeZone='America/Chicago';assert.equal(p.studentTimeZone,'Asia/Tashkent')});
check('Q spring-forward compatible gap',()=>assert.equal(MiaadTemporal.resolveWallClock('2026-03-08','02:30','America/New_York').toISOString(),'2026-03-08T07:30:00.000Z'));
check('R fall-back chooses earlier instant',()=>assert.equal(MiaadTemporal.resolveWallClock('2026-11-01','01:30','America/New_York').toISOString(),'2026-11-01T05:30:00.000Z'));
check('S normal wall time resolves exactly',()=>assert.equal(MiaadTemporal.resolveWallClock('2026-02-03','09:15','America/New_York').toISOString(),'2026-02-03T14:15:00.000Z'));
check('T invalid IANA timezone rejected',()=>{const d=createMiaadDomain({settings:{teacherTimeZone:'UTC'}},{},()=>new Date('2026-09-01T00:00Z')),s=d.copy(d.data.settings);s.teacherTimeZone='UTC+3';assert.throws(()=>d.saveSettings(s));assert.equal(MiaadTemporal.validTimeZone('GMT-5'),false)});
check('U missing legacy teacherTimeZone gets device-zone default',()=>{const z=cp.execFileSync(process.execPath,[__filename,'--legacy-zone'],{env:{...process.env,TZ:'Europe/London'},encoding:'utf8'});assert.equal(z,'Europe/London')});
check('V explicit teacher authority survives device-zone changes',()=>{assert.equal(la.today,cairoDevice.today);assert.equal(la.upcoming.at,cairoDevice.upcoming.at)});
check('W stored civil schedule/record fields are not migrated',()=>{const seed={settings:{teacherTimeZone:'Africa/Cairo'},students:{s:{id:'s',name:'S',startDate:'2026-01-01',custom:false,settings:{}}},schedules:{x:[{from:'0001-01-01',lesson:{id:'x',studentId:'s',name:'S',day:2,start:'09:20',duration:30,repeat:'weekly'}}]},records:{r:{id:'r',studentId:'s',name:'S',date:'2026-09-08',time:'09:20',duration:30,status:'entered'}},periods:{},cycles:{},notifications:{},activity:[]};const before=JSON.stringify({start:seed.schedules.x[0].lesson.start,day:seed.schedules.x[0].lesson.day,date:seed.records.r.date,time:seed.records.r.time}),d=createMiaadDomain(seed,{},()=>new Date('2026-09-10T00:00Z')),after=JSON.stringify({start:d.data.schedules.x[0].lesson.start,day:d.data.schedules.x[0].lesson.day,date:d.data.records.r.date,time:d.data.records.r.time});assert.equal(after,before)});
check('X schemaVersion remains 4',()=>assert.equal(createMiaadDomain({settings:{teacherTimeZone:'UTC'}}).data.version,4));
check('Y legacy archived period gets explicit compatibility backfill',()=>{const seed={settings:{teacherTimeZone:'Africa/Cairo'},students:{s:{id:'s',name:'S',startDate:'2026-01-01',timeZone:'',custom:false,settings:{}}},periods:{p:{id:'p',studentId:'s',start:'2026-08-01',end:'2026-08-31',archived:true,rows:[]}},schedules:{},records:{},cycles:{},notifications:{},activity:[]},d=createMiaadDomain(seed);assert.equal(d.data.periods.p.teacherTimeZone,'Africa/Cairo');assert.equal(d.data.periods.p.studentTimeZone,'');assert.equal(d.data.periods.p.timeZoneContextSource,'slice2-compat')});
check('Z student timezone remains display-only',()=>{const cairo=MiaadTemporal.resolveWallClock('2026-10-06','09:00','Africa/Cairo'),student=MiaadTemporal.civilTimeAt(cairo,'Asia/Tashkent');assert.equal(student,'11:00:00')});
check('AA daily notification DST gap uses same compatible instant',()=>{const at=MiaadTemporal.resolveWallClock('2026-03-08','02:30','America/New_York'),d=createMiaadDomain({settings:{teacherTimeZone:'America/New_York',notifications:{upcoming:false,cycle:false,period:false,pending:false,daily:true,availability:false,dailyTime:'02:30'}}},{},()=>new Date(+at-1));assert.equal(d.notifications(new Date(+at-1)).some(n=>n.type==='daily'),false);assert.equal(d.notifications(at).some(n=>n.type==='daily'),true)});
check('AB pure civil date arithmetic ignores device DST',()=>{assert.equal(MiaadTemporal.addDays('2026-03-08',1),'2026-03-09');assert.equal(MiaadTemporal.weekdayForDate('2026-03-08'),0);assert.deepEqual(MiaadTemporal.monthBounds('2026-10'),{start:'2026-10-01',end:'2026-10-31'})});

check('AC first legacy initialization chooses process device IANA zone once',()=>{const zone=cp.execFileSync(process.execPath,[__filename,'--legacy-zone'],{env:{...process.env,TZ:'Pacific/Honolulu'},encoding:'utf8'});assert.equal(zone,'Pacific/Honolulu')});
check('AD reopen initialized state in another device zone preserves established authority',()=>{const seed=Buffer.from(JSON.stringify({settings:{teacherTimeZone:'Pacific/Honolulu'}})).toString('base64'),zone=cp.execFileSync(process.execPath,[__filename,'--seed-zone',seed],{env:{...process.env,TZ:'Pacific/Kiritimati'},encoding:'utf8'});assert.equal(zone,'Pacific/Honolulu')});
check('AE native primary missing zone inherits only established local timezone',()=>{const native={settings:{target:9},students:{native:{id:'native'}}},local={settings:{teacherTimeZone:'Africa/Cairo',target:77},students:{local:{id:'local'}}};let persists=0;const context={createMiaadDomain,stabilizeMiaadTeacherTimeZoneSeed,nativeInitial:{domain:native},loadJSON:()=>local,lessons:[],sessionState:{},sessionNotes:{},sessionAudit:{},idrisPhase:0,persist:()=>persists++,renderAll:()=>{}};vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(root,'app-integration.js'),'utf8'),context);const state=vm.runInContext('domain.data',context);assert.equal(state.settings.teacherTimeZone,'Africa/Cairo');assert.equal(state.settings.target,9);assert.ok(state.students.native);assert.equal(state.students.local,undefined);assert.equal(persists,0)});
check('AF replace missing or blank timezone preserves current authority',()=>{for(const settings of [{target:7},{teacherTimeZone:'',target:8}]){const d=createMiaadDomain({settings:{teacherTimeZone:'Africa/Cairo'}},{},()=>new Date('2026-09-01T00:00Z'));d.replace({settings});assert.equal(d.teacherZone(),'Africa/Cairo')}});
check('AG merge missing or blank timezone preserves current authority',()=>{for(const settings of [{target:7},{teacherTimeZone:'',target:8}]){const d=createMiaadDomain({settings:{teacherTimeZone:'Africa/Cairo'}},{},()=>new Date('2026-09-01T00:00Z'));d.merge({settings});assert.equal(d.teacherZone(),'Africa/Cairo')}});
check('AH legacy merge after explicit teacher-zone change preserves newest authority',()=>{const d=createMiaadDomain({settings:{teacherTimeZone:'Africa/Cairo'}},{},()=>new Date('2026-09-01T00:00Z')),settings=d.copy(d.data.settings);settings.teacherTimeZone='Europe/London';d.saveSettings(settings);d.merge({settings:{target:11}});assert.equal(d.teacherZone(),'Europe/London')});
check('AI explicit valid replace and merge may intentionally change authority',()=>{const a=createMiaadDomain({settings:{teacherTimeZone:'Africa/Cairo'}},{},()=>new Date('2026-09-01T00:00Z'));a.replace({settings:{teacherTimeZone:'Europe/London'}});assert.equal(a.teacherZone(),'Europe/London');const b=createMiaadDomain({settings:{teacherTimeZone:'Africa/Cairo'}},{},()=>new Date('2026-09-01T00:00Z'));b.merge({settings:{teacherTimeZone:'Asia/Tokyo'}});assert.equal(b.teacherZone(),'Asia/Tokyo')});
check('AJ explicit invalid replace and merge fail closed before authority mutation',()=>{const a=createMiaadDomain({settings:{teacherTimeZone:'Africa/Cairo'}},{},()=>new Date('2026-09-01T00:00Z')),beforeA=JSON.stringify(a.data);assert.throws(()=>a.replace({settings:{teacherTimeZone:'UTC+3'}}));assert.equal(a.teacherZone(),'Africa/Cairo');assert.equal(JSON.stringify(a.data),beforeA);const b=createMiaadDomain({settings:{teacherTimeZone:'Africa/Cairo'}},{},()=>new Date('2026-09-01T00:00Z')),beforeB=JSON.stringify(b.data);assert.throws(()=>b.merge({settings:{teacherTimeZone:'UTC+3'}}));assert.equal(b.teacherZone(),'Africa/Cairo');assert.equal(JSON.stringify(b.data),beforeB)});
check('AK canonical civil factory remains invariant across Honolulu and Kiritimati',()=>{const a=cp.execFileSync(process.execPath,[__filename,'--hotfix-civil'],{env:{...process.env,TZ:'Pacific/Honolulu'},encoding:'utf8'}),b=cp.execFileSync(process.execPath,[__filename,'--hotfix-civil'],{env:{...process.env,TZ:'Pacific/Kiritimati'},encoding:'utf8'});assert.equal(a,'2026-01-01');assert.equal(b,'2026-01-01')});
check('AL final app-ui-hotfix calendar path uses canonical YYYY-MM-DD factory only',()=>{const source=fs.readFileSync(path.join(root,'app-ui-hotfix.js'),'utf8');assert.match(source,/const civilKey=/);assert.match(source,/window\.miaadCivilDate\(key\)/);assert.doesNotMatch(source,/startOfDay\(new Date\(y,m,d/);assert.doesNotMatch(source,/const localDate=.*new Date\(y,m,d/)});

const failures=cases.filter(x=>!x.ok);
if(failures.length){console.error('TIMEZONE/DST CONTRACT FAILURES');for(const f of failures)console.error(`- ${f.id}: ${f.error}`);console.error(`FAILED ${failures.length}/${cases.length} cases`);process.exit(1)}
console.log(`PHASE 1B TIMEZONE/DST CONTRACT PASS: ${cases.length}/${cases.length} focused cases`);
