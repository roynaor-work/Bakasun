// יוצר עמוד תשלום ב-Grow להזמנה מהחנות ומחזיר את הקישור. הלקוח מפנה אליו.
// סודות: GROW_USER_ID, GROW_PAGE_CODE, GROW_SANDBOX ("1" לארגז חול). SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY מגיעים לבד.
import { GROW_BASE, EP, createParams, parseCreate, toForm } from '../_shared/grow.mjs';
import { computeTotal } from '../_shared/pricing.mjs';
// הקטלוג של האתר עצמו, כדי שהסכום יחושב כאן ולא בדפדפן. אם הפריסה לא מקבלת ייבוא מחוץ לתיקיית הפונקציות, מעתיקים את שני הקבצים ל-_shared.
import { PRODUCTS, BUILD } from '../../../north/js/products.js';
import { SHIPPING } from '../../../north/js/config.js';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const userId = Deno.env.get('GROW_USER_ID'), pageCode = Deno.env.get('GROW_PAGE_CODE');
  if (!userId || !pageCode) return json({ error: 'Grow לא מוגדר: חסרים GROW_USER_ID / GROW_PAGE_CODE' }, 503);
  let body: any; try { body = await req.json(); } catch { return json({ error: 'JSON לא תקין' }, 400); }
  // הזמנה נטענת מהטבלה לפי מספר + אסימון גישה שהלקוח קיבל בעת השמירה (totals.access). שורות, שיטת משלוח וסכום נלקחים מהשמורה, לא מהבקשה.
  const reqOrder = body.order;
  if (!reqOrder?.no || typeof reqOrder.no !== 'string' || typeof reqOrder.access !== 'string' || reqOrder.access.length < 16) return json({ error: 'הזמנה לא תקינה' }, 400);
  const su = Deno.env.get('SUPABASE_URL'), sk = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!su || !sk) return json({ error: 'השרת לא מוגדר' }, 503);
  let saved: any;
  try {
    const r = await fetch(`${su}/rest/v1/north_orders?order_no=eq.${encodeURIComponent(reqOrder.no)}&select=order_no,status,pay,method,items,customer,totals&limit=1`, { headers: { apikey: sk, Authorization: `Bearer ${sk}` } });
    const rows = r.ok ? await r.json() : [];
    saved = Array.isArray(rows) ? rows[0] : null;
  } catch { saved = null; }
  const same = (a: string, b: string) => a.length === b.length && [...a].reduce((d, c, i) => d | (c.charCodeAt(0) ^ b.charCodeAt(i)), 0) === 0;
  // אותה תשובה להזמנה שלא קיימת ולאסימון שגוי, כדי שלא ינחשו מספרים.
  if (!saved || typeof saved.totals?.access !== 'string' || !same(saved.totals.access, reqOrder.access)) return json({ error: 'הזמנה לא נמצאה' }, 404);
  if (!['new', 'awaiting_payment'].includes(saved.status) || saved.pay !== 'card') return json({ error: 'ההזמנה אינה ממתינה לתשלום' }, 409);
  const order: any = { no: saved.order_no, store: reqOrder.store, items: saved.items, method: saved.method, customer: saved.customer };
  const priced = computeTotal(order.items, order.method || 'pickup', { PRODUCTS, BUILD, SHIPPING });
  if (priced.unknown.length) return json({ error: 'פריט לא מוכר בהזמנה: ' + priced.unknown.join(', ') }, 400);
  if (!(priced.total > 0)) return json({ error: 'סכום לא תקין' }, 400);
  const clientTotal = Number(saved.totals?.total);
  order.total = priced.total; order.shipping = priced.shipping; order.subtotal = priced.subtotal;
  // כתובת החזרה רק מדומיינים מאושרים (GROW_RETURN_ORIGINS, מופרדים בפסיק), לא מכל מי שקורא.
  const base = String(body.returnBase || '').replace(/[#?].*$/, '');
  const allowed = (Deno.env.get('GROW_RETURN_ORIGINS') || 'https://roynaor-work.github.io').split(',').map((x) => x.trim()).filter(Boolean);
  let baseOrigin = ''; try { baseOrigin = new URL(base).origin; } catch { /* */ }
  if (!/^https:\/\//.test(base) || !allowed.includes(baseOrigin)) return json({ error: 'returnBase לא מאושר' }, 400);
  const self = new URL(req.url); const notifyUrl = `${self.origin}/functions/v1/grow-notify`;
  // Grow משרשר לסוף הכתובת &response=success ואת שדות ה-cField, לכן מספר ההזמנה בשאילתה ולא ב-hash.
  const urls = { successUrl: `${base}?paid=1&no=${encodeURIComponent(order.no)}`, cancelUrl: `${base}?paid=0&no=${encodeURIComponent(order.no)}`, notifyUrl };
  const params = createParams(order, urls, { userId, pageCode });
  const sandbox = Deno.env.get('GROW_SANDBOX') === '1';
  let res: any;
  try { const r = await fetch(GROW_BASE(sandbox) + EP.create, { method: 'POST', body: toForm(params) }); res = await r.json(); }
  catch (e) { return json({ error: 'Grow לא זמין: ' + String(e) }, 502); }
  const out = parseCreate(res);
  if (!out.ok) return json({ error: out.error, grow: res }, 502);
  // שומרים את מזהי התהליך על ההזמנה (אם הטבלה קיימת), בלי להכשיל את התשלום אם זה נכשל.
  try {
    await fetch(`${su}/rest/v1/north_orders?order_no=eq.${encodeURIComponent(order.no)}`, { method: 'PATCH', headers: { apikey: sk, Authorization: `Bearer ${sk}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ grow_process_id: out.processId, grow_process_token: out.processToken, status: 'awaiting_payment', total: priced.total, totals: { ...saved.totals, subtotal: priced.subtotal, shipping: priced.shipping, total: priced.total, clientTotal } }) });
  } catch { /* לא קריטי */ }
  return json({ url: out.url, processId: out.processId, total: priced.total, repriced: Math.abs(clientTotal - priced.total) > 0.5 });
});
