// תוכניות אימון. כל תוכנית בנויה מבלוקים: חימום, האימון (לפעמים כמה סבבים), מתיחות.
// base = החזרות/השניות ברמה "רגיל"; הרמה של הילד משנה את זה (ראו logic.js).
const WARM = { name: 'חימום', items: ['jog', 'arm-circles', 'ankle-hops'] };
const WARM_SHORT = { name: 'חימום', items: ['jog', 'arm-circles'] };
const STRETCH = { name: 'מתיחות', items: ['quad-stretch', 'hamstring-stretch', 'calf-stretch'] };

export const PROGRAMS = [
  { id: 'jump-a', name: 'ניתור א׳: הבסיס', emoji: '🦘', cat: 'jump', minutes: 13,
    desc: 'הקפיצות הבסיסיות. לומדים לנחות רך ולקפוץ גבוה.',
    blocks: [WARM, { name: 'האימון', rounds: 2, items: ['jumping-jacks', 'squat-jumps', 'side-hops', 'tuck-jumps', 'jump-rope'] }, STRETCH] },
  { id: 'jump-b', name: 'ניתור ב׳: כוח מתפרץ', emoji: '💥', cat: 'jump', minutes: 15,
    desc: 'קפיצות חזקות: לרוחק, על מדרגה, ריצה וקפיצה במסדרון.',
    blocks: [WARM, { name: 'האימון', rounds: 2, items: ['broad-jump', 'run-jump', 'single-leg-hops', 'step-jumps', 'bounding', 'burpees'] }, STRETCH] },
  { id: 'jump-c', name: 'ניתור ג׳: רגליים מהירות', emoji: '⚡', cat: 'jump', minutes: 12,
    desc: 'קצב ומהירות: ספרינטים במסדרון, חבל, ברכיים גבוהות וקפיצה לגובה.',
    blocks: [WARM_SHORT, { name: 'האימון', rounds: 2, items: ['high-knees', 'hall-sprint', 'jump-rope', 'run-vertical', 'side-hops', 'ankle-hops'] }, STRETCH] },
  { id: 'hall', name: 'ניתור במסדרון', emoji: '🚪', cat: 'jump', minutes: 12,
    desc: 'ריצה וקפיצה: כל התרגילים שצריכים 5 עד 6 מטר.',
    blocks: [WARM, { name: 'האימון', rounds: 2, items: ['hall-sprint', 'run-jump', 'bounding', 'run-vertical', 'broad-jump'] }, STRETCH] },
  { id: 'speed', name: 'מהירות וקואורדינציה', emoji: '⚡', cat: 'speed', minutes: 13,
    desc: 'המסדרון, קיר לקיר: מעבורת, אות יציאה, צעדי צד, קריוקה.',
    blocks: [WARM, { name: 'האימון', rounds: 2, items: ['shuttle-run', 'reaction-sprint', 'side-shuffle', 'carioca', 'skipping', 'floor-wall-run'] }, STRETCH] },
  { id: 'legs', name: 'כוח רגליים לניתור', emoji: '🦵', cat: 'legs', minutes: 14,
    desc: 'רגליים חזקות קופצות גבוה יותר. סקוואט, מכרעים, עקבים.',
    blocks: [WARM_SHORT, { name: 'האימון', rounds: 2, items: ['squats', 'lunges', 'calf-raises', 'glute-bridge', 'wall-sit'] }, STRETCH] },
  { id: 'upper', name: 'כוח עליון ובטן', emoji: '💪', cat: 'upper', minutes: 13,
    desc: 'שכיבות סמיכה, כתפיים ובטן חזקה.',
    blocks: [WARM_SHORT, { name: 'האימון', rounds: 2, items: ['push-ups', 'pike-push-ups', 'plank', 'crunches', 'superman', 'knee-push-ups'] }, { name: 'מתיחות', items: ['hamstring-stretch'] }] },
  { id: 'core', name: 'אימון בטן', emoji: '🔥', cat: 'core', minutes: 11,
    desc: 'שרירי הבטן והגב, סבב אחד רציני.',
    blocks: [WARM_SHORT, { name: 'האימון', items: ['crunches', 'bicycle', 'leg-raises', 'v-ups', 'plank', 'side-plank', 'flutter-kicks', 'russian-twists', 'hollow-hold'] }, { name: 'מתיחות', items: ['hamstring-stretch'] }] },
  { id: 'full', name: 'גוף מלא', emoji: '🌟', cat: 'jump', minutes: 15,
    desc: 'קצת מהכול: ניתור, רגליים, בטן וכוח עליון.',
    blocks: [WARM, { name: 'האימון', items: ['jumping-jacks', 'squats', 'push-ups', 'high-knees', 'crunches', 'squat-jumps', 'lunges', 'bicycle', 'plank', 'burpees'] }, STRETCH] },
  { id: 'quick', name: 'אימון 7 דקות', emoji: '⏱️', cat: 'jump', minutes: 7,
    desc: 'קצר וחזק, בלי חימום ארוך. כל תרגיל 30 שניות.',
    blocks: [{ name: 'האימון', items: ['jumping-jacks', 'squats', 'crunches', 'high-knees', 'plank', 'side-hops', 'push-ups', 'bicycle', 'squat-jumps', 'mountain-climbers'] }],
    override: { type: 'time', base: 30 } },
];
export const programById = Object.fromEntries(PROGRAMS.map(p => [p.id, p]));

// התוכנית השבועית: מפתח = יום בשבוע (0 = ראשון). ריק = מנוחה. שלושה אימוני ניתור, מהירות ברביעי, כוח עליון ובטן בשני. אימון בטן נפרד זמין ברשימה.
export const DEFAULT_PLAN = { 0: 'jump-a', 1: 'upper', 2: 'jump-b', 3: 'speed', 4: 'legs', 5: 'jump-c', 6: '' };
export const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
