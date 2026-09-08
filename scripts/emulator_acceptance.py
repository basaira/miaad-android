"""Exercise the installed APK's real WebView, native snapshot and alarm bridge.
Test records exist only in the isolated offline CI emulator, never in the APK."""
import json, os, subprocess, time, urllib.request
import websocket
from pathlib import Path

API_LEVEL=os.environ.get('MIAAD_API_LEVEL','31')
SUFFIX=f'api{API_LEVEL}'
PACKAGE='com.miaad.app'
ACTIVITY=f'{PACKAGE}/.MainActivity'


def adb(*args):
    return subprocess.check_output(['adb',*args],text=True).strip()


def adb_run(*args):
    return subprocess.run(['adb',*args],text=True,capture_output=True)


def process_pid(timeout=45):
    deadline=time.time()+timeout
    while time.time()<deadline:
        result=adb_run('shell','pidof',PACKAGE)
        pid=result.stdout.strip()
        if result.returncode==0 and pid:
            return pid.split()[0]
        time.sleep(1)
    raise AssertionError(f'{PACKAGE} process did not appear within {timeout}s')


def wait_stopped(timeout=20):
    deadline=time.time()+timeout
    while time.time()<deadline:
        result=adb_run('shell','pidof',PACKAGE)
        if result.returncode!=0 or not result.stdout.strip():
            return
        time.sleep(.5)
    raise AssertionError(f'{PACKAGE} did not stop within {timeout}s')


def start_app(timeout=60):
    """Launch until Android has actually created Miaad's new process.

    Android 16 can briefly report the launch as delivered to the still-closing
    top Activity immediately after force-stop, without creating a new process.
    Retrying the explicit launch after that task transition is both closer to a
    real user relaunch and stricter than accepting a stale Activity result.
    """
    deadline=time.time()+timeout
    last_output=''
    attempts=0
    while time.time()<deadline:
        attempts+=1
        result=adb_run('shell','am','start','-W','-n',ACTIVITY)
        last_output=((result.stdout or '')+'\n'+(result.stderr or '')).strip()
        if result.returncode==0:
            # Give each launch attempt a short window to materialize a process.
            # If API 36 merely delivered to a stale closing task, retry launch
            # instead of waiting out the whole timeout on an impossible pid.
            try:
                remaining=max(1,int(deadline-time.time()))
                return process_pid(min(6,remaining))
            except AssertionError:
                pass
        time.sleep(1)
    raise AssertionError(
        f'{PACKAGE} process did not start after {attempts} launch attempts; '
        f'last am start output: {last_output}'
    )


def connect(timeout=60):
    deadline=time.time()+timeout
    last_error=None
    while time.time()<deadline:
        try:
            pid=process_pid(min(10,max(1,int(deadline-time.time()))))
            adb('forward','tcp:9222','localabstract:webview_devtools_remote_'+pid)
            tabs=json.load(urllib.request.urlopen('http://127.0.0.1:9222/json',timeout=2))
            pages=[t for t in tabs if t.get('type')=='page']
            if not pages:
                raise RuntimeError('No WebView page target yet')
            # Prefer the real local application page if DevTools reports more
            # than one transient target during startup.
            page=next((t for t in pages if 'android_asset' in (t.get('url') or '')),pages[0])
            # API 36 can take materially longer than API 31 to execute the full
            # installed-APK acceptance expression. A 5-second recv timeout was
            # causing a false CI failure even though the app had launched and
            # rendered correctly. Keep a bounded but realistic DevTools timeout.
            return websocket.create_connection(page['webSocketDebuggerUrl'],suppress_origin=True,timeout=60)
        except Exception as exc:
            last_error=exc
            time.sleep(1)
    raise AssertionError(f'WebView debugging connection unavailable: {last_error}')


seq=0
def evaluate(ws,expression):
    global seq
    seq+=1
    ws.send(json.dumps({'id':seq,'method':'Runtime.evaluate','params':{'expression':expression,'returnByValue':True,'awaitPromise':True}}))
    while True:
        msg=json.loads(ws.recv())
        if msg.get('id')!=seq:
            continue
        result=msg['result']
        assert 'exceptionDetails' not in result,result
        return result['result'].get('value')


def wait_runtime_ready(ws,timeout=60):
    """Wait for Miaad's own JS domain, not merely a visible WebView page."""
    deadline=time.time()+timeout
    last=None
    while time.time()<deadline:
        try:
            ready=evaluate(ws,"typeof domain!=='undefined' && typeof renderAll==='function' && typeof AndroidBridge!=='undefined' && document.readyState==='complete'")
            if ready:
                return
            last='runtime not ready'
        except Exception as exc:
            last=exc
        time.sleep(1)
    raise AssertionError(f'Miaad JavaScript runtime did not become ready: {last}')


