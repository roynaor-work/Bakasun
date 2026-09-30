/* Structure inside the task list: subtasks (parentId), the checklist inside a task (todos), dependencies (blockedBy),
   priority order, the critical path of one event and the time spent. Pure functions over plain task records; the
   screen (js/screens/tasks.js) calls them and does the storage. New fields are all optional, old tasks keep working. */
import { TASK } from './extra.js';

const str = v => v == null ? '' : String(v);
const isDone = t => t && t.status === TASK.done;

/* ---------------- priority ---------------- */
export const PRIORITIES = ['urgent', 'high', 'normal', 'low'];
const PRIO_RANK = { urgent: 0, high: 1, normal: 2, low: 3 };
export function priorityRank(t) { const r = PRIO_RANK[t && t.priority]; return r == null ? 2 : r; }
/** Stable sort: urgent first, then high, normal, low; equal priorities keep their order. */
export function sortByPriority(list) {
  return (list || []).map((t, i) => [t, i]).sort((a, b) => priorityRank(a[0]) - priorityRank(b[0]) || a[1] - b[1]).map(x => x[0]);
}

/* ---------------- subtasks ---------------- */
/** Nested view of a list: [{task, children: [...]}] in the order given. A task whose parent is not in the list is a root
 *  (so an open child of a closed parent still shows). Cycles are cut. */
export function tree(tasks) {
  const list = tasks || [];
  const byId = new Map(list.map(t => [t.id, { task: t, children: [] }]));
  const roots = [];
  list.forEach(t => {
    const node = byId.get(t.id);
    const p = t.parentId && t.parentId !== t.id ? byId.get(t.parentId) : null;
    if (p && !isAncestor(byId, t.id, t.parentId)) p.children.push(node); else roots.push(node);
  });
  return roots;
}
function isAncestor(byId, id, of) { // is `id` above `of` already (would make a cycle)?
  let cur = byId.get(of); const seen = new Set();
  while (cur && cur.task.parentId && !seen.has(cur.task.id)) { seen.add(cur.task.id); if (cur.task.parentId === id) return true; cur = byId.get(cur.task.parentId); }
  return false;
}
/** Direct children of a task, in list order. */
export function childrenOf(tasks, id) { return (tasks || []).filter(t => t.parentId === id && t.id !== id); }
/** Every task under one, at any depth. */
export function descendants(tasks, id) {
  const out = []; const seen = new Set([id]); let layer = childrenOf(tasks, id);
  while (layer.length) {
    const next = [];
    layer.forEach(t => { if (seen.has(t.id)) return; seen.add(t.id); out.push(t); next.push(...childrenOf(tasks, t.id)); });
    layer = next;
  }
  return out;
}
/** Depth-first flat order with a `depth` on every task: parents first, children right under them. */
export function orderForList(tasks) {
  const out = [];
  const walk = (nodes, depth) => nodes.forEach(n => { out.push(Object.assign({}, n.task, { depth })); walk(n.children, depth + 1); });
  walk(tree(tasks), 0);
  return out;
}
/** "2/5": done children out of all direct children. total 0 when it has none. */
export function progressOf(task, tasks) {
  const kids = childrenOf(tasks, task.id);
  return { done: kids.filter(isDone).length, total: kids.length };
}
/** May this task be closed? Not while it has open subtasks, unless force (task.forceClose or opts.force). */
export function canClose(task, tasks, opts) {
  const open = descendants(tasks, task.id).filter(t => !isDone(t));
  const force = !!(opts && opts.force) || !!(task && task.forceClose);
  return { ok: force || open.length === 0, open: open.length, openTasks: open };
}

/* ---------------- the checklist inside a task ---------------- */
let todoSeq = 0;
export function newTodoId() { todoSeq = (todoSeq + 1) % 1000; return 'td' + Date.now().toString(36) + todoSeq.toString(36); }
/** Returns the new todos array with the item appended (does not touch the input). Empty text adds nothing. */
export function addTodo(todos, text) {
  const s = str(text).trim(); if (!s) return (todos || []).slice();
  return (todos || []).concat([{ id: newTodoId(), text: s, done: false }]);
}
export function toggleTodo(todos, id) { return (todos || []).map(x => x.id === id ? Object.assign({}, x, { done: !x.done }) : x); }
export function removeTodo(todos, id) { return (todos || []).filter(x => x.id !== id); }
export function todoProgress(todos) { const a = todos || []; return { done: a.filter(x => x.done).length, total: a.length }; }
/** The textarea in the dialog: one item per line, "[x] " or "✓ " in front means done. Done state of unchanged lines
 *  is kept from `existing` (matched by text). */
