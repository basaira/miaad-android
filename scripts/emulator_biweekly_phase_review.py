"""Installed-APK regression for Phase 1B biweekly phase preservation."""
import json, os, subprocess, time, urllib.request
from pathlib import Path
import websocket

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
    deadline=time.time()+timeout
    last_output=''
    while time.time()<deadline:
        result=adb_run('shell','am','start','-W','-n',ACTIVITY)
        last_output=((result.stdout or '')+'\n'+(result.stderr or '')).strip()
        if result.returncode==0:
            try:
                return process_pid(min(6,max(1,int(deadline-time.time()))))
            except AssertionError:
                pass
        time.sleep(1)
    raise AssertionError(f'{PACKAGE} did not restart; last output: {last_output}')


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
            page=next((t for t in pages if 'android_asset' in (t.get('url') or '')),pages[0])
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
    deadline=time.time()+timeout
    while time.time()<deadline:
        try:
            if evaluate(ws,"typeof domain!=='undefined' && typeof renderAll==='function' && typeof AndroidBridge!=='undefined' && document.readyState==='complete'"):
                return
        except Exception:
            pass
        time.sleep(1)
    raise AssertionError('Miaad JavaScript runtime did not become ready')


ws=connect()
wait_runtime_ready(ws)
result=evaluate(ws,"""(()=>{
 const assert=(value,label)=>{if(!value)throw Error(label)};
 const today=domain.teacherNow().date;
 assert(today==='2026-09-15','unexpected teacher date '+today);
 const sid='phase-review-runtime';
 if(!domain.data.students[sid])domain.saveStudent({id:sid,name:'Biweekly phase runtime',startDate:'2026-09-01',custom:false,settings:{}});
 domain.data.schedules['runtime-biweekly']=[];
 lessons=lessons.filter(x=>x.id!=='runtime-biweekly');
 const base={id:'runtime-biweekly',studentId:sid,name:domain.data.students[sid].name,day:1,start:'11:00',duration:30,repeat:'biweekly',reminder:20,phase:0};
 domain.saveSchedule(base,today);lessons.push({...base});idrisPhase=0;persist();renderAll();
 document.getElementById('toggleIdrisPhase').click();
 const before=domain.versionAt('runtime-biweekly',today);
 assert(before.phase===1,'phase toggle did not reach 1');
 assert(lessons.find(x=>x.id==='runtime-biweekly').phase===1,'lessons projection missing phase 1');
 assert(!domain.occurrences('2026-09-21').some(r=>r.scheduleId==='runtime-biweekly'),'phase 1 should omit 2026-09-21');
 assert(domain.occurrences('2026-09-28').some(r=>r.scheduleId==='runtime-biweekly'),'phase 1 should include 2026-09-28');
 selectedStudent=sid;switchView('students');renderStudents();
 const row=document.querySelector('[data-schedule="runtime-biweekly"]');assert(row,'runtime schedule row missing');row.click();
 const duration=document.getElementById('fDuration');duration.value='45';duration.dispatchEvent(new Event('input',{bubbles:true}));
 document.getElementById('saveLesson').click();
 const after=domain.versionAt('runtime-biweekly',today);
 assert(after.phase===1,'duration edit lost phase 1');
 assert(after.duration===45,'duration edit did not save');
 assert(lessons.find(x=>x.id==='runtime-biweekly').phase===1,'projection lost phase after edit');
 assert(!domain.occurrences('2026-09-21').some(r=>r.scheduleId==='runtime-biweekly'),'2026-09-21 flipped after edit');
 assert(domain.occurrences('2026-09-28').some(r=>r.scheduleId==='runtime-biweekly'),'2026-09-28 flipped after edit');
 return {today,phase:after.phase,duration:after.duration,beforeDates:[false,true],afterDates:[false,true],versions:domain.data.schedules['runtime-biweekly'].length};
})()""")
ws.close()

adb('shell','am','force-stop',PACKAGE)
wait_stopped()
start_app()
ws=connect(60)
wait_runtime_ready(ws,60)
after_restart=evaluate(ws,"""(()=>({
 phase:domain.versionAt('runtime-biweekly',domain.teacherNow().date).phase,
 mirror:lessons.find(x=>x.id==='runtime-biweekly')?.phase,
 duration:domain.versionAt('runtime-biweekly',domain.teacherNow().date).duration,
 first:domain.occurrences('2026-09-21').some(r=>r.scheduleId==='runtime-biweekly'),
 second:domain.occurrences('2026-09-28').some(r=>r.scheduleId==='runtime-biweekly')
}))()""")
ws.close()
assert after_restart=={'phase':1,'mirror':1,'duration':45,'first':False,'second':True},after_restart

logcat=adb('logcat','-d')
assert 'FATAL EXCEPTION' not in logcat,'fatal runtime exception after biweekly review test'
assert 'E MiaadWeb' not in logcat,'WebView error after biweekly review test'
result['afterRestart']=after_restart
result['apiLevel']=API_LEVEL
result['result']='PASS'
Path(f'audit/biweekly-phase-review-{SUFFIX}.json').write_text(json.dumps(result,indent=2))
print(f'Biweekly phase installed-APK review fix on API {API_LEVEL}: PASS')
