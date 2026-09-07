(()=>{
  const logo='file:///android_asset/brand/miaad-logo.webp';
  document.documentElement.classList.add('chronometric-luxury');
  const theme=document.querySelector('meta[name="theme-color"]');
  if(theme)theme.setAttribute('content','#081f18');

  const mark=document.querySelector('.mark');
  if(mark){
    mark.textContent='';
    const img=document.createElement('img');
    img.src=logo;
    img.alt='مِيعاد';
    img.decoding='async';
    mark.appendChild(img);
  }

  const settings=document.querySelector('#view-settings .settings-stack');
  if(settings&&!document.getElementById('miaadBrandSignature')){
    const block=document.createElement('section');
    block.id='miaadBrandSignature';
    block.className='miaad-brand-signature';
    block.innerHTML=`<img src="${logo}" alt="شعار مِيعاد"><div><b>مِيعاد</b><span>MIAAD · Chronometric Luxury</span><small>لكل موعد قيمة</small></div>`;
    settings.prepend(block);
  }

  // Keep the branded surface responsive to native theme insets without layout jumps.
  const syncInsets=()=>document.documentElement.style.setProperty('--luxury-vh',`${window.innerHeight}px`);
  syncInsets();
  window.addEventListener('resize',syncInsets,{passive:true});

  // Premium press feedback only for primary operational surfaces.
  const pressSelectors='.focus-panel,.session-row,.student-card,.week-day,.setting-block,.free-window-card,.slot-option';
  document.addEventListener('pointerdown',e=>{
    const t=e.target.closest(pressSelectors);if(t)t.classList.add('luxury-press');
  },{passive:true});
  const clearPress=e=>{const t=e.target.closest?.(pressSelectors);if(t)t.classList.remove('luxury-press')};
  document.addEventListener('pointerup',clearPress,{passive:true});
  document.addEventListener('pointercancel',clearPress,{passive:true});

  document.body.classList.add('luxury-ready');
})();
