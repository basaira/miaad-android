'use strict';
// Phase 1C V1R7-R1: independent exact-source / generated ownership lifecycle.
// Fake Native is intentional here: Java ownership/write semantics are verified
// separately by AndroidJUnitRunner + isolated Firestore emulator.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(process.env.MIAAD_ASSET_ROOT||path.join(__dirname,'../app/src/main/assets'));
const {createMiaadDomain}=require(path.join(root,'app-domain.js'));
const copy=x=>JSON.parse(JSON.stringify(x));
const date=()=>new Date('2026-09-21T12:00:00Z');
const make=tag=>{
 const d=createMiaadDomain({settings:{teacherTimeZone:'UTC'}},{},date);
 const st=d.saveStudent({id:'student-'+tag,name:'Student '+tag,startDate:'2026-09-01',custom:false,settings:{}});
 const l={id:'schedule-'+tag,studentId:st.id,name:st.name,day:1,start:'10:00',duration:30,repeat:'weekly'};
 d.saveSchedule(l,'2026-09-21');
 d.record({...d.resolveScheduleOccurrence(l.id,'2026-09-21'),status:'entered',note:'SECRET_'+tag,countOverride:false});
 return {domain:copy(d.data),lessons:[l]}
};
const raw={A:make('A'),B:make('B')};
const snap=(tag,stamp=100)=>({schemaVersion:4,updatedAt:stamp,lessons:raw[tag].lessons,sessionState:{},sessionNotes:{},sessionAudit:{},idrisPhase:0,domain:raw[tag].domain});
const identity={uid:'A',token:'token-A-1',storage:{},native:{},legacy:'',writes:[],remote:[]};
const keys={};
function init({uid,token,legacy='',global={}}){
 identity.uid=uid;identity.token=token;identity.legacy=legacy;
 const local=identity.storage;
 Object.assign(local,global);
 const bridge={
  sessionToken:()=>identity.token,
  storageScope:tok=>tok===identity.token?'owned-'+identity.uid+'-':'',
  hasUnownedSnapshot:()=>!!identity.legacy,
  loadSnapshotOwned:tok=>tok===identity.token?identity.native[identity.uid]||'':'',
  saveSnapshotOwned:(str,tok)=>{
   if(tok!==identity.token)return false;
   identity.native[identity.uid]=str;identity.writes.push({uid:identity.uid,str});return true
  },
  requestVerifiedSyncOwned:(str,tok)=>{
   if(tok===identity.token&&identity.native[identity.uid]===str)
    identity.remote.push({uid:identity.uid,str});
  },
  confirmCloudSnapshotOwned:()=>{},syncReminders:()=>{}
 };
 const env={window:null,AndroidBridge:bridge,localStorage:{
  getItem:k=>Object.prototype.hasOwnProperty.call(local,k)?local[k]:null,
  setItem:(k,v)=>{local[k]=String(v)}
 },document:{getElementById:()=>({innerHTML:'',remove(){}}),querySelectorAll:()=>[]},
 console,Intl,Date,Number,String,JSON,Array,Object,Math,Map,Set,RegExp,Error,
 renderAll:()=>{},syncNativeReminders:()=>{},showToast:()=>{}};
 env.window=env;vm.createContext(env);
 for(const file of ['app-core.js','app-domain.js','app-integration.js'])
  vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),env,{filename:file,timeout:10000});
 const evaluate=txt=>vm.runInContext(txt,env,{timeout:10000});
 const state=()=>JSON.parse(evaluate('JSON.stringify({selected:selectedInitialSource,blocked:startupRecoveryBlocked,students:domain.data.students,records:domain.data.records,ts:lastUpdatedAt})'));
 return{evaluate,state,bridge};
}
let cases=0;function check(label,fn){fn();console.log('PASS ownership '+label);cases++}
identity.native.A=JSON.stringify(snap('A'));
identity.storage['owned-A-miaadDomainV4']=JSON.stringify(raw.A.domain);
let instanceA=init({uid:'A',token:'token-A-1'});
check('A can recover its scoped academic data',()=>{assert.equal(instanceA.state().selected,'native-modern');assert.ok(instanceA.state().students['student-A'])});
const previousA=identity.native.A,originalA=identity.storage['owned-A-miaadDomainV4'];
let instanceB=init({uid:'B',token:'token-B-1'});
check('B startup never displays data owned by A',()=>{
 assert.equal(instanceB.state().selected,'fresh');
 assert.ok(!instanceB.state().students['student-A']);
 assert.equal(identity.native.A,previousA)
});
check('B missing Cloud cannot upload any A fact',()=>{
 instanceB.evaluate("window.__miaadCloudAbsent('token-B-1')");
 assert.equal(identity.remote.length,1);
 assert.equal(identity.remote[0].uid,'B');
 assert.ok(!identity.remote[0].str.includes('SECRET_A'));
 assert.ok(!identity.remote[0].str.includes('student-A'))
});
check('stale A absent callback refused in B receiver',()=>{
 const before=identity.remote.length;
 instanceB.evaluate("window.__miaadCloudAbsent('token-A-1')");
 assert.equal(identity.remote.length,before)
});
check('stale A Cloud payload refused in B receiver',()=>{
 instanceB.evaluate("window.__miaadReceiveCloud("+JSON.stringify(JSON.stringify(snap('A',900)))+",'token-A-1')");
 assert.ok(!instanceB.state().students['student-A']);
 assert.equal(identity.storage['owned-A-miaadDomainV4'],originalA)
});
check('old A webpage refuses writes and Cloud callbacks after UID transition',()=>{
 const before=identity.remote.length;
 instanceA.evaluate("window.__miaadCloudAbsent('token-A-1')");
 instanceA.evaluate("window.__miaadReceiveCloud("+JSON.stringify(JSON.stringify(snap('A',2000)))+",'token-A-1')");
 assert.equal(identity.remote.length,before)
});
check('legitimate B Cloud response admitted only in B',()=>{
 instanceB.evaluate("window.__miaadReceiveCloud("+JSON.stringify(JSON.stringify(snap('B',1000)))+",'token-B-1')");
 assert.ok(instanceB.state().students['student-B']);
 assert.ok(!instanceB.state().students['student-A']);
 assert.ok(identity.native.B.includes('SECRET_B'));
 assert.equal(identity.native.A,previousA)
});
const previousB=identity.native.B;
instanceA=init({uid:'A',token:'token-A-2'});
check('A to B to A preserves and restores exact A without B mixing',()=>{
 assert.ok(instanceA.state().students['student-A']);
 assert.ok(!instanceA.state().students['student-B']);
 assert.equal(identity.native.B,previousB)
});
identity.native={};identity.storage={};
let orphanB=init({uid:'B',token:'token-B-3',legacy:'{"domain":"owned-by-unknown"}',
 global:{miaadDomainV4:JSON.stringify(raw.A.domain)}});
check('unowned Legacy causes non-destructive recovery',()=>{
 assert.equal(orphanB.state().selected,'recovery-unowned-owner');
 assert.equal(orphanB.state().blocked,true);
 const before=identity.storage.miaadDomainV4;
 orphanB.evaluate("window.__miaadCloudAbsent('token-B-3')");
 assert.equal(identity.storage.miaadDomainV4,before);
 assert.ok(!identity.remote.some(x=>x.uid==='B'&&x.str.includes('SECRET_A')))
});
check('invalid token never authorizes an owned Native save',()=>{
 assert.equal(orphanB.bridge.saveSnapshotOwned(JSON.stringify(snap('A')), 'stale-A'),false)
});
const fresh=init({uid:'B',token:'token-B-4',legacy:''});
check('unowned local academic data remains preserved even after Native legacy disappears',()=>{
 assert.equal(fresh.state().selected,'recovery-unowned-owner');
 assert.ok(identity.storage.miaadDomainV4.includes('student-A'))
});
console.log('UID OWNERSHIP SOURCE MATRIX PASS: '+cases+'/'+cases);
