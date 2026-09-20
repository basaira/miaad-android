"""Installed-APK Phase 1C occurrence-authority regression probe."""
import json
import os
import subprocess
import time
import urllib.request
from pathlib import Path

import websocket

API_LEVEL=os.environ.get("MIAAD_API_LEVEL","31")
SUFFIX=f"api{API_LEVEL}"
PACKAGE="com.miaad.app"
ACTIVITY=f"{PACKAGE}/.MainActivity"
BENIGN_VIBRATION="Blocked call to navigator.vibrate because user hasn't tapped on the frame or any embedded frame yet"


def adb(*args):
    return subprocess.check_output(["adb",*args],text=True).strip()


def adb_run(*args):
    return subprocess.run(["adb",*args],text=True,capture_output=True)


def process_pid(timeout=45):
    deadline=time.time()+timeout
    while time.time()<deadline:
        result=adb_run("shell","pidof",PACKAGE)
        pid=result.stdout.strip()
        if result.returncode==0 and pid:
            return pid.split()[0]
        time.sleep(1)
    raise AssertionError(f"{PACKAGE} process did not appear within {timeout}s")


def wait_stopped(timeout=20):
    deadline=time.time()+timeout
    while time.time()<deadline:
        result=adb_run("shell","pidof",PACKAGE)
        if result.returncode!=0 or not result.stdout.strip():
            return
        time.sleep(.5)
    raise AssertionError(f"{PACKAGE} did not stop within {timeout}s")


def start_app(timeout=60):
    deadline=time.time()+timeout
    last_output=""
    while time.time()<deadline:
        result=adb_run("shell","am","start","-W","-n",ACTIVITY)
        last_output=((result.stdout or "")+"\n"+(result.stderr or "")).strip()
        if result.returncode==0:
            try:
                return process_pid(min(6,max(1,int(deadline-time.time()))))
            except AssertionError:
                pass
        time.sleep(1)
    raise AssertionError(f"{PACKAGE} did not restart; last output: {last_output}")


def connect(timeout=60):
    deadline=time.time()+timeout
    last_error=None
    while time.time()<deadline:
        try:
            pid=process_pid(min(10,max(1,int(deadline-time.time()))))
            adb("forward","tcp:9222","localabstract:webview_devtools_remote_"+pid)
            tabs=json.load(urllib.request.urlopen("http://127.0.0.1:9222/json",timeout=2))
            pages=[t for t in tabs if t.get("type")=="page"]
            if not pages:
                raise RuntimeError("No WebView page target yet")
            page=next((t for t in pages if "android_asset" in (t.get("url") or "")),pages[0])
            return websocket.create_connection(page["webSocketDebuggerUrl"],suppress_origin=True,timeout=60)
        except Exception as exc:
            last_error=exc
            time.sleep(1)
    raise AssertionError(f"WebView debugging connection unavailable: {last_error}")


seq=0
def evaluate(ws,expression):
    global seq
    seq+=1
    ws.send(json.dumps({"id":seq,"method":"Runtime.evaluate","params":{"expression":expression,"returnByValue":True,"awaitPromise":True}}))
    while True:
        msg=json.loads(ws.recv())
        if msg.get("id")!=seq:
            continue
        result=msg["result"]
        assert "exceptionDetails" not in result,result
        return result["result"].get("value")


def wait_runtime_ready(ws,timeout=60):
    deadline=time.time()+timeout
    last=None
    while time.time()<deadline:
        try:
            ready=evaluate(ws,"typeof domain!=='undefined' && typeof openSheetWithContext==='function' && typeof refreshLegacyOccurrenceMirrors==='function' && typeof AndroidBridge!=='undefined' && document.readyState==='complete'")
            if ready:
                return
            last="Phase 1C runtime not ready"
        except Exception as exc:
            last=exc
        time.sleep(1)
    raise AssertionError(f"Miaad Phase 1C runtime did not become ready: {last}")


def fatal_log_evidence():
    logcat=adb("logcat","-d")
    assert "FATAL EXCEPTION" not in logcat,"FATAL EXCEPTION after occurrence-authority probe"
    fatal_android=[line for line in logcat.splitlines() if "AndroidRuntime" in line and (" F " in line or " E " in line)]
    assert not fatal_android,f"AndroidRuntime fatal lines: {fatal_android}"
    miaad=[line for line in logcat.splitlines() if "E MiaadWeb" in line]
    benign=[line for line in miaad if BENIGN_VIBRATION in line]
    fatal=[line for line in miaad if BENIGN_VIBRATION not in line]
    assert not fatal,f"Genuine MiaadWeb errors: {fatal}"
    return {"benignMiaadWebWarnings":len(benign),"genuineFatalMiaadWebErrorCount":len(fatal)}


