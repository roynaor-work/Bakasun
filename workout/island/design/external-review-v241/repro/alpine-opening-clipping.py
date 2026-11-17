import json,os
from playwright.sync_api import sync_playwright
# Read-only browser reproduction; the theme tool uses in-memory records.
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 c=b.new_context(viewport={'width':844,'height':390},has_touch=True,is_mobile=True,device_scale_factor=1)
 result=[]
 for enabled in (True,False):
  page=c.new_page();page.add_init_script("Object.defineProperty(window,'devicePixelRatio',{get:()=>0.3});")
  page.goto('http://127.0.0.1:8766/workout/island/tools/alpine-league-themes.html?stage=26&dev=1&quality=low'+('' if enabled else '&alpineV241=0'),wait_until='domcontentloaded')
  page.wait_for_function('window.__theme?.ready || window.__theme?.error',timeout=120000)
  row=page.evaluate('''()=>({v241:window.__theme.session.snapshot.v241,error:window.__theme.error,intro:document.querySelector('.alpine-intro').getBoundingClientRect().toJSON(),themes:[...document.querySelectorAll('.alpine-theme')].map(n=>{let r=n.getBoundingClientRect();return{rect:r.toJSON(),hitAtCentre:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===n||n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),visibleHeight:Math.max(0,Math.min(innerHeight,document.querySelector('.alpine-intro').getBoundingClientRect().bottom,r.bottom)-Math.max(0,r.top))}})})''')
  result.append(row)
  page.screenshot(path='/tmp/v241-alpine-opening-'+('on' if enabled else 'off')+'.png')
  page.evaluate('window.__theme.session.dispose()');page.close()
 print(json.dumps(result,indent=2))
 b.close()
