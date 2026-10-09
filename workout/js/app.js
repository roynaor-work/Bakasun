// האפליקציה: ניתוב, מסכים, מהלך אימון (חימום -> תרגילים -> מנוחות -> מתיחות -> סיכום), מעקב והגדרות.
import { EXERCISES, CATS, byId } from './exercises.js?v=20261009-companion-1';
import { PROGRAMS, programById, DEFAULT_PLAN, DAY_NAMES } from './programs.js?v=20261009-companion-1';
import { numWord, timeCue, parseCount, canListen, listenCount } from './count.js?v=20261009-companion-1';
import { refreshVideos, refreshCloud, cloudUpload, cloudDelete, cloudVideos, sourceOf, hasVideo, localVideos, saveVideo, deleteVideo, videoUrl, vidStatus } from './vids.js?v=20261009-companion-1';
import { Figure, cycleMs } from './figure.js?v=20261009-companion-1';
import { store } from './store.js?v=20261009-companion-1';
import { LEVELS, buildItems, summarize, stats, BADGES, fmtTime, fmtDate, uid, scaleTarget, todayProgram, weekDays, suggestLevel, boostText, MAX_BOOST, MAX_SWAPS, isWorkBlock, START_GAMES, PICKS, unlockCredits, nextUnlockIn, perseveranceLine, honestTime, tokensFor } from './logic.js?v=20261009-companion-1';
import { beltCard } from './belts.js?v=20261009-companion-1';
import { companionCard, companionKit } from './companion.js?v=20261009-companion-1';
import { restProgress, restCard, restBadges } from './rest-days.js?v=20261009-companion-1';
import { FRAGMENTS } from './voice-lines.js?v=20261009-companion-1';
import { GAMES, GAME_GROUPS, gameById, pickGift } from './games/index.js?v=20261009-companion-1';
import { runGame } from './games/engine.js?v=20261009-companion-1';
import * as cloud from './cloud.js?v=20261009-companion-1';
import { showLobby } from './games/lobby.js?v=20261009-companion-1';
import { initParent, parentGate, parentHome, parentTogether, parentWeek, lockParent, basketball } from './parent.js?v=20261009-companion-1';
import { normalizePlan } from './weekly.js?v=20261009-companion-1';
import { togetherChoice, buildTogetherWorkout, togetherLabel } from './together.js?v=20261009-companion-1';
import { playIntro } from './intro.js?v=20261009-companion-1';
import { speak, speakLang, sayQuick, spokeRecently, stopSpeak, playVoiceRecording, canSpeak, hebrewVoices, bestVoice, SAY_UI } from './speech.js?v=20261009-companion-1';
import { SAY } from './say.js?v=20261009-companion-1';
import { startMinuteTest, advanceMinuteTest, changeMinuteCount, cancelMinuteTest, minuteResult, recordMinuteTest, loadMinuteRecords, saveMinuteRecords } from './minute-test.js?v=20261009-companion-1';

const $ = s => document.querySelector(s);
const app = $('#app'), nav = $('#nav');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const go = h => { location.hash = h; };
const plan = () => normalizePlan(store.profile.plan, programById, DEFAULT_PLAN);
// משחקים פתוחים: null = הכול פתוח (הגדרה 'הכול פתוח'); אחרת רשימה שמתחילה בחמישה
const unlockedList = () => { if (!store.profile.unlockEvery) return null; if (!store.unlocked) store.setUnlocked([...START_GAMES]); return store.unlocked; };
const credits = () => unlockCredits(store.sessions.length, (unlockedList() || GAMES.map(g => g.id)).length, store.profile.unlockEvery);

let figures = [], activeGame = null;
function mount(html, full = false) {
  figures.forEach(f => { f.stop(); if (f.dispose) f.dispose(); }); figures = []; /* dispose: הבמה התלת-ממדית משחררת את ה-WebGL */
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
// הבמה במסך התרגיל: סרטון אמיתי אם יש לתרגיל (vids.js), אחרת דמות המקלות. wireStage מחזיר אובייקט עם אותו ממשק: play(ex, speed), stop, onRep
const webgl = () => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } };
const use3d = () => store.profile.stage3d !== false && webgl();
const stageHtml = ex => hasVideo(ex.id) ? `<div class="exmedia" data-vid="${ex.id}"></div>` : use3d() ? `<div class="exmedia stage3d" data-ex3d="${ex.id}"></div>` : figSvg(ex.id);
// אותה דמות מוכרת, בפוזה שקטה. כשל ב-WebGL משאיר דמות ותג אימונים ב-SVG.
function wireCompanion(workouts) {
  const box = app.querySelector('[data-companion-portrait]'); if (!box) return;
  const standing = { frames: [[byId['jumping-jacks'].frames[0][0], 1000]], view3d: 'front' };
  const fallback = () => {
    if (!box.isConnected) return;
    box.innerHTML = `<svg class="figure companion-fallback"></svg>${workouts ? `<span class="companion-patch">${workouts}</span>` : ''}`;
    const figure = new Figure(box.querySelector('svg')); figure.still(standing); figures.push(figure);
  };
  if (!use3d()) return fallback();
  import('./stage3d.js?v=20261009-companion-1').then(async ({ Stage3D }) => {
    const { KITS3D } = await import('./char3d.js?v=20261009-companion-1');
    if (!box.isConnected) return;
    let stage;
    const failed = () => { if (stage) stage.dispose(); fallback(); };
    try {
      stage = new Stage3D(box, null, { kit: companionKit(KITS3D.maccabi, workouts), onReady: s => { s.still(standing); box.dataset.companionReady = 'true'; }, onFail: failed });
      figures.push(stage);
    } catch { failed(); }
  }).catch(fallback);
}
// הדמות המצוירת בתלת-ממד (js/stage3d.js, נטען רק כשצריך כי הוא מביא את three.js). עד שהמודול נטען הפקודות נשמרות; אם נכשל, דמות המקלות
function wireStage3d(box) {
  const ex = byId[box.dataset.ex3d];
  const f = { _s: null, _rep: null, _last: null, get onRep() { return this._rep; }, set onRep(fn) { this._rep = fn; if (this._s) this._s.onRep = fn; },
    play(e, speed = 1) { this._last = ['play', e, speed]; if (this._s) this._s.play(e, speed); }, still(e) { this._last = ['still', e]; if (this._s) this._s.still(e); },
    stop() { if (this._s) this._s.stop(); }, dispose() { if (this._s && this._s.dispose) this._s.dispose(); this._s = null; },
    _attach(s) { this._s = s; s.onRep = this._rep; if (this._last) { const [k, e, sp] = this._last; k === 'play' ? s.play(e, sp) : s.still(e); } } };
  const fallback = () => { if (!box.isConnected) return; box.outerHTML = figSvg(ex.id); const svg = app.querySelector(`svg[data-ex="${ex.id}"]`); if (svg) f._attach(new Figure(svg)); };
  import('./stage3d.js?v=20261009-companion-1').then(m => { if (!box.isConnected) return; new m.Stage3D(box, null, { onReady: s => f._attach(s), onFail: fallback }); }).catch(fallback);
  f.play(ex, 1); figures.push(f); return f;
}
function wireStage() {
  const box3 = app.querySelector('.exmedia[data-ex3d]'); if (box3) return wireStage3d(box3);
  const box = app.querySelector('.exmedia[data-vid]');
  if (!box) return figs()[0];
  let v = null;
  videoUrl(box.dataset.vid, store.profile.familyCode).then(m => { if (!m) return; if (m.kind === 'image') { box.innerHTML = `<img class="exvid" src="${m.url}" alt="">`; return; } v = document.createElement('video'); v.className = 'exvid'; v.autoplay = true; v.muted = true; v.loop = true; v.playsInline = true; v.src = m.url; box.appendChild(v); v.playbackRate = f.rate; });
  // בסרטון אין "סיבוב" של הדמות, אז הספירה לפי אורך המחזור מהקטלוג (cycleMs) בקצב הניגון
  const f = { onRep: null, tick: 0, cyc: 0, rate: 1, play(ex, speed = 1) { this.rate = speed; if (v) v.playbackRate = speed; this.stop(); if (this.onRep) { this.cyc = 0; this.tick = setInterval(() => { this.cyc++; this.onRep && this.onRep(this.cyc); }, cycleMs(ex.frames) / speed); } }, still() { this.stop(); }, stop() { clearInterval(this.tick); this.tick = 0; } };
  figures.push(f); return f;
}
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
    mainFig && mainFig.play(ex, 0.75); /* הסבר: לאט אבל לא זוחל (רועי 01/10: "החלק האיטי נראה ממש איטי"; הדמות המצוירת כבר ב-.7) */
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

