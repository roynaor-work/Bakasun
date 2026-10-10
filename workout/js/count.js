// ספירה בקול: המספרים בעברית עם ניקוד (הקול קורא נכון), רמזי זמן לתרגילי זמן, והקשבה לילד שסופר (זיהוי דיבור של המכשיר).
const ONES = ['', 'אַחַת', 'שְׁתַּיִם', 'שָׁלוֹשׁ', 'אַרְבַּע', 'חָמֵשׁ', 'שֵׁשׁ', 'שֶׁבַע', 'שְׁמוֹנֶה', 'תֵּשַׁע', 'עֶשֶׂר'];
const TEENS = ['', 'אַחַת עֶשְׂרֵה', 'שְׁתֵּים עֶשְׂרֵה', 'שְׁלוֹשׁ עֶשְׂרֵה', 'אַרְבַּע עֶשְׂרֵה', 'חֲמֵשׁ עֶשְׂרֵה', 'שֵׁשׁ עֶשְׂרֵה', 'שְׁבַע עֶשְׂרֵה', 'שְׁמוֹנֶה עֶשְׂרֵה', 'תְּשַׁע עֶשְׂרֵה'];
const TENS = ['', '', 'עֶשְׂרִים', 'שְׁלוֹשִׁים', 'אַרְבָּעִים', 'חֲמִשִּׁים', 'שִׁשִּׁים', 'שִׁבְעִים', 'שְׁמוֹנִים', 'תִּשְׁעִים'];
// מספר במילים (נקבה: כך סופרים חזרות ושניות)
export function numWordTts(n) {
  n = Math.round(n); if (n <= 0) return 'אֶפֶס'; if (n <= 10) return ONES[n]; if (n < 20) return TEENS[n - 10];
  if (n < 100) { const t = Math.floor(n / 10), o = n % 10; return o ? `${TENS[t]} וְ${ONES[o]}` : TENS[t]; }
  return String(n);
}
// כתיב מלא לספירה שמוצגת ונכנסת לקטלוג; הניקוד נשמר בנפרד.
const DISPLAY_ONES = ['', 'אחת', 'שתיים', 'שלוש', 'ארבע', 'חמש', 'שש', 'שבע', 'שמונה', 'תשע', 'עשר'];
const DISPLAY_TEENS = ['', 'אחת עשרה', 'שתים עשרה', 'שלוש עשרה', 'ארבע עשרה', 'חמש עשרה', 'שש עשרה', 'שבע עשרה', 'שמונה עשרה', 'תשע עשרה'];
const DISPLAY_TENS = ['', '', 'עשרים', 'שלושים', 'ארבעים', 'חמישים', 'שישים', 'שבעים', 'שמונים', 'תשעים'];
export function numWord(n) {
  n = Math.round(n); if (n <= 0) return 'אפס'; if (n <= 10) return DISPLAY_ONES[n]; if (n < 20) return DISPLAY_TEENS[n - 10];
  if (n < 100) { const t = Math.floor(n / 10), o = n % 10; return o ? `${DISPLAY_TENS[t]} ו${DISPLAY_ONES[o]}` : DISPLAY_TENS[t]; }
  return String(n);
}

// מה אומרים בתרגיל זמן כשנשארו sec שניות (מתוך target): כל 10 שניות "עוד X שניות", ב-10 האחרונות סופרים לאחור, בסוף "סיימת"
export function timeCue(sec, target) {
  if (sec <= 0) return 'סיימת!';
  if (sec <= 10) return numWord(sec);
  if (sec % 10 === 0 && sec < target) return `עוד ${numWord(sec)} שניות`;
  if (sec === target) return 'מתחילים!';
  return null;
}
// מה הילד אמר: מחזירים את המספר האחרון שנשמע במשפט (1-99), או null. מבינים "שתיים", "שניים", "אחת עשרה", "עשרים ושלוש", וספרות
const WORD = { אחת: 1, אחד: 1, שתיים: 2, שניים: 2, שתים: 2, שני: 2, שלוש: 3, שלושה: 3, ארבע: 4, ארבעה: 4, חמש: 5, חמישה: 5, שש: 6, שישה: 6, שבע: 7, שבעה: 7, שמונה: 8, תשע: 9, תשעה: 9, עשר: 10, עשרה: 10, עשרים: 20, שלושים: 30, ארבעים: 40, חמישים: 50, שישים: 60 };
export function parseCount(text) {
  const words = String(text).replace(/[֑-ׇ]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  let last = null;
  for (let i = 0; i < words.length; i++) {
    let w = words[i]; if (/^\d{1,2}$/.test(w)) { last = +w; continue; }
    let v = WORD[w]; if (v == null && w.startsWith('ו') && WORD[w.slice(1)] != null) v = WORD[w.slice(1)];
    if (v == null) continue;
    const next = words[i + 1];
    if (v < 10 && (next === 'עשרה' || next === 'עשר')) { v += 10; i++; }
    else if (v >= 20 && v % 10 === 0 && next && next.startsWith('ו') && WORD[next.slice(1)] != null && WORD[next.slice(1)] < 10) { v += WORD[next.slice(1)]; i++; }
    last = v;
  }
  return last;
}
// הקשבה לילד: זיהוי דיבור של הדפדפן (כרום באנדרואיד). onNumber(n) בכל מספר שנשמע. מחזיר פונקציית עצירה, או null אם אין תמיכה
export const canListen = () => !!(window.SpeechRecognition || window.webkitSpeechRecognition);
export function listenCount(onNumber, lang = 'he-IL') {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) return null;
  let on = true, rec = null;
  const start = () => {
    if (!on) return;
    rec = new SR(); rec.lang = lang; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;
    rec.onresult = e => { for (let i = e.resultIndex; i < e.results.length; i++) { const n = parseCount(e.results[i][0].transcript); if (n != null) onNumber(n, e.results[i].isFinal); } };
    rec.onend = () => { if (on) setTimeout(start, 250); }; // הדפדפן עוצר לבד אחרי שקט, מתחילים שוב
    rec.onerror = ev => { if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') on = false; };
    try { rec.start(); } catch { /* כבר רץ */ }
  };
  start();
  return () => { on = false; try { rec && rec.stop(); } catch { /* */ } };
}
