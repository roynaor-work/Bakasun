// Review exact HTTPS origin + pathname pairs before adding them here.
// The ingestion endpoint must return the JSON acknowledgement directly.
export const APPROVED_UPLOAD_ENDPOINTS = Object.freeze([]);

export function approvedUploadEndpoint(value, endpoints = APPROVED_UPLOAD_ENDPOINTS) {
  if (typeof value !== 'string' || value.length > 4096) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || value !== url.origin + url.pathname) return null;
    return endpoints.includes(value) ? value : null;
  } catch { return null; }
}