const sayText = ex => SAY[ex.id] || ex.say || `${ex.name}. ${ex.steps.join('. ')}. שימו לב: ${ex.tip}`;
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
const routes = { '': home, home, exercises: exercisesScreen, exercise: exerciseDetail, minute: minuteScreen, history, settings, free, start, workout: workoutScreen, arcade, parent: parentHome, 'parent-together': parentTogether, 'parent-week': parentWeek, together, basketball };
function route() {
  const [path, arg] = location.hash.replace(/^#\/?/, '').split('/');
  if (!['parent', 'parent-together', 'parent-week', 'basketball'].includes(path)) lockParent();
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
  const rest = restProgress(store.sessions);
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
        <span class="pill">🔥 ${rest.days} ימי אימון ברצף</span>
      </div>
      <div class="row wrap" style="margin-top:8px"><span class="tokens" data-go="#/arcade">🎁 ${store.tokens} ${store.tokens === 1 ? 'מתנה' : 'מתנות'}</span></div>
      ${credits() ? `<div class="card row" style="margin-top:10px;border:2px solid var(--star)" data-go="#/arcade"><span style="font-size:30px">🔓</span><div class="grow"><b>פתחת ${credits()} משחקים חדשים!</b><p class="muted small">לחץ כדי לבחור אותם בחדר המשחקים.</p></div></div>` : ''}
      <p class="muted" style="margin-top:6px">יום ${DAY_NAMES[now.getDay()]}. ${todayCount ? `היום כבר עשית ${todayCount === 1 ? 'אימון' : todayCount + ' אימונים'}. כל הכבוד!` : today ? 'היום זה יום ' + esc(today.name.split(':')[0]) + '. יאללה!' : 'היום יום מנוחה. מגיע לך.'}</p>
    </section>

    ${beltCard(st.workouts)}

    <div class="card stack">
      <h2>אבא ואני 👨‍👦</h2>
      <p>זמן לזוז יחד. כל אחד בקצב שלו.</p>
      <button class="btn primary big" data-go="#/together">לפעילות עם אבא</button>
    </div>

    <div class="weekstrip">
      ${week.map(d => { const pid = plan()[d.day]; const p = pid && programById[pid]; return `<div class="wd ${d.today ? 'today' : ''} ${d.done ? 'done' : ''} ${d.past && !d.done && p ? 'missed' : ''}"><span>${DAY_NAMES[d.day].slice(0, 2)}</span><span class="e">${d.done ? '✅' : p ? p.emoji : '😴'}</span></div>`; }).join('')}
    </div>

    <div class="card stack">
      <h2>⏱️ הדקה שלי</h2>
      <p class="muted small">בוחרים תרגיל, סופרים בלחיצה במשך דקה ורואים את השיא האישי שלך. בקצב שלך.</p>
      <button class="btn primary big" data-go="#/minute">למבחן הדקה שלי</button>
    </div>

    ${pendingWorkout() ? `<div class="card" style="border:3px solid var(--hot)"><div class="row"><span style="font-size:32px">⏸️</span><div class="grow"><b>יש אימון באמצע: ${esc(pendingWorkout().program.name)}</b><p class="muted small">עצרת אחרי ${pendingWorkout().items.filter(i => i.done > 0 || i.skipped).length} מתוך ${pendingWorkout().items.length} תרגילים.</p></div></div>
      <div class="row" style="margin-top:10px"><button class="btn primary grow" id="resume">להמשיך מאיפה שעצרת ▶️</button><button class="btn ghost" id="discard">לבטל</button></div></div>` : ''}
    <h2>${todayCount ? 'עוד אחד היום?' : 'האימון של היום'}</h2>
    ${today ? `
      <div class="card tap prog ${today.cat} today" data-go="#/start/${today.id}">
        <div class="emoji">${today.emoji}</div>
        <div><h3>${esc(today.name)}</h3><p class="muted small">${esc(blocksText(today))}${boostText(store.progBoost(today.id)) ? ' · 🔥 ' + boostText(store.progBoost(today.id)) : ''}</p></div>
        <span class="pill solid">${today.minutes} דק'</span>
      </div>
      <button class="btn primary big" data-go="#/start/${today.id}">מתחילים את האימון של היום 🚀</button>`
    : `<div class="card"><h3>😴 יום מנוחה</h3><p class="muted small">השרירים גדלים דווקא במנוחה. אם בכל זאת בא לך לזוז: מתיחות או אימון 7 דקות קל.</p></div>
       <div class="card tap prog jump" data-go="#/start/quick"><div class="emoji">⏱️</div><div><h3>אימון 7 דקות</h3><p class="muted small">קצר וקל.</p></div><span class="pill solid">7 דק'</span></div>`}

    ${nextLevel ? `<div class="card row" style="border:2px solid var(--star)"><span style="font-size:32px">🏅</span><div class="grow"><b>סיימת שלושה אימונים!</b><p class="muted small">אם מתאים לך, אפשר לנסות את הרמה "${LEVELS[nextLevel].name}".</p></div><button class="btn chip on" id="levelup">לעלות רמה</button></div>` : ''}

    ${companionCard(st.workouts)}
    ${restCard(rest)}
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
  wireCompanion(st.workouts);
  const rs = $('#resume'); if (rs) rs.onclick = () => { W = loadW(); if (W) go('#/workout'); else home(); };
  const dc = $('#discard'); if (dc) dc.onclick = () => { if (confirm('לבטל את האימון שבאמצע? מה שסימנת עד עכשיו לא יישמר.')) { discardW(); home(); } };
}

// ---- אבא ואני: בחירת ההורה, ואז שנינו מוכנים באותו מכשיר ----
function together() {
  const choice = togetherChoice(store.parent.together, programById, byId);
  const activity = buildTogetherWorkout(choice, programById, byId, store.profile.level, choice?.mode === 'workout' ? store.progBoost(choice.programId) : {});
  if (!activity) {
    mount(`<div class="stack">
      <div class="row"><button class="btn icon ghost" data-go="#/home" aria-label="חזרה">→</button><h1>אבא ואני 👨‍👦</h1></div>
      <div class="card stack"><p>אבא יבחר לנו אימון או אתגר שנעשה יחד.</p><button class="btn primary big" data-go="#/parent-together">אבא, בוחרים פעילות</button></div>
    </div>`);
    return;
  }
  const pending = W || loadW();
  mount(`<div class="stack">
    <div class="row"><button class="btn icon ghost" data-go="#/home" aria-label="חזרה">→</button><h1>אבא ואני 👨‍👦</h1></div>
    <div class="card stack">
      <span class="pill solid">${esc(togetherLabel(choice))}</span>
      <h2>${esc(activity.program.name)}</h2>
      <p>אבא ואני עושים את התרגילים יחד. כל אחד בקצב שלו, ואפשר לנוח כשצריך.</p>
      <p class="muted small">סופרים רק את התנועות שלך. אבא זז איתך.</p>
      <div class="list">${activity.items.map(it => `<div class="item"><span class="grow">${esc(it.name)}</span><span class="pill solid">${targetText(it)}</span></div>`).join('')}</div>
      ${pending ? `<p role="status">יש אימון שמחכה לך. נמשיך אותו לפני פעילות חדשה.</p><button class="btn primary big" id="together-resume">להמשיך את האימון</button>`
        : `<button class="btn big" id="child-ready" aria-pressed="false">אני מוכן</button>
          <button class="btn big" id="dad-ready" aria-pressed="false">אבא מוכן</button>
          <button class="btn primary big" id="together-begin" disabled>מתחילים יחד</button>`}
      <button class="btn ghost" data-go="#/parent-together">אבא, בוחרים פעילות אחרת 🔒</button>
    </div>
  </div>`);
  if (pending) { $('#together-resume').onclick = () => { W = pending; go('#/workout'); }; return; }
  const ready = { child: false, dad: false };
  for (const who of ['child', 'dad']) $('#'+ who + '-ready').onclick = () => {
    ready[who] = !ready[who];
    $('#'+ who + '-ready').setAttribute('aria-pressed', String(ready[who]));
    $('#'+ who + '-ready').classList.toggle('on', ready[who]);
    $('#'+ who + '-ready').textContent = (who === 'child' ? 'אני מוכן' : 'אבא מוכן') + (ready[who] ? ' ✓' : '');
    $('#together-begin').disabled = !ready.child || !ready.dad;
  };
  $('#together-begin').onclick = () => { if (ready.child && ready.dad) beginWorkout(activity.program, activity.items, activity.choice); };
}

// ---- תצוגה מקדימה והתחלה ----
function start(id) {
  const program = programById[id]; if (!program) return go('#/home');
  const level = store.profile.level;
  const boost = store.progBoost(program.id);
  const items = buildItems(program, byId, level, boost);
  let lastBlock = null;
  mount(`
  <div class="stack">
    <div class="row between"><button class="btn icon ghost" data-go="#/home" aria-label="חזרה">→</button><h1 class="grow">${program.emoji} ${esc(program.name)}</h1></div>
    <p class="muted">${esc(program.desc)} בערך ${program.minutes} דקות.${boostText(boost) ? ` <span class="pill hall">🔥 ${boostText(boost)}</span>` : ''}</p>
    <div class="card">
      <div class="row between wrap"><b>רמה</b><div class="row">${Object.entries(LEVELS).map(([k, v]) => `<button class="btn chip ${k === level ? 'on' : ''}" data-level="${k}">${v.name}</button>`).join('')}</div></div>
    </div>
    <div class="card">
      ${items.map(i => {
        const key = i.block + (i.rounds > 1 ? ' ' + i.round : '');
        const head = key !== lastBlock ? `<div class="blockhead">${esc(i.block)}${i.rounds > 1 ? ` · סבב ${i.round} מתוך ${i.rounds}` : ''}</div>` : '';
        lastBlock = key;
        return head + `<div class="item">${figSvg(i.exId, 'mini')}<div class="grow"><b>${esc(i.name)}</b>${i.swapped ? ' <span class="muted small">מתקדם</span>' : ''}</div><span class="pill solid">${targetText(i)}</span></div>`;
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
    <div class="stage">${stageHtml(ex)}</div>
    ${ex.place === 'hall' ? `<div class="row wrap">${placePill(ex)}</div>` : ''}
    ${helpButton()}
    <div class="tiles">
      <div class="tile"><b>${target}</b>${ex.type === 'time' ? 'שניות ברמה שלך' : 'חזרות ברמה שלך'}</div>
      <div class="tile hot"><b>${p ? p.best : '–'}</b>השיא שלך</div>
      <div class="tile"><b>${p ? p.times : 0}</b>פעמים שעשית</div>
    </div>
    <button class="btn primary big" id="solo">לעשות עכשיו רק את זה 💥</button>
    ${ex.type === 'reps' ? `<button class="btn big" data-go="#/minute/${ex.id}">⏱️ מבחן דקה בתרגיל הזה</button>` : ''}
  </div>`);
  const f = wireStage();
  wireHelp(ex, f);
  $('#solo').onclick = () => {
    const program = { id: 'solo', name: ex.name, emoji: '💥', items: [ex.id], rounds: 1, minutes: 1 };
    beginWorkout(program, buildItems(program, byId, store.profile.level));
  };
}

// ---- הדקה שלי: מונה לחיץ, ורק מבחן מלא שומר שיא ----
const minuteRecords = () => { try { return loadMinuteRecords(localStorage); } catch { return {}; } };
function minuteScreen(id) {
  const records = minuteRecords();
  const ex = byId[id];
  if (!ex || ex.type !== 'reps') {
    mount(`<div class="stack">
      <div class="row"><button class="btn icon ghost" data-go="#/home" aria-label="חזרה">→</button><h1>הדקה שלי ⏱️</h1></div>
      <p>איזה תרגיל בא לך? אחרי כל חזרה לוחצים על המספר הגדול. אפשר גם שאבא יספור איתך.</p>
      ${EXERCISES.filter(e => e.type === 'reps').map(e => `<button class="btn big minute-choice" data-go="#/minute/${e.id}"><span>${esc(e.name)}</span><span class="muted small">${records[e.id] ? `השיא שלי בדקה: ${records[e.id].best}` : 'הדקה הראשונה שלי'}</span></button>`).join('')}
    </div>`);
    return;
  }
  const previous = records[ex.id];
  mount(`<div class="stack minute-screen">
    <div class="row"><button class="btn icon ghost" data-go="#/minute" aria-label="חזרה">→</button><h1 class="grow">הדקה שלי ⏱️</h1></div>
    <h2 class="center">${esc(ex.name)}</h2>
    <div class="stage">${stageHtml(ex)}</div>
    <div id="minute-help">${helpButton()}</div>
    <div class="card center stack">
      <p id="minute-best">${previous ? `השיא האישי שלי בדקה: ${previous.best} חזרות` : 'עוד אין שיא בדקה בתרגיל הזה. זו התחלה חדשה.'}</p>
      <div class="minute-clock ltr" id="minute-clock" role="timer" aria-label="הזמן שנותר">1:00</div>
      <p id="minute-status" role="status">אחרי כל חזרה לוחצים על המספר. כל תנועה נחשבת.</p>
      <button class="btn rep-counter" id="minute-count" aria-label="0 חזרות. לחיצה מוסיפה חזרה" disabled>0</button>
      <button class="btn" id="minute-minus" disabled>− תיקון חזרה</button>
      <button class="btn primary big" id="minute-start">מתחילים דקה</button>
      <button class="btn ghost" id="minute-stop" hidden>לעצור ולנוח</button>
    </div>
  </div>`, true);
  const mainFig = wireStage();
  wireHelp(ex, mainFig);
  let state = null, lastCue = null, finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    const result = minuteResult(state, records);
    let saved = false;
    if (result) { try { saved = saveMinuteRecords(localStorage, recordMinuteTest(records, state)); } catch { /* אחסון חסום */ } }
    mount(`<div class="stack">
      <section class="hero center"><h1>${result ? 'סיימת דקה! 💛' : 'זמן לנוח 💛'}</h1><p>${result ? esc(result.message) : 'אפשר לחזור כשתרצה. השיא שלך מחכה לך.'}</p></section>
      ${result ? `<div class="card center stack"><div class="minute-clock">${result.count}</div><p>חזרות בדקה</p><p>${esc(result.comparisonText)}</p>
        ${result.previousBest != null ? `<p class="muted small">השיא לפני הדקה: ${result.previousBest}</p>` : ''}
        <b>השיא האישי שלי בדקה: ${result.best}</b>
        <p class="small" role="status">${saved ? 'הדקה נשמרה בטלפון.' : 'הדקה מוצגת כאן, אבל לא הצלחנו לשמור אותה בטלפון.'}</p></div>`
        : '<div class="card center">עצרנו לפני סוף הדקה, אז השיא הקודם נשאר כמו שהיה.</div>'}
      <button class="btn primary big" id="minute-again">עוד דקה, כשמתאים לי</button>
      <button class="btn big" data-go="#/minute">לבחור תרגיל אחר</button>
      <button class="btn ghost big" data-go="#/home">לדף הבית 🏠</button>
    </div>`);
    $('#minute-again').onclick = () => minuteScreen(ex.id);
    if (result) sayQuick('הַדַּקָּה הִסְתַּיְּמָה. כָּל תְּנוּעָה נֶחְשֶׁבֶת.');
  };
  const paint = () => {
    if (!state || finished) return;
    state = advanceMinuteTest(state, performance.now());
    if (state.status === 'completed' || state.status === 'cancelled') return finish();
    const running = state.status === 'running';
    $('#minute-count').disabled = $('#minute-minus').disabled = !running;
    $('#minute-count').textContent = state.count;
    $('#minute-count').setAttribute('aria-label', `${state.count} חזרות. לחיצה מוסיפה חזרה`);
    const sec = Math.ceil(((running ? state.endAt : state.readyAt) - performance.now()) / 1000);
    $('#minute-clock').textContent = running ? fmtTime(sec) : sec;
    $('#minute-status').textContent = running ? 'אחרי כל חזרה לוחצים על המספר. בקצב שלך.' : 'מתכוננים יחד…';
    if (running && lastCue !== 'running') { lastCue = 'running'; mainFig.play(ex, 1); beep(880, 160); sayQuick('מַתְחִילִים. בַּקֶּצֶב שֶׁלְּךָ.'); }
    else if (!running && lastCue !== sec) { lastCue = sec; sayQuick(numWord(sec)); beep(520, 90); }
  };
  $('#minute-start').onclick = () => {
    if (state) return;
    state = startMinuteTest(ex.id, performance.now());
    stopSpeak(); mainFig.stop(); $('#minute-help').hidden = true;
    $('#minute-start').hidden = true; $('#minute-stop').hidden = false;
    tick = setInterval(paint, 100); paint();
  };
  $('#minute-count').onclick = () => { if (state) { state = changeMinuteCount(state, 1, performance.now()); paint(); } };
  $('#minute-minus').onclick = () => { if (state) { state = changeMinuteCount(state, -1, performance.now()); paint(); } };
  const stop = () => { if (state && !finished) { state = cancelMinuteTest(state, performance.now()); finish(); } };
  $('#minute-stop').onclick = stop;
  const visibility = () => { if (document.hidden) stop(); };
  const pagehide = () => stop();
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('pagehide', pagehide);
  figures.push({ stop: () => { document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', pagehide); } });
}

// ---- מהלך האימון ----
let W = null, tick = 0;
// האימון הפעיל נשמר במכשיר, כדי שאפשר יהיה להמשיך אחרי יציאה בטעות (עד 6 שעות)
const W_KEY = 'kidfit.activeWorkout';
function saveW() { try { if (!W) return; if (W.phase !== 'done') localStorage.setItem(W_KEY, JSON.stringify({ ...W, gift: W.gift ? W.gift.id : null, savedAt: Date.now() })); else localStorage.removeItem(W_KEY); } catch { /* מקום */ } }
function loadW() { try { const w = JSON.parse(localStorage.getItem(W_KEY) || 'null'); if (!w || Date.now() - w.savedAt > 6 * 3600e3) { localStorage.removeItem(W_KEY); return null; } if (w.gift) w.gift = gameById[w.gift] || null; if (!w.gift && w.phase === 'gift') w.phase = w.afterGift || 'exercise'; if (w.phase === 'intro') w.phase = 'exercise'; return w; } catch { return null; } }
const pendingWorkout = () => (W ? null : loadW());
function discardW() { W = null; try { localStorage.removeItem(W_KEY); } catch { /* */ } }
function beginWorkout(program, items, together = null) {
  W = { program, items: items.map(i => ({ ...i, done: 0, skipped: false })), idx: 0, phase: together || store.profile.intro === false ? 'exercise' : 'intro', startedAt: Date.now(), saved: false, mainDone: 0, gift: null, afterGift: null, gamesPlayed: 0,
    ...(together ? { together: { ...together } } : {}) };
  go('#/workout');
}

function workoutScreen() {
  if (!W) { const w = loadW(); if (w) W = w; else return go('#/home'); }
  saveW();
  if (W.phase === 'intro') introPhase();
  else if (W.phase === 'exercise') exercisePhase();
  else if (W.phase === 'rest') restPhase();
  else if (W.phase === 'gift') giftPhase();
  else donePhase();
}

// סרטון פתיחה קצר לפני האימון: הדמות שלו מנצחת
function introPhase() {
  mount('', true);
  const intro = playIntro(app, { voice: id => speak(SAY_UI.intro[id] || ''), onDone: () => { intro.stop(); W.startedAt = Date.now(); W.phase = 'exercise'; workoutScreen(); } });
  figures.push(intro); // נעצר אוטומטית במעבר מסך
}

function exercisePhase() {
  const it = W.items[W.idx], ex = byId[it.exId]; it.startAt = Date.now(); // למדידת זמן אמיתי (נגד דילוגים)
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
    ${W.together ? '<p class="center small">👨‍👦 אבא זז איתך. סופרים רק את התנועות שלך, בקצב שלך.</p>' : ''}
    <div class="stage">${stageHtml(ex)}</div>
    <h1 class="center">${esc(ex.name)}</h1>
    ${helpButton()}
    ${it.type === 'time' ? timeBlock(it) : repsBlock(it)}
    <div class="row">
      <button class="btn ghost grow" id="skip">דילוג ⏭️</button>
      <button class="btn ghost" id="prev" ${W.idx ? '' : 'disabled'}>הקודם</button>
    </div>
  </div>`, true);
  const mainFig = wireStage();
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
    ${byId[it.exId].signal ? '<button class="btn primary" id="signal">🚦 אות יציאה</button><p class="muted small">לוחצים, מתכוננים ליד הקיר, ומחכים לצפצוף.</p>' : '<button class="btn primary" id="countme">🔢 ספור איתי</button>'}
    <p class="muted small" id="rephint">${byId[it.exId].signal ? 'אחרי כל ריצה לוחצים על המספר הגדול:' : 'אחרי כל חזרה לוחצים על המספר הגדול. אפשר גם לספור יחד עם הדמות.'}</p>
    <div class="stepper">
      <button class="btn icon" id="minus" aria-label="פחות">−</button>
      <button class="btn n rep-counter" id="count" aria-label="${it.done || 0} חזרות. לחיצה מוסיפה חזרה">${it.done || 0}</button>
      <button class="btn icon" id="plus" aria-label="יותר">+</button>
    </div>
    <button class="btn ok big" id="did">עשיתי! ✅</button>
  </div>`;
}
function wireReps(it, ex, mainFig) {
  let n = it.done || 0, counting = false;
  const show = () => { $('#count').textContent = n; $('#count').setAttribute('aria-label', `${n} חזרות. לחיצה מוסיפה חזרה`); };
  let stopListen = null;
  const stopCount = () => { clearInterval(tick); tick = 0; counting = false; mainFig.onRep = null; if (stopListen) { stopListen(); stopListen = null; } mainFig.play(ex, 1); $('#repcard').classList.remove('counting'); if ($('#countme')) $('#countme').textContent = '🔢 ספור איתי'; };
  figures.push({ stop: () => { if (stopListen) stopListen(); stopListen = null; } }); // יציאה מהמסך עוצרת את המיקרופון
  const sig = $('#signal');
  if (sig) sig.onclick = () => {
    // אות יציאה: המסך אדום "מוכן...", ואחרי זמן אקראי צפצוף ו"צא!" ירוק
    sig.disabled = true;
    const o = document.createElement('div'); o.className = 'go wait'; o.textContent = 'מוכן...'; document.body.appendChild(o);
    setTimeout(() => { o.className = 'go'; o.textContent = 'צא!'; beep(1200, 350); setTimeout(() => { o.remove(); sig.disabled = false; }, 900); }, 1200 + Math.random() * 2300);
  };
  if ($('#countme')) $('#countme').onclick = () => {
    if (counting) return stopCount();
    counting = true; n = 0; show();
    $('#repcard').classList.add('counting'); $('#countme').textContent = '⏹️ עצור ספירה';
    const voiceOn = canSpeak() && store.profile.voice !== false;
    // כל חזרה: המספר עולה ונאמר בקול (סופרים יחד). fromChild: הילד אמר את המספר קודם, אז לא חוזרים אחריו, רק מסנכרנים את הדמות
    const step = (fromChild = false) => {
      n++; show();
      if (n >= it.target) { stopCount(); fanfare(); if (voiceOn) sayQuick(`${numWord(n)}! כָּל הַכָּבוֹד!`); $('#did').classList.add('pop'); return; }
      if (fromChild) { mainFig.onRep = null; mainFig.play(ex, 1); mainFig.onRep = () => step(); } // הדמות מתחילה סיבוב חדש יחד איתו
      else if (voiceOn) sayQuick(numWord(n)); else beep(780, 70);
    };
    // 3, 2, 1 בקול ובצפצוף, ואז הדמות מתחילה מההתחלה והמספר עולה בכל סיבוב שלה
    mainFig.stop(); let k = 3; const say3 = () => { if (voiceOn) sayQuick(numWord(k)); beep(520, 90); };
    say3();
    tick = setInterval(() => {
      k--; if (k > 0) return say3();
      clearInterval(tick); tick = 0; beep(880, 160); mainFig.onRep = () => step(); mainFig.play(ex, 1);
      // מקשיבים לילד: אם הוא אומר את המספר הבא לפני הדמות, מתקדמים איתו (מתעלמים ממה שנשמע מיד אחרי שהאפליקציה דיברה, כדי לא לספור את עצמה)
      if (store.profile.listen !== false && canListen()) stopListen = listenCount(m => { if (!counting || spokeRecently(700)) return; if (m === n + 1 || m === n + 2) { if (m === n + 2) { n++; show(); } step(true); } });
    }, 1000);
  };
  $('#minus').onclick = () => { if (counting) stopCount(); n = Math.max(0, n - 1); show(); };
  $('#plus').onclick = () => { if (counting) stopCount(); n++; show(); };
  $('#count').onclick = $('#plus').onclick;
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
  const voiceOn = canSpeak() && store.profile.voice !== false;
  const run = () => {
    T.running = true; T.endAt = Date.now() + T.left * 1000; $('#startstop').textContent = '⏸️ עצור';
    if (voiceOn && T.left >= it.target) sayQuick('מַתְחִילִים!');
    tick = setInterval(() => {
      const prev = T.left; T.left = Math.max(0, (T.endAt - Date.now()) / 1000); paint();
      const sec = Math.ceil(T.left), changed = Math.ceil(prev) > sec;
      // בקול: "עוד 20 שניות" כל 10 שניות, וב-10 האחרונות סופרים לאחור יחד; בלי קול: צפצוף ב-3 האחרונות
      if (changed && T.left > 0) { const cue = voiceOn && sec < it.target ? timeCue(sec, it.target) : null; if (cue) sayQuick(cue); else if (sec <= 3) beep(660, 90); }
      if (T.left <= 0) { stop(); fanfare(); if (voiceOn) sayQuick('סִיַּמְתָּ! כָּל הַכָּבוֹד!'); finishItem(it.target, false); }
    }, 200);
  };
  $('#startstop').onclick = () => T.running ? stop() : run();
  $('#early').onclick = () => { stop(); finishItem(Math.round(it.target - T.left), false); };
  paint();
}

function finishItem(done, skipped) {
  const it = W.items[W.idx];
  it.done = done; it.skipped = skipped; it.secs = it.startAt ? Math.round((Date.now() - it.startAt) / 1000) : 0;
  clearInterval(tick); tick = 0;
  if (!skipped && done > 0) beep(990, 120);
  const last = W.idx >= W.items.length - 1;
  let nextPhase = 'done';
  if (!last) {
    const next = W.items[W.idx + 1];
    // מנוחה רק בתוך בלוק האימון עצמו; בחימום ובמתיחות ממשיכים ישר
    nextPhase = skipped || !store.profile.rest || !isWorkBlock(it.block) || !isWorkBlock(next.block) ? 'exercise' : 'rest';
  }
  // מתנות רק בסוף האימון (רועי, 29/09), לפי זמן אימון אמיתי. אין משחק באמצע
  if (!skipped && done > 0 && isWorkBlock(it.block)) W.mainDone++;
  if (!last) W.idx++;
  W.phase = nextPhase;
  workoutScreen();
}

function giftPhase() {
  const g = W.gift, secs = store.profile.gameSeconds || 0; // (מסך המתנה באמצע אימון לא בשימוש מ-29/09; נשאר לתאימות)
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

// הדגמה בלבד (בלי אסימון): אצבע מדומה משחקת ומסבירה, ואז חזרה
function playDemo(g, onDone) { mount('', true); activeGame = runGame(g, { seconds: 60, host: app, best: 0, sound: store.profile.sound !== false, demo: true, demoOnly: true, onEnd() { activeGame = null; onDone(); } }); }
// מריץ משחק במסך מלא ומחזיר לפונקציית ההמשך
function playGame(g, onDone) {
  mount('', true);
  const secs = store.profile.gameSeconds || 0; // 0 = בלי הגבלה: משחקים עד שנפסלים
  activeGame = runGame(g, { seconds: secs, host: app, best: store.games.bests[g.id] || 0, sound: store.profile.sound !== false, music: store.profile.music !== false, recording: playVoiceRecording, speak: (t, lang) => lang ? speakLang(t, lang) : speak(t),
    tokens: () => store.tokens - 1, onContinue: () => { if (store.tokens <= 1) return false; store.addToken(-1); return true; }, // המשחק הזה עולה מתנה אחת בסוף; המשך עולה עוד אחת
    progress: store.progress[g.id] || null, onProgress: p => { if (p) store.setProgress(g.id, p); },
    onEnd({ score }) { store.recordGame(g.id, score, false, g.cost || 1); activeGame = null; onDone(score); } });
}

// הוקי מול טלפון אחר: חדר עם קוד דרך הענן המשפחתי. בלי מתנה (פעילות משפחתית), הניקוד נרשם כרגיל
function onlineHockey() {
  mount('', true);
  showLobby(app, { familyCode: store.profile.familyCode || '', setFamilyCode: v => store.setProfile({ familyCode: v }), onCancel: () => arcade(),
    onReady(conn) { mount('', true); activeGame = runGame(gameById.pong, { seconds: 0, host: app, best: store.games.bests.pong || 0, sound: store.profile.sound !== false, music: store.profile.music !== false, net: conn, tokens: () => 0, onEnd({ score }) { store.recordGame('pong', score, true); activeGame = null; arcade(); } }); } });
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
    duration: Math.round((Date.now() - W.startedAt) / 1000), items: W.items.map(i => ({ exId: i.exId, name: i.name, type: i.type, target: i.target, done: i.done, skipped: i.skipped, round: i.round, block: i.block, secs: i.secs || 0 })),
    ...(W.together ? { together: { ...W.together } } : {}) };
  // זמן אמיתי: תרגיל שסומן מהר מדי (פחות מ-45% מהזמן הצפוי) לא נספר. המתנות לפי דקות אמיתיות
  const h = honestTime(s.items, store.profile.rest || 0); s.honestSeconds = h.seconds; s.fastItems = h.fast;
  s.tokensEarned = tokensFor(h.seconds, store.profile.tokenMinutes || 3);
  if (s.tokensEarned) store.addToken(s.tokensEarned);
  const before = restBadges(stats(store.sessions), restProgress(store.sessions));
  store.addSession(s); W.saved = true;
  // לטלפון של אבא: אם יש קוד משפחה, האימון עולה לענן (או מחכה בתור עד שיש רשת)
  if (store.profile.familyCode) cloud.push(store.profile.familyCode, 'workout', s.id, { ...s, name: store.profile.name, gamesPlayed: W.gamesPlayed, level: store.profile.level, games: gamesSummary() });
  const after = restBadges(stats(store.sessions), restProgress(store.sessions));
  return { session: s, newBadges: after.filter(b => !before.includes(b)) };
}

// שינוי קושי אוטומטי לפי התשובה. קל: קודם +10% (פעמיים), אחר כך תרגילים מתקדמים, ובסוף עוד אחוזים. קשה: צעד אחד אחורה.
function adjustDifficulty(program, val) {
  if (!programById[program.id]) return null;
  const cur = store.progBoost(program.id);
  const order = ['easy', 'normal', 'hard', 'pro'], li = order.indexOf(store.profile.level);
  const spokenName = SAY_UI.programs[program.id] || program.name, A = SAY_UI.adjust;
  if (val === 'easy') {
    if (cur.boost < 2) { store.setProgBoost(program.id, { ...cur, boost: cur.boost + 1 }); return { change: 'boost', msg: `היה קל? מעכשיו "${program.name}" עם ${boostText(store.progBoost(program.id))}. 💪`, say: A.boost(spokenName) }; }
    if (cur.swaps < MAX_SWAPS) { store.setProgBoost(program.id, { ...cur, swaps: cur.swaps + 1 }); return { change: 'swaps', msg: `היה קל? ב"${program.name}" נכנסים תרגילים קשים יותר. 🔥`, say: A.swaps(spokenName) }; }
    if (cur.boost < MAX_BOOST) { store.setProgBoost(program.id, { ...cur, boost: cur.boost + 1 }); return { change: 'boost', msg: `עוד קצת יותר: "${program.name}" עם ${boostText(store.progBoost(program.id))}. 💪`, say: A.boost(spokenName) }; }
    if (li < order.length - 1) { store.setProfile({ level: order[li + 1] }); return { change: 'level', msg: `וואו. עלית לרמה "${LEVELS[order[li + 1]].name}" בכל האימונים! 🏆`, say: A.level(SAY_UI.levels[order[li + 1]]) }; }
    return { change: '', msg: 'אתה כבר ברמה הכי גבוהה. אלוף אמיתי! 👑', say: A.top };
  }
  if (val === 'hard') {
    if (cur.swaps) { store.setProgBoost(program.id, { ...cur, swaps: cur.swaps - 1 }); return { change: 'down', msg: 'היה קשה? בפעם הבאה חוזרים לתרגילים הרגילים. 👍', say: A.downSwaps }; }
    if (cur.boost) { store.setProgBoost(program.id, { ...cur, boost: cur.boost - 1 }); return { change: 'down', msg: 'היה קשה? הורדתי קצת. בפעם הבאה יהיה נוח יותר. 👍', say: A.downBoost }; }
    if (li > 0) { store.setProfile({ level: order[li - 1] }); return { change: 'down', msg: `הורדתי לרמה "${LEVELS[order[li - 1]].name}". לאט לאט בונים כוח. 👍`, say: A.downLevel(SAY_UI.levels[order[li - 1]]) }; }
    return { change: '', msg: 'כל הכבוד שסיימת! זו הרמה הכי קלה, בפעם הבאה יהיה יותר קל כי אתה מתחזק. 💙', say: A.bottom };
  }
  return { change: '', msg: 'מעולה, בדיוק ברמה שלך. 👌', say: A.ok };
}

// בסוף האימון: קודם שאלה שחייבים לענות עליה, ורק אחר כך הסיכום
function askFeedback(s, program, gamesPlayed, then) {
  mount(`
  <div class="stack">
    <section class="hero center pop"><h1>סיימת! ${program.emoji}</h1><p class="muted">שאלה אחת לפני הסיכום:</p></section>
    <div class="card stack center" id="feedback">
      <h2>איך היה האימון?</h2>
      <div class="row" style="gap:10px">
        <button class="btn grow fb" data-fb="easy">😎<br>קל</button>
        <button class="btn grow fb" data-fb="ok">👌<br>בדיוק</button>
        <button class="btn grow fb" data-fb="hard">😮‍💨<br>קשה</button>
      </div>
    </div>
  </div>`, true);
  speak(SAY_UI.howWas);
  app.querySelectorAll('[data-fb]').forEach(b => b.onclick = () => {
    stopSpeak();
    const val = b.dataset.fb, adj = adjustDifficulty(program, val) || { change: '', msg: 'תודה, רשמתי.', say: 'תּוֹדָה, רָשַׁמְתִּי.' };
    s.feedback = val; s.change = adj.change; store.save();
    if (store.profile.familyCode) cloud.push(store.profile.familyCode, 'workout', s.id, { ...s, name: store.profile.name, gamesPlayed, level: store.profile.level, games: gamesSummary() });
    speak(adj.say + ' ' + SAY_UI.perseverance(stats(store.sessions)));
    then(adj.msg);
  });
}
const gamesSummary = () => { const g = store.games; return { count: g.count, played: Object.keys(g.played).length, top: Object.entries(g.bests).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, best]) => ({ id, name: gameById[id]?.name || id, emoji: gameById[id]?.emoji || '🎮', best })) }; };

