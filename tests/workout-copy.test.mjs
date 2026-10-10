import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { SAY, SAY_TTS } from '../workout/js/say.js';
import { SAY_UI, SAY_UI_TTS } from '../workout/js/say-ui.js';
import { EXERCISES, CATS } from '../workout/js/exercises.js';
import { PROGRAMS } from '../workout/js/programs.js';
import { numWord, timeCue } from '../workout/js/count.js';
import { VOICE_LINES, VOICE_BY_ID, splitVoiceText, FRAGMENTS } from '../workout/js/voice-lines.js';
import { chooseVoice } from '../workout/js/voice-player.js';
import { exerciseName, workoutName } from '../workout/js/workout-copy.js';

const approved = JSON.parse(await readFile(new URL('./fixtures/workout-approved-copy.json', import.meta.url), 'utf8'));
const marks = /[\u0591-\u05c7]/u;
const plainCopy = text => {
  assert.doesNotMatch(text, marks, text);
  // הנוסח המאושר כולל "שכיבות סמיכה" בשלושה תרגילים. רק הביטוי הזה מוחרג.
  assert.doesNotMatch(text.replaceAll('שכיבות סמיכה', ''), /סמיכה|שימו לב|ניתור|פלאנק|מכרעים|קואורדינציה/u, text);
};
const strings = value => typeof value === 'string' ? [value] :
  value && typeof value === 'object' ? Object.values(value).flatMap(strings) : [];

test('all 50 explanations equal the approved fixture verbatim; each sentence is a visible step', () => {
  assert.equal(EXERCISES.length, 50);
  assert.deepEqual(SAY, approved);
  for (const ex of EXERCISES) {
    assert.equal(ex.steps.join(' '), approved[ex.id], ex.id);
    assert.ok(ex.steps.every(step => /^[^.!?]+[.!?]+$/u.test(step)), ex.id);
    assert.equal(ex.tip, undefined, ex.id);
    plainCopy(ex.name); ex.steps.forEach(plainCopy);
    assert.match(SAY_TTS[ex.id], marks, ex.id);
    assert.equal(VOICE_BY_ID[`exercise-${ex.id}`].text, approved[ex.id]);
  }
});

test('all 25 exercise names change exactly as approved, retaining exercise IDs', () => {
  const names = {
    'ankle-hops': 'קפיצות קפיץ', 'jumping-jacks': 'פתח-סגור',
    'single-leg-hops': 'קפיצות על רגל אחת (כל רגל)', 'step-jumps': 'קפיצה על מדרגה',
    'hall-sprint': 'ריצה מהירה במסדרון', bounding: 'צעדי ענק במסדרון',
    'shuttle-run': 'ריצה מקיר לקיר', 'reaction-sprint': 'ריצה בצפצוף',
    'side-shuffle': 'צעדי צד מקיר לקיר', carioca: 'צעדי צד עם הצלבה',
    skipping: 'דילוגים במסדרון', 'floor-wall-run': 'רצפה וקיר',
    'v-ups': 'סגירת ספר', plank: 'קרש', 'side-plank': 'קרש על הצד (כל צד)',
    'russian-twists': 'סיבובים בישיבה', 'plank-jacks': 'פתח-סגור על הידיים',
    'crab-kicks': 'בעיטות סרטן', lunges: 'ירידה לברך (כל רגל)',
    'wall-sit': 'כיסא נעלם', 'chair-dips': 'דחיפות על כיסא',
    'pike-push-ups': 'שכיבות סמיכה באוהל',
    'quad-stretch': 'מתיחה: עקב לטוסיק (כל רגל)',
    'hamstring-stretch': 'מתיחה: ידיים לרצפה',
    'calf-stretch': 'מתיחה: דוחפים את הקיר (כל רגל)',
  };
  assert.equal(Object.keys(names).length, 25);
  for (const [id, name] of Object.entries(names)) {
    assert.equal(EXERCISES.find(ex => ex.id === id).name, name);
    assert.equal(VOICE_BY_ID[`name-${id}`].text, name);
  }
});

test('catalog display copy is unpointed, each Hebrew line has separate pointed TTS and every ID is retained', () => {
  assert.equal(VOICE_LINES.length, 202);
  assert.equal(new Set(VOICE_LINES.map(line => line.id)).size, 202);
  const expectedIds = [
    ...EXERCISES.flatMap(ex => [`exercise-${ex.id}`, `name-${ex.id}`]),
    ...['costTwo', 'howWas', 'test'].map(id => `ui-${id}`),
    ...Object.keys(SAY_UI.intro).map(id => `intro-${id}`),
    ...Object.entries(SAY_UI.adjust).filter(([, value]) => typeof value === 'string').map(([id]) => `adjust-${id}`),
    ...Object.keys(SAY_UI.levels).map(id => `level-${id}`),
    ...Object.keys(SAY_UI.programs).map(id => `program-${id}`),
    ...Array.from({ length: 7 }, (_, n) => `ordinal-${n + 1}`),
    ...[...Array(20).keys(), 20, 30, 40, 50, 60, 70, 80, 90, 100].map(n => `number-${n}`),
    ...Array.from({ length: 9 }, (_, n) => `number-and-${n + 1}`),
    ...Object.keys(FRAGMENTS),
    ...['goal', 'dunk', 'three', 'sprint'].map(id => `celebration-${id}`),
  ];
  assert.deepEqual(VOICE_LINES.map(line => line.id).sort(), expectedIds.sort());
  for (const line of VOICE_LINES) {
    plainCopy(line.text);
    assert.ok(line.tts, line.id);
    if (line.lang === 'he-IL') {
      assert.match(line.tts, marks, line.id);
      // כל מילה עברית, ולא רק המשפט כולו, מכילה ניקוד.
      for (const word of line.tts.match(/[\u05d0-\u05ea\u0591-\u05c7]+/gu) || []) assert.match(word, marks, line.id + ': ' + word);
      assert.equal(chooseVoice(line.text, new Map())[0].tts, line.tts, line.id);
    }
  }
  for (const ex of EXERCISES) for (const prefix of ['exercise', 'name']) assert.ok(VOICE_BY_ID[`${prefix}-${ex.id}`]);
  for (const id of ['ui-costTwo', 'ui-howWas', 'ui-test', ...Object.keys(SAY_UI.intro).map(id => `intro-${id}`),
    ...Object.keys(SAY_UI.programs).map(id => `program-${id}`), ...Object.keys(SAY_UI.levels).map(id => `level-${id}`),
    ...Object.keys(FRAGMENTS), 'celebration-goal', 'celebration-dunk', 'celebration-three', 'celebration-sprint']) assert.ok(VOICE_BY_ID[id], id);
});

