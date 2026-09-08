(()=>{
  if(window.__miaadUiHotfixApplied)return;
  window.__miaadUiHotfixApplied=true;

  const $=(s,root=document)=>root.querySelector(s);
  const $$=(s,root=document)=>Array.from(root.querySelectorAll(s));
  const safe=s=>typeof escapeHtml==='function'?escapeHtml(String(s??'')):String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const numericTime=value=>typeof domain!=='undefined'&&domain.timeOK?domain.timeOK(value):/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value||''));
  const dayKey=d=>typeof dateKey==='function'?dateKey(d):`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const todayDate=()=>typeof startOfDay==='function'?startOfDay(new Date()):new Date(new Date().setHours(0,0,0,0));
  const localDate=(y,m,d)=>typeof startOfDay==='function'?startOfDay(new Date(y,m,d,12,0,0,0)):new Date(y,m,d,12,0,0,0);

  if(typeof NATIVE!=='undefined'&&NATIVE)document.documentElement.classList.add('native-shell');
  document.documentElement.classList.add('miaad-ui-clarity');

  /* ---------- Today: keep it semantically "today" and send browsing to Week. ---------- */
  function ensureTodayBrowseButton(){
    const strip=$('#smartFreeStrip');
    if(!strip||$('#todayBrowseDays'))return;
    const button=document.createElement('button');
    button.type='button';button.id='todayBrowseDays';button.className='today-browse-days';
    button.innerHTML='<span><b>استعراض الأيام والشهر</b><span>افتح التقويم لاختيار أي يوم ومراجعة حصصه</span></span><b aria-hidden="true">‹</b>';
    button.onclick=()=>{if(typeof switchView==='function')switchView('week')};
    strip.insertAdjacentElement('afterend',button);
  }

  function polishTodayTimes(){
    if(typeof domain==='undefined'||typeof selectedDate==='undefined')return;
    const rows=domain.occurrences(dayKey(selectedDate));
    $$('#agenda .feature-session').forEach((card,i)=>{
      const row=rows[i],gutter=$('.time-gutter',card),main=$('.time-main',card);
      if(!row||!gutter||!main)return;
      const fixed=numericTime(row.time);
      if(!fixed&&!String(row.displayTime||'').trim())main.textContent='وقت غير محدد';
      let context=$('.time-context',gutter);
      if(context)context.remove();
      context=document.createElement('small');context.className='time-context';
      if(row.time==='00:00')context.textContent='منتصف الليل';
      else if(!fixed&&String(row.displayTime||'').trim())context.textContent='وقت مرن';
      else if(!fixed)context.textContent='لم تُحدَّد الساعة';
      else return;
      gutter.appendChild(context);
    });
  }

  /* ---------- Month calendar: every day is directly reachable, including day 1. ---------- */
  let calendarCursor=new Date(selectedDate.getFullYear(),selectedDate.getMonth(),1,12,0,0,0);

  function syncCalendarCursor(){
    if(calendarCursor.getFullYear()!==selectedDate.getFullYear()||calendarCursor.getMonth()!==selectedDate.getMonth())
      calendarCursor=new Date(selectedDate.getFullYear(),selectedDate.getMonth(),1,12,0,0,0);
  }

  function ensureCalendarStructure(){
    const view=$('#view-week'),list=$('#weekList');if(!view||!list)return null;
    const heading=$('.date-block h1',view);if(heading)heading.textContent='التقويم والمواعيد';
    const subtitle=$('.date-block p',view);if(subtitle)subtitle.setAttribute('aria-live','polite');
    let shell=$('#miaadMonthCalendar');
    if(!shell){
      shell=document.createElement('section');shell.id='miaadMonthCalendar';shell.className='month-calendar-shell';shell.setAttribute('aria-label','التقويم الشهري');
      shell.innerHTML='<div class="month-calendar-toolbar"><div class="month-calendar-title"><b id="monthCalendarTitle">—</b><span>اختر أي يوم لعرض حصصه مباشرة</span></div><div class="month-calendar-actions"><button type="button" id="monthPrev" aria-label="الشهر السابق">‹</button><button type="button" class="month-today" id="monthToday">اليوم</button><button type="button" id="monthNext" aria-label="الشهر التالي">›</button></div></div><div class="month-weekdays" aria-hidden="true"><span>أحد</span><span>اثن</span><span>ثلا</span><span>أرب</span><span>خمي</span><span>جمع</span><span>سبت</span></div><div class="month-days" id="miaadMonthGrid"></div><div class="selected-day-panel" id="selectedDayPanel"></div>';
      list.before(shell);
    }
    let overview=$('#miaadWeekOverview');
    if(!overview){
      overview=document.createElement('details');overview.id='miaadWeekOverview';overview.className='week-overview';
      const summary=document.createElement('summary');summary.id='weekOverviewSummary';summary.textContent='عرض الأسبوع المحيط باليوم المحدد';overview.appendChild(summary);
      list.before(overview);overview.appendChild(list);
    }
    return shell;
  }

  function selectMonth(delta){
    const currentDay=selectedDate.getDate();
    const target=new Date(calendarCursor.getFullYear(),calendarCursor.getMonth()+delta,1,12,0,0,0);
    const maxDay=new Date(target.getFullYear(),target.getMonth()+1,0).getDate();
    selectedDate=localDate(target.getFullYear(),target.getMonth(),Math.min(currentDay,maxDay));
    calendarCursor=new Date(target.getFullYear(),target.getMonth(),1,12,0,0,0);
    if(typeof tap==='function')tap();
    renderWeekView();
    if(typeof renderWeekRail==='function')renderWeekRail();
  }

  function selectCalendarDay(key){
    const parts=key.split('-').map(Number);
    selectedDate=localDate(parts[0],parts[1]-1,parts[2]);
    calendarCursor=new Date(parts[0],parts[1]-1,1,12,0,0,0);
    if(typeof tap==='function')tap();
    renderWeekView();
    if(typeof renderWeekRail==='function')renderWeekRail();
  }

  function renderSelectedDayPanel(){
    const panel=$('#selectedDayPanel');if(!panel)return;
    const key=dayKey(selectedDate),rows=domain.occurrences(key),dateText=typeof fmtDate==='function'?fmtDate(selectedDate,{weekday:'long',day:'numeric',month:'long',year:'numeric'}):key;
    panel.innerHTML=`<div class="selected-day-head"><div><b>حصص اليوم المحدد</b><span>${safe(dateText)}</span></div><span class="selected-day-count">${rows.length} حصة</span></div>`+
      (rows.length?rows.map(r=>{
        const fixed=numericTime(r.time),time=fixed?r.time:(r.displayTime||'وقت غير محدد'),context=r.time==='00:00'?'منتصف الليل':(!fixed?(r.displayTime?'وقت مرن':'الساعة غير محددة'):'');
        return `<article class="selected-day-session"><time>${safe(time)}${context?`<span class="time-context">${safe(context)}</span>`:''}</time><div class="selected-day-copy"><b>${safe(r.name)}</b><small>${safe(statusLabel(domain.status(r)))} · ${Number(r.duration)||0} دقيقة${r.note?` · ${safe(r.note)}`:''}</small></div><button type="button" class="small-btn" data-day-record="${safe(r.id)}">فتح</button><div class="selected-day-record-host" data-day-record-host="${safe(r.id)}"></div></article>`;
      }).join(''):`<div class="calendar-empty">لا توجد حصص مقررة في هذا اليوم.<button type="button" class="small-btn" id="addForSelectedDay">إضافة موعد لهذا اليوم</button></div>`);
    $$('[data-day-record]',panel).forEach(button=>button.onclick=()=>{
      const row=rows.find(r=>r.id===button.dataset.dayRecord),host=$(`[data-day-record-host="${CSS.escape(button.dataset.dayRecord)}"]`,panel);
      if(row&&host&&typeof openRecordForm==='function')openRecordForm(row,row.studentId,host);
    });
    const add=$('#addForSelectedDay',panel);if(add)add.onclick=()=>{if(typeof openSheet==='function')openSheet(null,selectedDate)};
  }

  function renderMonthCalendar(){
    const shell=ensureCalendarStructure();if(!shell)return;
    const y=calendarCursor.getFullYear(),m=calendarCursor.getMonth(),days=new Date(y,m+1,0).getDate(),first=new Date(y,m,1,12).getDay();
    const title=$('#monthCalendarTitle',shell),grid=$('#miaadMonthGrid',shell),today=dayKey(todayDate()),selected=dayKey(selectedDate);
    if(title)title.textContent=new Intl.DateTimeFormat('ar-EG',{month:'long',year:'numeric'}).format(calendarCursor);
    let html='';for(let i=0;i<first;i++)html+='<span class="month-day-blank" aria-hidden="true"></span>';
    for(let d=1;d<=days;d++){
      const date=localDate(y,m,d),key=dayKey(date),count=domain.occurrences(key).length,classes=['month-day'];
      if(key===today)classes.push('today');if(key===selected)classes.push('selected');if(count)classes.push('has-lessons');
      const label=typeof fmtDate==='function'?fmtDate(date,{weekday:'long',day:'numeric',month:'long'}):key;
      html+=`<button type="button" class="${classes.join(' ')}" data-calendar-date="${key}" aria-label="${safe(label)}${count?`، ${count} حصة`:''}" aria-pressed="${key===selected?'true':'false'}"><span class="month-day-number">${new Intl.NumberFormat('ar-EG',{useGrouping:false}).format(d)}</span></button>`;
    }
    grid.innerHTML=html;
    $$('#miaadMonthGrid [data-calendar-date]').forEach(button=>button.onclick=()=>selectCalendarDay(button.dataset.calendarDate));
    $('#monthPrev',shell).onclick=()=>selectMonth(-1);$('#monthNext',shell).onclick=()=>selectMonth(1);$('#monthToday',shell).onclick=()=>{selectedDate=todayDate();calendarCursor=new Date(selectedDate.getFullYear(),selectedDate.getMonth(),1,12);renderWeekView();if(typeof renderWeekRail==='function')renderWeekRail()};
    renderSelectedDayPanel();
    const summary=$('#weekOverviewSummary'),range=$('#weekRange')?.textContent||'',total=$('#weekTotal')?.textContent||'0';
    if(summary)summary.textContent=`عرض الأسبوع المحيط باليوم المحدد · ${range} · ${total} موعد`;
  }

  /* ---------- Students ---------- */
  function polishStudents(){
    $$('#studentDirectory .student-summary').forEach(card=>{
      const name=$('.student-summary-copy b',card)?.textContent||'طالب';
      const cycle=$('.student-count b',card)?.textContent||'';
      card.setAttribute('aria-label',`${name}، تقدم الدورة ${cycle}`);
    });
  }

  /* ---------- Reports ---------- */
  function ensureReportMonthLabel(){
    const input=$('#reportMonth');if(!input||input.closest('#reportMonthControl'))return;
    const label=document.createElement('label');label.id='reportMonthControl';label.className='report-month-control';label.innerHTML='<span>الشهر</span>';
    input.before(label);label.appendChild(input);
  }

  function polishReport(){
    ensureReportMonthLabel();
    if(typeof reportData!=='function')return;
    const r=reportData(),article=$('#reportDocument .professional-report');if(!article)return;
    const lang=reportSelection?.language==='en'?'en':'ar',future=(r.rows||[]).filter(row=>domain.status(row)==='future').length,totalRows=(r.rows||[]).length,resolved=(r.rows||[]).filter(row=>!['future','pending'].includes(domain.status(row))).length;
    const coverage=$('#reportCoverage');if(coverage)coverage.textContent=`${resolved} / ${totalRows}`;
    const coverageLabel=$('#view-report .date-block .tiny-state span');if(coverageLabel)coverageLabel.textContent='حالات مسجلة';
    const totals=$('.report-totals',article);
    if(totals){
      let futureBox=$('[data-report-future]',totals);
      if(!futureBox){futureBox=document.createElement('div');futureBox.dataset.reportFuture='1';futureBox.innerHTML='<dt></dt><dd></dd>';totals.appendChild(futureBox)}
      $('dt',futureBox).textContent=lang==='en'?'Upcoming':'الحصص القادمة';$('dd',futureBox).textContent=String(future);
      let note=$('.report-context-note',article);if(!note){note=document.createElement('p');note.className='report-context-note';totals.insertAdjacentElement('afterend',note)}
      note.textContent=lang==='en'
        ?`Scheduled lessons means every lesson inside the selected period, including ${future} upcoming lesson${future===1?'':'s'}. Attendance and absence figures only reflect recorded outcomes; Miaad does not infer attendance.`
        :`«الحصص المقررة» تعني جميع الحصص الواقعة داخل الفترة المختارة، ومنها ${future} حصة قادمة. أرقام الحضور والغياب تعكس الحالات المسجلة فقط؛ مِيعاد لا يفترض حضورًا أو غيابًا تلقائيًا.`;
    }
    $$('td bdi',article).forEach(node=>{
      if(node.textContent.trim()!=='00:00'||node.parentElement.querySelector('.report-midnight'))return;
      const small=document.createElement('small');small.className='time-context report-midnight';small.textContent=lang==='en'?'Midnight':'منتصف الليل';node.parentElement.appendChild(small);
    });
  }

  /* ---------- Settings ---------- */
  function polishSettings(){
    const form=$('#globalSettings');if(!form)return;
    const zone=form.elements?.teacherTimeZone,zoneLabel=zone?.closest('label');
    if(zoneLabel&&!$('#teacherZoneSection',form)){
      const section=document.createElement('section');section.id='teacherZoneSection';section.innerHTML='<h4>المنطقة الزمنية</h4><p>هذا هو توقيت جدولك الأساسي. مناطق الطلاب تُعرض للمقارنة ولا تغيّر أوقات السجل المحفوظة.</p>';
      const firstDetails=$('details',form);if(firstDetails)firstDetails.before(section);else form.prepend(section);section.appendChild(zoneLabel);
    }
    const save=$('.save-btn',form);if(save)save.textContent='حفظ جميع الإعدادات';
    const nativeNotification=$('#view-settings .setting-block h3');if(nativeNotification&&nativeNotification.textContent==='تنبيهات الدروس')nativeNotification.textContent='إذن إشعارات أندرويد';
  }

  /* ---------- Wrap existing renderers only after the quality/luxury layer. ---------- */
  const baseRenderTodayAgenda=renderTodayAgenda;
  renderTodayAgenda=function(){baseRenderTodayAgenda();ensureTodayBrowseButton();polishTodayTimes()};

  const baseRenderWeekView=renderWeekView;
  renderWeekView=function(){ensureCalendarStructure();baseRenderWeekView();syncCalendarCursor();renderMonthCalendar()};

  const baseRenderStudents=renderStudents;
  renderStudents=function(filter=''){baseRenderStudents(filter);polishStudents()};

  const baseRenderReport=renderReport;
  renderReport=function(){baseRenderReport();polishReport()};

  const baseRenderFeatureSettings=renderFeatureSettings;
  renderFeatureSettings=function(){baseRenderFeatureSettings();polishSettings()};

  const baseCommitView=commitView;
  commitView=function(target){
    if(target==='today'){
      selectedDate=todayDate();
      renderTodayAgenda();
      if(typeof renderHeader==='function')renderHeader();
    }else if(target==='week'){
      syncCalendarCursor();renderWeekView();
    }else if(target==='students')renderStudents($('#studentSearch')?.value||'');
    else if(target==='settings')renderFeatureSettings();
    const result=baseCommitView(target);
    requestAnimationFrame(()=>window.scrollTo({top:0,left:0,behavior:'auto'}));
    return result;
  };

  /* Initial pass after all legacy/luxury scripts have finished. */
  ensureTodayBrowseButton();
  renderTodayAgenda();
  renderWeekView();
  renderStudents($('#studentSearch')?.value||'');
  renderFeatureSettings();
  if(typeof currentView!=='undefined'&&currentView==='report')renderReport();
})();
