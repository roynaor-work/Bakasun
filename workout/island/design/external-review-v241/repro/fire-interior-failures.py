# Read-only external review reproducer. Start a local HTTP server at port 8766 in the repository root.
# Run: python3 workout/island/design/external-review-v241/repro/fire-interior-failures.py
from review_support import out_path
import asyncio,json
from playwright.async_api import async_playwright
BASE='http://127.0.0.1:8766/workout/island/design/external-review-v241/repro/fire-interior-probe.html'
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader'])
  ctx=await b.new_context(viewport={'width':844,'height':390},has_touch=True,is_mobile=True,device_scale_factor=1)
  pg=await ctx.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)))
  await pg.route('**/fire-v24/rooms/living-room.glb*',lambda r:r.abort())
  await pg.goto(BASE+'?level=3');await pg.wait_for_function('() => window.__probe && window.__probe.loadFailed')
  await pg.wait_for_timeout(3000)
  print('FIRST_FAIL',json.dumps(await pg.evaluate('({snapshot:__probe.snapshot,done:__done,fade:document.querySelector(".fv24-fade").textContent})')))
  await pg.screenshot(path=out_path('fire-first-room-failed.png'))
  await ctx.close();ctx=await b.new_context(viewport={'width':844,'height':390},has_touch=True,is_mobile=True,device_scale_factor=1)
  pg=await ctx.new_page();pg.on('pageerror',lambda e:errors.append(str(e)))
  await pg.route('**/fire-v24/rooms/living-room.glb*',lambda r:r.abort())
  await pg.goto(BASE+'?level=9');await pg.wait_for_function('() => window.__probe && window.__probe.ready')
  await pg.wait_for_timeout(600)
  # Complete the first room through the actual pure-model input; only accelerate its clock.
  result=await pg.evaluate('''() => {const m=__probe.model;for(let i=0;i<100;i++)m.update(.1,{skip:true});for(const s of m.room.spots){for(let i=0;i<70&&!s.done;i++)m.update(.1,{aim:s.pos});}m.update(.1,{tap:[...m.room.friend.pos]});for(let i=0;i<60&&m.roomIndex===0;i++)m.update(.1,{});return m.snapshot();}''')
  await pg.wait_for_timeout(500)
  await pg.evaluate('() => {const m=__probe.model;for(let i=0;i<30;i++)m.update(.1,{skip:true});__probe.scene.update(.1);__probe.scene.render();}')
  print('LATER_FAIL',json.dumps(await pg.evaluate('({snapshot:__probe.snapshot,sceneNames:__probe.scene.scene.children.map(x=>x.name),done:__done})')))
  await pg.screenshot(path=out_path('fire-later-room-failed.png'))
  print('ERRORS',errors)
  await b.close()
asyncio.run(main())
