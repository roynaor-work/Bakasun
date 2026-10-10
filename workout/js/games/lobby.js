// חדר למשחק מול טלפון אחר: יוצרים חדר (קוד 4 ספרות) או מצטרפים עם קוד. שני הטלפונים חייבים אותו קוד משפחה.
import { connect, newRoomCode, normRoom } from '../net.js?v=20261010-child-copy-1';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// showLobby(hostEl, { familyCode, setFamilyCode(v), onReady(conn), onCancel() })
export function showLobby(host, { familyCode = '', setFamilyCode = null, onReady, onCancel, title = 'הוקי מול טלפון אחר 🌐' }) {
  let conn = null, timer = 0, dead = false;
  const stop = () => { dead = true; clearInterval(timer); if (conn) { conn.close(); conn = null; } };
  const view = html => { host.innerHTML = `<div class="stack"><div class="row between"><h1>${title}</h1><button class="btn icon" id="lbx" aria-label="סגירה">✕</button></div>${html}</div>`; host.querySelector('#lbx').onclick = () => { stop(); onCancel && onCancel(); }; };
  const famField = () => `<label class="field">קוד משפחה (אותו קוד בשני הטלפונים)<input type="text" id="lbfam" value="${esc(familyCode)}" class="ltr-input" maxlength="12" autocomplete="off" placeholder="8 תווים" style="direction:ltr;text-transform:uppercase"></label>`;
  const readFam = () => { const el = host.querySelector('#lbfam'); if (el) { familyCode = el.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); setFamilyCode && setFamilyCode(familyCode); } return familyCode; };
  const menu = (err = '') => view(`
    <p class="muted">משחקים הוקי שולחן אחד מול השני, כל אחד מהטלפון שלו. טלפון אחד יוצר חדר ומקבל קוד, השני מקליד את הקוד.</p>
    ${famField()}
    ${err ? `<p style="color:var(--danger)">⚠️ ${esc(err)}</p>` : ''}
    <button class="btn primary big" id="lbcreate">ליצור חדר 🏠</button>
    <div class="card stack"><label class="field">יש לך קוד? הקלד אותו<input type="tel" id="lbcode" inputmode="numeric" maxlength="4" placeholder="4 ספרות" class="ltr-input" style="direction:ltr;font-size:28px;letter-spacing:8px;text-align:center"></label><button class="btn big" id="lbjoin">להצטרף לחדר 🚪</button></div>`);
  const waitHost = code => view(`<div class="card stack" style="text-align:center"><p class="muted">תגיד לשחקן השני להקליד את הקוד:</p><div style="font-size:64px;font-weight:900;letter-spacing:10px;direction:ltr">${code}</div><p id="lbstate" class="muted">מחכים לטלפון השני… ⏳</p></div>`);
  const waitGuest = code => view(`<div class="card stack" style="text-align:center"><p class="muted">מתחברים לחדר <b style="direction:ltr;display:inline-block">${code}</b>…</p><p id="lbstate" class="muted">מחכים שהמארח יאשר… ⏳</p></div>`);
  const state = t => { const el = host.querySelector('#lbstate'); if (el) el.textContent = t; };
  const ready = () => { const c = conn; conn = null; clearInterval(timer); onReady(c); };
  const fail = e => { stop(); dead = false; menu(e && e.message || String(e)); };

  menu();
  host.querySelector('#lbcreate').onclick = async () => {
    const fam = readFam(); const code = newRoomCode(); waitHost(code);
    try {
      conn = await connect({ familyCode: fam, code, role: 'host', onMsg: (t) => { if (t === 'hello' && conn) { conn.send('welcome', {}); state('השחקן השני התחבר! 🎉'); setTimeout(() => { if (!dead && conn) ready(); }, 400); } } });
      if (dead) return conn.close();
      let waited = 0; timer = setInterval(() => { waited += 1; if (waited > 120) fail(new Error('אף אחד לא התחבר במשך 2 דקות')); }, 1000);
    } catch (e) { fail(e); }
  };
  host.querySelector('#lbjoin').onclick = async () => {
    const fam = readFam(); const code = normRoom(host.querySelector('#lbcode').value); if (code.length !== 4) return menu('קוד חדר = 4 ספרות');
    waitGuest(code);
    try {
      let welcomed = false;
      conn = await connect({ familyCode: fam, code, role: 'guest', onMsg: (t) => { if (t === 'welcome' && !welcomed && conn) { welcomed = true; state('מתחילים! 🎉'); setTimeout(() => { if (!dead && conn) ready(); }, 300); } } });
      if (dead) return conn.close();
      let n = 0; timer = setInterval(() => { if (!conn) return; conn.send('hello', {}); n++; if (n > 60) fail(new Error('המארח לא ענה. בדקו שהקוד נכון ושקוד המשפחה זהה בשני הטלפונים')); }, 700);
    } catch (e) { fail(e); }
  };
  return { stop };
}
