// Camera workout v1 is offered by default. ?cameraV1=0 in the address hides it for the visit
// (the earlier app, with nothing of v1 loaded); ?cameraV1=1 opens it directly. Nothing is stored.
const value = search => { try { return new URLSearchParams(search).get('cameraV1'); } catch { return null; } };
const safe = id => typeof id === 'string' && /^[a-z0-9-]{1,40}$/.test(id);
export const cameraV1Enabled = (search = globalThis.location?.search || '') => value(search) !== '0';
export const cameraV1Href = (exerciseId = '') => 'camera-v1/' + (safe(exerciseId) ? '?ex=' + exerciseId : '');
export function cameraV1Redirect(search = globalThis.location?.search || '') {
  if (value(search) !== '1') return null;
  const params = new URLSearchParams(search), out = new URLSearchParams();
  for (const key of ['ex', 'program']) if (safe(params.get(key))) out.set(key, params.get(key));
  const query = out.toString();
  return 'camera-v1/' + (query ? '?' + query : '');
}
