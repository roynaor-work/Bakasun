#!/usr/bin/env python3
"""Cache the shipped manifest, reload offline, then start games in a fresh context.

Requires Python Playwright and Chromium; changes no repository files or real saves.
Start the repository with: python3 -m http.server 8766 --bind 127.0.0.1
Run: python3 workout/island/design/external-review-v241/repro/offline-roundtrip.py
"""
import argparse
import asyncio
import json
from playwright.async_api import async_playwright


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', default='http://127.0.0.1:8766/workout/island/')
    parser.add_argument('--chromium', default='/usr/bin/chromium')
    parser.add_argument('--games', default='soccer,streetSlam,streetSlam:rollback,tennis,fireRescue,alienDefense,navalDuel,alpineRush,islandRacing')
    parser.add_argument('--query', default='')
    parser.add_argument('--output', default='/tmp/v241-offline-roundtrip.json')
    args = parser.parse_args()
    result = {'viewport': [844, 390], 'physicalPhone': False, 'games': [], 'errors': [], 'failed': [], 'csp': []}
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(executable_path=args.chromium, headless=True, args=[
            '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        context = await browser.new_context(viewport={'width': 844, 'height': 390}, has_touch=True, is_mobile=True)
        page = await context.new_page()
        page.set_default_timeout(90000)
        page.on('pageerror', lambda error: result['errors'].append(str(error)))
        page.on('requestfailed', lambda request: result['failed'].append({'url': request.url, 'failure': request.failure}))
        await page.add_init_script("""HTMLElement.prototype.requestFullscreen=undefined;
          window.__reviewCsp=[];addEventListener('securitypolicyviolation',e=>__reviewCsp.push({
            directive:e.effectiveDirective,blocked:e.blockedURI,file:e.sourceFile,line:e.lineNumber}));""")
        url = args.base + '?dev=1&autodownload=0' + args.query
        try:
            await page.goto(url, wait_until='load')
            await page.wait_for_function('()=>Boolean(window.__island?.data)', timeout=180000)
            await page.evaluate('()=>{window.__island.view.paused=true;}')
            print('Online shell ready; downloading the manifest.', flush=True)
            result['download'] = await page.evaluate("""async()=>{
                const m=await import('./ui/offline.mjs');
                const r=await m.downloadGames({concurrency:8,attempts:1,timeoutMs:15000});
                await navigator.serviceWorker.ready;
                return {...r,status:await m.offlineStatus()};
            }""")
            result['onlineCsp'] = await page.evaluate('window.__reviewCsp')
            print('Download finished: '+str(len(result['download']['failed']))+' failed files.', flush=True)
            await context.set_offline(True)
            await page.reload(wait_until='load', timeout=120000)
            await page.wait_for_function('()=>Boolean(window.__island?.data)', timeout=180000)
            result['offlineShell'] = True
            print('Offline shell ready.', flush=True)
            result['offlineBodyVersions'] = await page.evaluate("""async()=>{
              const {loadAthleteHoops}=await import('./minigames/hoops-athlete.mjs');const out=[];
              window.__island.view.paused=true;
              for(const query of ['', 'hoopsV241=0']){const fallbacks=[];
                const a=await loadAthleteHoops(window.__island.data.config.minigames.streetSlam.assets,new URL('./',location.href),null,
                  {params:new URLSearchParams(query),onFallback:(what,error)=>fallbacks.push({what,error:String(error)})});
                out.push({query,bodyVersion:a.bodyVersion,fallbacks});a.dispose();}
              return out;
            }""")
            print('Offline body versions: '+json.dumps(result['offlineBodyVersions']), flush=True)
            if args.games and await page.locator('[data-action=avatar-start]').count():
                await page.locator('[data-action=avatar-start]').tap()
            await page.evaluate("""()=>{const {engine:e,data}=window.__island;e.skipTutorial();
                e.tick=()=>({ok:true});data.featureFlags.events=false;e.state.money=100000;
                for(const type of ['soccer','basketball','tennis','fireStation','airbase']){
                  let done=false;for(let z=0;z<e.state.world.size&&!done;z++)for(let x=0;x<e.state.world.size&&!done;x++)if(e.place(type,x,z).ok)done=true;}
                e.place('road',0,7);e.place('harbor',0,8);
                e.state.instructionsSeen=[...e.registry.minigames.keys()];
                for(const p of Object.values(e.state.minigameProgress))if(p&&typeof p==='object')p.stage=30;
            }""")
            result['registry'] = await page.evaluate('[...window.__island.engine.registry.minigames.keys()]')
            for spec in filter(None, args.games.split(',')):
                game, _, mode = spec.partition(':')
                await page.evaluate("""mode=>{const u=new URL(location.href);if(mode==='rollback')u.searchParams.set('hoopsV241','0');
                  else u.searchParams.delete('hoopsV241');history.replaceState(null,'',u);}""", mode)
                before = len(result['failed'])
                entry = {'game': spec}
                try:
                    await page.evaluate('(id)=>window.__island.games.start(id,undefined,1)', game)
                    await page.wait_for_function('()=>Boolean(window.__island.games.current?.session)')
                    await page.wait_for_timeout(3000)
                    entry['snapshot'] = await page.evaluate('window.__island.games.current?.session.snapshot')
                    entry['visibleButtons'] = await page.locator('button:visible').evaluate_all("""nodes=>nodes.map(n=>{
                        const r=n.getBoundingClientRect();return {action:n.dataset.action||n.dataset.gameControl,text:n.getAttribute('aria-label')||n.textContent,
                        rect:{x:r.x,y:r.y,width:r.width,height:r.height},disabled:n.disabled};})""")
                except Exception as error:
                    entry['error'] = str(error)
                finally:
                    entry['failedRequests'] = result['failed'][before:]
                    result['games'].append(entry)
                    print('Game finished: '+spec+'; '+str(len(entry['failedRequests']))+' failed requests.', flush=True)
                    await page.evaluate('window.__island.ui.closeModal()')
                    await page.wait_for_timeout(200)
            result['csp'] = await page.evaluate('window.__reviewCsp')
        except Exception as error:
            result['fatal'] = str(error)
        finally:
            await browser.close()
    with open(args.output, 'w') as handle:
        json.dump(result, handle, ensure_ascii=False, indent=2)
        handle.write('\n')
    print(json.dumps({'output':args.output,'offlineShell':result.get('offlineShell'),
        'downloadFailed':len(result.get('download',{}).get('failed',[])),
        'games':[{'game':g['game'],'error':g.get('error'),'failed':len(g['failedRequests'])} for g in result['games']],
        'fatal':result.get('fatal'),'errors':result['errors'],'csp':result['csp']},ensure_ascii=False,indent=2))


if __name__ == '__main__':
    asyncio.run(main())
