// יוצר עמוד תשלום ב-Grow להזמנה מהחנות ומחזיר את הקישור. הלקוח מפנה אליו.
// סודות: GROW_USER_ID, GROW_PAGE_CODE, GROW_SANDBOX ("1" לארגז חול). SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY מגיעים לבד.
import { GROW_BASE, EP, createParams, parseCreate, toForm } from '../_shared/grow.mjs';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const userId = Deno.env.get('GROW_USER_ID'), pageCode = Deno.env.get('GROW_PAGE_CODE');
  if (!userId || !pageCode) return json({ error: 'Grow לא מוגדר: חסרים GROW_USER_ID / GROW_PAGE_CODE' }, 503);
  let body: any; try { body = await req.json(); } catch { return json({ error: 'JSON לא תקין' }, 400); }
  const order = body.order;
  if (!order?.no || !(Number(order.total) > 0)) return json({ error: 'הזמנה לא תקינה' }, 400);
  const base = String(body.returnBase || '').replace(/[#?].*$/, '');
  if (!/^https:\/\//.test(base)) return json({ error: 'returnBase חייב להיות https' }, 400);
  const self = new URL(req.url); const notifyUrl = `${self.origin}/functions/v1/grow-notify`;
  const urls = { successUrl: `${base}?paid=1#/thanks/${order.no}`, cancelUrl: `${base}?paid=0#/thanks/${order.no}`, notifyUrl };
  const params = createParams(order, urls, { userId, pageCode });
  const sandbox = Deno.env.get('GROW_SANDBOX') === '1';
  let res: any;
  try { const r = await fetch(GROW_BASE(sandbox) + EP.create, { method: 'POST', body: toForm(params) }); res = await r.json(); }
  catch (e) { return json({ error: 'Grow לא זמין: ' + String(e) }, 502); }
  const out = parseCreate(res);
  if (!out.ok) return json({ error: out.error, grow: res }, 502);
  // שומרים את מזהי התהליך על ההזמנה (אם הטבלה קיימת), בלי להכשיל את התשלום אם זה נכשל.
  try {
    const su = Deno.env.get('SUPABASE_URL'), sk = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (su && sk) await fetch(`${su}/rest/v1/north_orders?order_no=eq.${encodeURIComponent(order.no)}`, { method: 'PATCH', headers: { apikey: sk, Authorization: `Bearer ${sk}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ grow_process_id: out.processId, grow_process_token: out.processToken, status: 'awaiting_payment' }) });
  } catch { /* לא קריטי */ }
  return json({ url: out.url, processId: out.processId });
});
