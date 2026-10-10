// מצב הורים: רק אבא פותח, עם קוד סודי. רואה את האימונים של הילד מהענן ומנהל את יומן הכדורסל.
import { exerciseName, workoutName } from './workout-copy.js?v=20261010-child-copy-1';
import { store } from './store.js?v=20261010-child-copy-1';
import * as cloud from './cloud.js?v=20261010-child-copy-1';
import { BB_DRILLS, bbDrillById, bbStats, pct, streak, summarize, fmtDate, fmtTime, uid, scaleTarget } from './logic.js?v=20261010-child-copy-1';
import { EXERCISES, byId } from './exercises.js?v=20261010-child-copy-1';
import { PROGRAMS, programById, DEFAULT_PLAN, DAY_NAMES } from './programs.js?v=20261010-child-copy-1';
import { togetherChoice, togetherLabel } from './together.js?v=20261010-child-copy-1';
import { normalizePlan, validatePlan, reportSessions, weeklyReport } from './weekly.js?v=20261010-child-copy-1';

let ctx = null; // { mount, esc, go, $ } מהאפליקציה
export function initParent(c) { ctx = c; }
const okKey = 'kidfit.parent.ok';
const unlocked = () => { try { return sessionStorage.getItem(okKey) === '1'; } catch { return false; } };
const unlock = () => { try { sessionStorage.setItem(okKey, '1'); } catch { /* */ } };
export const lockParent = () => { try { sessionStorage.removeItem(okKey); } catch { /* */ } };

async function sha(text) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('kidfit:' + text)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
const todayISO = () => new Date().toISOString().slice(0, 10);

// ---- שער הכניסה ----
// next = הפונקציה של המסך שנפתח אחרי הקוד (הכתובת כבר נכונה, אז קוראים לה ישירות)
export function parentGate(next = parentHome) {
  const { mount, esc, $ } = ctx;
  const p = store.parent;
  if (unlocked() && p.pinHash) return next();
  const first = !p.pinHash;
  mount(`
  <div class="stack">
    <div class="row between"><button class="btn icon ghost" data-go="#/settings" aria-label="חזרה">→</button><h1 class="grow">מצב הורים 🔒</h1></div>
    <div class="card stack">
      ${first ? `<p>פעם ראשונה בטלפון הזה. קובעים קוד סודי של 4 עד 6 ספרות. רק מי שיודע אותו יראה את המסכים של אבא.</p>
        <label class="field">קוד סודי<input type="password" inputmode="numeric" id="pin1" maxlength="6" class="ltr-input" autocomplete="off"></label>
        <label class="field">עוד פעם<input type="password" inputmode="numeric" id="pin2" maxlength="6" class="ltr-input" autocomplete="off"></label>
        <label class="field">קוד המשפחה (לא חובה; לחיבור טלפון נוסף)<input type="text" id="fam" value="${esc(store.profile.familyCode)}" class="ltr-input" maxlength="12" autocomplete="off" placeholder="8 תווים"></label>`
      : `<p>מקלידים את הקוד הסודי.</p><label class="field">קוד סודי<input type="password" inputmode="numeric" id="pin1" maxlength="6" class="ltr-input" autocomplete="off"></label>`}
      <p class="muted small" id="err"></p>
      <button class="btn primary big" id="enter">${first ? 'להגדיר ולהיכנס' : 'להיכנס'}</button>
    </div>
  </div>`);
  $('#pin1').focus();
  $('#enter').onclick = async () => {
    const pin = $('#pin1').value.trim();
    if (!/^\d{4,6}$/.test(pin)) { $('#err').textContent = 'הקוד צריך להיות 4 עד 6 ספרות.'; return; }
    if (first) {
      if (pin !== $('#pin2').value.trim()) { $('#err').textContent = 'שני הקודים לא זהים.'; return; }
      const fam = cloud.normCode($('#fam').value); if (fam && fam.length < 8) { $('#err').textContent = 'קוד המשפחה צריך 8 תווים. אפשר להשאיר ריק לפעילות במכשיר הזה.'; return; }
      store.setProfile({ familyCode: fam }); store.setParent({ pinHash: await sha(pin) }); unlock(); return next();
    }
    if (await sha(pin) === p.pinHash) { unlock(); next(); } else { $('#err').textContent = 'קוד לא נכון.'; $('#pin1').value = ''; }
  };
  $('#pin1').onkeydown = e => { if (e.key === 'Enter') $('#enter').click(); };
}

