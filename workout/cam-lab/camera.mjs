// Browser camera controls only. No pixels, storage or network requests.
export function cameraConstraints(portrait, deviceId = '') {
  return { audio: false, video: {
    ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' }),
    width: { ideal: portrait ? 480 : 640, max: portrait ? 480 : 640 },
    height: { ideal: portrait ? 640 : 480, max: portrait ? 640 : 480 },
    frameRate: { ideal: 20, max: 24 },
  } };
}
export function chooseZoom(capabilities, wide = true) {
  const z = capabilities?.zoom;
  if (!z || !Number.isFinite(z.min) || !Number.isFinite(z.max) || z.min <= 0 || z.max < z.min) return null;
  if (wide) return z.min < 1 ? z.min : null;
  const target = Math.max(z.min, Math.min(z.max, 1));
  return z.step > 0 ? Math.min(z.max, z.min + Math.round((target - z.min) / z.step) * z.step) : target;
}
export function wideCameras(devices, currentId = '') {
  return devices.filter(d => d.kind === 'videoinput' && d.deviceId && d.deviceId !== currentId &&
    /ultra[\s_-]*wide|wide[\s_-]*angle|\bwide\b|0[.,]5|רחב/i.test(d.label || ''));
}
export async function configureCamera(track, mediaDevices, wide = true) {
  let caps = {};
  try { caps = track.getCapabilities?.() || {}; } catch { /* Optional API. */ }
  const target = chooseZoom(caps, wide);
  let applied = false;
  if (target != null && track.applyConstraints) {
    try { await track.applyConstraints({ advanced: [{ zoom: target }] }); applied = true; }
    catch { /* Keep the working camera and show the actual settings. */ }
  }
  const settings = track.getSettings?.() || {};
  // A fulfilled applyConstraints is not proof: some browsers ignore zoom.
  const wideApplied = applied && Number.isFinite(settings.zoom) && settings.zoom < 1;
  let alternatives = [];
  if (wide && !wideApplied) {
    try { alternatives = wideCameras(await mediaDevices.enumerateDevices?.() || [], settings.deviceId); }
    catch { /* Device labels can remain unavailable after permission. */ }
  }
  return { zoom: Number.isFinite(settings.zoom) ? settings.zoom : 0,
    width: settings.width || 0, height: settings.height || 0,
    zoomSupported: +!!caps.zoom, wideApplied: +wideApplied, requestedWide: +wide,
    alternatives };
}
export function cameraSummary(info) {
  const zoom = info.zoom ? `${Number(info.zoom.toFixed(2))}` : 'לא דווח';
  const size = info.width && info.height ? `${info.width}×${info.height}` : 'לא דווח';
  return `בפועל: זום ${zoom} · גודל ${size}. ` + (info.requestedWide ? info.wideApplied ?
    'הדפדפן אישר זום מתחת ל־1; אין בכך זיהוי של עדשת 0.5.' :
    'הדפדפן לא אישר זום רחב. ייתכן שעדשת 0.5 אינה זמינה כאן.' : 'נבחר מצב רגיל.');
}
