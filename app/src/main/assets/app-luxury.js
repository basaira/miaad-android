(()=>{
  const logo='brand/miaad-logo.webp';
  document.documentElement.classList.add('chronometric-luxury');
  const theme=document.querySelector('meta[name="theme-color"]');
  if(theme)theme.setAttribute('content','#081f18');

  const settings=document.querySelector('#view-settings .settings-stack');
  if(settings&&!document.getElementById('miaadBrandSignature')){
    const block=document.createElement('section');
    block.id='miaadBrandSignature';
    block.className='miaad-brand-signature';
    block.innerHTML=`<img src="${logo}" width="56" height="56" alt="شعار مِيعاد"><div><b>مِيعاد</b><span>MIAAD</span><small>لكل موعد قيمة</small></div>`;
    settings.prepend(block);
  }

  // Keep the branded surface responsive to native theme insets without layout jumps.
  const syncInsets=()=>document.documentElement.style.setProperty('--luxury-vh',`${window.innerHeight}px`);
  syncInsets();
  window.addEventListener('resize',syncInsets,{passive:true});

  // Premium press feedback only for primary operational surfaces.
  const pressSelectors='.focus-panel,.session-row,.student-card,.week-day,.setting-block,.free-window-card,.slot-option';
  let pressed=null;
  const clearPress=()=>{pressed?.classList.remove('luxury-press');pressed=null};
  document.addEventListener('pointerdown',e=>{
    clearPress();pressed=e.target.closest(pressSelectors);pressed?.classList.add('luxury-press');
  },{passive:true});
  window.addEventListener('blur',clearPress);
  document.addEventListener('pointerup',clearPress,{passive:true});
  document.addEventListener('pointercancel',clearPress,{passive:true});

  document.body.classList.add('luxury-ready');
})();
