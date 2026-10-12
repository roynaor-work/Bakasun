import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../workout/cam-lab/index.html', import.meta.url), 'utf8');
const warning = html.match(/id="upload-off-banner"[^>]*>([^<]+)/)[1];

test('upload warning is spoken once, only for disabled uploads with a local Hebrew voice', async () => {
  const saved = new Map();
  const replace = (key, value) => {
    if (!saved.has(key)) saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  };
  try {
    for (const [name, config, initialVoices] of [
      ['delayed-local', null, []],
      ['remote-only', null, [{ lang: 'he-IL', localService: false }]],
      ['active', { endpoint: 'https://upload.example.invalid/receive', secret: 'synthetic-key', consentId: 'synthetic-consent' }, [{ lang: 'he-IL', localService: true }]],
    ]) {
      const elements = new Map(), speech = [], handlers = {};
      let voices = initialVoices;
      const get = id => {
        if (!elements.has(id)) elements.set(id, { hidden: false, checked: true, textContent: '', before() {}, addEventListener() {} });
        return elements.get(id);
      };
      get('overlay').getContext = () => ({});
      get('upload-off-banner').textContent = warning;
      replace('document', { getElementById: get, addEventListener() {} });
      replace('window', { location: { hash: '' }, addEventListener() {}, speechSynthesis: {
        getVoices: () => voices, addEventListener: (name, handler) => { handlers[name] = handler; },
        cancel() {}, speak: utterance => speech.push(utterance),
      } });
      replace('localStorage', { getItem: () => JSON.stringify(config) });
      replace('indexedDB', { open() { throw new Error('synthetic unavailable queue'); } });
      replace('SpeechSynthesisUtterance', class { constructor(text) { this.text = text; } });
      replace('performance', { now: () => 0 });
      await import(`../workout/cam-lab/app.mjs?warning=${name}`);
      assert.equal(get('upload-off-banner').hidden, !!config);
      assert.equal(get('upload-on-banner').hidden, !config);
      assert.equal(speech.length, 0);
      if (name === 'delayed-local') {
        voices = [{ lang: 'he_IL', localService: true }];
        handlers.voiceschanged(); handlers.voiceschanged();
        get('again').onclick(); handlers.voiceschanged();
        assert.equal(speech.length, 1);
        assert.equal(speech[0].text.replace(/[\u0591-\u05c7]/g, ''), warning);
        assert.equal(speech[0].voice.localService, true);
      } else {
        handlers.voiceschanged();
        assert.equal(speech.length, 0);
      }
    }
  } finally {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
});
