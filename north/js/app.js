/* הרוח הצפונית · מארזים. ניתוב לפי hash: #/ , #/p/<id> , #/checkout , #/thanks/<no> */
import { STORE, SHIPPING, OUT_OF_AREA, PAY, CLOUD, IMG } from './config.js';
import { CATS, OCCASIONS, PRODUCTS, BUILD, FAQ, byId } from './products.js';
import * as C from './cart.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => `<span class="num">${C.fmt(n)}</span>`;

let cart = C.load();
const state = { cat: 'all', occ: null, build: { base: null, addons: [], pack: BUILD.packs[0].id, note: '' } };
let lastOrder = null;

/* ---------- כלים ---------- */
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 2200); }
function saveCart() { C.save(cart); $('#cartn').textContent = C.count(cart); const b = $('#cartbtn'); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }
function openDrawer() { renderCart(); $('#drawer').classList.add('open'); $('#drawer').setAttribute('aria-hidden', 'false'); }
function closeDrawer() { $('#drawer').classList.remove('open'); $('#drawer').setAttribute('aria-hidden', 'true'); }
function waLink(text) { return STORE.whatsapp ? `https://wa.me/${STORE.whatsapp}?text=${encodeURIComponent(text)}` : ''; }
function reveal() {
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));
}

/* ---------- רכיבים ---------- */
function card(p) {
  return `<article class="card reveal">
    <a class="ph" href="#/p/${p.id}">${p.badge ? `<span class="badge">${esc(p.badge)}</span>` : ''}
      <img src="${p.img}" alt="${esc(p.name)}" loading="lazy" width="600" height="750">
      ${p.kosher === false ? '<span class="nk">לא כשר</span>' : ''}<span class="price">${money(p.price)}</span></a>
    <div class="body">
      <h3><a href="#/p/${p.id}">${esc(p.name)}</a></h3>
      <div class="sub">${esc(p.sub)}</div>
      <div class="act"><button class="btn gold sm" data-add="${p.id}">הוספה לסל</button><a class="btn line sm" href="#/p/${p.id}">פרטים</a></div>
    </div></article>`;
}

function catalogHtml() {
  let list = PRODUCTS.filter(p => state.cat === 'all' || p.cat === state.cat);
  if (state.occ) list = list.filter(p => p.occ.includes(state.occ));
  return list.length ? list.map(card).join('') : `<p class="sub" style="grid-column:1/-1;color:var(--muted)">אין עדיין מארז לשילוב הזה. בונים אחד למטה, או כותבים לנו.</p>`;
}

