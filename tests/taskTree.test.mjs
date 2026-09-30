import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  tree, childrenOf, descendants, orderForList, progressOf, canClose, sortByPriority, priorityRank,
  addTodo, toggleTodo, removeTodo, todoProgress, todosFromText, todosToText,
  blockersOf, isBlocked, readyAfterClose, criticalPath, spentMinutes, stopTimer, startTimer, spentOfCase, matchesQuery
} from '../js/logic/taskTree.js';

const T = (id, extra) => Object.assign({ id, title: id, status: 'open' }, extra || {});

test('tree nests children under parents, orphans and cycles become roots', () => {
  const tasks = [T('a'), T('b', { parentId: 'a' }), T('c', { parentId: 'b' }), T('d', { parentId: 'zzz' }), T('e', { parentId: 'e' })];
  const roots = tree(tasks);
  assert.deepEqual(roots.map(r => r.task.id), ['a', 'd', 'e']);
  assert.deepEqual(roots[0].children.map(n => n.task.id), ['b']);
  assert.deepEqual(roots[0].children[0].children.map(n => n.task.id), ['c']);
  // a cycle: x → y → x
  const cyc = tree([T('x', { parentId: 'y' }), T('y', { parentId: 'x' })]);
  assert.equal(cyc.length >= 1, true);
  assert.deepEqual(orderForList(tasks).map(x => x.id + ':' + x.depth), ['a:0', 'b:1', 'c:2', 'd:0', 'e:0']);
  assert.deepEqual(childrenOf(tasks, 'a').map(x => x.id), ['b']);
  assert.deepEqual(descendants(tasks, 'a').map(x => x.id), ['b', 'c']);
});

test('a parent with open subtasks cannot be closed, unless forced; progress counts direct children', () => {
  const tasks = [T('p'), T('k1', { parentId: 'p', status: 'done' }), T('k2', { parentId: 'p' }), T('k3', { parentId: 'p', status: 'sent' }), T('g', { parentId: 'k2', status: 'done' })];
  assert.deepEqual(progressOf(tasks[0], tasks), { done: 1, total: 3 });
  const c = canClose(tasks[0], tasks);
  assert.equal(c.ok, false); assert.equal(c.open, 2);
  assert.equal(canClose(tasks[0], tasks, { force: true }).ok, true);
  assert.equal(canClose(Object.assign({}, tasks[0], { forceClose: true }), tasks).ok, true);
  assert.equal(canClose(tasks[2], tasks).ok, true, 'k2: its only child is done');
  assert.equal(canClose(T('lonely'), tasks).ok, true);
});

test('priority sorts urgent first and keeps the order of equals', () => {
  const list = [T('a'), T('b', { priority: 'urgent' }), T('c', { priority: 'low' }), T('d', { priority: 'high' }), T('e', { priority: 'urgent' }), T('f', { priority: 'normal' })];
  assert.deepEqual(sortByPriority(list).map(x => x.id), ['b', 'e', 'd', 'a', 'f', 'c']);
  assert.equal(priorityRank({}), 2);
});

test('todos: add, toggle, remove, progress, and the textarea round trip keeps ids and done state', () => {
  let todos = addTodo([], 'לקנות שלטים');
  todos = addTodo(todos, '  ');
  todos = addTodo(todos, 'להתקשר לדפוס');
  assert.equal(todos.length, 2);
  todos = toggleTodo(todos, todos[0].id);
  assert.deepEqual(todoProgress(todos), { done: 1, total: 2 });
  const text = todosToText(todos);
  assert.equal(text, '[x] לקנות שלטים\n[ ] להתקשר לדפוס');
  const back = todosFromText(text + '\nחדש\n- עם מקף\n[x] סומן', todos);
  assert.equal(back[0].id, todos[0].id); assert.equal(back[0].done, true);
  assert.equal(back[1].id, todos[1].id); assert.equal(back[1].done, false);
  assert.deepEqual(back.slice(2).map(x => [x.text, x.done]), [['חדש', false], ['עם מקף', false], ['סומן', true]]);
  assert.equal(removeTodo(back, back[2].id).length, 4);
  // a line kept without a marker keeps its old done state
  assert.equal(todosFromText('לקנות שלטים', todos)[0].done, true);
});

