/* Phase 1B Slice 2 integration: all scheduling-facing clock semantics delegate
   to the canonical temporal authority owned by app-domain.js. */
(()=>{
 if(window.__miaadTeacherTimezoneBridgeApplied)return;
 window.__miaadTeacherTimezoneBridgeApplied=true;
 const civilDate=key=>{const p=String(key||'').split('-').map(Number),d=new Date(p[0],p[1]-1,p[2],12,0,0,0);try{Object.defineProperty(d,'__miaadCivilDate',{value:key})}catch{}return d};
 const teacherClockDate=instant=>{const t=domain.teacherNow(instant),p=t.date.split('-').map(Number),q=t.time.split(':').map(Number),d=new Date(p[0],p[1]-1,p[2],q[0],q[1],q[2],0);try{Object.defineProperty(d,'__miaadCivilDate',{value:t.date})}catch{}return d};
 window.miaadCivilDate=civilDate;

 dateKey=function(d){return d&&typeof d.__miaadCivilDate==='string'?d.__miaadCivilDate:domain.civilDateAt(d)};
 startOfDay=function(d){return civilDate(dateKey(d))};
 addDays=function(d,n){return civilDate(domain.plus(dateKey(d),n))};
 getSunday=function(d){const key=dateKey(d);return civilDate(domain.plus(key,-domain.weekdayForDate(key)))};
 fmtDate=function(d,opts={weekday:'long',day:'numeric',month:'long'}){return d&&typeof d.__miaadCivilDate==='string'?domain.formatCivilDate(d.__miaadCivilDate,'ar-EG',opts):new Intl.DateTimeFormat('ar-EG',{...opts,timeZone:domain.teacherZone()}).format(d)};
 weekIndex=function(d){return Math.floor((domain.civilDayNumber(dateKey(d))-domain.civilDayNumber('2026-09-06'))/7)};
 idrisActive=function(d){return ((weekIndex(d)+idrisPhase)%2+2)%2===0};
 timeDate=function(d,t){return domain.resolveWallClock(dateKey(d),t)||new Date(NaN)};
 monthBounds=function(value){const key=typeof value==='string'?value:dateKey(value),b=domain.monthBounds(key);return{start:civilDate(b.start),end:civilDate(b.end)}};
 selectedDate=civilDate(domain.teacherNow().date);

 const baseLiveFree=SmartScheduleEngine.liveFree,baseActiveBlock=SmartScheduleEngine.activeBlock;
 SmartScheduleEngine.liveFree=function(now=new Date()){return baseLiveFree(teacherClockDate(now))};
 SmartScheduleEngine.activeBlock=function(now=new Date()){return baseActiveBlock(teacherClockDate(now))};

 const baseRenderHeader=renderHeader;
 renderHeader=function(){baseRenderHeader();const t=domain.teacherNow(),d=civilDate(t.date),heading=document.getElementById('todayHeading'),date=document.getElementById('todayDate'),phase=document.getElementById('idrisWeekState');if(heading)heading.textContent=DAYS[t.weekday];if(date)date.textContent=fmtDate(d,{day:'numeric',month:'long',year:'numeric'});if(phase)phase.textContent=idrisActive(d)?'دراسة':'راحة'};
 const baseRenderClock=renderClock;
 renderClock=function(){baseRenderClock();const clock=document.getElementById('clockNow');if(clock)clock.textContent=domain.teacherNow().time};

 const baseReadPrefs=readPrefs;
 readPrefs=function(form,base){const p=baseReadPrefs(form,base);if(form.elements.teacherTimeZone)p.teacherTimeZone=String(new FormData(form).get('teacherTimeZone')||'').trim();return p};
 const baseRenderFeatureSettings=renderFeatureSettings;
 renderFeatureSettings=function(){
  baseRenderFeatureSettings();const form=document.getElementById('globalSettings');if(!form)return;
  let field=form.elements.teacherTimeZone;
  if(!field){const details=form.querySelector('details'),fields=details?.querySelector('.feature-fields');if(fields){fields.insertAdjacentHTML('afterbegin',`<label>المنطقة الزمنية الأساسية<input name="teacherTimeZone" value="${escapeHtml(domain.teacherZone())}" placeholder="Africa/Cairo" autocomplete="off" required></label><p class="field-hint" style="grid-column:1/-1">هذا هو توقيت جدولك الأساسي. استخدم اسم IANA مثل Africa/Cairo أو Europe/London.</p>`);field=form.elements.teacherTimeZone}}
  const submit=form.onsubmit;if(field&&submit&&!submit.__miaadZoneGuard){const guarded=e=>{const zone=String(field.value||'').trim();if(!domain.validTimeZone(zone)){e.preventDefault();showToast('المنطقة الزمنية الأساسية غير صحيحة. استخدم اسم IANA مثل Africa/Cairo');return}submit(e)};guarded.__miaadZoneGuard=true;form.onsubmit=guarded}
 };
 const baseStudentForm=studentForm;
 studentForm=function(sid=''){baseStudentForm(sid);const hint=document.querySelector('#studentForm .field-hint');if(hint)hint.textContent='مواعيد الجدول الأساسية حسب المنطقة الزمنية للمعلم. منطقة الطالب للعرض والمقارنة فقط ولا تغيّر أوقات السجل المحفوظة.'};

 buildNativeReminders=function(daysAhead=30){
  const now=new Date(),today=domain.teacherNow(now).date,items=[];
  for(let d=0;d<=daysAhead;d++){
   const date=domain.plus(today,d);
   for(const r of domain.occurrences(date)){
    if(!domain.timeOK(r.time)||r.status!=='pending')continue;
    const pr=domain.prefs(r.studentId),start=domain.resolveWallClock(date,r.time),rem=r.schedule?.reminder||0;if(!start)continue;
    if(pr.notifications.upcoming&&rem>0)items.push({id:'upcoming:'+r.id,entity:'upcoming:'+r.id,at:+start-rem*60000,title:`درس ${r.name}`,body:`يبدأ الساعة ${r.time}`});
    if(pr.notifications.pending)items.push({id:'pending:'+r.id,entity:'pending:'+r.id,at:+start+(r.duration||30)*60000,title:`حصة ${r.name} بانتظار التسجيل`,body:'افتح مِيعاد لتسجيل حالة الحصة'});
   }
   if(domain.data.settings.notifications.daily){const wins=domain.availability(date),at=domain.resolveWallClock(date,domain.data.settings.notifications.dailyTime);if(at)items.push({id:'daily:'+date,entity:'daily:'+date,at:+at,title:`لديك ${wins.length} فترات متاحة اليوم`,body:`إجمالي الفراغ ${wins.reduce((n,w)=>n+w.minutes,0)} دقيقة`})}
  }
  for(const p of Object.values(domain.data.periods)){if(!p.archived&&domain.prefs(p.studentId).notifications.period){const at=domain.resolveWallClock(domain.plus(p.end,1),'08:00');if(at)items.push({id:'period:'+p.id,entity:'period:'+p.id,at:+at,title:`انتهت فترة تقرير ${domain.data.students[p.studentId]?.name}`,body:'راجع الحصص وأنشئ تقرير الفترة'})}}
  const notes=Object.values(domain.data.notifications).filter(n=>n.active&&!n.read);for(const n of notes.filter(n=>!['pending','upcoming','daily'].includes(n.type)))items.push({id:n.id+(n.snoozeUntil?':'+n.snoozeUntil:''),entity:n.id,at:Math.max(+now+20000,n.snoozeUntil||0),title:n.title,body:n.body});
  for(const n of notes.filter(n=>n.type==='pending'&&n.snoozeUntil>+now))items.push({id:n.id+':'+n.snoozeUntil,entity:n.id,at:n.snoozeUntil,title:n.title,body:n.body});
  const pending=notes.filter(n=>n.type==='pending'&&n.snoozeUntil<=+now);if(pending.length)items.push({id:'pending-summary:'+today,entity:'center',at:+now+20000,title:`${pending.length} حصص بانتظار التسجيل`,body:'افتح مركز التنبيهات لمراجعة الحصص'});
  return [...new Map(items.filter(x=>x.at>+now+15000).map(x=>[x.id,x])).values()];
 };
 window.miaadBuildNativeReminders=buildNativeReminders;

 window.addEventListener('load',()=>setTimeout(()=>{
  if(window.__miaadTeacherCalendarFinalized)return;window.__miaadTeacherCalendarFinalized=true;
  const priorRenderWeekView=renderWeekView;
  const moveMonth=(key,delta)=>{const [year,month,day]=key.split('-').map(Number),index=year*12+(month-1)+delta,nextYear=Math.floor(index/12),nextMonth=((index%12)+12)%12+1,last=Number(domain.monthBounds(`${nextYear}-${String(nextMonth).padStart(2,'0')}`).end.slice(-2));return `${nextYear}-${String(nextMonth).padStart(2,'0')}-${String(Math.min(day,last)).padStart(2,'0')}`};
  const canonicalMonth=()=>{
   const grid=document.getElementById('miaadMonthGrid');if(!grid)return;
   const selected=dateKey(selectedDate),first=selected.slice(0,7)+'-01',bounds=domain.monthBounds(selected),firstDay=domain.weekdayForDate(first),days=Number(bounds.end.slice(-2)),today=domain.teacherNow().date;
   const title=document.getElementById('monthCalendarTitle');if(title)title.textContent=domain.formatCivilDate(first,'ar-EG',{month:'long',year:'numeric'});
   let html='';for(let i=0;i<firstDay;i++)html+='<span class="month-day-blank" aria-hidden="true"></span>';
   for(let n=1;n<=days;n++){const key=selected.slice(0,7)+'-'+String(n).padStart(2,'0'),count=domain.occurrences(key).length,classes=['month-day'];if(key===today)classes.push('today');if(key===selected)classes.push('selected');if(count)classes.push('has-lessons');html+=`<button type="button" class="${classes.join(' ')}" data-calendar-date="${key}" aria-label="${domain.formatCivilDate(key,'ar-EG',{weekday:'long',day:'numeric',month:'long'})}${count?`، ${count} حصة`:''}" aria-pressed="${key===selected?'true':'false'}"><span class="month-day-number">${new Intl.NumberFormat('ar-EG',{useGrouping:false}).format(n)}</span></button>`}
   grid.innerHTML=html;
   grid.querySelectorAll('[data-calendar-date]').forEach(button=>button.onclick=()=>{selectedDate=civilDate(button.dataset.calendarDate);priorRenderWeekView();canonicalMonth();if(typeof renderWeekRail==='function')renderWeekRail()});
   const prev=document.getElementById('monthPrev'),next=document.getElementById('monthNext'),todayButton=document.getElementById('monthToday');
   if(prev)prev.onclick=()=>{selectedDate=civilDate(moveMonth(selected,-1));priorRenderWeekView();canonicalMonth();if(typeof renderWeekRail==='function')renderWeekRail()};
   if(next)next.onclick=()=>{selectedDate=civilDate(moveMonth(selected,1));priorRenderWeekView();canonicalMonth();if(typeof renderWeekRail==='function')renderWeekRail()};
   if(todayButton)todayButton.onclick=()=>{selectedDate=civilDate(domain.teacherNow().date);priorRenderWeekView();canonicalMonth();if(typeof renderWeekRail==='function')renderWeekRail()};
  };
  renderWeekView=function(){priorRenderWeekView();canonicalMonth()};
  renderWeekView();renderHeader();renderClock();
 },0));

 renderFeatureSettings();renderHeader();renderClock();
})();
