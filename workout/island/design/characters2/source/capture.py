"""Capture actual final Draco GLBs in three views and inspect browser wardrobes."""
import io
import json
import hashlib
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from threading import Thread
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
REPO=ROOT.parents[3]
MODELS=['soccer-player','goalkeeper','basketball-player','skier']
ANGLES={'front':0,'three-quarter':.72,'back':3.141592653589793}
class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass

def main():
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=str(REPO)))
    Thread(target=server.serve_forever,daemon=True).start()
    diagnostics=[];captures=[];applications=[]
    try:
        with sync_playwright() as pw:
            browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader'])
            page=browser.new_page(viewport={'width':768,'height':768},device_scale_factor=1)
            page.on('pageerror',lambda error:diagnostics.append(str(error)))
            page.goto(f'http://127.0.0.1:{server.server_port}/workout/island/design/characters2/preview.html')
            page.evaluate('async()=>await characters2.ready')
            page.evaluate('()=>document.body.classList.add("capture")')
            for model in MODELS:
                page.evaluate('async id=>await characters2.selectCharacter(id)',model)
                for name,angle in ANGLES.items():
                    page.evaluate('angle=>characters2.setView(angle)',angle)
                    target=ROOT/f'{model}-{name}.png'
                    page.locator('#stage').screenshot(path=str(target))
                    captures.append({'model':model,'angle':name,'file':target.name,'sha256':hashlib.sha256(target.read_bytes()).hexdigest()})
                page.evaluate('()=>characters2.setView(.15,true)')
                page.locator('#stage').screenshot(path=str(ROOT/f'{model}-detail.png'))
                choices=page.locator('#outfit option').evaluate_all('(nodes)=>nodes.map(n=>n.value)')
                for option in choices:
                    page.evaluate('async id=>{document.getElementById("outfit").value=id;await characters2.outfit(id)}',option)
                    probes=page.evaluate('()=>({vertices:characters2.mesh.geometry.attributes.position.count,texture:characters2.mesh.material.map?{width:characters2.mesh.material.map.image.width,height:characters2.mesh.material.map.image.height}:null,errors:characters2.errors})')
                    assert not probes['errors']
                    if option!='original':assert probes['texture']=={'width':256,'height':256}
                    applications.append({'model':model,'outfit':option,**probes})
                # Both skin and hair must also change independently in the original appearance.
                page.evaluate('async()=>{document.getElementById("outfit").value="original";await characters2.outfit("original")}')
                before=page.evaluate('()=>Array.from(characters2.mesh.geometry.attributes.color.array)')
                for kind in ['skin','hair']:
                    page.evaluate('kind=>{document.getElementById(kind).selectedIndex=6}',kind)
                    page.evaluate('async()=>await characters2.outfit("original")')
                    after=page.evaluate('()=>Array.from(characters2.mesh.geometry.attributes.color.array)')
                    assert before!=after,f'{model}: original {kind} did not recolor'
                    before=after
            assert not diagnostics,diagnostics
            browser.close()
        overview=Image.new('RGB',(384*4,430),'#182935')
        draw=ImageDraw.Draw(overview)
        for col,model in enumerate(MODELS):
            with Image.open(ROOT/f'{model}-three-quarter.png') as image:
                overview.paste(image.resize((384,384)),(col*384,0))
            draw.text((col*384+20,400),model,fill='#d7e5eb')
        overview.save(ROOT/'overview.webp',quality=92,method=6)
        report={'pass':not diagnostics,'sourceSha256':{model:hashlib.sha256((ROOT/f'{model}.glb').read_bytes()).hexdigest() for model in MODELS},'captures':captures,'browserApplications':applications,'diagnostics':diagnostics}
        (ROOT/'verification/preview.json').write_text(json.dumps(report,indent=2)+'\n')
        print(f'PASS: {len(captures)} views; {len(applications)} original/outfit browser applications')
    finally:
        server.shutdown();server.server_close()
if __name__=='__main__':main()