export function todosFromText(text, existing) {
  const old = new Map((existing || []).map(x => [x.text, x]));
  const out = [];
  str(text).split(/\r?\n/).forEach(line => {
    let s = line.trim(); if (!s) return;
    let done = false;
    const m = /^(\[x\]|\[X\]|\[ \]|\[\]|✓|✔|-|•|\*)\s*/.exec(s);
    if (m) { done = /x|✓|✔/i.test(m[1]); s = s.slice(m[0].length).trim(); if (!s) return; }
    const was = old.get(s);
    out.push({ id: was ? was.id : newTodoId(), text: s, done: m && /\[/.test(m[1]) ? done : (was ? was.done : done) });
  });
  return out;
}
export function todosToText(todos) { return (todos || []).map(x => (x.done ? '[x] ' : '[ ] ') + x.text).join('\n'); }

/* ---------------- dependencies ---------------- */
/** The open tasks this one still waits for (closed or missing blockers do not block). */
export function blockersOf(task, tasks) {
  const ids = (task && task.blockedBy) || []; const list = tasks || [];
  return ids.map(id => list.find(t => t.id === id)).filter(t => t && t.id !== task.id && !isDone(t));
}
export function isBlocked(task, tasks) { return blockersOf(task, tasks).length > 0; }
/** Tasks that become ready once `closedId` is closed: they waited for it and for nothing else still open.
 *  `tasks` is the list as it was before the close. */
export function readyAfterClose(closedId, tasks) {
  const list = tasks || [];
  const closed = list.find(t => t.id === closedId);
  if (!closed || isDone(closed)) return []; // it was already closed: nothing changes
  return list.filter(t => !isDone(t) && t.id !== closedId && (t.blockedBy || []).includes(closedId)
    && blockersOf(t, list).every(b => b.id === closedId));
}

/* ---------------- critical path of one event ---------------- */
/** The longest dependency chain among the tasks of one event (most tasks; on a tie the widest span of due dates), as the
 *  tasks in order from first to last. [] when nothing depends on anything. Cycles are ignored. */
export function criticalPath(tasksOfCase) {
  const list = (tasksOfCase || []).filter(t => !t.isTemplate);
  const byId = new Map(list.map(t => [t.id, t]));
  const memo = new Map();
  const dayOf = t => { const d = Date.parse(str(t.due) || str(t.start) || ''); return isNaN(d) ? null : d; };
  const spanOf = chain => { const ds = chain.map(dayOf).filter(x => x != null); return ds.length > 1 ? (Math.max(...ds) - Math.min(...ds)) / 86400000 : 0; };
  const better = (a, b) => !a ? b : !b ? a : (b.length > a.length || (b.length === a.length && spanOf(b) > spanOf(a))) ? b : a;
  // longest chain that ends at t: its best predecessor chain + t
  const endingAt = (t, stack) => {
    if (memo.has(t.id)) return memo.get(t.id);
    if (stack.has(t.id)) return [t];
    stack.add(t.id);
    let best = null;
    (t.blockedBy || []).forEach(id => { const b = byId.get(id); if (b && b.id !== t.id) best = better(best, endingAt(b, stack)); });
    stack.delete(t.id);
    const chain = (best || []).filter(b => b.id !== t.id).concat([t]);
    memo.set(t.id, chain);
    return chain;
  };
  let top = null;
  list.forEach(t => { top = better(top, endingAt(t, new Set())); });
  return top && top.length > 1 ? top : [];
}

/* ---------------- time spent ---------------- */
/** Minutes spent so far, counting a running timer up to `now`. */
export function spentMinutes(task, now) {
  const base = Math.max(0, Math.round(+(task && task.spentMin) || 0));
  const at = task && task.timer && task.timer.startedAt ? Date.parse(task.timer.startedAt) : NaN;
  if (isNaN(at)) return base;
  const n = now ? (typeof now === 'number' ? now : new Date(now).getTime()) : Date.now();
  return base + Math.max(0, Math.round((n - at) / 60000));
}
/** The patch that stops a running timer: spentMin absorbs the run, timer cleared. Unchanged (only timer null) when none ran. */
export function stopTimer(task, now) { return { spentMin: spentMinutes(task, now), timer: null }; }
export function startTimer(task, now) { return { timer: { startedAt: new Date(now || Date.now()).toISOString() } }; }
/** Minutes of one event: all its tasks (running timers included). */
export function spentOfCase(tasks, caseId, now) { return (tasks || []).filter(t => t.caseId === caseId && !t.isTemplate).reduce((s, t) => s + spentMinutes(t, now), 0); }

/* ---------------- search ---------------- */
/** Text a search box matches against: "#12", title, details, who, todos. */
export function searchText(t) {
  return ['#' + str(t.no), t.title, t.details, t.who, t.note, ...(t.todos || []).map(x => x.text)].filter(Boolean).join(' ').toLowerCase();
}
/** Matches "#12" exactly by number, otherwise every word must appear. */
export function matchesQuery(t, q) {
  const s = str(q).trim().toLowerCase(); if (!s) return true;
  if (/^#\d+$/.test(s)) return str(t.no) === s.slice(1);
  const hay = searchText(t);
  return s.split(/\s+/).every(w => hay.includes(w));
}