// ---- מה הילד עשה ----
export async function parentHome() {
  const { mount, esc, $ } = ctx;
  if (!unlocked() || !store.parent.pinHash) return parentGate(parentHome);
  const code = store.profile.familyCode;
  const render = (feed, loading, err) => {
    if (location.hash.split('/')[1] !== 'parent' || !unlocked()) return;
    const seen = store.parent.lastSeen || '';
    const sessions = code ? feed.map(r => ({ ...r.payload, created: r.created, isNew: r.created > seen })) : [...store.sessions].reverse();
    const newCount = sessions.filter(s => s.isNew).length;
    const st = { streak: streak(sessions), week: sessions.filter(s => Date.now() - new Date(s.date) < 7 * 864e5).length, minutes: Math.round(sessions.reduce((a, s) => a + (s.duration || 0), 0) / 60) };
    mount(`
    <div class="stack">
      <div class="row between"><button class="btn icon ghost" data-go="#/settings" aria-label="חזרה">→</button><h1 class="grow">מצב הורים 👨‍👦</h1><button class="btn icon ghost" id="refresh" aria-label="רענון">🔄</button></div>
      <div class="row wrap"><span class="pill solid">${code ? `קוד משפחה: <span class="ltr">${esc(code)}</span>` : 'האימונים במכשיר הזה'}</span>${newCount ? `<span class="pill hall">${newCount} חדשים</span>` : ''}${loading ? '<span class="muted small">טוען מהענן...</span>' : ''}</div>
      ${err ? `<div class="tip">⚠️ ${esc(err)}</div>` : ''}
      <div class="tiles">
        <div class="tile hot"><b>🔥 ${st.streak}</b>ימים ברצף</div>
        <div class="tile"><b>${st.week}</b>אימונים ב-7 ימים</div>
        <div class="tile"><b>${sessions.length}</b>אימונים בסך הכול</div>
        <div class="tile"><b>${st.minutes}</b>דקות</div>
      </div>
      <button class="btn primary big" data-go="#/parent-together">👨‍👦 בחירת פעילות: אבא ואני</button>
      <button class="btn big" data-go="#/parent-week">📅 תכנון השבוע ודוח שבועי</button>
      <button class="btn big" data-go="#/basketball">🏀 יומן הכדורסל שלנו</button>
      ${sessions[0]?.games?.top?.length ? `<div class="card"><h3>🏆 השיאים שלו במשחקים <span class="muted small">(${sessions[0].games.count} משחקים)</span></h3><div class="list">${sessions[0].games.top.map((t, i) => `<div class="item"><span>${['🥇', '🥈', '🥉'][i] || (i + 1)}</span><span class="grow">${t.emoji} ${esc(t.name)}</span><b>${t.best}</b></div>`).join('')}</div></div>` : ''}
      <h2>האימונים של ${esc(sessions[0]?.name || 'הילד')}</h2>
      ${sessions.length ? sessions.map((s, i) => { const sum = summarize(s); return `
        <div class="card ${s.isNew ? 'today' : ''}">
          <div class="row between tap" data-toggle="${i}">
            <div><b>${s.emoji || '🏋️'} ${esc(workoutName(s))}</b>${s.isNew ? ' <span class="pill hall" style="font-size:12px;padding:1px 8px">חדש</span>' : ''}<div class="muted small">${fmtDate(s.date)} ${new Date(s.date).toTimeString().slice(0, 5)} · ${fmtTime(sum.duration)} · ${sum.doneCount} מתוך ${sum.total} תרגילים${s.gamesPlayed ? ` · 🎮 ${s.gamesPlayed}` : ''}${s.feedback ? ` · ${{ easy: '😎 היה לו קל', ok: '👌 בדיוק', hard: '😮‍💨 היה לו קשה' }[s.feedback]}${s.change ? ({ boost: ', העלה 10%', swaps: ', עבר לתרגילים מתקדמים', down: ', הוריד קצת' }[s.change] || '') : ''}` : ''}</div></div>
            <span style="color:var(--star);font-size:22px" aria-label="${esc(sum.starReasons.join(' · ') || sum.rewardMessage)}">${'★'.repeat(sum.stars)}</span>
          </div>
          <div class="list" id="pd-${i}" hidden style="margin-top:10px">${s.together ? `<p class="small">👨‍👦 ${esc(togetherLabel(s.together))}</p>` : ''}<p class="small">${esc(sum.starReasons.join(' · ') || sum.rewardMessage)}</p>${(s.items || []).map(it => `<div class="item"><span class="grow">${esc(exerciseName(it))}</span>${it.done >= it.target ? `<span class="done">✓ ${it.done}${it.type === 'time' ? ' שנ׳' : ''}</span>` : it.done > 0 ? `<span class="part">${it.done} מתוך ${it.target}</span>` : '<span class="skip">דילוג</span>'}</div>`).join('')}</div>
        </div>`; }).join('') : `<div class="card center muted">${loading ? 'רגע...' : code ? 'עוד אין אימונים בענן. כשהילד יסיים אימון בטלפון שלו (עם אותו קוד משפחה), זה יופיע כאן.' : 'עוד אין אימונים במכשיר הזה. אחרי הפעילות הראשונה היא תופיע כאן.'}</div>`}
      <button class="btn ghost" id="lock">🔒 יציאה ממצב הורים</button>
    </div>`);
    $('#refresh').onclick = load;
    $('#lock').onclick = () => { lockParent(); ctx.go('#/home'); };
    document.querySelectorAll('[data-toggle]').forEach(r => r.onclick = () => { const d = $('#pd-' + r.dataset.toggle); d.hidden = !d.hidden; });
  };
  async function load() {
    if (!code) return render([], false, '');
    render(store.parent.feed, true, '');
    try { const feed = await cloud.list(code, 'workout'); store.setParent({ feed }); render(feed, false, ''); store.setParent({ lastSeen: new Date().toISOString() }); }
    catch (e) { render(store.parent.feed, false, e.status === 404 ? 'הטבלה בענן עוד לא נוצרה. צריך להריץ את supabase/family.sql פעם אחת.' : 'אין חיבור לענן: ' + e.message); }
  }
  load();
}

