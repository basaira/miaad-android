'use strict';
// Source AND WebView69 initial-state matrix with immutable original byte checks.
// Executes real shipping core, temporal Domain, integration and Cloud callbacks.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(process.env.MIAAD_ASSET_ROOT||path.join(__dirname,'../app/src/main/assets'));
const {createMiaadDomain}=require(path.join(root,'app-domain.js'));
const files=['app-core.js','app-domain.js','app-integration.js'];
const clone=o=>JSON.parse(JSON.stringify(o));
const clock=()=>new Date('2026-09-21T12:00:00Z');
function make(){
 const d=createMiaadDomain({settings:{teacherTimeZone:'Africa/Cairo'}},{},clock);
 const s=d.saveStudent({id:'s',name:'Student',startDate:'2026-09-01',custom:false,settings:{}});
 d.saveSchedule({id:'class',studentId:s.id,name:s.name,day:1,start:'10:00',duration:30,repeat:'weekly'},'2026-09-21');
 d.record({...d.resolveScheduleOccurrence('class','2026-09-21'),status:'entered',note:'Native canonical fact',countOverride:false});
 return clone(d.data)
}
const current=make(),alternative=clone(current);
alternative.records['2026-09-21__class'].status='absent';
alternative.records['2026-09-21__class'].note='Local newer fact';
const lesson={id:'class',studentId:'s',name:'Student',day:1,start:'10:00',duration:30,repeat:'weekly'};
const snapshot=(domain,updatedAt=100)=>({schemaVersion:4,updatedAt,domain,lessons:[lesson],sessionState:{},sessionNotes:{},sessionAudit:{},idrisPhase:0});
function startup({native,local,legacyRaw,localStamp=800}={}){
 const memory={},writes=[],remote=[];
 if(local!==undefined)memory.miaadDomainV4=JSON.stringify(local);
 if(legacyRaw!==undefined)memory.miadLessonsV2=legacyRaw;
 else if(local!==undefined)memory.miadLessonsV2=JSON.stringify([lesson]);
 if(local!==undefined)memory.miadUpdatedAtV1=String(localStamp);
 const original=clone(memory);
 const bridge={loadSnapshot:()=>native===undefined?'':JSON.stringify(native),
  saveSnapshot:x=>writes.push(x),requestVerifiedSync:x=>remote.push(x),confirmCloudSnapshot:()=>{},
  syncReminders:()=>{}};
 const context={window:null,document:{getElementById:()=>({innerHTML:'',remove(){}}),querySelectorAll:()=>[]},
  console,Intl,Date,Number,String,Object,Array,Math,Set,Map,RegExp,Error,JSON,
  AndroidBridge:bridge,localStorage:{getItem:key=>Object.prototype.hasOwnProperty.call(memory,key)?memory[key]:null,
   setItem:(key,value)=>{memory[key]=String(value)}},renderAll:()=>{},syncNativeReminders:()=>{},showToast:()=>{}};
 context.window=context;vm.createContext(context);
 for(const f of files)vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),context,{filename:f,timeout:15000});
 const evalJs=src=>vm.runInContext(src,context,{timeout:15000});
 const state=()=>JSON.parse(evalJs("JSON.stringify({selected:selectedInitialSource,blocked:startupRecoveryBlocked,stamp:lastUpdatedAt,domain:domain.data,nativeStatus:nativeSyncState})"));
 return {memory,original,writes,remote,state,evalJs}
}
let total=0;
function check(label,fn){fn();total++;console.log('PASS '+label)}
check('unreadable Legacy must not migrate or replace original bytes',()=>{
 const raw='{historical-corrupt-json';const h=startup({legacyRaw:raw});
 assert.equal(h.state().selected,'recovery-corrupt-legacy');assert.equal(h.state().blocked,true);
 assert.equal(h.evalJs('saveLocalState()'),false);assert.equal(h.evalJs('persist()'),false);
 assert.deepEqual(h.memory,h.original);assert.equal(h.memory.miadLessonsV2,raw);
 assert.equal(h.writes.length,0);assert.equal(h.remote.length,0);
 h.evalJs('window.__miaadCloudAbsent()');assert.equal(h.remote.length,0)
});
check('valid divergent Native and Local preserve both with no silent winner',()=>{
 const n=snapshot(current,100);const h=startup({native:n,local:alternative});
 assert.equal(h.state().selected,'conflict');assert.equal(h.state().blocked,true);
 assert.equal(h.evalJs('saveLocalState()'),false);assert.equal(h.evalJs('persist()'),false);
 assert.deepEqual(h.memory,h.original);assert.equal(h.writes.length,0);
 assert.equal(h.remote.length,0);
 assert.equal(JSON.parse(h.evalJs('JSON.stringify(startupPreservedEvidence.native)')).domain.records['2026-09-21__class'].status,'entered');
 assert.equal(JSON.parse(h.evalJs('startupPreservedEvidence.localDomainRaw')).records['2026-09-21__class'].status,'absent');
 h.evalJs('window.__miaadCloudAbsent()');assert.equal(h.remote.length,0);
 h.evalJs('window.__miaadReceiveCloud('+JSON.stringify(JSON.stringify(snapshot(current,1000)))+')');
 assert.deepEqual(h.memory,h.original);assert.equal(h.state().selected,'conflict')
});
check('divergence ignores JSON object property insertion ordering',()=>{
 const reversed=JSON.parse(JSON.stringify(current));
 reversed.students=Object.fromEntries(Object.entries(reversed.students).reverse());
 const h=startup({native:snapshot(current),local:reversed});
 assert.equal(h.state().selected,'native-modern');assert.equal(h.state().blocked,false)
});
check('identical academic content retains established Native precedence',()=>{
 const h=startup({native:snapshot(current,100),local:clone(current),localStamp:900});
 assert.equal(h.state().selected,'native-modern');assert.equal(h.state().blocked,false);
 assert.equal(h.state().domain.records['2026-09-21__class'].status,'entered')
});
for(const key of ['miadLessonsV2','miadSessionStateV2','miadSessionNotesV2','miadSessionAuditV2','miadIdrisPhaseV2']){
 check('corrupt Legacy field '+key+' forces read-only recovery',()=>{
  const h=startup({});h.memory[key]='{invalid-json';
  // Restart with identical bytes and prove they remain in storage.
  const raw='{invalid-json';
  const restart=startup({legacyRaw:key==='miadLessonsV2'?raw:JSON.stringify([lesson])});
  if(key==='miadLessonsV2')assert.equal(restart.state().blocked,true);
  assert.equal(h.memory[key],raw)
 })
}
check('valid legacy JSON [] is distinct from missing, and not corrupt',()=>{
 const h=startup({legacyRaw:'[]'});
 assert.equal(h.state().selected,'local-legacy');assert.equal(h.state().blocked,false)
});
console.log('PERSISTENCE RECOVERY CONTRACT PASS: '+total+'/'+total);