ws=connect()
wait_runtime_ready(ws)
result=evaluate(ws,r"""(()=>{
 const assert=(value,label)=>{if(!value)throw Error(label)};
 const setInput=(id,value)=>{const el=document.getElementById(id);el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return el};
 const clickState=state=>{const b=document.querySelector('#sessionStatePicker button[data-state="'+state+'"]');assert(b&&!b.disabled,'state control unavailable: '+state);b.click()};
 const today=domain.teacherNow().date,weekday=domain.weekdayForDate(today),sid='occ-authority-runtime';
 if(!domain.data.students[sid])domain.saveStudent({id:sid,name:'Occurrence authority runtime',startDate:domain.plus(today,-30),custom:false,settings:{}});

 // C1: authoritative record beats deliberately stale compatibility mirrors.
 const c1id='runtime-occ-c1';
 domain.data.schedules[c1id]=[];
 lessons=lessons.filter(x=>x.id!==c1id);
 const c1=domain.saveSchedule({id:c1id,studentId:sid,name:domain.data.students[sid].name,day:weekday,start:'10:00',duration:30,repeat:'weekly',reminder:20},today);
 lessons.push(c1);
 const c1row=domain.resolveScheduleOccurrence(c1id,today);assert(c1row,'C1 projection missing');
 domain.record({...c1row,status:'entered',note:'canonical-runtime-note',actualMinutes:23,countOverride:false});
 sessionState[c1row.id]='absent';sessionNotes[c1row.id]='stale-runtime-note';saveLocalState();
 openSheetWithContext(lessons.find(x=>x.id===c1id),domain.parse(today),'occurrence');
 assert(document.querySelector('#sessionStatePicker button.active').dataset.state==='entered','C1 editor status did not use record');
 assert(document.getElementById('fSessionNote').value==='canonical-runtime-note','C1 editor note did not use record');
 setInput('fReminder','30');document.getElementById('saveLesson').click();
 const c1after=domain.data.records[c1row.id];
 assert(c1after.status==='entered','C1 status changed');
 assert(c1after.note==='canonical-runtime-note','C1 note changed');
 assert(c1after.actualMinutes===23,'C1 actualMinutes changed');
 assert(c1after.countOverride===false,'C1 countOverride changed');
 assert(sessionState[c1row.id]==='entered','C1 status mirror not refreshed');
 assert(sessionNotes[c1row.id]==='canonical-runtime-note','C1 note mirror not refreshed');

 // C2 real D.
 openSheetWithContext(null,domain.parse(today),'calendar');
 document.getElementById('editId').value='runtime-occ-real';
 setInput('fName','Occurrence real runtime');
 setInput('fDay',weekday);setInput('fStart','20:00');setInput('fDuration','30');setInput('fRepeat','weekly');
 clickState('entered');setInput('fSessionNote','real-runtime-note');document.getElementById('saveLesson').click();
 const realId=today+'__runtime-occ-real',real=domain.data.records[realId];
 assert(real&&real.status==='entered'&&real.note==='real-runtime-note','C2 real occurrence record missing');
 assert(Object.values(domain.data.records).filter(r=>r.id===realId).length===1,'C2 real duplicate record');

 // C2 invalid wrong weekday: the combined save must roll back.
 openSheetWithContext(null,domain.parse(today),'calendar');
 document.getElementById('editId').value='runtime-occ-invalid-weekday';
 setInput('fName','Occurrence invalid weekday');
 setInput('fDay',(weekday+1)%7);setInput('fStart','21:00');setInput('fRepeat','weekly');
 clickState('entered');document.getElementById('saveLesson').click();
 const badId=today+'__runtime-occ-invalid-weekday';
 assert(!domain.data.schedules['runtime-occ-invalid-weekday'],'wrong-weekday schedule escaped rollback');
 assert(!domain.data.records[badId],'wrong-weekday record created');
 assert(sessionState[badId]===undefined&&sessionNotes[badId]===undefined,'wrong-weekday mirror created');
 closeSheet(true);

 // Find a matching-weekday phase-0 off week without hard-coding calendar dates.
 let offPhaseDate='';
 try{
   domain.atomic(()=>{
     domain.saveSchedule({id:'runtime-occ-phase-probe',studentId:sid,name:domain.data.students[sid].name,day:weekday,start:'22:00',duration:30,repeat:'biweekly',phase:0},today);
     const a=domain.plus(today,7),b=domain.plus(today,14);
     offPhaseDate=domain.resolveScheduleOccurrence('runtime-occ-phase-probe',a)?b:a;
     throw Error('__ROLLBACK_PHASE_PROBE__');
   });
 }catch(error){if(error.message!=='__ROLLBACK_PHASE_PROBE__')throw error}
 assert(offPhaseDate&&domain.weekdayForDate(offPhaseDate)===weekday,'off-phase date not derived');
 openSheetWithContext(null,domain.parse(offPhaseDate),'calendar');
 document.getElementById('editId').value='runtime-occ-invalid-phase';
 setInput('fName','Occurrence invalid phase');setInput('fDay',weekday);setInput('fStart','22:00');setInput('fRepeat','biweekly');setInput('fSessionNote','must-not-survive');
 document.getElementById('saveLesson').click();
 const phaseBadId=offPhaseDate+'__runtime-occ-invalid-phase';
 assert(!domain.data.schedules['runtime-occ-invalid-phase'],'off-phase schedule escaped rollback');
 assert(!domain.data.records[phaseBadId],'off-phase record created');
 assert(sessionState[phaseBadId]===undefined&&sessionNotes[phaseBadId]===undefined,'off-phase mirror created');
 closeSheet(true);

 domainCommit();
 return {
   today,
   c1RecordId:c1row.id,
   c1Status:c1after.status,
   c1Note:c1after.note,
   c1ActualMinutes:c1after.actualMinutes,
   c1CountOverride:c1after.countOverride,
   realId,
   realStatus:real.status,
   realNote:real.note,
   invalidWeekdayId:badId,
   invalidPhaseDate:offPhaseDate,
   invalidPhaseId:phaseBadId
 };
})()""")
ws.close()

