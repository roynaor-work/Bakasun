// משימה אחת לכל אימון, מתוך משחקים קצרים המותאמים לגיל.
export const OUTDOOR_TASKS = Object.freeze([
  ['wall-6', 'בעיטות לקיר', 6], ['tree-6', 'עד העץ', 6],
  ['hops-6', 'רגל אחת', 6], ['catch-6', 'כדור באוויר', 6],
  ['line-6', 'על הקו', 6], ['dance-6', 'ריקוד בחוץ', 6],
  ['wall-7', 'בעיטות לקיר', 7], ['tree-7', 'עד העץ', 7],
  ['hops-7', 'רגל אחת', 7], ['catch-7', 'כדור באוויר', 7],
  ['zigzag-7', 'זיגזג', 7], ['shadow-7', 'משחק צל', 7],
  ['wall-8', 'בעיטות לקיר', 8], ['tree-8', 'עד העץ', 8],
  ['hops-8', 'רגל אחת', 8], ['catch-8', 'כדור באוויר', 8],
  ['side-8', 'צעדי צד', 8], ['goal-8', 'שער קטן', 8],
  ['wall-9', 'בעיטות לקיר', 9], ['tree-9', 'עד העץ', 9],
  ['hops-9', 'רגל אחת', 9], ['catch-9', 'כדור באוויר', 9],
  ['zigzag-9', 'זיגזג עם כדור', 9], ['jump-9', 'קפיצה רחוקה', 9],
].map(([id, name, age]) => Object.freeze({ id, name, age, voiceId: `outdoor-${id}` })));

export const outdoorAge = age => Number.isInteger(age) && age >= 6 && age <= 9 ? age : 6;
export const outdoorTask = id => OUTDOOR_TASKS.find(task => task.id === id) || null;
export function pickOutdoorTask(age, sessions = []) {
  const choices = OUTDOOR_TASKS.filter(task => task.age === outdoorAge(age));
  const last = [...sessions].reverse().find(session => choices.some(task => task.id === session.outdoor?.taskId));
  const index = choices.findIndex(task => task.id === last?.outdoor?.taskId);
  return choices[(index + 1) % choices.length];
}
export function outdoorStars(outdoor) {
  const task = outdoorTask(outdoor?.taskId);
  return task && task.age === outdoor?.age && typeof outdoor.completedAt === 'string' &&
    Number.isFinite(Date.parse(outdoor.completedAt)) ? 1 : 0;
}
export const pendingOutdoor = sessions => [...sessions].reverse().find(s => outdoorTask(s.outdoor?.taskId) && !outdoorStars(s.outdoor)) || null;
