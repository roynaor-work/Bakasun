/* The sign-in link Supabase mails her: either pasted as text, or the app's own URL after the link redirected here.
   No password anywhere: the link (one use, short-lived) becomes a session. Pure, tested. */
import { str } from './core.js';

/** {tokenHash, type} from a pasted mail link ("…/auth/v1/verify?token=…&type=magiclink&…"), or null. */
export function parseMailLink(text) {
  const m = /[?&]token=([A-Za-z0-9._-]{16,})/.exec(str(text)); if (!m) return null;
  const ty = /[?&]type=([a-z_]+)/.exec(str(text));
  return { tokenHash: m[1], type: ty ? ty[1] : 'magiclink' };
}

/** {accessToken, refreshToken, type} from the URL hash the link lands on ("#access_token=…&refresh_token=…&type=magiclink"), or null. */
export function parseUrlHash(hash) {
  const h = str(hash).replace(/^#\/?/, '');
  if (!/(^|&)access_token=/.test(h)) return null;
  const p = {}; h.split('&').forEach(kv => { const i = kv.indexOf('='); if (i > 0) p[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1)); });
  if (!p.access_token) return null;
  return { accessToken: p.access_token, refreshToken: p.refresh_token || '', type: p.type || 'magiclink' };
}

/** The e-mail is Virginie's work address unless another one is typed. */
export function pickEmail(typed, fallback) { const e = str(typed).trim(); return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? e : str(fallback); }
