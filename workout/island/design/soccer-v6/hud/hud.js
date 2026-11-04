// Standalone DOM/SVG presentation layer. The host owns match rules and replay footage.
const sprite = new URL('./assets/hud-symbols.svg', import.meta.url).href;
const icon = name => `<svg aria-hidden="true"><use href="${sprite}#${name}"/></svg>`;
const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
const integer = value => Math.round(clamp(value, 0, 999));
const template = `
  <section class="soccer-hud" data-theme="coast" data-mode="live" aria-label="ממשק המשחק">
    <div class="scorebug" role="region" aria-label="לוח תוצאות">
      <div class="score-meta"><b>MATCHDAY</b><span class="slash">/</span><span>06</span></div>
      <div class="score-row"><span class="team home" data-role="home-name">חוף</span><div class="score" aria-label="תוצאה"><b data-role="home-score">2</b><i>:</i><b data-role="away-score">1</b></div><span class="team away" data-role="away-name">רכס</span></div>
      <div class="match-clock"><i class="clock-light"></i><time data-role="clock">46:28</time><span data-role="period">מחצית 2</span></div>
    </div>
    <div class="broadcast-tools"><span class="live" data-role="live-tag">LIVE</span><button class="pause-button" data-action="pause" aria-label="השהיית משחק" aria-pressed="false">${icon('pause')}</button></div>
    <div class="format-label">${icon('camera')}<span>משחק ידידות</span><span>6 × 6</span></div>
    <div class="control-layer">
      <div class="player-strip"><b class="player-number" data-role="player-number">09</b><div class="player-copy"><strong data-role="player-name">שחקן 09</strong><small data-role="player-position">קשר התקפי</small></div></div>
      <div class="stamina" data-low="false"><div class="stamina-label"><span>ספרינט</span><output data-role="stamina-value">82%</output></div><div class="stamina-track" role="meter" aria-label="אנרגיית ספרינט" aria-valuemin="0" aria-valuemax="100" aria-valuenow="82"><div class="stamina-fill"></div></div></div>
      <div class="radar"><div class="radar-heading">מפת המגרש</div><svg viewBox="0 0 112 64" role="img" aria-label="מיקום שישה שחקני בית ושישה שחקני חוץ וכדור"><path d="M1 1h110v62H1zM56 1v62M1 18h15v28H1m110-28H96v28h15M1 25h5v14H1m110-14h-5v14h5"/><circle cx="56" cy="32" r="10"/><circle cx="56" cy="32" r=".8" fill="currentColor"/><g data-role="radar-players"></g><circle class="radar-active" r="4.7"/><circle class="radar-ball" r="1.65"/></svg></div>
      <button class="joystick" aria-label="תנועה: גרירה או חיצי מקלדת"><span class="stick-axis" aria-hidden="true"></span><span class="stick-knob" aria-hidden="true"></span><span class="stick-caption" aria-hidden="true">תנועה</span></button>
      <div class="action-cluster" role="group" aria-label="פעולות במשחק">
        <button class="action-button shoot" data-action="shoot" aria-label="בעיטה">${icon('shoot')}<span>בעיטה</span></button>
        <button class="action-button through" data-action="through" aria-label="מסירת עומק">${icon('through')}<span>עומק</span></button>
        <button class="action-button pass" data-action="pass" aria-label="מסירה">${icon('pass')}<span>מסירה</span></button>
        <button class="action-button sprint" data-action="sprint" aria-label="ספרינט: לחיצה ממושכת" aria-pressed="false">${icon('sprint')}<span>ספרינט</span></button>
      </div>
    </div>
    <div class="action-feedback" role="status" hidden></div>
    <div class="event-layer">
      <section class="substitution" aria-label="החלפת שחקן" hidden>
        <div class="event-caption"><span>${icon('substitution')}החלפת שחקן</span><b data-role="sub-minute">67′</b></div>
        <div class="sub-body"><div class="sub-shirt">${icon('shirt')}<strong data-role="sub-number">13</strong></div><div><div class="sub-in"><span class="arrow-in">${icon('arrow')}</span><span data-role="sub-in">שחקן 13</span></div><div class="sub-out"><span class="arrow-out">${icon('arrow')}</span><span data-role="sub-out">שחקן 08</span></div></div><span class="sub-position" data-role="sub-position">CM</span></div>
        <button class="sub-close" data-action="continue"><span>המשך למשחק</span>${icon('arrow')}</button>
      </section>
      <section class="goal-event" aria-label="שער" hidden>
        <div class="goal-swash" aria-hidden="true"></div><div class="goal-eyebrow">כל הדרך לרשת</div><h2 class="goal-title">GOAL</h2><p class="goal-scorer"><span data-role="scorer">שחקן 09</span> <span aria-hidden="true">/</span> <span data-role="goal-minute">67′</span></p>
        <div class="goal-score"><span data-role="goal-home">חוף</span><b data-role="goal-score">3 : 1</b><span data-role="goal-away">רכס</span></div><button class="goal-continue" data-action="replay">חזרה מהירה ${icon('arrow')}</button>
      </section>
      <section class="replay-event" aria-label="חזרה מהירה" hidden>
        <div class="replay-bug">${icon('replay')}REPLAY <span aria-hidden="true">/</span><span>חזרה מהירה</span></div><div class="replay-frame" aria-hidden="true"></div>
        <div class="replay-transport"><div class="replay-info"><strong data-role="replay-time">00:00 / 00:04</strong><span>מצלמת שידור</span></div><div class="replay-track" role="progressbar" aria-label="התקדמות החזרה" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="replay-progress"></div></div><button class="skip-replay" data-action="continue"><span>חזרה למשחק</span>${icon('skip')}</button></div>
      </section>
      <section class="pause-event" aria-label="המשחק מושהה" hidden><h2>פסק זמן.</h2><button class="resume-button" data-action="resume">חזרה למשחק</button></section>
    </div>
    <div class="sr-only" data-role="announcer" role="status" aria-live="polite" aria-atomic="true"></div>
  </section>`;

