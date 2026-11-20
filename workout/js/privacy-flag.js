// privacy-fixes-patches-v1: ?privacy=v246 in the address restores the earlier voice behaviour for one visit
// (network Hebrew voices may read aloud, and "count with me" listens with the browser's own recognizer by default).
// Nothing is stored: without the parameter the device-only rules apply.
export const legacyPrivacy = (search = globalThis.location?.search || '') => {
  try { return new URLSearchParams(search).get('privacy') === 'v246'; } catch { return false; }
};
