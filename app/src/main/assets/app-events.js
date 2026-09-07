function closeSheet(force=false){
 if(editorDirty&&!force&&!confirm('لديك تغييرات غير محفوظة. هل تريد الخروج دون حفظها؟'))return false;
 const sheet=document.getElementById('lessonSheet');sheet.classList.remove('show');document.getElementById('sheetBackdrop').classList.remove('show');sheet.setAttribute('aria-hidden','true');
 editorDirty=false;editorState('جاهز');return true
}

document.querySelectorAll('#sessionStatePicker button').forEach(b=>b.onclick=()=>{
 document.querySelectorAll('#sessionStatePicker button').forEach(x=>x.classList.remove('active'));b.classList.add('active');markEditorDirty();tap()
});
document.getElementById('sheetBackdrop').onclick=()=>closeSheet();
document.getElementById('closeSheetBtn').onclick=()=>closeSheet();
document.getElementById('toggleFreeWindows').onclick=()=>{freeWindowsExpanded=!freeWindowsExpanded;renderAvailability();tap()};

const editorFieldIds=['fName','fDay','fStart','fDuration','fMaxDuration','fRepeat','fReminder','fDisplayTime','fNote','fSessionNote'];
editorFieldIds.forEach(id=>document.getElementById(id).addEventListener('input',markEditorDirty));
['fDay','fDuration','fMaxDuration','fStart'].forEach(id=>document.getElementById(id).addEventListener('input',renderAvailability));

document.getElementById('saveLesson').onclick=()=>{
 const oldId=document.getElementById('editId').value,name=document.getElementById('fName').value.trim();
 if(!name){showToast('اكتب اسم الطالب أو المجموعة أولًا');document.getElementById('fName').focus();return}
 const duration=Math.max(0,+document.getElementById('fDuration').value||0),
   requestedMax=Math.max(0,+document.getElementById('fMaxDuration').value||0),
   maxDuration=requestedMax>duration?requestedMax:duration,
   obj={
     id:oldId||`custom-${Date.now()}`,name,day:+document.getElementById('fDay').value,
     start:document.getElementById('fStart').value,duration,
     repeat:document.getElementById('fRepeat').value,reminder:+document.getElementById('fReminder').value||0,
     displayTime:document.getElementById('fDisplayTime').value.trim(),note:document.getElementById('fNote').value.trim()
   };
 if(!obj.start&&!obj.displayTime){showToast('أدخل ساعة البداية أو وصف الوقت مثل بعد المغرب');return}
 if(maxDuration>duration)obj.maxDuration=maxDuration;
 const check=hasFixedTime(obj)?SmartScheduleEngine.conflict(chosenSheetDate(),toSeconds(obj.start),maxDuration||30,oldId):{hard:[],soft:[]};
 if(check.hard.length&&!confirm(`يوجد تعارض مع ${check.hard.map(x=>x.name).join('، ')}. هل تريد حفظ الموعد رغم ذلك؟`))return;
 const idx=lessons.findIndex(x=>x.id===obj.id);if(idx>=0)lessons[idx]=obj;else lessons.push(obj);
 const chosenState=document.querySelector('#sessionStatePicker button.active')?.dataset.state??'';
 if(oldId)setSessionState(obj,sheetContextDate||selectedDate,chosenState,'detail-editor');
 const note=document.getElementById('fSessionNote').value.trim(),k=keyFor(obj,sheetContextDate||selectedDate);
 if(note)sessionNotes[k]=note;else delete sessionNotes[k];
 persist();editorDirty=false;closeSheet(true);renderAll();showToast('حُفظت التعديلات')
};
document.getElementById('deleteLesson').onclick=()=>{
 const id=document.getElementById('editId').value;if(!id)return;
 if(confirm('سيُحذف هذا الموعد المتكرر من الجدول. متابعة؟')){
   lessons=lessons.filter(x=>x.id!==id);persist();editorDirty=false;closeSheet(true);renderAll();showToast('تم حذف الموعد')
 }
};

