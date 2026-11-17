# Read-only external review reproducer. Start a local HTTP server at port 8766 in the repository root.
# Run: python3 workout/island/design/external-review-v241/repro/fire-first-room-shell.py
from review_support import out_path
import asyncio,json
from playwright.async_api import async_playwright
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader'])
  c=await b.new_context(viewport={'width':844,'height':390},has_touch=True,is_mobile=True,device_scale_factor=1,service_workers='block')
  await c.add_init_script('HTMLElement.prototype.requestFullscreen=undefined;')
  pg=await c.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)))
  await pg.route('**/fire-v24/rooms/living-room.glb*',lambda r:r.abort())
  await pg.goto('http://127.0.0.1:8766/workout/island/?dev=1&loadStuckMs=300')
  await pg.wait_for_function('() => Boolean(window.__island)',timeout=90000)
  await pg.locator('[data-action=avatar-start]').click(force=True)
  print('AVATAR',flush=True)
  await pg.evaluate('''() => {const {engine:e,data}=window.__island;e.skipTutorial();e.tick=()=>({ok:true});data.featureFlags.events=false;e.state.money=5000;let done=false;for(let z=0;z<e.state.world.size&&!done;z++)for(let x=0;x<e.state.world.size&&!done;x++)if(e.place('fireStation',x,z).ok)done=true;const p=e.state.minigameProgress.fireRescue;p.stage=6;p.stars.fill(1,0,5);e.save();data.config.minigames.fireRescue.render.fallbackFrameMs=100000;}''')
  await pg.evaluate("window.__island.games.start('fireRescue',undefined,3)")
  if await pg.locator('[data-action=game-understood]').count(): await pg.locator('[data-action=game-understood]').click(force=True)
  await pg.wait_for_function("() => document.querySelector('.game-screen')?.dataset.starting==='false'",timeout=60000)
  await pg.wait_for_function("() => window.__island.games.current?.session.snapshot.renderMode==='three'",timeout=60000)
  print('STARTED',flush=True)
  # Setup: place the truck at the entry door, then exercise the actual enter button.
  await pg.evaluate('''() => {const d=__island.games.current.session.debug,m=d.model,b=d.flow.building;Object.assign(m.truck,{x:b.door[0],z:b.door[2]+3,driving:false,velocityX:0,velocityZ:0});}''')
  await pg.wait_for_function('() => !document.querySelector("#fire-enter")?.hidden',timeout=20000)
  await pg.locator('#fire-enter').evaluate('(n) => n.click()')
  # Fixture setup: run the existing flow once synchronously so entry does not depend on a slow GPU frame.
  await pg.evaluate('() => {const d=__island.games.current.session.debug;d.flow.enterRequested=true;d.model.update(.016,{});}')
  await pg.wait_for_function('() => window.__island.games.current?.session.debug.interior?.loadFailed',timeout=60000)
  await pg.wait_for_timeout(2200)
  out=await pg.evaluate('''async() => {const s=__island.games.current.session;const {loadState}=await import('/workout/island/ui/load-rescue.mjs');return {outerReady:s.ready??null,outerFailed:s.loadFailed??null,outerLoadState:loadState(s),insideFailed:s.debug.interior.loadFailed,insideReady:s.debug.interior.ready,v24:s.snapshot.v24,streetPaused:s.snapshot.paused,loadRescueVisible:!!document.querySelector('[data-load-rescue=true]'),fade:document.querySelector('.fv24-fade')?.textContent};}''')
  print(json.dumps(out),flush=True)
  assert out['insideFailed'] and not out['insideReady'] and out['outerLoadState']=='ready'
  assert out['streetPaused'] and not out['loadRescueVisible']
  await pg.screenshot(path=out_path('fire-first-room-failed-shell.png'))
  await c.close();await b.close()
asyncio.run(main())
