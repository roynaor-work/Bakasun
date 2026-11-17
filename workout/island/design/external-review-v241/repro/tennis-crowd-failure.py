# Read-only external review reproducer. Start a local HTTP server at port 8766 in the repository root.
# Run: python3 workout/island/design/external-review-v241/repro/tennis-crowd-failure.py
import asyncio,json
from playwright.async_api import async_playwright
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  pg=await b.new_page()
  async def fail(route): await route.abort()
  async def slow(route):
   await asyncio.sleep(2)
   await route.continue_()
  await pg.route('**/tennis-crowd-v22/runtime/lod2/fan-12.glb',fail)
  await pg.route('**/tennis-crowd-v22/runtime/lod0/fan-01.glb',slow)
  await pg.goto('http://127.0.0.1:8766/workout/island/design/external-review-v241/repro/tennis-crowd-probe.html')
  await pg.wait_for_function('() => window.__stadium?.metrics.crowdLate === "failed"',timeout=20000)
  print(json.dumps(await pg.evaluate('() => ({metrics:__stadium.metrics,unhandled:__unhandled})')))
  await b.close()
asyncio.run(main())
