export const isHebrewVoice = voice => /^(he|iw)(?:[-_]|$)/i.test(voice?.lang || '');
export const voiceId = voice => voice.voiceURI || `${voice.lang}:${voice.name || ''}`;
export const localVoices = voices => (voices || []).filter(v => v.localService === true);

export function selectLocalVoice(voices, chosenId = '') {
  const local = localVoices(voices);
  return local.find(v => voiceId(v) === chosenId) ||
    local.find(v => isHebrewVoice(v) && v.default) || local.find(isHebrewVoice) ||
    local.find(v => v.default) || local[0] || null;
}