function donePhase() {
  const res = saveSession();
  try { localStorage.removeItem(W_KEY); } catch { /* */ }
  const s = res ? res.session : store.sessions.at(-1);
  if (!s.feedback) return askFeedback(s, W.program, W.gamesPlayed, msg => { W.adjustMsg = msg; donePhase(); });
  const sum = summarize(s);
  const newBadges = res ? res.newBadges : [];
  if (sum.stars) { fanfare(); confetti(); }
  const st = stats(store.sessions);
  const cheer = sum.rewardMessage;
  const rest = restProgress(store.sessions);
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const nextId = todayProgram(plan(), tomorrow), nextP = nextId && programById[nextId];
  mount(`
  <div class="stack">
    <section class="hero center pop">
      <div class="stars" role="img" aria-label="${sum.stars} כוכבים על מאמץ והשלמה">${'★'.repeat(sum.stars)}<span class="off">${'★'.repeat(3 - sum.stars)}</span></div>
      <h1>סיימת! ${W.program.emoji}</h1>
      <p class="muted">${cheer}</p>
      ${s.together ? `<p>👨‍👦 ${esc(togetherLabel(s.together))}. היה נעים לזוז יחד!</p>` : ''}
      ${sum.starReasons.map(reason => `<p class="small">⭐ ${esc(reason)}</p>`).join('')}
    </section>
    <div class="card center" style="border:2px solid var(--accent)"><b>${esc(perseveranceLine(st))}</b></div>
    ${beltCard(st.workouts, { previousWorkouts: st.workouts - 1 })}
    ${companionCard(st.workouts, { fresh: true })}
    ${restCard(rest)}
    ${W.adjustMsg ? `<div class="card" style="border:2px solid var(--star)"><b>${esc(W.adjustMsg)}</b></div>` : ''}
    ${credits() ? `<div class="card row" style="border:2px solid var(--star)" data-go="#/arcade"><span style="font-size:30px">🔓</span><div class="grow"><b>פתחת ${credits()} משחקים חדשים לבחירה!</b></div></div>` : ''}
    <div class="tiles">
      <div class="tile"><b>${fmtTime(sum.duration)}</b>זמן אימון</div>
      <div class="tile"><b>${sum.doneCount} <span class="muted" style="font-size:16px">מתוך</span> ${sum.total}</b>תרגילים</div>
      ${sum.reps ? `<div class="tile hot"><b>${sum.reps}</b>חזרות</div>` : ''}
      ${sum.seconds ? `<div class="tile hot"><b>${sum.seconds}</b>שניות עבודה</div>` : ''}
      <div class="tile"><b>🔥 ${rest.days}</b>ימי אימון ברצף</div>
      <div class="tile next"><b>${nextP ? nextP.emoji + ' ' + esc(nextP.name.split(':')[0]) : '😴 מנוחה'}</b>מחר</div>
      ${store.tokens ? `<div class="tile" data-go="#/arcade"><b>🎁 ${store.tokens}</b>מתנות לשחק</div>` : ''}
    </div>
    <div class="card" style="border:2px solid var(--accent)"><b>🎁 קיבלת ${s.tokensEarned || 0} ${s.tokensEarned === 1 ? 'מתנה' : 'מתנות'}</b> על ${Math.round((s.honestSeconds || 0) / 60)} דקות אימון אמיתי (מתנה על כל ${store.profile.tokenMinutes || 3} דקות).${s.fastItems ? ` <span class="muted">${s.fastItems} ${s.fastItems === 1 ? 'תרגיל סומן' : 'תרגילים סומנו'} מהר מדי ולא נספרו.</span>` : ''}</div>
    ${newBadges.length ? `<h2>תג חדש! 🎉</h2><div class="badges">${newBadges.map(id => { const b = BADGES.find(x => x.id === id); return `<div class="badge pop"><span class="e">${b.emoji}</span><b>${b.name}</b><br>${b.desc}</div>`; }).join('')}</div>` : ''}
    <div class="card list">${itemsList(s)}</div>
    <button class="btn primary big" data-go="#/home">לדף הבית 🏠</button>
    <button class="btn ghost big" data-go="#/history">לראות את המעקב 📈</button>
  </div>`, false);
  wireCompanion(st.workouts);
  // mount עוצר הקראה קודמת. המשפט החדש נאמר אחרי שמסך הסיום מוצג.
  speak(FRAGMENTS['companion-upgraded']);
  W = null;
}
const itemsList = s => s.items.map(i => `<div class="item">
  <span class="grow">${esc(i.name)}${i.round > 1 ? ` <span class="muted small">(סבב ${i.round})</span>` : ''}</span>
  ${i.done >= i.target ? `<span class="done">✓ ${targetText({ type: i.type, target: i.done })}</span>` : i.done > 0 ? `<span class="part">${i.done} מתוך ${i.target}</span>` : `<span class="skip">דילוג</span>`}
</div>`).join('');