function homeHtml() {
  const occName = state.occ ? OCCASIONS.find(o => o.id === state.occ).name : '';
  return `
  <section class="hero">
    <img src="${IMG('1741120162449-e0e73f831b0d', 1800)}" alt="" fetchpriority="high">
    <div class="wrap">
      <span class="kicker">צומת הגומא · הגליל העליון</span>
      <h1>מארז שמרגישים<br>עוד לפני <em>שפותחים</em></h1>
      <p>וויסקי, קוקטיילים, יין ופינוק מהצפון, ארוזים כמו שצריך. בוחרים מארז מוכן או בונים אחד לבד, ואנחנו כותבים את הברכה ביד.</p>
      <div class="cta"><a class="btn gold" href="#/#catalog">לכל המארזים</a><a class="btn ghost" href="#/#build">בונים מארז לבד</a></div>
    </div>
  </section>
  <div class="trust"><div class="wrap">
    <div><span class="i">🚚</span><span><b>משלוח באזור</b>עד 40 דקות מצומת הגומא</span></div>
    <div><span class="i">🎀</span><span><b>אריזת מתנה</b>וכרטיס ברכה בכתב יד</span></div>
    <div><span class="i">✒️</span><span><b>חריטה אישית</b>על פלאסקים וכוסות</span></div>
    <div><span class="i">🔒</span><span><b>תשלום מאובטח</b>אשראי, ביט או באיסוף</span></div>
  </div></div>

  <section class="blk" id="occasions"><div class="wrap">
    <div class="sechead reveal"><div><h2>למי המתנה?</h2><p>בוחרים אירוע, ואנחנו מסננים את המארזים שמתאימים.</p></div></div>
    <div class="occ reveal">${OCCASIONS.map(o => `<button data-occ="${o.id}" class="${state.occ === o.id ? 'on' : ''}"><span class="i">${o.icon}</span>${o.name}</button>`).join('')}</div>
  </div></section>

  <section class="blk" id="catalog" style="padding-top:0"><div class="wrap">
    <div class="sechead reveal"><div><h2>המארזים${occName ? ` · ${esc(occName)}` : ''}</h2><p>כל מארז נארז אצלנו בחנות. הבקבוקים מהמדף, התוספות מיצרנים שאנחנו עובדים איתם.</p></div>
      <a class="more" href="#/#build">רוצים משהו אחר? בונים לבד ←</a></div>
    <div class="chips" id="chips">${CATS.map(c => `<button class="chip ${state.cat === c.id ? 'on' : ''}" data-cat="${c.id}">${c.name}</button>`).join('')}</div>
    <div class="grid" id="grid">${catalogHtml()}</div>
  </div></section>

  <section class="blk build" id="build"><div class="wrap">
    <div class="sechead reveal"><div><h2>מארז בהרכבה אישית</h2><p>שלושה צעדים: בקבוק, תוספות, אריזה. המחיר מתעדכן תוך כדי, ואנחנו אורזים.</p></div></div>
    <div class="lay"><div class="steps" id="bsteps">${buildStepsHtml()}</div><aside class="summary" id="bsum">${buildSumHtml()}</aside></div>
  </div></section>

  <section class="blk biz" id="biz"><div class="wrap"><div class="lay">
    <div class="reveal">
      <span class="kicker">לעסקים</span>
      <h2 style="font-size:clamp(30px,3.6vw,44px);color:#fff;margin-top:12px">מתנות לעובדים וללקוחות, בלי כאב ראש</h2>
      <ul>
        <li>מ-10 מארזים: מחיר לעסקים וחשבונית מס</li>
        <li>מיתוג: לוגו על הקופסה או על הכרטיס</li>
        <li>הרכב אחיד או מארז שונה לכל עובד</li>
        <li>משלוח מרוכז למשרד, או ישירות לבתים</li>
      </ul>
      <form class="form" id="bizform">
        <div class="row"><div class="field"><label>שם</label><input name="name" required></div><div class="field"><label>טלפון</label><input name="phone" type="tel" required inputmode="tel"></div></div>
        <div class="row"><div class="field"><label>חברה</label><input name="company"></div><div class="field"><label>כמות משוערת</label><select name="qty"><option>10-25</option><option>25-50</option><option>50-100</option><option>100+</option></select></div></div>
        <div class="field"><label>תקציב למארז ומה חשוב לכם</label><textarea name="notes" placeholder="למשל: 150-200 ₪ למארז, בלי אלכוהול לחלק מהעובדים, לוגו על הקופסה"></textarea></div>
        <button class="btn gold" type="submit">שולחים ונחזור באותו יום</button>
      </form>
    </div>
    <div class="art reveal"><img src="${IMG('1691017296011-ea9532242c7e', 1000)}" alt="" loading="lazy"></div>
  </div></div></section>

  <section class="blk about" id="about"><div class="wrap"><div class="lay">
    <div class="art reveal"><img src="${IMG('1783018563064-bd08fcc49f8d', 1000)}" alt="" loading="lazy"></div>
    <div class="reveal">
      <span class="kicker">מי אנחנו</span>
      <h2 style="font-size:clamp(30px,3.6vw,44px);color:#fff;margin:12px 0 16px">חנות אלכוהול בצומת הגומא, עם נוף להרי נפתלי</h2>
      <p>הרוח הצפונית היא חנות משקאות ובר בצומת הגומא. מדף וויסקי שלא נגמר, יינות מהיקבים של הגליל והגולן, ג׳ינים שקשה למצוא, ואנשים שיודעים להתאים בקבוק לאדם. המארזים נולדו מהשאלה שאנחנו שומעים כל יום: "מה לקנות לו?"</p>
      <p>כל מארז נבנה בחנות: הבקבוק מהמדף, התוספות מיצרנים מקומיים ומיבואנים שאנחנו עובדים איתם שנים, והאריזה נסגרת ביד. מגיעים, טועמים, לוקחים. או מזמינים מכאן ואנחנו שולחים.</p>
      <div class="stats"><div><b>600+</b><span>משקאות על המדף</span></div><div><b>12</b><span>מארזים מוכנים</span></div><div><b>∞</b><span>שילובים בהרכבה</span></div></div>
    </div>
  </div></div></section>

  <section class="blk" id="faq"><div class="wrap">
    <div class="sechead reveal"><div><h2>שאלות ותשובות</h2></div></div>
    <div class="faq reveal">${FAQ.map(f => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}</div>
  </div></section>`;
}

/* ---------- בונה מארז ---------- */
function opt(o, on) { return `<button class="opt ${on ? 'on' : ''}" data-bopt="${o.id}"><span class="i">${o.icon}</span><b>${esc(o.name)}${o.kosher === false ? ' <span class="nk sm">לא כשר</span>' : ''}</b><span class="p">${o.price ? money(o.price) : 'כלול'}</span></button>`; }
function buildStepsHtml() {
  const b = state.build;
  return `
    <div class="step"><h3><span class="no">1</span>הבקבוק<span class="hint">בוחרים אחד</span></h3><div class="opts">${BUILD.bases.map(o => opt(o, b.base === o.id)).join('')}</div></div>
    <div class="step"><h3><span class="no">2</span>התוספות<span class="hint">עד ${BUILD.maxAddons}</span></h3><div class="opts">${BUILD.addons.map(o => opt(o, b.addons.includes(o.id))).join('')}</div></div>
    <div class="step"><h3><span class="no">3</span>האריזה</h3><div class="opts">${BUILD.packs.map(o => opt(o, b.pack === o.id)).join('')}</div></div>`;
}
function buildParts() {
  const b = state.build;
  const base = BUILD.bases.find(x => x.id === b.base);
  const addons = BUILD.addons.filter(x => b.addons.includes(x.id));
  const pack = BUILD.packs.find(x => x.id === b.pack);
  return { base, addons, pack, price: C.buildPrice(base, addons, pack) };
}
function buildSumHtml() {
  const { base, addons, pack, price } = buildParts();
  const rows = [base, ...addons, pack].filter(Boolean);
  return `<h3>המארז שלכם</h3>
    ${rows.length ? `<ul>${rows.map(r => `<li><span>${r.icon} ${esc(r.name)}</span><span class="num">${r.price ? C.fmt(r.price) : 'כלול'}</span></li>`).join('')}</ul>` : `<p class="empty">עוד לא בחרתם. מתחילים מהבקבוק.</p>`}
    <div class="field"><label>ברכה לכרטיס (אנחנו כותבים ביד)</label><textarea id="bnote" maxlength="140" placeholder="למשל: לאבא, שיהיה טעים. אוהבים.">${esc(state.build.note)}</textarea></div>
    <div class="tot"><span>סה"כ</span>${money(price)}</div>
    <button class="btn gold wide" id="baddbtn" ${base ? '' : 'disabled'}>הוספה לסל</button>
    <small style="color:var(--dim)">המחיר כולל מע"מ ואריזה. הבקבוק המדויק לפי המלאי בחנות, ואם צריך נתקשר.</small>`;
}
function refreshBuild() { const s = $('#bsteps'), m = $('#bsum'); if (s) s.innerHTML = buildStepsHtml(); if (m) { const n = $('#bnote'); if (n) state.build.note = n.value; m.innerHTML = buildSumHtml(); } }