// תכנון חוזר לראשון–שבת במכשיר האימון; דוח של הפעילות בפועל, גם בשבועות קודמים.
export function parentWeek(selected) {
  if (!unlocked() || !store.parent.pinHash) return parentGate(() => parentWeek(selected));
  const { mount, esc, $, go } = ctx;
  const code = store.profile.familyCode, activeHash = location.hash;
  let draft = normalizePlan(store.profile.plan, programById, DEFAULT_PLAN);
  let feed = code ? store.parent.feed : [], loading = !!code, error = '', notice = '';
  const active = () => location.hash === activeHash && unlocked();
  const dateLabel = date => date.toLocaleDateString('he-IL');
  const render = () => {
    if (!active()) return;
    const report = weeklyReport(reportSessions(store.sessions, feed), selected);
    mount(`<div class="stack parent-week">
      <div class="row"><button class="btn icon ghost" data-go="#/parent" aria-label="חזרה">→</button><h1>השבוע שלנו 📅</h1></div>
      <section class="card stack" aria-labelledby="plan-heading">
        <h2 id="plan-heading">תכנון השבוע</h2>
        <p class="muted small">בוחרים אימון או מנוחה לכל יום. התוכנית חוזרת בכל שבוע ומופיעה במסך הבית של הילד. מתכננים במכשיר שבו הוא מתאמן; התוכנית נשמרת כאן.</p>
        ${DAY_NAMES.map((day, i) => `<label class="field week-plan-day"><span>יום ${day}</span><select data-plan-day="${i}"><option value="" ${draft[i] === '' ? 'selected' : ''}>😴 מנוחה</option>${PROGRAMS.map(program => `<option value="${program.id}" ${draft[i] === program.id ? 'selected' : ''}>${program.emoji} ${esc(program.name)}</option>`).join('')}</select></label>`).join('')}
        <button class="btn primary big" id="week-plan-save">שמירת התוכנית</button>
        <button class="btn" id="week-plan-default">בחירת התוכנית המומלצת</button>
        <p class="muted small">השינויים נכנסים לתוקף רק בלחיצה על שמירת התוכנית. האימונים שכבר נשמרו נשארים כמו שהם.</p>
        <p class="small" id="week-plan-status" role="status">${esc(notice)}</p>
        <button class="btn" id="week-to-child">לחזור למסך הילד 🔒</button>
      </section>
      <section class="stack" aria-labelledby="report-heading">
        <h2 id="report-heading">דוח שבועי</h2>
        <p id="week-range"><b>${dateLabel(report.start)} – ${dateLabel(report.end)}</b> · ראשון עד שבת</p>
        <div class="row wrap">
          <button class="btn chip" data-go="#/parent-week/${report.previous}">שבוע קודם</button>
          <button class="btn chip" ${report.next ? `data-go="#/parent-week/${report.next}"` : 'disabled'}>שבוע הבא</button>
          ${report.next ? '<button class="btn chip" data-go="#/parent-week">השבוע הנוכחי</button>' : ''}
          <button class="btn chip" id="week-refresh">רענון הדוח</button>
        </div>
        <p class="muted small" role="status">${loading ? 'טוען אימונים מהענן…' : code ? 'האימונים במכשיר הזה ובפיד הענן, בלי לספור אימון פעמיים.' : 'האימונים השמורים במכשיר הזה.'}</p>
        ${error ? `<p class="tip" role="status">${esc(error)} הדוח מציג את האימונים השמורים ואת פיד הענן האחרון שנטען.</p>` : ''}
        ${code ? '<p class="muted small">מהענן מוצגים עד 200 האימונים האחרונים. שבועות ישנים יותר עשויים לכלול רק אימונים שנשמרו במכשיר הזה.</p>' : ''}
        <div class="tiles" id="weekly-totals">
          <div class="tile"><b data-total="workouts">${report.workouts}</b>אימונים</div>
          <div class="tile"><b data-total="days">${report.activeDays}</b>ימים עם פעילות</div>
          <div class="tile"><b data-total="minutes">${report.minutes}</b>דקות באימונים</div>
          <div class="tile"><b data-total="stars">${report.stars} ⭐</b>כוכבים על מאמץ והשלמה</div>
        </div>
        <div class="card stack" id="weekly-details">
          <p>ניסיון ב־${report.tried} תרגילים · ${report.completed} תרגילים הושלמו</p>
          <p>👨‍👦 ${report.together} פעילויות של אבא ואני</p>
          <p class="small">המשוב של הילד: ${report.feedback.easy} קל · ${report.feedback.ok} בדיוק · ${report.feedback.hard} קשה</p>
          <p class="muted small">הזמן הוא זמן האימון שנשמר, כולל מנוחות. הדוח מתאר את הפעילות בפועל; אין השוואה לתוכנית הנוכחית בשבועות קודמים.</p>
        </div>
        ${!report.workouts ? '<p class="card muted" id="week-empty">עוד אין אימונים שמורים בשבוע הזה. אפשר לתכנן יחד זמן שנעים לזוז בו.</p>' : ''}
        <div class="stack" id="weekly-days">${report.days.map(day => `<div class="card stack" data-report-day="${day.day}">
          <h3>יום ${DAY_NAMES[day.day]} · ${dateLabel(day.date)}</h3>
          ${day.workouts ? `<p class="small">${day.workouts} אימונים · ${fmtTime(day.seconds)} · ${day.stars} ⭐</p>
            ${day.sessions.map(session => { const sum = summarize(session); return `<div class="weekly-session">
              <b>${esc(workoutName(session))}</b>
              <p class="small">${fmtTime(Math.max(0, Number(session.duration) || 0))} · ניסיון ב־${sum.doneCount} מתוך ${sum.total} תרגילים · ${sum.stars} ⭐</p>
              <p class="muted small">${esc(sum.starReasons.join(' · ') || sum.rewardMessage)}</p>
              ${session.together ? `<p class="small">👨‍👦 ${esc(togetherLabel(session.together))}</p>` : ''}
            </div>`; }).join('')}` : '<p class="muted small">אין אימון שמור ביום הזה.</p>'}
        </div>`).join('')}</div>
      </section>
      <button class="btn ghost" id="week-lock">🔒 יציאה ממצב הורים</button>
    </div>`);
    document.querySelectorAll('[data-plan-day]').forEach(select => select.onchange = () => { draft[select.dataset.planDay] = select.value; notice = ''; $('#week-plan-status').textContent = 'יש שינויים שעוד לא נשמרו.'; });
    $('#week-plan-default').onclick = () => { draft = { ...DEFAULT_PLAN }; notice = 'התוכנית המומלצת נבחרה. לוחצים על שמירת התוכנית כדי לשמור.'; render(); };
    $('#week-plan-save').onclick = () => {
      const plan = validatePlan(draft, programById);
      if (!plan) { $('#week-plan-status').textContent = 'בוחרים אימון או מנוחה לכל יום.'; return; }
      const previous = store.profile.plan;
      store.setProfile({ plan });
      let saved = false;
      try { saved = JSON.stringify(JSON.parse(localStorage.getItem('kidfit.v1')).profile.plan) === JSON.stringify(plan); } catch { /* שמירה לא זמינה */ }
      if (!saved) store.data.profile.plan = previous;
      notice = saved ? 'התוכנית נשמרה. היא מחכה במסך הבית של הילד.' : 'התוכנית עוד לא נשמרה במכשיר. נסו שוב לפני שסוגרים את האפליקציה.';
      $('#week-plan-status').textContent = notice;
    };
    const leave = () => { lockParent(); go('#/home'); };
    $('#week-to-child').onclick = leave; $('#week-lock').onclick = leave;
    $('#week-refresh').onclick = load;
  };
  async function load() {
    loading = !!code; error = ''; render();
    if (!code) return;
    try {
      const rows = await cloud.list(code, 'workout');
      if (!active()) return;
      feed = rows; store.setParent({ feed });
    } catch { if (active()) error = 'לא הצלחנו לרענן מהענן כרגע.'; }
    if (active()) { loading = false; render(); }
  }
  load();
}

