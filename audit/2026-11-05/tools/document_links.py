"""Validate local document links and explicit report anchors without network."""
import re
from html.parser import HTMLParser
from PIL import Image
from common import *

class Links(HTMLParser):
    def __init__(self):super().__init__();self.links=[];self.ids=set()
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if a.get('id'):self.ids.add(a['id'])
        for key in ['href','src']:
            if a.get(key):self.links.append(a[key])

def main():
    rows=[]
    for path in sorted(OUT.rglob('*')):
        if path.suffix not in {'.md','.html'}:continue
        source=path.read_text();parser=Links();parser.feed(source)
        urls=parser.links+(re.findall(r'\[[^\]]*\]\(([^)]+)\)',source) if path.suffix=='.md' else [])
        for href in urls:
            u=urlsplit(href)
            if u.scheme or u.netloc:continue
            target=(path.parent/unquote(u.path)).resolve() if u.path else path
            exists=target.is_file();anchor=True
            if exists and u.fragment and target.suffix in {'.md','.html'}:
                p=Links();p.feed(target.read_text());anchor=unquote(u.fragment) in p.ids
            rows.append({'from':str(path.relative_to(OUT)),'href':href,'fileExists':exists,'anchorValid':anchor,'insideAudit':target.is_relative_to(OUT)})
    data=json.loads((OUT/'data.js').read_text().removeprefix('window.AUDIT=').rstrip(';\n'))
    for iteration in data['iterations']:
        for shot in iteration['shots']:
            for mode in ['near','far']:
                target=OUT/shot[mode];valid=target.is_file()
                if valid:
                    with Image.open(target) as im:valid=im.size==tuple(map(int,shot['size'].split('x')))
                rows.append({'from':'data.js','href':shot[mode],'fileExists':valid,'anchorValid':True,'insideAudit':True})
    r={'at':stamp(),'conditions':'No network; static local href/src/Markdown links, explicit HTML anchors and data.js image paths. External GitHub source links are not fetched; source paths/line bounds are checked separately in review QA.','links':rows,'pass':all(x['fileExists'] and x['anchorValid'] and x['insideAudit'] for x in rows)}
    write_json(OUT/'evidence/document-links.json',r);print('document links pass:',r['pass'],'checked:',len(rows))
    for row in rows:
        if not(row['fileExists'] and row['anchorValid'] and row['insideAudit']):print(json.dumps(row,ensure_ascii=False))
    if not r['pass']:raise SystemExit(1)

if __name__=='__main__':main()