/* ---------- עמוד מוצר ---------- */
const pstate = { variant: null, qty: 1, img: 0, note: '', engrave: '' };
function productHtml(p) {
  const v = p.variants ? (p.variants.find(x => x.id === pstate.variant) || p.variants[0]) : null;
  const price = v ? v.price : p.price;
  const imgs = [p.img, p.img2].filter(Boolean);
  const related = PRODUCTS.filter(x => x.id !== p.id && (x.cat === p.cat || x.occ.some(o => p.occ.includes(o)))).slice(0, 4);
  return `<section class="pp"><div class="wrap">
    <div class="crumbs"><a href="#/">הבית</a><span>›</span><a href="#/#catalog">המארזים</a><span>›</span><span>${esc(p.name)}</span></div>
    <div class="lay">
      <div class="gallery">
        <div class="main"><img id="pmain" src="${imgs[pstate.img] || imgs[0]}" alt="${esc(p.name)}"></div>
        ${imgs.length > 1 ? `<div class="thumbs">${imgs.map((s, i) => `<button class="${i === pstate.img ? 'on' : ''}" data-img="${i}"><img src="${s.replace('w=900', 'w=200')}" alt=""></button>`).join('')}</div>` : ''}
      </div>
      <div class="pinfo">
        ${p.badge ? `<span class="kicker">${esc(p.badge)}</span>` : ''}
        <h1>${esc(p.name)}</h1>
        <div class="sub">${esc(p.sub)}</div>
        <div class="price">${money(price)}<small>כולל מע"מ ואריזת מתנה</small></div>
        <p class="desc">${esc(p.desc)}</p>
        ${p.variants ? `<div class="field"><label>גרסה</label><div class="vars">${p.variants.map(x => `<button class="${x.id === v.id ? 'on' : ''}" data-var="${x.id}">${esc(x.name)}<span class="num">${C.fmt(x.price)}</span></button>`).join('')}</div></div>` : ''}
        ${p.personalize ? `<div class="field"><label>${esc(p.personalize.label)} (עד ${p.personalize.max} תווים)</label><input id="pengrave" maxlength="${p.personalize.max}" value="${esc(pstate.engrave)}" placeholder="למשל: לאבא, 2026"></div>` : ''}
        ${p.kosher === false ? `<div class="nkbox"><b>לא כשר.</b> ${esc(p.kosherNote || 'המארז כולל מוצר ללא הכשר.')} אפשר לבקש החלפה בהערות להזמנה.</div>` : ''}
        <div class="contents"><h3>מה במארז</h3><ul>${p.contents.map(c => `<li>${esc(c)}</li>`).join('')}</ul></div>
        <div class="field"><label>ברכה לכרטיס (לא חובה)</label><textarea id="pnote" maxlength="140" placeholder="אנחנו כותבים אותה ביד על הכרטיס">${esc(pstate.note)}</textarea></div>
        <div class="buyrow">
          <div class="qty"><button data-q="-1" aria-label="פחות">−</button><b id="pqty" class="num">${pstate.qty}</b><button data-q="1" aria-label="יותר">+</button></div>
          <button class="btn gold" id="paddbtn">הוספה לסל · ${money(price * pstate.qty)}</button>
        </div>
        <div class="perks"><div>איסוף מהחנות בחינם</div><div>משלוח באזור (עד 40 דק׳ מצומת הגומא) ${money(SHIPPING.north.price)}, חינם מ-${money(SHIPPING.north.freeFrom)}</div><div>מסירה לבני 18 ומעלה</div><div>הרכב לפי מלאי, אפשר להחליף</div></div>
      </div>
    </div>
    ${related.length ? `<div class="sechead" style="margin-top:70px"><div><h2>עוד בכיוון הזה</h2></div></div><div class="grid">${related.map(card).join('')}</div>` : ''}
  </div></section>`;
}

