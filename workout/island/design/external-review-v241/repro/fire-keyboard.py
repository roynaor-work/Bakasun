# Read-only external review reproducer. Start a local HTTP server at port 8766 in the repository root.
# Run: python3 workout/island/design/external-review-v241/repro/fire-keyboard.py
from review_support import out_path
import asyncio,json
from playwright.async_api import async_playwright
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader'])
  c=await b.new_context(viewport={'width':844,'height':390},device_scale_factor=1)
  pg=await c.new_page();await pg.goto('http://127.0.0.1:8766/workout/island/design/external-review-v241/repro/fire-interior-probe.html?level=3&tutorial=1')
  await pg.wait_for_function('() => window.__probe?.ready && !document.querySelector(".fv24-card").hidden')
  before=await pg.evaluate('() => ({tutorialOpen:__probe.snapshot.tutorialOpen,modelTime:__probe.snapshot.time,card:document.querySelector(".fv24-card").outerHTML,focusable:[...document.querySelectorAll("button,a,input,select,textarea,[tabindex]")].filter(n=>n.getBoundingClientRect().width).map(n=>({name:n.textContent,role:n.getAttribute("role"),tabIndex:n.tabIndex}))})')
  for i in range(5):
   await pg.keyboard.press('Tab');await pg.keyboard.press('Enter');await pg.keyboard.press('Space')
  after=await pg.evaluate('() => ({tutorialOpen:__probe.snapshot.tutorialOpen,modelTime:__probe.snapshot.time,activeElement:document.activeElement.outerHTML.slice(0,300)})')
  print(json.dumps({'before':before,'after':after}))
  await pg.screenshot(path=out_path('fire-keyboard-tutorial.png'))
  await b.close()
asyncio.run(main())
