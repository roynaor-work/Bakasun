"""Offline UI, WebGL, input, orientation, and recovery checks on delivered files.

The browser is in offline mode. A strict local-file route fulfills requests from
this folder, with no server connection and no external request fallback.
"""
import json,time,mimetypes,argparse
from pathlib import Path
from urllib.parse import urlparse,unquote
from datetime import datetime,timezone
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'verification';OUT.mkdir(exist_ok=True)
parser=argparse.ArgumentParser();parser.add_argument('--entry',default='standalone.html');args=parser.parse_args()
records=[];errors=[];blocked=[];local=[]
def result(name,passed,details=None):
 records.append({'name':name,'pass':bool(passed),'details':details});print(name,'PASS' if passed else 'FAIL',flush=True)
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 ctx=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=1,has_touch=True,offline=True,service_workers='block')
 def route(r):
  u=urlparse(r.request.url)
  if u.scheme in ['blob','data']:r.continue_();return
  if u.scheme!='http' or u.netloc!='127.0.0.1:8765':blocked.append(r.request.url);r.abort();return
  file=(ROOT/unquote(u.path).lstrip('/')).resolve()
  if not file.is_relative_to(ROOT) or not file.is_file():blocked.append(str(file));r.abort();return
  data=file.read_bytes();local.append({'path':str(file.relative_to(ROOT)),'bytes':len(data)})
  r.fulfill(status=200,body=data,content_type=mimetypes.guess_type(file)[0] or 'application/octet-stream')
 ctx.route('**/*',route)
 page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
 start=time.monotonic();page.goto('http://127.0.0.1:8765/'+args.entry+'?time=0',wait_until='load');page.wait_for_function('window.tennis && window.tennis.ready',timeout=120000)
 result('offline-local-files-ready',True,{'coldLoadSeconds':time.monotonic()-start,'network':'offline=True, local files fulfilled directly'})
 page.evaluate('tennis.setState({autoQuality:false,playing:false})')
 for w,h in [(390,844),(844,390)]:
  page.set_viewport_size({'width':w,'height':h})
  for surface in ['clay','grass','hard']:
   page.locator('[data-surface='+surface+']').click();result(f'{w}-surface-{surface}',page.evaluate('tennis.diagnostics().state.surface')==surface)
  for view in ['wide','roster','close','line']:
   page.locator('button[data-view='+view+']').click();result(f'{w}-view-{view}',page.evaluate('tennis.diagnostics().state.view')==view)
  page.locator('button[data-view=close]').click()
  for actor in range(4):
   page.locator('[data-actor="'+str(actor)+'"]').click();result(f'{w}-actor-{actor}',page.evaluate('tennis.diagnostics().state.actor')==actor)
  for focus in ['body','face','grip','body']:
   page.locator('button[data-focus='+focus+']').click();result(f'{w}-focus-{focus}',page.evaluate('tennis.diagnostics().state.focus')==focus)
  for motion in ['idle','run','serve','forehand','backhand','volley','smash','slide','celebrate']:
   page.locator('#motion').select_option(motion);page.evaluate('tennis.seek(.25)');result(f'{w}-motion-{motion}',page.evaluate('tennis.diagnostics().state.motion')==motion)
  before=page.evaluate('tennis.diagnostics().state.light');page.locator('#lighting').click();after=page.evaluate('tennis.diagnostics().state.light');result(f'{w}-lighting',before!=after)
  page.evaluate('tennis.setState({motion:"run",focus:"body",playing:false})');page.locator('#play').click();page.wait_for_timeout(850)
  a=page.evaluate('tennis.diagnostics()');page.locator('#play').click();b=page.evaluate('tennis.diagnostics()');page.wait_for_timeout(350);c=page.evaluate('tennis.diagnostics()')
  result(f'{w}-play-pause',a['state']['playing'] and not b['state']['playing'] and b['state']['time']==c['state']['time'])
  result(f'{w}-paused-no-continuous-render',b['renderCount']==c['renderCount'],{'before':b['renderCount'],'after':c['renderCount']})
  page.locator('#time').evaluate("e=>{e.value='.5';e.dispatchEvent(new Event('input',{bubbles:true}));}")
  result(f'{w}-timeline',abs(page.evaluate('tennis.diagnostics().state.time')-.36)<.005)
  rect=page.locator('#court').bounding_box();x=rect['x']+rect['width']*.48;y=rect['y']+rect['height']*.52
  page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+45,y,steps=4);page.mouse.up();result(f'{w}-drag-orbit',abs(page.evaluate('tennis.diagnostics().state.orbit'))>.1)
  page.locator('#court').focus();page.keyboard.press('Home');result(f'{w}-keyboard-reset',page.evaluate('tennis.diagnostics().state.orbit')==0)
  page.locator('#quality').click();q=page.evaluate('tennis.diagnostics()');result(f'{w}-economy',q['state']['quality']=='economy' and q['crowd']['instancedDraws']==1,q['render'])
  page.locator('#quality').click();result(f'{w}-balanced-restore',page.evaluate('tennis.diagnostics().state.quality')=='balanced')
  layout=page.evaluate('''()=>({overflow:document.documentElement.scrollWidth>innerWidth,small:[...document.querySelectorAll('button,select,input')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.height&&(r.width<43.9||r.height<43.9);}).map(e=>({name:e.getAttribute('aria-label')||e.textContent.trim(),width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}))})''')
  result(f'{w}-layout-and-touch',not layout['overflow'] and not layout['small'],layout)
 # Real multi-touch input, separate from mouse drag.
 page.set_viewport_size({'width':390,'height':844});page.evaluate('tennis.setState({view:"wide",playing:false})');rect=page.locator('#court').bounding_box()
 cx=rect['x']+rect['width']/2;cy=rect['y']+rect['height']*.6;cdp=ctx.new_cdp_session(page)
 for kind,spread in [('touchStart',25),('touchMove',55)]:
  cdp.send('Input.dispatchTouchEvent',{'type':kind,'touchPoints':[{'x':cx-spread,'y':cy,'id':1},{'x':cx+spread,'y':cy,'id':2}]})
 cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
 result('two-finger-pinch',page.evaluate('tennis.diagnostics().state.zoom')<.9)
 page.evaluate('tennis.setState({motion:"serve",playing:true})');page.wait_for_timeout(400);page.set_viewport_size({'width':844,'height':390});page.wait_for_timeout(400)
 result('orientation-while-playing',page.evaluate('tennis.diagnostics().state.motion')=='serve' and page.evaluate('tennis.diagnostics().state.playing'))
 page.evaluate('tennis.setState({playing:false})');page.evaluate("window._tennisLose=tennis.renderer.getContext().getExtension('WEBGL_lose_context');window._tennisLose.loseContext()")
 page.wait_for_timeout(250);lost=page.locator('#error').is_visible();page.evaluate('window._tennisLose.restoreContext()');page.wait_for_function('document.querySelector("#error").hidden',timeout=20000)
 result('webgl-context-recovery',lost and page.evaluate('tennis.renderer.getContext().isContextLost()') is False)
 page.screenshot(path=str(OUT/'context-restored.png'))
 result('no-external-network',not blocked,blocked);result('no-console-errors',not errors,errors)
 ctx.close()
 # Reduced motion is a fresh startup preference, not a toggle after load.
 quiet=browser.new_context(viewport={'width':390,'height':844},reduced_motion='reduce',offline=True);quiet.route('**/*',route)
 p=quiet.new_page();p.goto('http://127.0.0.1:8765/'+args.entry,wait_until='load');p.wait_for_function('window.tennis&&tennis.ready',timeout=120000)
 result('reduced-motion-starts-paused',p.evaluate('tennis.diagnostics().state.playing') is False)
 browser.close()
(OUT/'browser.json').write_text(json.dumps({'generated':datetime.now(timezone.utc).isoformat(),'entry':args.entry,'pass':all(r['pass'] for r in records),'checks':records,'externalRequests':blocked,'consoleErrors':errors,'localFilesServed':local},indent=2,ensure_ascii=False)+'\n')
