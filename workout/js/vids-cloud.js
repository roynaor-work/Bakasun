// RPC metadata and short-lived Storage capabilities. No direct bucket access.
const ID = /^[a-z0-9][a-z0-9-]{0,79}$/;
const PATH = /^[A-Z0-9]{8,12}\/[a-z0-9][a-z0-9-]{0,79}(\.[0-9]{1,20})?$/;
export const videoCode = value => {
  const code = String(value || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{8,12}$/.test(code)) throw Error('קוד המשפחה צריך להכיל 8 עד 12 אותיות וספרות');
  return code;
};
export const videoPath = (code, path, id) => {
  if (!PATH.test(path) || path.split('/')[0] !== videoCode(code) ||
    (id !== undefined && (!ID.test(id) || path.split('/')[1].split('.')[0] !== id))) throw Error('נתיב הסרטון אינו שייך למשפחה או לתרגיל');
  return path;
};
export const videoVersion = path => Number(path?.split('/')[1]?.split('.')[1] || 0);
export function createVideoCloud({ baseUrl, publicKey, fetch: request = (...args) => fetch(...args), now = () => Date.now() }) {
  const base = baseUrl.replace(/\/$/, ''), last = new Map();
  const headers = { apikey: publicKey, Authorization: 'Bearer ' + publicKey, 'Content-Type': 'application/json' };
  const fail = async response => {
    let body = {}; try { body = await response.json(); } catch { /* no response body */ }
    const message = String(body.message || body.error || '');
    const error = new Error(/unknown family code/.test(message) ? 'קוד המשפחה לא רשום בענן' :
      /secret missing/.test(message) ? 'צריך להגדיר את סוד הסרטונים ב־Vault לפי NOTES.md' :
      response.status === 404 ? 'צריך להריץ vids-signed.sql לפי NOTES.md' : `${response.status} ${message.slice(0, 120)}`);
    error.status = response.status;
    error.conflict = response.status === 409 || body.code === '23505' || /already exists|resourcealreadyexists|duplicate/i.test(message + ' ' + (body.error || body.code || ''));
    throw error;
  };
  const rpc = async (name, body) => {
    const r = await request(`${base}/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!r.ok) await fail(r);
    return r.json();
  };
  const access = async (code, path, action) => {
    code = videoCode(code); videoPath(code, path);
    if (!['download', 'upload'].includes(action)) throw Error('פעולת סרטון לא תקינה');
    const grant = await rpc('kidfit_vids_access', { code, path, action });
    const prefix = `/storage/v1/object/${action === 'upload' ? 'upload/sign' : 'sign'}/kidfit-vids/${path}`;
    const u = new URL(grant?.path || '', base);
    if (u.origin !== new URL(base).origin || u.pathname !== prefix || !u.searchParams.get('token') ||
      !Number.isFinite(grant?.expires) || grant.expires <= Math.floor(now() / 1000)) throw Error('הרשאת הסרטון אינה תקינה או פגה');
    return u.href;
  };
  return {
    access,
    async catalog(code) {
      code = videoCode(code);
      const rows = await rpc('kidfit_vids_catalog', { code });
      if (!Array.isArray(rows)) throw Error('רשימת הסרטונים אינה תקינה');
      const ids = new Set();
      return rows.map(row => {
        videoPath(code, row.path, row.id);
        if (ids.has(row.id)) throw Error('רשימת הסרטונים מכילה תרגיל כפול');
        ids.add(row.id);
        return { id: row.id, path: row.path, updated: row.updated || '', mime: row.mime || '' };
      });
    },
    async download(code, path) {
      const url = await access(code, path, 'download');
      const r = await request(url);
      if (!r.ok) await fail(r);
      return r.blob();
    },
    async upload(code, id, blob, after = 0) {
      code = videoCode(code);
      if (!ID.test(id)) throw Error('מזהה תרגיל לא תקין');
      const key = `${code}/${id}`;
      for (let attempt = 0; attempt < 3; attempt++) {
        const seconds = Math.max(Math.floor(now() / 1000), after + 1, (last.get(key) || 0) + 1);
        last.set(key, seconds);
        const path = `${key}.${seconds}`;
        try {
          const url = await access(code, path, 'upload');
          const r = await request(url, { method: 'PUT', headers: { apikey: publicKey, 'Content-Type': blob.type || 'video/mp4' }, body: blob });
          if (!r.ok) await fail(r);
          return { path, updated: new Date(now()).toISOString(), mime: blob.type || 'video/mp4' };
        } catch (e) {
          if (attempt === 2 || !e.conflict) throw e;
        }
      }
    },
  };
}
