"""Static delivery review: tokens, contrast, links, SVG, budgets, and allowed write scope."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit,unquote
from datetime import datetime,timezone
import json,re,hashlib,subprocess,base64,xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parent.parent
REPO=ROOT.parent.parent
class Doc(HTMLParser):
    def __init__(self):super().__init__();self.ids=[];self.links=[];self.references=[];self.tags=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs);self.tags.append((tag,a))
        if 'id'in a:self.ids.append(a['id'])
        for key in ['src','href']:
            if key in a:self.links.append(a[key])
        for key in ['aria-controls','aria-labelledby','aria-describedby','for']:
            if key in a:self.references.extend(a[key].split())

def color(c):
    c=c.lstrip('#');return [int(c[i:i+2],16)/255 for i in (0,2,4)]
def luminance(c):
    x=[n/12.92 if n<=.04045 else ((n+.055)/1.055)**2.4 for n in color(c)]
    return .2126*x[0]+.7152*x[1]+.0722*x[2]
def contrast(a,b):
    a,b=sorted([luminance(a),luminance(b)]);return (b+.05)/(a+.05)
def main():
    css=(ROOT/'assets/tokens.css').read_text();blocks=[re.search(r':root\{(.*?)\}',css,re.S).group(1),re.search(r':root\[data-theme=dark\]\{(.*?)\}',css,re.S).group(1)]
    base={k:v for k,v in re.findall(r'--([\w-]+):([^;]+);',blocks[0])};dark={**base,**{k:v for k,v in re.findall(r'--([\w-]+):([^;]+);',blocks[1])}}
    pairs=[('ink','canvas',4.5),('ink','surface',4.5),('ink','hero',4.5),('muted','canvas',4.5),('muted','surface',4.5),('muted','hero',4.5),('accent','canvas',4.5),('accent','accent-soft',4.5),('accent-on','accent-fill',4.5),('positive','positive-soft',4.5),('caution','caution-soft',4.5),('info','info-soft',4.5),('negative','negative-soft',4.5),('surface','ink',4.5),('surface','positive',4.5),('control','surface',3),('control','canvas',3),('focus','canvas',3),('focus','surface',3)]
    contrasts=[]
    for theme,tokens in [('light',base),('dark',dark)]:
        for fg,bg,target in pairs:
            ratio=contrast(tokens[fg],tokens[bg]);contrasts.append({'theme':theme,'foreground':fg,'background':bg,'ratio':round(ratio,3),'required':target,'pass':ratio>=target})
    contrast_report={'method':'WCAG 2 relative luminance; 4.5:1 all text sizes, 3:1 controls and focus','pairs':contrasts,'failures':[x for x in contrasts if not x['pass']]}
    (ROOT/'verification/contrast.json').write_text(json.dumps(contrast_report,indent=2)+'\n')
    files=[];problems=[]
    embedded=re.findall(r'url\(data:font/ttf;base64,([A-Za-z0-9+/=]+)\)',css)
    font_sources=[ROOT/'assets/fonts'/name for name in ['NotoSansHebrew-Regular.ttf','NotoSansHebrew-Bold.ttf']]
    embedded_fonts={'count':len(embedded),'exact_match_to_local_TTF':len(embedded)==2 and all(base64.b64decode(value)==path.read_bytes() for value,path in zip(embedded,font_sources)),'separate_font_file_requests_required':False}
    if not embedded_fonts['exact_match_to_local_TTF']:problems.append('embedded font bytes do not match the licensed local source')
    for path in sorted(ROOT.glob('*.html')):
        doc=Doc();doc.feed(path.read_text());duplicates=[x for x in set(doc.ids) if doc.ids.count(x)>1]
        missing=[x for x in doc.references if x not in doc.ids]
        for url in doc.links:
            u=urlsplit(url)
            if u.scheme or u.netloc:problems.append(f'{path.name}: non-local URL {url}')
            if u.path:
                target=(path.parent/unquote(u.path)).resolve()
                if not target.is_relative_to(ROOT) or not target.exists():problems.append(f'{path.name}: missing/outside link {url}')
        if duplicates:problems.append(f'{path.name}: duplicate IDs {duplicates}')
        if missing:problems.append(f'{path.name}: unresolved label/ARIA references {missing}')
        if len([t for t,a in doc.tags if t=='h1'])!=1:problems.append(path.name+': h1 count')
        files.append({'file':path.name,'bytes':path.stat().st_size,'ids':len(doc.ids),'duplicate_ids':duplicates,'unresolved_references':missing})
    svgs=[]
    for path in sorted((ROOT/'assets').rglob('*.svg')):
        try:
            tree=ET.parse(path);el=tree.getroot();symbols=len(el.findall('{http://www.w3.org/2000/svg}symbol'));svgs.append({'file':str(path.relative_to(ROOT)),'bytes':path.stat().st_size,'symbols':symbols})
        except Exception as e:problems.append(str(e))
    icons=next(x['symbols'] for x in svgs if x['file']=='assets/icons.svg');illustrations=len(list((ROOT/'assets/empty').glob('*.svg')))
    if icons<60:problems.append('fewer than 60 icons')
    if illustrations!=8:problems.append('illustration count is not eight')
    # Scan only newly authored runtime text; license notices and immutable hashes are not demo data.
    privacy=[]
    for path in [*ROOT.glob('*.html'),*ROOT.glob('assets/*.js'),*ROOT.glob('assets/*.css'),*ROOT.glob('assets/empty/*.svg')]:
        text=path.read_text()
        for label,pattern in [('phone',r'(?<![\w#])(?:\+972[- ]?|0[2-9][- ]?)\d(?:[- ]?\d){7,8}(?!\w)'),('cloud-key',r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}'),('email',r'[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}'),('network-write',r'\b(?:fetch|XMLHttpRequest|WebSocket|sendBeacon)\s*\(')]:
            if re.search(pattern,text):privacy.append({'file':str(path.relative_to(ROOT)),'pattern':label})
    if privacy:problems.append('runtime privacy/network patterns found')
    runtime=[p for p in ROOT.glob('*.html')]+[p for p in (ROOT/'assets').rglob('*') if p.is_file()]
    budgets=[{'file':str(p.relative_to(ROOT)),'bytes':p.stat().st_size,'MB':round(p.stat().st_size/1e6,6),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'triangles':0,'textures':0,'kind':'font' if p.suffix=='.ttf' else 'SVG vector' if p.suffix=='.svg' else 'runtime text'} for p in sorted(runtime)]
    if any(x['bytes']>1500000 for x in budgets):problems.append('runtime file exceeds 1.5 MB')
    changes=subprocess.run(['git','status','--porcelain','--untracked-files=all'],cwd=REPO,capture_output=True,text=True,check=True).stdout.splitlines();outside=[line for line in changes if not line[3:].startswith('design/bakasun-ui-v2/')]
    if outside:problems.append('changes outside allowed folder')
    report={'checked_at':datetime.now(timezone.utc).isoformat(),'html':files,'svg':svgs,'embedded_fonts':embedded_fonts,'icons':icons,'empty_illustrations':illustrations,'privacy_scan':privacy,'write_scope':{'outside':outside,'allowed_folder':'design/bakasun-ui-v2/'},'asset_budgets':budgets,'runtime_total_bytes':sum(x['bytes'] for x in budgets),'3d':{'applicable':False,'reason':'Requested deliverable is 2D event-management UI. No 3D scene or character is required.','GLB_files':0,'triangles':0,'raster_textures':0,'three_js_loaded':False,'r160_Draco_LOD_instancing_18_bones':'not applicable; no 3D assets'},'problems':problems}
    (ROOT/'verification/static.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'html':len(files),'icons':icons,'illustrations':illustrations,'contrast_failures':contrast_report['failures'],'static_problems':problems,'runtime_bytes':report['runtime_total_bytes']},ensure_ascii=False,indent=2))
if __name__=='__main__':main()
