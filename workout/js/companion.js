// ההתקדמות נגזרת מהאימונים השמורים. אין מונה נוסף שיכול להתקדם ברענון.
const TRIMS = ['#FFFFFF', '#FACC15', '#FB923C', '#38BDF8', '#C084FC', '#F472B6'];
export function companionProgress(workouts = 0) {
  const count = Number.isSafeInteger(workouts) && workouts >= 0 ? workouts : 0;
  return { workouts: count, level: Math.floor(count / 5) + 1, steps: count % 5,
    toNext: 5 - count % 5, patch: count ? String(count) : '',
    trim: TRIMS[Math.floor(count / 5) % TRIMS.length] };
}

export function companionKit(base, workouts) {
  const progress = companionProgress(workouts);
  return { ...base, patch: progress.patch, stripe: progress.level > 1 ? progress.trim : base.stripe };
}

export function companionCard(workouts, { fresh = false } = {}) {
  const p = companionProgress(workouts);
  return `<section class="card companion-card stack${fresh ? ' pop' : ''}" aria-label="החבר שלי" data-companion="${p.workouts}">
    <h2>החבר שלי</h2>
    ${fresh ? '<p role="status">הדמות שלך השתפרה! גדלים יחד, בקצב שלך.</p>' : '<p class="small">כל אימון מוסיף משהו לדמות שלך.</p>'}
    <div class="companion-row">
      <div class="companion-portrait" data-companion-portrait aria-hidden="true"></div>
      <div class="stack companion-info">
        <b>שלב ${p.level}</b>
        <span class="companion-count">${p.workouts} אימונים</span>
        <p class="small">${p.workouts ? 'מספר האימונים על החולצה שלך.' : 'אחרי האימון יופיע מספר על החולצה.'}</p>
        <p class="small">עוד ${p.toNext} ${p.toNext === 1 ? 'אימון' : 'אימונים'} לפסים חדשים.</p>
        <div class="belt-progress" role="progressbar" aria-label="הדרך לפסים חדשים" aria-valuemin="0" aria-valuemax="5" aria-valuenow="${p.steps}" style="--belt-color:${p.trim}"><span style="width:${p.steps * 20}%"></span></div>
        <p class="muted small">גם במנוחה, כל מה שהשגת נשמר.</p>
      </div>
    </div>
  </section>`;
}
