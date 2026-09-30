// דיבור בעברית: הקול של המכשיר (Web Speech API), עם בחירת הקול הטוב ביותר, קצב מכוון, וטקסטים מנוקדים.
// למה ניקוד: מנועי הדיבור (גוגל באנדרואיד, "כרמית" באייפון) מנחשים הגייה של מילים בלי ניקוד וטועים. עם ניקוד הם קוראים נכון.
import { store } from './store.js';

const synth = window.speechSynthesis;
let voices = [];
const refresh = () => { try { voices = (synth?.getVoices() || []).filter(v => /^he|iw/i.test(v.lang)); } catch { voices = []; } };
refresh();
if (synth) synth.addEventListener?.('voiceschanged', refresh);

export const canSpeak = () => !!synth;
export const hebrewVoices = () => { if (!voices.length) refresh(); return voices; };

// סדר עדיפות: הקול שנבחר בהגדרות, אחר כך קולות "טבעיים"/רשת, אחר כך כרמית, אחר כך כל קול עברי
const PREFER = [/natural/i, /neural/i, /wavenet/i, /online/i, /enhanced|premium/i, /google/i, /carmit/i, /microsoft/i];
export function bestVoice() {
  const list = hebrewVoices(); if (!list.length) return null;
  const want = store.profile.voiceName; const chosen = want && list.find(v => v.name === want); if (chosen) return chosen;
  for (const re of PREFER) { const v = list.find(v => re.test(v.name)); if (v) return v; }
  return list[0];
}

