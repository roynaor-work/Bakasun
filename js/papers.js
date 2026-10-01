/* Company papers live in the private cloud bucket, never in the app files. A paper is available on this device only after
   the cloud sign-in; the logo (a public asset) ships with the app. Nothing here deletes or sends anything. */
import * as cloud from './cloud.js';
import { BUCKET } from './logic/caseFiles.js';

export const PAPERS_BUCKET = BUCKET || 'receipts';
export function paperAvailable(p) { return !!(p && p.status === 'found' && (p.file || (p.cloud && cloud.isOn() && !cloud.status.expired))); }
export function paperNeedsCloud(p) { return !!(p && p.status === 'found' && p.cloud && !p.file && !(cloud.isOn() && !cloud.status.expired)); }
export function paperPath(p) { return cloud.orgId() + '/' + p.cloud; }
/** {id, name, type, size, blob, title} like a library file, or null when the paper cannot be fetched (no sign-in, no bucket). */
export async function paperRec(p) {
  let blob = null, name = '';
  if (p.file) { const r = await fetch(p.file); blob = await r.blob(); name = p.file.split('/').pop(); }
  else if (p.cloud) { blob = await cloud.downloadFileBlob(PAPERS_BUCKET, paperPath(p)); name = p.cloud.split('/').pop(); }
  if (!blob) return null;
  return { id: 'paper:' + p.key, name, type: blob.type || 'application/pdf', size: blob.size, blob, title: p.title };
}
/** A link that opens the paper for a limited time (signed), or '' when not signed in. */
export async function paperUrl(p, seconds) { return p.file ? p.file : p.cloud ? cloud.signedUrl(PAPERS_BUCKET, paperPath(p), seconds || 3600) : ''; }
