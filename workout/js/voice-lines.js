// קטלוג אחד משותף לנגן, לדף ההקלטה ול-LINES.md. בלי גישה לדפדפן או לנתוני הילד.
import { SAY, SAY_TTS } from './say.js?v=20261010-camera-1';
import { SAY_UI, SAY_UI_TTS } from './say-ui.js?v=20261010-camera-1';
import { EXERCISES } from './exercises.js?v=20261010-camera-1';
import { numWord, numWordTts } from './count.js?v=20261010-camera-1';

export const VOICE_VERSION = '20261010-camera-1';
export const normalizeVoice = text => String(text).replace(/[֑-ׇ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
const lines = [];
const add = (id, text, tts, source, lang = 'he-IL') => lines.push(Object.freeze({ id, text, tts, source, lang, file: `${id}.wav` }));
for (const [id, text] of Object.entries(SAY)) add(`exercise-${id}`, text, SAY_TTS[id], `workout/js/say.js: SAY[${id}]; workout/js/app.js: wireHelp / sayText`);
for (const ex of EXERCISES) {
  const suffix = ex.name.includes('(כל רגל)') ? ' (כָּל רֶגֶל)' : ex.name.includes('(כל צד)') ? ' (כָּל צַד)' : '';
  add(`name-${ex.id}`, ex.name, SAY_TTS[ex.id].split('. ')[0] + suffix, `workout/js/exercises.js: ${ex.id}.name; workout/js/app.js: adjustDifficulty (אימון יחיד)`);
}
for (const key of ['costTwo', 'howWas', 'test']) add(`ui-${key}`, SAY_UI[key], SAY_UI_TTS[key], `workout/js/say-ui.js: SAY_UI.${key}; workout/js/app.js`);
for (const [id, text] of Object.entries(SAY_UI.intro)) add(`intro-${id}`, text, SAY_UI_TTS.intro[id], `workout/js/say-ui.js: SAY_UI.intro.${id}; workout/js/app.js: introPhase`);
for (const [id, text] of Object.entries(SAY_UI.adjust)) if (typeof text === 'string') add(`adjust-${id}`, text, SAY_UI_TTS.adjust[id], `workout/js/say-ui.js: SAY_UI.adjust.${id}; workout/js/app.js: adjustDifficulty`);
for (const [id, text] of Object.entries(SAY_UI.levels)) add(`level-${id}`, text, SAY_UI_TTS.levels[id], `workout/js/say-ui.js: SAY_UI.levels.${id}; SAY_UI.adjust.level / downLevel`);
for (const [id, text] of Object.entries(SAY_UI.programs)) add(`program-${id}`, text, SAY_UI_TTS.programs[id], `workout/js/say-ui.js: SAY_UI.programs[${id}]; workout/js/app.js: adjustDifficulty`);
SAY_UI.ordinals.forEach((text, n) => { if (text) add(`ordinal-${n}`, text, SAY_UI_TTS.ordinals[n], 'workout/js/say-ui.js: SAY_UI.ordinals / perseverance'); });
for (const n of [...Array(20).keys(), 20, 30, 40, 50, 60, 70, 80, 90]) add(`number-${n}`, numWord(n), numWordTts(n), 'workout/js/count.js: numWord / timeCue; workout/js/app.js: wireReps / minuteScreen; SAY_UI.perseverance');
for (let n = 1; n < 10; n++) add(`number-and-${n}`, `ו${numWord(n)}`, `וְ${numWordTts(n)}`, 'workout/js/count.js: numWord (אחדות אחרי עשרות)');
add('number-100', 'מאה', 'מֵאָה', 'workout/js/say-ui.js: SAY_UI.perseverance (100 אימונים)');

export const FRAGMENTS_TTS = {
  'time-more': 'עוֹד', 'time-seconds': 'שְׁנִיּוֹת',
  start: 'מַתְחִילִים!', finished: 'סִיַּמְתָּ!', encourage: 'כָּל הַכָּבוֹד!',
  'minute-end': 'הַדַּקָּה הִסְתַּיְּמָה. כָּל תְּנוּעָה נֶחְשֶׁבֶת.',
  'minute-start': 'מַתְחִילִים. בַּקֶּצֶב שֶׁלְּךָ.',
  'companion-upgraded': 'הַדְּמוּת שֶׁלְּךָ הִשְׁתַּפְּרָה! גְּדֵלִים יַחַד, בַּקֶּצֶב שֶׁלְּךָ.',
  thanks: 'תּוֹדָה, רָשַׁמְתִּי.',
  'program-free': 'אִימּוּן חוֹפְשִׁי',
  'boost-before': 'הָיָה קַל? מֵעַכְשָׁו',
  'boost-after': 'עִם עוֹד קְצָת חֲזָרוֹת וּזְמַן.',
  'swaps-before': 'הָיָה קַל? בְּ',
  'swaps-after': 'נִכְנָסִים תַּרְגִּילִים קָשִׁים יוֹתֵר.',
  'level-before': 'וַואוּ. עָלִיתָ לְרָמָה',
  'level-after': 'בְּכָל הָאִמּוּנִים!',
  'down-before': 'הוֹרַדְתִּי לְרָמָה',
  'down-after': 'לְאַט לְאַט בּוֹנִים כּוֹחַ.',
  'week-before': 'כָּל הַכָּבוֹד! זֶה הָאִמּוּן',
  'week-after': 'שֶׁלְּךָ הַשָּׁבוּעַ.',
  'number-label': 'מִסְפָּר',
  'streak-after': 'יָמִים בְּרֶצֶף!',
  'first-workout': 'הָאִמּוּן הָרִאשׁוֹן שֶׁלְּךָ. הַתְחָלָה מְעֻלָּה!',
  'milestone-before': 'וְזֶה הָאִמּוּן מִסְפָּר',
  'milestone-after': 'שֶׁלְּךָ. וַואוּ!',
  'cost-two-short': 'הַמִּשְׂחָק הַזֶּה עוֹלֶה שְׁתֵּי מַתָּנוֹת.',
};
export const FRAGMENTS = {
  'time-more': 'עוד', 'time-seconds': 'שניות',
  start: 'מתחילים!', finished: 'סיימת!', encourage: 'כל הכבוד!',
  'minute-end': 'הדקה הסתיימה. כל תנועה נחשבת.',
  'minute-start': 'מתחילים. בקצב שלך.',
  'companion-upgraded': 'הדמות שלך השתפרה! גדלים יחד, בקצב שלך.',
  thanks: 'תודה, רשמתי.', 'program-free': 'אימון חופשי',
  'boost-before': 'היה קל? מעכשיו', 'boost-after': 'עם עוד קצת חזרות וזמן.',
  'swaps-before': 'היה קל? ב', 'swaps-after': 'נכנסים תרגילים קשים יותר.',
  'level-before': 'וואו. עלית לרמה', 'level-after': 'בכל האימונים!',
  'down-before': 'הורדתי לרמה', 'down-after': 'לאט לאט בונים כוח.',
  'week-before': 'כל הכבוד! זה האימון', 'week-after': 'שלך השבוע.',
  'number-label': 'מספר', 'streak-after': 'ימים ברצף!',
  'first-workout': 'האימון הראשון שלך. התחלה מעולה!',
  'milestone-before': 'וזה האימון מספר', 'milestone-after': 'שלך. וואו!',
  'cost-two-short': 'המשחק הזה עולה שתי מתנות.',
};
for (const [id, text] of Object.entries(FRAGMENTS)) {
  const source = /^time-|^(start|finished)$/.test(id) ? 'workout/js/count.js: timeCue; workout/js/app.js: wireTimer' :
    /^minute-/.test(id) ? 'workout/js/app.js: minuteScreen' :
    id === 'companion-upgraded' ? 'workout/js/app.js: donePhase; workout/js/companion.js: companionCard' :
    /^(boost|swaps|level|down)-/.test(id) ? `workout/js/say-ui.js: SAY_UI.adjust.${id.split('-')[0] === 'down' ? 'downLevel' : id.split('-')[0]}; workout/js/app.js: adjustDifficulty` :
    /^(week|streak|milestone)-|^(number-label|first-workout)$/.test(id) ? 'workout/js/say-ui.js: SAY_UI.perseverance; workout/js/app.js: askFeedback' :
    id === 'program-free' ? 'workout/js/app.js: free / adjustDifficulty' :
    id === 'thanks' ? 'workout/js/app.js: askFeedback (משוב ללא תוכנית)' :
    id === 'cost-two-short' ? 'workout/js/app.js: arcade (גיבוי ל-SAY_UI.costTwo)' :
    'workout/js/app.js: wireReps / wireTimer';
  add(id, text, FRAGMENTS_TTS[id], source);
}
// גם אמירות קיימות בהקלטות המשחקים נכללות בקטלוג. אפקטים בלי מילים אינם משפטים.
for (const [id, text, tts, lang] of [['goal', 'Gooooooooooool!', 'Gooooooooooool!', 'pt-BR'], ['dunk', 'בום!', 'בּוּם!', 'he-IL'], ['three', 'סל!', 'סַל!', 'he-IL'], ['sprint', 'מקום ראשון!', 'מָקוֹם רִאשׁוֹן!', 'he-IL']])
  add(`celebration-${id}`, text, tts, `workout/js/games/celebrate.js / celebrate3d.js: say; הקלטה קיימת workout/snd/${id}.mp4`, lang);

// Short camera coaching has display copy and separate local-voice pronunciation.
export const CAMERA_LINES = {
  'intro-squats': ['יורדים כאילו יושבים, ואז עומדים שוב.', 'יוֹרְדִים כְּאִלּוּ יוֹשְׁבִים, וְאָז עוֹמְדִים שׁוּב.'],
  'intro-jumping-jacks': ['פותחים רגליים וידיים, ואז סוגרים.', 'פּוֹתְחִים רַגְלַיִם וְיָדַיִם, וְאָז סוֹגְרִים.'],
  'intro-high-knees': ['מרימים ברך, מורידים, ומחליפים רגל.', 'מְרִימִים בֶּרֶךְ, מוֹרִידִים, וּמַחֲלִיפִים רֶגֶל.'],
  'intro-lunges': ['יורדים לברך, עולים, ומחליפים רגל.', 'יוֹרְדִים לְבֶרֶךְ, עוֹלִים, וּמַחֲלִיפִים רֶגֶל.'],
  'intro-push-ups': ['הגוף ישר. מכופפים ידיים ודוחפים למעלה.', 'הַגּוּף יָשָׁר. מְכוֹפְפִים יָדַיִם וְדוֹחֲפִים לְמַעְלָה.'],
  'intro-knee-push-ups': ['ברכיים ברצפה. מכופפים ידיים ודוחפים למעלה.', 'בִּרְכַּיִם בָּרִצְפָּה. מְכוֹפְפִים יָדַיִם וְדוֹחֲפִים לְמַעְלָה.'],
  'intro-glute-bridge': ['שוכבים ומרימים טוסיק, ואז מורידים לאט.', 'שׁוֹכְבִים וּמְרִימִים טוּסִיק, וְאָז מוֹרִידִים לְאַט.'],
  partial: ['ננסה תנועה שלמה, כמו הדמות.', 'נְנַסֶּה תְּנוּעָה שְׁלֵמָה, כְּמוֹ הַדְּמוּת.'],
  knees: ['הברכיים פונות לאן שהאצבעות פונות.', 'הַבִּרְכַּיִם פּוֹנוֹת לְאָן שֶׁהָאֶצְבָּעוֹת פּוֹנוֹת.'],
  fast: ['נעשה לאט, כמו הדמות.', 'נַעֲשֶׂה לְאַט, כְּמוֹ הַדְּמוּת.'],
  tracking: ['נחזור למקום שהמצלמה רואה.', 'נַחֲזוֹר לַמָּקוֹם שֶׁהַמַּצְלֵמָה רוֹאָה.'],
  timeout: ['חוזרים להתחלה, ואז מנסים שוב.', 'חוֹזְרִים לַהַתְחָלָה, וְאָז מְנַסִּים שׁוּב.'],
  alternate: ['עכשיו עושים עם הרגל השנייה.', 'עַכְשָׁו עוֹשִׂים עִם הָרֶגֶל הַשְּׁנִיָּה.'],
  alignment: ['הגוף ישר, כמו הדמות.', 'הַגּוּף יָשָׁר, כְּמוֹ הַדְּמוּת.'],
  legs: ['לא רואה את הרגליים', 'לֹא רוֹאָה אֶת הָרַגְלַיִם'],
  hands: ['לא רואה את הידיים', 'לֹא רוֹאָה אֶת הַיָּדַיִם'],
  head: ['לא רואה את הראש', 'לֹא רוֹאָה אֶת הָרֹאשׁ'],
  far: ['תתקרב קצת', 'תִּתְקָרֵב קְצָת'],
  close: ['תתרחק קצת', 'תִּתְרַחֵק קְצָת'],
  side: ['תעמוד עם הצד למצלמה', 'תַּעֲמוֹד עִם הַצַּד לַמַּצְלֵמָה'],
  tilt: ['אבא, ניישר את הטלפון', 'אַבָּא, נְיַשֵּׁר אֶת הַטֶּלֶפוֹן'],
  body: ['נחכה שהמצלמה תראה אותך', 'נְחַכֶּה שֶׁהַמַּצְלֵמָה תִּרְאֶה אוֹתְךָ'],
  world: ['רגע, המצלמה מחפשת אותך', 'רֶגַע, הַמַּצְלֵמָה מְחַפֶּשֶׂת אוֹתְךָ'],
  waiting: ['מחכים בתנוחת ההתחלה', 'מְחַכִּים בִּתְנוּחַת הַהַתְחָלָה'],
  armed: ['מוכן, בקצב שלך', 'מוּכָן, בַּקֶּצֶב שֶׁלְּךָ'],
  moving: ['יפה, ממשיכים בתנועה', 'יָפֶה, מַמְשִׁיכִים בַּתְּנוּעָה'],
  '3': ['שלוש', 'שָׁלוֹשׁ'], '2': ['שתיים', 'שְׁתַּיִם'], '1': ['אחת', 'אַחַת'],
};
for (const [id, [text, tts]] of Object.entries(CAMERA_LINES)) add(`camera-${id}`, text, tts, 'workout/js/camera-screen.mjs: cameraCoach / camera-demo.mjs');

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
  const streak = text.match(/^(\d+) ימים ברצף!\s*(.*)$/s);
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
