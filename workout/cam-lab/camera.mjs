// Browser camera controls are optional: their failure must not stop pose tracking.
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
export function screenOrientation(view = globalThis) {
  if (typeof view.matchMedia === 'function') return view.matchMedia('(orientation: portrait)').matches ? 'portrait' : 'landscape';
  return (view.innerHeight || 1) >= (view.innerWidth || 1) ? 'portrait' : 'landscape';
}
export function cameraConstraints({ facing = 'user', orientation = 'portrait', lowResolution = false, deviceId } = {}) {
  const [width, height] = lowResolution ? [480, 640] : [720, 1280];
  const dimensions = orientation === 'landscape' ? [height, width] : [width, height];
  return { audio: false, video: {
    ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: facing === 'environment' ? 'environment' : 'user' } }),
    width: { ideal: dimensions[0], max: dimensions[0] }, height: { ideal: dimensions[1], max: dimensions[1] },
    frameRate: { ideal: 20, max: 24 },
  } };
}
function read(track, method) {
  try { return typeof track?.[method] === 'function' ? track[method]() || {} : {}; }
  catch { return {}; }
}
export function cameraSnapshot(track) {
  const settings = { ...read(track, 'getSettings') }, capabilities = { ...read(track, 'getCapabilities') };
  // Hardware IDs serve switching only; diagnostics need the effective controls.
  for (const value of [settings, capabilities]) { delete value.deviceId; delete value.groupId; }
  return { settings, capabilities };
}
// PTZ is a separate permission from camera capture. Unsupported browsers may
// ignore both the zoom constraint and the extra permission-descriptor member,
// so a working stream (or a generic camera grant) alone proves neither.
export async function acquireCamera(mediaDevices, options = {}, permissions = globalThis.navigator?.permissions) {
  const constraints = cameraConstraints(options);
  let supportedConstraints = null;
  try { supportedConstraints = mediaDevices.getSupportedConstraints?.() || null; } catch { /* Optional API. */ }
  const supported = supportedConstraints == null ? null : supportedConstraints.zoom === true;
  const permission = { requested: supported !== false, supported, granted: null,
    state: supported === false ? 'unsupported' : 'unknown', fallback: false, requestError: null, actualZoom: null };
  let stream;
  if (permission.requested) {
    const video = { ...constraints.video, zoom: true };
    for (const control of ['pan', 'tilt']) if (supportedConstraints?.[control] === true) video[control] = true;
    try { stream = await mediaDevices.getUserMedia({ ...constraints, video }); }
    catch (error) {
      const denied = ['NotAllowedError', 'SecurityError', 'PermissionDeniedError'].includes(error?.name);
      const unsupported = ['NotSupportedError', 'OverconstrainedError', 'ConstraintNotSatisfiedError', 'TypeError'].includes(error?.name);
      if (!denied && !unsupported) throw error;
      permission.fallback = true; permission.requestError = error.name;
      permission.state = denied ? 'denied' : 'unsupported';
      permission.granted = denied ? false : null;
      // If camera capture itself is denied, this ordinary request still fails
      // and the caller shows the existing camera-permission error.
      stream = await mediaDevices.getUserMedia(constraints);
    }
  } else stream = await mediaDevices.getUserMedia(constraints);
  const { settings, capabilities } = cameraSnapshot(stream.getVideoTracks()[0]);
  permission.actualZoom = Number.isFinite(settings.zoom) ? settings.zoom : null;
  if (supported === true && !permission.fallback) {
    const range = capabilities.zoom;
    const zoomAvailable = !!range && Number.isFinite(range.min) && Number.isFinite(range.max) && range.min > 0 && range.max >= range.min;
    if (!zoomAvailable) permission.state = 'unavailable';
    try {
      const status = await permissions?.query?.({ name: 'camera', panTiltZoom: true });
      if (status?.state === 'denied' || status?.state === 'prompt') {
        permission.state = status.state; permission.granted = false;
      } else if (status?.state === 'granted' && zoomAvailable) {
        permission.state = 'granted'; permission.granted = true;
      }
    } catch { /* PTZ permission queries are not supported in every browser. */ }
  }
  return { stream, permission };
}
export function selectZoom(capabilities, wide = true) {
  const range = capabilities?.zoom;
  if (!range || !Number.isFinite(range.min) || !Number.isFinite(range.max) || range.min <= 0 || range.max < range.min) return null;
  if (wide) return range.min < 1 ? range.min : null;
  const target = clamp(1, range.min, range.max);
  if (!Number.isFinite(range.step) || range.step <= 0) return target;
  const steps = clamp(Math.round((target - range.min) / range.step), 0, Math.floor((range.max - range.min) / range.step + 1e-9));
  return Number((range.min + steps * range.step).toPrecision(12));
}
const wideLabel = /(?:ultra[\s_-]*wide|wide[\s_-]*angle|0[.,]5\s*[x×]|רחב(?:ה)?)/i;
const frontLabel = /(?:front|user|selfie|facetime|קדמי(?:ת)?)/i;
const rearLabel = /(?:back|rear|environment|אחורי(?:ת)?)/i;
export function findWideCamera(devices, { facing = 'user', currentDeviceId } = {}) {
  const candidates = Array.from(devices || []).filter(d => d.kind === 'videoinput' && d.deviceId &&
    d.deviceId !== currentDeviceId && wideLabel.test(d.label || ''));
  // Prefer the selected facing; never infer an unlabeled device's field of view.
  const matching = candidates.find(d => facing === 'user' ? frontLabel.test(d.label) : rearLabel.test(d.label));
  const device = matching || candidates.find(d => rearLabel.test(d.label)) || candidates[0];
  if (!device) return null;
  return { deviceId: device.deviceId, label: device.label,
    facing: frontLabel.test(device.label) ? 'user' : rearLabel.test(device.label) ? 'environment' : null };
}
function zoomMessage({ actualZoom, requestedZoom, wide, wideDevice, error }) {
  if (Number.isFinite(actualZoom)) {
    const actual = `${Number(actualZoom.toFixed(2))}×`;
    if (wide && actualZoom > .5 + .01) return `זום בפועל: ${actual}. זום 0.5 לא זמין במצלמה הזאת.${wideDevice ? ' אפשר לבחור את המצלמה הרחבה שמופיעה למטה.' : ''}`;
    return `זום בפועל: ${actual}.${error ? ' שינוי הזום לא הצליח; אפשר להמשיך עם המצלמה.' : ''}`;
  }
  if (error) return `שינוי הזום לא נתמך או לא הצליח; אפשר להמשיך במצלמה הנוכחית.${wideDevice ? ' נמצאה גם מצלמה רחבה לבחירה.' : ''}`;
  if (requestedZoom != null) return `נשלחה בקשת זום ${requestedZoom}×; הדפדפן לא מדווח מה הזום בפועל.`;
  return `הדפדפן לא מאפשר זום 0.5 במצלמה הזאת.${wideDevice ? ' נמצאה מצלמה רחבה נפרדת; אפשר לבחור בה למטה.' : ' נשתמש בזווית שהמצלמה מאפשרת.'}`;
}
export async function configureZoom(track, { wide = true, mediaDevices = globalThis.navigator?.mediaDevices, facing = 'user', ptz } = {}) {
  let { settings, capabilities } = cameraSnapshot(track);
  const range = capabilities.zoom;
  // Once PTZ is confirmed, restore the lens's widest supported setting even
  // when its minimum is 1 (or larger); permission fallback keeps round 3 rules.
  const minimum = wide && ptz?.granted === true && Number.isFinite(range?.min) && Number.isFinite(range?.max) &&
    range.min > 0 && range.max >= range.min ? range.min : null;
  const requestedZoom = minimum ?? selectZoom(capabilities, wide); let error = null, wideDevice = null;
  if (requestedZoom != null) {
    if (typeof track?.applyConstraints !== 'function') error = 'applyConstraints unavailable';
    else try { await track.applyConstraints({ advanced: [{ zoom: requestedZoom }] }); }
    catch (failure) { error = failure?.name || 'ZoomConstraintError'; }
  }
  ({ settings, capabilities } = cameraSnapshot(track));
  const actualZoom = Number.isFinite(settings.zoom) ? settings.zoom : null;
  // If controls cannot widen the picture, a physical lens may be a separate device.
  if (wide && (requestedZoom == null || error || !(actualZoom != null && actualZoom < 1))) {
    try {
      if (typeof mediaDevices?.enumerateDevices === 'function') wideDevice = findWideCamera(await mediaDevices.enumerateDevices(),
        { facing: settings.facingMode || facing, currentDeviceId: read(track, 'getSettings').deviceId });
    } catch { /* Labels or enumeration can remain unavailable after permission. */ }
  }
  return { settings, capabilities, requestedZoom, actualZoom, wideDevice, error,
    message: zoomMessage({ actualZoom, requestedZoom, wide, wideDevice, error }) };
}
export async function reduceResolution(track, { orientation = 'portrait' } = {}) {
  if (typeof track?.applyConstraints !== 'function') return { ...cameraSnapshot(track), error: 'applyConstraints unavailable' };
  const { video } = cameraConstraints({ orientation, lowResolution: true });
  try { await track.applyConstraints({ width: video.width, height: video.height }); return { ...cameraSnapshot(track), error: null }; }
  catch (error) { return { ...cameraSnapshot(track), error: error?.name || 'ResolutionConstraintError' }; }
}

// Measure delivered frames, including capture gaps, rather than inference speed.
// One startup window per worker; switching models must not erase its history.
export class ModelPerformance {
  constructor({ windowMs = 5000, minFps = 12 } = {}) { this.windowMs = windowMs; this.minFps = minFps; this.start = null; this.frames = 0; this.checked = false; }
  update(timestamp) {
    if (this.checked || !Number.isFinite(timestamp)) return null;
    if (this.start == null) { this.start = timestamp; this.frames = 1; return null; }
    this.frames++;
    const elapsed = timestamp - this.start;
    if (elapsed < this.windowMs) return null;
    this.checked = true;
    const fps = (this.frames - 1) * 1000 / elapsed;
    return { fps, elapsedMs: elapsed, frames: this.frames, fallback: fps < this.minFps };
  }
}
