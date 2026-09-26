/* Seating and grouping: people into tables, rooms or buses. Pure logic. */
import { trim, str } from './core.js';
import Office from './office.js';

export const GROUP_KINDS = ['שולחנות', 'חדרים', 'אוטובוסים', 'קבוצות'];
export const GROUP_KIND_L = { 'שולחנות': { en: 'Tables', fr: 'Tables', one: { he: 'שולחן', en: 'Table', fr: 'Table' } }, 'חדרים': { en: 'Rooms', fr: 'Chambres', one: { he: 'חדר', en: 'Room', fr: 'Chambre' } },
  'אוטובוסים': { en: 'Buses', fr: 'Bus', one: { he: 'אוטובוס', en: 'Bus', fr: 'Bus' } }, 'קבוצות': { en: 'Groups', fr: 'Groupes', one: { he: 'קבוצה', en: 'Group', fr: 'Groupe' } } };

/** A pasted list (one per line, or comma separated; "name, note" keeps the note) → people. */
export function parsePeople(text) {
  const out = [], seen = {};
  str(text).split(/\n/).forEach(line => {
    line.replace(/^[\d\.\-\)\s•]+/, '').split(/[;|]/).forEach(part => {
      const bits = part.split(',').map(trim).filter(Boolean);
      if (!bits.length) return;
      const name = bits[0], note = bits.slice(1).join(', ');
      const k = Office.normHe(name);
      if (!name || seen[k]) return;
      seen[k] = 1; out.push({ name, note });
    });
  });
  return out;
}

/** n containers named by kind: "שולחן 1" ... with a capacity. */
export function makeContainers(kind, n, capacity, lang) {
  const one = (GROUP_KIND_L[kind] && GROUP_KIND_L[kind].one[lang || 'he']) || kind;
  const out = [];
  for (let i = 1; i <= n; i++) out.push({ id: 'g' + i, name: one + ' ' + i, capacity: +capacity || 0 });
  return out;
}

/** Counts per container, who is unassigned, and which containers are over capacity. */
export function summary(people, containers) {
  const count = {}; (people || []).forEach(p => { if (p.group) count[p.group] = (count[p.group] || 0) + 1; });
  const cs = (containers || []).map(c => Object.assign({}, c, { count: count[c.id] || 0, over: c.capacity ? Math.max(0, (count[c.id] || 0) - c.capacity) : 0, free: c.capacity ? Math.max(0, c.capacity - (count[c.id] || 0)) : null }));
  const unassigned = (people || []).filter(p => !p.group || !cs.some(c => c.id === p.group));
  return { containers: cs, unassigned, over: cs.filter(c => c.over > 0), placed: (people || []).length - unassigned.length };
}

/** Fills the unassigned people into containers with free places, in order. Keeps what is already placed. */
export function autoFill(people, containers) {
  const s = summary(people, containers);
  const free = {}; s.containers.forEach(c => { free[c.id] = c.capacity ? c.free : Infinity; });
  const order = s.containers.map(c => c.id);
  return people.map(p => {
    if (p.group && free[p.group] !== undefined && s.containers.some(c => c.id === p.group)) return p;
    const target = order.find(id => free[id] > 0);
    if (!target) return Object.assign({}, p, { group: '' });
    free[target] -= 1;
    return Object.assign({}, p, { group: target });
  });
}

/** The list for one container as text (to send to the driver, the hotel, the hall). */
export function containerText(container, people, cs) {
  const mine = people.filter(p => p.group === container.id);
  const head = container.name + (cs && cs.date ? ' · ' + Office.fmt(cs.date) : '') + (cs && cs.client ? ' · ' + cs.client : '') + ' (' + mine.length + ')';
  return head + '\n' + mine.map((p, i) => (i + 1) + '. ' + p.name + (p.note ? ' · ' + p.note : '')).join('\n');
}
export function allText(containers, people, cs) {
  return containers.map(c => containerText(c, people, cs)).join('\n\n');
}
