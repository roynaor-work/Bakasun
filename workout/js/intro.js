// סרטוני פתיחה: סצנה קצרה (כ-6 שניות) שבה הדמות שלו מנצחת. אחת אקראית לפני כל אימון, כדי להתחיל עם חיוך.
import { Figure, poseAt } from './figure.js?v=20261010-child-copy-1';
import { byId } from './exercises.js?v=20261010-child-copy-1';

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };
const ease = t => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));

// פוזות מהקטלוג (side view)
const F = id => byId[id].frames;
const RUN = F('hall-sprint').slice(0, 4);           // ריצה מהירה
const JOG = F('jog');
const WIN = [[byId['run-vertical'].frames[3][0], 400], [byId['jumping-jacks'].frames[2][0], 400]]; // ידיים למעלה
const STAND = [[F('squats')[0][0], 1000]];
const LEAP = byId['run-jump'].frames[3][0];            // באוויר מעל המשוכה

// גובה ההצבה כך שהרגליים (y=182 בדמות) יעמדו על gy
const G = (gy, scale) => gy - 182 * scale;
function figure(svg, cls) { const f = new Figure(svg, true); f.g.classList.add(cls); return f; }

// כל סצנה: build(svg) -> { update(t), title }
export const SCENES = [
  { id: 'race', title: 'היום אתה ראשון! 🏁', say: 'היום אתה ראשון!',
    build(svg) {
      svg.appendChild(el('rect', { x: 0, y: 150, width: 300, height: 50, class: 'track' }));
      [160, 172, 184].forEach(y => svg.appendChild(el('line', { x1: 0, y1: y, x2: 300, y2: y, class: 'lane' })));
      const finish = el('rect', { x: 262, y: 100, width: 6, height: 90, class: 'finish' }); svg.appendChild(finish);
      const rivals = [figure(svg, 'rival'), figure(svg, 'rival')], hero = figure(svg, 'hero');
      const text = el('text', { x: 150, y: 40, class: 'stitle', 'text-anchor': 'middle' }); svg.appendChild(text);
      return { update(t) {
        const heroX = t < 3.6 ? lerp(-60, 190, ease(t / 3.6)) : 190, rx = k => lerp(-60 - k * 20, 150 - k * 20, ease(t / 4.2));
        rivals.forEach((r, k) => { const sc = 0.55 - k * 0.04; r.place(rx(k), G(168 - k * 12, sc), sc); r.draw(P(RUN, t * 1000 + k * 200)); });
        hero.place(heroX, G(184, 0.6), 0.6);
        hero.draw(t < 3.6 ? P(RUN, t * 1000) : P(WIN, (t - 3.6) * 1000));
        text.textContent = t < 3.6 ? '' : 'ניצחת! 🥇';
      } };
    } },
  { id: 'hurdles', title: 'עובר כל מכשול! 🏃', say: 'עובר כל מכשול!',
    build(svg) {
      svg.appendChild(el('rect', { x: 0, y: 150, width: 300, height: 50, class: 'track' }));
      const hs = [90, 170, 250].map(x => { const g = el('g', {}); g.appendChild(el('rect', { x: x - 2, y: 118, width: 4, height: 34, class: 'hurdle' })); g.appendChild(el('rect', { x: x - 14, y: 118, width: 28, height: 4, class: 'hurdle-top' })); svg.appendChild(g); return x; });
      const hero = figure(svg, 'hero'), rival = figure(svg, 'rival');
      const text = el('text', { x: 150, y: 40, class: 'stitle', 'text-anchor': 'middle' }); svg.appendChild(text);
      return { update(t) {
        const x = lerp(-40, 200, t / 4.4), rx = lerp(-70, 120, t / 4.8);
        const nearH = hs.some(h => Math.abs(x + 40 - h) < 22);
        hero.place(x, G(176, 0.6) - (nearH ? 44 : 0), 0.6); hero.draw(nearH ? LEAP : P(RUN, t * 1000));
        rival.place(rx, G(170, 0.55), 0.55); rival.draw(P(RUN, t * 1000 + 300));
        if (t > 4.4) { hero.place(200, G(176, 0.6), 0.6); hero.draw(P(WIN, (t - 4.4) * 1000)); text.textContent = 'כל המשוכות! 🎉'; }
      } };
    } },
  { id: 'dunk', title: 'סלאם דאנק! 🏀', say: 'סלאם דאנק!',
    build(svg) {
      svg.appendChild(el('rect', { x: 0, y: 178, width: 300, height: 22, class: 'court' }));
      svg.appendChild(el('rect', { x: 262, y: 40, width: 6, height: 140, class: 'pole' })); svg.appendChild(el('rect', { x: 250, y: 44, width: 18, height: 40, class: 'board' }));
      const rim = el('line', { x1: 218, y1: 78, x2: 252, y2: 78, class: 'rim' }); svg.appendChild(rim);
      const ball = el('circle', { r: 8, class: 'ball' }); svg.appendChild(ball);
      const hero = figure(svg, 'hero');
      const text = el('text', { x: 120, y: 40, class: 'stitle', 'text-anchor': 'middle' }); svg.appendChild(text);
      return { update(t) {
        const gy = G(180, 0.65);
        if (t < 2.6) { const x = lerp(-40, 120, t / 2.6); hero.place(x, gy, 0.65); hero.draw(P(RUN, t * 1000)); ball.setAttribute('cx', x + 80); ball.setAttribute('cy', 150 + Math.abs(Math.sin(t * 9)) * -30 + 20); }
        else if (t < 3.6) { const k = ease((t - 2.6) / 1); const x = lerp(120, 165, k), y = gy - 78 * Math.sin(k * Math.PI); hero.place(x, y, 0.65); hero.draw(byId['run-vertical'].frames[3][0]); ball.setAttribute('cx', x + 70); ball.setAttribute('cy', y + 40); }
        else { hero.place(165, gy, 0.65); hero.draw(P(WIN, (t - 3.6) * 1000)); const k = Math.min(1, (t - 3.6) * 2); ball.setAttribute('cx', 235); ball.setAttribute('cy', 80 + k * 60); text.textContent = 'דאנק!!! 🔥'; }
      } };
    } },
  { id: 'dribble', title: 'כדרור וקליעה! 🎯', say: 'כדרור, עוברים את השומר, וקליעה!',
    build(svg) {
      svg.appendChild(el('rect', { x: 0, y: 178, width: 300, height: 22, class: 'court' }));
      svg.appendChild(el('rect', { x: 268, y: 60, width: 5, height: 120, class: 'pole' })); svg.appendChild(el('rect', { x: 256, y: 64, width: 17, height: 34, class: 'board' }));
      svg.appendChild(el('line', { x1: 226, y1: 96, x2: 258, y2: 96, class: 'rim' }));
      const ball = el('circle', { r: 8, class: 'ball' }); svg.appendChild(ball);
      const guard = figure(svg, 'rival'), hero = figure(svg, 'hero');
      const text = el('text', { x: 120, y: 40, class: 'stitle', 'text-anchor': 'middle' }); svg.appendChild(text);
      return { update(t) {
        const gy = G(180, 0.65);
        guard.place(110 + Math.sin(t * 2) * 8, G(180, 0.6), 0.6); guard.draw(byId['side-shuffle'].frames[0][0]);
        if (t < 2.8) { const x = lerp(-40, 60, t / 2.8); hero.place(x, gy, 0.65); hero.draw(P(JOG, t * 1000)); ball.setAttribute('cx', x + 80); ball.setAttribute('cy', 165 - Math.abs(Math.sin(t * 8)) * 40); }
        else if (t < 3.8) { const k = ease((t - 2.8) / 1); const x = lerp(60, 150, k); hero.place(x, gy - Math.sin(k * Math.PI) * 10, 0.65); hero.draw(P(RUN, t * 1000)); ball.setAttribute('cx', x + 80); ball.setAttribute('cy', 150); }
        else if (t < 5) { const k = (t - 3.8) / 1.2; hero.place(150, gy - 30, 0.65); hero.draw(byId['run-vertical'].frames[3][0]); const bx = lerp(215, 242, k), by = 70 - Math.sin(k * Math.PI) * 60 + k * 30; ball.setAttribute('cx', bx); ball.setAttribute('cy', by); }
        else { hero.place(150, gy, 0.65); hero.draw(P(WIN, (t - 5) * 1000)); ball.setAttribute('cx', 242); ball.setAttribute('cy', 100 + Math.min(1, (t - 5) * 2) * 60); text.textContent = 'סוויש! 🎯'; }
      } };
    } },
  { id: 'podium', title: 'עולה על הפודיום! 🥇', say: 'מקום ראשון!',
    build(svg) {
      [[100, 120, 1], [40, 140, 2], [160, 150, 3]].forEach(([x, y, n]) => { svg.appendChild(el('rect', { x, y, width: 60, height: 200 - y, class: 'podium' })); const t = el('text', { x: x + 30, y: y + 28, class: 'pnum', 'text-anchor': 'middle' }); t.textContent = n; svg.appendChild(t); });
      const a = figure(svg, 'rival'), b = figure(svg, 'rival'), hero = figure(svg, 'hero');
      a.place(20, G(140, 0.5), 0.5); a.draw(STAND[0][0]); b.place(140, G(150, 0.5), 0.5); b.draw(STAND[0][0]);
      const text = el('text', { x: 150, y: 30, class: 'stitle', 'text-anchor': 'middle' }); svg.appendChild(text);
      const medal = el('text', { x: 255, y: 90, class: 'medal', 'text-anchor': 'middle' }); svg.appendChild(medal);
      return { update(t) {
        const y = G(120, 0.55);
        hero.place(80, t < 1 ? lerp(y - 60, y, ease(t)) : y, 0.55);
        hero.draw(t < 1 ? P(JOG, t * 1000) : P(WIN, t * 1000));
        if (t > 1.5) { medal.textContent = '🥇'; medal.setAttribute('y', 90 + Math.sin(t * 3) * 4); text.textContent = 'אלוף! 👑'; }
      } };
    } },
];
// פוזה מתוך רצף פריימים בזמן נתון (poseAt מחזיר את הפוזה עצמה)
function P(frames, ms) { const p = poseAt(frames, ms); return p.pose || p; }

export function playIntro(host, { onDone, voice }) {
  const scene = SCENES[Math.floor(Math.random() * SCENES.length)];
  host.innerHTML = `
    <div class="stack intro">
      <h1 class="center">${scene.title}</h1>
      <div class="stage scene"><svg viewBox="0 0 300 200" class="figure scene-svg" aria-hidden="true"></svg></div>
      <button class="btn primary big" id="introgo">יאללה, לאימון! 💪</button>
    </div>`;
  const svg = host.querySelector('svg');
  const ctl = scene.build(svg);
  const start = performance.now(); let raf = 0;
  const loop = now => { ctl.update(((now - start) / 1000) % 7); raf = requestAnimationFrame(loop); };
  raf = requestAnimationFrame(loop);
  if (voice) voice(scene.id);
  const done = () => { cancelAnimationFrame(raf); onDone(); };
  host.querySelector('#introgo').onclick = done;
  return { stop: () => cancelAnimationFrame(raf) };
}