ws=connect()
wait_runtime_ready(ws)
result=evaluate(ws,"""(()=>{
 const assert=(value,label)=>{if(!value)throw Error(label)};
 const today=dateKey(new Date()),past=domain.plus(today,-1);
 const s=domain.saveStudent({name:'CI acceptance student',startDate:domain.plus(today,-20),timeZone:'America/Los_Angeles',custom:true,settings:{...domain.copy(domain.data.settings),target:12}});
 const c=domain.cycle(s.id),r=[];
 for(let i=0;i<12;i++)r.push(domain.record({studentId:s.id,date:past,time:'08:'+String(i).padStart(2,'0'),duration:30,status:'entered',note:'Native acceptance record'}));
 r[0]=domain.record({...r[0],note:'تحسن واضح',noteAr:'تحسن واضح',noteEn:'Clear improvement'});
 assert(domain.cycleStats(c).counted===12,'12/12');domain.notifications();domain.notifications();
 assert(Object.values(domain.data.notifications).filter(n=>n.type==='cycle'&&n.studentId===s.id).length===1,'deduplicated cycle');
 domain.record({...r[11],status:'student_cancelled'});assert(domain.cycleStats(c).counted===11,'reverse count');
 const p=domain.period(s.id);domain.archive(p);const old=JSON.stringify(domain.report(p));domain.nextPeriod(p);assert(JSON.stringify(domain.report(p))===old,'archive');
 reportSelection={studentId:s.id,periodId:p.id,language:'ar'};const before=JSON.stringify(domain.data.records),totals=JSON.stringify(reportData().stats);renderReport();assert(document.querySelector('.professional-report').dir==='rtl','Arabic direction');reportSelection.language='en';renderReport();assert(document.querySelector('.professional-report').dir==='ltr','English direction');assert(JSON.stringify(reportData().stats)===totals&&JSON.stringify(domain.data.records)===before,'language invariant');
 const englishMarkup=reportMarkup({...reportData(),rows:[r[0]],studentName:s.name,studentTimeZone:s.timeZone},'en');
 assert(englishMarkup.includes('Clear improvement')&&!englishMarkup.includes('تحسن واضح'),'localized English note');
 assert(miaadStudentTimeLabel(r[0],'en').length>0,'student time zone display');
 const missingRow={...r[0],noteEn:''};assert(miaadReportMissingTranslations({rows:[missingRow],note:'',periodId:''},'en').length===1,'mixed-language export guard');
 domainCommit();assert(JSON.parse(AndroidBridge.loadSnapshot()).domain.records[r[0].id].status==='entered','native persistence');
 assert(!buildNativeReminders().some(n=>n.id.includes('moh-sw')),'no invented time alarm');
 return {studentId:s.id,recordId:r[0].id,cycle:true,reversal:true,deduplication:true,archive:true,languageInvariant:true,localizedEnglish:true,studentTimeZone:true,mixedLanguageGuard:true,nativePersistence:true,alarms:buildNativeReminders().length};
})()""")
result['apiLevel']=API_LEVEL
Path(f'audit/native-acceptance-{SUFFIX}.json').write_text(json.dumps(result,indent=2))
ws.close()

# Test a genuine process restart. Wait for process, WebView and the Miaad JS
# runtime independently; fixed sleeps are unreliable across Android releases.
adb('shell','am','force-stop',PACKAGE)
wait_stopped()
start_app()
ws=connect(60)
wait_runtime_ready(ws,60)
assert evaluate(ws,f"domain.data.records[{json.dumps(result['recordId'])}].status")=='entered'
assert evaluate(ws,f"domain.cycleStats(domain.cycle({json.dumps(result['studentId'])})).counted")==11
assert evaluate(ws,f"domain.data.students[{json.dumps(result['studentId'])}].timeZone")=='America/Los_Angeles'
evaluate(ws,f"selectedStudent={json.dumps(result['studentId'])};switchView('students');renderStudents();true")
time.sleep(1)
with open(f'audit/miaad-student-{SUFFIX}.png','wb') as f:
    subprocess.run(['adb','exec-out','screencap','-p'],stdout=f,check=True)
alarms=adb('shell','dumpsys','alarm')
Path(f'audit/alarms-{SUFFIX}.txt').write_text(alarms)
assert PACKAGE in alarms,'Native alarm plan not registered'
result['processRestart']=True
result['nativeAlarmRegistration']=True
Path(f'audit/native-acceptance-{SUFFIX}.json').write_text(json.dumps(result,indent=2))
ws.close()
print(f'Native installed-APK acceptance on API {API_LEVEL}: PASS')
