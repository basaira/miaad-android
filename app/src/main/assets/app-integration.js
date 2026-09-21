const localDomainSeed=loadJSON('miaadDomainV4',{});
function isDomainMap(value){return !!value&&typeof value==='object'&&!Array.isArray(value)}
function isModernDomainPayload(value){return isDomainMap(value)&&Number(value.version)===4&&isDomainMap(value.students)&&isDomainMap(value.records)&&isDomainMap(value.schedules)&&isDomainMap(value.settings)}
const nativeDomainModern=isModernDomainPayload(nativeInitial?.domain),localDomainModern=isModernDomainPayload(localDomainSeed);
const primaryDomainSeed=nativeInitial?(nativeDomainModern?nativeInitial.domain:{}):(localDomainModern?localDomainSeed:{});
const migrateInitialLegacy=nativeInitial?!nativeDomainModern:!localDomainModern;
const domain=createMiaadDomain(stabilizeMiaadTeacherTimeZoneSeed(primaryDomainSeed,localDomainSeed),{lessons,sessionState,sessionNotes,sessionAudit,idrisPhase},undefined,{migrateLegacy:migrateInitialLegacy});
for(const l of lessons){const v=domain.data.schedules[l.id]?.at(-1)?.lesson;if(v)l.studentId=v.studentId}
function buildLegacyOccurrenceMirrors(records=domain.data.records){
 const state={},notes={};
 for(const r of Object.values(records||{})){if(r?.deleted)continue;if(r.status&&r.status!=='pending')state[r.id]=r.status;if(r.note)notes[r.id]=r.note}
 return{state,notes}
}
function refreshLegacyOccurrenceMirrors(){const mirrors=buildLegacyOccurrenceMirrors();sessionState=mirrors.state;sessionNotes=mirrors.notes;return mirrors}
refreshLegacyOccurrenceMirrors();
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function domainCommit(){
 refreshLegacyOccurrenceMirrors();
 persist();renderAll();
}
