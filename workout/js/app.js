// האפליקציה: ניתוב, מסכים, מהלך אימון (תרגיל -> מנוחה -> תרגיל -> סיכום), היסטוריה והגדרות.
import { EXERCISES, CATS, byId } from './exercises.js';
import { PROGRAMS, programById } from './programs.js';
import { Figure } from './figure.js';
import { store } from './store.js';
import { LEVELS, buildItems, summarize, stats, earned, BADGES, fmtTime, fmtDate, uid, scaleTarget } from './logic.js';

const $ = s => document.querySelector(s);
const app = $('#app'), nav = $('#nav');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const go = h => { location.hash = h; };

let figures = [];
function mount(html, full = false) {
  figures.forEach(f => f.stop()); figures = [];
  clearInterval(tick); tick = 0;
  app.innerHTML = html; app.classList.toggle('full', full);
  nav.classList.toggle('hidden', full);
  window.scrollTo(0, 0);
}
function fig(svg, ex, speed = 1) { const f = new Figure(svg); f.play(ex.frames, speed); figures.push(f); return f; }
function figs(sel = 'svg[data-ex]') { app.querySelectorAll(sel).forEach(s => fig(s, byId[s.dataset.ex])); }
const figSvg = (exId, cls = '') => `<svg class="figure ${cls}" data-ex="${exId}" aria-hidden="true"></svg>`;

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
const routes = { '': home, home, exercises: exercisesScreen, exercise: exerciseDetail, history, settings, free, start, workout: workoutScreen };
function route() {
  const [path, arg] = location.hash.replace(/^#\/?/, '').split('/');
  (routes[path] || home)(arg);
  renderNav(path);
}
function renderNav(path) {
  const tabs = [['home', '🏠', 'בית'], ['exercises', '🤸', 'תרגילים'], ['history', '📈', 'מעקב'], ['settings', '⚙️', 'הגדרות']];
  nav.innerHTML = tabs.map(([k, i, n]) => `<a href="#/${k}" class="${(path || 'home') === k ? 'on' : ''}"><span class="i">${i}</span>${n}</a>`).join('');
}
window.addEventListener('hashchange', route);

const name = () => store.profile.name.trim();
const hi = () => name() ? `היי, ${esc(name())}!` : 'היי, אלוף!';

// ---- בית ----
function home() {
  const st = stats(store.sessions);
  const today = st.week.at(-1).count;
  mount(`
  <div class="stack">
    <section class="hero">
      <div class="row between wrap">
        <h1>${hi()}</h1>
        <span class="pill">🔥 ${st.streak} ימים ברצף</span>
      </div>
      <p class="muted" style="margin-top:6px">${today ? `היום כבר עשית ${today === 1 ? 'אימון אחד' : today + ' אימונים'}. כל הכבוד! עוד אחד?` : 'עוד לא התאמנת היום. בוחרים אימון ויאללה!'}</p>
      <div class="row wrap" style="margin-top:12px">
        <span class="pill">🏋️ ${st.workouts} אימונים</span>
        <span class="pill">⭐ ${st.stars} כוכבים</span>
        <span class="pill">⏱️ ${Math.round(st.totalDuration / 60)} דקות</span>
      </div>
    </section>
    <h2>בוחרים אימון</h2>
    ${PROGRAMS.map(p => `
      <div class="card tap prog ${p.cat}" data-go="#/start/${p.id}">
        <div class="emoji">${p.emoji}</div>
        <div><h3>${esc(p.name)}</h3><p class="muted small">${esc(p.desc)}</p></div>
        <span class="pill solid">${p.minutes} דק'</span>
      </div>`).join('')}
    <div class="card tap prog strength" data-go="#/free">
      <div class="emoji">🎯</div>
      <div><h3>אימון חופשי</h3><p class="muted small">בוחר לבד את התרגילים ואת הכמות.</p></div>
      <span class="pill solid">אתה קובע</span>
    </div>
  </div>`);
}

// ---- תצוגה מקדימה והתחלה ----
function start(id) {
  const program = programById[id]; if (!program) return go('#/home');
  const level = store.profile.level;
  const items = buildItems(program, byId, level);
  mount(`
  <div class="stack">
    <div class="row between"><button class="btn icon ghost" data-go="#/home" aria-label="חזרה">→</button><h1 class="grow">${program.emoji} ${esc(program.name)}</h1></div>
    <p class="muted">${esc(program.desc)} בערך ${program.minutes} דקות, ${items.length} תרגילים.</p>
    <div class="card">
      <div class="row between wrap"><b>רמה</b><div class="row">${Object.entries(LEVELS).map(([k, v]) => `<button class="btn chip ${k === level ? 'on' : ''}" data-level="${k}">${v.name}</button>`).join('')}</div></div>
    </div>
    <div class="card list">
      ${items.map(i => `<div class="item">${figSvg(i.exId, 'mini')}<div class="grow"><b>${esc(i.name)}</b>${program.rounds > 1 ? `<span class="muted small"> · סבב ${i.round}</span>` : ''}</div><span class="pill solid">${targetText(i)}</span></div>`).join('')}
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
    <p class="muted">מסמנים את התרגילים שרוצים. אפשר לשנות את הכמות בזמן האימון.</p>
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
    <div class="row between"><button class="btn icon ghost" data-go="#/exercises" aria-label="חזרה">→</button><h1 class="grow">${esc(ex.name)}</h1><span class="pill ${ex.cat}">${CATS[ex.cat].name}</span></div>
    <div class="stage">${figSvg(ex.id)}</div>
    <div class="tip">💡 ${esc(ex.tip)}</div>
    <div class="row wrap"><button class="btn chip" data-speed="0.5">לאט</button><button class="btn chip on" data-speed="1">רגיל</button><button class="btn chip" data-speed="1.5">מהר</button></div>
    <div class="tiles">
      <div class="tile"><b>${target}</b>${ex.type === 'time' ? 'שניות ברמה שלך' : 'חזרות ברמה שלך'}</div>
      <div class="tile hot"><b>${p ? p.best : '–'}</b>השיא שלך</div>
      <div class="tile"><b>${p ? p.times : 0}</b>פעמים שעשית</div>
    </div>
    <button class="btn primary big" id="solo">לעשות עכשיו רק את זה 💥</button>
  </div>`);
  const f = fig(app.querySelector('svg[data-ex]'), ex);
  app.querySelectorAll('[data-speed]').forEach(b => b.onclick = () => { app.querySelectorAll('[data-speed]').forEach(x => x.classList.remove('on')); b.classList.add('on'); f.play(ex.frames, +b.dataset.speed); });
  $('#solo').onclick = () => {
    const program = { id: 'solo', name: ex.name, emoji: '💥', items: [ex.id], rounds: 1, minutes: 1 };
    beginWorkout(program, buildItems(program, byId, store.profile.level));
  };
}

// ---- מהלך האימון ----
let W = null, tick = 0;
function beginWorkout(program, items) {
  W = { program, items: items.map(i => ({ ...i, done: 0, skipped: false })), idx: 0, phase: 'exercise', startedAt: Date.now(), timer: null, saved: false };
  go('#/workout');
}

function workoutScreen() {
  if (!W) return go('#/home');
  if (W.phase === 'exercise') exercisePhase();
  else if (W.phase === 'rest') restPhase();
  else donePhase();
}

function exercisePhase() {
  const it = W.items[W.idx], ex = byId[it.exId];
  const rounds = W.program.rounds || 1;
  const pct = Math.round(100 * W.idx / W.items.length);
  mount(`
  <div class="stack">
    <div class="topbar">
      <button class="btn icon ghost" id="quit" aria-label="יציאה">✕</button>
      <div><div class="center small muted">${W.idx + 1} מתוך ${W.items.length} · ${esc(W.program.name)}</div><div class="bar"><i style="width:${pct}%"></i></div></div>
      <span></span>
    </div>
    <div class="stage">
      <span class="pill ${ex.cat} cat">${CATS[ex.cat].emoji} ${CATS[ex.cat].name}</span>
      ${rounds > 1 ? `<span class="pill solid rounds">סבב ${it.round}/${rounds}</span>` : ''}
      ${figSvg(ex.id)}
    </div>
    <h1 class="center">${esc(ex.name)}</h1>
    <div class="tip">💡 ${esc(ex.tip)}</div>
    ${it.type === 'time' ? timeBlock(it) : repsBlock(it)}
    <div class="row">
      <button class="btn ghost grow" id="skip">דילוג ⏭️</button>
      <button class="btn ghost" id="prev" ${W.idx ? '' : 'disabled'}>הקודם</button>
    </div>
  </div>`, true);
  figs();
  $('#quit').onclick = quit;
  $('#skip').onclick = () => finishItem(0, true);
  $('#prev').onclick = () => { if (W.idx) { W.idx--; W.phase = 'exercise'; workoutScreen(); } };
  if (it.type === 'time') wireTimer(it); else wireReps(it);
}

function repsBlock(it) {
  return `
  <div class="card center stack">
    <div class="target">${it.target} <span class="small muted" style="font-size:18px">חזרות</span></div>
    <p class="muted small">כמה עשית בפועל? (אפשר לשנות)</p>
    <div class="stepper">
      <button class="btn icon" id="minus" aria-label="פחות">−</button>
      <div class="n" id="count">${it.done || it.target}</div>
      <button class="btn icon" id="plus" aria-label="יותר">+</button>
    </div>
    <button class="btn ok big" id="did">עשיתי! ✅</button>
  </div>`;
}
function wireReps(it) {
  let n = it.done || it.target;
  const show = () => { $('#count').textContent = n; };
  $('#minus').onclick = () => { n = Math.max(0, n - 1); show(); };
  $('#plus').onclick = () => { n++; show(); };
  $('#did').onclick = () => finishItem(n, false);
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
  const T = W.timer = { left: it.target, running: false, endAt: 0 };
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
  if (W.idx >= W.items.length - 1) { W.phase = 'done'; return workoutScreen(); }
  W.idx++;
  W.phase = skipped || !store.profile.rest ? 'exercise' : 'rest';
  workoutScreen();
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
    duration: Math.round((Date.now() - W.startedAt) / 1000), items: W.items.map(i => ({ exId: i.exId, name: i.name, type: i.type, target: i.target, done: i.done, round: i.round })) };
  const before = earned(stats(store.sessions));
  store.addSession(s); W.saved = true;
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
    </div>
    ${newBadges.length ? `<h2>תג חדש! 🎉</h2><div class="badges">${newBadges.map(id => { const b = BADGES.find(x => x.id === id); return `<div class="badge pop"><span class="e">${b.emoji}</span><b>${b.name}</b><br>${b.desc}</div>`; }).join('')}</div>` : ''}
    <div class="card list">${itemsList(s)}</div>
    <div class="row">
      <button class="btn primary big" data-go="#/home">לדף הבית 🏠</button>
    </div>
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
          <div><b>${s.emoji || '🏋️'} ${esc(s.programName)}</b><div class="muted small">${fmtDate(s.date)} · ${fmtTime(sum.duration)} · ${sum.doneCount}/${sum.total} תרגילים</div></div>
          <span style="color:var(--star);font-size:22px">${'★'.repeat(sum.stars)}</span>
        </div>
        <div class="list" id="d-${s.id}" hidden style="margin-top:10px">${itemsList(s)}<div class="item"><button class="btn chip danger" data-del="${s.id}">מחיקת האימון</button></div></div>
      </div>`; }).join('') : '<div class="card center muted">עוד אין אימונים. הראשון מחכה לך בדף הבית!</div>'}
  </div>`);
  app.querySelectorAll('[data-toggle]').forEach(r => r.onclick = () => { const d = $('#d-' + r.dataset.toggle); d.hidden = !d.hidden; });
  app.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { if (confirm('למחוק את האימון הזה מהמעקב? אי אפשר לשחזר.')) { store.removeSession(b.dataset.del); history(); } });
}