export const themes = Object.freeze({
  coast: Object.freeze({home: 'חוף', away: 'רכס', primary: '#77e5cf', opponent: '#f29b7d'}),
  dusk: Object.freeze({home: 'אופק', away: 'חול', primary: '#c8b7ff', opponent: '#f2d280'})
});

export class SoccerHUD {
  constructor(mount, {theme = 'coast'} = {}) {
    if (!(mount instanceof HTMLElement)) throw new TypeError('A HUD mount element is required');
    this.mount = mount;
    mount.innerHTML = template;
    this.root = mount.querySelector('.soccer-hud');
    this.abort = new AbortController();
    this.roles = Object.fromEntries([...this.root.querySelectorAll('[data-role]')].map(node => [node.dataset.role, node]));
    this.mode = 'live';
    this.paused = false;
    this.stamina = 82;
    this.score = [2, 1];
    this.clockSeconds = 2788;
    this.replayFrame = 0;
    this.sprintHeld = false;
    this.stickPointer = null;
    this.heldPointers = new Map();
    this.keys = new Set();
    this.controls = this.root.querySelector('.control-layer');
    this.stick = this.root.querySelector('.joystick');
    this.knob = this.root.querySelector('.stick-knob');
    const signal = this.abort.signal;
    this.root.addEventListener('click', event => this.onClick(event), {signal});
    this.root.querySelectorAll('.action-button').forEach(button => {
      button.addEventListener('pointerdown', event => this.pressAction(event, button), {signal});
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
        button.addEventListener(type, event => this.releaseAction(event.pointerId), {signal});
      }
    });
    this.stick.addEventListener('pointerdown', event => {
      if (this.controls.inert || this.stickPointer !== null || event.button !== 0) return;
      event.preventDefault();
      this.stickPointer = event.pointerId;
      this.stick.setPointerCapture(event.pointerId);
      this.moveStick(event);
    }, {signal});
    this.stick.addEventListener('pointermove', event => this.moveStick(event), {signal});
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      this.stick.addEventListener(type, event => {if (event.pointerId === this.stickPointer) this.resetStick();}, {signal});
    }
    this.stick.addEventListener('keydown', event => this.keyboardStick(event, true), {signal});
    this.stick.addEventListener('keyup', event => this.keyboardStick(event, false), {signal});
    this.stick.addEventListener('blur', () => this.resetStick(), {signal});
    window.addEventListener('blur', () => this.releaseInputs(), {signal});
    document.addEventListener('visibilitychange', () => {if (document.hidden) this.releaseInputs();}, {signal});
    this.markers = Array.from({length: 12}, (_, index) => {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('class', index < 6 ? 'radar-home' : 'radar-away');
      circle.setAttribute('r', '2.25');
      this.roles['radar-players'].append(circle);
      return circle;
    });
    this.setTheme(theme);
    this.setClock(this.clockSeconds);
    this.setScore(...this.score);
  }

  emit(action, phase = 'activate', extra = {}) {
    this.mount.dispatchEvent(new CustomEvent('soccer-hud:action', {bubbles: true, detail: {action, phase, ...extra}}));
  }

  announce(message) { this.roles.announcer.textContent = message; }

  setTheme(name) {
    if (!Object.hasOwn(themes, name)) throw new RangeError('Unknown HUD theme');
    this.theme = name;
    this.root.dataset.theme = name;
    for (const suffix of ['name', 'goal']) {
      const home = suffix === 'name' ? 'home-name' : 'goal-home';
      const away = suffix === 'name' ? 'away-name' : 'goal-away';
      this.roles[home].textContent = themes[name].home;
      this.roles[away].textContent = themes[name].away;
    }
    this.setScore(...this.score);
  }

  setScore(home, away) {
    this.score = [integer(home), integer(away)];
    this.roles['home-score'].textContent = this.score[0];
    this.roles['away-score'].textContent = this.score[1];
    this.roles['goal-score'].textContent = `${this.score[0]} : ${this.score[1]}`;
    this.root.querySelector('.score').setAttribute('aria-label', `${themes[this.theme].home} ${this.score[0]}, ${themes[this.theme].away} ${this.score[1]}`);
  }

  setClock(seconds, period = 'מחצית 2') {
    this.clockSeconds = Math.floor(clamp(seconds, 0, 599999));
    const minutes = Math.floor(this.clockSeconds / 60);
    const remainder = this.clockSeconds % 60;
    this.roles.clock.textContent = `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
    this.roles.clock.dateTime = `PT${this.clockSeconds}S`;
    this.roles.period.textContent = String(period).slice(0, 20);
  }

  setPlayer({number = 9, name = 'שחקן 09', position = 'קשר התקפי'} = {}) {
    this.roles['player-number'].textContent = String(integer(number)).padStart(2, '0');
    this.roles['player-name'].textContent = String(name).slice(0, 24);
    this.roles['player-position'].textContent = String(position).slice(0, 24);
  }

  setStamina(percent) {
    this.stamina = clamp(percent, 0, 100);
    this.roles['stamina-value'].textContent = `${Math.round(this.stamina)}%`;
    this.root.querySelector('.stamina-fill').style.transform = `scaleX(${this.stamina / 100})`;
    this.root.querySelector('.stamina-track').setAttribute('aria-valuenow', String(Math.round(this.stamina)));
    this.root.querySelector('.stamina').dataset.low = String(this.stamina < 25);
    if (this.stamina === 0 && this.sprintHeld) this.releaseInputs();
  }

  updateRadar({home = [], away = [], ball = [.5, .5], active = 4} = {}) {
    const points = [...home.slice(0, 6), ...away.slice(0, 6)];
    const place = (node, point) => {
      node.setAttribute('cx', String(1 + clamp(point[0], 0, 1) * 110));
      node.setAttribute('cy', String(1 + clamp(point[1], 0, 1) * 62));
    };
    this.markers.forEach((marker, index) => {
      // Separate fixed slots prevent an incomplete home team from inheriting away colors.
      const point = index < 6 ? home[index] : away[index - 6];
      marker.style.display = point ? '' : 'none';
      if (point) place(marker, point);
    });
    const selected = this.root.querySelector('.radar-active');
    const point = Number.isInteger(active) && active >= 0 && active < 12
      ? (active < 6 ? home[active] : away[active - 6]) : null;
    selected.style.display = point ? '' : 'none';
    if (point) place(selected, point);
    place(this.root.querySelector('.radar-ball'), ball);
    return points.length;
  }

  setMode(mode) {
    if (!['live', 'substitution', 'goal', 'replay'].includes(mode)) throw new RangeError('Unknown HUD mode');
    cancelAnimationFrame(this.replayFrame);
    clearTimeout(this.eventTimer);
    this.releaseInputs();
    this.mode = mode;
    this.root.dataset.mode = mode;
    for (const name of ['substitution', 'goal-event', 'replay-event']) this.root.querySelector(`.${name}`).hidden = true;
    const selector = {substitution: '.substitution', goal: '.goal-event', replay: '.replay-event'}[mode];
    if (selector) this.root.querySelector(selector).hidden = false;
    this.root.querySelector('.format-label').hidden = mode === 'replay';
    this.controls.inert = this.paused || mode === 'goal' || mode === 'replay';
    this.roles['live-tag'].textContent = mode === 'replay' ? 'REPLAY' : this.paused ? 'PAUSED' : 'LIVE';
    this.root.querySelector('.action-feedback').hidden = true;
  }

  showSubstitution({incoming = 'שחקן 13', outgoing = 'שחקן 08', number = 13, position = 'CM', minute = 67, duration = 5500} = {}) {
    this.setMode('substitution');
    for (const [key, value] of [['sub-in', incoming], ['sub-out', outgoing], ['sub-position', position]]) this.roles[key].textContent = String(value).slice(0, 24);
    this.roles['sub-number'].textContent = String(integer(number)).padStart(2, '0');
    this.roles['sub-minute'].textContent = `${integer(minute)}′`;
    this.announce(`החלפה. ${incoming} נכנס, ${outgoing} יוצא.`);
    if (duration > 0) this.eventTimer = setTimeout(() => this.setMode('live'), clamp(duration, 1000, 30000));
  }

  showGoal({scorer = 'שחקן 09', minute = 67, home = this.score[0], away = this.score[1]} = {}) {
    this.setScore(home, away);
    this.setMode('goal');
    this.roles.scorer.textContent = String(scorer).slice(0, 24);
    this.roles['goal-minute'].textContent = `${integer(minute)}′`;
    this.announce(`שער! ${scorer}, דקה ${integer(minute)}.`);
  }

  showReplay({duration = 4000, progress = null} = {}) {
    this.setMode('replay');
    const length = clamp(duration, 1000, 30000);
    const format = time => `00:${String(Math.floor(time / 1000)).padStart(2, '0')}`;
    const paint = fraction => {
      this.root.querySelector('.replay-progress').style.transform = `scaleX(${fraction})`;
      this.root.querySelector('.replay-track').setAttribute('aria-valuenow', String(Math.round(fraction * 100)));
      this.roles['replay-time'].textContent = `${format(fraction * length)} / ${format(length)}`;
    };
    this.announce('חזרה מהירה. אפשר לחזור למשחק בכל רגע.');
    if (progress !== null) { paint(clamp(progress, 0, 1)); return; }
    let elapsed = 0;
    let previous = performance.now();
    const frame = now => {
      if (this.mode !== 'replay' || this.abort.signal.aborted) return;
      if (!document.hidden && !this.paused) elapsed += Math.min(now - previous, 100);
      previous = now;
      const fraction = clamp(elapsed / length, 0, 1);
      paint(fraction);
      if (fraction >= 1) { this.setMode('live'); this.emit('replay-end'); }
      else this.replayFrame = requestAnimationFrame(frame);
    };
    paint(0);
    this.replayFrame = requestAnimationFrame(frame);
  }

  setPaused(paused) {
    if (this.paused === Boolean(paused)) return;
    this.paused = Boolean(paused);
    this.releaseInputs();
    this.root.querySelector('.pause-event').hidden = !this.paused;
    this.root.querySelector('.pause-button').setAttribute('aria-pressed', String(this.paused));
    this.root.querySelector('.pause-button').setAttribute('aria-label', this.paused ? 'חידוש משחק' : 'השהיית משחק');
    this.controls.inert = this.paused || this.mode === 'goal' || this.mode === 'replay';
    for (const selector of ['.substitution', '.goal-event', '.replay-event']) this.root.querySelector(selector).inert = this.paused;
    this.roles['live-tag'].textContent = this.paused ? 'PAUSED' : this.mode === 'replay' ? 'REPLAY' : 'LIVE';
    if (this.paused) this.root.querySelector('.resume-button').focus({preventScroll: true});
    else this.root.querySelector('.pause-button').focus({preventScroll: true});
    this.emit('pause', 'change', {paused: this.paused});
  }

  feedback(message) {
    const node = this.root.querySelector('.action-feedback');
    clearTimeout(this.feedbackTimer);
    node.textContent = String(message).slice(0, 60);
    node.hidden = false;
    this.feedbackTimer = setTimeout(() => { node.hidden = true; }, 900);
  }

  pressAction(event, button) {
    if (this.controls.inert || event.button !== 0 || (button.dataset.action === 'sprint' && this.stamina === 0)) return;
    // One pointer owns each button; other fingers can still operate the stick and other buttons.
    if ([...this.heldPointers.values()].includes(button)) return;
    button.setPointerCapture(event.pointerId);
    this.heldPointers.set(event.pointerId, button);
    button.classList.add('is-held');
    if (button.dataset.action === 'sprint') {
      this.sprintHeld = true;
      button.setAttribute('aria-pressed', 'true');
      this.emit('sprint', 'start');
    }
  }

  releaseAction(pointerId) {
    const button = this.heldPointers.get(pointerId);
    if (!button) return;
    this.heldPointers.delete(pointerId);
    button.classList.remove('is-held');
    if (button.dataset.action === 'sprint') {
      this.sprintHeld = false;
      button.setAttribute('aria-pressed', 'false');
      this.emit('sprint', 'end');
    }
  }

  onClick(event) {
    const button = event.target.closest('[data-action]');
    if (!button || !this.root.contains(button)) return;
    const action = button.dataset.action;
    if (['shoot', 'pass', 'through', 'sprint'].includes(action) && this.controls.inert) return;
    if (action === 'pause') this.setPaused(!this.paused);
    else if (action === 'resume') this.setPaused(false);
    else if (action === 'continue') {this.setMode('live'); this.emit('continue');}
    else if (action === 'replay') {this.showReplay(); this.emit('replay');}
    else if (action === 'sprint' && event.detail === 0) {
      if (!this.stamina && !this.sprintHeld) return;
      this.sprintHeld = !this.sprintHeld;
      button.setAttribute('aria-pressed', String(this.sprintHeld));
      button.classList.toggle('is-held', this.sprintHeld);
      this.emit('sprint', this.sprintHeld ? 'start' : 'end');
    } else if (action !== 'sprint') this.emit(action);
  }

  moveStick(event) {
    if (event.pointerId !== this.stickPointer || this.controls.inert) return;
    const bounds = this.stick.getBoundingClientRect();
    const radius = bounds.width * .28;
    let x = (event.clientX - bounds.left - bounds.width / 2) / radius;
    let y = (event.clientY - bounds.top - bounds.height / 2) / radius;
    const length = Math.hypot(x, y);
    if (length > 1) {x /= length; y /= length;}
    this.knob.style.transform = `translate(${x * radius}px,${y * radius}px)`;
    this.emit('move', 'change', {x, y});
  }

  keyboardStick(event, down) {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key) || this.controls.inert) return;
    event.preventDefault();
    if (down) this.keys.add(event.key); else this.keys.delete(event.key);
    let x = Number(this.keys.has('ArrowRight')) - Number(this.keys.has('ArrowLeft'));
    let y = Number(this.keys.has('ArrowDown')) - Number(this.keys.has('ArrowUp'));
    const length = Math.hypot(x, y) || 1;
    x /= length; y /= length;
    const radius = this.stick.getBoundingClientRect().width * .28;
    this.knob.style.transform = `translate(${x * radius}px,${y * radius}px)`;
    this.emit('move', 'change', {x, y});
  }

  resetStick() {
    const active = this.stickPointer !== null || this.keys.size > 0;
    this.stickPointer = null;
    this.keys.clear();
    this.knob.style.transform = '';
    if (active) this.emit('move', 'change', {x: 0, y: 0});
  }

  releaseInputs() {
    for (const pointerId of [...this.heldPointers.keys()]) this.releaseAction(pointerId);
    if (this.sprintHeld) {this.sprintHeld = false; this.emit('sprint', 'end');}
    this.root.querySelector('.sprint').classList.remove('is-held');
    this.root.querySelector('.sprint').setAttribute('aria-pressed', 'false');
    this.resetStick();
  }

  destroy() {
    this.releaseInputs();
    this.abort.abort();
    cancelAnimationFrame(this.replayFrame);
    clearTimeout(this.eventTimer);
    clearTimeout(this.feedbackTimer);
    this.root.remove();
  }
}