// הבחירה מוגנת בקוד הורה ונשמרת במכשיר שבו מתאמנים יחד.
export function parentTogether() {
  if (!unlocked() || !store.parent.pinHash) return parentGate(parentTogether);
  const { mount, esc, go, $ } = ctx;
  let choice = togetherChoice(store.parent.together, programById, byId) || { mode: 'workout', programId: 'full' };
  const render = () => {
    const challenge = choice.mode === 'challenge', ex = challenge && byId[choice.exId];
    mount(`<div class="stack">
      <div class="row"><button class="btn icon ghost" data-go="#/parent" aria-label="חזרה">→</button><h1>אבא ואני 👨‍👦</h1></div>
      <p>בוחרים פעילות משותפת במכשיר שבו הילד מתאמן. הבחירה נשמרת כאן גם בלי חיבור לאינטרנט.</p>
      <div class="card stack">
        <label class="field">סוג הפעילות<select id="together-mode"><option value="workout" ${!challenge ? 'selected' : ''}>אימון משותף</option><option value="challenge" ${challenge ? 'selected' : ''}>אתגר משותף</option></select></label>
        ${challenge ? `<label class="field">תרגיל<select id="together-ex">${EXERCISES.map(e => `<option value="${e.id}" ${choice.exId === e.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select></label>
          <label class="field">${ex.type === 'time' ? 'שניות לילד' : 'חזרות לילד'}<input type="number" inputmode="numeric" id="together-target" min="1" max="${ex.type === 'time' ? 180 : 100}" step="1" value="${choice.target}"></label>`
          : `<label class="field">תוכנית<select id="together-program">${PROGRAMS.map(p => `<option value="${p.id}" ${choice.programId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>`}
        <p class="muted small">שניכם עושים את התרגילים, כל אחד בקצב שלו. סופרים רק את התנועות של הילד. הכוכבים על המאמץ שלו, בלי השוואת תוצאות.</p>
        <p id="together-error" class="muted small" role="status"></p>
        <button class="btn primary big" id="together-save">לשמור ולחזור לילד</button>
      </div>
    </div>`);
    $('#together-mode').onchange = e => {
      choice = e.target.value === 'workout' ? { mode: 'workout', programId: 'full' }
        : { mode: 'challenge', exId: 'squats', target: scaleTarget(byId.squats.base, store.profile.level) };
      render();
    };
    if (challenge) {
      $('#together-ex').onchange = e => { const next = byId[e.target.value]; choice = { mode: 'challenge', exId: next.id, target: scaleTarget(next.base, store.profile.level, next.type) }; render(); };
      $('#together-target').oninput = e => { choice.target = Number(e.target.value); };
    } else $('#together-program').onchange = e => { choice.programId = e.target.value; };
    $('#together-save').onclick = () => {
      const selected = togetherChoice(choice, programById, byId);
      if (!selected) { $('#together-error').textContent = `בוחרים מספר שלם בין 1 ל־${ex.type === 'time' ? 180 : 100}.`; return; }
      store.setParent({ together: selected }); lockParent(); go('#/together');
    };
  };
  render();
}

// ---- יומן הכדורסל ----
export async function basketball(arg) {
  const { mount, esc, go, $ } = ctx;
  if (!unlocked() || !store.parent.pinHash) return parentGate(() => basketball(arg));
  if (arg === 'new' || (arg && arg.startsWith('edit-'))) return bbForm(arg === 'new' ? null : arg.slice(5));
  const code = store.profile.familyCode;
  // מיזוג מהענן: מה שחדש יותר מנצח
  try { const rows = await cloud.list(code, 'basketball'); for (const r of rows) { const loc = store.basketball.find(x => x.id === r.id); if (!loc || (r.updated > (loc.updated || ''))) store.upsertBasketball({ ...r.payload, id: r.id, updated: r.updated }); } } catch { /* מקומי בלבד */ }
  const sessions = [...store.basketball].sort((a, b) => new Date(b.date) - new Date(a.date));
  const st = bbStats(sessions);
  const trendBars = p => `<div class="trend">${p.trend.map(t => `<i title="${t.made}/${t.att}" style="height:${Math.max(6, t.pct * 0.5)}px" class="${t.pct >= 50 ? 'good' : ''}"></i>`).join('')}</div>`;
  mount(`
  <div class="stack">
    <div class="row between"><button class="btn icon ghost" data-go="#/parent" aria-label="חזרה">→</button><h1 class="grow">יומן הכדורסל 🏀</h1></div>
    <button class="btn primary big" data-go="#/basketball/new">➕ אימון חדש</button>
    <div class="tiles"><div class="tile"><b>${st.sessions}</b>אימונים</div><div class="tile"><b>${st.minutes}</b>דקות</div>${st.per['free-throws'] ? `<div class="tile hot"><b>${st.per['free-throws'].pct ?? '–'}%</b>עונשין בסך הכול</div>` : ''}</div>
    ${Object.keys(st.per).length ? `<h2>התקדמות לפי תרגיל</h2><div class="card list">${Object.values(st.per).sort((a, b) => b.times - a.times).map(p => `<div class="item"><div class="grow"><b>${esc(bbDrillById[p.drillId]?.name || p.name)}</b><div class="muted small">${p.times} פעמים${p.pct != null ? ` · ${p.made} מתוך ${p.att} (${p.pct}%) · שיא ${p.best}%` : ''}</div></div>${p.trend.length ? trendBars(p) : ''}</div>`).join('')}</div>` : ''}
    <h2>האימונים</h2>
    ${sessions.length ? sessions.map(s => `
      <div class="card">
        <div class="row between"><div><b>${fmtDate(s.date)}</b> <span class="muted small">· ${s.minutes || 0} דק׳${s.place ? ' · ' + esc(s.place) : ''}</span></div><span style="color:var(--star)">${'★'.repeat(s.rating || 0)}</span></div>
        <div class="list" style="margin-top:6px">${(s.drills || []).map(d => `<div class="item"><span class="grow">${esc(bbDrillById[d.drillId]?.name || d.name)}${d.note ? ` <span class="muted small">${esc(d.note)}</span>` : ''}</span>${d.att ? `<span class="pill solid">${d.made} מתוך ${d.att} · ${pct(d.made, d.att)}%</span>` : ''}</div>`).join('')}</div>
        ${s.note ? `<p class="small" style="margin-top:6px">📝 ${esc(s.note)}</p>` : ''}
        <div class="row" style="margin-top:8px"><button class="btn chip" data-go="#/basketball/edit-${s.id}">עריכה</button><button class="btn chip danger" data-del="${s.id}">מחיקה</button></div>
      </div>`).join('') : '<div class="card center muted">עוד אין אימונים. לוחצים "אימון חדש" אחרי האימון הראשון שלכם.</div>'}
    ${cloud.status.error ? `<p class="muted small">⚠️ ענן: ${esc(cloud.status.error)}. הנתונים שמורים בטלפון הזה.</p>` : ''}
  </div>`);
  document.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { if (!confirm('למחוק את האימון הזה מהיומן? אי אפשר לשחזר.')) return; store.removeBasketball(b.dataset.del); await cloud.remove(code, b.dataset.del); basketball(); });
}

function bbForm(id) {
  const { mount, esc, go, $ } = ctx;
  const existing = id ? store.basketball.find(x => x.id === id) : null;
  const s = existing ? structuredClone(existing) : { id: uid(), date: todayISO(), minutes: 45, place: '', rating: 0, note: '', drills: [{ drillId: 'free-throws', name: 'זריקות עונשין', att: 20, made: 0, note: '' }] };
  const drillRow = (d, i) => `
    <div class="card stack drill" data-i="${i}" style="gap:8px;padding:12px">
      <div class="row"><select data-f="drillId" class="grow">${BB_DRILLS.map(x => `<option value="${x.id}" ${x.id === d.drillId ? 'selected' : ''}>${x.emoji} ${x.name}</option>`).join('')}<option value="custom" ${d.drillId === 'custom' ? 'selected' : ''}>✏️ אחר</option></select><button class="btn icon ghost" data-rm="${i}" aria-label="הסרה">🗑️</button></div>
      ${d.drillId === 'custom' ? `<input type="text" data-f="name" value="${esc(d.name)}" placeholder="שם התרגיל">` : ''}
      <div class="row"><label class="field grow">ניסיונות<input type="number" inputmode="numeric" min="0" data-f="att" value="${d.att ?? ''}"></label><label class="field grow">קלע<input type="number" inputmode="numeric" min="0" data-f="made" value="${d.made ?? ''}"></label><div class="pct" id="pct-${i}">${d.att ? pct(d.made, d.att) + '%' : ''}</div></div>
      <input type="text" data-f="note" value="${esc(d.note || '')}" placeholder="הערה קצרה (לא חובה)">
    </div>`;
  const render = () => {
    mount(`
    <div class="stack">
      <div class="row between"><button class="btn icon ghost" data-go="#/basketball" aria-label="חזרה">→</button><h1 class="grow">${existing ? 'עריכת אימון' : 'אימון כדורסל חדש'} 🏀</h1></div>
      <div class="card stack">
        <div class="row"><label class="field grow">תאריך<input type="date" id="date" value="${esc(s.date.slice(0, 10))}"></label><label class="field grow">דקות<input type="number" inputmode="numeric" id="minutes" value="${s.minutes}"></label></div>
        <label class="field">איפה<input type="text" id="place" value="${esc(s.place)}" placeholder="מגרש ליד הבית, חוג..."></label>
      </div>
      <h2>תרגילים</h2>
      <div id="drills">${s.drills.map(drillRow).join('')}</div>
      <button class="btn" id="add">➕ עוד תרגיל</button>
      <div class="card stack">
        <label class="field">איך היה האימון?<div class="row" id="rating">${[1, 2, 3, 4, 5].map(n => `<button class="btn icon ghost star ${n <= s.rating ? 'on' : ''}" data-r="${n}">★</button>`).join('')}</div></label>
        <label class="field">הערות<textarea id="note" rows="3" style="width:100%;border:2px solid var(--line);border-radius:14px;padding:8px 12px;background:var(--card);font:inherit">${esc(s.note)}</textarea></label>
      </div>
      <button class="btn primary big" id="save">שמירה 💾</button>
    </div>`);
    const read = () => { s.date = $('#date').value || todayISO(); s.minutes = +$('#minutes').value || 0; s.place = $('#place').value.trim(); s.note = $('#note').value.trim();
      s.drills = [...document.querySelectorAll('.drill')].map(el => { const g = f => el.querySelector(`[data-f="${f}"]`); const drillId = g('drillId').value; return { drillId, name: drillId === 'custom' ? (g('name')?.value.trim() || 'תרגיל') : bbDrillById[drillId].name, att: +g('att').value || 0, made: Math.min(+g('made').value || 0, +g('att').value || 0), note: g('note').value.trim() }; }); };
    document.querySelectorAll('.drill select[data-f="drillId"]').forEach(sel => sel.onchange = () => { read(); render(); });
    document.querySelectorAll('.drill input[data-f="att"], .drill input[data-f="made"]').forEach(inp => inp.oninput = () => { const el = inp.closest('.drill'); const a = +el.querySelector('[data-f="att"]').value || 0, m = +el.querySelector('[data-f="made"]').value || 0; el.querySelector('.pct').textContent = a ? pct(Math.min(m, a), a) + '%' : ''; });
    document.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { read(); s.drills.splice(+b.dataset.rm, 1); render(); });
    document.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { read(); s.rating = +b.dataset.r; render(); });
    $('#add').onclick = () => { read(); s.drills.push({ drillId: 'layups', name: 'ליי-אפ', att: 10, made: 0, note: '' }); render(); };
    $('#save').onclick = async () => { read(); s.updated = new Date().toISOString(); store.upsertBasketball(s); cloud.push(store.profile.familyCode, 'basketball', s.id, s); go('#/basketball'); };
  };
  render();
}
