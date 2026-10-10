// תצוגה משותפת לבית, לסיום האימון ולמעקב. החגורה נגזרת מההיסטוריה, בלי שמירה נוספת.
import { rankOf, rankUp } from './logic.js?v=20261010-child-copy-1';

export function beltCard(workouts, { previousWorkouts } = {}) {
  const rank = rankOf(workouts);
  const fresh = previousWorkouts != null && rankUp(previousWorkouts, workouts);
  const nextLine = rank.next ? `עוד ${rank.toNext} ${rank.toNext === 1 ? 'אימון' : 'אימונים'} עד ל${rank.next.belt}`
    : 'כל הצבעים כבר שלך. כיף להמשיך לזוז יחד!';
  return `<section class="card belt-card stack" aria-label="החגורה שלי" style="--belt-color:${rank.color}">
    ${fresh ? '<p class="belt-new" role="status">חגורה חדשה! כל הכבוד על ההתמדה שלך 💛</p>' : ''}
    <div class="row between wrap">
      <div class="row"><span class="belt-mark" aria-hidden="true"></span><h2>${rank.belt}</h2></div>
      <span class="small">${rank.workouts === 1 ? 'אימון אחד' : `${rank.workouts} אימונים`}</span>
    </div>
    <p class="small">${nextLine}</p>
    ${rank.next ? `<div class="belt-progress" role="progressbar" aria-label="הדרך לחגורה הבאה" aria-valuemin="0" aria-valuemax="${rank.span}" aria-valuenow="${rank.progress}" aria-valuetext="${nextLine}"><span style="width:${rank.progressPct}%"></span></div>` : ''}
    <p class="muted small">כל אימון ששמרת מוסיף צעד, בקצב שלך.</p>
  </section>`;
}
