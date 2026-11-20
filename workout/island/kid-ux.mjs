// Kid UX fixes (design/kid-ux-patches-v1, KUX-001..040). On by default in the browser.
// ?kidUx=0 restores the previous interface; ?kidUx=005,012 keeps only those fixes;
// ?kidUxOff=005,012 turns only those fixes off. Outside a page (unit tests) the fixes stay off.
const ids = text => new Set((text || '').split(',').filter(id => /^\d{3}$/.test(id)));

export function kidUxPolicy(search, inPage) {
  const query = new URLSearchParams(search || '');
  const value = query.get('kidUx');
  const selected = ids(value);
  const off = ids(query.get('kidUxOff'));
  return id => {
    const key = String(id).padStart(3, '0');
    if (value === '0' || off.has(key)) return false;
    if (selected.size) return selected.has(key);
    return value === '1' || (value === null && inPage);
  };
}

const policy = kidUxPolicy(globalThis.location?.search, typeof document === 'object' && Boolean(globalThis.location));

export function kidUx(id) {
  return policy(id);
}

const installedStyles = new Set();
export function kidUxStyle(id, css) {
  if (!kidUx(id)) return;
  const key = String(id).padStart(3, '0') + ':' + css;
  if (installedStyles.has(key)) return;
  installedStyles.add(key);
  const style = document.createElement('style');
  style.dataset.kidUx = String(id).padStart(3, '0');
  style.textContent = css;
  document.head.append(style);
}

export function kidSpeak(text, onUnavailable = () => {}) {
  const engine = globalThis.speechSynthesis;
  const voice = engine?.getVoices().find(({ lang }) => /^(he|iw)([-_]|$)/i.test(lang));
  if (!text || !voice || !globalThis.SpeechSynthesisUtterance) {
    onUnavailable();
    return false;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'he-IL';
  utterance.voice = voice;
  utterance.rate = 0.9;
  utterance.addEventListener('error', ({ error }) => {
    if (error !== 'canceled' && error !== 'interrupted') onUnavailable();
  }, { once: true });

  try {
    engine.cancel();
    engine.speak(utterance);
    return true;
  } catch {
    onUnavailable();
    return false;
  }
}
