// Camera workout v1 is opt-in until the internal tests pass (21/11/2026): the entry link on the exercise
// screen appears only with ?cameraV1=1 in the address. The settings link stays, and the page itself opens
// from it; ?cameraV1=0 hides everything for the visit (the earlier app, with nothing of v1 loaded).
// Nothing is stored.
const value = search => { try { return new URLSearchParams(search).get('cameraV1'); } catch { return null; } };
const safe = id => typeof id === 'string' && /^[a-z0-9-]{1,40}$/.test(id);
export const cameraV1Enabled = (search = globalThis.location?.search || '') => value(search) !== '0';
export const cameraV1Offered = (search = globalThis.location?.search || '') => value(search) === '1';
export const cameraV1Href = (exerciseId = '') => 'camera-v1/' + (safe(exerciseId) ? '?ex=' + exerciseId : '');

// Behaviours added after the first internal round, each behind its own address flag and off by default:
//   camBody=1   thresholds scaled to the child's measured proportions (body.mjs)
//   camSteps=1  "move back" counts steps
//   camConf=1   confidence limits per setup (floor exercises start on a lower limit)
//   camDepth=1  push-up depth eased by the child's arm scale
export const cameraFlags = (search = globalThis.location?.search || '') => {
  const on = name => { try { return new URLSearchParams(search).get(name) === '1'; } catch { return false; } };
  return Object.freeze({ body: on('camBody'), steps: on('camSteps'), conf: on('camConf'), depth: on('camDepth') });
};
