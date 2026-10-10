import { byId } from './exercises.js?v=20261010-child-copy-1';
import { programById } from './programs.js?v=20261010-child-copy-1';

// שמות בנתונים שמורים מוצגים לפי המזהה, בלי לשנות את הרשומה במכשיר או בענן.
export const exerciseName = item => byId[item.exId]?.name || item.name;
export function workoutName(session) {
  const programId = session.programId || session.program?.id;
  const program = programById[programId];
  if (program) return (session.together ? 'אבא ואני: ' : '') + program.name;
  if (['solo', 'together-challenge'].includes(programId) && session.items?.[0])
    return (session.together ? 'אבא ואני: ' : '') + exerciseName(session.items[0]);
  return session.programName || session.program?.name || 'אימון';
}
