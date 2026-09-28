// אחסון מקומי בדפדפן. הנתונים נשארים במכשיר; מחיקה רק דרך ההגדרות ובאישור.
const KEY = 'kidfit.v1';
const DEFAULTS = { profile: { name: '', level: 'normal', rest: 15, sound: true }, sessions: [] };

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const d = JSON.parse(raw);
    return { profile: { ...DEFAULTS.profile, ...(d.profile || {}) }, sessions: Array.isArray(d.sessions) ? d.sessions : [] };
  } catch { return structuredClone(DEFAULTS); }
}

export const store = {
  data: load(),
  get profile() { return this.data.profile; },
  get sessions() { return this.data.sessions; },
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* אין מקום או מצב פרטי: ממשיכים בלי לשמור */ } },
  setProfile(patch) { Object.assign(this.data.profile, patch); this.save(); },
  addSession(s) { this.data.sessions.push(s); this.save(); },
  removeSession(id) { this.data.sessions = this.data.sessions.filter(s => s.id !== id); this.save(); },
  wipe() { this.data = structuredClone(DEFAULTS); this.save(); },
  export() { return JSON.stringify(this.data, null, 2); },
};
