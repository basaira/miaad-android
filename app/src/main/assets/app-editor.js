function renderAvailability(){
 const wrap=document.getElementById('availabilityEngine');if(!wrap)return;
 const day=+document.getElementById('fDay').value,
   duration=Math.max(10,+document.getElementById('fDuration').value||30,+document.getElementById('fMaxDuration').value||0),
   start=toSeconds(document.getElementById('fStart').value||'00:00'),
   excludeId=document.getElementById('editId').value,
   date=SmartScheduleEngine.nearestDateForDay(day,sheetContextDate||selectedDate),
   conf=document.getElementById('fStart').value?SmartScheduleEngine.conflict(date,start,duration,excludeId):{hard:[],soft:[]},
   box=document.getElementById('availabilityConflict');

 box.className='availability-conflict '+(conf.hard.length?'hard':conf.soft.length?'soft':'clean');
 box.textContent=!document.getElementById('fStart').value?'وقت البداية غير محدد؛ لا يمكن تأكيد التعارض حتى إدخال ساعة.':conf.hard.length
   ?`هذا الوقت يتعارض مع: ${conf.hard.map(x=>`${x.name} (${x.label})`).join('، ')}`
   :conf.soft.length
     ?`الوقت متاح حسابيًا، لكنه يوجد في هذا اليوم موعد غير محدد الساعة: ${conf.soft.map(x=>`${x.name} — ${x.label}`).join('، ')}`
     :'الوقت المختار متاح بلا تعارض قطعي.';
 document.getElementById('availabilityCaption').textContent=`${DAYS[day]} · يحتاج ${duration} دقيقة · المواعيد الممتدة تُحجز بأقصى مدتها`;

 const candidates=SmartScheduleEngine.scoreCandidates(date,duration,excludeId),list=document.getElementById('slotList');
 list.innerHTML=candidates.length?candidates.map(c=>{
   const quality=c.score>=82?'أفضل اختيار':c.score>=68?'اختيار مناسب':'متاح',
     cls=c.score>=82?'':c.score>=68?'mid':'low',
     warning=c.softHits.length?` · قرب ${c.softHits.map(x=>x.label).join('، ')}`:'';
   return `<button type="button" class="slot-option" data-slot="${secToClock(c.start)}">
     <span class="slot-time">${secToClock(c.start)}</span>
     <span class="slot-meta"><b>${quality}</b><span>${duration} د · ينتهي ${secToClock(c.end)}${warning}</span></span>
     <span class="slot-score ${cls}">ملاءمة ${c.score}%</span>
   </button>`
 }).join(''):'<div class="availability-empty">لا توجد فترة تستوعب هذه المدة في هذا اليوم.</div>';
 list.querySelectorAll('[data-slot]').forEach(b=>b.onclick=()=>{document.getElementById('fStart').value=b.dataset.slot;markEditorDirty();renderAvailability();tap();showToast(`تم اختيار ${b.dataset.slot}`)});

 const wins=SmartScheduleEngine.freeWindows(date,excludeId).filter(w=>w.seconds>=duration*60),
   visible=freeWindowsExpanded?wins:wins.slice(0,4),
   free=document.getElementById('freeWindows'),
   toggle=document.getElementById('toggleFreeWindows');
 if(toggle){toggle.textContent=wins.length>4?(freeWindowsExpanded?'إظهار الأقل':`عرض الكل (${wins.length})`):'كل الفترات ظاهرة';toggle.disabled=wins.length<=4}
 free.innerHTML=visible.length?visible.map(w=>`
   <button type="button" class="free-window-card${w.softRisks.length?' soft-risk':''}" data-free-start="${secToClock(w.start)}">
     <span class="free-window-range">${freeWindowLabel(w)}</span>
     <span class="free-window-duration">مدة الفراغ: ${humanDuration(w.seconds)}${w.softRisks.length?` · <span class="free-window-risk">يوجد موعد غير محدد الساعة</span>`:''}</span>
     <span class="free-window-cta">استخدم البداية</span>
   </button>`).join(''):'<div class="availability-empty">لا توجد فترات فارغة كافية لهذه المدة.</div>';
 free.querySelectorAll('[data-free-start]').forEach(b=>b.onclick=()=>{document.getElementById('fStart').value=b.dataset.freeStart;markEditorDirty();renderAvailability();tap();showToast(`بدأ الموعد عند ${b.dataset.freeStart}`)})
}

function renderAll(){renderHeader();renderFocus();renderTodayAgenda();renderWeekView();renderStudents(document.getElementById('studentSearch').value||'');renderDesktop();renderReport();renderClock()}

function openSheet(l=null,d=selectedDate,focusNote=false){
 sheetContextDate=d;editorDirty=false;freeWindowsExpanded=false;
 const sheet=document.getElementById('lessonSheet');
 sheet.classList.add('show');document.getElementById('sheetBackdrop').classList.add('show');sheet.setAttribute('aria-hidden','false');
 document.getElementById('sheetTitle').textContent=l?'تعديل الدرس':'إضافة موعد';
 document.getElementById('sheetSub').textContent=l?'كل تفاصيل الموعد والحصة قابلة للتعديل هنا.':'اختر اليوم والمدة؛ مِيعاد يرتب أفضل الفترات تلقائيًا.';
 document.getElementById('editId').value=l?.id||'';
 document.getElementById('fName').value=l?.name||'';
 document.getElementById('fDay').value=l?.day??d.getDay();
 document.getElementById('fStart').value=l?(l.start||''):'17:00';
 document.getElementById('fDuration').value=l?.duration??domain.data.settings.duration;
 document.getElementById('fMaxDuration').value=l?.maxDuration||'';
 document.getElementById('fRepeat').value=l?.repeat||'weekly';
 document.getElementById('fReminder').value=l?.reminder??20;
 document.getElementById('fDisplayTime').value=l?.displayTime||'';
 document.getElementById('fNote').value=l?.note||'';
 document.getElementById('fSessionNote').value=l?sessionNotes[keyFor(l,d)]||'':'';
 document.getElementById('deleteLesson').style.display=l?'grid':'none';
 const currentState=l?(sessionState[keyFor(l,d)]||''):'';
 document.querySelectorAll('#sessionStatePicker button').forEach(b=>b.classList.toggle('active',b.dataset.state===currentState));
 editorState(l?'جاهز للتعديل':'موعد جديد');
 document.getElementById('editorScroll').scrollTop=0;
 renderAvailability();
 if(focusNote)setTimeout(()=>document.getElementById('fSessionNote').focus(),220)
}
