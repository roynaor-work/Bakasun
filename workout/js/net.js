// משחק מול טלפון אחר: ערוץ realtime של Supabase (אותו פרויקט של הענן המשפחתי), בלי שרת נוסף ובלי ספרייה חיצונית:
// מדברים ישירות בפרוטוקול ה-websocket של Realtime (Phoenix, vsn 1.0.0): phx_join לערוץ, broadcast להודעות, heartbeat כל 25 שניות.
// חדר = קוד משפחה + קוד חדר של 4 ספרות. זר שלא יודע את קוד המשפחה לא יכול להיכנס גם אם ניחש ספרות.
// המארח (host) מחשב את המשחק ומשדר מצב; האורח (guest) שולח את מיקום האצבע ומצייר את המצב שקיבל.
import { CLOUD } from '../../js/data/cloudcfg.js?v=20261010-camera-1';

export const newRoomCode = () => String(1000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 9000));
export const normRoom = c => String(c || '').replace(/\D/g, '').slice(0, 4);
const normFam = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);

// connect({ familyCode, code, role: 'host'|'guest', onMsg(type, payload) }) → חיבור עם send/close/alive/route
export async function connect({ familyCode, code, role, onMsg }) {
  const fam = normFam(familyCode), room = normRoom(code);
  if (fam.length < 8) throw new Error('צריך קוד משפחה (8 תווים), אותו קוד בשני הטלפונים');
  if (room.length !== 4) throw new Error('קוד חדר = 4 ספרות');
  const topic = `realtime:kidfit:${fam}:${room}`;
  const wsUrl = CLOUD.url.replace(/^http/, 'ws') + '/realtime/v1/websocket?apikey=' + encodeURIComponent(CLOUD.key) + '&vsn=1.0.0';
  let lastPeer = 0, closed = false, handler = onMsg, ref = 0, hb = 0;
  const ws = new WebSocket(wsUrl);
  const raw = (event, payload) => { if (ws.readyState !== 1) return; ws.send(JSON.stringify({ topic, event, payload, ref: String(++ref) })); };
  await new Promise((ok, bad) => {
    const to = setTimeout(() => bad(new Error('אין חיבור לענן (זמן קצוב)')), 12000);
    ws.onopen = () => raw('phx_join', { config: { broadcast: { self: false, ack: false }, presence: { key: '' }, postgres_changes: [] } });
    ws.onerror = () => { clearTimeout(to); bad(new Error('אין חיבור לענן')); };
    ws.onmessage = e => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.event === 'phx_reply' && m.topic === topic && m.payload && m.payload.status === 'ok' && !hb) { clearTimeout(to); hb = setInterval(() => { if (ws.readyState === 1) ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(++ref) })); }, 25000); ok(); return; }
      if (m.event === 'phx_reply' && m.topic === topic && m.payload && m.payload.status === 'error') { clearTimeout(to); bad(new Error('הענן סירב לערוץ')); return; }
      if (m.event === 'broadcast' && m.topic === topic && m.payload && m.payload.event === 'm') { const p = m.payload.payload; if (!p || p.from === role) return; lastPeer = performance.now(); handler && handler(p.t, p.p); }
    };
    ws.onclose = () => { clearTimeout(to); clearInterval(hb); if (!closed) { closed = true; handler && handler('bye', { reason: 'closed' }); } };
  });
  return {
    code: room, role,
    send(t, p) { if (closed) return; raw('broadcast', { type: 'broadcast', event: 'm', payload: { from: role, t, p } }); },
    alive(ms = 4000) { return !closed && lastPeer > 0 && performance.now() - lastPeer < ms; },
    seen() { return lastPeer; },
    route(fn) { handler = fn; }, /* המשחק מחליף את מקבל ההודעות של הלובי */
    close() { if (closed) return; closed = true; try { raw('broadcast', { type: 'broadcast', event: 'm', payload: { from: role, t: 'bye', p: {} } }); } catch { /* סגור */ } clearInterval(hb); setTimeout(() => { try { ws.close(); } catch { /* סגור */ } }, 300); },
  };
}
