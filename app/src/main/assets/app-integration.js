const domain=createMiaadDomain(nativeInitial?.domain||loadJSON('miaadDomainV4',{}),{lessons,sessionState,sessionNotes,sessionAudit,idrisPhase});
for(const l of lessons){const v=domain.data.schedules[l.id]?.at(-1)?.lesson;if(v)l.studentId=v.studentId}
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function domainCommit(){
 for(const r of Object.values(domain.data.records)){if(r.status==='pending'||r.deleted)delete sessionState[r.id];else sessionState[r.id]=r.status;sessionNotes[r.id]=r.note||''}
 persist();renderAll();
}