adb("shell","am","force-stop",PACKAGE)
wait_stopped()
start_app()
ws=connect(60)
wait_runtime_ready(ws,60)
restart=evaluate(ws,r"""((ids)=>{
 const c1=domain.data.records[ids.c1],real=domain.data.records[ids.real];
 return {
  c1Status:c1&&c1.status,
  c1Note:c1&&c1.note,
  c1ActualMinutes:c1&&c1.actualMinutes,
  c1CountOverride:c1&&c1.countOverride,
  realStatus:real&&real.status,
  realNote:real&&real.note,
  invalidWeekdayRecord:!!domain.data.records[ids.bad],
  invalidPhaseRecord:!!domain.data.records[ids.phaseBad],
  invalidWeekdaySchedule:!!domain.data.schedules['runtime-occ-invalid-weekday'],
  invalidPhaseSchedule:!!domain.data.schedules['runtime-occ-invalid-phase'],
  invalidWeekdayState:sessionState[ids.bad],
  invalidWeekdayNote:sessionNotes[ids.bad],
  invalidPhaseState:sessionState[ids.phaseBad],
  invalidPhaseNote:sessionNotes[ids.phaseBad]
 };
})("""+json.dumps({"c1":result["c1RecordId"],"real":result["realId"],"bad":result["invalidWeekdayId"],"phaseBad":result["invalidPhaseId"]})+""")""")
ws.close()

assert restart["c1Status"]=="entered",restart
assert restart["c1Note"]=="canonical-runtime-note",restart
assert restart["c1ActualMinutes"]==23,restart
assert restart["c1CountOverride"] is False,restart
assert restart["realStatus"]=="entered",restart
assert restart["realNote"]=="real-runtime-note",restart
for key in ("invalidWeekdayRecord","invalidPhaseRecord","invalidWeekdaySchedule","invalidPhaseSchedule"):
    assert restart[key] is False,(key,restart)
for key in ("invalidWeekdayState","invalidWeekdayNote","invalidPhaseState","invalidPhaseNote"):
    assert restart.get(key) is None,(key,restart)

result["afterRestart"]=restart
result.update(fatal_log_evidence())
result["apiLevel"]=API_LEVEL
result["result"]="PASS"
Path("audit").mkdir(exist_ok=True)
Path(f"audit/occurrence-authority-review-{SUFFIX}.json").write_text(json.dumps(result,indent=2),encoding="utf-8")
print(f"Occurrence authority installed-APK review on API {API_LEVEL}: PASS")