function quit() {
  if (!confirm('לצאת מהאימון? תוכל להמשיך אותו מדף הבית מאיפה שעצרת.')) return;
  clearInterval(tick); tick = 0; stopSpeak();
  saveW(); W = null; go('#/home');
}

// ---- מעקב ----
function history() {
  const st = stats(store.sessions);
  const rest = restProgress(store.sessions);
  const badges = restBadges(st, rest);
  const todayKey = st.week.at(-1).key;
  const max = Math.max(1, ...st.week.map(d => d.minutes));
  const sessions = [...store.sessions].reverse();
  mount(`
  <div class="stack">
    <h1>המעקב שלי 📈</h1>
    ${beltCard(st.workouts)}
    ${companionCard(st.workouts)}
    ${restCard(rest)}
    <div class="tiles">
      <div class="tile hot"><b>🔥 ${rest.days}</b>ימי אימון ברצף</div>
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
          <span style="color:var(--star);font-size:22px" aria-label="${esc(sum.starReasons.join(' · ') || sum.rewardMessage)}">${'★'.repeat(sum.stars)}</span>
        </div>
        <div class="list" id="d-${s.id}" hidden style="margin-top:10px">${s.together ? `<p class="small">👨‍👦 ${esc(togetherLabel(s.together))}</p>` : ''}<p class="small">${esc(sum.starReasons.join(' · ') || sum.rewardMessage)}</p>${itemsList(s)}<div class="item"><button class="btn chip danger" data-del="${s.id}">מחיקת האימון</button></div></div>
      </div>`; }).join('') : '<div class="card center muted">עוד אין אימונים. הראשון מחכה לך בדף הבית!</div>'}
  </div>`);
  wireCompanion(st.workouts);
  app.querySelectorAll('[data-toggle]').forEach(r => r.onclick = () => { const d = $('#d-' + r.dataset.toggle); d.hidden = !d.hidden; });
  app.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { if (confirm('למחוק את האימון הזה מהמעקב? אי אפשר לשחזר.')) { store.removeSession(b.dataset.del); history(); } });
}

// ---- חדר משחקים ----
function arcade() {
  const gs = store.games;
  mount(`
  <div class="stack">
    <div class="row between wrap"><h1>חדר משחקים 🎮</h1><span class="tokens">🎁 ${store.tokens} ${store.tokens === 1 ? 'מתנה' : 'מתנות'}</span></div>
    <p class="muted">${store.tokens ? 'בוחרים משחק. כל משחק עולה מתנה אחת, ומשחקים עד שנפסלים. נפסלת ויש לך עוד מתנה? אפשר להמשיך מאותו מקום.' : 'כדי לשחק צריך מתנה. כל תרגיל שמסיימים באימון נותן אחת!'}</p>
    ${!store.tokens ? '<button class="btn primary big" data-go="#/home">לאימון של היום 🚀</button>' : ''}
    <div class="tiles"><div class="tile"><b>${gs.count}</b>משחקים ששיחקת</div><div class="tile"><b>${Object.keys(gs.played).length} <span class="muted" style="font-size:16px">מתוך</span> ${GAMES.length}</b>משחקים שגילית</div></div>
    ${Object.keys(gs.bests).length ? `<h2>🏆 לוח השיאים</h2><div class="card list">${Object.entries(gs.bests).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, best], i) => { const g = gameById[id]; return g ? `<div class="item"><span class="rank">${['🥇', '🥈', '🥉'][i] || (i + 1)}</span><span class="grow">${g.emoji} ${esc(g.name)}</span><b style="color:var(--accent)">${best}</b>${gs.bestAt?.[id] ? `<span class="muted small">${fmtDate(gs.bestAt[id])}</span>` : ''}</div>` : ''; }).join('')}</div>` : ''}
    ${unlockedList() ? `<div class="card"><b>🔓 ${unlockedList().length} מתוך ${GAMES.length} משחקים פתוחים.</b> ${credits() ? `<span style="color:var(--accent)">יש לך ${credits()} בחירות! לחץ על משחק נעול כדי לפתוח אותו.</span>` : `עוד ${nextUnlockIn(store.sessions.length, store.profile.unlockEvery)} אימונים ותפתח ${PICKS} משחקים לבחירתך.`}</div>` : ''}
    <div class="card tap gcard" data-online style="border:2px solid var(--accent)"><div class="e">🌐</div><div><b>הוקי מול טלפון אחר</b><div class="best">כל אחד מהטלפון שלו: אחד יוצר חדר ומקבל קוד, השני מקליד. בלי מתנה. צריך אותו קוד משפחה בשני הטלפונים.</div></div><span class="pill solid">▶️</span></div>
    ${(() => { const ul = unlockedList(); const groups = ul ? [{ id: 'open', name: 'פתוחים לך עכשיו', emoji: '🔓', games: GAMES.filter(g => ul.includes(g.id)) }, ...GAME_GROUPS.map(gr => ({ ...gr, name: gr.name + ' (נעולים)', games: gr.games.filter(g => !ul.includes(g.id)) })).filter(gr => gr.games.length)] : GAME_GROUPS; return groups.map(gr => `
      <h2>${gr.emoji} ${gr.name}</h2>
      ${gr.games.map(g => { const locked = ul && !ul.includes(g.id); return `
        <div class="card tap gcard ${store.tokens >= (g.cost || 1) && !locked ? '' : 'pick'} ${locked ? 'locked' : ''}" data-game="${g.id}">
          <div class="e">${locked ? (credits() ? '🔓' : '🔒') : g.emoji}</div>
          <div><b>${esc(g.name)}</b>${gs.played[g.id] ? '' : ' <span class="pill solid" style="font-size:12px;padding:1px 8px">חדש</span>'}<div class="best">${gs.played[g.id] ? `שיא: ${gs.bests[g.id] || 0} · שיחקת ${gs.played[g.id]} ${gs.played[g.id] === 1 ? 'פעם' : 'פעמים'}` : esc(g.how)}</div></div>
          <span class="pill solid">${locked ? (credits() ? 'לפתוח' : 'נעול') : (g.cost > 1 ? `🎁×${g.cost} ▶️` : '▶️')}</span>
          ${g.demo && !locked ? `<button class="btn chip" data-demo="${g.id}" style="grid-column:1/-1;justify-self:start;font-size:13px">🎬 איך משחקים?</button>` : ''}
        </div>`; }).join('')}`).join(''); })()}
  </div>`);
  app.querySelectorAll('[data-demo]').forEach(b => b.onclick = e => { e.stopPropagation(); playDemo(gameById[b.dataset.demo], () => arcade()); });
  const on = app.querySelector('[data-online]'); if (on) on.onclick = () => onlineHockey();
  app.querySelectorAll('[data-game]').forEach(c => c.onclick = () => {
    const id = c.dataset.game, ul = unlockedList();
    if (ul && !ul.includes(id)) {
      if (credits() > 0) { if (confirm(`לפתוח את "${gameById[id].name}"? נשארו לך ${credits()} בחירות.`)) { store.setUnlocked([...ul, id]); arcade(); } }
      else { c.classList.add('shake'); setTimeout(() => c.classList.remove('shake'), 500); }
      return;
    }
    const cost = gameById[id].cost || 1;
    if (store.tokens < cost) { c.classList.add('shake'); setTimeout(() => c.classList.remove('shake'), 500); if (cost > 1 && store.tokens) speak(SAY_UI.costTwo || 'שִׂים לֵב, הַמִּשְׂחָק הַזֶּה עוֹלֶה שְׁתֵּי מַתָּנוֹת.'); return; }
    if (cost > 1) speak(SAY_UI.costTwo || 'שִׂים לֵב, הַמִּשְׂחָק הַזֶּה עוֹלֶה שְׁתֵּי מַתָּנוֹת.'); /* רועי: להגיד גם בקול */
    playGame(gameById[id], () => arcade());
  });
}

// ---- הגדרות ----
function tetrisPics() { try { const a = JSON.parse(localStorage.getItem('kidfit.tetrisPics') || '[]'); const one = localStorage.getItem('kidfit.tetrisPic'); return one && !a.length ? [one] : a; } catch { return []; } }
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
      <div class="toggle"><b>סרטון פתיחה לפני אימון</b><input type="checkbox" id="intro" ${p.intro !== false ? 'checked' : ''}></div>
      <div class="toggle"><b>דמות מצוירת בתלת-ממד בתרגילים</b><input type="checkbox" id="stage3d" ${p.stage3d !== false ? 'checked' : ''}></div>
      <div class="toggle"><b>לשמוע אותו סופר (מיקרופון)</b><input type="checkbox" id="listen" ${p.listen !== false ? 'checked' : ''} ${canListen() ? '' : 'disabled'}></div>
      <p class="muted small">${canListen() ? 'ב"ספור איתי": האפליקציה סופרת בקול, ואם הוא אומר את המספר הבא לפניה, היא מתקדמת איתו. בפעם הראשונה הטלפון יבקש אישור למיקרופון.' : 'הדפדפן הזה לא מזהה דיבור. בכרום באנדרואיד זה עובד.'}</p>
      <label class="field">הקול<select id="voiceName"><option value="">אוטומטי (הטוב ביותר במכשיר)</option>${hebrewVoices().map(v => `<option value="${esc(v.name)}" ${v.name === p.voiceName ? 'selected' : ''}>${esc(v.name)}${v.localService === false ? ' (רשת)' : ''}</option>`).join('')}</select></label>
      <label class="field">קצב דיבור<select id="speechRate">${[[0.8, 'לאט'], [0.92, 'רגיל'], [1.05, 'מהיר']].map(([v, n]) => `<option value="${v}" ${Math.abs(v - (p.speechRate || 0.92)) < 0.01 ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <button class="btn chip" id="voicetest">🔊 בדיקת קול</button>
      <p class="muted small">הקול הוא של המכשיר. ${canSpeak() ? (hebrewVoices().length ? `נמצאו ${hebrewVoices().length} קולות בעברית. נבחר: ${esc(bestVoice()?.name || '')}. אם יש כמה, נסו כל אחד עם "בדיקת קול" ובחרו את הטבעי ביותר. באנדרואיד כדאי להוריד את הקול העברי המשופר: הגדרות, ניהול כללי, המרת טקסט לדיבור, מנוע גוגל, התקנת נתוני קול, עברית.` : 'לא נמצא קול עברי. באנדרואיד: הגדרות, שפה, המרת טקסט לדיבור, להוריד עברית. באייפון: הגדרות, נגישות, תוכן מדובר, קולות, עברית.') : 'המכשיר לא תומך בהקראה.'}</p>
    </div>
    <div class="card stack">
      <h3>מתנות ומשחקים 🎁</h3>
      <label class="field">מתנה (משחק) על כל<select id="tokenMinutes">${[[2, '2 דקות אימון אמיתי'], [3, '3 דקות אימון אמיתי (15 דקות = 5 משחקים)'], [4, '4 דקות אימון אמיתי'], [5, '5 דקות אימון אמיתי']].map(([v, n]) => `<option value="${v}" ${v === (p.tokenMinutes || 3) ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="field">פתיחת משחקים חדשים<select id="unlockEvery">${[[10, 'כל 10 אימונים: 5 משחקים לבחירה'], [5, 'כל 5 אימונים: 5 משחקים לבחירה'], [3, 'כל 3 אימונים: 5 משחקים לבחירה'], [0, 'הכול פתוח מההתחלה']].map(([v, n]) => `<option value="${v}" ${v === p.unlockEvery ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="field row between"><span>מוזיקת רקע במשחקים</span><input type="checkbox" id="musicOn" ${p.music !== false ? 'checked' : ''}></label>
      <label class="field">אורך משחק<select id="gameSeconds">${[[0, 'בלי הגבלה, עד שנפסלים'], [60, 'דקה'], [90, 'דקה וחצי'], [120, 'שתי דקות']].map(([v, n]) => `<option value="${v}" ${v === p.gameSeconds ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <p class="muted small">${GAMES.length} משחקים שונים. מתנות שלא משחקים מיד נשמרות לחדר המשחקים (${store.tokens} שמורות).</p>
    </div>
    <div class="card stack">
      <h3>סרטונים לתרגילים 🎥</h3>
      <p class="muted small">במקום הדמות המצוירת: סרטון קצר אמיתי (או תמונה) לכל תרגיל, בלופ. מצלמים ישר מהטלפון או בוחרים מהגלריה. ${EXERCISES.filter(e => hasVideo(e.id)).length} מתוך ${EXERCISES.length} יש.</p>
      <p class="muted small" id="vidcloud">${p.familyCode ? `☁️ ענן משפחתי: כל סרטון שמצלמים כאן עולה לענן ומגיע לטלפון של הילד (אותו קוד משפחה). בענן ${Object.keys(cloudVideos()).length} סרטונים.${vidStatus.error ? ` ⚠️ ${esc(vidStatus.error)}` : ''}` : 'כדי שהסרטונים יגיעו גם לטלפון שלו: קוד משפחה בכרטיס "חיבור לטלפון של אבא" למטה, אותו קוד בשני הטלפונים.'}</p>
      ${p.familyCode ? '<button class="btn chip" id="vidrefresh">🔄 לרענן מהענן</button>' : ''}
      <div class="tip">🎬 איך לצלם: הטלפון לרוחב, בגובה החזה, כל הגוף בפריים עם קצת אוויר מעל הראש ומתחת לרגליים. רקע פשוט (קיר). 5 עד 8 שניות: שתיים-שלוש חזרות בקצב רגיל, בלי לדבר (הסרטון מוצג בלי קול). תרגילי רצפה מצלמים מהצד.</div>
      <details><summary class="small" style="cursor:pointer">כל התרגילים (${EXERCISES.length})</summary><div class="stack" style="margin-top:8px">${Object.entries(CATS).map(([cat, c]) => `<b class="small muted">${c.emoji} ${c.name}</b>` + EXERCISES.filter(e => e.cat === cat).map(e => `<div class="row between"><span>${{ local: '✅', cloud: '☁️', repo: '📦' }[sourceOf(e.id)] || '▫️'} ${esc(e.name)}</span><span class="row">${hasVideo(e.id) ? `<button class="btn chip" data-playvid="${e.id}">▶️</button>` : ''}<label class="btn chip">📹 ${hasVideo(e.id) ? 'להחליף' : 'לצלם / לבחור'}<input type="file" accept="video/*,image/*" data-vid="${e.id}" hidden></label>${localVideos().has(e.id) || cloudVideos()[e.id] ? `<button class="btn chip" data-delvid="${e.id}" aria-label="למחוק">🗑️</button>` : ''}</span></div><div class="vidprev" data-prev="${e.id}" hidden></div>`).join('')).join('')}</div></details>
    </div>
    <div class="card stack">
      <h3>התוכנית השבועית</h3>
      <p class="muted small">אבא בוחר מה עושים בכל יום. אפשר גם לבחור יום מנוחה.</p>
      <div class="list">${DAY_NAMES.map((day, i) => `<div class="item"><b>יום ${day}</b><span class="grow">${pl[i] ? esc(programById[pl[i]].name) : '😴 מנוחה'}</span></div>`).join('')}</div>
      <button class="btn" data-go="#/parent-week">🔒 תכנון השבוע ודוח להורה</button>
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
      <p class="muted small">לאבא בלבד, עם קוד סודי: תכנון השבוע, דוח שבועי ויומן הכדורסל.</p>
      <button class="btn" data-go="#/parent">להיכנס למצב הורים</button>
    </div>
    <div class="card stack">
      <h3>התמונות בטטריס 🖼️</h3>
      <p class="muted small">התמונות שנחשפות שורה אחרי שורה. בלי תמונות משלכם: 5 תמונות מובנות של רונאלדו והולאנד. אפשר לבחור תמונות מהטלפון במקומן, הן נשמרות רק במכשיר הזה.</p>
      <div class="row wrap"><label class="btn chip" for="tetrisPic">📷 הוספת תמונות</label><input type="file" id="tetrisPic" accept="image/*" multiple hidden>${tetrisPics().length ? '<button class="btn chip danger" id="tetrisPicClear">הסרת כל התמונות</button>' : ''}</div>
      <div class="row wrap">${tetrisPics().map(src => `<img src="${src}" alt="" style="width:72px;height:112px;object-fit:cover;border-radius:10px;box-shadow:var(--shadow)">`).join('')}</div>
    </div>
    <div class="card stack">
      <h3>הקלטות שלכם 🎙️</h3>
      <p class="muted small">במקום הקולות המסונתזים. כל הקלטה 3 שניות, נשמרת רק במכשיר הזה.</p>
      <div class="row wrap"><b>צעקת הגול</b> <span class="muted small">(כששיא נשבר)</span></div>
      <div class="row wrap"><button class="btn chip" data-rec="kidfit.goalShout">🎙️ הקלטה</button>${localStorage.getItem('kidfit.goalShout') ? '<button class="btn chip" data-play="kidfit.goalShout">▶️ השמעה</button><button class="btn chip danger" data-clear="kidfit.goalShout">הסרה</button>' : ''}</div>
      <div class="row wrap"><b>הצחוק של השוער</b> <span class="muted small">(בפנדלים, כשמחטיאים)</span></div>
      <div class="row wrap"><button class="btn chip" data-rec="kidfit.laugh">🎙️ הקלטה</button>${localStorage.getItem('kidfit.laugh') ? '<button class="btn chip" data-play="kidfit.laugh">▶️ השמעה</button><button class="btn chip danger" data-clear="kidfit.laugh">הסרה</button>' : ''}</div>
      <div class="muted small" id="shoutStatus">${localStorage.getItem('kidfit.goalShout') || localStorage.getItem('kidfit.laugh') ? 'יש הקלטות שמורות.' : 'אין הקלטות עדיין.'}</div>
    </div>
    <div class="card stack">
      <h3>הפרצוף במשחק הרעב הגדול 🙂</h3>
      <p class="muted small">תמונת פנים של הילד (רק במכשיר הזה). בלי תמונה: פרצוף מצויר.</p>
      <div class="row wrap"><label class="btn chip" for="facePic">📷 בחירת תמונת פנים</label><input type="file" id="facePic" accept="image/*" hidden>${localStorage.getItem('kidfit.facePic') ? '<button class="btn chip danger" id="facePicClear">הסרה</button>' : ''}</div>
      ${localStorage.getItem('kidfit.facePic') ? `<img src="${localStorage.getItem('kidfit.facePic')}" alt="" style="width:72px;height:72px;object-fit:cover;border-radius:50%;box-shadow:var(--shadow)">` : ''}
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
  $('#listen').onchange = e => store.setProfile({ listen: e.target.checked });
  app.querySelectorAll('input[data-vid]').forEach(inp => inp.onchange = async e => {
    const f = e.target.files[0]; if (!f) return; if (f.size > 60e6) return alert('הסרטון גדול מדי (מעל 60MB). מצלמים קצר יותר.');
    try { await saveVideo(inp.dataset.vid, f); } catch { return alert('לא הצלחתי לשמור את הסרטון במכשיר.'); }
    // עם קוד משפחה: עולה גם לענן, כדי שיגיע לטלפון של הילד
    if (store.profile.familyCode) { const st = $('#vidcloud'); if (st) st.textContent = `☁️ מעלה לענן: ${byId[inp.dataset.vid].name}...`; const ok = await cloudUpload(store.profile.familyCode, inp.dataset.vid, f); if (!ok) alert('נשמר בטלפון, אבל ההעלאה לענן נכשלה: ' + vidStatus.error); }
    settings();
  });
  if ($('#vidrefresh')) $('#vidrefresh').onclick = async () => { $('#vidrefresh').textContent = '⏳'; await refreshCloud(store.profile.familyCode); settings(); };
  app.querySelectorAll('[data-playvid]').forEach(b => b.onclick = async () => { const box = app.querySelector(`.vidprev[data-prev="${b.dataset.playvid}"]`); if (!box.hidden) { box.hidden = true; box.innerHTML = ''; return; } const m = await videoUrl(b.dataset.playvid, store.profile.familyCode); if (!m) return; box.innerHTML = m.kind === 'image' ? `<img class="exvid" src="${m.url}" alt="">` : `<video class="exvid" src="${m.url}" autoplay muted loop playsinline controls></video>`; box.hidden = false; });
  app.querySelectorAll('[data-delvid]').forEach(b => b.onclick = async () => { const id = b.dataset.delvid, inCloud = !!cloudVideos()[id]; if (!confirm(`למחוק את הסרטון של "${byId[id].name}"${inCloud ? ' מהטלפון הזה ומהענן (גם מהטלפון של הילד)' : ''}?`)) return; await deleteVideo(id); if (inCloud && store.profile.familyCode) await cloudDelete(store.profile.familyCode, id); settings(); });
  $('#intro').onchange = e => store.setProfile({ intro: e.target.checked });
  $('#stage3d').onchange = e => store.setProfile({ stage3d: e.target.checked }); /* כיבוי = דמות המקלות (טלפון איטי / בלי WebGL) */
  $('#voicetest').onclick = () => { if (!speak(SAY_UI.test, { force: true })) alert('אין הקראה במכשיר הזה.'); };
  $('#voiceName').onchange = e => store.setProfile({ voiceName: e.target.value });
  $('#speechRate').onchange = e => store.setProfile({ speechRate: +e.target.value });
  window.speechSynthesis?.addEventListener?.('voiceschanged', () => { if (location.hash.includes('settings') && $('#voiceName') && $('#voiceName').options.length <= 1) settings(); }, { once: true });
  $('#tokenMinutes').onchange = e => store.setProfile({ tokenMinutes: +e.target.value });
  const fitImage = (f, w, h, q = 0.82) => new Promise((res, rej) => { const i = new Image(); i.onload = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; const k = Math.max(w / i.width, h / i.height); c.getContext('2d').drawImage(i, (w - i.width * k) / 2, (h - i.height * k) / 2, i.width * k, i.height * k); URL.revokeObjectURL(i.src); res(c.toDataURL('image/jpeg', q)); }; i.onerror = rej; i.src = URL.createObjectURL(f); });
  $('#tetrisPic').onchange = async e => { const files = [...e.target.files].slice(0, 12); if (!files.length) return; try { const pics = tetrisPics(); for (const f of files) pics.push(await fitImage(f, 360, 560)); localStorage.setItem('kidfit.tetrisPics', JSON.stringify(pics.slice(-12))); settings(); } catch { alert('לא הצלחתי לקרוא את התמונות (אולי אין מקום). נסו פחות תמונות.'); } };
  const tpc = $('#tetrisPicClear'); if (tpc) tpc.onclick = () => { if (confirm('להסיר את כל התמונות מהטטריס?')) { localStorage.removeItem('kidfit.tetrisPics'); localStorage.removeItem('kidfit.tetrisPic'); settings(); } };
  document.querySelectorAll('[data-rec]').forEach(btn => btn.onclick = async () => { const key = btn.dataset.rec, st = $('#shoutStatus'); try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); const rec = new MediaRecorder(stream); const chunks = []; rec.ondataavailable = e => chunks.push(e.data); rec.onstop = () => { stream.getTracks().forEach(tr => tr.stop()); const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' }); const fr = new FileReader(); fr.onload = () => { try { localStorage.setItem(key, fr.result); settings(); } catch { st.textContent = 'ההקלטה גדולה מדי לשמירה.'; } }; fr.readAsDataURL(blob); }; rec.start(); st.textContent = key === 'kidfit.laugh' ? 'מקליט... תצחקו! 🔴' : 'מקליט... צעקו גוווול! 🔴'; setTimeout(() => rec.state !== 'inactive' && rec.stop(), 3000); } catch { st.textContent = 'אין גישה למיקרופון. צריך לאשר לדפדפן.'; } });
  document.querySelectorAll('[data-play]').forEach(btn => btn.onclick = () => { try { new Audio(localStorage.getItem(btn.dataset.play)).play(); } catch { /* */ } });
  document.querySelectorAll('[data-clear]').forEach(btn => btn.onclick = () => { if (confirm('להסיר את ההקלטה?')) { localStorage.removeItem(btn.dataset.clear); settings(); } });
  $('#facePic').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { localStorage.setItem('kidfit.facePic', await fitImage(f, 160, 160, 0.85)); settings(); } catch { alert('לא הצלחתי לקרוא את התמונה.'); } };
  const fpc = $('#facePicClear'); if (fpc) fpc.onclick = () => { if (confirm('להסיר את תמונת הפנים?')) { localStorage.removeItem('kidfit.facePic'); settings(); } };
  $('#fam').oninput = e => { const v = cloud.normCode(e.target.value); store.setProfile({ familyCode: v }); if (v.length >= 8) { cloud.register(v); refreshCloud(v); } }; // עם קוד מלא: מביאים גם את רשימת הסרטונים של המשפחה
  // קוד חדש נרשם בענן (רק הגיבוב שלו); בלי רישום הענן דוחה כתיבה וקריאה
  $('#newfam').onclick = async () => { if (p.familyCode && !confirm('ליצור קוד חדש? צריך להקליד אותו גם בטלפון של אבא.')) return; const c = cloud.newFamilyCode(); store.setProfile({ familyCode: c }); await cloud.register(c); settings(); };
  $('#copyfam').onclick = async () => { try { await navigator.clipboard.writeText(store.profile.familyCode); $('#cloudstate').textContent = 'הקוד הועתק'; } catch { $('#fam').select(); } };
  $('#syncnow').onclick = async () => { $('#cloudstate').textContent = 'שולח...'; const ok = await cloud.flush(); $('#cloudstate').textContent = ok || !cloud.status.pending() ? 'הכול בענן ✓' : '⚠️ ' + (cloud.status.error || 'אין רשת'); };
  $('#gameSeconds').onchange = e => store.setProfile({ gameSeconds: +e.target.value }); $('#musicOn').onchange = e => store.setProfile({ music: e.target.checked });
  $('#unlockEvery').onchange = e => store.setProfile({ unlockEvery: +e.target.value });
  $('#export').onclick = () => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([store.export()], { type: 'application/json' }));
    a.download = `workouts-${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  $('#wipe').onclick = () => { if (confirm('למחוק את כל האימונים וההגדרות? אי אפשר לשחזר.') && confirm('בטוח? זו מחיקה סופית.')) { store.wipe(); settings(); } };
}

initParent({ mount, esc, go, $ });
// סרטונים: קודם המקומיים, ואז הרשימה מהענן המשפחתי (אם יש קוד). מסך פרטי תרגיל או הגדרות מתרעננים; אימון פעיל לא נקטע
const softRoute = () => { if (/#\/(settings|exercise\/)/.test(location.hash)) route(); };
refreshVideos().then(softRoute).then(() => store.profile.familyCode && refreshCloud(store.profile.familyCode).then(softRoute));
if (store.profile.familyCode) cloud.flush();
window.addEventListener('focus', () => { if (store.profile.familyCode) cloud.flush(); });

// ---- כללי: כל אלמנט עם data-go מנווט ----
app.addEventListener('click', e => { const t = e.target.closest('[data-go]'); if (t && app.contains(t)) go(t.dataset.go); });
window.addEventListener('pagehide', () => saveW());

route();
