// אחסון מקומי בדפדפן. הנתונים נשארים במכשיר; מחיקה רק דרך ההגדרות ובאישור.
const KEY = 'kidfit.v1';
const DEFAULTS = { profile: { name: '', level: 'normal', rest: 15, sound: true, plan: null, giftEvery: 1, gameSeconds: 90, voice: true }, sessions: [], tokens: 0, games: { bests: {}, played: {}, recent: [], count: 0 } };

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const d = JSON.parse(raw);
    return { profile: { ...DEFAULTS.profile, ...(d.profile || {}) }, sessions: Array.isArray(d.sessions) ? d.sessions : [], tokens: d.tokens | 0, games: { ...structuredClone(DEFAULTS.games), ...(d.games || {}) } };
  } catch { return structuredClone(DEFAULTS); }
}

export const store = {
  data: load(),
  get profile() { return this.data.profile; },
  get sessions() { return this.data.sessions; },
  get tokens() { return this.data.tokens; },
  get games() { return this.data.games; },
  addToken(n = 1) { this.data.tokens += n; this.save(); },
  // רושם משחק ששוחק: מוריד מטבע, שומר שיא וסופר
  recordGame(id, score) { const g = this.data.games; this.data.tokens = Math.max(0, this.data.tokens - 1); g.played[id] = (g.played[id] || 0) + 1; g.bests[id] = Math.max(g.bests[id] || 0, score); g.recent = [id, ...g.recent.filter(x => x !== id)].slice(0, 6); g.count++; this.save(); },
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* אין מקום או מצב פרטי: ממשיכים בלי לשמור */ } },
  setProfile(patch) { Object.assign(this.data.profile, patch); this.save(); },
  addSession(s) { this.data.sessions.push(s); this.save(); },
  removeSession(id) { this.data.sessions = this.data.sessions.filter(s => s.id !== id); this.save(); },
  wipe() { this.data = structuredClone(DEFAULTS); this.save(); },
  export() { return JSON.stringify(this.data, null, 2); },
};