/* ---------- סל ---------- */
function renderCart() {
  const el = $('#cartbody');
  if (!cart.length) { el.innerHTML = `<div class="empty"><span class="i">🛍️</span><p>הסל עוד ריק.</p><a class="btn gold sm" href="#/#catalog" data-close>לכל המארזים</a></div>`; return; }
  const sub = C.subtotal(cart);
  el.innerHTML = `<div class="lines">${cart.map(i => `<div class="crow">
      <img src="${i.img}" alt="">
      <div><b>${esc(i.name)}</b>${i.variant ? `<div class="v">${esc(i.variant)}</div>` : ''}${i.parts?.length ? `<div class="parts">${i.parts.map(p => esc(p.name)).join(' · ')}</div>` : ''}${i.kosher === false ? `<div class="v" style="color:var(--danger)">כולל מוצר לא כשר</div>` : ''}${i.engrave ? `<div class="v">חריטה: ${esc(i.engrave)}</div>` : ''}${i.note ? `<div class="v">ברכה: ${esc(i.note)}</div>` : ''}
        <div class="qty" style="margin-top:8px"><button data-cq="-1" data-key="${esc(i.key)}">−</button><b class="num">${i.qty}</b><button data-cq="1" data-key="${esc(i.key)}">+</button></div></div>
      <div class="col"><span class="lp">${money(i.price * i.qty)}</span><button class="rm" data-rm="${esc(i.key)}">הסרה</button></div>
    </div>`).join('')}</div>
    <div class="foot">
      <div class="row"><span>ביניים</span>${money(sub)}</div>
      <div class="row"><span>משלוח</span><span>${sub >= SHIPPING.north.freeFrom ? 'חינם בצפון' : 'נקבע בקופה'}</span></div>
      <div class="row t"><span>סה"כ</span>${money(sub)}</div>
      <a class="btn gold wide" href="#/checkout" data-close>לתשלום</a>
      <a class="btn line wide sm" href="#/#catalog" data-close>להמשיך לבחור</a>
    </div>`;
}
function addProduct(p, variantId, qty = 1, note = '', engrave = '') {
  const v = p.variants ? (p.variants.find(x => x.id === variantId) || p.variants[0]) : null;
  const item = { id: p.id, name: p.name, price: v ? v.price : p.price, variant: v ? v.name : '', img: p.img.replace('w=900', 'w=300'), note, engrave, kosher: p.kosher === false ? false : true };
  item.key = C.lineKey(p.id, (v ? v.id : '') + (note ? '#' + note : '') + (engrave ? '#' + engrave : ''));
  cart = C.addItem(cart, item, qty); saveCart(); toast(`${p.name} נוסף לסל`);
}

