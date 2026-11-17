import {delay} from './runtime.mjs';
import {action, visible} from './navigation.mjs';
import {snapshot} from './telemetry.mjs';

// Fixed, repeatable gestures exercise controls; this is not an aim/score bot.
// Each cycle includes simultaneous steering and an action when available.
export async function playCycle({page, touch, game, cycle, deadline}) {
  if (game.embedded) {
    const frame = page.frameLocator('.boar-game-frame');
    const aim = frame.locator('#aim-zone');
    const canvas = frame.locator('#scene');
    const target = await visible(aim) ? aim : canvas;
    const b = await target.boundingBox();
    if (!b) return;
    const p = {x: b.x + b.width * .5, y: b.y + b.height * .5};
    const id = await touch.down(p);
    try {
      await touch.move(id, {x: p.x + (cycle % 2 ? -28 : 28), y: p.y - 8});
      const fire = frame.locator('#fire-btn');
      if (await visible(fire) && await fire.isEnabled()) {
        const point = await touch.point(fire, {scroll: false});
        if (point) await touch.down(point);
      }
      await delay(Math.min(450, Math.max(0, deadline - performance.now())));
    } finally { await touch.release(); }
    return;
  }
  // Genuine campaign choices can interrupt a run; choose the first public option.
  const upgrade = page.locator('[data-action=run-upgrade]:not([disabled])').filter({visible: true}).first();
  if (await visible(upgrade)) { await touch.tap(upgrade); return; }
  const state = await snapshot(page, game);
  if (state.paused && await visible(action(page, 'game-resume'))) await touch.tap(action(page, 'game-resume'));
  let stickId;
  try {
    const stick = game.id === 'catchCriminal' ? page.locator('.game-screen .minigame-canvas') : game.stick ? page.locator(game.stick).filter({visible: true}).first() : null;
    if (stick && await visible(stick)) {
      let p = await touch.point(stick, {scroll: false});
      if (game.id === 'catchCriminal') {
        const b = await stick.boundingBox();
        p = {x: b.x + b.width * .23, y: b.y + b.height * .70};
      }
      if (p) {
        stickId = await touch.down(p);
        await touch.move(stickId, {x: p.x + (cycle % 2 ? -26 : 26), y: p.y - 8});
      }
    }
    const selector = game.id === 'catchCriminal' && state.phase === 'aim' ? '.catch-throw' : game.id === 'tennis' && ['serve', 'toss'].includes(state.phase)
      ? '#pass' : cycle % 4 === 3 && game.secondary ? game.secondary : game.action;
    const button = selector ? page.locator(selector).filter({visible: true}).first() : null;
    if (button && await visible(button) && await button.isEnabled()) {
      const p = await touch.point(button, {scroll: false});
      if (p) await touch.down(p);
    }
    await delay(Math.min(380, Math.max(0, deadline - performance.now())));
  } finally { await touch.release(); }
}
