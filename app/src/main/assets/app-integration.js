const localDomainSeed=loadJSON('miaadDomainV4',{});
const primaryDomainSeed=nativeInitial?.domain||localDomainSeed;
const domain=createMiaadDomain(stabilizeMiaadTeacherTimeZoneSeed(primaryDomainSeed,localDomainSeed),{lessons,sessionState,sessionNotes,sessionAudit,idrisPhase});
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
