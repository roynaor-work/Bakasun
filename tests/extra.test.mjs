import { test } from 'node:test';
import assert from 'node:assert/strict';

test('open tasks are grouped like a to-do app: overdue, today, tomorrow, this week, later, no date', async () => {
  const { openTasks, groupTasks } = await import('../js/logic/extra.js');
  const today = '2026-09-29';
  const tasks = [
    { id: 'a', title: 'late', due: '2026-09-27', status: 'open' }, { id: 'b', title: 'today', due: '2026-09-29', status: 'open' },
    { id: 'c', title: 'tomorrow', due: '2026-09-30', status: 'open' }, { id: 'd', title: 'week', due: '2026-10-03', status: 'open' },
    { id: 'e', title: 'later', due: '2026-10-20', status: 'open' }, { id: 'f', title: 'nodate', status: 'open' }, { id: 'g', title: 'done', due: '2026-09-29', status: 'done' }
  ];
  const groups = groupTasks(openTasks(tasks, today), today);
  assert.deepEqual(groups.map(g => g.key), ['late', 'today', 'tomorrow', 'week', 'later', 'nodate']);
  assert.deepEqual(groups.map(g => g.items.map(x => x.id).join()), ['a', 'b', 'c', 'd', 'e', 'f']);
});
