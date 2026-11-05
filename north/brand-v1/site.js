/* Classic script: the complete preview also runs from file:// without fetch. */
(() => {
  'use strict';
  const D = window.NORTH;
  const $ = (s, p = document) => p.querySelector(s);
  const $$ = (s, p = document) => [...p.querySelectorAll(s)];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const price = n => new Intl.NumberFormat('he-IL', {style:'currency',currency:'ILS',maximumFractionDigits:0}).format(n);
  const actions = {
    menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',
    search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    close:'<path d="m6 6 12 12M6 18 18 6"/>',
    bag:'<path d="M5 7h14l2 14H3ZM8 8V6a4 4 0 0 1 8 0v2"/>',
    zoom:'<circle cx="10" cy="10" r="6.5"/><path d="m15 15 6 6M7 10h6m-3-3v6"/>',
    arrow:'<path d="M20 12H4m6-6-6 6 6 6"/>',
    copy:'<rect x="8" y="8" width="12" height="13" rx="1"/><path d="M16 8V3H3v13h5"/>',
    check:'<path d="m5 12 4 4L20 5"/>',
    minus:'<path d="M5 12h14"/>',
    plus:'<path d="M5 12h14M12 5v14"/>'
  };
  const icon = name => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${window.NORTH_ICONS?.[name] || actions[name] || actions.bag}</svg>`;
  const asset = (id, role='product') => `../img/v4/${id}-${role}.webp`;
  const thumb = (id, role='product') => `../img/v4/thumbs/${id}-${role}.webp`;
  let toastTimer;
  function toast(message) {
    let el = $('#toast');
    if (!el) { el = document.createElement('div'); el.id='toast'; el.className='toast'; el.setAttribute('role','status'); document.body.append(el); }
    clearTimeout(toastTimer); el.textContent=message; el.classList.add('show');
    toastTimer=setTimeout(()=>el.classList.remove('show'),3200);
  }
  async function copy(text) {
    let timer;
    if(navigator.clipboard?.writeText){
      try{
        await Promise.race([navigator.clipboard.writeText(text),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Clipboard unavailable')),1000);})]);
        clearTimeout(timer);toast('הועתק ללוח');return;
      }catch{clearTimeout(timer);}
    }
    const previous=document.activeElement,box=document.createElement('textarea');
    box.value=text;box.setAttribute('aria-hidden','true');box.style.cssText='position:fixed;top:0;left:0;width:1px;height:1px;opacity:0';document.body.append(box);
    let ok=false;try{box.select();ok=document.execCommand('copy');}catch{}finally{box.remove();previous?.focus({preventScroll:true});}
    if(ok)toast('הועתק ללוח');else showText(text);
  }
  function showText(text) {
    let dialog=$('#copy-fallback');
    if(!dialog){dialog=document.createElement('dialog');dialog.id='copy-fallback';dialog.setAttribute('aria-labelledby','copy-fallback-title');dialog.innerHTML='<div class="dialog-head"><h2 id="copy-fallback-title">הטקסט להעתקה</h2><button class="icon-btn" data-close aria-label="סגירה">'+icon('close')+'</button></div><div class="cart-body"><p class="muted">אפשר לסמן ולהעתיק את הטקסט.</p><textarea class="field" aria-label="טקסט להעתקה ידנית" readonly rows="8"></textarea></div>';document.body.append(dialog);}
    $('textarea',dialog).value=text;dialog.showModal();$('textarea',dialog).select();
  }
  document.addEventListener('click',e=>{const b=e.target.closest('[data-close]');if(b)b.closest('dialog')?.close();});
  document.addEventListener('click',e=>{if(e.target.tagName==='DIALOG'){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
  window.NorthUI={$, $$, esc, price, icon, asset, thumb, toast, copy};
  const page=document.body.dataset.page;
  if(!['home','product','builder'].includes(page))return;
  const cart=[];
  function header() {
    $('#site-header').innerHTML=`<header class="site-header"><div class="preview-bar"><div class="wrap"><span>תצוגת עיצוב · מחירי הצעה</span><a href="index.html">לקיט המותג</a></div></div><div class="wrap header-inner"><a class="brand" href="home.html" ><img src="assets/north-star.svg" width="44" height="44" alt=""><span><strong>הרוח הצפונית</strong><small>מארזים · אלכוהול · פינוק</small></span></a><nav class="desktop-nav" aria-label="ניווט ראשי"><a href="home.html#catalog" ${page==='home'?'aria-current="page"':''}>המארזים</a><a href="home.html#occasions">לכל אירוע</a><a href="builder.html" ${page==='builder'?'aria-current="page"':''}>הרכבה אישית</a></nav><div class="header-actions"><a class="icon-btn" href="home.html#search" aria-label="חיפוש מארז">${icon('search')}</a><button class="icon-btn" data-cart aria-label="הבחירות שלי">${icon('bag')}<span class="cart-count" id="cart-count" hidden>0</span></button><button class="icon-btn menu-toggle" data-menu aria-expanded="false" aria-controls="mobile-menu" aria-label="פתיחת תפריט">${icon('menu')}</button></div></div><nav class="mobile-menu" id="mobile-menu" aria-label="ניווט בנייד" hidden><a href="home.html#catalog">כל המארזים</a><a href="home.html#occasions">לכל אירוע</a><a href="builder.html">הרכבה אישית</a><a href="index.html">קיט המותג והתהליך</a></nav></header>`;
    $('[data-menu]').addEventListener('click',e=>{const btn=e.currentTarget,open=btn.getAttribute('aria-expanded')!=='true';btn.setAttribute('aria-expanded',String(open));$('#mobile-menu').hidden=!open;btn.setAttribute('aria-label',open?'סגירת תפריט':'פתיחת תפריט');});
    const closeMenu=()=>{$('#mobile-menu').hidden=true;const b=$('[data-menu]');b.setAttribute('aria-expanded','false');b.setAttribute('aria-label','פתיחת תפריט');};
    matchMedia('(min-width:980px)').addEventListener('change',e=>{if(e.matches)closeMenu();});
    $$('#mobile-menu a').forEach(a=>a.addEventListener('click',closeMenu));
    $('[data-cart]').addEventListener('click',openCart);
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#mobile-menu').hidden){closeMenu();$('[data-menu]').focus();}});
    $('#site-footer').innerHTML=`<footer class="site-footer"><div class="wrap"><div class="footer-top"><a class="brand" href="home.html"><img src="assets/north-star.svg" width="38" height="38" alt=""><span><strong>הרוח הצפונית</strong><small>מחשבה קטנה. רגע משותף.</small></span></a><nav class="footer-links" aria-label="קישורי תחתית"><a href="home.html#catalog">המארזים</a><a href="builder.html">מרכיבים לבד</a><a href="index.html#changes">מה משתנה</a></nav></div><p class="footer-note">תצוגת עיצוב עצמאית · התמונות הן הדמיות · מחירי הצעה מהקטלוג, לפני אישור הרכב ומחיר סופי.</p></div></footer>`;
  }
  function productCard(p) {
    return `<article class="product-card"><a class="product-image" href="product.html#${p.id}" tabindex="-1" aria-hidden="true"><img src="${thumb(p.id)}" width="320" height="400" alt="" loading="lazy" decoding="async">${p.kosher===false?'<span class="image-label">ללא הכשר לפי הקטלוג</span>':''}</a><h3><a href="product.html#${p.id}">${esc(p.name)}</a></h3><p class="sub">${esc(p.sub)}</p><div class="card-bottom"><span class="price">${price(p.price)}<small>מחיר הצעה</small></span><a href="product.html#${p.id}" aria-label="למארז ${esc(p.name)}">למארז <span aria-hidden="true">←</span></a></div></article>`;
  }
  let category='all', occasion='', search='';
  function initHome() {
    $('#occasion-list').innerHTML=D.occasions.map(o=>`<button class="occasion" data-occasion="${o.id}" aria-pressed="false">${icon(o.id)}<span>${esc(o.name)}</span></button>`).join('');
    $('#filters').innerHTML=D.categories.map(c=>`<button class="filter" data-category="${c.id}" aria-pressed="${c.id==='all'}">${esc(c.name)}</button>`).join('');
    function filter(){
      const list=D.products.filter(p=>(category==='all'||p.cat===category||(category==='engrave'&&p.personalize))&&(!occasion||p.occ.includes(occasion))&&(!search||(p.name+' '+p.sub+' '+p.contents.join(' ')).includes(search)));
      $('#products').innerHTML=list.length?list.map(productCard).join(''):'<p class="no-results">לא נמצאו מארזים בבחירה הזו. <button class="btn secondary" data-reset>ניקוי סינון</button></p>';
      $('#catalog-count').textContent=`${list.length} מארזים`;
      $$('[data-category]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.category===category)));
      $$('[data-occasion]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.occasion===occasion)));
      $('#filter-status').textContent=occasion?`נבחר אירוע: ${D.occasions.find(o=>o.id===occasion).name}`:'';
    }
    document.addEventListener('click',e=>{
      const c=e.target.closest('[data-category]'),o=e.target.closest('[data-occasion]');
      if(c){category=c.dataset.category;filter();}
      if(o){occasion=occasion===o.dataset.occasion?'':o.dataset.occasion;filter();$('#catalog').scrollIntoView({behavior:'smooth'});}
      if(e.target.closest('[data-reset]')){category='all';occasion='';search='';$('#search').value='';filter();}
    });
    $('#search').addEventListener('input',e=>{search=e.target.value.trim();filter();});
    filter();
  }
  let currentProduct,selectedVariant=0,selectedRole=0,lightboxRole=0;
  const roleCaption = role => ({product:'תכולת המארז בהדמיה. הבקבוקים מוצגים ללא מותג.',mood:'אווירה להמחשה. אביזרי סביבה אינם תוספת לתכולת המארז.',inside:'מבט פנימה על פריטי המארז. התכולה המחייבת מפורטת לצד התמונה.',packaging:'הצעת אריזה להמחשה; חומר, מידה וגימור דורשים אישור מול החנות.',use:'הצעת הגשה להמחשה. קרח, משטחי הגשה ואביזרי סביבה אינם כלולים אלא אם פורטו.',scale:'קנה מידה חזותי בלבד. מידות האריזה טרם נמדדו; זו אינה תמונת מדידה.'}[role]);
  const variantPhotoNote=()=>currentProduct?.variants?.length?' הצילומים מציגים את מארז הבסיס; הרכב הגרסה דורש אישור.':'';
  function updateVariantContext(){
    const p=currentProduct,el=$('#contents-context');el.hidden=!p.variants?.length;
    if(p.variants?.length){const v=p.variants[selectedVariant];el.textContent=(selectedVariant?`נבחרה הגרסה ״${v.name}״. `:'')+'התכולה והצילומים מציגים את מארז הבסיס. הרכב הגרסה הנבחרת דורש אישור.';}
    $('#gallery-caption').textContent=roleCaption(D.roles[selectedRole].id)+variantPhotoNote();
  }
  function initProduct() {
    const id=location.hash.slice(1);
    currentProduct=D.products.find(p=>p.id===id)||D.products[0];
    const p=currentProduct;selectedVariant=0;selectedRole=0;
    document.title=p.name+' · הרוח הצפונית · תצוגת עיצוב';
    $('#product-name').textContent=p.name;$('#product-sub').textContent=p.sub;$('#breadcrumb-product').textContent=p.name;
    $('#product-price').textContent=price(p.price);$('#sticky-price').textContent=price(p.price);
    $('#product-contents').innerHTML=p.contents.map(c=>`<li>${esc(c)}</li>`).join('');
    const options=p.variants?.length?`<fieldset><legend>בחירת המארז</legend><div class="variant-list">${p.variants.map((v,i)=>`<button class="variant" data-variant="${i}" aria-pressed="${i===0}">${esc(v.name)} · ${price(v.price)}</button>`).join('')}</div></fieldset>`:'';
    $('#product-options').innerHTML=options+(p.personalize?`<label>טקסט לחריטה <span class="muted">(עד ${p.personalize.max} תווים)</span><input class="field" id="engraving" maxlength="${p.personalize.max}" placeholder="הטקסט שלכם" autocomplete="off"></label>`:'');
    $('#kosher-note').hidden=p.kosher!==false;$('#kosher-note').textContent=p.kosher===false?`${p.kosherNote}. הסימון נשען על הקטלוג הקיים ודורש אימות לפני הזמנה.`:'';
    $('#gallery-thumbs').innerHTML=D.roles.map((r,i)=>`<button class="gallery-thumb" data-role="${i}" aria-pressed="${i===0}" aria-label="תמונת ${r.name} של ${esc(p.name)}"><img src="${thumb(p.id,r.id)}" width="80" height="100" alt="" loading="lazy"><span>${r.name}</span></button>`).join('');
    const related=D.products.filter(x=>x.id!==p.id).sort((a,b)=>(b.cat===p.cat)-(a.cat===p.cat)||Math.abs(a.price-p.price)-Math.abs(b.price-p.price)).slice(0,4);
    $('#related-products').innerHTML=related.map(productCard).join('');setRole(0);updateVariantContext();
  }
  function setRole(i){selectedRole=i;const r=D.roles[i],p=currentProduct;$('#product-photo').src=asset(p.id,r.id);$('#product-photo').alt=`${p.name} — ${r.name}, הדמיית צילום`;$('#gallery-role').textContent=r.name;$('#gallery-caption').textContent=roleCaption(r.id)+variantPhotoNote();$$('[data-role]').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.role===i)));}
  function ensureLightbox(){let el=$('#image-lightbox');if(el)return el;el=document.createElement('dialog');el.className='lightbox';el.id='image-lightbox';el.innerHTML=`<div class="dialog-head"><h2 id="lightbox-title">תצוגה מוגדלת</h2><button class="icon-btn" data-close aria-label="סגירה">${icon('close')}</button></div><div class="lightbox-body"><img id="lightbox-image" alt=""><p id="lightbox-caption"></p></div><div class="lightbox-controls"><button class="btn secondary" data-lightbox-prev>הקודמת</button><button class="btn secondary" data-lightbox-native aria-pressed="false" aria-label="גודל טבעי של התמונה">גודל טבעי</button><button class="btn secondary" data-lightbox-next>הבאה</button></div>`;el.setAttribute('aria-labelledby','lightbox-title');document.body.append(el);el.addEventListener('keydown',e=>{if(e.key==='ArrowRight'){e.preventDefault();lightboxRole=(lightboxRole+5)%6;updateLightbox();}if(e.key==='ArrowLeft'){e.preventDefault();lightboxRole=(lightboxRole+1)%6;updateLightbox();}});return el;}
  function updateLightbox(){const r=D.roles[lightboxRole];$('#lightbox-title').textContent=currentProduct.name+' · '+r.name;$('#lightbox-image').src=asset(currentProduct.id,r.id);$('#lightbox-image').alt=currentProduct.name+' — '+r.name;$('#lightbox-caption').textContent=roleCaption(r.id)+variantPhotoNote();$('.lightbox-body').classList.remove('native');$('[data-lightbox-native]').setAttribute('aria-pressed','false');}
  function addProduct(){const p=currentProduct,v=p.variants?.[selectedVariant],engraving=$('#engraving')?.value.trim()||'';cart.push({name:p.name+(v?' · '+v.name:''),price:v?.price||p.price,img:thumb(p.id),note:[v&&selectedVariant>0?'הרכב הגרסה לאישור; התכולה והצילום מציגים את מארז הבסיס.':'',engraving?'חריטה: '+engraving:''].filter(Boolean).join(' ')});updateCart();toast('המארז נוסף לבחירות שלך');}
  function updateCart(){const el=$('#cart-count');el.hidden=!cart.length;el.textContent=cart.length;$('[data-cart]').setAttribute('aria-label',`הבחירות שלי, ${cart.length} מארזים`);}
  function openCart(){let el=$('#cart-dialog');if(!el){el=document.createElement('dialog');el.id='cart-dialog';el.setAttribute('aria-labelledby','cart-title');document.body.append(el);}el.innerHTML=`<div class="dialog-head"><h2 id="cart-title">הבחירות שלך</h2><button class="icon-btn" data-close aria-label="סגירה">${icon('close')}</button></div><div class="cart-body">${cart.length?`<div class="cart-items">${cart.map((p,i)=>`<div class="cart-item">${p.img?`<img src="${p.img}" alt="" width="64" height="80">`:icon('gift')}<div><h3>${esc(p.name)}</h3><p>${price(p.price)}</p>${p.note?`<p>${esc(p.note)}</p>`:''}</div><button class="icon-btn" data-remove="${i}" aria-label="הסרת ${esc(p.name)}">${icon('close')}</button></div>`).join('')}</div><div class="cart-total"><span>סכום הצעה</span><span class="price">${price(cart.reduce((s,p)=>s+p.price,0))}</span></div><button class="btn primary" data-copy-cart>${icon('copy')}העתקת הסיכום</button>`:'<p class="muted">המארזים שתבחרו יופיעו כאן.</p><a class="btn primary" href="home.html#catalog">לכל המארזים</a>'}<p class="summary-disclaimer">זו תצוגת עיצוב. לא נשלחת הזמנה, ולא מתבצע חיוב.</p></div>`;if(!el.open)el.showModal();}
  let step=0,base=null,addons=[],pack=null;
  const selectedItems=()=>[base,...addons,pack].filter(Boolean);
  function renderBuilder(focusSelector){
    const B=D.build;
    $('#stepper').innerHTML=['בסיס','תוספות','אריזה וברכה'].map((x,i)=>`<li class="${i===step?'active':''}" ${i===step?'aria-current="step"':''}><span>${i<step?'✓':i+1}</span>${x}</li>`).join('');
    $$('[data-step-panel]').forEach((p,i)=>p.hidden=i!==step);
    $('#base-options').innerHTML=B.bases.map((b,i)=>`<button role="radio" aria-checked="${base?.id===b.id}" tabindex="${base?.id===b.id||(!base&&i===0)?0:-1}" class="base-choice" data-base="${b.id}">${icon('bottle')}<span><strong>${esc(b.name)}</strong><br><small>${price(b.price)}</small></span></button>`).join('');
    $('#addon-options').innerHTML=B.addons.map(a=>`<button role="checkbox" aria-checked="${addons.some(x=>x.id===a.id)}" class="addon-choice" data-addon="${a.id}" aria-describedby="selection-count"><img src="${a.img}" width="240" height="300" alt="" loading="lazy"><strong>${esc(a.name)}</strong><small>${price(a.price)}</small>${a.kosher===false?'<span class="non-kosher">ללא הכשר לפי הקטלוג</span>':''}</button>`).join('');
    $('#selection-count').textContent=`נבחרו ${addons.length} מתוך ${B.maxAddons} תוספות לכל היותר`;
    $('#pack-options').innerHTML=B.packs.map((p,i)=>`<button role="radio" aria-checked="${pack?.id===p.id}" tabindex="${pack?.id===p.id||(!pack&&i===0)?0:-1}" class="pack-choice" data-pack="${p.id}"><img src="${p.img}" width="90" height="112" alt=""><span><strong>${esc(p.name)}</strong><small>${p.price?price(p.price):'ללא תוספת מחיר'}</small></span></button>`).join('');
    $('#builder-back').hidden=step===0;$('#builder-next').hidden=step===2;$('#builder-next').disabled=step===0&&!base;$('#builder-next').textContent=step===0?'ממשיכים לתוספות ←':'ממשיכים לאריזה ←';
    $('#builder-finish').hidden=step!==2;$('#builder-finish').disabled=!base||!pack;
    $('#summary-visual').innerHTML=base?`${icon('bottle')}${addons.map(a=>`<img src="${a.img}" width="58" height="76" alt="${esc(a.name)}">`).join('')}${pack?`<img src="${pack.img}" width="58" height="76" alt="${esc(pack.name)}">`:''}`:`${icon('gift')}`;
    $('#summary-count').textContent=`${selectedItems().length} בחירות`;
    $('#summary-lines').innerHTML=base?selectedItems().map(i=>`<li><span>${esc(i.name)}</span><span>${price(i.price)}</span></li>`).join(''):'<li class="empty-line">מתחילים בבחירת בסיס למארז.</li>';
    $('#summary-total').textContent=price(selectedItems().reduce((s,i)=>s+i.price,0));
    if(focusSelector)$(focusSelector)?.focus({preventScroll:true});
  }
  function initBuilder(){
    renderBuilder();
    $('#builder-next').addEventListener('click',()=>{if(step===0&&!base)return;step=Math.min(2,step+1);renderBuilder();focusStep();});
    $('#builder-back').addEventListener('click',()=>{step=Math.max(0,step-1);renderBuilder();focusStep();});
    $('#greeting').addEventListener('input',e=>{const text=e.target.value;$('#greeting-count').textContent=`${text.length} / 180`;$('#greeting-preview-text').textContent=text||'המילים שלכם, כאן.';});
    $('#builder-finish').addEventListener('click',()=>{if(!base||!pack)return;const greeting=$('#greeting').value.trim();cart.push({name:'המארז האישי',price:selectedItems().reduce((s,i)=>s+i.price,0),img:pack.img,note:selectedItems().map(i=>i.name).join(' · ')+(greeting?' · ברכה: '+greeting:'')});updateCart();openCart();});
    $('#base-options').addEventListener('keydown',e=>radioKeys(e,'data-base',BId=>{base=D.build.bases.find(b=>b.id===BId);renderBuilder(`[data-base="${BId}"]`);}));
    $('#pack-options').addEventListener('keydown',e=>radioKeys(e,'data-pack',PId=>{pack=D.build.packs.find(p=>p.id===PId);renderBuilder(`[data-pack="${PId}"]`);}));
  }
  function radioKeys(e,attribute,select){if(!['ArrowRight','ArrowLeft','ArrowUp','ArrowDown','Home','End'].includes(e.key))return;e.preventDefault();const list=$$(`[${attribute}]`,e.currentTarget);let i=list.indexOf(e.target);const delta=['ArrowRight','ArrowUp'].includes(e.key)?-1:1;i=e.key==='Home'?0:e.key==='End'?list.length-1:(i+delta+list.length)%list.length;select(list[i].getAttribute(attribute));}
  function focusStep(){const h=$('[data-step-panel]:not([hidden]) legend');h.tabIndex=-1;h.focus({preventScroll:true});$('#builder-main').scrollIntoView({behavior:'smooth',block:'start'});}
  header();
  if(page==='home')initHome();
  if(page==='product'){initProduct();window.addEventListener('hashchange',()=>{initProduct();window.scrollTo({top:0,behavior:'instant'});});}
  if(page==='builder')initBuilder();
  document.addEventListener('click',e=>{
    const role=e.target.closest('[data-role]'),variant=e.target.closest('[data-variant]'),b=e.target.closest('[data-base]'),a=e.target.closest('[data-addon]'),p=e.target.closest('[data-pack]');
    if(role)setRole(+role.dataset.role);
    if(variant){selectedVariant=+variant.dataset.variant;$$('[data-variant]').forEach(el=>el.setAttribute('aria-pressed',String(+el.dataset.variant===selectedVariant)));const n=currentProduct.variants[selectedVariant].price;$('#product-price').textContent=price(n);$('#sticky-price').textContent=price(n);updateVariantContext();}
    if(e.target.closest('[data-product-add]'))addProduct();
    if(e.target.closest('[data-open-product-image]')){const el=ensureLightbox();lightboxRole=selectedRole;updateLightbox();el.showModal();}
    if(e.target.closest('[data-lightbox-prev]')){lightboxRole=(lightboxRole+5)%6;updateLightbox();}
    if(e.target.closest('[data-lightbox-next]')){lightboxRole=(lightboxRole+1)%6;updateLightbox();}
    if(e.target.closest('[data-lightbox-native]')){const b=$('[data-lightbox-native]'),on=b.getAttribute('aria-pressed')!=='true';b.setAttribute('aria-pressed',String(on));$('.lightbox-body').classList.toggle('native',on);}
    const remove=e.target.closest('[data-remove]');if(remove){cart.splice(+remove.dataset.remove,1);updateCart();openCart();}
    if(e.target.closest('[data-copy-cart]'))copy(cart.map(p=>`${p.name} · ${price(p.price)}${p.note?'\n'+p.note:''}`).join('\n\n')+'\n\nסכום הצעה: '+price(cart.reduce((s,p)=>s+p.price,0))+'\nמחירים והרכבים לאישור.');
    if(b){base=D.build.bases.find(x=>x.id===b.dataset.base);renderBuilder(`[data-base="${b.dataset.base}"]`);}
    if(a){const id=a.dataset.addon;if(addons.some(x=>x.id===id)){addons=addons.filter(x=>x.id!==id);}else if(addons.length<D.build.maxAddons){addons.push(D.build.addons.find(x=>x.id===id));}else{toast('אפשר לבחור עד חמש תוספות. אפשר להסיר תוספת כדי לבחור אחרת.');return;}renderBuilder(`[data-addon="${id}"]`);}
    if(p){pack=D.build.packs.find(x=>x.id===p.dataset.pack);renderBuilder(`[data-pack="${p.dataset.pack}"]`);}
  });
})();
