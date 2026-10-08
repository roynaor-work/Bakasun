// פעילות משותפת באותו מכשיר. סופרים את התנועות של הילד בלבד;
// ההורה בוחר את הפעילות, והכוכבים נשארים לפי המאמץ הרגיל של הילד.
import { buildItems } from './logic.js?v=20261008-together-1';

export function togetherChoice(choice, programs, catalog) {
  if (!choice || typeof choice !== 'object') return null;
  if (choice.mode === 'workout' && Object.hasOwn(programs, choice.programId)) {
    return { mode: 'workout', programId: choice.programId };
  }
  if (choice.mode !== 'challenge' || !Object.hasOwn(catalog, choice.exId)) return null;
  const ex = catalog[choice.exId], target = choice.target;
  const max = ex.type === 'time' ? 180 : 100;
  if (!['time', 'reps'].includes(ex.type) || !Number.isInteger(target) || target < 1 || target > max) return null;
  return { mode: 'challenge', exId: ex.id, target };
}

export function buildTogetherWorkout(choice, programs, catalog, level = 'normal', boost = {}) {
  const selected = togetherChoice(choice, programs, catalog);
  if (!selected) return null;
  if (selected.mode === 'workout') {
    const program = programs[selected.programId];
    return { choice: selected, program: { ...program, name: 'אבא ואני: ' + program.name },
      items: buildItems(program, catalog, level, boost) };
  }
  const ex = catalog[selected.exId];
  const program = { id: 'together-challenge', name: 'אבא ואני: ' + ex.name, emoji: '🤝', items: [ex.id] };
  const items = buildItems(program, catalog, level).map(it => ({ ...it, target: selected.target }));
  return { choice: selected, program, items };
}

export const togetherLabel = choice => choice?.mode === 'workout' ? 'אבא ואני · אימון משותף'
  : choice?.mode === 'challenge' ? 'אבא ואני · אתגר משותף' : '';
