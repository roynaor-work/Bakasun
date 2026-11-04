'use strict';
(() => {
  const D=window.AUDIT, $=id=>document.getElementById(id);
  if(!D){$('meta').textContent='קובץ הנתונים המקומי לא נטען. יש לפתוח את כל התיקייה יחד.';return;}
  const names={bakasun:'באקה סאן',workout:'האימון',island:'האי',north:'החנות',review:'דף הביקורת'};
  const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n;};
  const link=(text,href)=>{const a=el('a',text);a.href=href;return a;};
  const num=n=>n===null||n===undefined?'—':Number(n).toLocaleString('he-IL',{maximumFractionDigits:2});
  const mb=n=>num(n/1e6);
  const dimensions=value=>{const n=el('bdi',String(value).replace('x','×'));n.dir='ltr';return n;};
  function table(headers,rows,caption){
    const t=el('table'),head=el('thead'),tr=el('tr');if(caption)t.append(el('caption',caption));
    headers.forEach(h=>{const th=el('th',h);th.scope='col';tr.append(th);});head.append(tr);t.append(head);
    const body=el('tbody');rows.forEach(cells=>{const row=el('tr');cells.forEach(c=>{const td=el('td');if(c&&typeof c==='object'&&c.nodeType)td.append(c);else td.textContent=String(c??'—');row.append(td);});body.append(row);});t.append(body);return t;
  }
  async function copy(text,button){
    let ok=false;
    try{await navigator.clipboard.writeText(text);ok=true;}catch{
      const a=el('textarea');a.value=text;a.className='sr-only';document.body.append(a);a.select();try{ok=document.execCommand('copy');}catch{}a.remove();button.focus();
    }
    $('copy-status').textContent=ok?'הוראות השחזור הועתקו':'ההעתקה לא זמינה. אפשר לסמן ולהעתיק את הוראות השחזור.';
  }
  $('meta').textContent=`בסיס ${D.meta.base.slice(0,12)} · עודכן ${D.meta.updatedLocal} · ${D.meta.state}`;
  for(const [count,label] of [[D.findings.length,'ממצאים עם שחזור'],[D.findings.filter(f=>f.priority===1).length,'בעדיפות P1'],[D.meta.rounds,'סבבים מתועדים'],[D.meta.unitPass,'בדיקות שעברו בכל הרצה מלאה']]){
    const s=el('div',undefined,'stat');s.append(el('strong',num(count)),el('span',label));$('stats').append(s);
  }
  for(const area of [...new Set(D.findings.map(f=>f.area))]){const o=el('option',area);o.value=area;$('area-filter').append(o);}
  const cardNodes=new Map();
  for(const f of D.findings){
    const card=el('details',undefined,'finding');card.id=f.id;
    const summary=el('summary'),badge=el('span',`P${f.priority}`,`badge p${f.priority}`),text=el('div');
    text.append(el('h3',`${f.id} · ${f.title}`),el('small',`${f.apps.map(a=>names[a]).join(' / ')} · ${f.area}`));summary.append(badge,text);card.append(summary);
    const body=el('div',undefined,'finding-body');
    body.append(el('h4','מה אומת'),el('p',f.observed),el('h4','שחזור'));
    const steps=el('ol');f.reproduction.forEach(s=>steps.append(el('li',s)));body.append(steps);
    const c=el('button','העתקת הוראות השחזור','copy');c.type='button';c.addEventListener('click',()=>copy(`${f.id} · ${f.title}\n${f.reproduction.map((s,i)=>`${i+1}. ${s}`).join('\n')}`,c));body.append(c);
    body.append(el('h4','תיקון מוצע'),el('p',f.proposedFix),el('h4','איך מאמתים תיקון'),el('p',f.verification));
    body.append(el('h4','מקור וראיות'));const refs=el('div',undefined,'sources');
    f.sources.forEach(s=>refs.append(link(`${s.file}:${s.line}`,`../../${s.file}#L${s.line}`)));
    f.evidence.forEach(p=>refs.append(link(p,p)));body.append(refs,el('p',f.limits,'limits'));card.append(body);$('finding-list').append(card);cardNodes.set(f.id,card);
  }
  function filterFindings(){
    const q=$('search').value.trim().toLocaleLowerCase(),app=$('app-filter').value,p=$('priority-filter').value,area=$('area-filter').value;let count=0;
    for(const f of D.findings){const show=(!app||f.apps.includes(app))&&(!p||String(f.priority)===p)&&(!area||f.area===area)&&(!q||`${f.id} ${f.title} ${f.observed} ${f.proposedFix}`.toLocaleLowerCase().includes(q));cardNodes.get(f.id).hidden=!show;if(show)count++;}
    $('filter-count').textContent=`מוצגים ${count} מתוך ${D.findings.length} ממצאים`;$('empty').hidden=!!count;
  }
  ['search','app-filter','priority-filter','area-filter'].forEach(id=>$(id).addEventListener(id==='search'?'input':'change',filterFindings));filterFindings();
  let galleryBuilt=false,weightsBuilt=false;
  document.querySelectorAll('[data-panel]').forEach(b=>b.addEventListener('click',()=>{
    document.querySelectorAll('[data-panel]').forEach(t=>t.setAttribute('aria-pressed',String(t===b)));
    document.querySelectorAll('main>.panel').forEach(p=>p.hidden=p.id!==b.dataset.panel);
    if(b.dataset.panel==='gallery'&&!galleryBuilt){buildGallery();galleryBuilt=true;}
    if(b.dataset.panel==='weights'&&!weightsBuilt){buildWeights();weightsBuilt=true;}
  }));
  function buildGallery(){
    D.iterations.forEach(i=>{const o=el('option',`${i.id} · ${i.label}`);o.value=i.id;$('iteration-filter').append(o);});
    const draw=()=>{
      const i=D.iterations.find(i=>i.id===$('iteration-filter').value),app=$('gallery-app').value,orientation=$('orientation').value;
      $('gallery-grid').replaceChildren();$('iteration-note').replaceChildren();if(!i)return;
      $('iteration-note').append(link(`ביקורת עצמית לסבב ${i.id}`,`iterations/${i.id}/CRITIQUE.md`));
      for(const s of i.shots.filter(s=>(!app||s.app===app)&&(!orientation||s.size===orientation))){
        const card=el('article',undefined,'shot-pair'),heading=el('h3',`${names[s.app]}${s.label?' · '+s.label:''} · `);heading.append(dimensions(s.size));card.append(heading);const frames=el('div',undefined,'shot-frames');
        for(const [mode,label] of [['near','קרוב'],['far','רחוק']]){
          const figure=el('figure'),button=el('button'),img=el('img');button.type='button';img.src=s[mode];img.alt=`${names[s.app]}${s.label?', '+s.label:''}, סבב ${i.id}, ${s.size}, ${label}`;img.loading='lazy';button.setAttribute('aria-label',`הגדלת צילום: ${img.alt}`);button.append(img);
          button.addEventListener('click',()=>{$('large-image').src=img.src;$('large-image').alt=img.alt;$('image-title').textContent=img.alt;$('image-caption').textContent=s[mode];$('image-dialog').showModal();});figure.append(button,el('figcaption',label));frames.append(figure);
        }
        card.append(frames);$('gallery-grid').append(card);
      }
    };
    ['iteration-filter','gallery-app','orientation'].forEach(id=>$(id).addEventListener('change',draw));draw();
  }
  $('close-image').addEventListener('click',()=>$('image-dialog').close());
  $('image-dialog').addEventListener('keydown',event=>{
    if(event.key!=='Tab')return;
    const items=[...$('image-dialog').querySelectorAll('button,a[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(e=>!e.disabled&&e.getClientRects().length);
    if(!items.length)return;
    if(event.shiftKey&&document.activeElement===items[0]){event.preventDefault();items.at(-1).focus();}
    else if(!event.shiftKey&&document.activeElement===items.at(-1)){event.preventDefault();items[0].focus();}
  });
  function buildWeights(){
    const startup=Object.entries(D.startup).map(([app,s])=>[names[app],s.validLcpSamples,`${num(s.medianLcpMs)} ms`,s.lcpRangeMs?`${num(s.lcpRangeMs[0])}–${num(s.lcpRangeMs[1])}`:'טרם נמדד',s.maxTransferBytes==null?'—':`${mb(s.maxTransferBytes)} MB`]);
    $('startup-table').append(table(['אפליקציה','דגימות LCP','חציון LCP','טווח ms','תעבורה מקומית מרבית'],startup));
    $('game-table').append(table(['משחק','תנוחה','FPS בענן','p95 frame ms','משולשים ב־frame','הערה'],D.games.map(g=>[g.name,dimensions(g.size),num(g.fps),num(g.p95),num(g.triangles),g.note])));
    $('platform-table').append(table(['דרישה','מצב שנמצא','ראיות ומגבלות'],(D.platform||[]).map(p=>[p.item,p.status,p.detail])));
    const drawAssets=()=>{
      const q=$('asset-search').value.toLocaleLowerCase(),rows=D.assets.filter(a=>a.path.toLocaleLowerCase().includes(q));
      $('asset-count').textContent=`מוצגים ${rows.length} מתוך ${D.assets.length} קובצי GLB`;
      $('asset-table').replaceChildren(table(['קובץ','MB','משולשים ייחודיים','עצמות בכל skin','תמונות','Draco'],rows.map(a=>{const p=el('span',a.path,'path');return [p,num(a.bytes/1e6),num(a.triangles),a.bones.length?a.bones.join(' / '):'ללא skin',a.images,a.draco];})));
    };$('asset-search').addEventListener('input',drawAssets);drawAssets();
    $('distribution').textContent=`חבילת Pages לפי כללי ה־workflow: ${mb(D.distribution.publishedBytes)} MB ב־${num(D.distribution.publishedFiles)} קבצים. חבילת offline ייחודית של האי: ${mb(D.distribution.offlineBytes)} MB. אלה משקלי הפצה, ואינם זהים לתעבורת פתיחה.`;
  }
  $('coverage-table').append(table(['פריט','ציון עצמי / 10','ראיות ומה חסר'],D.scores.map(s=>[s.item,s.score,s.detail])));
  $('coverage-summary').textContent=D.coverageSummary;
  D.conditions.forEach(t=>$('conditions').append(el('li',t)));
  if(location.hash){const card=cardNodes.get(location.hash.slice(1));if(card){card.open=true;requestAnimationFrame(()=>card.scrollIntoView({block:'start'}));}}
})();
