import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = new URL('../workout/island/', import.meta.url);
async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => {
    const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
    return entry.isDirectory() ? filesIn(url) : [url];
  }));
  return nested.flat();
}

test('island ships unchanged local copies of its model, Three.js runtime and original MIT license', async () => {
  const copies = [
    ['assets/kid-full.glb', 'kid-full.glb'],
    ['vendor/three.module.js', 'vendor/three.module.js'],
    ['vendor/GLTFLoader.js', 'vendor/GLTFLoader.js'],
    ['vendor/BufferGeometryUtils.js', 'vendor/BufferGeometryUtils.js'],
    ['vendor/LICENSE.three', 'vendor/LICENSE.three'],
  ];
  for (const [delivery, original] of copies) {
    const [actual, expected] = await Promise.all([
      readFile(new URL(delivery, root)),
      readFile(new URL(`../codex-lab/kid-full/${original}`, import.meta.url)),
    ]);
    assert.ok(actual.equals(expected), `${delivery} must be byte-identical to the existing source`);
  }
  assert.match(await readFile(new URL('vendor/LICENSE.three', root), 'utf8'), /The MIT License/);
});

test('island view imports and model URLs resolve to existing files inside the deployable island folder', async () => {
  const islandPath = path.resolve(fileURLToPath(root));
  let references = 0;
  for (const file of (await filesIn(new URL('view/', root))).filter(url => /\.(?:mjs|js)$/.test(url.pathname))) {
    const source = await readFile(file, 'utf8');
    const modulePaths = [...source.matchAll(/(?:\bfrom\s*|\bimport\s*)['"]([^'"]+)['"]/g)].map(match => match[1]);
    const assetPaths = [...source.matchAll(/new\s+URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g)].map(match => match[1]);
    for (const relative of [...modulePaths, ...assetPaths]) {
      assert.match(relative, /^\.\.?\//, `local relative reference in ${file.pathname}`);
      const target = new URL(relative, file);
      const targetPath = path.resolve(fileURLToPath(target));
      assert.ok(targetPath === islandPath || targetPath.startsWith(islandPath + path.sep), `deployment must not depend on ${relative} outside workout/island/`);
      await access(target);
      references++;
    }
  }
  assert.ok(references >= 8, 'audit includes the real view modules, Three imports and GLB URL');
});

// Explicit delivery inventory: PR 139 plus the G8 shell and its bounded evidence.
// Adding an unrelated file (even a small one) fails this audit. Network download
// budgets are measured from cold browser contexts in tests/g8-browser.mjs.
const knownFiles = new Set(`
ARCHITECTURE.md
ASSETS.md
CHANGELOG.md
QA.md
activity/alien-upgrades.mjs
activity/availability.mjs
activity/eligibility.mjs
activity/equipment.mjs
activity/fire-certificates.mjs
activity/hangar.mjs
activity/progress.mjs
activity/runtime.mjs
activity/soccer-card.mjs
activity/soccer-roster.mjs
activity/soccer-team.mjs
activity/state.mjs
app.mjs
assets/icons/apple-touch-icon.png
assets/icons/island-192.png
assets/icons/island-512.png
assets/icons/island-maskable-512.png
assets/icons/island.svg
assets/icons/shell-share.svg
assets/kid-full.glb
assets/models/adult-man-512.glb
assets/models/adult-man-rigged-512.glb
assets/models/adult-woman-512.glb
assets/models/adult-woman-rigged-512.glb
assets/models/alien-a.glb
assets/models/alien-b.glb
assets/models/alien-c.glb
assets/models/alien-d-512.glb
assets/models/ambulance-512.glb
assets/models/apartment-block-512.glb
assets/models/bench-512.glb
assets/models/boat-patrol-512.glb
assets/models/boss-ship-512.glb
assets/models/boss.glb
assets/models/bus-512.glb
assets/models/bush-512.glb
assets/models/cafe-512.glb
assets/models/car-a-512.glb
assets/models/enemy-gunboat-512.glb
assets/models/enemy-ship-b-512.glb
assets/models/fire-station-512.glb
assets/models/fire-truck-512.glb
assets/models/firefighter-512.glb
assets/models/firefighter-rigged-512.glb
assets/models/gas-station-512.glb
assets/models/grocery-512.glb
assets/models/helicopter-512.glb
assets/models/hospital-512.glb
assets/models/house-a-512-orig.glb
assets/models/house-a-512.glb
assets/models/hydrant-512.glb
assets/models/kid-boy-512.glb
assets/models/kid-boy-rigged-512.glb
assets/models/kid-girl-512.glb
assets/models/kid-girl-rigged-512.glb
assets/models/palm-tree-512.glb
assets/models/pine-tree-512.glb
assets/models/playground-park-512.glb
assets/models/police-car-512.glb
assets/models/police-officer-512.glb
assets/models/police-officer-rigged-512.glb
assets/models/police-station-512.glb
assets/models/rock-512.glb
assets/models/school-512.glb
assets/models/ship-player.glb
assets/models/shop-corner-512-orig.glb
assets/models/shop-corner-512.glb
assets/models/shop-corner.glb
assets/models/soccer-field-512.glb
assets/models/street-lamp-512.glb
assets/models/tennis-court-512.glb
assets/models/trash-bin-512.glb
assets/models/tree-a-512.glb
assets/models/water-tower-512.glb
data/avatar.json
data/buildings.json
data/categories.json
data/config.json
data/extensions.json
data/featureFlags.json
data/metrics.json
data/missions.json
data/players.json
data/sports.json
data/strings.he.json
data/team.json
data/tutorial.json
data/world.json
engine/city-hall.mjs
engine/economy.mjs
engine/engine.mjs
engine/episodes.mjs
engine/hooks.mjs
engine/load-data.mjs
engine/metrics.mjs
engine/paths.mjs
engine/persistence.mjs
engine/placement-help.mjs
engine/registry.mjs
engine/rules.mjs
episodes/example-first-visit.json
episodes/index.json
extensions/activity-income.mjs
extensions/alien-defense.mjs
extensions/example-building.mjs
extensions/example-event.mjs
extensions/example-metric.mjs
extensions/example-minigame.mjs
extensions/example-sport.mjs
extensions/fire-rescue.mjs
extensions/island-events.mjs
extensions/naval-duel.mjs
extensions/soccer.mjs
extensions/tennis.mjs
index.html
manifest.webmanifest
minigames/alien-view.mjs
minigames/aliens.mjs
minigames/art.mjs
minigames/canvas-session.mjs
minigames/context.mjs
minigames/controls.mjs
minigames/fire-truck.mjs
minigames/fire-view.mjs
minigames/fire.mjs
minigames/icons.mjs
minigames/model-art.mjs
minigames/naval-view.mjs
minigames/naval.mjs
minigames/patrol-boat.mjs
minigames/pool.mjs
minigames/result.mjs
minigames/soccer-boundary.mjs
minigames/soccer-crowd.mjs
minigames/soccer-drill.mjs
minigames/soccer-icons.mjs
minigames/soccer-physics.mjs
minigames/soccer-presentation.mjs
minigames/soccer-result.mjs
minigames/soccer-rig.mjs
minigames/soccer-session.mjs
minigames/soccer-view.mjs
minigames/soccer.mjs
minigames/sound.mjs
minigames/tennis-result.mjs
minigames/tennis-session.mjs
minigames/tennis-view.mjs
minigames/tennis.mjs
notes/g2i-research.md
notes/g2j-research.md
notes/g3e-research.md
notes/g3f-research.md
notes/g4c-research.md
notes/g6b-research.md
notes/g7-research.md
notes/g8-qa.md
notes/g8-research.md
release.mjs
styles.css
tests/fixtures/save-v10.json
tests/fixtures/save-v11.json
tests/fixtures/save-v7.json
tests/fixtures/save-v9.json
tests/g2f-browser.mjs
tests/g2g-browser.mjs
tests/g2h-bot.mjs
tests/g2h-browser.mjs
tests/g2i-browser.mjs
tests/g2i-fixtures.mjs
tests/g2j-browser.mjs
tests/g2j-fixtures.mjs
tests/g3b-browser.mjs
tests/g3c-bot.mjs
tests/g3c-browser.mjs
tests/g3d-browser.mjs
tests/g3e-browser.mjs
tests/g3f-browser.mjs
tests/g3f-fixtures.mjs
tests/g4b-bot.mjs
tests/g4b-browser.mjs
tests/g4c-browser.mjs
tests/g5-browser.mjs
tests/g6-browser.mjs
tests/g6b-browser.mjs
tests/g7-browser.mjs
tests/g8-browser.mjs
tests/generate-save-v10.mjs
tests/generate-save-v11.mjs
tests/generate-save-v8.mjs
tests/generate-save-v9.mjs
tests/night-browser.mjs
tests/pilot.mjs
tests/task016-browser.mjs
ui/activity.mjs
ui/game-shell.css
ui/game-shell.mjs
ui/hangar-preview.mjs
ui/interface.mjs
ui/press.mjs
ui/soccer-card.mjs
ui/translate.mjs
vendor/BufferGeometryUtils.js
vendor/GLTFLoader.js
vendor/LICENSE.three
vendor/three.module.js
verification/g2f/fire.png
verification/g2f/naval.png
verification/g2f/upgrades.png
verification/g2f/verification.json.gz
verification/g2g/aliens-models.webp
verification/g2g/fire-result.png
verification/g2g/fire-stage-1.png
verification/g2g/rescue-stage-5.png
verification/g2g/verification.json.gz
verification/g2h/390-verification.json.gz
verification/g2h/844-verification.json.gz
verification/g2h/alien-3d.webp
verification/g2h/alien-fallback.webp
verification/g2h/alien-landscape.webp
verification/g2h/balance.json.gz
verification/g2h/far-fire.webp
verification/g2h/fire-after.webp
verification/g2h/fire-before.webp
verification/g2h/fire-landscape.webp
verification/g2h/lossless-packaging.json.gz
verification/g2h/refill.webp
verification/g2h/test-results.json.gz
verification/g2h/verification.json.gz
verification/g2i/1440-verification.json
verification/g2i/740-verification.json
verification/g2i/844-verification.json
verification/g2i/cooldown-ring.webp
verification/g2i/hangar.webp
verification/g2i/nova-rocket.webp
verification/g2i/spaced-formation.webp
verification/g2i/wave-entry.webp
verification/g2j/1440-verification.json
verification/g2j/740-verification.json
verification/g2j/844-verification.json
verification/g2j/bring-the-truck.webp
verification/g2j/certificate.webp
verification/g2j/firefighter-grace.webp
verification/g2j/hydrant-filling.webp
verification/g2j/ladder-open.webp
verification/g2j/packaging.json
verification/g2j/rescued.webp
verification/g2j/two-hands-hose.webp
verification/g2j/window-civilian.webp
verification/g3b/1440-locked.webp
verification/g3b/1440-patrol-fallback.webp
verification/g3b/1440-patrol-model.webp
verification/g3b/1440-soccer-menu.webp
verification/g3b/1440-soccer-pitch.webp
verification/g3b/1440-soccer-result.webp
verification/g3b/360-locked.png
verification/g3b/360-patrol-fallback.png
verification/g3b/360-patrol-model.png
verification/g3b/360-soccer-menu.png
verification/g3b/360-soccer-pitch.png
verification/g3b/360-soccer-result.png
verification/g3b/390-locked.png
verification/g3b/390-patrol-fallback.png
verification/g3b/390-patrol-model.png
verification/g3b/390-soccer-menu.png
verification/g3b/390-soccer-pitch.png
verification/g3b/390-soccer-result.png
verification/g3b/node-tests.json.gz
verification/g3b/soccer-colors.json.gz
verification/g3b/verification.json.gz
verification/g3c/1440x1000-scoreboard.jpg
verification/g3c/390x844-attack.jpg
verification/g3c/390x844-card.jpg
verification/g3c/390x844-defense.jpg
verification/g3c/390x844-difficulty.jpg
verification/g3c/390x844-result.jpg
verification/g3c/390x844-training-locked.jpg
verification/g3c/844x390-landscape.jpg
verification/g3c/lossless-packaging.json.gz
verification/g3c/test-results.json.gz
verification/g3c/verification.json.gz
verification/g3d/attack.webp
verification/g3d/celebrate.webp
verification/g3d/defense.webp
verification/g3d/desktop.webp
verification/g3d/fallback.webp
verification/g3d/goal.webp
verification/g3d/pause.webp
verification/g3d/rotate.webp
verification/g3d/test-results.json.gz
verification/g3d/verification.json.gz
verification/g3e/844-verification.json.gz
verification/g3e/balance.json.gz
verification/g3e/controls.webp
verification/g3e/desktop.webp
verification/g3e/goal.webp
verification/g3e/header.webp
verification/g3e/kickoff.webp
verification/g3e/loft.webp
verification/g3e/slide-side.webp
verification/g3e/steal.webp
verification/g3e/test-results.json.gz
verification/g3e/verification.json.gz
verification/g3f/1440-first-verification.json.gz
verification/g3f/1440-second-verification.json.gz
verification/g3f/1440-verification.json.gz
verification/g3f/740-first-verification.json.gz
verification/g3f/740-second-verification.json.gz
verification/g3f/740-verification.json.gz
verification/g3f/844-first-verification.json.gz
verification/g3f/844-second-verification.json.gz
verification/g3f/844-verification.json.gz
verification/g3f/balance.json.gz
verification/g3f/both-teams-cards.webp
verification/g3f/corner-loft.webp
verification/g3f/independent-action-aim.webp
verification/g3f/jersey-numbers-and-crowd.webp
verification/g3f/keeper-mode.webp
verification/g3f/penalty-practice.webp
verification/g3f/profile-calibration.json.gz
verification/g3f/quality.json.gz
verification/g3f/slide-side-top.webp
verification/g3f/stability.json.gz
verification/g3f/standing-steal.webp
verification/g3f/tests.json.gz
verification/g3f/two-handed-throw.webp
verification/g3f/verification.json.gz
verification/g4b/court-city.webp
verification/g4b/desktop.webp
verification/g4b/locked.webp
verification/g4b/play.webp
verification/g4b/point.webp
verification/g4b/rotate.webp
verification/g4b/shirts.webp
verification/g4b/test-results.json.gz
verification/g4b/verification.json.gz
verification/g4b/victory.webp
verification/g4c/1440-verification.json
verification/g4c/740-verification.json
verification/g4c/844-verification.json
verification/g4c/diagonal-serve-crowd.webp
verification/g4c/packaging.json
verification/g4c/serve-behind-baseline.webp
verification/g4c/time-to-serve.webp
verification/g4c/toss-meter.webp
verification/g5/1440x1000-alienDefense-back.png
verification/g5/1440x1000-alienDefense-play.webp
verification/g5/1440x1000-city-hall.webp
verification/g5/1440x1000-fireRescue-back.png
verification/g5/1440x1000-fireRescue-play.webp
verification/g5/1440x1000-locked-catalog.webp
verification/g5/1440x1000-navalDuel-back.png
verification/g5/1440x1000-navalDuel-play.webp
verification/g5/1440x1000-soccer-back.png
verification/g5/1440x1000-soccer-play.png
verification/g5/360x740-alienDefense-back.png
verification/g5/360x740-alienDefense-play.png
verification/g5/360x740-city-hall.png
verification/g5/360x740-fireRescue-back.png
verification/g5/360x740-fireRescue-play.png
verification/g5/360x740-locked-catalog.png
verification/g5/360x740-navalDuel-back.png
verification/g5/360x740-navalDuel-play.png
verification/g5/360x740-soccer-back.png
verification/g5/360x740-soccer-play.png
verification/g5/390x844-alienDefense-back.png
verification/g5/390x844-alienDefense-play.png
verification/g5/390x844-city-hall.png
verification/g5/390x844-fireRescue-back.png
verification/g5/390x844-fireRescue-play.png
verification/g5/390x844-locked-catalog.png
verification/g5/390x844-navalDuel-back.png
verification/g5/390x844-navalDuel-play.png
verification/g5/390x844-soccer-back.png
verification/g5/390x844-soccer-moved.png
verification/g5/390x844-soccer-play.png
verification/g5/844x390-alienDefense-back.png
verification/g5/844x390-alienDefense-play.png
verification/g5/844x390-city-hall.png
verification/g5/844x390-fireRescue-back.png
verification/g5/844x390-fireRescue-play.png
verification/g5/844x390-locked-catalog.png
verification/g5/844x390-navalDuel-back.png
verification/g5/844x390-navalDuel-play.png
verification/g5/844x390-soccer-back.png
verification/g5/844x390-soccer-play.png
verification/g5/move-before.json.gz
verification/g5/test-results.json.gz
verification/g5/verification.json.gz
verification/g6/844-verification.json.gz
verification/g6/battle.webp
verification/g6/desktop.webp
verification/g6/fallback.webp
verification/g6/firing.webp
verification/g6/lossless-packaging.json.gz
verification/g6/rotate.webp
verification/g6/test-results.json.gz
verification/g6/torpedo.webp
verification/g6/verification.json.gz
verification/g6/victory.webp
verification/g6/weapons.webp
verification/g6b/1440-verification.json
verification/g6b/740-verification.json
verification/g6b/844-verification.json
verification/g6b/aim-cannon-health.webp
verification/g6b/fleet-stage10.webp
verification/g6b/manual-reticle.webp
verification/g6b/vulcan-heat.webp
verification/g7/1440-first-verification.json.gz
verification/g7/1440-second-verification.json.gz
verification/g7/1440-verification.json.gz
verification/g7/390-first-verification.json.gz
verification/g7/390-second-verification.json.gz
verification/g7/390-verification.json.gz
verification/g7/740-first-verification.json.gz
verification/g7/740-second-verification.json.gz
verification/g7/740-verification.json.gz
verification/g7/844-first-verification.json.gz
verification/g7/844-second-verification.json.gz
verification/g7/844-verification.json.gz
verification/g7/beach-paths-people.webp
verification/g7/city-hall.webp
verification/g7/city-landscape.webp
verification/g7/city-portrait.webp
verification/g7/exit-question.webp
verification/g7/harbor-water.webp
verification/g7/lossless-packaging.json.gz
verification/g7/placement-help.webp
verification/g7/stability.json.gz
verification/g7/tennis-controls.webp
verification/g7/tests.json.gz
verification/g7/touch-reproduction.json.gz
verification/g7/verification.json.gz
verification/g8/1440-verification.json
verification/g8/740-verification.json
verification/g8/844-verification.json
verification/g8/alienDefense-controls.png
verification/g8/fireRescue-controls.png
verification/g8/ios-install-guide.png
verification/g8/navalDuel-controls.png
verification/g8/pregame-install.png
verification/g8/soccer-controls.png
verification/g8/tennis-controls.png
verification/night-1810-tests.json.gz
verification/night-1910-summary.json
verification/task016/360-aliens-models.png
verification/task016/360-city-fallback.png
verification/task016/360-city-models.png
verification/task016/360-fire-result.png
verification/task016/360-fire-stage-1.png
verification/task016/360-naval-models.png
verification/task016/360-rescue-stage-5.png
verification/task016/360-shop-catalog-fallback.png
verification/task016/360-shop-catalog-models.png
verification/task016/390-aliens-models.webp
verification/task016/390-city-fallback.png
verification/task016/390-city-models.png
verification/task016/390-fire-result.png
verification/task016/390-fire-stage-1.png
verification/task016/390-naval-models.webp
verification/task016/390-rescue-stage-5.png
verification/task016/390-shop-catalog-fallback.png
verification/task016/390-shop-catalog-models.png
verification/task016/models-and-fallback.json.gz
verification/task016/node-tests.json.gz
verification/task016/verification.json.gz
view/avatar.mjs
view/batch.mjs
view/buildings.mjs
view/city-life.mjs
view/environment.mjs
view/island-view.mjs
view/local-models.mjs
`.trim().split('\n'));

test('island deployable folder contains only explicitly known files', async () => {
  const islandPath = fileURLToPath(root);
  const actual = (await filesIn(root)).map(file => path.relative(islandPath, fileURLToPath(file)).split(path.sep).join('/'));
  assert.deepEqual(actual.filter(file => !knownFiles.has(file)), [], 'add intended assets to the reviewed delivery inventory');
  assert.ok(actual.length > 400, 'audit covers the full island including retained models and verification');
});

test('every bundled island GLB stays within 2 MB, including unused library models', async () => {
  const models = (await filesIn(root)).filter(file => file.pathname.endsWith('.glb'));
  assert.ok(models.length >= 54, 'all uploaded models and the original character remain included');
  for (const model of models) {
    const bytes = (await stat(model)).size;
    assert.ok(bytes > 0 && bytes <= 2_000_000, `${model.pathname}: ${bytes} bytes exceeds the 2 MB model budget`);
  }
});
