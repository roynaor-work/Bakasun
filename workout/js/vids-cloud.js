// File-specific capabilities come from SQL RPCs; the public key has no bucket access.
export function createVideoCloud({ baseUrl, publicKey, fetch: request = (...args) => fetch(...args) }) {
  const headers = extra => ({ apikey: publicKey, Authorization: `Bearer ${publicKey}`, ...extra });
  const codeOf = code => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const pathOf = (code, id) => {
    code = codeOf(code);
    if (!/^[A-Z0-9]{8,12}$/.test(code) || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(id)) throw new Error('קוד או נתיב סרטון לא תקין');
    return `${code}/${id}`;
  };
  async function checked(response) {
    if (!response.ok) {
      const text = await response.text();
      const message = /unknown family code/.test(text) ? 'קוד המשפחה לא רשום בענן'
        : response.status === 409 || /already exists/.test(text) ? 'הסרטון כבר קיים בענן. כדי להחליף אותו, מחקו אותו תחילה באישור.'
        : /signing secret missing/.test(text) ? 'חתימת הסרטונים עדיין לא הוגדרה בענן (NOTES.md)'
        : response.status === 404 ? 'שירות הסרטונים בענן אינו זמין (vids-private.sql)'
        : `פעולת הסרטון נדחתה (${response.status})`;
      const error = new Error(message); error.status = response.status; throw error;
    }
    return response;
  }
  async function rpc(name, body) {
    const response = await checked(await request(`${baseUrl}/rest/v1/rpc/${name}`, {
      method: 'POST', headers: headers({ 'Content-Type': 'application/json' }), body: JSON.stringify(body), cache: 'no-store',
    }));
    return response.json();
  }
  async function access(code, id, action) {
    const path = pathOf(code, id);
    const grant = await rpc('kidfit_vids_access', { code: codeOf(code), path, action });
    const expected = `/storage/v1/object/${action === 'upload' ? 'upload/sign/' : action === 'download' ? 'sign/' : ''}kidfit-vids/${path}`;
    if (!grant || (action === 'delete' ? grant.path !== expected : !grant.path?.startsWith(expected + '?token='))
      || !Number.isFinite(grant.expires) || grant.expires * 1000 <= Date.now()) throw new Error('הרשאת הסרטון אינה תקינה או שפגה');
    if (action === 'delete' && typeof grant.token !== 'string') throw new Error('הרשאת המחיקה חסרה');
    return { ...grant, url: baseUrl + grant.path };
  }
  return {
    async catalog(code) {
      pathOf(code, 'catalog'); // validate code without any Storage request
      return rpc('kidfit_vids_catalog', { code: codeOf(code) });
    },
    async download(code, id) { return (await access(code, id, 'download')).url; },
    async upload(code, id, blob) {
      const grant = await access(code, id, 'upload');
      await checked(await request(grant.url, { method: 'PUT', headers: headers({ 'Content-Type': blob.type || 'video/mp4', 'x-upsert': 'false' }), body: blob }));
    },
    async remove(code, id) {
      const grant = await access(code, id, 'delete');
      await checked(await request(grant.url, { method: 'DELETE', headers: headers({ Authorization: `Bearer ${grant.token}` }) }));
    },
  };
}