test('display programs, categories and dynamic feedback use full spelling and approved wording', async () => {
  strings([CATS, PROGRAMS, SAY_UI, FRAGMENTS]).forEach(plainCopy);
  assert.equal(SAY_UI.howWas, 'סיימת! איך היה האימון? קל, בדיוק, או קשה?');
  assert.equal(SAY_UI.costTwo, 'המשחק הזה עולה שתי מתנות, כי הוא ארוך יותר.');
  assert.equal(SAY_UI.adjust.top, 'אתה כבר ברמה הכי גבוהה. אלוף אמיתי!');
  assert.equal(SAY_UI.adjust.bottom, 'כל הכבוד שסיימת! זו הרמה הכי קלה, ובפעם הבאה יהיה לך יותר קל כי אתה מתחזק.');
  assert.equal(numWord(2), 'שתיים'); assert.equal(numWord(12), 'שתים עשרה');
  assert.equal(numWord(22), 'עשרים ושתיים'); assert.equal(numWord(50), 'חמישים'); assert.equal(numWord(62), 'שישים ושתיים');
  assert.equal(SAY_UI.ordinals[6], 'השישי');
  for (const name of [...Object.values(SAY_UI.programs), ...EXERCISES.map(ex => ex.name), 'אימון חופשי'])
    for (const fn of [SAY_UI.adjust.boost, SAY_UI.adjust.swaps]) {
      const text = fn(name); plainCopy(text);
      assert.ok(splitVoiceText(text).every(part => part.id), text);
      assert.match(chooseVoice(text, new Map())[0].tts, marks);
    }
  for (let n = 0; n <= 100; n++) {
    plainCopy(numWord(n));
    assert.ok(splitVoiceText(numWord(n)).every(part => part.id), String(n));
  }
  for (const thisWeek of [1, 6, 8, 25]) for (const workouts of [1, 5, 100]) {
    const text = SAY_UI.perseverance({ thisWeek, workouts, streak: 23 }); plainCopy(text);
    assert.ok(splitVoiceText(text).every(part => part.id), text);
  }
  assert.match(SAY_UI_TTS.howWas, marks);
  // טקסטים קבועים נוספים, כולל משחקי מילים ויומן כדורסל, לא מחזירים מונחים ישנים.
  async function inspect(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
      if (entry.isDirectory()) { await inspect(url); continue; }
      if (!entry.name.endsWith('.js')) continue;
      const source = (await readFile(url, 'utf8')).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '').replaceAll('שכיבות סמיכה', '');
      assert.doesNotMatch(source, /סמיכה|שימו לב|ניתור|פלאנק|מכרעים|קואורדינציה/u, url.pathname);
    }
  }
  await inspect(new URL('../workout/js/', import.meta.url));
});

test('missing clips use pointed TTS for a whole explanation and each part of a dynamic sentence', () => {
  const example = chooseVoice(SAY['plank-jacks'], new Map());
  assert.equal(example[0].text, approved['plank-jacks']);
  assert.equal(example[0].tts, SAY_TTS['plank-jacks']);
  const parts = chooseVoice(timeCue(20, 60), new Map([['number-20', { duration: .3 }]]));
  assert.deepEqual(parts.map(p => p.kind), ['speech', 'recording', 'speech']);
  assert.deepEqual(parts.map(p => p.tts), ['עוֹד', 'עֶשְׂרִים', 'שְׁנִיּוֹת']);
  assert.equal(chooseVoice(SAY_UI.adjust.boost(SAY_UI.programs['jump-a']), new Map())[0].tts,
    'הָיָה קַל? מֵעַכְשָׁו קְפִיצוֹת אָלֶף עִם עוֹד קְצָת חֲזָרוֹת וּזְמַן.');
});

test('saved workouts show current names while preserving historical data and unknown names', () => {
  const item = { exId: 'plank', name: 'פלאנק', done: 17 };
  const session = { programId: 'jump-a', programName: 'ניתור א׳: הבסיס', items: [item] };
  assert.equal(exerciseName(item), 'קרש'); assert.equal(item.name, 'פלאנק'); assert.equal(item.done, 17);
  assert.equal(workoutName(session), 'קפיצות א׳: הבסיס');
  assert.equal(workoutName({ ...session, together: { mode: 'workout' } }), 'אבא ואני: קפיצות א׳: הבסיס');
  assert.equal(workoutName({ program: { id: 'solo', name: 'פלאנק' }, items: [item] }), 'קרש');
  assert.equal(exerciseName({ exId: 'unknown', name: 'תרגיל נוסף' }), 'תרגיל נוסף');
});