/* ---------- קופה ---------- */
const co = { method: 'pickup', pay: 'card', f: {} };
function checkoutHtml(errs = []) {
  if (!cart.length) return `<section class="thanks"><div class="box"><span class="i">🛍️</span><h1>הסל ריק</h1><p>בוחרים מארז ונחזור לכאן.</p><a class="btn gold" href="#/#catalog">לכל המארזים</a></div></section>`;
  const sub = C.subtotal(cart), ship = C.shippingPrice(co.method, sub), tot = sub + ship;
  const f = co.f;
  const pays = Object.entries(PAY).filter(([, p]) => p.enabled).filter(([k]) => k !== 'cash' || co.method === 'pickup');
  if (!pays.some(([k]) => k === co.pay)) co.pay = pays[0][0];
  return `<section class="co"><div class="wrap">
    <h1>סיום הזמנה</h1>
    <div class="lay">
      <form id="coform" class="steps" novalidate>
        ${errs.length ? `<div class="errs">חסר או לא תקין: ${errs.map(esc).join(', ')}</div>` : ''}
        <div class="panel"><h3><span class="no">1</span>איך מקבלים את המארז?</h3>
          <p style="margin:0;color:var(--dim);font-size:14px">${esc(OUT_OF_AREA)}</p>
          <div class="radio">${Object.values(SHIPPING).map(s => `<label class="${co.method === s.id ? 'on' : ''}"><input type="radio" name="method" value="${s.id}" ${co.method === s.id ? 'checked' : ''}><span><b>${esc(s.label)}</b><small>${esc(s.note)}${s.freeFrom ? ` חינם מ-${C.fmt(s.freeFrom)}.` : ''}</small></span><span class="rp">${C.shippingPrice(s.id, sub) ? `<span class="num">${C.fmt(C.shippingPrice(s.id, sub))}</span>` : (s.price ? `<s style="color:var(--dim);font-weight:400;margin-inline-end:6px" class="num">${C.fmt(s.price)}</s>חינם` : 'חינם')}</span></label>`).join('')}</div>
        </div>
        <div class="panel"><h3><span class="no">2</span>הפרטים</h3>
          <div class="form" style="padding:0;border:0;background:none">
            <div class="row"><div class="field"><label>שם מלא</label><input name="name" value="${esc(f.name)}" autocomplete="name" required></div><div class="field"><label>טלפון</label><input name="phone" type="tel" inputmode="tel" value="${esc(f.phone)}" autocomplete="tel" required></div></div>
            <div class="field"><label>מייל (לאישור ההזמנה)</label><input name="email" type="email" inputmode="email" value="${esc(f.email)}" autocomplete="email"></div>
            ${co.method !== 'pickup' ? `<div class="row"><div class="field"><label>יישוב</label><input name="city" value="${esc(f.city)}" autocomplete="address-level2"></div><div class="field"><label>רחוב ומספר</label><input name="street" value="${esc(f.street)}" autocomplete="street-address"></div></div>` : ''}
            <div class="row"><div class="field"><label>${co.method === 'pickup' ? 'מתי תבואו לאסוף?' : 'מתי נוח לקבל?'}</label><input name="when" value="${esc(f.when)}" placeholder="למשל: יום חמישי אחר הצהריים"></div><div class="field"><label>הערות</label><input name="notes" value="${esc(f.notes)}" placeholder="החלפת בקבוק, אלרגיות, קוד לבניין"></div></div>
          </div>
        </div>
        <div class="panel"><h3><span class="no">3</span>תשלום</h3>
          <div class="radio">${pays.map(([k, p]) => `<label class="${co.pay === k ? 'on' : ''}"><input type="radio" name="pay" value="${k}" ${co.pay === k ? 'checked' : ''}><span><b>${esc(p.label)}</b><small>${esc(p.note)}</small></span><span class="rp">${k === 'card' ? '💳' : k === 'bit' ? '📱' : '🏬'}</span></label>`).join('')}</div>
          <div class="paylogos"><span>Visa</span><span>Mastercard</span><span>American Express</span><span>Bit</span><span>Apple Pay</span><span>Google Pay</span></div>
          <label class="check"><input type="checkbox" name="adult" ${f.adult ? 'checked' : ''}><span>אני מאשר/ת שאני בן/בת 18 ומעלה, וכך גם מקבל/ת המשלוח. <span style="color:var(--dim)">מכירת משקאות משכרים לקטינים אסורה על פי חוק.</span></span></label>
          ${C.hasNonKosher(cart) ? `<label class="check" style="border:1px solid rgba(224,122,106,.45);border-radius:12px;padding:10px 12px"><input type="checkbox" name="kosherOk" ${f.kosherOk ? 'checked' : ''}><span><b style="color:#f3b7ad">שימו לב: ההזמנה כוללת מוצר ללא הכשר.</b> אני מאשר/ת שאני יודע/ת שהמארז אינו כשר. רוצים להחליף את הפריט? כותבים בהערות.</span></label>` : ''}
          <label class="check"><input type="checkbox" name="terms" ${f.terms ? 'checked' : ''}><span>קראתי ואני מאשר/ת את <a href="legal.html#terms" target="_blank" rel="noopener" style="color:var(--gold2);text-decoration:underline">התקנון</a>, את <a href="legal.html#cancel" target="_blank" rel="noopener" style="color:var(--gold2);text-decoration:underline">מדיניות הביטולים</a> ואת <a href="legal.html#privacy" target="_blank" rel="noopener" style="color:var(--gold2);text-decoration:underline">מדיניות הפרטיות</a>.</span></label>
          <button class="btn gold wide" type="submit" id="paybtn">${co.pay === 'card' ? 'לתשלום מאובטח' : co.pay === 'bit' ? 'לסיום ולתשלום בביט' : 'לסיום ההזמנה'} · ${money(tot)}</button>
        </div>
      </form>
      <aside class="panel osum">
        <h3>ההזמנה</h3>
        ${cart.map(i => `<div class="it"><span><b>${esc(i.name)}</b>${i.variant ? ` · ${esc(i.variant)}` : ''}${i.kosher === false ? ' <span class="nk sm">לא כשר</span>' : ''} <span class="num">×${i.qty}</span></span>${money(i.price * i.qty)}</div>`).join('')}
        <div class="row"><span>ביניים</span>${money(sub)}</div>
        <div class="row"><span>משלוח</span><span>${ship ? money(ship) : 'חינם'}</span></div>
        <div class="row t"><span>לתשלום</span>${money(tot)}</div>
        <small style="color:var(--dim)">המחירים כוללים מע"מ. חשבונית נשלחת למייל.</small>
        <a class="btn line sm" href="#/#catalog">חזרה לחנות</a>
      </aside>
    </div></div></section>`;
}
function readForm() {
  const fd = new FormData($('#coform')); const f = {};
  for (const [k, v] of fd.entries()) f[k] = typeof v === 'string' ? v.trim() : v;
  f.adult = !!fd.get('adult'); f.terms = !!fd.get('terms'); f.kosherOk = !!fd.get('kosherOk'); co.f = { ...co.f, ...f }; co.method = f.method || co.method; co.pay = f.pay || co.pay; return f;
}
async function submitOrder() {
  const f = readForm();
  const errs = C.validateOrder(f, co.method, { nonKosher: C.hasNonKosher(cart) });
  if (errs.length) { $('#view').innerHTML = checkoutHtml(errs); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  const sub = C.subtotal(cart), ship = C.shippingPrice(co.method, sub);
  const order = {
    no: C.orderNo(), store: STORE.name, items: cart, subtotal: sub, shipping: ship, total: sub + ship,
    method: co.method, shippingLabel: SHIPPING[co.method].label, pay: co.pay, payLabel: PAY[co.pay].label,
    customer: { name: f.name, phone: f.phone, email: f.email, city: f.city, street: f.street, when: f.when, notes: f.notes },
  };
  const btn = $('#paybtn'); btn.disabled = true; btn.textContent = 'שולחים…';
  await saveOrder(order);
  lastOrder = order; try { sessionStorage.setItem('north.last', JSON.stringify(order)); } catch { /* */ }
  cart = []; saveCart();
  if (order.pay === 'card' && PAY.card.grow) {
    btn.textContent = 'עוברים לעמוד התשלום…';
    const url = await growUrl(order);
    if (url) { order.growUrl = url; try { sessionStorage.setItem('north.last', JSON.stringify(order)); } catch { /* */ } location.href = url; return; }
  }
  location.hash = `#/thanks/${order.no}`;
}
/* עמוד תשלום ב-Grow: פונקציית הענן grow-pay יוצרת אותו עם הסכום ומספר ההזמנה. מחזיר קישור או ריק. */
async function growUrl(order) {
  if (!CLOUD.url || !CLOUD.key) return '';
  const returnBase = location.origin + location.pathname;
  if (!/^https:/.test(returnBase)) return '';
  try {
    const r = await fetch(`${CLOUD.url}/functions/v1/grow-pay`, { method: 'POST', headers: { apikey: CLOUD.key, Authorization: `Bearer ${CLOUD.key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ order: { no: order.no, store: order.store, total: order.total, shipping: order.shipping, items: order.items.map(i => ({ id: i.id, name: i.name + (i.variant ? ' · ' + i.variant : ''), qty: i.qty, price: i.price })), customer: order.customer }, returnBase }) });
    const j = await r.json().catch(() => ({}));
    return r.ok && j.url ? j.url : '';
  } catch { return ''; }
}
async function saveOrder(order) {
  if (!CLOUD.url || !CLOUD.key) return false;
  try {
    const r = await fetch(`${CLOUD.url}/rest/v1/${CLOUD.table}`, {
      method: 'POST', headers: { apikey: CLOUD.key, Authorization: `Bearer ${CLOUD.key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ order_no: order.no, pay: order.pay, method: order.method, total: order.total, customer: order.customer, items: order.items, totals: { subtotal: order.subtotal, shipping: order.shipping, total: order.total }, ua: navigator.userAgent.slice(0, 200) }),
    });
    order.saved = r.ok; return r.ok;
  } catch { order.saved = false; return false; }
}
function payUrl(order) {
  if (order.pay === 'card' && PAY.card.url) return PAY.card.url.replace('{sum}', order.total).replace('{ref}', encodeURIComponent(order.no));
  if (order.pay === 'bit' && PAY.bit.url) return PAY.bit.url.replace('{sum}', order.total).replace('{ref}', encodeURIComponent(order.no));
  return '';
}
function thanksHtml(no) {
  let o = lastOrder; if (!o || o.no !== no) { try { o = JSON.parse(sessionStorage.getItem('north.last')); } catch { /* */ } }
  if (!o || o.no !== no) return `<section class="thanks"><div class="box"><span class="i">✅</span><h1>ההזמנה נקלטה</h1><p class="no">${esc(no)}</p><a class="btn gold" href="#/">לחנות</a></div></section>`;
  const url = payUrl(o); const text = C.orderText(o);
  const paid = new URLSearchParams(location.search).get('paid');
  let payBlock = '';
  if (o.pay === 'card' && paid === '1') payBlock = `<p style="color:var(--ok);font-weight:700">התשלום התקבל. אישור נשלח למייל, ואנחנו מתחילים לארוז.</p>`;
  else if (o.pay === 'card' && paid === '0') payBlock = `<p>התשלום לא הושלם.</p>${o.growUrl ? `<a class="btn gold" href="${o.growUrl}">לנסות שוב לשלם · ${money(o.total)}</a>` : ''}<button class="btn line sm" id="growretry">עמוד תשלום חדש</button><p>או שתשלמו בביט / באיסוף, ההזמנה שמורה.</p>`;
  else if (o.pay === 'card') payBlock = url ? `<a class="btn gold" href="${url}" target="_blank" rel="noopener">לעמוד התשלום המאובטח · ${money(o.total)}</a><p>העמוד נפתח בחלון חדש. אחרי התשלום נשלח אישור למייל.</p>`
    : (PAY.card.grow ? `<button class="btn gold" id="growretry">לעמוד התשלום המאובטח · ${money(o.total)}</button><p>אם העמוד לא נפתח, נתקשר אליכם לגבייה טלפונית מאובטחת.</p>` : `<p>עמוד הסליקה עוד לא מחובר. נתקשר אליכם לגבייה טלפונית מאובטחת, או שתשלמו בביט/באיסוף.</p>`);
  else if (o.pay === 'bit') payBlock = (url ? `<a class="btn gold" href="${url}" target="_blank" rel="noopener">לתשלום בביט · ${money(o.total)}</a>` : '') + (PAY.bit.phone ? `<p>מעבירים בביט <b>${money(o.total)}</b> למספר <b class="ltr">${esc(PAY.bit.phone)}</b> וכותבים בהערה <b class="ltr">${esc(o.no)}</b>.</p>` : (url ? '' : `<p>מספר הביט של החנות יישלח אליכם בהודעה יחד עם האישור.</p>`));
  else payBlock = `<p>משלמים בחנות כשבאים לאסוף. נודיע בהודעה כשהמארז מוכן.</p>`;
  const wa = waLink(text);
  return `<section class="thanks"><div class="wrap"><div class="box">
    <span class="i">🎁</span><h1>תודה, ${esc(o.customer.name.split(' ')[0])}!</h1>
    <p>מספר ההזמנה</p><div class="no ltr">${esc(o.no)}</div>
    ${payBlock}
    <p>${o.saved ? 'ההזמנה נשמרה אצלנו.' : 'כדי שלא נפספס, שולחים לנו גם את הסיכום:'}</p>
    <div class="copyrow">${wa ? `<a class="btn line sm" href="${wa}" target="_blank" rel="noopener">שליחה בוואטסאפ</a>` : ''}<a class="btn line sm" href="mailto:${STORE.email}?subject=${encodeURIComponent('הזמנה ' + o.no)}&body=${encodeURIComponent(text)}">שליחה במייל</a><button class="btn line sm" id="copyord">העתקת הסיכום</button></div>
    <pre>${esc(text)}</pre>
    <a class="btn gold" href="#/">חזרה לחנות</a>
  </div></div></section>`;
}

/* ---------- תחתית ושער גיל ---------- */
function footerHtml() {
  return `<div class="wrap"><div class="cols">
    <div><div class="logo" style="margin-bottom:10px"><span class="mark">ר</span><span>הרוח הצפונית</span></div><p style="margin:0">${esc(STORE.tagline)}. ${esc(STORE.address)}.<br>${esc(STORE.hours)}</p></div>
    <div><h4>החנות</h4><a href="#/#catalog">המארזים</a><a href="#/#build">מארז בהרכבה</a><a href="#/#biz">לעסקים</a><a href="#/#faq">שאלות ותשובות</a></div>
    <div><h4>מידע</h4><a href="legal.html#terms">תקנון ותנאי שימוש</a><a href="legal.html#shipping">משלוחים ואיסוף</a><a href="legal.html#cancel">ביטול עסקה והחזרות</a><a href="legal.html#privacy">מדיניות פרטיות</a><a href="legal.html#access">הצהרת נגישות</a></div>
    <div><h4>דברו איתנו</h4>${STORE.phone ? `<a href="tel:${STORE.phone.replace(/-/g, '')}"><span class="ltr">${esc(STORE.phone)}</span></a>` : ''}${STORE.whatsapp ? `<a href="${waLink('שלום, אני מתעניין במארז')}" target="_blank" rel="noopener">וואטסאפ</a>` : ''}<a href="mailto:${STORE.email}"><span class="ltr">${esc(STORE.email)}</span></a>${STORE.instagram ? `<a href="${STORE.instagram}" target="_blank" rel="noopener">אינסטגרם</a>` : ''}</div>
  </div>
  <div class="legal">
    <div class="warn">אזהרה: צריכה מופרזת של אלכוהול מסכנת חיים ומזיקה לבריאות.</div>
    <div>מכירת משקאות משכרים לבני 18 ומעלה בלבד. המשלוח נמסר ידנית למקבל בוגר בלבד.</div>
    <div>${esc(STORE.legalName)} · ח.פ. <span class="ltr">${esc(STORE.companyId)}</span> · המחירים כוללים מע"מ · <a href="legal.html#cancel" style="display:inline;padding:0;text-decoration:underline">ביטול עסקה</a> בהתאם לחוק הגנת הצרכן, מוצר סגור ובלי חריטה.</div>
  </div></div>`;
}
function gate() {
  let ok = false; try { ok = localStorage.getItem('north.adult') === '1'; } catch { /* */ }
  if (ok) return;
  $('#gate').innerHTML = `<div class="gate"><div class="box"><span class="mark">ר</span><h2>בני 18 ומעלה?</h2><p>החנות מוכרת משקאות משכרים. הכניסה לבוגרים בלבד.</p>
    <div class="row"><button class="btn gold" id="g-yes">כן, אני מעל 18</button><a class="btn line" href="https://www.google.com">עוד לא</a></div>
    <small>אזהרה: צריכה מופרזת של אלכוהול מסכנת חיים ומזיקה לבריאות.</small></div></div>`;
  $('#g-yes').onclick = () => { try { localStorage.setItem('north.adult', '1'); } catch { /* */ } $('#gate').innerHTML = ''; };
}

/* ---------- ניתוב ---------- */
function route() {
  const h = location.hash || '#/';
  const [path, anchor] = h.slice(1).split('#');
  const view = $('#view');
  const parts = path.split('/').filter(Boolean);
  document.querySelectorAll('.menu a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === h));
  $('#mnav').classList.remove('open');
  if (parts[0] === 'p' && byId(parts[1])) {
    const p = byId(parts[1]);
    if (route.pid !== p.id) { Object.assign(pstate, { variant: null, qty: 1, img: 0, note: '', engrave: '' }); route.pid = p.id; }
    view.innerHTML = productHtml(p); window.scrollTo(0, 0);
  } else if (parts[0] === 'checkout') { view.innerHTML = checkoutHtml(); window.scrollTo(0, 0); }
  else if (parts[0] === 'thanks') { view.innerHTML = thanksHtml(parts[1] || ''); window.scrollTo(0, 0); }
  else {
    if (route.home !== true) { view.innerHTML = homeHtml(); route.home = true; }
    if (anchor) { const el = document.getElementById(anchor); if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30); }
    else if (!route.first) window.scrollTo(0, 0);
  }
  if (parts[0]) route.home = false;
  route.first = false;
  reveal();
}

/* ---------- אירועים ---------- */
document.addEventListener('click', e => {
  const t = e.target.closest('[data-add],[data-cat],[data-occ],[data-bopt],#baddbtn,[data-var],[data-q],#paddbtn,[data-img],[data-cq],[data-rm],[data-close],#cartbtn,#burger,#copyord,#growretry');
  if (!t) return;
  if (t.id === 'cartbtn') return openDrawer();
  if (t.id === 'burger') return $('#mnav').classList.toggle('open');
  if (t.hasAttribute('data-close')) return closeDrawer();
  if (t.dataset.add) { addProduct(byId(t.dataset.add)); return; }
  if (t.dataset.cat) { state.cat = t.dataset.cat; $('#chips').innerHTML = CATS.map(c => `<button class="chip ${state.cat === c.id ? 'on' : ''}" data-cat="${c.id}">${c.name}</button>`).join(''); $('#grid').innerHTML = catalogHtml(); reveal(); return; }
  if (t.dataset.occ) { state.occ = state.occ === t.dataset.occ ? null : t.dataset.occ; document.querySelectorAll('[data-occ]').forEach(b => b.classList.toggle('on', b.dataset.occ === state.occ)); $('#grid').innerHTML = catalogHtml(); $('#catalog h2').textContent = 'המארזים' + (state.occ ? ' · ' + OCCASIONS.find(o => o.id === state.occ).name : ''); reveal(); $('#catalog').scrollIntoView({ behavior: 'smooth' }); return; }
  if (t.dataset.bopt) {
    const id = t.dataset.bopt, b = state.build;
    if (BUILD.bases.some(x => x.id === id)) b.base = b.base === id ? null : id;
    else if (BUILD.packs.some(x => x.id === id)) b.pack = id;
    else if (b.addons.includes(id)) b.addons = b.addons.filter(x => x !== id);
    else if (b.addons.length < BUILD.maxAddons) b.addons.push(id);
    else toast(`עד ${BUILD.maxAddons} תוספות במארז`);
    refreshBuild(); return;
  }
  if (t.id === 'baddbtn') {
    const { base, addons, pack, price } = buildParts(); if (!base) return;
    state.build.note = $('#bnote').value.trim();
    const parts = [base, ...addons, pack];
    const item = { id: 'custom', name: 'מארז בהרכבה אישית', price, variant: base.name, parts: parts.map(p => ({ id: p.id, name: p.name })), img: IMG('1688851472616-7ad0980dab23', 300), note: state.build.note, kosher: parts.some(p => p.kosher === false) ? false : true };
    item.key = C.lineKey('custom', state.build.note, parts);
    cart = C.addItem(cart, item); saveCart(); toast('המארז שלכם נוסף לסל');
    state.build = { base: null, addons: [], pack: BUILD.packs[0].id, note: '' }; refreshBuild(); openDrawer(); return;
  }
  if (t.dataset.var !== undefined) { pstate.variant = t.dataset.var; pstate.note = $('#pnote').value; const en = $('#pengrave'); pstate.engrave = en ? en.value : ''; $('#view').innerHTML = productHtml(byId(route.pid)); return; }
  if (t.dataset.q) { pstate.qty = Math.max(1, Math.min(20, pstate.qty + +t.dataset.q)); pstate.note = $('#pnote').value; const en = $('#pengrave'); pstate.engrave = en ? en.value : ''; $('#view').innerHTML = productHtml(byId(route.pid)); return; }
  if (t.dataset.img !== undefined) { pstate.img = +t.dataset.img; const p = byId(route.pid); $('#pmain').src = [p.img, p.img2][pstate.img]; document.querySelectorAll('[data-img]').forEach(b => b.classList.toggle('on', b === t)); return; }
  if (t.id === 'paddbtn') { const p = byId(route.pid); const en = $('#pengrave'); if (p.personalize && en && !en.value.trim()) { toast('כותבים את הטקסט לחריטה'); en.focus(); return; } addProduct(p, pstate.variant, pstate.qty, $('#pnote').value.trim(), en ? en.value.trim() : ''); openDrawer(); return; }
  if (t.dataset.cq) { const it = cart.find(i => i.key === t.dataset.key); if (it) { cart = C.setQty(cart, it.key, it.qty + +t.dataset.cq); saveCart(); renderCart(); } return; }
  if (t.dataset.rm) { cart = C.removeItem(cart, t.dataset.rm); saveCart(); renderCart(); return; }
  if (t.id === 'growretry') { const o = lastOrder || JSON.parse(sessionStorage.getItem('north.last') || 'null'); if (!o) return; t.disabled = true; t.textContent = 'פותחים עמוד תשלום…'; growUrl(o).then(u => { if (u) location.href = u; else { t.disabled = false; t.textContent = 'לא הצלחנו לפתוח עמוד תשלום. נתקשר אליכם.'; } }); return; }
  if (t.id === 'copyord') { navigator.clipboard?.writeText($('.thanks pre').textContent).then(() => toast('הועתק')); return; }
});
document.addEventListener('change', e => {
  if (e.target.name === 'method' || e.target.name === 'pay') { readForm(); $('#view').innerHTML = checkoutHtml(); }
});
document.addEventListener('submit', e => {
  if (e.target.id === 'coform') { e.preventDefault(); submitOrder(); }
  if (e.target.id === 'bizform') {
    e.preventDefault(); const fd = new FormData(e.target); const o = Object.fromEntries(fd.entries());
    const text = `פנייה למארזים לעסקים\nשם: ${o.name}\nטלפון: ${o.phone}\nחברה: ${o.company || '-'}\nכמות: ${o.qty}\n${o.notes || ''}`;
    const wa = waLink(text);
    if (wa) window.open(wa, '_blank'); else location.href = `mailto:${STORE.email}?subject=${encodeURIComponent('מארזים לעסקים: ' + (o.company || o.name))}&body=${encodeURIComponent(text)}`;
    toast('תודה! נחזור אליכם היום'); e.target.reset();
  }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });
window.addEventListener('hashchange', route);

/* ---------- התחלה ---------- */
$('#footer').innerHTML = footerHtml();
$('#cartn').textContent = C.count(cart);
if (STORE.whatsapp) { const w = $('#wa'); w.href = waLink('שלום, אני מתעניין במארז'); w.classList.remove('hide'); }
route.first = true; route(); gate();
