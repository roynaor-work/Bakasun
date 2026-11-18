import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {verify} from '../../../tests/night-browser.mjs';

const ownReportDir = process.env.ISLAND_CSP_AUDIT_DIR ? null : await mkdtemp(join(tmpdir(), 'naval-battle-browser-'));
if (ownReportDir) process.env.ISLAND_CSP_AUDIT_DIR = ownReportDir;

try {
  await verify('naval-battle', [{width: 844, height: 390}], async ({page, snap, start, exit}) => {
    await page.evaluate(() => { window.__island.games.now = () => 0; });

    async function run(searchValue) {
      await page.evaluate(value => {
        const url = new URL(location.href);
        if (value === null) url.searchParams.delete('navalBattle');
        else url.searchParams.set('navalBattle', value);
        history.replaceState(history.state, '', url);
      }, searchValue);
      await start('navalDuel', 1);
      const opening = await snap();
      const activeShips = opening.enemies.filter(enemy => enemy.active && enemy.hp > 0).length;
      assert.equal(opening.renderMode, 'three');
      const {enemyFired, enabled} = await page.evaluate(() => {
        const {debug} = window.__island.games.current.session;
        for (let frame = 0; frame < 600; frame++) debug.drive(.02);
        return {enemyFired: debug.model.enemyFired, enabled: debug.model.navalBattle};
      });
      await exit();
      return {activeShips, enemyFired, enabled};
    }

    const after = await run(null);
    const before = await run('0');
    assert.equal(after.enabled, true);
    assert.equal(before.enabled, false);
    assert.equal(before.activeShips, 1);
    assert.ok(after.activeShips > before.activeShips);
    assert.ok(after.enemyFired > before.enemyFired);
    console.log(JSON.stringify({before, after}));
    return {before, after};
  });
} finally {
  if (ownReportDir) await rm(ownReportDir, {recursive: true, force: true});
}
