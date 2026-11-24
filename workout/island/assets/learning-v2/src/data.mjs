export const DOMAINS = Object.freeze(['math', 'hebrew', 'logic', 'general', 'science']);
export const MIN_AGE = 6;
export const MAX_AGE = 12;

const files = {
  math: new URL('../data/math.json?v=island-v2-20261107-24', import.meta.url),
  hebrew: new URL('../data/hebrew.json?v=island-v2-20261107-24', import.meta.url),
  logic: new URL('../data/logic.json?v=island-v2-20261107-24', import.meta.url),
  general: new URL('../data/general.json?v=island-v2-20261107-24', import.meta.url),
  science: new URL('../data/science.json?v=island-v2-20261107-24', import.meta.url),
};

let request;
export function loadBank() {
  request ??= Promise.all(DOMAINS.map(async domain => {
    const response = await fetch(files[domain]);
    if (!response.ok) throw new Error(`learning bank: ${domain} (${response.status})`);
    const questions = await response.json();
    if (!Array.isArray(questions) || !questions.length || questions.some(q => q?.domain !== domain)) {
      throw new Error(`learning bank: ${domain}`);
    }
    return questions;
  })).then(groups => groups.flat()).catch(error => {
    request = undefined;
    throw error;
  });
  return request;
}
