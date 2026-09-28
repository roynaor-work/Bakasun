// האפליקציה: ניתוב, מסכים, מהלך אימון (חימום -> תרגילים -> מנוחות -> מתיחות -> סיכום), מעקב והגדרות.
import { EXERCISES, CATS, byId } from './exercises.js';
import { PROGRAMS, programById, DEFAULT_PLAN, DAY_NAMES } from './programs.js';
import { Figure, cycleMs } from './figure.js';
import { store } from './store.js';
import { LEVELS, buildItems, summarize, stats, earned, BADGES, fmtTime, fmtDate, uid, scaleTarget, todayProgram, weekDays, suggestLevel } from './logic.js';
import { GAMES, GAME_GROUPS, gameById, pickGift } from './games/index.js';
import { runGame } from './games/engine.js';
import * as cloud from './cloud.js';
import { initParent, parentGate, parentHome, basketball } from './parent.js';

const $ = s => document.querySelector(s);
const app = $('#app'), nav = $('#nav');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const go = h => { location.hash = h; };
const plan = () => store.profile.plan || DEFAULT_PLAN;

let figures = [], activeGame = null;
function mount(html, full = false) {
  figures.forEach(f => f.stop()); figures = [];
  if (activeGame) { activeGame.stop(); activeGame = null; }
  stopSpeak();
  clearInterval(tick); tick = 0;
  app.innerHTML = html; app.classList.toggle('full', full);
  nav.classList.toggle('hidden', full);
  window.scrollTo(0, 0);
}
function fig(svg, ex, speed = 1) { const f = new Figure(svg); f.play(ex, speed); figures.push(f); return f; }
function figs(sel = 'svg[data-ex]') { return [...app.querySelectorAll(sel)].map(s => fig(s, byId[s.dataset.ex])); }
const figSvg = (exId, cls = '') => `<svg class="figure ${cls}" data-ex="${exId}" aria-hidden="true"></svg>`;
const catPill = cat => `<span class="pill ${cat}">${CATS[cat].emoji} ${CATS[cat].name}</span>`;
const stepsHtml = ex => `<ol class="steps">${ex.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>`;
const placePill = ex => ex.place === 'hall' ? '<span class="pill hall">🚪 במסדרון</span>' : '';
// כפתור עזרה: רק כשלוחצים נפתח הסבר, האנימציה מואטת והטקסט מוקרא בעברית
function helpButton() { return `<button class="btn big help" id="help">❓ איך עושים את זה?</button><div id="helpbox" hidden></div>`; }
function wireHelp(ex, mainFig) {
  const btn = $('#help'), box = $('#helpbox'); if (!btn) return;
  let open = false;
  btn.onclick = () => {
    open = !open;
    if (!open) { box.hidden = true; box.innerHTML = ''; btn.textContent = '❓ איך עושים את זה?'; stopSpeak(); mainFig && mainFig.play(ex, 1); return; }
    btn.textContent = '✖ סגור את ההסבר';
    box.hidden = false;
    box.innerHTML = `<div class="card stack helpcard pop">
      <div class="row between"><h3>איך עושים ${esc(ex.name)}</h3><button class="btn chip" id="sayagain">🔊 להשמיע שוב</button></div>
      ${stepsHtml(ex)}<div class="tip">👀 ${esc(ex.tip)}</div>
      <p class="muted small">האנימציה עכשיו לאט. ${canSpeak() && store.profile.voice !== false ? 'ההסבר מוקרא בקול.' : 'אין קול במכשיר הזה, קוראים.'}</p>
    </div>`;
    mainFig && mainFig.play(ex, 0.55);
    speak(sayText(ex));
    $('#sayagain').onclick = () => speak(sayText(ex));
  };
}

// ---- צליל ----
let ac;
function beep(freq = 880, ms = 120, at = 0) {
  if (!store.profile.sound) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine'; o.frequency.value = freq; o.connect(g); g.connect(ac.destination);
    const t = ac.currentTime + at; g.gain.setValueAtTime(.25, t); g.gain.exponentialRampToValueAtTime(.001, t + ms / 1000);
    o.start(t); o.stop(t + ms / 1000 + .02);
  } catch { /* בלי צליל */ }
}
const fanfare = () => { beep(660, 120); beep(880, 120, .14); beep(1100, 260, .28); };

// ---- קול הדרכה בעברית (Web Speech API, הקול של המכשיר) ----
const speech = window.speechSynthesis;
const hebrewVoice = () => (speech?.getVoices() || []).find(v => /^he/i.test(v.lang)) || null;
const canSpeak = () => !!speech;
function speak(text) {
  if (!speech || store.profile.voice === false) return false;
  speech.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'he-IL'; u.rate = 0.95; u.pitch = 1.05;
  const v = hebrewVoice(); if (v) u.voice = v;
  speech.speak(u);
  return true;
}
const stopSpeak = () => { try { speech && speech.cancel(); } catch { /* אין קול */ } };
const sayText = ex => ex.say || `${ex.name}. ${ex.steps.join('. ')}. שימו לב: ${ex.tip}`;
function confetti() {
  const c = document.createElement('div'); c.className = 'confetti';
  const colors = ['#FF7A3D', '#FF4D8D', '#1FB6C9', '#6C4CF1', '#FFB84D', '#22C55E'];
  for (let i = 0; i < 70; i++) {
    const p = document.createElement('i');
    p.style.cssText = `left:${Math.random() * 100}vw;background:${colors[i % colors.length]};animation-duration:${1.6 + Math.random() * 1.6}s;animation-delay:${Math.random() * .6}s`;
    c.appendChild(p);
  }
  document.body.appendChild(c); setTimeout(() => c.remove(), 3600);
}

