(()=>{
  const logo='brand/miaad-logo.webp';
  document.documentElement.classList.add('chronometric-luxury');
  const theme=document.querySelector('meta[name="theme-color"]');
  if(theme)theme.setAttribute('content','#081f18');

  const settings=document.querySelector('#view-settings .settings-stack');
  if(settings&&!document.getElementById('miaadBrandSignature')){
    const block=document.createElement('section');
    block.id='miaadBrandSignature';
    block.className='miaad-brand-signature';
    block.innerHTML=`<img src="${logo}" width="56" height="56" alt="شعار مِيعاد"><div><b>مِيعاد</b><span>MIAAD</span><small>لكل موعد قيمة</small></div>`;
    settings.prepend(block);
  }

  // Keep the branded surface responsive to native theme insets without layout jumps.
  const syncInsets=()=>document.documentElement.style.setProperty('--luxury-vh',`${window.innerHeight}px`);
  syncInsets();
  window.addEventListener('resize',syncInsets,{passive:true});

  // Premium press feedback only for primary operational surfaces.
  const pressSelectors='.focus-panel,.session-row,.student-card,.week-day,.setting-block,.free-window-card,.slot-option';
  let pressed=null;
  const clearPress=()=>{pressed?.classList.remove('luxury-press');pressed=null};
  document.addEventListener('pointerdown',e=>{
    clearPress();pressed=e.target.closest(pressSelectors);pressed?.classList.add('luxury-press');
  },{passive:true});
  window.addEventListener('blur',clearPress);
  document.addEventListener('pointerup',clearPress,{passive:true});
  document.addEventListener('pointercancel',clearPress,{passive:true});

  document.body.classList.add('luxury-ready');
})();

/* Quality patch: bilingual report integrity + per-student IANA time zones.
   It extends the existing v1.2 domain without changing historical lesson timestamps. */
