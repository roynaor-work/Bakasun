/* Hebrew → English/French for what she forwards to foreign clients: supplier offers, terms, open points.
   Two layers: the browser's own on-device translator when the phone has it (Chrome on Android, free, no account),
   and a glossary of the event trade for the fields that matter (cancellation, deposit, payment terms, board, meals),
   which also works offline and keeps numbers exact. Pure glossary part is tested. */
import { trim, str } from './core.js';

const RULES = {
  en: [
    [/עד\s*(\d+)\s*(?:ימים|יום)\s*(?:לפני(?:\s*האירוע)?)?\s*(?:ללא|בלי)\s*(?:חיוב|עלות|דמי ביטול)/g, 'free cancellation up to $1 days before'],
    [/ללא\s*(?:חיוב|עלות|דמי ביטול)\s*עד\s*(\d+)\s*(?:ימים|יום)(?:\s*לפני(?:\s*האירוע)?)?/g, 'free cancellation up to $1 days before'],
    [/(\d+)\s*(?:ימים|יום)\s*לפני(?:\s*האירוע)?/g, '$1 days before the event'],
    [/(?:אחרי כן|לאחר מכן|אחר כך|מעבר לכך)/g, 'after that'], [/דמי ביטול/g, 'cancellation fee'], [/מדיניות ביטול/g, 'cancellation policy'], [/ביטול/g, 'cancellation'],
    [/מקדמה\s*(?:של\s*)?(\d+)\s*%\s*(?:במעמד|בעת)\s*(?:ההזמנה|החתימה|הסגירה)/g, '$1% deposit on booking'], [/(?:במעמד|בעת)\s*(?:ההזמנה|החתימה|הסגירה)/g, 'on booking'], [/מקדמה/g, 'deposit'],
    [/שוטף\s*\+?\s*(\d+)/g, 'net $1 days (end of month + $1)'], [/שוטף/g, 'end of month'], [/תנאי תשלום/g, 'payment terms'], [/יתרה/g, 'balance'], [/לפני האירוע/g, 'before the event'], [/אחרי האירוע/g, 'after the event'], [/ביום האירוע/g, 'on the day of the event'],
    [/העברה בנקאית/g, 'bank transfer'], [/צ['׳]?ק/g, 'cheque'], [/אשראי/g, 'credit card'], [/מזומן/g, 'cash'],
    [/לפני מע["״]?מ/g, 'before VAT'], [/כולל מע["״]?מ/g, 'including VAT'], [/\+\s*מע["״]?מ/g, '+ VAT'], [/מע["״]?מ/g, 'VAT'],
    [/לינה וארוחת בוקר/g, 'bed and breakfast'], [/חצי פנסיון/g, 'half board'], [/פנסיון מלא/g, 'full board'], [/חדרי סינגל|חדר סינגל|סינגל/g, 'single rooms'], [/חדרים זוגיים|חדר זוגי|זוגי/g, 'double rooms'],
    [/ארוחת בוקר/g, 'breakfast'], [/ארוחת צהריים/g, 'lunch'], [/ארוחת ערב/g, 'dinner'], [/הפסקת קפה|הפסקות קפה|קפה בהפסקות/g, 'coffee breaks'], [/כיבוד קל/g, 'light refreshments'], [/כיבוד/g, 'refreshments'], [/בופה/g, 'buffet'], [/מוגש/g, 'served'],
    [/אולם/g, 'hall'], [/חדר ישיבות/g, 'meeting room'], [/מסך ומקרן|מקרן ומסך/g, 'screen and projector'], [/הגברה/g, 'sound system'], [/תאורה/g, 'lighting'], [/חניה/g, 'parking'], [/ווייפיי|וויפיי|אינטרנט אלחוטי/g, 'wifi'],
    [/לאדם|למשתתף|לסועד|לאיש/g, 'per person'], [/לחדר/g, 'per room'], [/ללילה/g, 'per night'], [/משתתפים/g, 'participants'], [/סועדים/g, 'diners'], [/אורחים/g, 'guests'], [/לילות/g, 'nights'], [/לילה/g, 'night'],
    [/כולל/g, 'including'], [/לא כולל/g, 'not including'], [/כלול/g, 'included'], [/בנפרד/g, 'separately'], [/בתוספת/g, 'plus'], [/תוספת/g, 'extra'], [/הנחה/g, 'discount'],
    [/זמינות/g, 'availability'], [/פנוי/g, 'available'], [/תפוס/g, 'not available'], [/אישור/g, 'confirmation'], [/הזמנה/g, 'booking'], [/חוזה/g, 'contract'], [/חתימה/g, 'signature'],
    [/מלון/g, 'hotel'], [/הסעה|הסעות/g, 'transport'], [/אוטובוס/g, 'bus'], [/מיניבוס/g, 'minibus'], [/מדריך/g, 'guide'], [/סיור/g, 'tour'], [/פעילות/g, 'activity'], [/קייטרינג/g, 'catering'],
    [/יין/g, 'wine'], [/קפה/g, 'coffee'], [/תה\b/g, 'tea'], [/מים/g, 'water'], [/שתייה קלה|שתיה קלה/g, 'soft drinks'], [/אלכוהול/g, 'alcohol'], [/צמחוני(?:ות|ים|ת)?/g, 'vegetarian'], [/טבעוני(?:ות|ים|ת)?/g, 'vegan'], [/כשר(?:ות)?/g, 'kosher'], [/ללא גלוטן/g, 'gluten free'], [/אפשרויות/g, 'options'], [/אפשרות/g, 'option'], [/מספר סופי/g, 'final number'], [/מספר/g, 'number'], [/סופי/g, 'final'], [/של\b/g, 'of'], [/תפריט/g, 'menu'], [/מנות/g, 'dishes'], [/מנה/g, 'dish'], [/קינוח/g, 'dessert'], [/שעות/g, 'hours'], [/שעה/g, 'hour'], [/תאריך/g, 'date'], [/מחיר/g, 'price'], [/סה["״]?כ/g, 'total'],
    [/ש["״]?ח|שקל(?:ים)?/g, 'ILS'], [/ואת|וגם|ו-/g, 'and '], [/עבור/g, 'for'], [/עד/g, 'until'], [/בערב/g, 'in the evening'], [/בבוקר/g, 'in the morning'], [/בצהריים/g, 'at noon'],
    [/(^|\s)ו(?=[A-Za-z\u0590-\u05FF])/g, '$1and ']
  ],
  fr: [
    [/עד\s*(\d+)\s*(?:ימים|יום)\s*(?:לפני(?:\s*האירוע)?)?\s*(?:ללא|בלי)\s*(?:חיוב|עלות|דמי ביטול)/g, 'annulation gratuite jusqu’à $1 jours avant'],
    [/(\d+)\s*(?:ימים|יום)\s*לפני(?:\s*האירוע)?/g, '$1 jours avant l’événement'], [/דמי ביטול/g, 'frais d’annulation'], [/מדיניות ביטול/g, 'conditions d’annulation'], [/ביטול/g, 'annulation'],
    [/מקדמה\s*(?:של\s*)?(\d+)\s*%\s*(?:במעמד|בעת)\s*(?:ההזמנה|החתימה|הסגירה)/g, 'acompte de $1 % à la réservation'], [/מקדמה/g, 'acompte'], [/שוטף\s*\+?\s*(\d+)/g, 'fin de mois + $1 jours'], [/תנאי תשלום/g, 'conditions de paiement'],
    [/לפני מע["״]?מ/g, 'HT'], [/כולל מע["״]?מ/g, 'TTC'], [/\+\s*מע["״]?מ/g, '+ TVA'], [/מע["״]?מ/g, 'TVA'],
    [/לינה וארוחת בוקר/g, 'petit-déjeuner inclus'], [/חצי פנסיון/g, 'demi-pension'], [/פנסיון מלא/g, 'pension complète'], [/חדרי סינגל|חדר סינגל|סינגל/g, 'chambres single'], [/חדרים זוגיים|חדר זוגי|זוגי/g, 'chambres doubles'],
    [/ארוחת בוקר/g, 'petit-déjeuner'], [/ארוחת צהריים/g, 'déjeuner'], [/ארוחת ערב/g, 'dîner'], [/הפסקת קפה|הפסקות קפה/g, 'pauses café'], [/כיבוד/g, 'collation'], [/אולם/g, 'salle'], [/חדר ישיבות/g, 'salle de réunion'], [/מסך ומקרן/g, 'écran et projecteur'], [/הגברה/g, 'sonorisation'], [/חניה/g, 'parking'],
    [/לאדם|למשתתף|לסועד/g, 'par personne'], [/לחדר/g, 'par chambre'], [/ללילה/g, 'par nuit'], [/משתתפים/g, 'participants'], [/לילות/g, 'nuits'], [/כולל/g, 'y compris'], [/לא כולל/g, 'hors'], [/כלול/g, 'inclus'], [/בנפרד/g, 'séparément'],
    [/מלון/g, 'hôtel'], [/הסעה|הסעות/g, 'transport'], [/אוטובוס/g, 'bus'], [/ש["״]?ח|שקל(?:ים)?/g, 'ILS'], [/עד/g, 'jusqu’à'],
    [/(^|\s)ו(?=[A-Za-z\u0590-\u05FF])/g, '$1et ']
  ]
};

/** Glossary translation: the trade terms and numbers; anything else stays as it was (marked, so she sees what to fix). */
export function glossaryTranslate(text, to) {
  const rules = RULES[to]; let s = str(text);
  if (!rules || !s) return s;
  rules.forEach(([re, rep]) => { s = s.replace(re, rep); });
  s = s.replace(/\s{2,}/g, ' ').replace(/\s+([,.:;])/g, '$1');
  return trim(s);
}
/** Does anything Hebrew remain? Then she should read it over. */
export function hasHebrew(s) { return /[֐-׿]/.test(str(s)); }

/** The browser's own translator when it exists (Chrome on Android/desktop, on-device), otherwise the glossary. */
export async function translateText(text, from, to) {
  const s = str(text); if (!trim(s) || from === to) return s;
  try {
    const T = typeof window !== 'undefined' && (window.Translator || (window.ai && window.ai.translator));
    if (T && T.create) {
      // only when the language pair is already on the device: a download can take minutes, the glossary is instant
      const avail = T.availability ? await withTimeout(T.availability({ sourceLanguage: from, targetLanguage: to }), 1500) : 'available';
      if (avail === 'available' || avail === 'readily') {
        const tr = await withTimeout(T.create({ sourceLanguage: from, targetLanguage: to }), 4000);
        const out = await withTimeout(tr.translate(s), 6000); if (trim(out)) return out;
      }
    }
  } catch (e) { /* not available, refused or slow: glossary below */ }
  return glossaryTranslate(s, to);
}
/** Starts the on-device download of a language pair in the background, so the next time it is instant. */
export function prepareTranslator(from, to) {
  try { const T = typeof window !== 'undefined' && (window.Translator || (window.ai && window.ai.translator)); if (T && T.create) T.create({ sourceLanguage: from, targetLanguage: to }).catch(() => {}); } catch (e) { /* no */ }
}
function withTimeout(p, ms) { return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]); }
export function translatorAvailable() {
  try { return typeof window !== 'undefined' && !!((window.Translator && window.Translator.create) || (window.ai && window.ai.translator)); } catch (e) { return false; }
}
