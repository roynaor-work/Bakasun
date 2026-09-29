// אחסון מקומי בדפדפן. הנתונים נשארים במכשיר; מחיקה רק דרך ההגדרות ובאישור.
const KEY = 'kidfit.v1';
const DEFAULTS = { profile: { name: '', level: 'normal', rest: 15, sound: true, plan: null, giftEvery: 2, gameSeconds: 0, voice: true, familyCode: '', prog: {}, unlockEvery: 10, ratioV2: true, noTimerV1: true, tokenMinutes: 3 }, sessions: [], tokens: 0, games: { bests: {}, played: {}, recent: [], count: 0, unlocked: null, progress: {} },
  parent: { pinHash: '', lastSeen: '', feed: [] }, basketball: [] };

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const d = JSON.parse(raw);
    const prof = { ...DEFAULTS.profile, ...(d.profile || {}) };
    // יחס משחק/אימון חדש (28/09): מי שעדיין על ברירות המחדל הישנות עובר לחדשות
    if (!prof.ratioV2) { if (prof.giftEvery === 1) prof.giftEvery = 2; if (prof.gameSeconds === 90) prof.gameSeconds = 60; prof.ratioV2 = true; }
    // איפוס שיאים אחרי סיום מקבץ 1 (29/09, בקשת רועי): השיאים של ששת המשחקים הראשונים מתאפסים פעם אחת
    if (d.games && d.games.bests && (d.games.resetV || 0) < 1) { for (const id of ['tetris', 'snake', 'penalty', 'keeper', 'moles', 'flappy']) delete d.games.bests[id]; if (d.games.bestAt) for (const id of ['tetris', 'snake', 'penalty', 'keeper', 'moles', 'flappy']) delete d.games.bestAt[id]; d.games.resetV = 1; }
    // בלי הגבלת זמן במשחקים (29/09, רועי): משחקים עד שנפסלים. מי שהיה על ברירת המחדל הישנה עובר ל-0
    if (!prof.noTimerV1) { if (prof.gameSeconds === 60 || prof.gameSeconds === 90) prof.gameSeconds = 0; prof.noTimerV1 = true; }
    // משחק "אני השוער" (29/09) פתוח מההתחלה גם למי שכבר פתח משחקים
    if (d.games && Array.isArray(d.games.unlocked) && !d.games.unlocked.includes('keeper')) d.games.unlocked.push('keeper');
    return { profile: prof, sessions: Array.isArray(d.sessions) ? d.sessions : [], tokens: d.tokens | 0, games: { ...structuredClone(DEFAULTS.games), ...(d.games || {}) },
      parent: { ...structuredClone(DEFAULTS.parent), ...(d.parent || {}) }, basketball: Array.isArray(d.basketball) ? d.basketball : [] };
  } catch { return structuredClone(DEFAULTS); }
}

export const store = {
  data: load(),
  get profile() { return this.data.profile; },
  get sessions() { return this.data.sessions; },
  get tokens() { return this.data.tokens; },
  get games() { return this.data.games; },
  get parent() { return this.data.parent; },
  get basketball() { return this.data.basketball; },
  progBoost(id) { return this.data.profile.prog?.[id] || { boost: 0, swaps: 0 }; },
  setProgBoost(id, b) { const prog = { ...(this.data.profile.prog || {}) }; prog[id] = b; this.setProfile({ prog }); },
  setParent(patch) { Object.assign(this.data.parent, patch); this.save(); },
  upsertBasketball(sess) { const i = this.data.basketball.findIndex(x => x.id === sess.id); if (i >= 0) this.data.basketball[i] = sess; else this.data.basketball.push(sess); this.save(); },
  removeBasketball(id) { this.data.basketball = this.data.basketball.filter(x => x.id !== id); this.save(); },
  get unlocked() { return this.data.games.unlocked; },
  setUnlocked(list) { this.data.games.unlocked = list; this.save(); },
  addToken(n = 1) { this.data.tokens += n; this.save(); },
  // רושם משחק ששוחק: מוריד מטבע, שומר שיא וסופר
  get progress() { return this.data.games.progress || (this.data.games.progress = {}); },
  setProgress(id, p) { this.progress[id] = p; this.save(); },
  recordGame(id, score) { const g = this.data.games; this.data.tokens = Math.max(0, this.data.tokens - 1); g.played[id] = (g.played[id] || 0) + 1; if (score > (g.bests[id] || 0)) { g.bests[id] = score; g.bestAt = g.bestAt || {}; g.bestAt[id] = new Date().toISOString(); } g.recent = [id, ...g.recent.filter(x => x !== id)].slice(0, 6); g.count++; this.save(); },
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* אין מקום או מצב פרטי: ממשיכים בלי לשמור */ } },
  setProfile(patch) { Object.assign(this.data.profile, patch); this.save(); },
  addSession(s) { this.data.sessions.push(s); this.save(); },
  removeSession(id) { this.data.sessions = this.data.sessions.filter(s => s.id !== id); this.save(); },
  wipe() { this.data = structuredClone(DEFAULTS); this.save(); },
  export() { return JSON.stringify(this.data, null, 2); },
};
