// הקריאה החוזרת מ-Grow אחרי תשלום (notifyUrl): מסמן את ההזמנה כשולמה ומאשר ל-Grow (approveTransaction).
// לפרוס עם --no-verify-jwt, כי Grow לא שולח JWT.
import { GROW_BASE, EP, parseNotify, approveParams, toForm } from '../_shared/grow.mjs';

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
  if (su && sk) {
    const patch = { status: cb.paid ? 'paid' : 'payment_failed', paid_at: cb.paid ? new Date().toISOString() : null, grow_transaction_id: cb.transactionId || null, pay_details: { asmachta: cb.asmachta, cardSuffix: cb.cardSuffix, cardBrand: cb.cardBrand, sum: cb.sum, paymentsNum: cb.paymentsNum, paymentDate: cb.paymentDate, status: cb.status, statusCode: cb.statusCode } };
    const where = cb.orderNo ? `order_no=eq.${encodeURIComponent(cb.orderNo)}` : cb.processId ? `grow_process_id=eq.${encodeURIComponent(cb.processId)}` : '';
    if (where) await fetch(`${su}/rest/v1/north_orders?${where}`, { method: 'PATCH', headers: { apikey: sk, Authorization: `Bearer ${sk}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(patch) }).catch(() => null);
  }
  const pageCode = Deno.env.get('GROW_PAGE_CODE');
  if (pageCode && cb.transactionId) {
    const sandbox = Deno.env.get('GROW_SANDBOX') === '1';
    await fetch(GROW_BASE(sandbox) + EP.approve, { method: 'POST', body: toForm(approveParams(cb, pageCode)) }).catch(() => null);
  }
  return new Response('ok');
});
