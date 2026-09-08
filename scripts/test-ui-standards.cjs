const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const axePath=require.resolve('axe-core/axe.min.js');

const root=path.join(__dirname,'../app/src/main/assets/index.html').replaceAll('\\','/');
const out=path.join(__dirname,'../audit/standards');fs.mkdirSync(out,{recursive:true});
const viewports=[
  ['compact-320',320,568],['small-360',360,800],['phone-390',390,844],
  ['phone-412',412,915],['tablet-768',768,1024],['wide-1024',1024,800]
];
const views=['today','week','students','report','settings'];

function compactAxe(result){return result.violations.map(v=>({id:v.id,impact:v.impact,help:v.help,nodes:v.nodes.slice(0,6).map(n=>({target:n.target,html:n.html,failureSummary:n.failureSummary}))}));}

(async()=>{
 const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
 const report={standardBasis:{wcag:'WCAG 2.2 Level AA',android:'Android Core App Quality / 48dp touch targets'},viewports:{}};
 const failures=[];
 for(const [name,width,height] of viewports){
  const context=await browser.newContext({viewport:{width,height},locale:'ar-EG',reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto('file:///'+root,{waitUntil:'load'});await page.evaluate(()=>document.fonts.ready);
  await page.addScriptTag({path:axePath});
  await page.evaluate(()=>{
    const long='عبد الرحمن بن محمد المصطفى — طالب ذو اسم طويل جدًا لاختبار التفاف النص العربي';
    const existing=Object.values(domain.data.students).find(s=>s.name===long);
    const s=existing||domain.saveStudent({name:long,startDate:'2026-09-01',timeZone:'America/Los_Angeles',custom:false,settings:{}});
    for(let i=1;i<=7;i++){
      const id='qa-'+i;if(domain.data.records[id])continue;
      domain.record({id,studentId:s.id,name:s.name,date:`2026-09-0${i}`,time:`${String(8+i).padStart(2,'0')}:00`,duration:i%2?30:60,status:i<6?'entered':(i===6?'absent':'student_cancelled'),note:i===1?'ملاحظة عربية طويلة لاختبار القراءة والمحاذاة داخل التقرير والبطاقات.':''});
    }
    renderAll();
  });
  report.viewports[name]={width,height,views:{}};
  for(const view of views){
    await page.locator(`[data-view="${view}"]`).click();await page.waitForTimeout(120);
    if(view==='week')await page.locator('#miaadMonthCalendar').waitFor();
    if(view==='report')await page.locator('.professional-report').waitFor();
    const state=await page.evaluate(v=>{
      const active=document.querySelector('.view.active'),nav=document.querySelector(`.nav-btn[data-view="${v}"]`);
      return {active:active?.id||'',navActive:!!nav?.classList.contains('active'),scrollWidth:document.documentElement.scrollWidth,innerWidth:innerWidth,lang:document.documentElement.lang,dir:document.documentElement.dir};
    },view);
    assert.equal(state.active,`view-${view}`);assert.equal(state.navActive,true);assert.equal(state.lang,'ar');assert.equal(state.dir,'rtl');
    if(state.scrollWidth>state.innerWidth+2)failures.push(`${name}/${view}: horizontal overflow ${state.scrollWidth}>${state.innerWidth}`);

    const axe=await page.evaluate(async()=>await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']},resultTypes:['violations']}));
    const axeViolations=compactAxe(axe);if(axeViolations.length)failures.push(`${name}/${view}: axe ${axeViolations.map(v=>v.id).join(', ')}`);

    const targets=await page.evaluate(()=>{
      const visible=e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&+s.opacity!==0&&r.width>0&&r.height>0};
      const selector='button:not([disabled]),input:not([type="hidden"]):not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[role="button"],[tabindex]:not([tabindex="-1"]),a[href]';
      return [...document.querySelectorAll(selector)].filter(visible).map((e,i)=>{
        let r=e.getBoundingClientRect(),proxy='';
        if((e.matches('input[type="checkbox"],input[type="radio"]'))&&e.closest('label')){const lr=e.closest('label').getBoundingClientRect();if(lr.width>=48&&lr.height>=48){r=lr;proxy='label'}}
        return {i,tag:e.tagName,id:e.id||'',className:String(e.className||'').slice(0,100),text:(e.getAttribute('aria-label')||e.textContent||e.getAttribute('placeholder')||'').trim().slice(0,80),width:+r.width.toFixed(1),height:+r.height.toFixed(1),proxy};
      });
    });
    const undersized=targets.filter(t=>t.width<48||t.height<48);if(undersized.length)failures.push(`${name}/${view}: ${undersized.length} touch target(s) below Android 48dp`);

    // Stronger-than-WCAG overlap check: after scrolling to the end, ordinary content
    // must remain above the fixed bottom nav rather than being hidden underneath it.
    const bottomSafety=await page.evaluate(()=>{
      window.scrollTo(0,document.documentElement.scrollHeight);const nav=document.querySelector('.bottom-nav')?.getBoundingClientRect();const active=document.querySelector('.view.active');
      const nodes=[...active.querySelectorAll('button,input,select,textarea,summary,.student-summary,.session-row,.setting-block,.professional-report')].filter(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width&&r.height});
      const last=nodes.at(-1)?.getBoundingClientRect();return {navTop:nav?.top??innerHeight,lastBottom:last?.bottom??0,viewport:innerHeight,safe:!last||!nav||last.bottom<=nav.top+1||document.documentElement.scrollHeight>innerHeight};
    });
    if(!bottomSafety.safe)failures.push(`${name}/${view}: bottom navigation obscures final content`);
    await page.evaluate(()=>window.scrollTo(0,0));

    report.viewports[name].views[view]={state,axe:axeViolations,touchTargets:{count:targets.length,undersized},bottomSafety};
  }
  report.viewports[name].pageErrors=errors;if(errors.length)failures.push(`${name}: page errors ${errors.join(' | ')}`);
  await page.screenshot({path:path.join(out,`${name}-final.png`),fullPage:true});await context.close();
 }
 fs.writeFileSync(path.join(out,'ui-standards.json'),JSON.stringify(report,null,2));
 await browser.close();
 if(failures.length){console.error('UI STANDARDS FAIL\n'+failures.join('\n'));process.exit(1)}
 console.log('UI STANDARDS PASS: WCAG 2.2 AA axe rules, Android 48dp targets, RTL, responsive overflow and fixed-nav safety across six viewport classes.');
})().catch(e=>{console.error(e);process.exit(1)});
