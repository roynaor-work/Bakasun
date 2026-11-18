import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import {DOMAINS, MIN_AGE, MAX_AGE} from '../src/data.mjs';

const removeMarks = text => text.normalize('NFKD').replace(/\p{M}/gu, '');
const fold = text => removeMarks(text)
  .replace(/[.](?!\d)|(?<!\d)[.]/gu, ' ')
  .replace(/[^\p{L}\p{N}+−\-×÷%/=<>.]+/gu, ' ')
  .trim();
const containsArabic = /\p{Script_Extensions=Arabic}/u;
const speechAlphabet = /^[\u05b0-\u05f4\s.,?!:;…–—'"“”‘’()-]+$/u;
const words = /[א-ת](?:[א-ת]|[\u05b0-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7])*/gu;
const vowel = /[\u05b0-\u05bb\u05c7]|וּ/u;

function checkText(text, label, {min = 1, max, speech = false}) {
  assert.equal(typeof text, 'string', label);
  assert.equal(text, text.trim(), label);
  const size = [...removeMarks(text)].length;
  assert.ok(size >= min && size <= max, `${label} (length ${size})`);
  assert.doesNotMatch(text, containsArabic, label);
  if (!speech) return;
  assert.match(text, speechAlphabet, `${label} (speech spelling or notation)`);
  const tokens = text.match(words) ?? [];
  assert.ok(tokens.length, label);
  for (const token of tokens) assert.match(token, vowel, `${label} (unpointed: ${token})`);
}

function numericOption(text) {
  const value = removeMarks(text).replace(/\s/gu, '').replace('−', '-');
  const fraction = value.match(/^(-?\d+)\/(\d+)$/u);
  if (fraction && Number(fraction[2])) return Number(fraction[1]) / Number(fraction[2]);
  if (/^-?\d+(?:\.\d+)?%$/u.test(value)) return Number(value.slice(0, -1)) / 100;
  if (/^-?\d+(?:\.\d+)?$/u.test(value)) return Number(value);
  return null;
}

const sources = await Promise.all(DOMAINS.map(async domain => {
  const json = await readFile(new URL(`../data/${domain}.json`, import.meta.url), 'utf8');
  return {domain, json, questions: JSON.parse(json)};
}));
const questions = sources.flatMap(source => source.questions);

test('the bank covers ages 6–12 and all five domains at three difficulties', () => {
  assert.ok(questions.length >= 600);
  for (const {domain, json, questions} of sources) {
    assert.doesNotMatch(json, containsArabic);
    assert.ok(questions.every(question => question.domain === domain), domain);
    for (let age = MIN_AGE; age <= MAX_AGE; age++) {
      for (let difficulty = 1; difficulty <= 3; difficulty++) {
        const group = questions.filter(q => q.age === age && q.difficulty === difficulty);
        assert.ok(group.length >= 5, `${domain} age ${age} difficulty ${difficulty}`);
      }
    }
  }
});

test('questions have unique prompts, one marked answer, and pointed speech', () => {
  const ids = new Set();
  const prompts = new Set();
  const spokenPrompts = new Set();
  for (const q of questions) {
    const id = q.id;
    assert.match(id, new RegExp(`^${q.domain}-${q.age}-[0-9]{2,}$`, 'u'));
    assert.ok(!ids.has(id), id);
    ids.add(id);
    assert.match(q.topic, /^[a-z]+(?:-[a-z]+)*$/u, id);
    assert.ok(Number.isInteger(q.age) && q.age >= MIN_AGE && q.age <= MAX_AGE, id);
    assert.ok([1, 2, 3].includes(q.difficulty), id);
    assert.ok(Array.isArray(q.options) && q.options.length === 4, id);
    assert.ok(Array.isArray(q.speech?.options) && q.speech.options.length === q.options.length, id);
    assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length, id);
    assert.equal(new Set(q.options.map(fold)).size, q.options.length, `${id} duplicate options`);
    assert.equal(new Set(q.speech.options.map(fold)).size, q.options.length, `${id} duplicate spoken options`);
    const correctNumber = numericOption(q.options[q.answer]);
    if (q.domain === 'math' && correctNumber !== null) {
      assert.equal(q.options.filter(option => numericOption(option) === correctNumber).length, 1, `${id} equivalent numeric answers`);
    }

    checkText(q.prompt, `${id} prompt`, {min: 12, max: 180});
    checkText(q.speech.prompt, `${id} speech.prompt`, {min: 12, max: 260, speech: true});
    for (const [text, seen] of [[q.prompt, prompts], [q.speech.prompt, spokenPrompts]]) {
      const key = fold(text);
      assert.ok(!seen.has(key), `${id} duplicate prompt: ${text}`);
      seen.add(key);
    }
    for (const field of ['hint', 'explanation']) {
      checkText(q[field], `${id} ${field}`, {min: 4, max: 200});
      checkText(q.speech[field], `${id} speech.${field}`, {min: 4, max: 260, speech: true});
    }
    for (let index = 0; index < q.options.length; index++) {
      checkText(q.options[index], `${id} option ${index}`, {max: 100});
      checkText(q.speech.options[index], `${id} spoken option ${index}`, {max: 150, speech: true});
    }
  }
});

test('both outcomes link to distinct follow-up questions in the same domain', () => {
  const byId = new Map(questions.map(q => [q.id, q]));
  for (const q of questions) {
    assert.notEqual(q.followUps.correct, q.followUps.incorrect, q.id);
    for (const target of [q.followUps.correct, q.followUps.incorrect]) {
      const next = byId.get(target);
      assert.ok(next && next.id !== q.id, q.id);
      assert.equal(next.domain, q.domain, q.id);
      assert.ok(Math.abs(next.age - q.age) <= 1, q.id);
    }
  }
});
