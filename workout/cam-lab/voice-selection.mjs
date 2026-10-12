export const isHebrewVoice = voice => /^(he|iw)(?:[-_]|$)/i.test(voice?.lang || '');
export const voiceId = voice => voice.voiceURI || `${voice.lang}:${voice.name || ''}`;
export const hebrewVoices = voices => (voices || []).filter(isHebrewVoice);
export const preferredHebrewVoices = voices => {
  const hebrew = hebrewVoices(voices), local = hebrew.filter(v => v.localService === true);
  return local.length ? local : hebrew;
};

export function selectHebrewVoice(voices, chosenId = '') {
  const eligible = preferredHebrewVoices(voices);
  return eligible.find(v => voiceId(v) === chosenId) || eligible.find(v => v.default) || eligible[0] || null;
}
