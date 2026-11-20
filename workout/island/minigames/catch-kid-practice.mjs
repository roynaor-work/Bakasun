const steps = [
  {picture: '🚓', start: '↔', result: '🏁', gesture: 'steer', title: 'גוררים הצידה', voice: 'גִּרְרוּ אֶת הָאֶצְבַּע הַצִּדָּה, וְהַמְּכוֹנִית תִּפְנֶה.'},
  {picture: '🚙', start: '◎', result: '✓', gesture: 'tap', title: 'נוגעים בכוונת', voice: 'כְּשֶׁהַכַּוֶּנֶת יְרֻקָּה, גְּעוּ בְּכַפְתּוֹר הַיְּרִי.'},
  {picture: '🏃', start: '↑', result: '🥅', gesture: 'release', title: 'גוררים ומשחררים', voice: 'הַחֲזִיקוּ, גִּרְרוּ אֶת הָרֶשֶׁת, וְשַׁחְרְרוּ.'},
];

export const catchPracticeStyle = `
.catch-kid-practice{color:#f7fbff;text-align:center;padding:12px 20px}
.catch-kid-practice h3{font-size:18px;margin:0}
.catch-kid-exercise{position:relative;overflow:hidden;display:grid;place-items:center;justify-self:center;width:min(320px,100%);min-height:98px;border:2px dashed #b9e5ff;border-radius:14px;background:#152f52;color:#fff;font-size:38px;touch-action:none;cursor:pointer}
.catch-kid-exercise > span{pointer-events:none}
.catch-kid-exercise[data-gesture=tap]{border-color:#8df4ad}
.catch-kid-practice .catch-kid-picture{transform:translateX(var(--practice-shift,0px))}
.catch-kid-practice .catch-kid-gesture{position:absolute;left:20%;top:10px;font-size:24px;color:#c9f2ff}
.catch-kid-practice .catch-kid-finger{position:absolute;left:20%;bottom:6px;font-size:27px;animation:catch-kid-left-right 1.6s ease-in-out infinite}
.catch-kid-exercise[data-gesture=tap] .catch-kid-finger{left:50%;animation-name:catch-kid-tap}
.catch-kid-exercise[data-gesture=release] .catch-kid-finger{animation-name:catch-kid-release}
.catch-kid-exercise[data-done=true]{background:#12432c;border-style:solid;border-color:#8df4ad}
.catch-kid-exercise[data-done=true] .catch-kid-finger{display:none}
.catch-kid-actions{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
.catch-kid-actions button,.catch-kid-practice summary{min-height:44px;min-width:44px;padding:7px 12px;border:1px solid #b9e5ff;border-radius:9px;background:#1d4066;color:#fff;font:700 14px system-ui;cursor:pointer}
.catch-kid-actions button:disabled{opacity:.55;cursor:default}
.catch-kid-actions .catch-kid-next:not(:disabled){background:#d3f6de;color:#123023;border-color:#d3f6de}
.catch-kid-practice summary{width:max-content;margin:auto}
.catch-kid-practice details p{font-size:14px}
.catch-kid-steps{display:flex;justify-content:center;gap:10px;margin:0}
.catch-kid-steps span{font-size:20px;opacity:.55}
.catch-kid-steps [aria-current=step]{opacity:1;outline:2px solid #b9e5ff;border-radius:6px}
.catch-kid-feedback{color:#d3f6de;font-size:14px;min-height:19px}
@keyframes catch-kid-left-right{0%,100%{transform:translateX(0)}50%{transform:translateX(120px)}}
@keyframes catch-kid-tap{0%,100%{transform:translate(-50%,10px)}50%{transform:translate(-50%,-16px)}}
@keyframes catch-kid-release{0%,100%{transform:translate(0,0)}75%{transform:translate(110px,-40px)}}
@media(prefers-reduced-motion:reduce){.catch-kid-finger{animation:none!important}}
`;

