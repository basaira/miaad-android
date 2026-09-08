"""Capture deterministic installed-APK UI evidence after transitions have settled.
This is test-only: it never mutates production source or persisted user data.
"""
import base64, json, os, subprocess, time, urllib.request
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
def cdp(ws,method,params=None):
    global seq
    seq+=1
    ws.send(json.dumps({'id':seq,'method':method,'params':params or {}}))
    while True:
        msg=json.loads(ws.recv())
        if msg.get('id')!=seq:
            continue
        assert 'error' not in msg,msg
        return msg.get('result',{})


def evaluate(ws,expression):
    result=cdp(ws,'Runtime.evaluate',{'expression':expression,'returnByValue':True,'awaitPromise':True})
    assert 'exceptionDetails' not in result,result
    return result['result'].get('value')


def webview_screenshot(ws,name):
    # Capture directly from the WebView renderer. adb screencap can briefly
    # return an older Surface frame even after the DOM has switched screens.
    data=cdp(ws,'Page.captureScreenshot',{'format':'png','fromSurface':True,'captureBeyondViewport':False}).get('data')
    assert data,f'No DevTools screenshot bytes for {name}'
    Path(f'audit/{name}-{SUFFIX}.png').write_bytes(base64.b64decode(data))


def device_screenshot(name):
    # Keep one system-compositor image for native frame/status-bar evidence,
    # but do not use it to identify which WebView screen is active.
    with open(f'audit/{name}-{SUFFIX}.png','wb') as f:
        subprocess.run(['adb','exec-out','screencap','-p'],stdout=f,check=True)


ws=connect()
cdp(ws,'Page.enable')
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
      document.querySelectorAll('.nav-btn').forEach(n=>n.classList.toggle('active',n.dataset.view===target));
      currentView=target;selectedStudent='';
      if(target==='today'){{selectedDate=startOfDay(new Date());renderTodayAgenda()}}
      if(target==='week'){{selectedDate=startOfDay(new Date());renderWeekView()}}
      if(target==='students')renderStudents('');
      if(target==='report')renderReport();
      if(target==='settings')renderFeatureSettings();
      window.scrollTo(0,0);
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      await new Promise(r=>setTimeout(r,350));
      const active=document.querySelector('.view.active');
      const activeNav=document.querySelector('.nav-btn.active')?.dataset.view||'';
      const ok=currentView===target && active?.id===`view-${{target}}` && activeNav===target && getComputedStyle(active).display!=='none';
      return {{target,currentView,activeId:active?.id||'',activeNav,heading:active?.querySelector('.date-block h1')?.textContent?.trim()||'',ok,scrollWidth:document.documentElement.scrollWidth,innerWidth:window.innerWidth}};
    }})()""")
    assert state['ok'],state
    assert state['scrollWidth']<=state['innerWidth']+3,state
    checks[view]=state
    webview_screenshot(ws,f'miaad-webview-{view}')

# Capture a real persisted student profile after the same stable-state gate.
profile=evaluate(ws,"""(async()=>{
  const s=Object.values(domain.data.students).find(x=>x.name.startsWith('CI acceptance student')) || Object.values(domain.data.students)[0];
  if(!s)return {ok:false,reason:'no student'};
  document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id==='view-students'));
  document.querySelectorAll('.nav-btn').forEach(n=>n.classList.toggle('active',n.dataset.view==='students'));
  currentView='students';selectedStudent=s.id;renderStudents();window.scrollTo(0,0);
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  await new Promise(r=>setTimeout(r,350));
  const activeNav=document.querySelector('.nav-btn.active')?.dataset.view||'';
  return {ok:currentView==='students'&&activeNav==='students'&&!!document.querySelector('#view-students.view.active .profile-heading'),studentId:s.id,activeNav,heading:document.querySelector('#view-students .profile-heading h2')?.textContent?.trim()||''};
})()""")
assert profile['ok'],profile
webview_screenshot(ws,'miaad-webview-student-profile')
checks['student-profile']=profile

# One device-level image proves the native WebView is on screen with Android
# system bars. Screen-specific visual review uses the renderer captures above.
device_screenshot('miaad-device-final')
Path(f'audit/ui-capture-{SUFFIX}.json').write_text(json.dumps(checks,indent=2,ensure_ascii=False))
ws.close()
print(f'Stable installed-APK WebView capture on API {API_LEVEL}: PASS')
