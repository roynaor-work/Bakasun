/* Local review interactions. Classic script intentionally supports file:// without a build. */
'use strict';
(() => {
 const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
 const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const PAGE_LINKS=[['index','היום'],['events','לוח אירועים'],['event','תיק אירוע'],['clients','לקוחות'],['suppliers','ספקים'],['invoices','חשבוניות'],['finance','כספים'],['proposals','הצעות'],['runsheet','לו״ז יום האירוע'],['calendar','יומן'],['budget','תקציב'],['contract','חוזה וחתימה'],['settings','הגדרות'],['system','מערכת העיצוב']];
 const dialog=$('#main-dialog'), menu=$('#menu-dialog'), toast=$('.toast');
 let activeOpener=null, toastTimer, undoAction=null;
 let preferences={};try{preferences=JSON.parse(localStorage.getItem('event-ui-v2-prefs')||'{}')}catch(_){}
 function savePrefs(){try{localStorage.setItem('event-ui-v2-prefs',JSON.stringify(preferences))}catch(_){}}
 function notify(text,undo=null){
   clearTimeout(toastTimer);toast.replaceChildren(document.createTextNode(text));undoAction=undo;
   if(undo){const b=document.createElement('button');b.type='button';b.textContent='ביטול';b.dataset.undo='';toast.append(b)}
   toast.hidden=false;toastTimer=setTimeout(()=>{toast.hidden=true;undoAction=null},undo?12000:6000);
 }
 function open(title,html,opener){activeOpener=opener||document.activeElement;$('#dialog-title').textContent=title;$('[data-dialog-content]').innerHTML=html;dialog.showModal()}
 function closeModal(target){target.close()}
 $$('[data-close]').forEach(b=>b.addEventListener('click',()=>closeModal(b.closest('dialog'))));
 [dialog,menu].forEach(d=>{
   d.addEventListener('close',()=>{$$('[data-menu]').forEach(b=>b.setAttribute('aria-expanded','false'));activeOpener?.focus()});
   d.addEventListener('click',e=>{if(e.target!==d)return;const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close()});
 });
 function syncPreferences(){
   const dark=document.documentElement.dataset.theme==='dark';
   $$('[data-theme-toggle]').forEach(b=>{b.setAttribute('aria-pressed',String(dark));b.setAttribute('aria-label',dark?'מעבר למצב בהיר':'מעבר למצב כהה')});
   $('[data-setting-theme]')?.setAttribute('aria-checked',String(dark));
   $('[data-setting-size]')?.setAttribute('aria-checked',String(!!preferences.large));
   $('[data-setting-motion]')?.setAttribute('aria-checked',String(!!preferences.reduce||matchMedia('(prefers-reduced-motion:reduce)').matches));
   if($('[data-start-page]'))$('[data-start-page]').value=preferences.start||'index';
   const start=PAGE_LINKS.some(([key])=>key===preferences.start)?preferences.start:'index';
   if($('[data-open-workspace]'))$('[data-open-workspace]').setAttribute('href',start+'.html');
   // Query carries theme across local file navigations even in restrictive storage modes.
   $$('a[href]').forEach(a=>{const u=a.getAttribute('href');if(u.startsWith('#'))return;let url;try{url=new URL(u,location.href)}catch(_){return}if(url.origin!==location.origin||!(/\/[a-z]+\.html$/).test(url.pathname))return;url.searchParams.set('theme',dark?'dark':'light');a.href=url.href});
 }
 function toggleTheme(){preferences.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=preferences.theme;savePrefs();syncPreferences();$$('[data-signature-form]').forEach(redrawSignature)}
 syncPreferences();
 function showMenu(opener){activeOpener=opener;opener.setAttribute('aria-expanded','true');menu.showModal()}
 function command(opener){
   open('מעבר מהיר למסך','<label class="search-field"><span class="sr-only">חיפוש מסך</span><input type="search" data-command-search placeholder="איזה מסך לפתוח?" autofocus></label><ul class="command-results">'+PAGE_LINKS.map(([k,l])=>`<li data-command-item><a href="${k}.html?theme=${document.documentElement.dataset.theme}">${l}<span class="muted small">←</span></a></li>`).join('')+'</ul><p data-command-empty class="small muted" hidden>לא נמצא מסך מתאים. נסו חיפוש אחר.</p>',opener);
 }
 function scopeFor(el){return el.closest('[data-filter-scope]')||document}
 function applyFilters(scope){
   const filters=$('[data-filters]',scope);if(!filters)return;
   const selected=$('[aria-pressed=true]',filters)?.dataset.filter||'all';
   const query=($('[data-search]',scope)?.value||'').trim().toLocaleLowerCase('he');
   const kind=$('select[data-kind]',scope)?.value||'all';let count=0;
   $$('[data-item]',scope).forEach(item=>{const match=(selected==='all'||item.dataset.state===selected)&&(kind==='all'||item.dataset.kind===kind)&&item.textContent.toLocaleLowerCase('he').includes(query);item.hidden=!match;if(match)count++});
   $$('[data-column]',scope).forEach(col=>{const count=$$('[data-item]:not([hidden])',col).length;col.hidden=selected!=='all'&&col.dataset.column!==selected;$('[data-column-count]',col).textContent=String(count);$('[data-column-empty]',col).hidden=count>0});
   const out=$('[data-result-count]',scope);if(out)out.textContent=`${count} רשומות בתצוגה`;
   const empty=$('[data-empty]',scope);if(empty)empty.hidden=count>0;
   const table=$('.data-table-wrap',scope);if(table)table.hidden=count===0;
 }
 $$('[data-filters]').forEach(el=>applyFilters(scopeFor(el)));
 function selectTab(tab,updateHash=true){
   const list=tab.closest('[role=tablist]');$$('[role=tab]',list).forEach(t=>{const selected=t===tab;t.setAttribute('aria-selected',String(selected));t.tabIndex=selected?0:-1;document.getElementById(t.getAttribute('aria-controls')).hidden=!selected});
   if(tab.dataset.tab){if($('[data-tab-select]'))$('[data-tab-select]').value=tab.dataset.tab;if(updateHash){try{history.replaceState(null,'','#'+tab.dataset.tab)}catch(_){}}}
   tab.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
 }
 function tabFromHash(){const id=location.hash.slice(1);const tab=$('[data-tab="'+CSS.escape(id)+'"]');if(tab)selectTab(tab,false)}
 if(document.body.dataset.page==='event'){tabFromHash();addEventListener('hashchange',tabFromHash)}
 $$('[role=tab]').forEach(tab=>tab.addEventListener('keydown',e=>{
   if(!['ArrowRight','ArrowLeft','Home','End'].includes(e.key))return;e.preventDefault();const tabs=$$('[role=tab]',tab.closest('[role=tablist]'));const index=tabs.indexOf(tab);const n=e.key==='Home'?0:e.key==='End'?tabs.length-1:(index+(e.key==='ArrowLeft'?1:-1)+tabs.length)%tabs.length;tabs[n].focus();selectTab(tabs[n]);
 }));
 const RECORDS={
   client:Array.from({length:6},(_,i)=>({title:`לקוח דמה ${'אבגדהו'[i]}׳`,facts:[['סוג רשומה','ארגון בדוי'],['אירועים לדוגמה',String(4-(i+1)%3)],['אחריות','תפקיד הפקה'],['פרטי קשר','לא נכללים בהדגמה']],href:'event.html',action:'לתיק האירוע'})),
   supplier:[['ספק דמה א׳','אירוח וקייטרינג','₪8,400','סגור'],['ספק דמה ב׳','הגברה ותאורה','₪3,600','ממתין לאישור'],['ספק דמה ג׳','צילום ותיעוד','₪2,000','סגור'],['ספק דמה ד׳','עיצוב חלל','₪1,600','סגור'],['ספק דמה ה׳','תוכן והנחיה','₪1,200','טרם שובץ']].map(([title,type,amount,status])=>({title,facts:[['תחום',type],['עלות לאירוע',amount],['מצב',status],['שייך לאירוע','מפגש צוות 01']],href:'budget.html',action:'לתקציב האירוע'})),
   invoice:[['DEMO-I-0261','לקוח דמה א׳','₪12,000','12.11.26','פתוחה'],['DEMO-I-0262','לקוח דמה ב׳','₪8,200','01.11.26','באיחור'],['DEMO-I-0263','לקוח דמה ג׳','₪4,800','15.11.26','טיוטה'],['DEMO-I-0264','לקוח דמה ד׳','₪9,600','29.10.26','שולמה']].map(([title,client,amount,date,status])=>({title,facts:[['לקוח',client],['סכום',amount],['מועד תשלום',date],['מצב',status]],href:'finance.html',action:'לתמונת הכספים'})),
   proposal:[['הצעת הפקה 01','מפגש צוות 01','₪24,000','אושרה'],['הצעת הפקה 02','ערב דמה 02','₪18,000','ממתינה'],['הצעת הפקה 03','כנס דמה 04','₪36,000','ממתינה'],['הצעת הפקה 04','מפגש דמה 05','₪9,000','טיוטה']].map(([title,event,amount,status])=>({title,facts:[['אירוע',event],['סכום לפני מע״מ',amount],['מצב',status],['תוקף ההצעה','14 ימים']],href:'contract.html',action:'לחוזה לדוגמה'})),
   component:[{title:'חלון פרטים',facts:[['רכיב','חלון מודאלי מקומי'],['סגירה','Escape או כפתור הסגירה'],['מיקוד','נשמר בתוך החלון'],['נתונים','דוגמה בדויה']],href:'event.html',action:'לרכיב בהקשר של אירוע'},{title:'שורת טבלה',facts:[['מצב','ממתין'],['תצוגה','טבלה במחשב, כרטיס בנייד']],href:'invoices.html',action:'למסך החשבוניות'}]
 };
 function showDetail(button){
   const record=RECORDS[button.dataset.detail]?.[Number(button.dataset.record)];if(!record)return;
   open(record.title,'<p class="dialog-intro">פרטי רשומת הדגמה · ללא מידע אמיתי</p><dl class="detail-list">'+record.facts.map(([k,v])=>`<div><dt>${escape(k)}</dt><dd>${escape(v)}</dd></div>`).join('')+`</dl><div class="dialog-actions"><button type="button" class="btn" data-copy="${escape(record.title+' | '+record.facts.map(x=>x.join(': ')).join(' | '))}">העתקת פרטים</button><a class="btn primary" href="${record.href}?theme=${document.documentElement.dataset.theme}">${record.action}</a></div>`,button);
 }
 const FORM_TYPES={event:['אירוע חדש','שם אירוע','מפגש דמה חדש','תאריך האירוע','date','2026-11-20'],client:['לקוח חדש','שם לקוח בדוי','לקוח דמה חדש','סוג ארגון','text','ארגון בדוי'],supplier:['ספק חדש','שם ספק בדוי','ספק דמה חדש','תחום שירות','text','שירותי הפקה'],invoice:['חשבונית לדוגמה','שם מסמך','חשבונית דמה חדשה','סכום בשקלים','number','1200'],proposal:['הצעה חדשה','שם הצעה','הצעת דמה חדשה','סכום בשקלים','number','2400'],calendar:['פריט ביומן','כותרת פריט','תיאום דמה','תאריך','date','2026-11-20']};
 function showCreate(type,opener){
   const config=FORM_TYPES[type];if(!config)return;const [title,label,placeholder,second,type2,value]=config;
   open(title,`<p class="dialog-intro">הוספת רשומה בדויה לתצוגה הנוכחית בלבד.</p><form class="dialog-form" data-create-form="${type}" novalidate><div class="field"><label for="new-name">${label} <span class="muted">(חובה)</span></label><input id="new-name" name="name" required maxlength="80" placeholder="${placeholder}" aria-describedby="new-name-error"><small id="new-name-error" class="field-error" hidden>יש למלא שם לרשומה.</small></div><div class="field"><label for="new-secondary">${second} <span class="muted">(חובה)</span></label><input id="new-secondary" name="secondary" type="${type2}" value="${value}" required ${type2==='number'?'min="1" max="9999999" step="1"':''} aria-describedby="new-secondary-error"><small id="new-secondary-error" class="field-error" hidden>יש למלא ערך תקין.</small></div><div class="dialog-actions"><button type="button" class="btn" data-cancel>ביטול</button><button type="submit" class="btn primary">הוספה להדגמה</button></div></form>`,opener);
 }
 function submitCreate(form){
   let valid=true;$$('input[required]',form).forEach(input=>{const ok=input.value.trim()&&input.validity.valid;input.setAttribute('aria-invalid',String(!ok));document.getElementById(input.getAttribute('aria-describedby')).hidden=!!ok;if(!ok)valid=false});
   if(!valid){$('[aria-invalid=true]',form).focus();return}
   const name=form.elements.name.value.trim(),value=form.elements.secondary.value;let section=$('[data-added-records]');
   if(!section){section=document.createElement('section');section.className='card space-top';section.dataset.addedRecords='';section.setAttribute('aria-label','רשומות שנוספו בהדגמה');section.innerHTML='<h2>נוסף בהדגמה הזו</h2><p class="subtitle">הרשומות זמניות, ומופיעות רק במסך הנוכחי.</p><div data-added-list></div>';$('main').insertBefore(section,$('.design-foot'))}
   const row=document.createElement('div');row.className='supplier-row';const content=document.createElement('div');content.className='grow';const h=document.createElement('h3');h.textContent=name;const p=document.createElement('p');p.textContent=value+' · רשומה בדויה מקומית';content.append(h,p);row.append(content);$('[data-added-list]',section).append(row);
   const source=activeOpener;dialog.close();section.tabIndex=-1;section.focus({preventScroll:true});notify('נוספה רשומת הדגמה',()=>{row.remove();if(!$('[data-added-list]',section).children.length)section.remove();source?.focus()});section.scrollIntoView({block:'center',behavior:motionAllowed()?'smooth':'instant'});
 }
 function editEvent(opener){
   const title=$('.event-hero h1').textContent;
   open('עריכת פרטי אירוע',`<p class="dialog-intro">השינוי יוצג בתיק המקומי בלבד.</p><form class="dialog-form" data-edit-form><div class="field"><label for="edit-title">שם אירוע (חובה)</label><input id="edit-title" required maxlength="80" value="${escape(title)}"></div><div class="dialog-actions"><button type="button" class="btn" data-cancel>ביטול</button><button type="submit" class="btn primary">שמירת תצוגה</button></div></form>`,opener);
 }
 function motionAllowed(){return !preferences.reduce&&!matchMedia('(prefers-reduced-motion:reduce)').matches}
 async function copyText(text){
   try{await navigator.clipboard.writeText(text);notify('הטקסט הועתק');}
   catch(_){const old=document.activeElement;const textarea=document.createElement('textarea');textarea.value=text;textarea.className='sr-only';(dialog.open?dialog:document.body).append(textarea);textarea.select();let success=false;try{success=document.execCommand('copy')}catch(_){}textarea.remove();old?.focus();if(success)notify('הטקסט הועתק');else open('טקסט להעתקה',`<p class="dialog-intro">בחרו את הטקסט והעתיקו אותו ידנית.</p><div class="field"><label for="copy-fallback">פרטי ההדגמה</label><textarea id="copy-fallback" readonly>${escape(text)}</textarea></div>`,old)}
 }
 function exportVisible(){
   const scope=$('[role=tabpanel]:not([hidden])')||document;const table=$('table',scope);if(!table){notify('אין טבלה במסך הזה. אפשר לייצא מהכספים או מהתקציב.');return}
   // Prefix formula-leading cells before exporting a spreadsheet-safe UTF-8 CSV.
   const safe=value=>{let s=value.trim().replace(/\s+/g,' ');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'};
   const rows=$$('tr:not([hidden])',table).map(tr=>$$('th,td',tr).map(td=>{const copy=td.cloneNode(true);$$('.mobile-cell-label',copy).forEach(el=>el.remove());return safe(copy.textContent)}).join(','));
   const blob=new Blob(['\uFEFF'+rows.join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='demo-'+document.body.dataset.page+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('קובץ נתוני הדמה הורד');
 }
 // Signature strokes stay in memory. Text entry provides the complete keyboard alternative.
 const signatures=new WeakMap();
 function redrawSignature(form){
   const canvas=$('canvas',form),ctx=canvas.getContext('2d'),state=signatures.get(form);if(!state)return;
   ctx.clearRect(0,0,canvas.width,canvas.height);ctx.strokeStyle=getComputedStyle(canvas).color;ctx.fillStyle=ctx.strokeStyle;ctx.lineWidth=3;ctx.lineCap='round';ctx.lineJoin='round';
   state.strokes.forEach(points=>{if(points.length===1){ctx.beginPath();ctx.arc(points[0][0],points[0][1],1.5,0,Math.PI*2);ctx.fill();return}ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke()});
 }
 function invalidateSignature(form){$('[data-signed]',form).hidden=true}

 $$('[data-signature-form]').forEach(form=>{
   const canvas=$('canvas',form),ctx=canvas.getContext('2d');const state={drawing:false,hasInk:false,strokes:[]};signatures.set(form,state);
   function point(e){const r=canvas.getBoundingClientRect();return [(e.clientX-r.left)*canvas.width/r.width,(e.clientY-r.top)*canvas.height/r.height]}
   canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;state.drawing=true;state.hasInk=true;canvas.setPointerCapture(e.pointerId);state.strokes.push([point(e)]);invalidateSignature(form);redrawSignature(form)});
   canvas.addEventListener('pointermove',e=>{if(!state.drawing)return;state.strokes[state.strokes.length-1].push(point(e));redrawSignature(form)});
   ['pointerup','pointercancel','lostpointercapture'].forEach(event=>canvas.addEventListener(event,()=>state.drawing=false));
 });
 function sign(form){
   const input=$('[data-signature-name]',form),consent=$('[data-consent]',form),error=$('[data-signature-error]',form),state=signatures.get(form);
   if(!input.value.trim()&&!state.hasInk){error.textContent='יש להקליד תפקיד בדוי או לצייר חתימה.';error.hidden=false;input.setAttribute('aria-invalid','true');input.focus();return}
   input.setAttribute('aria-invalid','false');if(!consent.checked){error.textContent='יש לאשר את קריאת מסמך ההדגמה.';error.hidden=false;consent.focus();return}
   error.hidden=true;$('[data-signed]',form).hidden=false;$('[data-signature-summary]',form).textContent=(input.value.trim()||'חתימה מצוירת')+' · אישור מקומי בלבד';notify('מסמך ההדגמה אושר');
 }
 const appointments={
 '2026-11-05':[['09:30','תיאום אחרון עם האולם','מפגש צוות 01 · חלל דמה א׳'],['12:00','סגירת תפריט','ממתין לאישור לקוח'],['14:00','בדיקת הצעת הגברה','ספק דמה ב׳']],
 '2026-11-06':[['08:00','הקמת מפגש צוות 01','צוות הפקה · חלל דמה א׳'],['10:00','פתיחת האירוע','80 משתתפים'],['14:00','סיכום ופירוק','צוות הפקה']],
 '2026-11-10':[['18:00','ערב דמה 02','לקוח דמה ב׳']],
 '2026-11-12':[['09:00','סדנת דמה 03','לקוח דמה ג׳']]
 };
 let calendarMonth=10,calendarYear=2026;
 function dateId(y,m,d){return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`}
 function selectDay(id){
   $$('[data-day]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.day===id)));
   const d=new Date(id+'T12:00:00');$('[data-day-title]').textContent=d.toLocaleDateString('he-IL',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
   $('[data-day-agenda]').innerHTML=appointments[id]?.map(([t,title,sub])=>`<div class="agenda-line"><time>${t}</time><div><p>${title}</p><small>${sub}</small></div></div>`).join('')||'<div class="empty-state"><img src="assets/empty/calendar.svg" alt="" width="180" height="128"><h3>יום פנוי, בינתיים.</h3><p>אין פריטים מתוכננים ליום הזה.</p><button type="button" class="btn soft" data-create="calendar">הוספת פריט</button></div>';
 }
 function renderCalendar(){
   const first=new Date(calendarYear,calendarMonth,1),last=new Date(calendarYear,calendarMonth+1,0).getDate();const cells=Math.ceil((first.getDay()+last)/7)*7;
   $('[data-month-title]').textContent=first.toLocaleDateString('he-IL',{month:'long',year:'numeric'});
   $('[data-calendar-grid]').innerHTML=Array.from({length:cells},(_,i)=>{const d=new Date(calendarYear,calendarMonth,i-first.getDay()+1),id=dateId(d.getFullYear(),d.getMonth(),d.getDate()),evt=appointments[id]?.[0]?.[1];return `<button type="button" class="calendar-day ${d.getMonth()!==calendarMonth?'inactive':''}" data-day="${id}" aria-pressed="false" aria-label="${d.toLocaleDateString('he-IL',{day:'numeric',month:'long',year:'numeric'})}${evt?': '+evt:''}"><span>${String(d.getDate()).padStart(2,'0')}</span>${evt?`<span class="calendar-event">${evt}</span>`:''}</button>`}).join('');selectDay(dateId(calendarYear,calendarMonth,1));
 }
 document.addEventListener('click',e=>{
   const b=e.target.closest('button,a');if(!b)return;
   if(b.matches('[data-theme-toggle],[data-setting-theme]'))toggleTheme();
   if(b.matches('[data-menu]'))showMenu(b);
   if(b.matches('[data-command]'))command(b);
   if(b.matches('[data-notifications]'))open('שני קצוות לתשומת הלב','<p class="dialog-intro">כל ההתראות כאן הן דוגמאות מקומיות.</p><div class="stack"><a class="card" href="event.html#details"><h3>אישור תפריט סופי</h3><p class="subtitle">מפגש צוות 01 · עד 12:00</p></a><a class="card" href="invoices.html"><h3>חשבונית דמה באיחור</h3><p class="subtitle">לקוח דמה ב׳ · ₪8,200</p></a></div>',b);
   if(b.matches('[data-check]')){const done=b.getAttribute('aria-pressed')!=='true';b.setAttribute('aria-pressed',String(done));notify(done?'המשימה סומנה כהושלמה בהדגמה':'המשימה שוב פתוחה',()=>b.setAttribute('aria-pressed',String(!done)))}
   if(b.matches('[data-filter]')){const scope=scopeFor(b);$$('[data-filter]',b.closest('[data-filters]')).forEach(s=>s.setAttribute('aria-pressed',String(s===b)));applyFilters(scope)}
   if(b.matches('[data-reset-filter]')){const scope=scopeFor(b);$('[data-search]',scope).value='';if($('select[data-kind]',scope))$('select[data-kind]',scope).value='all';$$('[data-filter]',scope).forEach(t=>t.setAttribute('aria-pressed',String(t.dataset.filter==='all')));applyFilters(scope);$('[data-search]',scope).focus()}
   if(b.matches('[role=tab]'))selectTab(b);
   if(b.matches('[data-open-tab]')){const tab=$('[data-tab="'+b.dataset.openTab+'"]');if(tab){selectTab(tab);tab.focus()}}
   if(b.matches('[data-detail]'))showDetail(b);
   if(b.matches('[data-create]'))showCreate(b.dataset.create,b);
   if(b.matches('[data-edit-event]'))editEvent(b);
   if(b.matches('[data-cancel]'))dialog.close();
   if(b.matches('[data-copy]'))copyText(b.dataset.copy);
   if(b.matches('[data-export]'))exportVisible();
   if(b.matches('[data-print]'))window.print();
   if(b.matches('[data-undo]')&&undoAction){undoAction();toast.hidden=true;clearTimeout(toastTimer);undoAction=null}
   if(b.matches('[data-clear-signature]')){const form=b.closest('[data-signature-form]'),canvas=$('canvas',form);canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);signatures.get(form).hasInk=false;signatures.get(form).strokes=[];$('[data-signature-name]',form).value='';$('[data-consent]',form).checked=false;$('[data-signed]',form).hidden=true;$('[data-signature-error]',form).hidden=true;$('[data-signature-name]',form).setAttribute('aria-invalid','false');notify('החתימה נוקתה')}
   if(b.matches('[data-sign-contract]'))sign(b.closest('[data-signature-form]'));
   if(b.matches('[data-day]'))selectDay(b.dataset.day);
   if(b.matches('[data-calendar-prev],[data-calendar-next]')){calendarMonth+=b.matches('[data-calendar-prev]')?-1:1;if(calendarMonth<0){calendarMonth=11;calendarYear--}if(calendarMonth>11){calendarMonth=0;calendarYear++}renderCalendar()}
   if(b.matches('[data-calendar-today]')){calendarMonth=10;calendarYear=2026;renderCalendar();selectDay('2026-11-05')}
   if(b.matches('[data-setting-size]')){preferences.large=!preferences.large;document.documentElement.dataset.textSize=preferences.large?'large':'normal';savePrefs();syncPreferences()}
   if(b.matches('[data-setting-motion]')){preferences.reduce=!preferences.reduce;document.documentElement.dataset.reduce=String(preferences.reduce);savePrefs();syncPreferences()}
   if(b.matches('[data-save-settings]')){preferences.start=$('[data-start-page]').value;savePrefs();syncPreferences();notify('העדפות ההדגמה נשמרו במכשיר הזה')}
   if(b.matches('[data-retry]')){const n=b.closest('.notice');n.className='notice positive';$('svg',n).innerHTML='<circle cx="12" cy="12" r="9"/><path d="m7 12 3 3 7-7"/>';$('h3',n).textContent='התוכן זמין שוב';$('p',n).textContent='הניסיון החוזר הושלם בהדגמה המקומית.';b.remove();notify('מצב ההדגמה הוחלף להצלחה')}
 });
 document.addEventListener('input',e=>{
   if(e.target.matches('[data-signature-name]'))invalidateSignature(e.target.closest('[data-signature-form]'));
   if(e.target.matches('[data-search]'))applyFilters(scopeFor(e.target));
   if(e.target.matches('[data-command-search]')){const query=e.target.value.trim();let n=0;$$('[data-command-item]').forEach(li=>{li.hidden=!li.textContent.includes(query);if(!li.hidden)n++});$('[data-command-empty]').hidden=n>0}
 });
 document.addEventListener('change',e=>{if(e.target.matches('[data-consent]'))invalidateSignature(e.target.closest('[data-signature-form]'));if(e.target.matches('select[data-kind]'))applyFilters(scopeFor(e.target));if(e.target.matches('[data-tab-select]'))selectTab($('[data-tab="'+e.target.value+'"]'))});
 document.addEventListener('submit',e=>{
   e.preventDefault();if(e.target.matches('[data-create-form]'))submitCreate(e.target);
   if(e.target.matches('[data-edit-form]')){const input=$('#edit-title');if(!input.value.trim()){input.setCustomValidity('יש למלא שם אירוע.');input.reportValidity();input.setCustomValidity('');return}const h=$('.event-hero h1'),previous=h.textContent;h.textContent=input.value.trim();dialog.close();notify('שם האירוע עודכן בתצוגה',()=>h.textContent=previous)}
 });
 document.addEventListener('keydown',e=>{if(e.key==='/'&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.target.matches('input,textarea,select')&&!dialog.open&&!menu.open){e.preventDefault();command(document.activeElement)}});
})();
