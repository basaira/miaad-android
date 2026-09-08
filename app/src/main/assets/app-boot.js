const legacyRenderAll=renderAll;
renderAll=function(){legacyRenderAll();renderAttention()};
const originalOpenSheet=openSheet;
openSheet=function(l,d=selectedDate,focusNote=false){if(l?.recordId&&!lessons.some(x=>x.id===l.id)){selectedStudent=l.studentId;switchView('students');renderStudents();const r=domain.occurrences(dateKey(d)).find(x=>x.id===l.recordId);if(r)openRecordForm(r,l.studentId,el('profileInline'));return}originalOpenSheet(l,d,focusNote)};
handleSessionAction=function(action,l,d){attempt(()=>{const r=domain.occurrences(dateKey(d)).find(x=>x.id===keyFor(l,d));if(!r)return;if(['entered','missed','absent','notheld'].includes(action)){domain.record({...r,status:action});domainCommit()}else{selectedStudent=r.studentId;switchView('students');renderStudents();openRecordForm(r,r.studentId,el('profileInline'))}})};
const saveRecurring=el('saveLesson').onclick;el('saveLesson').onclick=()=>attempt(saveRecurring);
el('reportPrint').onclick=printProfessionalReport;
el('bellBtn').onclick=openNotificationCenter;
el('focusMoreBtn').onclick=()=>{if(currentFocus)handleSessionAction('note',currentFocus.lesson,currentFocus.date)};
el('studentSearch').oninput=e=>{selectedStudent='';renderStudents(e.target.value)};
el('sessionStatePicker').innerHTML=domain.states.map(s=>`<button type="button" data-state="${s==='pending'?'':s}">${statusLabel(s)}</button>`).join('');el('sessionStatePicker').querySelectorAll('button').forEach(b=>b.onclick=()=>{el('sessionStatePicker').querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));markEditorDirty()});
el('toggleIdrisPhase').onclick=()=>{idrisPhase=idrisPhase?0:1;lessons.forEach(l=>{if(l.repeat==='biweekly')domain.saveSchedule({...l,phase:idrisPhase})});domainCommit();showToast('حُفظت مرحلة إدريس للمواعيد القادمة')};
window.__miaadOpenNotification=key=>{domain.notifications();openNotification(key)};
renderFeatureSettings();domain.notifications();saveLocalState();renderAll();syncNativeReminders();
setInterval(()=>{const before=JSON.stringify(domain.data.notifications);domain.notifications();if(before!==JSON.stringify(domain.data.notifications)){persist();renderAttention();if(el('notificationCenter'))openNotificationCenter()}if(!NATIVE&&'Notification'in window&&Notification.permission==='granted'){const fresh=Object.values(domain.data.notifications).filter(n=>n.active&&!n.read&&!n.deliveredAt&&n.snoozeUntil<=Date.now());if(fresh.length){const n=fresh[0],notice=new Notification(fresh.length>1?`${fresh.length} تنبيهات من مِيعاد`:n.title,{body:n.body,tag:'miaad-attention'});notice.onclick=()=>{window.focus();openNotification(n.id)};fresh.forEach(n=>n.deliveredAt=Date.now());persist()}}},60000);

/* Final data-presentation invariants are installed after every later UI patch has loaded.
   Archived reports must keep the time zones and note-visibility policy that existed
   when they were archived; changing today's profile must not rewrite yesterday's report. */
