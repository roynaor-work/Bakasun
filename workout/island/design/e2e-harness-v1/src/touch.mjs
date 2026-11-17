import {delay} from './runtime.mjs';

// Every interaction, including menu scrolling, goes through this single CDP
// transport. There are no mouse, keyboard, DOM click, fill or synthetic events.
export class TouchInput {
  constructor(page, cdp, journal = []) {
    this.page = page; this.cdp = cdp; this.journal = journal;
    this.contacts = new Map(); this.nextId = 1;
  }
  async send(type) {
    const touchPoints = [...this.contacts.values()].map(p => ({...p, radiusX: 5, radiusY: 5, force: 1}));
    await this.cdp.send('Input.dispatchTouchEvent', {type, touchPoints});
    this.journal.push({type, atMs: Math.round(performance.now()), points: touchPoints.map(({id, x, y}) => ({id, x, y}))});
  }
  async down(point) {
    const id = this.nextId++;
    this.contacts.set(id, {id, x: point.x, y: point.y}); await this.send('touchStart'); return id;
  }
  async move(id, point) {
    if (!this.contacts.has(id)) throw new Error(`Unknown contact ${id}`);
    this.contacts.set(id, {id, x: point.x, y: point.y}); await this.send('touchMove');
  }
  async up(id) {
    if (!this.contacts.delete(id)) return;
    // CDP accepts the remaining contacts for a partial touchEnd.
    await this.send('touchEnd');
  }
  async release() {
    if (!this.contacts.size) return;
    this.contacts.clear(); await this.send('touchEnd');
  }
  async swipe(from, to, steps = 9) {
    const id = await this.down(from);
    try {
      for (let i = 1; i <= steps; i++) {
        await this.move(id, {x: from.x + (to.x - from.x) * i / steps, y: from.y + (to.y - from.y) * i / steps});
        await delay(24);
      }
    } finally { await this.up(id); }
    await delay(180);
  }
  async point(locator, {scroll = true} = {}) {
    await locator.waitFor({state: 'visible'});
    for (let attempt = 0; attempt < (scroll ? 18 : 1); attempt++) {
      const b = await locator.boundingBox(), size = this.page.viewportSize();
      if (!b) throw new Error('Touch target has no box');
      const point = {x: b.x + b.width / 2, y: b.y + b.height / 2};
      if (point.x > 1 && point.y > 1 && point.x < size.width - 1 && point.y < size.height - 1 &&
          await locator.evaluate((node, p) => {
            const hit = node.ownerDocument.elementFromPoint(p.x, p.y);
            return hit === node || node.contains(hit);
          }, await this.localPoint(locator, point))) return point;
      if (!scroll) return null;
      // Read the nearest scrolling ancestor; the actual scroll is a touch drag.
      const area = await locator.evaluate(node => {
        for (let p = node.parentElement; p; p = p.parentElement) {
          const s = getComputedStyle(p), r = p.getBoundingClientRect();
          if (/(auto|scroll)/.test(s.overflowY) && p.scrollHeight > p.clientHeight + 2)
            return {x: r.x, y: r.y, width: r.width, height: r.height};
        }
        return {x: 0, y: 0, width: innerWidth, height: innerHeight};
      });
      const local = await this.localPoint(locator, {x: 0, y: 0});
      const left = Math.max(8, area.x - local.x), right = Math.min(size.width - 8, area.x - local.x + area.width);
      const top = Math.max(8, area.y - local.y), bottom = Math.min(size.height - 8, area.y - local.y + area.height);
      const x = left + Math.min(30, (right - left) / 3), span = Math.min(220, (bottom - top) * .65);
      const direction = point.y < top + 12 ? 1 : -1;
      const y = direction < 0 ? bottom - 15 : top + 15;
      await this.swipe({x, y}, {x, y: y + span * direction});
    }
    throw new Error(`Touch target is outside the viewport or covered: ${await locator.getAttribute('data-action') || await locator.getAttribute('id')}`);
  }
  async localPoint(locator, point) {
    // boundingBox uses top-page coordinates; elementFromPoint uses frame coords.
    const [global, local] = await Promise.all([
      locator.boundingBox(), locator.evaluate(n => {const r = n.getBoundingClientRect(); return {x: r.x, y: r.y};})
    ]);
    return {x: point.x - global.x + local.x, y: point.y - global.y + local.y};
  }
  async tap(locator, {holdMs = 55, ...options} = {}) {
    if (!await locator.isEnabled()) throw new Error('Touch target is disabled');
    const p = await this.point(locator, options);
    if (!p) throw new Error('Touch target is covered');
    const id = await this.down(p);
    try { await delay(holdMs); } finally { await this.up(id); }
    await delay(90);
  }
}
