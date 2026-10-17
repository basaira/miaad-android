const DAYS=["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"];
const SHORT=["أحد","اثن","ثلا","أرب","خمي","جمع","سبت"];
const PALETTES=[["#dfeae4","#25473a"],["#e6e2ef","#4d4163"],["#f0e1d9","#74473a"],["#dce9ef","#315b6f"],["#ece7d8","#66572f"],["#e0e8d8","#49613b"],["#efe0e3","#74414b"],["#dfe4ea","#445366"]];
const iconPaths={
 calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
 week:'<path d="M4 5h16M4 12h16M4 19h16"/><path d="M8 3v4M14 10v4M10 17v4"/>',
 users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
 sliders:'<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3"/><path d="M1 14h6M9 8h6M17 16h6"/>',
 bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
 check:'<path d="M20 6 9 17l-5-5"/>',more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
 note:'<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/>',
 userx:'<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m17 8 5 5M22 8l-5 5"/>',
 edit:'<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/>',
 search:'<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 report:'<path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/>',
 magic:'<path d="m12 3 1.2 3.2L16.5 7.5l-3.3 1.3L12 12l-1.2-3.2-3.3-1.3 3.3-1.3L12 3Z"/><path d="M5 14l.8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14Z"/>',
 missed:'<path d="m4 4 16 16"/><circle cx="12" cy="12" r="9"/>'
};
function svgIcon(name){return `<svg viewBox="0 0 24 24" aria-hidden="true">${iconPaths[name]||''}</svg>`}
document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=svgIcon(el.dataset.icon));
document.getElementById('bellBtn').innerHTML=svgIcon('bell');

const BASE=[
{id:'omi-sun',name:'عمر وموسى وعيسى',day:0,start:'17:00',duration:150,maxDuration:180,repeat:'weekly',reminder:30,note:'بعد العصر · المدة المعتادة 2:30 وقد تمتد إلى 3:00'},
{id:'omi-tue',name:'عمر وموسى وعيسى',day:2,start:'17:00',duration:150,maxDuration:180,repeat:'weekly',reminder:30,note:'بعد العصر · المدة المعتادة 2:30 وقد تمتد إلى 3:00'},
{id:'omi-thu',name:'عمر وموسى وعيسى',day:4,start:'17:00',duration:150,maxDuration:180,repeat:'weekly',reminder:30,note:'بعد العصر · المدة المعتادة 2:30 وقد تمتد إلى 3:00'},

{id:'moh-sw-sat',name:'محمد — السويد',day:6,start:'',duration:30,repeat:'flex',reminder:20,displayTime:'بعد المغرب',note:'الوقت بالدقيقة غير محدد؛ يُعرض بعد المغرب حتى تحدد ساعة.'},
{id:'moh-sw-mon',name:'محمد — السويد',day:1,start:'',duration:30,repeat:'flex',reminder:20,displayTime:'بعد المغرب',note:'الوقت بالدقيقة غير محدد؛ يُعرض بعد المغرب حتى تحدد ساعة.'},
{id:'moh-sw-wed',name:'محمد — السويد',day:3,start:'',duration:30,repeat:'flex',reminder:20,displayTime:'بعد المغرب',note:'الوقت بالدقيقة غير محدد؛ يُعرض بعد المغرب حتى تحدد ساعة.'},

{id:'mah-rus-sun',name:'محبة الله — روسيا',day:0,start:'10:00',duration:60,repeat:'weekly',reminder:20,note:'10:00–11:00'},
{id:'mah-rus-mon',name:'محبة الله — روسيا',day:1,start:'09:20',duration:60,repeat:'weekly',reminder:20,note:'09:20–10:20'},
{id:'mah-rus-wed',name:'محبة الله — روسيا',day:3,start:'09:20',duration:60,repeat:'weekly',reminder:20,note:'09:20–10:20'},

{id:'idris-wed',name:'إدريس',day:3,start:'11:00',duration:60,repeat:'biweekly',reminder:30,note:'أسبوع وأسبوع · 11:00–12:00'},
{id:'idris-thu',name:'إدريس',day:4,start:'11:00',duration:60,repeat:'biweekly',reminder:30,note:'أسبوع وأسبوع · 11:00–12:00'},
{id:'idris-fri',name:'إدريس',day:5,start:'11:00',duration:60,repeat:'biweekly',reminder:30,note:'أسبوع وأسبوع · 11:00–12:00'},

{id:'omar-us-sat',name:'عمر — أمريكا',day:6,start:'09:00',duration:60,repeat:'weekly',reminder:30,note:'09:00–10:00'},
{id:'omar-us-sun',name:'عمر — أمريكا',day:0,start:'09:00',duration:60,repeat:'weekly',reminder:30,note:'09:00–10:00'},
{id:'omar-us-tue',name:'عمر — أمريكا',day:2,start:'00:00',duration:60,repeat:'weekly',reminder:30,note:'منتصف الليل (12:00 صباحًا)'},
{id:'omar-us-thu',name:'عمر — أمريكا',day:4,start:'00:00',duration:60,repeat:'weekly',reminder:30,note:'منتصف الليل (12:00 صباحًا)'},

{id:'abd-sat',name:'عبد الرحمن',day:6,start:'10:30',duration:30,repeat:'weekly',reminder:20,note:'درس نصف ساعة'},
{id:'abd-sun',name:'عبد الرحمن',day:0,start:'08:00',duration:30,repeat:'weekly',reminder:20,note:'درس نصف ساعة'},
{id:'abd-mon',name:'عبد الرحمن',day:1,start:'01:00',duration:30,repeat:'weekly',reminder:20,note:'01:00 بعد منتصف الليل · نصف ساعة'},
{id:'abd-wed',name:'عبد الرحمن',day:3,start:'01:00',duration:30,repeat:'weekly',reminder:20,note:'01:00 بعد منتصف الليل · نصف ساعة'},

{id:'aman-mon',name:'أمان',day:1,start:'12:30',duration:30,repeat:'weekly',reminder:20,note:'درس نصف ساعة'},
{id:'aman-tue',name:'أمان',day:2,start:'12:00',duration:30,repeat:'weekly',reminder:20,note:'درس نصف ساعة'},
{id:'aman-wed',name:'أمان',day:3,start:'12:30',duration:30,repeat:'weekly',reminder:20,note:'درس نصف ساعة'},
{id:'aman-thu',name:'أمان',day:4,start:'12:00',duration:30,repeat:'weekly',reminder:20,note:'درس نصف ساعة'},

{id:'azim-mon',name:'عظيم',day:1,start:'18:10',duration:0,repeat:'weekly',reminder:20,note:'بعد العصر · المدة لم تُحدد بعد'},
{id:'azim-wed',name:'عظيم',day:3,start:'18:10',duration:0,repeat:'weekly',reminder:20,note:'بعد العصر · المدة لم تُحدد بعد'}
];

