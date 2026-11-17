from review_support import out_path
# Read-only external review reproducer. Start local HTTP server at port 8766 in repository root.
# Run: python3 workout/island/design/external-review-v241/repro/fire-context-loss.py
import asyncio,json
from playwright.async_api import async_playwright
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader'])
  pg=await b.new_page(viewport={'width':844,'height':390})
  await pg.goto('http://127.0.0.1:8766/workout/island/design/external-review-v241/repro/fire-interior-probe.html?level=3')
  await pg.wait_for_function('() => window.__probe?.ready')
  await pg.clock.install()
  await pg.clock.pause_at(await pg.evaluate('() => Date.now()+1000'))
  await pg.clock.run_for(4500)
  before=await pg.evaluate('() => ({phase:__probe.snapshot.phase,time:__probe.snapshot.time,remaining:__probe.snapshot.room.remaining})')
  await pg.evaluate('() => {const c=document.querySelector(".fire-v24-canvas"),gl=c.getContext("webgl2");gl.getExtension("WEBGL_lose_context").loseContext();}')
  await pg.wait_for_timeout(50)
  await pg.clock.run_for(5000)
  after=await pg.evaluate('() => ({phase:__probe.snapshot.phase,time:__probe.snapshot.time,remaining:__probe.snapshot.room.remaining,ready:__probe.ready,loadFailed:__probe.loadFailed,contextLost:document.querySelector(".fire-v24-canvas").getContext("webgl2").isContextLost(),done:__done})')
  print(json.dumps({'before':before,'after':after}))
  await pg.screenshot(path=out_path('fire-context-lost.png'))
  await b.close()
asyncio.run(main())
