"""Exercise the installed APK's real WebView, native snapshot and alarm bridge.
Test records exist only in the isolated offline CI emulator, never in the APK."""
import json, subprocess, time, urllib.request
import websocket
from pathlib import Path

def adb(*args): return subprocess.check_output(['adb',*args],text=True).strip()
def connect():
    pid=adb('shell','pidof','com.miaad.app')
    adb('forward','tcp:9222','localabstract:webview_devtools_remote_'+pid)
    for _ in range(30):
        try:
            tabs=json.load(urllib.request.urlopen('http://127.0.0.1:9222/json'))
            return websocket.create_connection(next(t['webSocketDebuggerUrl'] for t in tabs if t.get('type')=='page'),suppress_origin=True)
        except Exception: time.sleep(1)
    raise AssertionError('WebView debugging connection unavailable')
seq=0
def evaluate(ws,expression):
    global seq
    seq+=1
    ws.send(json.dumps({'id':seq,'method':'Runtime.evaluate','params':{'expression':expression,'returnByValue':True,'awaitPromise':True}}))
    while True:
        msg=json.loads(ws.recv())
        if msg.get('id')!=seq: continue
        result=msg['result']
        assert 'exceptionDetails' not in result,result
        return result['result'].get('value')

ws=connect()
result=evaluate(ws,"""(()=>{
 const assert=(value,label)=>{if(!value)throw Error(label)};
 const today=dateKey(new Date()),past=domain.plus(today,-1);
 const s=domain.saveStudent({name:'CI acceptance student',startDate:domain.plus(today,-20),custom:true,settings:{...domain.copy(domain.data.settings),target:12}});
 const c=domain.cycle(s.id),r=[];
 for(let i=0;i<12;i++)r.push(domain.record({studentId:s.id,date:past,time:'08:'+String(i).padStart(2,'0'),duration:30,status:'entered',note:'Native acceptance record'}));
 assert(domain.cycleStats(c).counted===12,'12/12');domain.notifications();domain.notifications();
 assert(Object.values(domain.data.notifications).filter(n=>n.type==='cycle'&&n.studentId===s.id).length===1,'deduplicated cycle');
 domain.record({...r[11],status:'student_cancelled'});assert(domain.cycleStats(c).counted===11,'reverse count');
 const p=domain.period(s.id);domain.archive(p);const old=JSON.stringify(domain.report(p));domain.nextPeriod(p);assert(JSON.stringify(domain.report(p))===old,'archive');
 reportSelection={studentId:s.id,periodId:p.id,language:'ar'};const before=JSON.stringify(domain.data.records),totals=JSON.stringify(reportData().stats);renderReport();assert(document.querySelector('.professional-report').dir==='rtl','Arabic direction');reportSelection.language='en';renderReport();assert(document.querySelector('.professional-report').dir==='ltr','English direction');assert(JSON.stringify(reportData().stats)===totals&&JSON.stringify(domain.data.records)===before,'language invariant');
 domainCommit();assert(JSON.parse(AndroidBridge.loadSnapshot()).domain.records[r[0].id].status==='entered','native persistence');
 assert(!buildNativeReminders().some(n=>n.id.includes('moh-sw')),'no invented time alarm');
 return {studentId:s.id,recordId:r[0].id,cycle:true,reversal:true,deduplication:true,archive:true,languageInvariant:true,nativePersistence:true,alarms:buildNativeReminders().length};
})()""")
Path('audit/native-acceptance.json').write_text(json.dumps(result,indent=2))
ws.close()
adb('shell','am','force-stop','com.miaad.app')
adb('shell','am','start','-W','-n','com.miaad.app/.MainActivity')
time.sleep(3)
ws=connect()
assert evaluate(ws,f"domain.data.records[{json.dumps(result['recordId'])}].status")=='entered'
assert evaluate(ws,f"domain.cycleStats(domain.cycle({json.dumps(result['studentId'])})).counted")==11
evaluate(ws,f"selectedStudent={json.dumps(result['studentId'])};switchView('students');renderStudents();true")
time.sleep(1)
with open('audit/miaad-student-api31.png','wb') as f: subprocess.run(['adb','exec-out','screencap','-p'],stdout=f,check=True)
alarms=adb('shell','dumpsys','alarm')
Path('audit/alarms-api31.txt').write_text(alarms)
assert 'com.miaad.app' in alarms,'Native alarm plan not registered'
result['processRestart']=True
result['nativeAlarmRegistration']=True
Path('audit/native-acceptance.json').write_text(json.dumps(result,indent=2))
ws.close()
print('Native installed-APK acceptance: PASS')
