"""Coverage census and selected auxiliary surfaces; no sensor or submit actions."""
import re
from playwright.sync_api import sync_playwright
from common import *

def main():
    files=subprocess.check_output(['git','ls-files','-z'],cwd=ROOT).decode().split('\0')
    census=[]
    for rel in files:
        if not rel.endswith('.html') or not ((rel.split('/')[0] in ['north','workout']) or rel=='index.html'):continue
        source=(ROOT/rel).read_text()
        census.append({'path':rel,'metaCsp':bool(re.search(r'http-equiv=[\"\']Content-Security-Policy',source,re.I)),
          'inlineScriptCount':sum(1 for tag,body in re.findall(r'<script\b([^>]*)>(.*?)</script>',source,re.S|re.I) if 'src=' not in tag and body.strip()),
          'scriptSrcCount':len(re.findall(r'<script\b[^>]*\bsrc=',source,re.I))})
    r={'started':stamp(),'conditions':'selected auxiliary HTML, no camera/microphone permission or data submission; original HTML policy','htmlCensus':census,'pages':[]}
    with server() as base,sync_playwright() as pw:
        b=pw.chromium.launch(executable_path=CHROMIUM,headless=True,args=FLAGS)
        for rel in ['north/legal.html','north/survey.html','workout/voice-rec/index.html','workout/cam-lab/index.html','workout/3d/cartoon.html?ex=squats']:
            blocked=[];errors=[];c=b.new_context(viewport={'width':390,'height':844},service_workers='block',locale='he-IL');block_external(c,base,blocked)
            p=c.new_page();p.on('pageerror',lambda e:errors.append(str(e)))
            row={'path':rel}
            try:
                p.goto(base+rel,wait_until='load',timeout=60000);p.wait_for_timeout(800)
                row['axe']=axe(p);row['overflow']=p.evaluate('() => document.documentElement.scrollWidth>innerWidth');row['titlePresent']=bool(p.title())
            except Exception as e:row['harnessError']=str(e)
            row['pageErrors']=errors;row['externalBlocked']=blocked;r['pages'].append(row);write_json(OUT/'iterations/06/extra-surfaces.json',r)
            print(json.dumps({'path':rel,'axe':[(v['id'],len(v['nodes'])) for v in row.get('axe',{}).get('violations',[])],'pageErrors':errors,'harnessError':row.get('harnessError')},ensure_ascii=False),flush=True);c.close()
        b.close()
    r['finished']=stamp();write_json(OUT/'iterations/06/extra-surfaces.json',r)

if __name__=='__main__':main()