// ---- ניתוב ----
const routes = { '': home, home, exercises: exercisesScreen, exercise: exerciseDetail, history, settings, free, start, workout: workoutScreen, arcade, parent: parentHome, basketball };
function route() {
  const [path, arg] = location.hash.replace(/^#\/?/, '').split('/');
  (routes[path] || home)(arg);
  renderNav(path);
}
function renderNav(path) {
  const tabs = [['home', '🏠', 'היום'], ['exercises', '🤸', 'תרגילים'], ['arcade', '🎮', 'משחקים'], ['history', '📈', 'מעקב'], ['settings', '⚙️', 'הגדרות']];
  nav.innerHTML = tabs.map(([k, i, n]) => `<a href="#/${k}" class="${(path || 'home') === k ? 'on' : ''}"><span class="i">${i}</span>${n}</a>`).join('');
}
window.addEventListener('hashchange', route);

const name = () => store.profile.name.trim();
const hi = () => name() ? `היי, ${esc(name())}!` : 'היי, אלוף!';
const blocksText = p => (p.blocks || []).map(b => b.name === 'האימון' ? `${b.items.length} תרגילים${b.rounds > 1 ? ` × ${b.rounds} סבבים` : ''}` : b.name).join(' ← ');

// ---- בית: האימון של היום ----
function home() {
  const st = stats(store.sessions);
  const todayCount = st.week.at(-1).count;
  const now = new Date();
  const todayId = todayProgram(plan(), now);
  const today = todayId ? programById[todayId] : null;
  const week = weekDays(store.sessions, now);
  const nextLevel = suggestLevel(store.sessions, store.profile.level);
  mount(`
  <div class="stack">
    <section class="hero">
      <div class="row between wrap">
        <h1>${hi()}</h1>
        <span class="pill">🔥 ${st.streak} ימים ברצף</span>
      </div>
      <div class="row wrap" style="margin-top:8px"><span class="tokens" data-go="#/arcade">🎁 ${store.tokens} ${store.tokens === 1 ? 'מתנה' : 'מתנות'} לשחק</span><span class="pill">🎮 ${GAMES.length} משחקים</span></div>
      <p class="muted" style="margin-top:6px">יום ${DAY_NAMES[now.getDay()]}. ${todayCount ? `היום כבר עשית ${todayCount === 1 ? 'אימון' : todayCount + ' אימונים'}. כל הכבוד!` : today ? 'היום זה יום ' + esc(today.name.split(':')[0]) + '. יאללה!' : 'היום יום מנוחה. מגיע לך.'}</p>
    </section>

    <div class="weekstrip">
      ${week.map(d => { const pid = plan()[d.day]; const p = pid && programById[pid]; return `<div class="wd ${d.today ? 'today' : ''} ${d.done ? 'done' : ''} ${d.past && !d.done && p ? 'missed' : ''}"><span>${DAY_NAMES[d.day].slice(0, 2)}</span><span class="e">${d.done ? '✅' : p ? p.emoji : '😴'}</span></div>`; }).join('')}
    </div>

    <h2>${todayCount ? 'עוד אחד היום?' : 'האימון של היום'}</h2>
    ${today ? `
      <div class="card tap prog ${today.cat} today" data-go="#/start/${today.id}">
        <div class="emoji">${today.emoji}</div>
        <div><h3>${esc(today.name)}</h3><p class="muted small">${esc(blocksText(today))}</p></div>
        <span class="pill solid">${today.minutes} דק'</span>
      </div>
      <button class="btn primary big" data-go="#/start/${today.id}">מתחילים את האימון של היום 🚀</button>`
    : `<div class="card"><h3>😴 יום מנוחה</h3><p class="muted small">השרירים גדלים דווקא במנוחה. אם בכל זאת בא לך לזוז: מתיחות או אימון 7 דקות קל.</p></div>
       <div class="card tap prog jump" data-go="#/start/quick"><div class="emoji">⏱️</div><div><h3>אימון 7 דקות</h3><p class="muted small">קצר וקל.</p></div><span class="pill solid">7 דק'</span></div>`}

    ${nextLevel ? `<div class="card row" style="border:2px solid var(--star)"><span style="font-size:32px">🏅</span><div class="grow"><b>שלושה אימונים מושלמים ברצף!</b><p class="muted small">נראה שאתה מוכן לרמה "${LEVELS[nextLevel].name}".</p></div><button class="btn chip on" id="levelup">לעלות רמה</button></div>` : ''}

    <h2>כל האימונים</h2>
    ${PROGRAMS.filter(p => p !== today).map(p => `
      <div class="card tap prog ${p.cat}" data-go="#/start/${p.id}">
        <div class="emoji">${p.emoji}</div>
        <div><h3>${esc(p.name)}</h3><p class="muted small">${esc(p.desc)}</p></div>
        <span class="pill solid">${p.minutes} דק'</span>
      </div>`).join('')}
    <div class="card tap prog upper" data-go="#/free">
      <div class="emoji">🎯</div>
      <div><h3>אימון חופשי</h3><p class="muted small">בוחר לבד את התרגילים.</p></div>
      <span class="pill solid">אתה קובע</span>
    </div>
  </div>`);
  const lu = $('#levelup'); if (lu) lu.onclick = () => { store.setProfile({ level: nextLevel }); home(); };
}

// ---- תצוגה מקדימה והתחלה ----
function start(id) {
  const program = programById[id]; if (!program) return go('#/home');
  const level = store.profile.level;
  const items = buildItems(program, byId, level);
  let lastBlock = null;
  mount(`
  <div class="stack">
    <div class="row between"><button class="btn icon ghost" data-go="#/home" aria-label="חזרה">→</button><h1 class="grow">${program.emoji} ${esc(program.name)}</h1></div>
    <p class="muted">${esc(program.desc)} בערך ${program.minutes} דקות.</p>
    <div class="card">
      <div class="row between wrap"><b>רמה</b><div class="row">${Object.entries(LEVELS).map(([k, v]) => `<button class="btn chip ${k === level ? 'on' : ''}" data-level="${k}">${v.name}</button>`).join('')}</div></div>
    </div>
    <div class="card">
      ${items.map(i => {
        const key = i.block + (i.rounds > 1 ? ' ' + i.round : '');
        const head = key !== lastBlock ? `<div class="blockhead">${esc(i.block)}${i.rounds > 1 ? ` · סבב ${i.round} מתוך ${i.rounds}` : ''}</div>` : '';
        lastBlock = key;
        return head + `<div class="item">${figSvg(i.exId, 'mini')}<div class="grow"><b>${esc(i.name)}</b></div><span class="pill solid">${targetText(i)}</span></div>`;
      }).join('')}
    </div>
    <button class="btn primary big" id="begin">יאללה, מתחילים! 🚀</button>
  </div>`);
  figs();
  app.querySelectorAll('[data-level]').forEach(b => b.onclick = () => { store.setProfile({ level: b.dataset.level }); start(id); });
  $('#begin').onclick = () => beginWorkout(program, items);
}
const targetText = i => i.type === 'time' ? `${i.target} שנ'` : `${i.target} חזרות`;

// ---- אימון חופשי ----
const freeSel = new Set();
function free() {
  const level = store.profile.level;
  mount(`
  <div class="stack">
    <div class="row between"><button class="btn icon ghost" data-go="#/home" aria-label="חזרה">→</button><h1 class="grow">אימון חופשי</h1></div>
    <p class="muted">מסמנים את התרגילים שרוצים, בסדר שרוצים. אפשר לשנות את הכמות בזמן האימון.</p>
    ${Object.entries(CATS).map(([cat, c]) => `
      <h2>${c.emoji} ${c.name}</h2>
      <div class="exgrid">
      ${EXERCISES.filter(e => e.cat === cat).map(e => `
        <div class="card tap pick excard ${freeSel.has(e.id) ? 'on' : ''}" data-pick="${e.id}">
          ${figSvg(e.id)}<b>${esc(e.name)}</b><span class="muted small">${targetText({ type: e.type, target: scaleTarget(e.base, level, e.type) })}</span>
        </div>`).join('')}
      </div>`).join('')}
    <button class="btn primary big" id="begin" ${freeSel.size ? '' : 'disabled'}>להתחיל עם ${freeSel.size} תרגילים 🚀</button>
  </div>`);
  figs();
  app.querySelectorAll('[data-pick]').forEach(c => c.onclick = () => {
    const id = c.dataset.pick; freeSel.has(id) ? freeSel.delete(id) : freeSel.add(id);
    c.classList.toggle('on'); const b = $('#begin'); b.disabled = !freeSel.size; b.textContent = `להתחיל עם ${freeSel.size} תרגילים 🚀`;
  });
  $('#begin').onclick = () => {
    const program = { id: 'free', name: 'אימון חופשי', emoji: '🎯', items: [...freeSel], rounds: 1, minutes: Math.round(freeSel.size * 1.2) };
    beginWorkout(program, buildItems(program, byId, store.profile.level));
  };
}

// ---- ספריית התרגילים ----
function exercisesScreen() {
  const st = stats(store.sessions);
  mount(`
  <div class="stack">
    <h1>כל התרגילים</h1>
    <p class="muted">לוחצים על תרגיל כדי לראות איך עושים אותו נכון, או לעשות אותו לבד.</p>
    ${Object.entries(CATS).map(([cat, c]) => `
      <h2>${c.emoji} ${c.name}</h2>
      <div class="exgrid">
      ${EXERCISES.filter(e => e.cat === cat).map(e => `
        <div class="card tap excard" data-go="#/exercise/${e.id}">
          ${figSvg(e.id)}<b>${esc(e.name)}</b>
          <span class="muted small">${st.perExercise[e.id] ? `שיא: ${st.perExercise[e.id].best}${e.type === 'time' ? ' שנ\'' : ''}` : 'עוד לא עשית'}</span>
        </div>`).join('')}
      </div>`).join('')}
  </div>`);
  figs();
}

function exerciseDetail(id) {
  const ex = byId[id]; if (!ex) return go('#/exercises');
  const p = stats(store.sessions).perExercise[id];
  const target = scaleTarget(ex.base, store.profile.level, ex.type);
  mount(`
  <div class="stack">
    <div class="row between"><button class="btn icon ghost" data-go="#/exercises" aria-label="חזרה">→</button><h1 class="grow">${esc(ex.name)}</h1>${catPill(ex.cat)}</div>
    <div class="stage">${figSvg(ex.id)}</div>
    <div class="row wrap"><button class="btn chip" data-speed="0.5">לאט</button><button class="btn chip on" data-speed="1">רגיל</button><button class="btn chip" data-speed="1.5">מהר</button>${placePill(ex)}</div>
    ${helpButton()}
    <div class="tiles">
      <div class="tile"><b>${target}</b>${ex.type === 'time' ? 'שניות ברמה שלך' : 'חזרות ברמה שלך'}</div>
      <div class="tile hot"><b>${p ? p.best : '–'}</b>השיא שלך</div>
      <div class="tile"><b>${p ? p.times : 0}</b>פעמים שעשית</div>
    </div>
    <button class="btn primary big" id="solo">לעשות עכשיו רק את זה 💥</button>
  </div>`);
  const f = fig(app.querySelector('svg[data-ex]'), ex);
  wireHelp(ex, f);
  app.querySelectorAll('[data-speed]').forEach(b => b.onclick = () => { app.querySelectorAll('[data-speed]').forEach(x => x.classList.remove('on')); b.classList.add('on'); f.play(ex, +b.dataset.speed); });
  $('#solo').onclick = () => {
    const program = { id: 'solo', name: ex.name, emoji: '💥', items: [ex.id], rounds: 1, minutes: 1 };
    beginWorkout(program, buildItems(program, byId, store.profile.level));
  };
}

// ---- מהלך האימון ----
let W = null, tick = 0;
function beginWorkout(program, items) {
  W = { program, items: items.map(i => ({ ...i, done: 0, skipped: false })), idx: 0, phase: 'exercise', startedAt: Date.now(), saved: false, mainDone: 0, gift: null, afterGift: null, gamesPlayed: 0 };
  go('#/workout');
}

function workoutScreen() {
  if (!W) return go('#/home');
  if (W.phase === 'exercise') exercisePhase();
  else if (W.phase === 'rest') restPhase();
  else if (W.phase === 'gift') giftPhase();
  else donePhase();
}

function exercisePhase() {
  const it = W.items[W.idx], ex = byId[it.exId];
  const pct = Math.round(100 * W.idx / W.items.length);
  const blockLabel = it.block === 'האימון' ? (it.rounds > 1 ? `סבב ${it.round} מתוך ${it.rounds}` : 'האימון') : it.block;
  mount(`
  <div class="stack">
    <div class="topbar">
      <button class="btn icon ghost" id="quit" aria-label="יציאה">✕</button>
      <div><div class="center small muted">${W.idx + 1} מתוך ${W.items.length} · ${esc(W.program.name)}</div><div class="bar"><i style="width:${pct}%"></i></div></div>
      <span></span>
    </div>
    <div class="row between"><span class="pill block">${esc(blockLabel)}</span><span class="row">${placePill(ex)}${catPill(ex.cat)}</span></div>
    <div class="stage">${figSvg(ex.id)}</div>
    <h1 class="center">${esc(ex.name)}</h1>
    ${helpButton()}
    ${it.type === 'time' ? timeBlock(it) : repsBlock(it)}
    <div class="row">
      <button class="btn ghost grow" id="skip">דילוג ⏭️</button>
      <button class="btn ghost" id="prev" ${W.idx ? '' : 'disabled'}>הקודם</button>
    </div>
  </div>`, true);
  const [mainFig] = figs();
  wireHelp(ex, mainFig);
  $('#quit').onclick = quit;
  $('#skip').onclick = () => finishItem(0, true);
  $('#prev').onclick = () => { if (W.idx) { W.idx--; W.phase = 'exercise'; workoutScreen(); } };
  if (it.type === 'time') wireTimer(it); else wireReps(it, ex, mainFig);
}

function repsBlock(it) {
  return `
  <div class="card center stack" id="repcard">
    <div class="target">${it.target} <span class="small muted" style="font-size:18px">חזרות</span></div>
    <button class="btn primary" id="countme">🔢 ספור איתי</button>
    <p class="muted small" id="rephint">עושים יחד עם הדמות והמספר עולה לבד. או פשוט מסמנים כמה עשית:</p>
    <div class="stepper">
      <button class="btn icon" id="minus" aria-label="פחות">−</button>
      <div class="n" id="count">${it.done || it.target}</div>
      <button class="btn icon" id="plus" aria-label="יותר">+</button>
    </div>
    <button class="btn ok big" id="did">עשיתי! ✅</button>
  </div>`;
}
function wireReps(it, ex, mainFig) {
  let n = it.done || it.target, counting = false;
  const show = () => { $('#count').textContent = n; };
  const stopCount = () => { clearInterval(tick); tick = 0; counting = false; $('#repcard').classList.remove('counting'); $('#countme').textContent = '🔢 ספור איתי'; };
  $('#countme').onclick = () => {
    if (counting) return stopCount();
    counting = true; n = 0; show();
    mainFig.play(ex, 1); // מתחילים את הסרטון מההתחלה כדי שהספירה תתאים לתנועה
    $('#repcard').classList.add('counting'); $('#countme').textContent = '⏹️ עצור ספירה';
    tick = setInterval(() => {
      n++; show();
      if (n >= it.target) { stopCount(); fanfare(); $('#did').classList.add('pop'); }
      else beep(780, 70);
    }, cycleMs(ex.frames));
  };
  $('#minus').onclick = () => { if (counting) stopCount(); n = Math.max(0, n - 1); show(); };
  $('#plus').onclick = () => { if (counting) stopCount(); n++; show(); };
  $('#did').onclick = () => { stopCount(); finishItem(n, false); };
}

function timeBlock(it) {
  const r = 84, c = 2 * Math.PI * r;
  return `
  <div class="card center stack">
    <div class="ring">
      <svg viewBox="0 0 200 200"><circle class="track" cx="100" cy="100" r="${r}"/><circle class="fill" id="ringfill" cx="100" cy="100" r="${r}" stroke-dasharray="${c}" stroke-dashoffset="0"/></svg>
      <div class="t" id="clock">${fmtTime(it.target)}</div>
    </div>
    <button class="btn primary big" id="startstop">▶️ התחל</button>
    <button class="btn ghost" id="early">סיימתי מוקדם</button>
  </div>`;
}
function wireTimer(it) {
  const c = 2 * Math.PI * 84;
  const T = { left: it.target, running: false, endAt: 0 };
  const paint = () => {
    $('#clock').textContent = fmtTime(Math.ceil(T.left));
    $('#ringfill').style.strokeDashoffset = c * (1 - T.left / it.target);
  };
  const stop = () => { clearInterval(tick); tick = 0; T.running = false; $('#startstop').textContent = '▶️ המשך'; };
  const run = () => {
    T.running = true; T.endAt = Date.now() + T.left * 1000; $('#startstop').textContent = '⏸️ עצור';
    tick = setInterval(() => {
      const prev = T.left; T.left = Math.max(0, (T.endAt - Date.now()) / 1000); paint();
      if (Math.ceil(T.left) <= 3 && Math.ceil(prev) > Math.ceil(T.left) && T.left > 0) beep(660, 90);
      if (T.left <= 0) { stop(); fanfare(); finishItem(it.target, false); }
    }, 200);
  };
  $('#startstop').onclick = () => T.running ? stop() : run();
  $('#early').onclick = () => { stop(); finishItem(Math.round(it.target - T.left), false); };
  paint();
}

function finishItem(done, skipped) {
  const it = W.items[W.idx];
  it.done = done; it.skipped = skipped;
  clearInterval(tick); tick = 0;
  if (!skipped && done > 0) beep(990, 120);
  const last = W.idx >= W.items.length - 1;
  let nextPhase = 'done';
  if (!last) {
    const next = W.items[W.idx + 1];
    // מנוחה רק בתוך בלוק האימון עצמו; בחימום ובמתיחות ממשיכים ישר
    nextPhase = skipped || !store.profile.rest || it.block !== 'האימון' || next.block !== 'האימון' ? 'exercise' : 'rest';
  }
  // מתנה: משחק קצר על כל תרגיל שהושלם באימון (לפי ההגדרה: כל תרגיל, כל שני, כל שלישי)
  const every = store.profile.giftEvery;
  const gift = !skipped && done > 0 && it.block === 'האימון' && every && (++W.mainDone % every === 0);
  if (!last) W.idx++;
  if (gift) { store.addToken(); W.gift = pickGift(store.games.played, store.games.recent); W.afterGift = nextPhase; W.phase = 'gift'; }
  else W.phase = nextPhase;
  workoutScreen();
}

function giftPhase() {
  const g = W.gift, secs = store.profile.gameSeconds || 90;
  fanfare();
  mount(`
  <div class="stack">
    <section class="gift pop">
      <div class="e">🎁</div>
      <h1>מתנה!</h1>
      <p>סיימת תרגיל. קיבלת משחק של ${fmtTime(secs)} דקות:</p>
    </section>
    <div class="card gcard">
      <div class="e">${g.emoji}</div>
      <div><h3>${esc(g.name)}</h3><p class="muted small">${esc(g.how)}</p></div>
      <span class="pill solid">${GAME_GROUPS.find(x => x.id === g.group).name}</span>
    </div>
    <button class="btn primary big" id="playnow">לשחק עכשיו 🎮</button>
    <button class="btn ghost big" id="later">לשמור לאחר כך וממשיכים ⏭️</button>
    <p class="muted small center">יש לך ${store.tokens} ${store.tokens === 1 ? 'מתנה שמורה' : 'מתנות שמורות'}. משחקים מהחדר משחקים בכל זמן.</p>
  </div>`, true);
  const cont = () => { W.phase = W.afterGift; W.gift = null; workoutScreen(); };
  $('#later').onclick = cont;
  $('#playnow').onclick = () => { W.gamesPlayed++; playGame(g, cont); };
}

// מריץ משחק במסך מלא ומחזיר לפונקציית ההמשך
function playGame(g, onDone) {
  mount('', true);
  const secs = store.profile.gameSeconds || 90;
  activeGame = runGame(g, { seconds: secs, host: app, best: store.games.bests[g.id] || 0, onEnd({ score }) { store.recordGame(g.id, score); activeGame = null; onDone(score); } });
}

function restPhase() {
  const next = W.items[W.idx], ex = byId[next.exId];
  let left = store.profile.rest || 15;
  mount(`
  <div class="stack">
    <div class="rest stack">
      <h2>מנוחה קטנה 😮‍💨</h2>
      <div class="big" id="clock">${left}</div>
      <p>לנשום עמוק ולשתות מים</p>
    </div>
    <div class="card row">
      ${figSvg(ex.id, 'mini')}
      <div class="grow"><span class="muted small">הבא בתור</span><h3>${esc(ex.name)}</h3></div>
      <span class="pill solid">${targetText(next)}</span>
    </div>
    <button class="btn primary big" id="skiprest">מוכן, ממשיכים! ⏭️</button>
  </div>`, true);
  figs();
  const done = () => { clearInterval(tick); tick = 0; W.phase = 'exercise'; workoutScreen(); };
  $('#skiprest').onclick = done;
  tick = setInterval(() => { left--; if (left <= 3 && left > 0) beep(660, 90); if (left <= 0) { beep(990, 200); return done(); } $('#clock').textContent = left; }, 1000);
}

function saveSession() {
  if (W.saved) return null;
  const s = { id: uid(), date: new Date().toISOString(), programId: W.program.id, programName: W.program.name, emoji: W.program.emoji,
    duration: Math.round((Date.now() - W.startedAt) / 1000), items: W.items.map(i => ({ exId: i.exId, name: i.name, type: i.type, target: i.target, done: i.done, round: i.round, block: i.block })) };
  const before = earned(stats(store.sessions));
  store.addSession(s); W.saved = true;
  // לטלפון של אבא: אם יש קוד משפחה, האימון עולה לענן (או מחכה בתור עד שיש רשת)
  if (store.profile.familyCode) cloud.push(store.profile.familyCode, 'workout', s.id, { ...s, name: store.profile.name, gamesPlayed: W.gamesPlayed, level: store.profile.level });
  const after = earned(stats(store.sessions));
  return { session: s, newBadges: after.filter(b => !before.includes(b)) };
}

function donePhase() {
  const res = saveSession();
  const s = res ? res.session : store.sessions.at(-1);
  const sum = summarize(s);
  const newBadges = res ? res.newBadges : [];
  if (res && sum.stars) { fanfare(); confetti(); }
  const st = stats(store.sessions);
  const cheer = sum.stars === 3 ? 'מושלם! עשית את כל האימון עד הסוף!' : sum.stars === 2 ? 'כל הכבוד! רוב האימון בכיס.' : sum.stars === 1 ? 'התחלה טובה. בפעם הבאה עוד קצת!' : 'לא נורא, בפעם הבאה מנסים שוב.';
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const nextId = todayProgram(plan(), tomorrow), nextP = nextId && programById[nextId];
  mount(`
  <div class="stack">
    <section class="hero center pop">
      <div class="stars">${'★'.repeat(sum.stars)}<span class="off">${'★'.repeat(3 - sum.stars)}</span></div>
      <h1>סיימת! ${W.program.emoji}</h1>
      <p class="muted">${cheer}</p>
    </section>
    <div class="tiles">
      <div class="tile"><b>${fmtTime(sum.duration)}</b>זמן אימון</div>
      <div class="tile"><b>${sum.doneCount} <span class="muted" style="font-size:16px">מתוך</span> ${sum.total}</b>תרגילים</div>
      ${sum.reps ? `<div class="tile hot"><b>${sum.reps}</b>חזרות</div>` : ''}
      ${sum.seconds ? `<div class="tile hot"><b>${sum.seconds}</b>שניות עבודה</div>` : ''}
      <div class="tile"><b>🔥 ${st.streak}</b>ימים ברצף</div>
      <div class="tile next"><b>${nextP ? nextP.emoji + ' ' + esc(nextP.name.split(':')[0]) : '😴 מנוחה'}</b>מחר</div>
      ${store.tokens ? `<div class="tile" data-go="#/arcade"><b>🎁 ${store.tokens}</b>מתנות לשחק</div>` : ''}
    </div>
    ${newBadges.length ? `<h2>תג חדש! 🎉</h2><div class="badges">${newBadges.map(id => { const b = BADGES.find(x => x.id === id); return `<div class="badge pop"><span class="e">${b.emoji}</span><b>${b.name}</b><br>${b.desc}</div>`; }).join('')}</div>` : ''}
    <div class="card list">${itemsList(s)}</div>
    <button class="btn primary big" data-go="#/home">לדף הבית 🏠</button>
    <button class="btn ghost big" data-go="#/history">לראות את המעקב 📈</button>
  </div>`, false);
  W = null;
}
const itemsList = s => s.items.map(i => `<div class="item">
  <span class="grow">${esc(i.name)}${i.round > 1 ? ` <span class="muted small">(סבב ${i.round})</span>` : ''}</span>
  ${i.done >= i.target ? `<span class="done">✓ ${targetText({ type: i.type, target: i.done })}</span>` : i.done > 0 ? `<span class="part">${i.done} מתוך ${i.target}</span>` : `<span class="skip">דילוג</span>`}
</div>`).join('');

function quit() {
  const did = W.items.some(i => i.done > 0);
  if (!confirm(did ? 'לצאת מהאימון? מה שכבר סימנת יישמר.' : 'לצאת מהאימון?')) return;
  clearInterval(tick); tick = 0;
  if (did) saveSession();
  W = null; go('#/home');
}

// ---- מעקב ----
function history() {
  const st = stats(store.sessions);
  const badges = earned(st);
  const todayKey = st.week.at(-1).key;
  const max = Math.max(1, ...st.week.map(d => d.minutes));
  const sessions = [...store.sessions].reverse();
  mount(`
  <div class="stack">
    <h1>המעקב שלי 📈</h1>
    <div class="tiles">
      <div class="tile hot"><b>🔥 ${st.streak}</b>ימים ברצף</div>
      <div class="tile"><b>${st.thisWeek}</b>אימונים השבוע</div>
      <div class="tile"><b>${st.workouts}</b>אימונים בסך הכול</div>
      <div class="tile"><b>${st.totalReps}</b>חזרות בסך הכול</div>
    </div>
    <div class="card">
      <h3>7 הימים האחרונים <span class="muted small">(דקות אימון)</span></h3>
      <div class="week" style="margin-top:8px">${st.week.map(d => `<div class="d ${d.count ? 'on' : ''} ${d.key === todayKey ? 'today' : ''}"><i style="height:${Math.max(6, 90 * d.minutes / max)}px"></i><span>${['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'][d.date.getDay()]}</span></div>`).join('')}</div>
    </div>
    <h2>תגים</h2>
    <div class="badges">${BADGES.map(b => `<div class="badge ${badges.includes(b.id) ? '' : 'off'}"><span class="e">${b.emoji}</span><b>${b.name}</b><br>${b.desc}</div>`).join('')}</div>
    ${Object.keys(st.perExercise).length ? `<h2>שיאים</h2><div class="card list">${Object.values(st.perExercise).sort((a, b) => b.times - a.times).map(p => `<div class="item"><span class="grow">${esc(p.name)}</span><span class="muted small">${p.times} פעמים</span><span class="pill solid">שיא ${p.best}${p.type === 'time' ? ' שנ\'' : ''}</span></div>`).join('')}</div>` : ''}
    <h2>האימונים</h2>
    ${sessions.length ? sessions.map(s => { const sum = summarize(s); return `
      <div class="card" data-sess="${s.id}">
        <div class="row between tap" data-toggle="${s.id}">
          <div><b>${s.emoji || '🏋️'} ${esc(s.programName)}</b><div class="muted small">${fmtDate(s.date)} · ${fmtTime(sum.duration)} · ${sum.doneCount} מתוך ${sum.total} תרגילים</div></div>
          <span style="color:var(--star);font-size:22px">${'★'.repeat(sum.stars)}</span>
        </div>
        <div class="list" id="d-${s.id}" hidden style="margin-top:10px">${itemsList(s)}<div class="item"><button class="btn chip danger" data-del="${s.id}">מחיקת האימון</button></div></div>
      </div>`; }).join('') : '<div class="card center muted">עוד אין אימונים. הראשון מחכה לך בדף הבית!</div>'}
  </div>`);
  app.querySelectorAll('[data-toggle]').forEach(r => r.onclick = () => { const d = $('#d-' + r.dataset.toggle); d.hidden = !d.hidden; });
  app.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { if (confirm('למחוק את האימון הזה מהמעקב? אי אפשר לשחזר.')) { store.removeSession(b.dataset.del); history(); } });
}

// ---- חדר משחקים ----
function arcade() {
  const gs = store.games;
  mount(`
  <div class="stack">
    <div class="row between wrap"><h1>חדר משחקים 🎮</h1><span class="tokens">🎁 ${store.tokens} ${store.tokens === 1 ? 'מתנה' : 'מתנות'}</span></div>
    <p class="muted">${store.tokens ? 'בוחרים משחק. כל משחק עולה מתנה אחת ונמשך ' + fmtTime(store.profile.gameSeconds || 90) + ' דקות.' : 'כדי לשחק צריך מתנה. כל תרגיל שמסיימים באימון נותן אחת!'}</p>
    ${!store.tokens ? '<button class="btn primary big" data-go="#/home">לאימון של היום 🚀</button>' : ''}
    <div class="tiles"><div class="tile"><b>${gs.count}</b>משחקים ששיחקת</div><div class="tile"><b>${Object.keys(gs.played).length} <span class="muted" style="font-size:16px">מתוך</span> ${GAMES.length}</b>משחקים שגילית</div></div>
    ${GAME_GROUPS.map(gr => `
      <h2>${gr.emoji} ${gr.name}</h2>
      ${gr.games.map(g => `
        <div class="card tap gcard ${store.tokens ? '' : 'pick'}" data-game="${g.id}">
          <div class="e">${g.emoji}</div>
          <div><b>${esc(g.name)}</b>${gs.played[g.id] ? '' : ' <span class="pill solid" style="font-size:12px;padding:1px 8px">חדש</span>'}<div class="best">${gs.played[g.id] ? `שיא: ${gs.bests[g.id] || 0} · שיחקת ${gs.played[g.id]} ${gs.played[g.id] === 1 ? 'פעם' : 'פעמים'}` : esc(g.how)}</div></div>
          <span class="pill solid">▶️</span>
        </div>`).join('')}`).join('')}
  </div>`);
  app.querySelectorAll('[data-game]').forEach(c => c.onclick = () => {
    if (!store.tokens) { c.classList.add('shake'); setTimeout(() => c.classList.remove('shake'), 500); return; }
    playGame(gameById[c.dataset.game], () => arcade());
  });
}

// ---- הגדרות ----
function settings() {
  const p = store.profile, pl = plan();
  mount(`
  <div class="stack">
    <h1>הגדרות ⚙️</h1>
    <div class="card stack">
      <label class="field">איך קוראים לך?<input type="text" id="name" value="${esc(p.name)}" placeholder="השם שלך" maxlength="20"></label>
      <label class="field">רמה<select id="level">${Object.entries(LEVELS).map(([k, v]) => `<option value="${k}" ${k === p.level ? 'selected' : ''}>${v.name} (${Math.round(v.mult * 100)}% מהכמות)</option>`).join('')}</select></label>
      <label class="field">מנוחה בין תרגילים (שניות)<select id="rest">${[0, 10, 15, 20, 30, 45].map(n => `<option value="${n}" ${n === p.rest ? 'selected' : ''}>${n ? n : 'בלי מנוחה'}</option>`).join('')}</select></label>
      <div class="toggle"><b>צלילים</b><input type="checkbox" id="sound" ${p.sound ? 'checked' : ''}></div>
      <div class="toggle"><b>הסבר בקול בעברית</b><input type="checkbox" id="voice" ${p.voice !== false ? 'checked' : ''}></div>
      <button class="btn chip" id="voicetest">🔊 בדיקת קול</button>
      <p class="muted small">הקול הוא של המכשיר. ${canSpeak() ? (hebrewVoice() ? 'נמצא קול עברי במכשיר.' : 'לא נמצא קול עברי. באנדרואיד: הגדרות, שפה, המרת טקסט לדיבור, להוריד עברית. באייפון: הגדרות, נגישות, תוכן מדובר, קולות, עברית.') : 'המכשיר לא תומך בהקראה.'}</p>
    </div>
    <div class="card stack">
      <h3>מתנות ומשחקים 🎁</h3>
      <label class="field">מתנה (משחק קצר) אחרי<select id="giftEvery">${[[1, 'כל תרגיל שמסיימים'], [2, 'כל שני תרגילים'], [3, 'כל שלושה תרגילים'], [0, 'בלי מתנות']].map(([v, n]) => `<option value="${v}" ${v === p.giftEvery ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="field">אורך משחק<select id="gameSeconds">${[[60, 'דקה'], [90, 'דקה וחצי'], [120, 'שתי דקות']].map(([v, n]) => `<option value="${v}" ${v === p.gameSeconds ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <p class="muted small">${GAMES.length} משחקים שונים. מתנות שלא משחקים מיד נשמרות לחדר המשחקים (${store.tokens} שמורות).</p>
    </div>
    <div class="card stack">
      <h3>התוכנית השבועית</h3>
      <p class="muted small">מה עושים בכל יום. ההמלצה: 3 אימוני ניתור, כוח רגליים, כוח עליון, בטן, ויום מנוחה.</p>
      ${DAY_NAMES.map((d, i) => `<label class="field row between" style="grid-template-columns:none"><span style="min-width:64px">${d}</span><select data-day="${i}" class="grow"><option value="" ${!pl[i] ? 'selected' : ''}>😴 מנוחה</option>${PROGRAMS.map(pr => `<option value="${pr.id}" ${pl[i] === pr.id ? 'selected' : ''}>${pr.emoji} ${esc(pr.name)}</option>`).join('')}</select></label>`).join('')}
      <button class="btn chip" id="resetplan">חזרה לתוכנית המומלצת</button>
    </div>
    <div class="card stack">
      <h3>חיבור לטלפון של אבא 📡</h3>
      <p class="muted small">כל אימון שנגמר בטלפון הזה עולה לענן, ואבא רואה אותו במצב הורים בטלפון שלו. צריך אותו קוד משפחה בשני הטלפונים.</p>
      <label class="field">קוד משפחה<input type="text" id="fam" value="${esc(p.familyCode)}" class="ltr-input" maxlength="12" autocomplete="off" placeholder="8 תווים"></label>
      <div class="row wrap"><button class="btn chip" id="newfam">🎲 ליצור קוד חדש</button><button class="btn chip" id="copyfam">📋 להעתיק</button><button class="btn chip" id="syncnow">🔄 לשלוח עכשיו</button></div>
      <p class="muted small" id="cloudstate">${p.familyCode ? (cloud.status.pending() ? `${cloud.status.pending()} אימונים מחכים לשליחה` : 'מחובר') : 'לא מחובר'}${cloud.status.error ? ` · ⚠️ ${esc(cloud.status.error)}` : ''}</p>
    </div>
    <div class="card stack">
      <h3>מצב הורים 🔒</h3>
      <p class="muted small">לאבא בלבד, עם קוד סודי: מה הילד עשה ויומן הכדורסל.</p>
      <button class="btn" data-go="#/parent">להיכנס למצב הורים</button>
    </div>
    <div class="card stack">
      <h3>הנתונים</h3>
      <p class="muted small">הכול נשמר במכשיר הזה בלבד. ${store.sessions.length} אימונים שמורים.</p>
      <button class="btn" id="export">הורדת גיבוי 💾</button>
      <button class="btn danger" id="wipe">מחיקת כל הנתונים</button>
    </div>
    <p class="muted small center">האפליקציה עובדת גם בלי אינטרנט. כדאי להוסיף למסך הבית.</p>
  </div>`);
  $('#name').oninput = e => store.setProfile({ name: e.target.value });
  $('#level').onchange = e => store.setProfile({ level: e.target.value });
  $('#rest').onchange = e => store.setProfile({ rest: +e.target.value });
  $('#sound').onchange = e => store.setProfile({ sound: e.target.checked });
  $('#voice').onchange = e => store.setProfile({ voice: e.target.checked });
  $('#voicetest').onclick = () => { if (!speak('היי! אני אסביר לך איך עושים כל תרגיל. לוחצים על הכפתור איך עושים את זה.')) alert('אין הקראה במכשיר הזה, או שהקול כבוי בהגדרות.'); };
  $('#giftEvery').onchange = e => store.setProfile({ giftEvery: +e.target.value });
  $('#fam').oninput = e => { const v = cloud.normCode(e.target.value); store.setProfile({ familyCode: v }); };
  $('#newfam').onclick = () => { if (p.familyCode && !confirm('ליצור קוד חדש? צריך להקליד אותו גם בטלפון של אבא.')) return; const c = cloud.newFamilyCode(); store.setProfile({ familyCode: c }); settings(); };
  $('#copyfam').onclick = async () => { try { await navigator.clipboard.writeText(store.profile.familyCode); $('#cloudstate').textContent = 'הקוד הועתק'; } catch { $('#fam').select(); } };
  $('#syncnow').onclick = async () => { $('#cloudstate').textContent = 'שולח...'; const ok = await cloud.flush(); $('#cloudstate').textContent = ok || !cloud.status.pending() ? 'הכול בענן ✓' : '⚠️ ' + (cloud.status.error || 'אין רשת'); };
  $('#gameSeconds').onchange = e => store.setProfile({ gameSeconds: +e.target.value });
  app.querySelectorAll('[data-day]').forEach(s => s.onchange = () => { const np = { ...plan() }; np[s.dataset.day] = s.value; store.setProfile({ plan: np }); });
  $('#resetplan').onclick = () => { store.setProfile({ plan: null }); settings(); };
  $('#export').onclick = () => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([store.export()], { type: 'application/json' }));
    a.download = `workouts-${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  $('#wipe').onclick = () => { if (confirm('למחוק את כל האימונים וההגדרות? אי אפשר לשחזר.') && confirm('בטוח? זו מחיקה סופית.')) { store.wipe(); settings(); } };
}

initParent({ mount, esc, go, $ });
if (store.profile.familyCode) cloud.flush();
window.addEventListener('focus', () => { if (store.profile.familyCode) cloud.flush(); });

// ---- כללי: כל אלמנט עם data-go מנווט ----
app.addEventListener('click', e => { const t = e.target.closest('[data-go]'); if (t && app.contains(t)) go(t.dataset.go); });
window.addEventListener('beforeunload', e => { if (W && W.items.some(i => i.done > 0)) { e.preventDefault(); e.returnValue = ''; } });

route();