(()=>{
  if(window.__miaadQualityPatchApplied)return;
  window.__miaadQualityPatchApplied=true;

  const ARABIC=/[\u0600-\u06ff]/;
  const resolvedDeviceZone=()=>{try{return Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'}catch{return'UTC'}};
  const validZone=zone=>{if(!zone)return true;try{new Intl.DateTimeFormat('en',{timeZone:zone}).format();return true}catch{return false}};
  const teacherZone=()=>domain.data.settings.teacherTimeZone||resolvedDeviceZone();
  const studentZone=sid=>domain.data.students[sid]?.timeZone||'';
  const hasArabic=text=>ARABIC.test(String(text||''));
  const targetKey=lang=>lang==='en'?'noteEn':'noteAr';

  function wallClockInstant(date,time,zone){
    if(!domain.timeOK(time)||!validZone(zone))return null;
    const [year,month,day]=date.split('-').map(Number),[hour,minute]=time.split(':').map(Number);
    const target=Date.UTC(year,month-1,day,hour,minute,0),fmt=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
    let guess=target;
    for(let i=0;i<4;i++){
      const p=Object.fromEntries(fmt.formatToParts(new Date(guess)).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
      const shown=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second),delta=target-shown;
      guess+=delta;
      if(Math.abs(delta)<1000)break;
    }
    return new Date(guess);
  }

  function studentTimeLabel(row,lang='ar'){
    const zone=studentZone(row.studentId);
    if(!zone||!domain.timeOK(row.time))return'';
    const instant=wallClockInstant(row.date,row.time,teacherZone());
    if(!instant)return'';
    const locale=lang==='en'?'en-US':'ar-EG';
    try{return new Intl.DateTimeFormat(locale,{timeZone:zone,weekday:'short',hour:'numeric',minute:'2-digit',hour12:true,timeZoneName:'short'}).format(instant)}catch{return''}
  }

  function localizedNote(obj,lang){
    const explicit=String(obj?.[targetKey(lang)]||'').trim();
    if(explicit)return explicit;
    const base=String(obj?.note||'').trim();
    if(!base)return'';
    if(lang==='en')return hasArabic(base)?'':base;
    return hasArabic(base)?base:'';
  }

  function reportMissingTranslations(r,lang){
    const missing=[];
    for(const row of r.rows||[]){
      const base=String(row.note||'').trim();
      if(base&&!localizedNote(row,lang))missing.push({kind:'lesson',id:row.id,studentId:row.studentId,source:base,row});
    }
    const p=r.periodId?domain.data.periods[r.periodId]:null,base=String(p?.note||r.note||'').trim();
    if(base&&!localizedNote(p||r,lang))missing.push({kind:'period',id:p?.id||'',studentId:p?.studentId||'',source:base,period:p});
    return missing;
  }

  async function translationDraft(text,source,target){
    if(!text.trim())return'';
    if(!('Translator'in self))throw Error('الترجمة التلقائية غير متاحة على هذا الجهاز. اكتب الصياغة المطلوبة يدويًا.');
    const options={sourceLanguage:source,targetLanguage:target},availability=await Translator.availability(options);
    if(!availability||availability==='unavailable')throw Error('حزمة الترجمة غير متاحة لهذا الجهاز.');
    const translator=await Translator.create({...options,monitor(m){m.addEventListener('downloadprogress',e=>showToast(`تنزيل نموذج الترجمة ${Math.round(e.loaded*100)}%`))}});
    try{return await translator.translate(text)}finally{translator.destroy?.()}
  }

  function ensureZoneList(){
    if(document.getElementById('miaadTimeZones'))return;
    const list=document.createElement('datalist');list.id='miaadTimeZones';
    let zones=[];try{zones=Intl.supportedValuesOf?.('timeZone')||[]}catch{}
    if(!zones.length)zones=['Africa/Cairo','America/Los_Angeles','America/Denver','America/Chicago','America/New_York','Europe/London','Europe/Stockholm','Europe/Moscow','Asia/Tashkent','Asia/Dubai','UTC'];
    list.innerHTML=zones.map(z=>`<option value="${escapeHtml(z)}"></option>`).join('');document.body.append(list);
  }
  ensureZoneList();

  const baseStudentForm=studentForm;
  studentForm=function(sid=''){
    baseStudentForm(sid);ensureZoneList();
    const form=document.getElementById('studentForm');if(!form)return;
    const s=domain.data.students[sid],fields=form.querySelector('.feature-fields');
    if(fields&&!form.elements.timeZone){fields.insertAdjacentHTML('beforeend',`<label>المنطقة الزمنية للطالب<input name="timeZone" list="miaadTimeZones" value="${escapeHtml(s?.timeZone||'')}" placeholder="مثال: America/Los_Angeles" autocomplete="off"></label>`)}
    const hint=form.querySelector('.field-hint');if(hint)hint.textContent='مواعيد الجدول الأساسية بتوقيتك. عند تحديد منطقة الطالب الزمنية سيعرض مِيعاد وقت الطالب المحلي بجانب وقتك، دون تغيير السجل التاريخي.';
    const submit=form.onsubmit;
    form.onsubmit=e=>{
      const zone=String(form.elements.timeZone?.value||'').trim();
      if(zone&&!validZone(zone)){e.preventDefault();showToast('المنطقة الزمنية غير صحيحة. استخدم اسم IANA مثل America/Los_Angeles');return}
      if(sid&&domain.data.students[sid])domain.data.students[sid].timeZone=zone;
      submit(e);
      const savedId=sid||selectedStudent,saved=domain.data.students[savedId];
      if(saved&&saved.timeZone!==zone){saved.timeZone=zone;saved.updatedAt=new Date().toISOString();domain.activity('student_timezone',savedId,{timeZone:zone});persist();renderStudents()}
    };
  };

  const baseRenderStudentProfile=renderStudentProfile;
  renderStudentProfile=function(sid){
    baseRenderStudentProfile(sid);const s=domain.data.students[sid];if(!s)return;
    const heading=document.querySelector('#studentDirectory .profile-heading p');
    if(heading&&!heading.querySelector('.student-zone-meta'))heading.insertAdjacentHTML('beforeend',`<br><span class="student-zone-meta">منطقة الطالب الزمنية: <bdi dir="ltr">${escapeHtml(s.timeZone||'توقيتك نفسه')}</bdi></span>`);
    document.querySelectorAll('#studentDirectory [data-schedule]').forEach(btn=>{
      const lesson=lessons.find(x=>x.id===btn.dataset.schedule);if(!lesson||!s.timeZone||!domain.timeOK(lesson.start))return;
      const d=SmartScheduleEngine.nearestDateForDay(lesson.day),label=studentTimeLabel({...lesson,date:dateKey(d)},'ar');
      if(label&&!btn.querySelector('.student-local-time'))btn.querySelector('span')?.insertAdjacentHTML('afterend',`<small class="student-local-time">عند الطالب: ${escapeHtml(label)}</small>`);
    });
  };

  const baseOpenRecordForm=openRecordForm;
  openRecordForm=function(record,sid,host){
    baseOpenRecordForm(record,sid,host);const form=host?.querySelector('form.record-form');if(!form)return;
    const source=String(record?.note||''),ar=String(record?.noteAr||(hasArabic(source)?source:'')),en=String(record?.noteEn||(!hasArabic(source)?source:''));
    const noteLabel=form.querySelector('textarea[name="note"]')?.closest('label');
    if(noteLabel&&!form.elements.noteEn){
      noteLabel.insertAdjacentHTML('afterend',`<details class="report-language-wording"><summary>صياغة الملاحظة للتقرير العربي والإنجليزي</summary><p class="field-hint">يُحفظ النص الأصلي كما هو. استخدم هذين الحقلين لضمان أن التقرير المرسل لولي الأمر لا يخلط بين اللغتين.</p><label>الصياغة العربية للتقرير<textarea name="noteAr" rows="3">${escapeHtml(ar)}</textarea></label><label>Professional English report wording<textarea name="noteEn" rows="3" dir="ltr">${escapeHtml(en)}</textarea></label><div class="feature-actions"><button type="button" class="small-btn" data-translate-note="en">اقتراح الإنجليزية</button><button type="button" class="small-btn" data-translate-note="ar">اقتراح العربية</button></div></details>`);
    }
    form.querySelectorAll('[data-translate-note]').forEach(button=>button.onclick=async()=>{
      const target=button.dataset.translateNote,sourceField=target==='en'?form.elements.noteAr:form.elements.noteEn,targetField=target==='en'?form.elements.noteEn:form.elements.noteAr,text=String(sourceField.value||form.elements.note.value||'').trim();
      if(!text){showToast('اكتب الملاحظة أولًا');return}button.disabled=true;
      try{targetField.value=await translationDraft(text,target==='en'?'ar':'en',target);showToast('أُنشئ اقتراح ترجمة؛ راجعه قبل إرسال التقرير')}catch(err){showToast(err.message)}finally{button.disabled=false}
    });
    const submit=form.onsubmit;
    form.onsubmit=e=>{
      const data=new FormData(form),noteAr=String(data.get('noteAr')||'').trim(),noteEn=String(data.get('noteEn')||'').trim(),base=String(data.get('note')||'').trim(),before=new Set(Object.keys(domain.data.records));
      if(record){record.noteAr=noteAr;record.noteEn=noteEn;record.note=base||noteAr||noteEn}
      submit(e);
      if(!record){
        const targetSid=String(data.get('student')||sid),date=String(data.get('date')||''),time=String(data.get('time')||'');
        const created=Object.values(domain.data.records).filter(r=>!before.has(r.id)&&r.studentId===targetSid&&r.date===date&&r.time===time).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')))[0];
        if(created){domain.record({...created,note:base||noteAr||noteEn,noteAr,noteEn});persist()}
      }
    };
  };

  const baseRenderTodayAgenda=renderTodayAgenda;
  renderTodayAgenda=function(){
    baseRenderTodayAgenda();const rows=domain.occurrences(dateKey(selectedDate));
    document.querySelectorAll('#agenda .feature-session').forEach((card,i)=>{const row=rows[i],label=row&&studentTimeLabel(row,'ar');if(label&&!card.querySelector('.student-local-time'))card.querySelector('.time-gutter')?.insertAdjacentHTML('beforeend',`<small class="student-local-time">عند الطالب<br>${escapeHtml(label)}</small>`)})
  };

  const baseRenderFeatureSettings=renderFeatureSettings;
  renderFeatureSettings=function(){
    baseRenderFeatureSettings();ensureZoneList();const form=document.getElementById('globalSettings');if(!form||form.elements.teacherTimeZone)return;
    const fields=form.querySelector('details .feature-fields');
    fields?.insertAdjacentHTML('afterbegin',`<label>منطقتك الزمنية الأساسية<input name="teacherTimeZone" list="miaadTimeZones" value="${escapeHtml(teacherZone())}" placeholder="Africa/Cairo" autocomplete="off"></label>`);
    const submit=form.onsubmit;form.onsubmit=e=>{const zone=String(form.elements.teacherTimeZone.value||'').trim();if(!validZone(zone)){e.preventDefault();showToast('المنطقة الزمنية الأساسية غير صحيحة');return}domain.data.settings.teacherTimeZone=zone;submit(e)};
  };

  const baseArchive=domain.archive,baseNextPeriod=domain.nextPeriod;
  const snapshotPeriodZones=p=>{if(!p.studentTimeZone)p.studentTimeZone=studentZone(p.studentId);if(!p.teacherTimeZone)p.teacherTimeZone=teacherZone()};
  domain.archive=p=>{snapshotPeriodZones(p);return baseArchive(p)};
  domain.nextPeriod=p=>{snapshotPeriodZones(p);return baseNextPeriod(p)};

  const baseReportData=reportData;
  reportData=function(){
    const r=baseReportData(),p=r.periodId?domain.data.periods[r.periodId]:null;
    r.noteAr=p?.noteAr||((p?.note||r.note)&&hasArabic(p?.note||r.note)?p?.note||r.note:'');
    r.noteEn=p?.noteEn||((p?.note||r.note)&&!hasArabic(p?.note||r.note)?p?.note||r.note:'');
    r.studentTimeZone=p?.studentTimeZone||studentZone(p?.studentId||reportSelection.studentId);
    r.teacherTimeZone=p?.teacherTimeZone||teacherZone();
    return r;
  };

  REPORT_COPY.ar.studentZone='منطقة الطالب الزمنية';REPORT_COPY.ar.teacherZone='توقيت المعلم';REPORT_COPY.ar.studentLocal='وقت الطالب';REPORT_COPY.ar.translationNeeded='توجد ملاحظات تحتاج صياغة عربية قبل تصدير التقرير.';
  REPORT_COPY.en.studentZone='Student time zone';REPORT_COPY.en.teacherZone='Teacher time zone';REPORT_COPY.en.studentLocal='Student local time';REPORT_COPY.en.translationNeeded='Some notes still need professional English wording before this report can be exported.';

  reportMarkup=function(r,lang){
    const t=REPORT_COPY[lang],locale=lang==='ar'?'ar-EG':'en-GB',fmt=s=>domain.parse(s).toLocaleDateString(locale,{day:'numeric',month:'short',year:'numeric'}),comment=lang==='en'?r.noteEn:r.noteAr;
    const zones=r.studentTimeZone?`<p class="report-timezones">${t.teacherZone}: <bdi dir="ltr">${escapeHtml(r.teacherTimeZone||teacherZone())}</bdi> · ${t.studentZone}: <bdi dir="ltr">${escapeHtml(r.studentTimeZone)}</bdi></p>`:'';
    return `<article class="professional-report" lang="${lang}" dir="${lang==='ar'?'rtl':'ltr'}"><header><img src="brand/miaad-logo.webp" width="52" height="52" alt="MIAAD"><div><h1>${t.title}</h1><h2>${escapeHtml(r.studentName)}</h2><p>${t.period}: <bdi>${fmt(r.start)} — ${fmt(r.end)}</bdi></p>${zones}</div></header><h3>${t.summary}</h3><dl class="report-totals">${['scheduled','attended','absent','minutes'].map(k=>`<div><dt>${t[k]}</dt><dd>${r.stats[k]}</dd></div>`).join('')}</dl><p class="report-secondary">${['cancelled','rescheduled','makeup'].map(k=>`${t[k]}: ${r.stats[k]}`).join(' · ')}</p><h3>${t.history}</h3>${r.rows.length?`<div class="report-table-scroll"><table><thead><tr>${['date','student','time','status','duration','note'].map(k=>`<th scope="col">${t[k]}</th>`).join('')}</tr></thead><tbody>${r.rows.map(x=>{const local=studentTimeLabel(x,lang),note=localizedNote(x,lang);return `<tr><td data-label="${t.date}">${fmt(x.date)}</td><td data-label="${t.student}">${escapeHtml(x.name)}</td><td data-label="${t.time}"><bdi dir="ltr">${escapeHtml(x.time||x.displayTime||'—')}</bdi>${local?`<small class="student-local-time">${t.studentLocal}: ${escapeHtml(local)}</small>`:''}</td><td data-label="${t.status}">${statusLabel(domain.status(x),lang)}</td><td data-label="${t.duration}">${['entered','makeup'].includes(x.status)?(x.actualMinutes??x.duration):x.duration}</td><td class="lesson-note" data-label="${t.note}">${escapeHtml(domain.prefs(x.studentId).showNotes?note||'—':'—')}</td></tr>`}).join('')}</tbody></table></div>`:`<p>${t.empty}</p>`}${comment?`<section class="teacher-comment"><h3>${t.final}</h3><p>${escapeHtml(comment)}</p></section>`:''}</article>`;
  };

  function renderLanguageIntegrity(r){
    let panel=document.getElementById('reportLanguageIntegrity');if(panel)panel.remove();
    const missing=reportMissingTranslations(r,reportSelection.language);if(!missing.length)return;
    panel=document.createElement('section');panel.id='reportLanguageIntegrity';panel.className='profile-section report-language-integrity';
    const target=reportSelection.language==='en'?'English':'العربية';
    panel.innerHTML=`<div class="section-heading"><div><h3>${REPORT_COPY[reportSelection.language].translationNeeded}</h3><p class="field-hint">النص الأصلي محفوظ. أكمل الصياغة المطلوبة هنا؛ لن يسمح مِيعاد بطباعة تقرير مختلط اللغات.</p></div><span>${missing.length}</span></div><form id="reportTranslationForm" class="feature-form">${missing.map((m,i)=>`<label><small>${m.kind==='period'?'تعليق المعلم':'ملاحظة حصة'} · ${m.kind==='lesson'?escapeHtml(m.row.date):''}</small><div class="field-hint">${escapeHtml(m.source)}</div><textarea name="translation_${i}" rows="3" dir="${reportSelection.language==='en'?'ltr':'rtl'}" placeholder="${target}"></textarea><button type="button" class="editor-link" data-auto="${i}">اقتراح تلقائي</button></label>`).join('')}<button class="small-btn dark">حفظ الصياغات</button></form>`;
    document.getElementById('reportDocument')?.before(panel);
    const form=panel.querySelector('form');
    panel.querySelectorAll('[data-auto]').forEach(btn=>btn.onclick=async()=>{const i=+btn.dataset.auto,m=missing[i],field=form.elements['translation_'+i];btn.disabled=true;try{field.value=await translationDraft(m.source,reportSelection.language==='en'?'ar':'en',reportSelection.language);showToast('أُنشئ اقتراح؛ راجعه لغويًا قبل الإرسال')}catch(err){showToast(err.message)}finally{btn.disabled=false}});
    form.onsubmit=e=>{e.preventDefault();let changed=false;missing.forEach((m,i)=>{const value=String(form.elements['translation_'+i].value||'').trim();if(!value)return;if(m.kind==='lesson'){const source=domain.data.records[m.id];if(source){domain.record({...source,[targetKey(reportSelection.language)]:value});changed=true}}else if(m.period){m.period[targetKey(reportSelection.language)]=value;m.period.updatedAt=new Date().toISOString();changed=true}});if(!changed){showToast('اكتب الصياغة المطلوبة أولًا');return}domainCommit();showToast('اكتملت صياغة التقرير باللغة المختارة')};
  }

  const baseRenderReport=renderReport;
  renderReport=function(){
    baseRenderReport();const r=reportData(),p=r.periodId?domain.data.periods[r.periodId]:null,form=document.getElementById('reportNoteForm');
    if(form&&p){
      const ar=p.noteAr||(hasArabic(p.note)?p.note:''),en=p.noteEn||(!hasArabic(p.note)?p.note:'');
      form.innerHTML=`<label>تعليق المعلم بالعربية<textarea id="periodTeacherNoteAr" rows="3">${escapeHtml(ar||'')}</textarea></label><label>Professional English teacher comment<textarea id="periodTeacherNoteEn" rows="3" dir="ltr">${escapeHtml(en||'')}</textarea></label><div class="feature-actions"><button type="button" class="small-btn" id="translatePeriodEn">اقتراح الإنجليزية</button><button class="small-btn dark">حفظ التعليق</button></div>`;
      form.onsubmit=e=>{e.preventDefault();p.noteAr=document.getElementById('periodTeacherNoteAr').value.trim();p.noteEn=document.getElementById('periodTeacherNoteEn').value.trim();p.note=p.noteAr||p.noteEn||'';p.updatedAt=new Date().toISOString();domainCommit();showToast('حُفظ تعليق الفترة باللغتين')};
      document.getElementById('translatePeriodEn').onclick=async e=>{const text=document.getElementById('periodTeacherNoteAr').value.trim();if(!text){showToast('اكتب التعليق العربي أولًا');return}e.currentTarget.disabled=true;try{document.getElementById('periodTeacherNoteEn').value=await translationDraft(text,'ar','en');showToast('أُنشئ اقتراح؛ راجعه قبل الإرسال')}catch(err){showToast(err.message)}finally{e.currentTarget.disabled=false}};
    }
    renderLanguageIntegrity(reportData());document.getElementById('reportPrint').onclick=printProfessionalReport;document.getElementById('reportCsv').onclick=exportReportCsv;
  };

  function reportReadyForExport(){
    const r=reportData(),missing=reportMissingTranslations(r,reportSelection.language);if(!missing.length)return true;
    renderLanguageIntegrity(r);document.getElementById('reportLanguageIntegrity')?.scrollIntoView({behavior:'smooth',block:'start'});showToast(reportSelection.language==='en'?'أكمل الصياغة الإنجليزية للملاحظات قبل التصدير':'أكمل الصياغة العربية للملاحظات قبل التصدير');return false;
  }

  exportReportCsv=function(){if(!reportReadyForExport())return;const r=reportData(),lang=reportSelection.language,t=REPORT_COPY[lang];const rows=[[t.student,t.date,t.time,t.status,t.duration,t.note],...r.rows.map(x=>[x.name,x.date,x.time||x.displayTime,statusLabel(domain.status(x),lang),x.actualMinutes??x.duration,localizedNote(x,lang)])];const safe=v=>/^[=+@\-\t\r]/.test(String(v))?"'"+v:String(v??'');downloadBlob('\ufeff'+rows.map(row=>row.map(x=>'"'+safe(x).replaceAll('"','""')+'"').join(',')).join('\n'),`miaad-report-${r.start}-${lang}.csv`,'text/csv;charset=utf-8')};
  printProfessionalReport=function(){if(!reportReadyForExport())return;const r=reportData(),content='<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="css-fonts.css"><link rel="stylesheet" href="css-features.css"></head><body>'+reportMarkup(r,reportSelection.language)+'</body></html>';if(NATIVE?.printReport){NATIVE.printReport(content,'MIAAD '+r.start);return}window.print()};

  window.miaadStudentTimeLabel=studentTimeLabel;
  window.miaadReportLocalizedNote=localizedNote;
  window.miaadReportMissingTranslations=reportMissingTranslations;

  const style=document.createElement('style');style.textContent='.student-local-time{display:block;margin-top:3px;font-size:10px;opacity:.72;line-height:1.45}.student-zone-meta{opacity:.78}.report-timezones{font-size:11px;opacity:.78}.report-language-integrity textarea{margin-top:6px}.report-language-wording>summary{cursor:pointer;font-weight:700}.report-language-wording[open]{margin-top:8px}';document.head.append(style);

  renderFeatureSettings();
  renderAll();
  if(currentView==='report')renderReport();
})();