// טקסט לדיבור: מסירים אימוג'י וסימנים, משאירים אותיות, ניקוד, ספרות ופיסוק
const clean = t => String(t).replace(/[^\p{L}\p{M}\p{N}\s,.!?:;"'()%+\-־]/gu, ' ').replace(/\s+/g, ' ').trim();

export function speak(text, { force = false } = {}) {
  if (!synth || (!force && store.profile.voice === false)) return false;
  const t = clean(text); if (!t) return false;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(t);
  u.lang = 'he-IL'; u.rate = store.profile.speechRate || 0.92; u.pitch = 1;
  const v = bestVoice(); if (v) u.voice = v;
  synth.speak(u);
  return true;
}
// קריין באנגלית (GOAL!!!) או בשפה אחרת, בלי לבטל הגדרת קול עברי
export function speakLang(text, lang = 'en-US', { rate = 0.9, pitch = 1.1 } = {}) {
  if (!synth || store.profile.voice === false) return false;
  try { synth.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = lang; u.rate = rate; u.pitch = pitch; const v = (synth.getVoices() || []).find(v => v.lang.startsWith(lang.slice(0, 2)) && /natural|neural|online|google|samantha|daniel/i.test(v.name)) || (synth.getVoices() || []).find(v => v.lang.startsWith(lang.slice(0, 2))); if (v) u.voice = v; synth.speak(u); return true; } catch { return false; }
}
// אמירה קצרה בלי לבטל את הקודמת (ספירה, רמזי זמן): התור מוגבל כדי לא לצבור פיגור
export function sayQuick(text, { rate = 1.05 } = {}) {
  if (!synth || store.profile.voice === false) return false;
  const t = clean(text); if (!t) return false;
  if (synth.pending) synth.cancel();
  const u = new SpeechSynthesisUtterance(t); u.lang = 'he-IL'; u.rate = rate; u.pitch = 1.05; const v = bestVoice(); if (v) u.voice = v;
  lastSpokeAt = Date.now(); u.onend = () => { lastSpokeAt = Date.now(); };
  synth.speak(u); return true;
}
let lastSpokeAt = 0; export const spokeRecently = (ms = 900) => Date.now() - lastSpokeAt < ms;
export const stopSpeak = () => { try { synth && synth.cancel(); } catch { /* */ } };

// ---- טקסטים מנוקדים לממשק ----
export const SAY_UI = {
  costTwo: 'שִׂים לֵב, הַמִּשְׂחָק הַזֶּה עוֹלֶה שְׁתֵּי מַתָּנוֹת, כִּי הוּא אָרֹךְ יוֹתֵר.',
  howWas: 'סִיַּמְתָּ! אֵיךְ הָיָה הָאִמּוּן? קַל, בְּדִיּוּק, אוֹ קָשֶׁה?',
  test: 'הַיי! אֲנִי אַסְבִּיר לְךָ אֵיךְ עוֹשִׂים כָּל תַּרְגִּיל. לוֹחֲצִים עַל הַכַּפְתּוֹר "אֵיךְ עוֹשִׂים אֶת זֶה?".',
  intro: { race: 'הַיּוֹם אַתָּה רִאשׁוֹן!', hurdles: 'עוֹבֵר כָּל מִכְשׁוֹל!', dunk: 'סְלֶאם דַּאנְק!', dribble: 'כַּדְרוּר, עוֹבְרִים אֶת הַשּׁוֹמֵר, וּקְלִיעָה!', podium: 'מָקוֹם רִאשׁוֹן!' },
  adjust: {
    boost: name => `הָיָה קַל? מֵעַכְשָׁו ${name} עִם עוֹד קְצָת חֲזָרוֹת וּזְמַן.`,
    swaps: name => `הָיָה קַל? בְּ${name} נִכְנָסִים תַּרְגִּילִים קָשִׁים יוֹתֵר.`,
    level: lvl => `וָאוּ. עָלִיתָ לְרָמָה ${lvl} בְּכָל הָאִמּוּנִים!`,
    top: 'אַתָּה כְּבָר בָּרָמָה הַגְּבוֹהָה בְּיוֹתֵר. אַלּוּף אֲמִתִּי!',
    downSwaps: 'הָיָה קָשֶׁה? בַּפַּעַם הַבָּאָה חוֹזְרִים לַתַּרְגִּילִים הָרְגִילִים.',
    downBoost: 'הָיָה קָשֶׁה? הוֹרַדְתִּי קְצָת. בַּפַּעַם הַבָּאָה יִהְיֶה נוֹחַ יוֹתֵר.',
    downLevel: lvl => `הוֹרַדְתִּי לְרָמָה ${lvl}. לְאַט לְאַט בּוֹנִים כּוֹחַ.`,
    bottom: 'כָּל הַכָּבוֹד שֶׁסִּיַּמְתָּ! זוֹ הָרָמָה הַקַּלָּה בְּיוֹתֵר, וְבַפַּעַם הַבָּאָה יִהְיֶה קַל יוֹתֵר כִּי אַתָּה מִתְחַזֵּק.',
    ok: 'מְעֻלֶּה, בְּדִיּוּק בָּרָמָה שֶׁלְּךָ.',
  },
  levels: { easy: 'קַל', normal: 'רָגִיל', hard: 'חָזָק', pro: 'אַלּוּף' },
  ordinals: ['', 'הָרִאשׁוֹן', 'הַשֵּׁנִי', 'הַשְּׁלִישִׁי', 'הָרְבִיעִי', 'הַחֲמִישִׁי', 'הַשִּׁשִּׁי', 'הַשְּׁבִיעִי'],
  perseverance(st) {
    const n = st.thisWeek, ord = SAY_UI.ordinals[n] || `מִסְפָּר ${n}`;
    const parts = [`כָּל הַכָּבוֹד! זֶה הָאִמּוּן ${ord} שֶׁלְּךָ הַשָּׁבוּעַ.`];
    if (st.streak >= 2) parts.push(`${st.streak} יָמִים בְּרֶצֶף!`);
    if (st.workouts === 1) parts.push('הָאִמּוּן הָרִאשׁוֹן בִּכְלָל. הַתְחָלָה מְעֻלָּה!');
    else if ([5, 10, 20, 30, 50, 100].includes(st.workouts)) parts.push(`וְזֶה הָאִמּוּן מִסְפָּר ${st.workouts} שֶׁלְּךָ. וָאוּ!`);
    return parts.join(' ');
  },
  programs: { 'jump-a': 'נִתּוּר אָלֶף', 'jump-b': 'נִתּוּר בֵּית', 'jump-c': 'נִתּוּר גִּימֶל', speed: 'מְהִירוּת וְקוֹאוֹרְדִינַצְיָה', hall: 'נִתּוּר בַּמִּסְדְּרוֹן', legs: 'כּוֹחַ רַגְלַיִם', upper: 'כּוֹחַ עֶלְיוֹן וּבֶטֶן', core: 'אִמּוּן בֶּטֶן', full: 'גּוּף מָלֵא', quick: 'אִמּוּן שֶׁבַע דַּקּוֹת' },
};
