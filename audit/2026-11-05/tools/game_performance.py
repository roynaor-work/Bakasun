"""Actual game benches with local CSP and software GPU; never a phone FPS claim."""
import re
from playwright.sync_api import sync_playwright
from common import *

def main():
    r={'started':stamp(),'conditions':{'renderer':'SwiftShader software WebGL on shared cloud CPU','deviceScaleFactor':1,'secondsPerGame':30,'network':'local only','policy':'exact island meta policy also sent as tool HTML response header, as in the existing CSP suite','warning':'FPS is diagnostic for this cloud machine, not certification of 30fps on a medium phone'},'runs':[]}
    policy=re.search(r'http-equiv="Content-Security-Policy" content="([^"]+)"',(ROOT/'workout/island/index.html').read_text()).group(1)
    urls={'soccer':'tools/perf-soccer.html?auto=1&seconds=30&quality=1&warmup=3&dev=1&seed=4242',
      'hoops':'tools/perf-hoops.html?dur=30&quality=1&profile=quick&dev=1&seed=4242',
      'alpine':'tools/perf-alpine.html?seconds=30&autostart=1&quality=low&seed=4242'}
    with server() as base,sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path=CHROMIUM,headless=True,args=FLAGS+['--enable-precise-memory-info'])
        for w,h in [(390,844),(844,390)]:
            for game,path in urls.items():
                blocked=[];errors=[];c=browser.new_context(viewport={'width':w,'height':h},device_scale_factor=1,is_mobile=True,has_touch=True,locale='he-IL',service_workers='block');block_external(c,base,blocked);c.add_init_script(OBSERVERS)
                p=c.new_page();p.on('pageerror',lambda e:errors.append(str(e)))
                def protect(route):
                    res=route.fetch();headers=dict(res.headers);headers['content-security-policy']=policy;route.fulfill(response=res,headers=headers)
                p.route('**/tools/perf-*.html?*',protect)
                row={'game':game,'size':[w,h],'at':stamp(),'path':path}
                try:
                    p.goto(base+'workout/island/'+path,wait_until='load',timeout=120000)
                    expr='() => !!window.__perf?.done' if game=='alpine' else '() => !!window.__perf && (!!window.__perf.error || !!window.__perf.fps || !!window.__perf.result)'
                    p.wait_for_function(expr,timeout=240000)
                    row['result']=p.evaluate('() => window.__perf')
                    row['observations']=p.evaluate('() => window.__audit')
                    row['resources']=snapshot(p)['resources']
                except Exception as e:row['harnessError']=str(e)
                row['errors']=errors;row['externalBlocked']=blocked;r['runs'].append(row);write_json(OUT/'iterations/04/game-performance.json',r)
                print(json.dumps({'game':game,'size':[w,h],'harnessError':row.get('harnessError'),'errors':errors,'resultKeys':list(row.get('result',{}))},ensure_ascii=False),flush=True);c.close()
        browser.close()
    r['finished']=stamp();write_json(OUT/'iterations/04/game-performance.json',r)

if __name__=='__main__':main()
