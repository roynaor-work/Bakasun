/* Grow (משולם): היגיון טהור לבניית הבקשות ולקריאת הקריאה החוזרת. בלי רשת, נבדק ב-tests/north.test.mjs. */
export const GROW_BASE = sandbox => sandbox ? 'https://sandbox.meshulam.co.il' : 'https://secure.meshulam.co.il';
export const EP = {
  create: '/api/light/server/1.0/createPaymentProcess',
  approve: '/api/light/server/1.0/approveTransaction',
  info: '/api/light/server/1.0/getPaymentProcessInfo',
};

/* שם מלא: Grow דורש לפחות שתי מילים. */
export function fullName(name) {
  const n = String(name || '').trim().replace(/\s+/g, ' ');
  return n.split(' ').length >= 2 ? n : (n ? n + ' לקוח' : 'לקוח החנות');
}
/* טלפון ישראלי בפורמט 05X-XXXXXXX או 05XXXXXXXX → ספרות בלבד. */
export function phoneDigits(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (d.startsWith('972')) d = '0' + d.slice(3);
  return d;
}

/* שדות createPaymentProcess. order = ההזמנה מהאתר (no, total, items, customer), urls = success/cancel/notify, cfg = userId/pageCode. */
export function createParams(order, urls, cfg, opts = {}) {
  const desc = `הזמנה ${order.no} · ${order.store || 'הרוח הצפונית'}`;
  const p = {
    pageCode: cfg.pageCode,
    userId: cfg.userId,
    chargeType: '1',
    sum: Number(order.total).toFixed(2),
    successUrl: urls.successUrl,
    cancelUrl: urls.cancelUrl,
    description: desc.slice(0, 250),
    'pageField[fullName]': fullName(order.customer?.name),
    'pageField[phone]': phoneDigits(order.customer?.phone),
    cField1: order.no,
    saveCardToken: '0',
    maxPaymentNum: String(opts.maxPayments || 3),
  };
  if (order.customer?.email) p['pageField[email]'] = order.customer.email;
  if (urls.notifyUrl) p.notifyUrl = urls.notifyUrl;
  (order.items || []).slice(0, 20).forEach((it, i) => {
    p[`productData[${i}][catalogNumber]`] = String(it.id || i);
    p[`productData[${i}][quantity]`] = String(it.qty || 1);
    p[`productData[${i}][price]`] = Number(it.price).toFixed(2);
    p[`productData[${i}][itemDescription]`] = String(it.name || '').slice(0, 100);
  });
  if (order.shipping) { const i = (order.items || []).length; p[`productData[${i}][catalogNumber]`] = 'shipping'; p[`productData[${i}][quantity]`] = '1'; p[`productData[${i}][price]`] = Number(order.shipping).toFixed(2); p[`productData[${i}][itemDescription]`] = 'משלוח'; }
  return p;
}

/* התשובה של Grow: {status:1, data:{url, processId, processToken}} או {status:0, err:{message}}. */
export function parseCreate(json) {
  if (!json || Number(json.status) !== 1 || !json.data?.url) return { ok: false, error: json?.err?.message || json?.err || 'Grow: תשובה לא תקינה' };
  return { ok: true, url: json.data.url, processId: String(json.data.processId || ''), processToken: String(json.data.processToken || '') };
}

/* הקריאה החוזרת (notifyUrl) מגיעה form-encoded, לפעמים כ-data[field] ולפעמים שטוח. מחזירים אובייקט שטוח. */
export function parseNotify(entries) {
  const out = {};
  for (const [k, v] of entries) {
    const m = /^data\[(.+?)\](.*)$/.exec(k);
    const key = m ? m[1] + m[2] : k;
    const cm = /^customFields\[(.+?)\]$/.exec(key);
    if (cm) { out.customFields = out.customFields || {}; out.customFields[cm[1]] = String(v); continue; }
    out[key] = String(v);
  }
  out.orderNo = out.customFields?.cField1 || out.cField1 || '';
  out.paid = Number(out.status) === 1 || String(out.statusCode) === '2' || /שולם|paid|success/i.test(out.status || '');
  return out;
}

/* approveTransaction: מחזירים ל-Grow את מה שקיבלנו + pageCode. */
export function approveParams(cb, pageCode) {
  const keys = ['transactionId', 'transactionToken', 'transactionTypeId', 'paymentType', 'sum', 'firstPaymentSum', 'periodicalPaymentSum', 'paymentsNum', 'allPaymentsNum', 'paymentDate', 'asmachta', 'description', 'fullName', 'payerPhone', 'payerEmail', 'cardSuffix', 'cardType', 'cardTypeCode', 'cardBrand', 'cardBrandCode', 'cardExp', 'processId', 'processToken'];
  const p = { pageCode };
  for (const k of keys) if (cb[k] !== undefined) p[k] = String(cb[k]);
  return p;
}

export function toForm(params) { const fd = new FormData(); for (const [k, v] of Object.entries(params)) fd.append(k, v); return fd; }

/* getPaymentProcessInfo: the server asks Grow itself whether the process was paid, instead of trusting the callback.
   Params: pageCode, userId and the processId + processToken we stored when the process was created. */
export function infoParams(order, cfg) {
  return { pageCode: cfg.pageCode, userId: cfg.userId, processId: String(order.grow_process_id || ''), processToken: String(order.grow_process_token || '') };
}
/* The answer of getPaymentProcessInfo: {status:1, data:{transactionId, statusCode/status, sum, asmachta, ...}}.
   Paid only when Grow says so explicitly (status 1 and a transaction with a success code); anything else is "not confirmed". */
export function parseInfo(json) {
  if (!json || Number(json.status) !== 1 || !json.data || typeof json.data !== 'object') return { ok: false, paid: false, reason: json?.err?.message || 'Grow: no answer' };
  const d = json.data;
  const tx = String(d.transactionId || d.transactionID || '');
  const code = String(d.statusCode ?? d.transactionStatusCode ?? d.status ?? '');
  const paid = !!tx && (code === '2' || code === '1' || /שולם|paid|success|approved/i.test(code));
  return { ok: true, paid, transactionId: tx, sum: d.sum != null ? Number(d.sum) : null, asmachta: String(d.asmachta || ''), raw: d };
}
/* The callback and the verified info must speak about the same transaction and the same sum as the order. */
export function matchesOrder(info, order, cb) {
  if (!info || !info.paid) return false;
  if (cb && cb.transactionId && info.transactionId && String(cb.transactionId) !== String(info.transactionId)) return false;
  if (info.sum != null && order && order.total != null && Math.abs(Number(info.sum) - Number(order.total)) > 0.5) return false;
  return true;
}
