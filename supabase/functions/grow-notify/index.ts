// הקריאה החוזרת מ-Grow אחרי תשלום (notifyUrl). הקריאה עצמה לא נאמנה: כל אחד יכול לשלוח POST לכתובת הזו.
// לכן: מאתרים את ההזמנה לפי מזהה התהליך ששמרנו, שואלים את Grow (getPaymentProcessInfo) עם processToken הסודי,
// ורק אם Grow מאשר תשלום על אותה עסקה ואותו סכום – מסמנים "שולם". אחרת נרשם "נדרש אימות" ושום דבר לא מסומן כשולם.
// לפרוס עם --no-verify-jwt, כי Grow לא שולח JWT. סודות: GROW_USER_ID, GROW_PAGE_CODE, GROW_SANDBOX.
import { GROW_BASE, EP, parseNotify, approveParams, toForm, infoParams, parseInfo, matchesOrder } from '../_shared/grow.mjs';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok');
  let entries: Iterable<[string, string]> = [];
  const ct = req.headers.get('content-type') || '';
  try {
    if (ct.includes('json')) { const j = await req.json(); const d = j?.data && typeof j.data === 'object' ? { ...j, ...j.data } : j; entries = Object.entries(d).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)]) as [string, string][]; }
    else { const fd = await req.formData(); entries = [...fd.entries()].map(([k, v]) => [k, String(v)]) as [string, string][]; }
  } catch { return new Response('bad body', { status: 400 }); }
  const cb = parseNotify(entries);
  const su = Deno.env.get('SUPABASE_URL'), sk = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const userId = Deno.env.get('GROW_USER_ID'), pageCode = Deno.env.get('GROW_PAGE_CODE');
  if (!su || !sk || !userId || !pageCode) return new Response('not configured', { status: 503 });
  const H = { apikey: sk, Authorization: `Bearer ${sk}`, 'Content-Type': 'application/json' };
  // the order: by the process id Grow gives back, else by our order number; the process must be one we created
  const where = cb.processId ? `grow_process_id=eq.${encodeURIComponent(cb.processId)}` : cb.orderNo ? `order_no=eq.${encodeURIComponent(cb.orderNo)}` : '';
  if (!where) return new Response('ok');
  const found = await fetch(`${su}/rest/v1/north_orders?${where}&select=id,order_no,total,status,grow_process_id,grow_process_token`, { headers: H }).then(r => r.ok ? r.json() : []).catch(() => []);
  const order = Array.isArray(found) ? found[0] : null;
  if (!order || !order.grow_process_id || !order.grow_process_token) return new Response('ok');
  if (order.status === 'paid') return new Response('ok'); // already verified once
  // ask Grow itself
  const sandbox = Deno.env.get('GROW_SANDBOX') === '1';
  let info = { ok: false, paid: false, reason: 'no answer' } as ReturnType<typeof parseInfo>;
  try { const r = await fetch(GROW_BASE(sandbox) + EP.info, { method: 'POST', body: toForm(infoParams(order, { userId, pageCode })) }); info = parseInfo(await r.json()); } catch (e) { info = { ok: false, paid: false, reason: String(e) } as ReturnType<typeof parseInfo>; }
  const verified = matchesOrder(info, order, cb);
  const patch = verified
    ? { status: 'paid', paid_at: new Date().toISOString(), grow_transaction_id: info.transactionId || cb.transactionId || null, pay_details: { asmachta: info.asmachta || cb.asmachta, sum: info.sum, verified: true, at: new Date().toISOString() } }
    : { status: order.status === 'new' ? 'needs_verification' : order.status, pay_details: { callback: { status: cb.status, transactionId: cb.transactionId, sum: cb.sum }, info: info.ok ? { paid: info.paid, transactionId: info.transactionId, sum: info.sum } : { error: (info as { reason?: string }).reason }, verified: false, at: new Date().toISOString() } };
  await fetch(`${su}/rest/v1/north_orders?id=eq.${order.id}`, { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(patch) }).catch(() => null);
  if (verified && cb.transactionId) await fetch(GROW_BASE(sandbox) + EP.approve, { method: 'POST', body: toForm(approveParams(cb, pageCode)) }).catch(() => null);
  return new Response('ok');
});
