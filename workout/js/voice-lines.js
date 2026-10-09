// קטלוג אחד משותף לנגן, לדף ההקלטה ול-LINES.md. בלי גישה לדפדפן או לנתוני הילד.
import { SAY } from './say.js?v=20261009-weekly-1';
import { SAY_UI } from './say-ui.js?v=20261009-weekly-1';
import { EXERCISES } from './exercises.js?v=20261009-weekly-1';
import { numWord } from './count.js?v=20261009-weekly-1';

export const VOICE_VERSION = '20261008-voice-1';
export const normalizeVoice = text => String(text).replace(/[֑-ׇ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
const lines = [];
const add = (id, text, source, lang = 'he-IL') => lines.push(Object.freeze({ id, text, source, lang, file: `${id}.wav` }));
for (const [id, text] of Object.entries(SAY)) add(`exercise-${id}`, text, `workout/js/say.js: SAY[${id}]; workout/js/app.js: wireHelp / sayText`);
for (const ex of EXERCISES) add(`name-${ex.id}`, ex.name, `workout/js/exercises.js: ${ex.id}.name; workout/js/app.js: adjustDifficulty (אימון יחיד)`);
for (const key of ['costTwo', 'howWas', 'test']) add(`ui-${key}`, SAY_UI[key], `workout/js/say-ui.js: SAY_UI.${key}; workout/js/app.js`);
for (const [id, text] of Object.entries(SAY_UI.intro)) add(`intro-${id}`, text, `workout/js/say-ui.js: SAY_UI.intro.${id}; workout/js/app.js: introPhase`);
for (const [id, text] of Object.entries(SAY_UI.adjust)) if (typeof text === 'string') add(`adjust-${id}`, text, `workout/js/say-ui.js: SAY_UI.adjust.${id}; workout/js/app.js: adjustDifficulty`);
for (const [id, text] of Object.entries(SAY_UI.levels)) add(`level-${id}`, text, `workout/js/say-ui.js: SAY_UI.levels.${id}; SAY_UI.adjust.level / downLevel`);
for (const [id, text] of Object.entries(SAY_UI.programs)) add(`program-${id}`, text, `workout/js/say-ui.js: SAY_UI.programs[${id}]; workout/js/app.js: adjustDifficulty`);
SAY_UI.ordinals.forEach((text, n) => { if (text) add(`ordinal-${n}`, text, 'workout/js/say-ui.js: SAY_UI.ordinals / perseverance'); });
for (const n of [...Array(20).keys(), 20, 30, 40, 50, 60, 70, 80, 90]) add(`number-${n}`, numWord(n), 'workout/js/count.js: numWord / timeCue; workout/js/app.js: wireReps / minuteScreen; SAY_UI.perseverance');
for (let n = 1; n < 10; n++) add(`number-and-${n}`, `וְ${numWord(n)}`, 'workout/js/count.js: numWord (אחדות אחרי עשרות)');
add('number-100', 'מֵאָה', 'workout/js/say-ui.js: SAY_UI.perseverance (100 אימונים)');

export const FRAGMENTS = {
  'time-more': 'עוֹד', 'time-seconds': 'שְׁנִיּוֹת',
  start: 'מַתְחִילִים!', finished: 'סִיַּמְתָּ!', encourage: 'כָּל הַכָּבוֹד!',
  'minute-end': 'הַדַּקָּה הִסְתַּיְּמָה. כָּל תְּנוּעָה נֶחְשֶׁבֶת.',
  'minute-start': 'מַתְחִילִים. בַּקֶּצֶב שֶׁלְּךָ.',
  thanks: 'תּוֹדָה, רָשַׁמְתִּי.',
  'program-free': 'אימון חופשי',
  'boost-before': 'הָיָה קַל? מֵעַכְשָׁו',
  'boost-after': 'עִם עוֹד קְצָת חֲזָרוֹת וּזְמַן.',
  'swaps-before': 'הָיָה קַל? בְּ',
  'swaps-after': 'נִכְנָסִים תַּרְגִּילִים קָשִׁים יוֹתֵר.',
  'level-before': 'וָאוּ. עָלִיתָ לְרָמָה',
  'level-after': 'בְּכָל הָאִמּוּנִים!',
  'down-before': 'הוֹרַדְתִּי לְרָמָה',
  'down-after': 'לְאַט לְאַט בּוֹנִים כּוֹחַ.',
  'week-before': 'כָּל הַכָּבוֹד! זֶה הָאִמּוּן',
  'week-after': 'שֶׁלְּךָ הַשָּׁבוּעַ.',
  'number-label': 'מִסְפָּר',
  'streak-after': 'יָמִים בְּרֶצֶף!',
  'first-workout': 'הָאִמּוּן הָרִאשׁוֹן בִּכְלָל. הַתְחָלָה מְעֻלָּה!',
  'milestone-before': 'וְזֶה הָאִמּוּן מִסְפָּר',
  'milestone-after': 'שֶׁלְּךָ. וָאוּ!',
  'cost-two-short': 'שִׂים לֵב, הַמִּשְׂחָק הַזֶּה עוֹלֶה שְׁתֵּי מַתָּנוֹת.',
};
for (const [id, text] of Object.entries(FRAGMENTS)) {
  const source = /^time-|^(start|finished)$/.test(id) ? 'workout/js/count.js: timeCue; workout/js/app.js: wireTimer' :
    /^minute-/.test(id) ? 'workout/js/app.js: minuteScreen' :
    /^(boost|swaps|level|down)-/.test(id) ? `workout/js/say-ui.js: SAY_UI.adjust.${id.split('-')[0] === 'down' ? 'downLevel' : id.split('-')[0]}; workout/js/app.js: adjustDifficulty` :
    /^(week|streak|milestone)-|^(number-label|first-workout)$/.test(id) ? 'workout/js/say-ui.js: SAY_UI.perseverance; workout/js/app.js: askFeedback' :
    id === 'program-free' ? 'workout/js/app.js: free / adjustDifficulty' :
    id === 'thanks' ? 'workout/js/app.js: askFeedback (משוב ללא תוכנית)' :
    id === 'cost-two-short' ? 'workout/js/app.js: arcade (גיבוי ל-SAY_UI.costTwo)' :
    'workout/js/app.js: wireReps / wireTimer';
  add(id, text, source);
}
// גם אמירות קיימות בהקלטות המשחקים נכללות בקטלוג. אפקטים בלי מילים אינם משפטים.
for (const [id, text, lang] of [['goal', 'Gooooooooooool!', 'pt-BR'], ['dunk', 'בּוּם!', 'he-IL'], ['three', 'סַל!', 'he-IL'], ['sprint', 'מָקוֹם רִאשׁוֹן!', 'he-IL']])
  add(`celebration-${id}`, text, `workout/js/games/celebrate.js / celebrate3d.js: say; הקלטה קיימת workout/snd/${id}.mp4`, lang);

export const VOICE_LINES = Object.freeze(lines);
export const VOICE_BY_ID = Object.freeze(Object.fromEntries(lines.map(line => [line.id, line])));
const exact = new Map(lines.map(line => [`${line.lang}:${normalizeVoice(line.text)}`, line]));
const part = id => ({ id, text: VOICE_BY_ID[id].text });
export function numberParts(n) {
  if (!Number.isInteger(n) || n < 0 || n > 100) return [{ id: null, text: String(n) }];
  if (n < 20 || n % 10 === 0) return [part(`number-${n}`)];
  return [part(`number-${Math.floor(n / 10) * 10}`), part(`number-and-${n % 10}`)];
}
const numbers = new Map(Array.from({ length: 100 }, (_, n) => [normalizeVoice(numWord(n)), n]));
const templates = [
  ['boost-before', 'boost-after'], ['swaps-before', 'swaps-after'],
  ['level-before', 'level-after'], ['down-before', 'down-after'],
  ['time-more', 'time-seconds'], ['milestone-before', 'milestone-after'],
];
const stripEdge = text => text.trim().replace(/^[.!?\s]+|[.!?\s]+$/g, '');

// עובדים על הטקסט המקורי: חלק לא מוכר נשאר בדיוק כפי שנשלח לקול הקיים.
export function splitVoiceText(text, lang = 'he-IL') {
  text = String(text).trim(); if (!text) return [];
  const normalized = normalizeVoice(text);
  if (lang === 'he-IL') {
    if (/^\d+$/.test(normalized)) return numberParts(Number(normalized));
    if (numbers.has(normalized)) return numberParts(numbers.get(normalized));
  }
  const known = exact.get(`${lang}:${normalized}`);
  if (known) return [{ id: known.id, text }];
  if (lang !== 'he-IL') return [{ id: null, text }];
  const weekAt = text.indexOf(FRAGMENTS['week-before']);
  if (weekAt > 0) return [...splitVoiceText(text.slice(0, weekAt)), ...splitVoiceText(text.slice(weekAt))];
  for (const [before, after] of templates) {
    const prefix = FRAGMENTS[before], suffix = FRAGMENTS[after];
    if (text.startsWith(prefix) && text.endsWith(suffix))
      return [part(before), ...splitVoiceText(stripEdge(text.slice(prefix.length, -suffix.length))), part(after)];
  }
  if (text.startsWith(FRAGMENTS['week-before'])) {
    const end = text.indexOf(FRAGMENTS['week-after']);
    if (end > 0) return [part('week-before'), ...splitVoiceText(text.slice(FRAGMENTS['week-before'].length, end)), part('week-after'), ...splitVoiceText(text.slice(end + FRAGMENTS['week-after'].length))];
  }
  if (text.startsWith(`${FRAGMENTS['number-label']} `))
    return [part('number-label'), ...splitVoiceText(text.slice(FRAGMENTS['number-label'].length))];
  const streak = text.match(/^(\d+) יָמִים בְּרֶצֶף!\s*(.*)$/s);
  if (streak) return [...numberParts(Number(streak[1])), part('streak-after'), ...splitVoiceText(streak[2])];
  if (text.startsWith(FRAGMENTS['first-workout']))
    return [part('first-workout'), ...splitVoiceText(text.slice(FRAGMENTS['first-workout'].length))];
  if (text.endsWith(FRAGMENTS.encourage))
    return [...splitVoiceText(stripEdge(text.slice(0, -FRAGMENTS.encourage.length))), part('encourage')];
  return [{ id: null, text }];
}

export function voiceLinesMarkdown() {
  const rows = VOICE_LINES.map(l => `| \`${l.id}\` | ${l.text.replaceAll('|', '\\|')} | ${l.source} | \`${l.file}\` |`);
  return `# משפטים להקלטה\n\n${VOICE_LINES.length} משפטים וחלקים קבועים. מקור הקטלוג: workout/js/voice-lines.js.\n\n` +
    'מקליטים בטלפון ב־https://roynaor-work.github.io/Bakasun/workout/voice-rec/ (אחרי מיזוג). Chrome באנדרואיד או Safari באייפון, דרך HTTPS. אין קישור מהאפליקציה.\n\n' +
    '1. מאשרים מיקרופון, לוחצים הקלטה וקוראים רק את הטקסט. לוחצים עצירה.\n2. מאזינים, מקליטים שוב אם צריך, ועוברים למשפט הבא. אפשר לדלג ולהוריד גם אוסף חלקי.\n3. בסיום מורידים ZIP. מחלצים את קובצי WAV אל workout/snd/voice/ ושומרים את השמות. שינוי ההקלטות מחייב עדכון VOICE_VERSION ותגי המטמון של workout/index.html וייבוא speech.js ב־app.js.\n\n' +
    'ההקלטות נשמרות ב־IndexedDB במכשיר בלבד, גם אחרי רענון; אין העלאה. כדאי להוריד ZIP לפני ניקוי נתוני הדפדפן. ההורדה כוללת רק הקלטות שנעשו.\n\n' +
    'דברו בחום ובקצב טבעי, בלי לקרוא את המזהה. לחלקים קצרים: בלי שתיקה לפני/אחרי. השקט בקצוות נחתך אוטומטית. כ־12–16 דקות דיבור נטו, וכ־25–40 דקות כולל כפתורים, האזנה ותיקונים.\n\n' +
    'פירוק: עוד + מספר + שניות; מספר + כל הכבוד; משוב + שם תוכנית/תרגיל או רמה + סיומת; האימון + מספר סודר/מספר + שלך השבוע; מספר + ימים ברצף. מספרי 21–99 משתמשים בעשרות ובאחדות עם ו׳ (23 = number-20 + number-and-3). 100 מוקלט פעם אחת. מספרים גדולים יותר ושמות חדשים משתמשים בקול הקיים, בלי לשמור מידע אישי בקטלוג. מספרים בתוך הסבר קבוע הם חלק מההסבר.\n\n' +
    'הנגן טוען ומפענח מראש, ומתזמן חלקי WAV רצופים בשעון Web Audio ללא רווח נוסף. כל חלקי המשפט מוכנים לפני תחילת הניגון, גם אם נאמר לפני סיום הטעינה הראשונית. חלק חסר או פגום חוזר לקול הקיים. האפקטים הקיימים ללא מילים (צחוק, צפצוף, קהל) אינם דורשים הקלטת משפט. ההקלטות הישנות של חגיגות נשארות גיבוי.\n\n' +
    '| מזהה | הטקסט המדויק | איפה נאמר בקוד | שם קובץ צפוי |\n|---|---|---|---|\n' + rows.join('\n') + '\n';
}
