"""Capture deterministic installed-APK UI evidence after transitions have settled.
This is test-only: it never mutates production source or persisted user data.
"""
import json, os, subprocess, time, urllib.request
from pathlib import Path
import websocket

API_LEVEL=os.environ.get('MIAAD_API_LEVEL','31')
SUFFIX=f'api{API_LEVEL}'
PACKAGE='com.miaad.app'


def adb_run(*args):
    return subprocess.run(['adb',*args],text=True,capture_output=True)


def pid(timeout=30):
    deadline=time.time()+timeout
    while time.time()<deadline:
        r=adb_run('shell','pidof',PACKAGE)
        if r.returncode==0 and r.stdout.strip():
            return r.stdout.strip().split()[0]
        time.sleep(.5)
    raise AssertionError('Miaad process unavailable for UI capture')


def connect(timeout=45):
    deadline=time.time()+timeout
    last=None
    while time.time()<deadline:
        try:
            p=pid(5)
            subprocess.check_call(['adb','forward','tcp:9222','localabstract:webview_devtools_remote_'+p],stdout=subprocess.DEVNULL)
            tabs=json.load(urllib.request.urlopen('http://127.0.0.1:9222/json',timeout=2))
            page=next(t for t in tabs if t.get('type')=='page' and 'android_asset' in (t.get('url') or ''))
            return websocket.create_connection(page['webSocketDebuggerUrl'],suppress_origin=True,timeout=30)
        except Exception as exc:
            last=exc;time.sleep(.5)
    raise AssertionError(f'WebView unavailable for stable UI capture: {last}')


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


def screenshot(name):
    with open(f'audit/{name}-{SUFFIX}.png','wb') as f:
        subprocess.run(['adb','exec-out','screencap','-p'],stdout=f,check=True)


ws=connect()
ready=evaluate(ws,"typeof domain!=='undefined' && window.__miaadUiHotfixApplied===true && document.readyState==='complete'")
assert ready,'Miaad UI runtime not ready'

# Disable only capture-time animation so evidence is the settled destination,
# not ViewTransition pseudo-elements from the preceding screen.
evaluate(ws,"""(()=>{
 let s=document.getElementById('ciStableCaptureStyle');
 if(!s){s=document.createElement('style');s.id='ciStableCaptureStyle';s.textContent='*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}::view-transition-group(*),::view-transition-old(*),::view-transition-new(*){animation:none!important}';document.head.appendChild(s)}
 return true;
})()""")

views=('today','week','students','report','settings')
checks={}
for view in views:
    state=evaluate(ws,f"""(async()=>{{
      const target={json.dumps(view)};
      document.documentElement.removeAttribute('data-nav-dir');
      document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id===`view-${{target}}`));
      currentView=target;selectedStudent='';
      if(target==='today'){{selectedDate=startOfDay(new Date());renderTodayAgenda()}}
      if(target==='week'){{selectedDate=startOfDay(new Date());renderWeekView()}}
      if(target==='students')renderStudents('');
      if(target==='report')renderReport();
      if(target==='settings')renderFeatureSettings();
      window.scrollTo(0,0);
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      await new Promise(r=>setTimeout(r,180));
      const active=document.querySelector('.view.active');
      const ok=currentView===target && active?.id===`view-${{target}}` && getComputedStyle(active).display!=='none';
      return {{target,currentView,activeId:active?.id||'',ok,scrollWidth:document.documentElement.scrollWidth,innerWidth:window.innerWidth}};
    }})()""")
    assert state['ok'],state
    assert state['scrollWidth']<=state['innerWidth']+3,state
    checks[view]=state
    screenshot(f'miaad-stable-{view}')

# Capture a real persisted student profile after the same stable-state gate.
profile=evaluate(ws,"""(async()=>{
  const s=Object.values(domain.data.students).find(x=>x.name.startsWith('CI acceptance student')) || Object.values(domain.data.students)[0];
  if(!s)return {ok:false,reason:'no student'};
  document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id==='view-students'));
  currentView='students';selectedStudent=s.id;renderStudents();window.scrollTo(0,0);
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  await new Promise(r=>setTimeout(r,180));
  return {ok:currentView==='students'&&!!document.querySelector('#view-students.view.active .profile-heading'),studentId:s.id};
})()""")
assert profile['ok'],profile
screenshot('miaad-stable-student-profile')
checks['student-profile']=profile
Path(f'audit/ui-capture-{SUFFIX}.json').write_text(json.dumps(checks,indent=2))
ws.close()
print(f'Stable installed-APK UI capture on API {API_LEVEL}: PASS')