const STORAGE={lessons:'miadLessonsV2',state:'miadSessionStateV2',notes:'miadSessionNotesV2',audit:'miadSessionAuditV2',phase:'miadIdrisPhaseV2',updated:'miadUpdatedAtV1'};
const memoryStore=Object.create(null);
const store={get(key){try{return window.localStorage.getItem(key)}catch{return Object.prototype.hasOwnProperty.call(memoryStore,key)?memoryStore[key]:null}},set(key,value){try{window.localStorage.setItem(key,String(value));return true}catch{memoryStore[key]=String(value);return false}}};
function loadJSON(key,fallback){try{return JSON.parse(store.get(key)||'null')??fallback}catch{return fallback}}
const NATIVE=typeof window.AndroidBridge!=='undefined'?window.AndroidBridge:null;
let nativeSnapshotParseFailed=false;
function nativeSeed(){if(!NATIVE||typeof NATIVE.loadSnapshot!=='function')return null;
 try{const raw=NATIVE.loadSnapshot();if(!raw)return null;const parsed=JSON.parse(raw);
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))nativeSnapshotParseFailed=true;
  return parsed
 }catch{nativeSnapshotParseFailed=true;return null}
}
function normalizeSchedule(items){return items.map(l=>{
 if(l.id?.startsWith('moh-sw-')&&l.start==='18:30'&&l.repeat==='flex'&&l.displayTime==='بعد المغرب'&&l.note==='الوقت بالدقيقة غير محدد؛ 18:30 للترتيب الداخلي فقط.')
   return {...l,start:'',note:'الوقت بالدقيقة غير محدد؛ يُعرض بعد المغرب حتى تحدد ساعة.'};
 return l;
})}
function hasFixedTime(l){return /^([01]\d|2[0-3]):[0-5]\d$/.test(l.start||'')}
const nativeInitial=nativeSeed();
let lessons=Array.isArray(nativeInitial?.lessons)?nativeInitial.lessons:loadJSON(STORAGE.lessons,loadJSON('miadLessonsV1',BASE));
// Defer normalization until initial snapshot provenance has been validated.
lessons=Array.isArray(lessons)?lessons:[];
let sessionState=nativeInitial?.sessionState&&typeof nativeInitial.sessionState==='object'?nativeInitial.sessionState:loadJSON(STORAGE.state,loadJSON('miadSessionStateV1',{}));
let sessionNotes=nativeInitial?.sessionNotes&&typeof nativeInitial.sessionNotes==='object'?nativeInitial.sessionNotes:loadJSON(STORAGE.notes,loadJSON('miadSessionNotesV1',{}));
let sessionAudit=nativeInitial?.sessionAudit&&typeof nativeInitial.sessionAudit==='object'?nativeInitial.sessionAudit:loadJSON(STORAGE.audit,{});
let idrisPhase=Number(nativeInitial?.idrisPhase??store.get(STORAGE.phase)??store.get('miadIdrisPhaseV1')??'0');
let lastUpdatedAt=Number(nativeInitial?.updatedAt??store.get(STORAGE.updated)??0);
let nativeSyncState=NATIVE?'connecting':'browser';
let selectedDate=startOfDay(new Date()),currentFocus=null,sheetContextDate=null,reportCache=null;
let currentView='today',freeWindowsExpanded=false,editorDirty=false;
const viewScroll={today:0,week:0,students:0,report:0,settings:0};

