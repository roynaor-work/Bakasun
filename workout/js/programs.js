// תוכניות אימון מוכנות. base = החזרות/השניות ברמה "רגיל"; הרמה של הילד משנה את זה (ראו logic.js).
export const PROGRAMS = [
  { id: 'jump', name: 'אימון ניתור', emoji: '🦘', cat: 'jump', minutes: 12,
    desc: 'קפיצות, מהירות וכוח ברגליים. שני סבבים.',
    items: ['jumping-jacks', 'squat-jumps', 'high-knees', 'tuck-jumps', 'side-hops', 'jump-rope', 'burpees'], rounds: 2 },
  { id: 'core', name: 'אימון בטן', emoji: '🔥', cat: 'core', minutes: 10,
    desc: 'שרירי הבטן והגב, סבב אחד רציני.',
    items: ['crunches', 'bicycle', 'leg-raises', 'plank', 'flutter-kicks', 'russian-twists', 'superman', 'mountain-climbers'], rounds: 1 },
  { id: 'full', name: 'גוף מלא', emoji: '⚡', cat: 'strength', minutes: 15,
    desc: 'קצת מהכול: ניתור, בטן וכוח.',
    items: ['jumping-jacks', 'squats', 'crunches', 'high-knees', 'push-ups', 'bicycle', 'lunges', 'plank', 'burpees'], rounds: 1 },
  { id: 'quick', name: 'אימון 7 דקות', emoji: '⏱️', cat: 'jump', minutes: 7,
    desc: 'קצר וחזק. כל תרגיל 30 שניות.',
    items: ['jumping-jacks', 'squats', 'crunches', 'high-knees', 'plank', 'side-hops', 'bicycle', 'mountain-climbers'], rounds: 1,
    override: { type: 'time', base: 30 } },
];
export const programById = Object.fromEntries(PROGRAMS.map(p => [p.id, p]));
