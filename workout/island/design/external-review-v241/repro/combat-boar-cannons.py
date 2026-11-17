from review_support import out_path
from pathlib import Path
import json
from playwright.sync_api import sync_playwright
OUT=Path(out_path(''))
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    rows=[]
    for flag in ['v24','v241']:
        context=browser.new_context(viewport={'width':844,'height':390},has_touch=True,is_mobile=True,device_scale_factor=1)
        context.add_init_script("localStorage.setItem('boar-island-quality','normal'); Math.random=(()=>{let s=5;return ()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296}})()")
        page=context.new_page();page.set_default_timeout(120000)
        page.goto('http://127.0.0.1:8766/workout/island/minigames/boar-island/?qa=1&touch=1'+('&boarFx=v24' if flag=='v24' else ''),wait_until='networkidle')
        page.wait_for_function('() => !!window.__boar')
        page.evaluate('window.__boar.hold(true)')
        setup='''() => {const b=window.__boar;b.sandbox(1);const s=b.state.save;for(const k of ['cannon','cannon2','cannon3'])s.weapons[k]=1;s.bestWave=30;b.setSave(s);}'''
        page.evaluate(setup)
        for kind in ['runner','heavy','mortar','scout','shark','crab','manta']:
            for dist in [-70,-40,-15]:
                for gun in ['cannon','cannon2','cannon3']:
                    row=page.evaluate('''({kind,dist,gun}) => {const b=window.__boar;b.sandbox(1);b.killAll();b.spawn(kind,dist);b.step(3);b.weapon(gun);b.step(20);b.aimAtFirst();const before=b.state,cast=b.cast(),aim=b.view();b.fire(true);b.step(1);b.fire(false);b.step(50);return {kind,dist,gun,cast,before:before.enemies,after:b.state.enemies,hits:b.state.hits,crits:b.state.crits,killed:b.state.killed,aim:aim.targets.map(x=>({x:x.x,y:x.y,hp:x.hp})),fx:b.fx()};}''',{'kind':kind,'dist':dist,'gun':gun})
                    row['flag']=flag;rows.append(row)
        context.close()
    mismatches=[]
    for a,b in zip(rows[:len(rows)//2],rows[len(rows)//2:]):
        if a['after']!=b['after'] or a['hits']!=b['hits'] or a['crits']!=b['crits']:
            mismatches.append({'old':a,'new':b})
    (OUT/'combat-boar-cannons.json').write_text(json.dumps({'rows':rows,'mismatches':mismatches},ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'rows':len(rows),'mismatches':mismatches},ensure_ascii=False))
    browser.close()