// ---- הגדרות ----
function settings() {
  const p = store.profile;
  mount(`
  <div class="stack">
    <h1>הגדרות ⚙️</h1>
    <div class="card stack">
      <label class="field">איך קוראים לך?<input type="text" id="name" value="${esc(p.name)}" placeholder="השם שלך" maxlength="20"></label>
      <label class="field">רמה<select id="level">${Object.entries(LEVELS).map(([k, v]) => `<option value="${k}" ${k === p.level ? 'selected' : ''}>${v.name} (${Math.round(v.mult * 100)}% מהכמות)</option>`).join('')}</select></label>
      <label class="field">מנוחה בין תרגילים (שניות)<select id="rest">${[0, 10, 15, 20, 30, 45].map(n => `<option value="${n}" ${n === p.rest ? 'selected' : ''}>${n ? n : 'בלי מנוחה'}</option>`).join('')}</select></label>
      <div class="toggle"><b>צלילים</b><input type="checkbox" id="sound" ${p.sound ? 'checked' : ''}></div>
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
  $('#export').onclick = () => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([store.export()], { type: 'application/json' }));
    a.download = `workouts-${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  $('#wipe').onclick = () => { if (confirm('למחוק את כל האימונים וההגדרות? אי אפשר לשחזר.') && confirm('בטוח? זו מחיקה סופית.')) { store.wipe(); settings(); } };
}

// ---- כללי: כל אלמנט עם data-go מנווט ----
app.addEventListener('click', e => { const t = e.target.closest('[data-go]'); if (t && app.contains(t)) go(t.dataset.go); });
window.addEventListener('beforeunload', e => { if (W && W.items.some(i => i.done > 0)) { e.preventDefault(); e.returnValue = ''; } });

route();