export function mountCatchPractice(card, tips, finish, speak) {
  const doc = card.ownerDocument;
  const make = (tag, className, text = '') => {
    const el = doc.createElement(tag);
    el.className = className;
    el.textContent = text;
    return el;
  };
  const button = (className, text, label) => {
    const el = make('button', className, text);
    el.type = 'button';
    if (label) el.setAttribute('aria-label', label);
    return el;
  };

  card.classList.add('catch-kid-practice');
  card.dir = 'rtl';
  const title = make('h3', 'catch-kid-title');
  const dots = make('div', 'catch-kid-steps');
  const markers = steps.map(step => make('span', '', step.picture));
  dots.setAttribute('aria-hidden', 'true');
  dots.append(...markers);
  const exercise = button('catch-kid-exercise', '');
  const picture = make('span', 'catch-kid-picture');
  const gesture = make('span', 'catch-kid-gesture');
  const finger = make('span', 'catch-kid-finger', '👆');
  for (const part of [picture, gesture, finger]) part.setAttribute('aria-hidden', 'true');
  exercise.append(picture, gesture, finger);
  const status = make('div', 'catch-kid-feedback');
  status.setAttribute('role', 'status');
  const actions = make('div', 'catch-kid-actions');
  const voice = button('catch-kid-voice', '🔊', 'שמיעת ההוראה');
  const next = button('catch-kid-next', '←');
  const skip = button('catch-kid-skip', '▶ למשחק');
  actions.append(voice, next, skip);
  const details = make('details', 'catch-kid-details');
  details.append(make('summary', '', 'כל ההוראות'), ...tips.map(tip => make('p', '', tip)));
  card.append(dots, title, exercise, status, actions, details);

  let step = 0;
  let pointer = null;
  let distance = 0;
  function render() {
    const item = steps[step];
    pointer = null;
    status.textContent = '';
    picture.textContent = item.picture;
    gesture.textContent = item.start;
    title.textContent = item.title;
    exercise.dataset.gesture = item.gesture;
    exercise.dataset.done = 'false';
    exercise.style.removeProperty('--practice-shift');
    exercise.setAttribute('aria-label', item.title);
    for (const [i, marker] of markers.entries()) marker.setAttribute('aria-current', i === step ? 'step' : 'false');
    next.textContent = step === steps.length - 1 ? '▶ מתחילים' : '←';
    next.setAttribute('aria-label', step === steps.length - 1 ? 'להתחיל את המרדף' : 'להדגמה הבאה');
    next.disabled = true;
  }
  function complete() {
    if (exercise.dataset.done === 'true') return;
    gesture.textContent = steps[step].result;
    exercise.dataset.done = 'true';
    status.textContent = '✓ הצלחתם';
    next.disabled = false;
  }

  exercise.addEventListener('pointerdown', event => {
    if (event.button !== 0 || pointer || exercise.dataset.done === 'true') return;
    pointer = {id: event.pointerId, x: event.clientX, y: event.clientY};
    distance = 0;
    if (event.pointerType === 'mouse') exercise.setPointerCapture?.(event.pointerId);
  });
  function track(event) {
    const x = event.clientX - pointer.x;
    const y = event.clientY - pointer.y;
    distance = Math.max(distance, step === 0 ? Math.abs(x) : Math.hypot(x, y));
    if (step === 0) {
      exercise.style.setProperty('--practice-shift', Math.max(-92, Math.min(92, x)) + 'px');
      if (distance >= 26) complete();
    }
  }
  function finishGesture(point) {
    track(point);
    pointer = null;
    if (step === 1 ? distance < 18 : distance >= 26) complete();
  }
  exercise.addEventListener('pointermove', event => {
    if (pointer?.id === event.pointerId) track(event);
  });
  exercise.addEventListener('pointerup', event => {
    if (pointer?.id === event.pointerId) finishGesture(event);
  });
  exercise.addEventListener('touchend', event => {
    if (pointer && !event.touches.length && event.changedTouches.length === 1) finishGesture(event.changedTouches[0]);
  }, {passive:true});
  exercise.addEventListener('pointercancel', () => {
    pointer = null;
    exercise.style.removeProperty('--practice-shift');
  });
  exercise.addEventListener('click', event => { if (event.detail === 0) complete(); });
  voice.addEventListener('click', () => speak(steps[step].voice, () => { status.textContent = 'אפשר לעקוב אחרי האצבע באיור'; }));
  next.addEventListener('click', () => {
    if (step === steps.length - 1) { finish(); return; }
    step++;
    render();
    exercise.focus({preventScroll:true});
  });
  skip.addEventListener('click', finish);
  render();
}