function snapshotData(){return{schemaVersion:4,updatedAt:lastUpdatedAt,lessons,sessionState,sessionNotes,sessionAudit,idrisPhase,domain:domain.data}}
function saveLocalState(){if(typeof startupRecoveryBlocked!=='undefined'&&startupRecoveryBlocked)return false;store.set("miaadDomainV4",JSON.stringify(domain.data));store.set(STORAGE.lessons,JSON.stringify(lessons));store.set(STORAGE.state,JSON.stringify(sessionState));store.set(STORAGE.notes,JSON.stringify(sessionNotes));store.set(STORAGE.audit,JSON.stringify(sessionAudit));store.set(STORAGE.phase,String(idrisPhase));store.set(STORAGE.updated,String(lastUpdatedAt))}
function persist(){if(typeof startupRecoveryBlocked!=='undefined'&&startupRecoveryBlocked)return false;domain.notifications();lastUpdatedAt=Math.max(Date.now(),lastUpdatedAt+1);saveLocalState();if(NATIVE&&typeof NATIVE.saveSnapshot==='function'){try{NATIVE.saveSnapshot(JSON.stringify(snapshotData()))}catch{}}syncNativeReminders()}
function cloudCivilDate(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const year=+value.slice(0,4),month=+value.slice(5,7),day=+value.slice(8,10),date=new Date(0);
 date.setUTCHours(0,0,0,0);date.setUTCFullYear(year,month-1,day);
 return date.getUTCFullYear()===year&&date.getUTCMonth()+1===month&&date.getUTCDate()===day
}
function cloudId(value){return typeof value==='string'&&!!value.trim()}
// Validate present modern Cloud settings before Domain replacement or any sync side effect.
// Absent optional settings retain the Domain v4 defaults (including old snapshots).
// Only present, product-defined Boolean settings must be Boolean. Omitted
// historical v4 keys inherit Domain defaults; no coercion or mutation.
function validCloudBooleanSettings(settings){
 if(!isDomainMap(settings))return false;
 const owns=(o,key)=>Object.prototype.hasOwnProperty.call(o,key);
 for(const key of ['autoCycle','autoPeriod','showNotes']){
  if(owns(settings,key)&&typeof settings[key]!=='boolean')return false;
 }
 for(const [group,names] of [
  ['rules',['entered','absent','student_cancelled','missed','notheld','rescheduled','makeup']],
  ['notifications',['upcoming','cycle','period','pending','daily','availability']]
 ]){
  if(!owns(settings,group))continue;
  if(!isDomainMap(settings[group]))return false;
  for(const key of names){
   if(owns(settings[group],key)&&typeof settings[group][key]!=='boolean')return false;
  }
 }
 return true
}
function validCloudSettings(settings){
 if(!validCloudBooleanSettings(settings))return false;
 // Omitted v4 fields retain Domain defaults; do not mutate or coerce payloads.
 // Numeric strings are compatible with the real positive()/periodBounds() consumers.
 const present=key=>Object.prototype.hasOwnProperty.call(settings,key);
 const number=value=>typeof value==='number'&&Number.isFinite(value)||
  typeof value==='string'&&/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)&&Number.isFinite(+value);
 const integer=value=>number(value)&&Number.isSafeInteger(+value);
 for(const key of ['target','duration','minSlot']){
  if(present(key)&&(!integer(settings[key])||+settings[key]<1))return false
 }
 if(present('buffer')&&(!number(settings.buffer)||+settings.buffer<0))return false;
 if(present('periodDay')&&(!integer(settings.periodDay)||+settings.periodDay<1||+settings.periodDay>31))return false;
 if(present('periodMode')&&!['calendar','monthly','custom'].includes(settings.periodMode))return false;
 if(present('language')&&!['ar','en'].includes(settings.language))return false;
 if(present('teacherTimeZone')&&(typeof settings.teacherTimeZone!=='string'||
  settings.teacherTimeZone.trim()!==''&&!MiaadTemporal.validTimeZone(settings.teacherTimeZone.trim())))return false;
 const has=(key)=>Object.prototype.hasOwnProperty.call(settings,key);
 const time=/^([01]\d|2[0-3]):[0-5]\d$/;
 const endTime=(value)=>typeof value==='string'&&(time.test(value)||value==='24:00');
 const interval=(pair)=>Array.isArray(pair)&&pair.length===2&&
  typeof pair[0]==='string'&&time.test(pair[0])&&endTime(pair[1])&&pair[0]!==pair[1];
 if(has('working')){
  if(!isDomainMap(settings.working))return false;
  for(const [day,pairs] of Object.entries(settings.working)){
   if(!/^[0-6]$/.test(day)||!Array.isArray(pairs)||pairs.some(pair=>!interval(pair)))return false;
  }
 }
 if(has('blocked')){
  if(!Array.isArray(settings.blocked))return false;
  for(const block of settings.blocked){
   if(!isDomainMap(block)||!interval([block.start,block.end]))return false;
   const hasDate=Object.prototype.hasOwnProperty.call(block,'date');
   const hasDay=Object.prototype.hasOwnProperty.call(block,'day');
   if(!hasDate&&!hasDay)return false;
   if(hasDate&&!cloudCivilDate(block.date))return false;
   if(hasDay&&(!Number.isInteger(block.day)||block.day<0||block.day>6))return false;
  }
 }
 if(has('notifications')){
  if(!isDomainMap(settings.notifications))return false;
  if(Object.prototype.hasOwnProperty.call(settings.notifications,'dailyTime')&&
     (typeof settings.notifications.dailyTime!=='string'||!time.test(settings.notifications.dailyTime)))return false;
 }
 if(has('rules')&&!isDomainMap(settings.rules))return false;
 return true;
}
function validCloudStudent(key,student){
 return isDomainMap(student)&&cloudId(key)&&student.id===key&&
  cloudId(student.name)&&cloudCivilDate(student.startDate)&&
  (student.custom===undefined||typeof student.custom==='boolean')&&
  (student.settings===undefined||validCloudSettings(student.settings))
}
function validCloudRecord(key,record,students){
 return isDomainMap(record)&&cloudId(key)&&record.id===key&&
  cloudId(record.studentId)&&Object.prototype.hasOwnProperty.call(students,record.studentId)&&
  cloudCivilDate(record.date)&&
  ['entered','absent','student_cancelled','missed','notheld','rescheduled','makeup','pending'].includes(record.status)&&
  (record.scheduleId===undefined||cloudId(record.scheduleId))&&
  (record.time===undefined||typeof record.time==='string'&&
   (record.time===''||/^([01]\d|2[0-3]):[0-5]\d$/.test(record.time)))&&
  typeof record.duration==='number'&&Number.isFinite(record.duration)&&record.duration>=0&&
  (record.actualMinutes===undefined||typeof record.actualMinutes==='number'&&Number.isFinite(record.actualMinutes)&&record.actualMinutes>=0)&&
  (record.note===undefined||typeof record.note==='string')&&
  (record.countOverride===undefined||record.countOverride===null||typeof record.countOverride==='boolean')&&
  (record.deleted===undefined||typeof record.deleted==='boolean')
}
function validCloudSchedule(key,revisions,students){
 if(!cloudId(key)||!Array.isArray(revisions)||!revisions.length)return false;
 let previous='';
 for(const revision of revisions){
  if(!isDomainMap(revision)||!cloudCivilDate(revision.from)||revision.from<=previous)return false;
  previous=revision.from;
  if(revision.lesson===null)continue;
  const lesson=revision.lesson;
  if(!isDomainMap(lesson)||lesson.id!==key||
     !cloudId(lesson.studentId)||!Object.prototype.hasOwnProperty.call(students,lesson.studentId)||
     !Number.isInteger(lesson.day)||lesson.day<0||lesson.day>6||
     typeof lesson.start!=='string'||lesson.start!==''&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(lesson.start)||
     lesson.start===''&&!cloudId(lesson.displayTime)||
     !(typeof lesson.duration==='number'||typeof lesson.duration==='string'&&!!lesson.duration.trim())||
     !Number.isFinite(+lesson.duration)||+lesson.duration<0||
     !['weekly','biweekly','flex'].includes(lesson.repeat))return false
 }
 return true
}
function classifyCloudDomainPayload(data){
 if(!data||typeof data!=='object'||Array.isArray(data))return'invalid';
 if(!Object.prototype.hasOwnProperty.call(data,'domain'))return'legacy';
 const value=data.domain;
 if(!isModernDomainPayload(value)||value.version!==4||
    !isDomainMap(value.cycles)||!isDomainMap(value.periods)||
    !isDomainMap(value.notifications)||!Array.isArray(value.activity))return'invalid';
 for(const key of ['cycles','periods','notifications']){
  if(Object.values(value[key]).some(entry=>!isDomainMap(entry)))return'invalid'
 }
 if(Object.entries(value.students).some(([key,student])=>!validCloudStudent(key,student))||
    Object.entries(value.records).some(([key,record])=>!validCloudRecord(key,record,value.students))||
    Object.entries(value.schedules).some(([key,revisions])=>!validCloudSchedule(key,revisions,value.students)))return'invalid';
 if(!validCloudSettings(value.settings)||value.activity.some(entry=>!isDomainMap(entry)))return'invalid';
 return'modern'
}
window.__miaadReceiveCloud=function(raw){
 try{
  const data=JSON.parse(raw),incoming=Number(data?.updatedAt),classification=classifyCloudDomainPayload(data);
  if(classification==='invalid'||!Number.isFinite(incoming)||!Array.isArray(data.lessons)||incoming<=lastUpdatedAt)return;
  const nextLessons=normalizeSchedule(data.lessons);
  domain.replace(classification==='modern'?data.domain:domain.data,classification==='modern'?{}:data,{migrateLegacy:classification==='legacy'});
  if(typeof startupRecoveryBlocked!=='undefined'&&startupRecoveryBlocked){
   startupRecoveryBlocked=false;
   document.getElementById('miaadStartupRecoveryBlock')?.remove();
  }
  lessons=nextLessons;
  sessionState=data.sessionState||{};
  sessionNotes=data.sessionNotes||{};
  sessionAudit=data.sessionAudit||{};
  idrisPhase=Number(data.idrisPhase||0);
  if(typeof refreshLegacyOccurrenceMirrors==='function')refreshLegacyOccurrenceMirrors();
  lastUpdatedAt=incoming;
  saveLocalState();
  nativeSyncState='synced';
  if(typeof renderAll==='function')renderAll();
  if(typeof showToast==='function')showToast('تمت مزامنة بيانات مِيعاد')
 }catch{}
};
window.__miaadNativeStatus=function(status){nativeSyncState=(typeof startupRecoveryBlocked!=='undefined'&&startupRecoveryBlocked)?'recovery-required':status||'local-only';const el=document.getElementById('syncStatus');if(el){const labels={connecting:'جارٍ الاتصال…','cloud-ready':'Firebase جاهز',synced:'متزامن الآن','cloud-pending':'محفوظ محليًا · المزامنة معلقة','local-only':'محلي فقط',browser:'نسخة ويب','reminder-error':'مشكلة في جدولة التنبيه','recovery-required':'استعادة البيانات مطلوبة · لن تُحفظ التعديلات'};el.textContent=labels[nativeSyncState]||nativeSyncState}if(typeof renderHeader==='function')renderHeader()};
function startOfDay(d){const x=new Date(d);x.setHours(0,0,0,0);return x}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
function getSunday(d){const x=startOfDay(d);x.setDate(x.getDate()-x.getDay());return x}
function pad(n){return String(n).padStart(2,'0')}
function dateKey(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`}
function fmtDate(d,opts={weekday:'long',day:'numeric',month:'long'}){return d.toLocaleDateString('ar-EG',opts)}
function weekIndex(d){const anchor=new Date(2026,8,6);return Math.floor((getSunday(d)-getSunday(anchor))/(7*86400000))}
function idrisActive(d){return ((weekIndex(d)+idrisPhase)%2+2)%2===0}
function occurs(l,d){return l.repeat!=='biweekly'||idrisActive(d)}
function toMinutes(t){const [h,m]=String(t||'00:00').split(':').map(Number);return h*60+m}
function toSeconds(t){const [h,m,s=0]=String(t||'00:00').split(':').map(Number);return h*3600+m*60+s}
function timeDate(d,t){const x=new Date(d),[h,m,s=0]=String(t||'00:00').split(':').map(Number);x.setHours(h,m,s,0);return x}
function secondsLabel(sec){sec=Math.max(0,Math.floor(sec));const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),ss=sec%60;return `${pad(h)}:${pad(m)}:${pad(ss)}`}
function secToClock(sec){sec=((Math.round(sec)%86400)+86400)%86400;return `${pad(Math.floor(sec/3600))}:${pad(Math.floor((sec%3600)/60))}`}
function humanDuration(sec,{withSeconds=false}={}){sec=Math.max(0,Math.floor(sec));const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),ss=sec%60,parts=[];if(h)parts.push(h===1?'ساعة':h===2?'ساعتان':`${h} ساعات`);if(m)parts.push(m===1?'دقيقة':m===2?'دقيقتان':`${m} دقيقة`);if(withSeconds&&ss)parts.push(`${ss} ث`);return parts.join(' و ')||(withSeconds?`${ss} ث`:'أقل من دقيقة')}
function bdiTime(sec){return `<bdi dir="ltr">${secToClock(sec)}</bdi>`}
function freeWindowLabel(w){const start=bdiTime(w.start),end=w.end>=86400?'نهاية اليوم':bdiTime(w.end);return `من ${start} إلى ${end}`}
function editorState(text,dirty=false){const el=document.getElementById('editorSaveState');if(!el)return;el.textContent=text;el.classList.toggle('dirty',dirty)}
function markEditorDirty(){editorDirty=true;editorState('غير محفوظ',true)}

function endLabel(l){if(!l.duration||!hasFixedTime(l))return '';return secToClock(toSeconds(l.start)+l.duration*60)}
function keyFor(l,d){return l.recordId||`${dateKey(d)}__${l.id}`}
function initials(name){return name.replace(/—.*/,'').trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('')}
function palette(name){let s=0;for(const c of name)s+=c.charCodeAt(0);return PALETTES[s%PALETTES.length]}
function lessonsForDate(d){if(typeof domain==='undefined')return lessons.filter(l=>l.day===d.getDay()&&occurs(l,d));return domain.occurrences(dateKey(d)).filter(r=>!['student_cancelled','missed','notheld','rescheduled'].includes(r.status)).map(r=>({...r.schedule,id:r.scheduleId||r.id,recordId:r.id,studentId:r.studentId,name:r.name,start:r.time,displayTime:r.displayTime,duration:r.duration,maxDuration:r.maxDuration,day:d.getDay(),status:r.status}))}
function stateText(s){return s==='entered'?'دخلت':s==='missed'?'لم أدخل':s==='absent'?'غاب':s==='notheld'?'لم يتم':s==='unmarked'?'بلا تسجيل':s==='upcoming'?'قادم':'قادم'}
function stateClass(s){return s||''}
function tap(){if(navigator.vibrate)navigator.vibrate(10)}
function showToast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove('show'),1900)}