const VIEW_ORDER=['today','week','students','report','settings'];
function commitView(target){
 document.querySelectorAll('.nav-btn').forEach(x=>x.classList.toggle('active',x.dataset.view===target));
 document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id===`view-${target}`));
 if(target==='report')renderReport();
 currentView=target;
 requestAnimationFrame(()=>window.scrollTo({top:viewScroll[target]||0,left:0,behavior:'auto'}))
}
function switchView(target){
 if(!VIEW_ORDER.includes(target)||target===currentView)return;
 viewScroll[currentView]=window.scrollY;
 const direction=VIEW_ORDER.indexOf(target)>VIEW_ORDER.indexOf(currentView)?'forward':'back';
 document.documentElement.dataset.navDir=direction;tap();
 if(matchMedia('(prefers-reduced-motion: reduce)').matches){commitView(target);document.documentElement.removeAttribute('data-nav-dir');return}
 if(document.startViewTransition){
   const transition=document.startViewTransition(()=>commitView(target));
   transition.finished.finally(()=>document.documentElement.removeAttribute('data-nav-dir'))
 }else{
   commitView(target);const v=document.getElementById(`view-${target}`),cls=`fallback-in-${direction}`;v.classList.add(cls);setTimeout(()=>v.classList.remove(cls),320);setTimeout(()=>document.documentElement.removeAttribute('data-nav-dir'),330)
 }
}
document.querySelectorAll('.nav-btn').forEach(btn=>btn.onclick=()=>switchView(btn.dataset.view));
document.getElementById('studentSearch').addEventListener('input',e=>renderStudents(e.target.value));
document.getElementById('focusEnterBtn').onclick=()=>{if(currentFocus)handleSessionAction('entered',currentFocus.lesson,currentFocus.date)};
document.getElementById('focusMoreBtn').onclick=()=>{if(currentFocus)openSheet(currentFocus.lesson,currentFocus.date)};
document.getElementById('bellBtn').onclick=()=>document.querySelector('[data-view="settings"]').click();
document.getElementById('addLessonBtn').onclick=()=>openSheet(null,selectedDate);
document.getElementById('smartFreeStrip').onclick=()=>openSheet(null,new Date());document.getElementById('smartFreeStrip').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openSheet(null,new Date())}};
document.getElementById('toggleIdrisPhase').onclick=()=>{idrisPhase=idrisPhase?0:1;persist();renderAll();showToast('تم قلب أسبوع إدريس')};
document.getElementById('enableNotif').onclick=async()=>{if(NATIVE&&typeof NATIVE.requestNotificationPermission==='function'){try{NATIVE.requestNotificationPermission();setTimeout(renderHeader,350);showToast('تم طلب إذن تنبيهات أندرويد');return}catch{}}if(!('Notification'in window)){showToast('هذا المتصفح لا يدعم الإشعارات');return}const p=await Notification.requestPermission();renderHeader();showToast(p==='granted'?'تم تفعيل الإشعارات':'لم يُمنح الإذن')};
document.getElementById('reportMonth').addEventListener('change',renderReport);document.getElementById('reportCsv').onclick=exportReportCsv;document.getElementById('reportPrint').onclick=()=>window.print();
document.getElementById('exportBtn').onclick=()=>{const data={schemaVersion:2,generatedAt:new Date().toISOString(),lessons,sessionState,sessionNotes,sessionAudit,idrisPhase};downloadBlob(JSON.stringify(data,null,2),`miad-backup-${dateKey(new Date())}.json`,'application/json');showToast('تم تجهيز النسخة الاحتياطية')};
document.getElementById('importBtn').onclick=()=>document.getElementById('importFile').click();document.getElementById('importFile').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;try{const data=JSON.parse(await file.text());if(!data||!Array.isArray(data.lessons))throw new Error('صيغة غير صحيحة');const existing=new Map(lessons.map(x=>[x.id,x]));data.lessons.forEach(x=>existing.set(x.id,x));lessons=normalizeSchedule([...existing.values()]);sessionState={...sessionState,...(data.sessionState||{})};sessionNotes={...sessionNotes,...(data.sessionNotes||{})};for(const [k,v] of Object.entries(data.sessionAudit||{}))sessionAudit[k]=[...(sessionAudit[k]||[]),...v].sort((a,b)=>String(a.at).localeCompare(String(b.at)));if(Number.isFinite(Number(data.idrisPhase)))idrisPhase=Number(data.idrisPhase);persist();renderAll();showToast('تم دمج قاعدة البيانات بنجاح')}catch(err){showToast('تعذر استيراد الملف: صيغة JSON غير متوافقة')}finally{e.target.value=''}};

setInterval(()=>{renderClock();renderFocus();if(!('Notification'in window)||Notification.permission!=='granted')return;const now=new Date();buildOccurrences(1).forEach(x=>{const r=x.lesson.reminder||0;if(!r)return;const mins=Math.floor((x.start-now)/60000),token=`miad-notified-${keyFor(x.lesson,x.date)}-${r}`;if(mins===r&&!sessionStorage.getItem(token)){new Notification(`درس ${x.lesson.name}`,{body:`يبدأ ${x.lesson.displayTime||`الساعة ${x.lesson.start}`} — بعد ${r} دقيقة`});sessionStorage.setItem(token,'1')}})},1000);
renderAll();
window.__miaadNativeStatus(nativeSyncState);