test('dependencies: open blockers lock a task; closing the last blocker makes it ready', () => {
  const tasks = [T('a'), T('b', { status: 'done' }), T('c', { blockedBy: ['a', 'b'] }), T('d', { blockedBy: ['b'] }), T('e', { blockedBy: ['a', 'zzz'] }), T('f', { blockedBy: ['a'], status: 'done' })];
  assert.deepEqual(blockersOf(tasks[2], tasks).map(x => x.id), ['a']);
  assert.equal(isBlocked(tasks[2], tasks), true);
  assert.equal(isBlocked(tasks[3], tasks), false, 'a done blocker does not block');
  assert.deepEqual(readyAfterClose('a', tasks).map(x => x.id), ['c', 'e']);
  assert.deepEqual(readyAfterClose('b', tasks).map(x => x.id), [], 'b is already done, nothing new');
});

test('critical path is the longest dependency chain of one event, ordered first to last', () => {
  const tasks = [
    T('brief', { due: '2026-10-01' }), T('venue', { due: '2026-10-05', blockedBy: ['brief'] }), T('menu', { due: '2026-10-12', blockedBy: ['venue'] }),
    T('invite', { due: '2026-10-08', blockedBy: ['brief'] }), T('print', { due: '2026-10-20', blockedBy: ['menu', 'invite'] }), T('alone', { due: '2026-12-01' }),
    T('tpl', { isTemplate: true, blockedBy: ['print'] })
  ];
  assert.deepEqual(criticalPath(tasks).map(x => x.id), ['brief', 'venue', 'menu', 'print']);
  assert.deepEqual(criticalPath([T('a'), T('b')]), []);
  assert.deepEqual(criticalPath([T('x', { blockedBy: ['y'] }), T('y', { blockedBy: ['x'] })]).length, 2, 'a cycle does not hang');
  // equal length: the wider span of dates wins
  const tie = [T('a', { due: '2026-10-01' }), T('b', { due: '2026-10-02', blockedBy: ['a'] }), T('c', { due: '2026-10-01' }), T('d', { due: '2026-10-30', blockedBy: ['c'] })];
  assert.deepEqual(criticalPath(tie).map(x => x.id), ['c', 'd']);
});

test('time spent: a running timer counts up to now; stop folds it into spentMin', () => {
  const t0 = Date.parse('2026-10-01T10:00:00Z');
  const task = Object.assign(T('a', { spentMin: 10 }), startTimer(null, t0));
  assert.equal(spentMinutes(task, t0 + 25 * 60000), 35);
  assert.deepEqual(stopTimer(task, t0 + 25 * 60000), { spentMin: 35, timer: null });
  assert.equal(spentMinutes(T('b'), t0), 0);
  assert.equal(spentOfCase([Object.assign(T('x', { caseId: 'k', spentMin: 5 })), T('y', { caseId: 'k', spentMin: 7 }), T('z', { caseId: 'other', spentMin: 100 }), T('w', { caseId: 'k', isTemplate: true, spentMin: 9 })], 'k', t0), 12);
});

test('search matches "#12" by number and words in title, who and todos', () => {
  const task = T('a', { no: 12, title: 'לאסוף שלטים', who: 'נועה', todos: [{ id: '1', text: 'רול-אפ', done: false }] });
  assert.equal(matchesQuery(task, '#12'), true);
  assert.equal(matchesQuery(task, '#1'), false);
  assert.equal(matchesQuery(task, 'שלטים נועה'), true);
  assert.equal(matchesQuery(task, 'רול'), true);
  assert.equal(matchesQuery(task, 'דפוס'), false);
  assert.equal(matchesQuery(task, ''), true);
});