window.addEventListener('load',()=>{
 if(window.__miaadGlobalQualityGateApplied)return;window.__miaadGlobalQualityGateApplied=true;
 const ARABIC=/[\u0600-\u06ff]/,hasArabic=s=>ARABIC.test(String(s||''));
 const validZone=z=>{try{new Intl.DateTimeFormat('en',{timeZone:z}).format();return true}catch{return false}};
 const deviceZone=()=>{try{return Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'}catch{return'UTC'}};
 const currentTeacherZone=()=>domain.data.settings.teacherTimeZone||deviceZone();
 const currentStudentZone=sid=>domain.data.students[sid]?.timeZone||'';
 const snapshotPresentation=p=>{if(!p)return;if(typeof p.showNotes!=='boolean')p.showNotes=!!domain.prefs(p.studentId).showNotes};
 const archiveBeforePresentation=domain.archive,nextBeforePresentation=domain.nextPeriod;
 domain.archive=p=>{snapshotPresentation(p);return archiveBeforePresentation(p)};
 domain.nextPeriod=p=>{snapshotPresentation(p);return nextBeforePresentation(p)};

 function wallClockInstant(date,time,zone){
  if(!domain.timeOK(time)||!validZone(zone))return null;
  const [year,month,day]=date.split('-').map(Number),[hour,minute]=time.split(':').map(Number);
  const target=Date.UTC(year,month-1,day,hour,minute,0),fmt=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  let guess=target;
  for(let i=0;i<5;i++){
   const parts=Object.fromEntries(fmt.formatToParts(new Date(guess)).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
   const shown=Date.UTC(+parts.year,+parts.month-1,+parts.day,+parts.hour,+parts.minute,+parts.second),delta=target-shown;guess+=delta;if(Math.abs(delta)<1000)break;
  }
  return new Date(guess);
 }
 function qualityStudentTimeLabel(row,lang='ar',targetZone=currentStudentZone(row.studentId),sourceZone=currentTeacherZone()){
  if(!targetZone||!domain.timeOK(row.time)||!validZone(targetZone)||!validZone(sourceZone))return'';
  const instant=wallClockInstant(row.date,row.time,sourceZone);if(!instant)return'';
  try{return new Intl.DateTimeFormat(lang==='en'?'en-US':'ar-EG',{timeZone:targetZone,weekday:'short',hour:'numeric',minute:'2-digit',hour12:true,timeZoneName:'short'}).format(instant)}catch{return''}
 }
 function localizedNote(obj,lang){
  if(window.miaadReportLocalizedNote)return window.miaadReportLocalizedNote(obj,lang);
  const explicit=String(obj?.[lang==='en'?'noteEn':'noteAr']||'').trim();if(explicit)return explicit;const base=String(obj?.note||'').trim();if(!base)return'';return lang==='en'?(hasArabic(base)?'':base):(hasArabic(base)?base:'');
 }
 function notesVisibleFor(r,row){
  const p=r.periodId?domain.data.periods[r.periodId]:null;
  if(p?.archived&&typeof p.showNotes==='boolean')return p.showNotes;
  return !!domain.prefs(row.studentId).showNotes;
 }
 function qualityMissingTranslations(r,lang){
  const missing=[];
  for(const row of r.rows||[]){const base=String(row.note||'').trim();if(notesVisibleFor(r,row)&&base&&!localizedNote(row,lang))missing.push({kind:'lesson',id:row.id,studentId:row.studentId,source:base,row})}
  const p=r.periodId?domain.data.periods[r.periodId]:null,base=String(p?.note||r.note||'').trim();if(base&&!localizedNote(p||r,lang))missing.push({kind:'period',id:p?.id||'',studentId:p?.studentId||'',source:base,period:p});
  return missing;
 }
 window.miaadWallClockInstant=wallClockInstant;window.miaadStudentTimeLabel=qualityStudentTimeLabel;window.miaadReportMissingTranslations=qualityMissingTranslations;

 reportMarkup=function(r,lang){
  const t=REPORT_COPY[lang],locale=lang==='ar'?'ar-EG':'en-GB',fmt=s=>domain.parse(s).toLocaleDateString(locale,{day:'numeric',month:'short',year:'numeric'}),comment=lang==='en'?r.noteEn:r.noteAr;
  const studentZone=r.studentTimeZone||'',teacherZone=r.teacherTimeZone||currentTeacherZone(),zones=studentZone?`<p class="report-timezones">${t.teacherZone}: <bdi dir="ltr">${escapeHtml(teacherZone)}</bdi> · ${t.studentZone}: <bdi dir="ltr">${escapeHtml(studentZone)}</bdi></p>`:'';
  return `<article class="professional-report" lang="${lang}" dir="${lang==='ar'?'rtl':'ltr'}"><header><img src="brand/miaad-logo.webp" width="52" height="52" alt="MIAAD"><div><h1>${t.title}</h1><h2>${escapeHtml(r.studentName)}</h2><p>${t.period}: <bdi>${fmt(r.start)} — ${fmt(r.end)}</bdi></p>${zones}</div></header><h3>${t.summary}</h3><dl class="report-totals">${['scheduled','attended','absent','minutes'].map(k=>`<div><dt>${t[k]}</dt><dd>${r.stats[k]}</dd></div>`).join('')}</dl><p class="report-secondary">${['cancelled','rescheduled','makeup'].map(k=>`${t[k]}: ${r.stats[k]}`).join(' · ')}</p><h3>${t.history}</h3>${r.rows.length?`<div class="report-table-scroll"><table><thead><tr>${['date','student','time','status','duration','note'].map(k=>`<th scope="col">${t[k]}</th>`).join('')}</tr></thead><tbody>${r.rows.map(x=>{const targetZone=studentZone||currentStudentZone(x.studentId),local=qualityStudentTimeLabel(x,lang,targetZone,teacherZone),note=notesVisibleFor(r,x)?localizedNote(x,lang):'';return `<tr><td data-label="${t.date}">${fmt(x.date)}</td><td data-label="${t.student}">${escapeHtml(x.name)}</td><td data-label="${t.time}"><bdi dir="ltr">${escapeHtml(x.time||x.displayTime||'—')}</bdi>${local?`<small class="student-local-time">${t.studentLocal}: ${escapeHtml(local)}</small>`:''}</td><td data-label="${t.status}">${statusLabel(domain.status(x),lang)}</td><td data-label="${t.duration}">${['entered','makeup'].includes(x.status)?(x.actualMinutes??x.duration):x.duration}</td><td class="lesson-note" data-label="${t.note}">${escapeHtml(note||'—')}</td></tr>`}).join('')}</tbody></table></div>`:`<p>${t.empty}</p>`}${comment?`<section class="teacher-comment"><h3>${t.final}</h3><p>${escapeHtml(comment)}</p></section>`:''}</article>`;
 };
 function qualityReadyForExport(){
  const r=reportData(),missing=qualityMissingTranslations(r,reportSelection.language);if(!missing.length)return true;
  renderReport();document.getElementById('reportLanguageIntegrity')?.scrollIntoView({behavior:'smooth',block:'start'});showToast(reportSelection.language==='en'?'أكمل الصياغة الإنجليزية للملاحظات الظاهرة قبل التصدير':'أكمل الصياغة العربية للملاحظات الظاهرة قبل التصدير');return false;
 }
 exportReportCsv=function(){if(!qualityReadyForExport())return;const r=reportData(),lang=reportSelection.language,t=REPORT_COPY[lang];const rows=[[t.student,t.date,t.time,t.status,t.duration,t.note],...r.rows.map(x=>[x.name,x.date,x.time||x.displayTime,statusLabel(domain.status(x),lang),x.actualMinutes??x.duration,notesVisibleFor(r,x)?localizedNote(x,lang):''])];const safe=v=>/^[=+@\-\t\r]/.test(String(v))?"'"+v:String(v??'');downloadBlob('\ufeff'+rows.map(row=>row.map(x=>'"'+safe(x).replaceAll('"','""')+'"').join(',')).join('\n'),`miaad-report-${r.start}-${lang}.csv`,'text/csv;charset=utf-8')};
 printProfessionalReport=function(){if(!qualityReadyForExport())return;const r=reportData(),content='<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="css-fonts.css"><link rel="stylesheet" href="css-features.css"><link rel="stylesheet" href="css-ui-hotfix.css"></head><body>'+reportMarkup(r,reportSelection.language)+'</body></html>';if(NATIVE?.printReport){NATIVE.printReport(content,'MIAAD '+r.start);return}window.print()};
 const finalRenderReport=renderReport;
 renderReport=function(){finalRenderReport();const r=reportData(),panel=document.getElementById('reportLanguageIntegrity');if(panel&&!qualityMissingTranslations(r,reportSelection.language).length)panel.remove();const print=document.getElementById('reportPrint'),csv=document.getElementById('reportCsv');if(print)print.onclick=printProfessionalReport;if(csv)csv.onclick=exportReportCsv};
 if(typeof currentView!=='undefined'&&currentView==='report')renderReport();
});
