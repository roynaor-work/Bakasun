"""Repeatable phone-landscape viewer and motion contact-sheet checks."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parent.parent
URL='http://127.0.0.1:8767/workout/island/design/tennis-officials-v1/preview.html'
OUT=ROOT/'verification'
OUT.mkdir(exist_ok=True)
CASES=[('all',None,0,'court'),('chair-umpire','chair_score',1.3,'chair-score'),('chair-umpire','chair_idle',1,'chair-standing'),('line-judge-01','line_out',1,'line-out'),('line-judge-02','line_good',1,'line-good'),('ball-kid-01','kid_bend',1.8,'kid-bend'),('ball-kid-02','kid_run_collect',4,'kid-collect'),('ball-kid-03','kid_roll',1.6,'kid-roll'),('ball-kid-04','kid_offer',1.6,'kid-offer'),('ball-kid-01','kid_return',1.8,'kid-return')]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    page=browser.new_page(viewport={'width':844,'height':390},device_scale_factor=1)
    errors=[]
    page.on('pageerror',lambda e: errors.append(str(e)))
    page.on('console',lambda e: errors.append(e.text) if e.type=='error' else None)
    page.goto(URL,wait_until='networkidle')
    page.wait_for_function('window.previewReady===true',timeout=60000)
    records=[]
    for actor,clip,time,name in CASES:
        snapshot=page.evaluate('''([actor,clip,time])=>{officialsPreview.setPlaying(false);officialsPreview.setActor(actor);if(clip)officialsPreview.setClip(clip);officialsPreview.seek(time);return officialsPreview.snapshot()}''',[actor,clip,time])
        page.screenshot(path=str(OUT/(name+'-844x390.png')))
        records.append({'name':name,'snapshot':snapshot})
    overflow=page.evaluate('''()=>({x:document.documentElement.scrollWidth>innerWidth,y:document.documentElement.scrollHeight>innerHeight})''')
    audio=[]
    for sound in ['line-out','line-good','ball-roll','applause-soft']:
        audio.append(page.evaluate('''async id=>{const a=new Audio('./audio/'+id+'.wav');a.volume=0;await a.play();a.pause();return {id,duration:a.duration,readyState:a.readyState}}''',sound))
    page.set_viewport_size({'width':390,'height':844})
    page.evaluate("officialsPreview.setActor('ball-kid-01');officialsPreview.setClip('kid_offer');officialsPreview.seek(1.6)")
    page.screenshot(path=str(OUT/'portrait-390x844.png'))
    portrait_overflow=page.evaluate('''()=>({x:document.documentElement.scrollWidth>innerWidth,y:document.documentElement.scrollHeight>innerHeight})''')
    report={'pass':not errors and not any(overflow.values()) and not any(portrait_overflow.values()),'viewport':{'width':844,'height':390},'pageErrors':errors,'overflow':overflow,'portraitOverflow':portrait_overflow,'audioPlayback':audio,'cases':records}
    (OUT/'preview.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'pass':report['pass'],'errors':errors,'overflow':overflow,'portraitOverflow':portrait_overflow,'cases':len(records)},ensure_ascii=False))
    browser.close()
