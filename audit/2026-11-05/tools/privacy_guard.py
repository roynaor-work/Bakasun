"""Check delivery boundaries and accidental copies without printing matched values."""
import re,sys
from PIL import Image
from common import *

def main():
    prefix='audit/2026-11-05/'
    changed=subprocess.check_output(['git','diff','--name-only',BASE],cwd=ROOT,text=True).splitlines()
    untracked=subprocess.check_output(['git','ls-files','--others','--exclude-standard'],cwd=ROOT,text=True).splitlines()
    outside=[p for p in changed+untracked if not p.startswith(prefix)]
    old=subprocess.check_output(['git','ls-tree','-r','--name-only',BASE,'--',prefix],cwd=ROOT,text=True).splitlines()
    files=[p for p in OUT.rglob('*') if p.is_file() and '__pycache__' not in p.parts]
    text_files=[]
    for p in files:
        if p.suffix.lower() not in {'.jpg','.jpeg','.png','.webp'}:
            try:text_files.append((p,p.read_text()))
            except UnicodeDecodeError:pass
    jwt=re.compile(r'eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}')
    tokens=set()
    for rel in baseline_files():
        p=ROOT/rel
        if p.suffix.lower() in {'.js','.mjs','.ts','.json','.html','.sql','.yml','.yaml','.md','.py','.css','.txt'}:
            tokens.update(jwt.findall(p.read_text(errors='replace')))
    contacts=set();scan=json.loads((OUT/'evidence/source-scan.json').read_text())
    for row in scan['possibleContactLocations']:
        line=(ROOT/row['path']).read_text(errors='replace').splitlines()[row['line']-1]
        for value in re.findall(r'(?<![\d.])0[2-9][\d-]{7,10}(?![\d.])',line):
            contacts.add(value);contacts.add(value.replace('-',''))
    hits=[]
    signatures={
      'private-key':re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----'),
      'service-token':re.compile(r'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{40,}|(?:AKIA|ASIA)[A-Z0-9]{16})\b'),
    }
    for p,s in text_files:
        if any(t in s for t in tokens):hits.append({'path':str(p.relative_to(OUT)),'kind':'copied-source-JWT'})
        if any(v in s for v in contacts):hits.append({'path':str(p.relative_to(OUT)),'kind':'copied-source-contact'})
        for kind,pattern in signatures.items():
            if pattern.search(s):hits.append({'path':str(p.relative_to(OUT)),'kind':kind})
    exif=[]
    for p in OUT.rglob('*.jpg'):
        with Image.open(p) as im:
            if len(im.getexif()):exif.append(str(p.relative_to(OUT)))
    report={'at':stamp(),'conditions':'Heuristic signatures and exact in-memory comparison with source JWT/contact candidates; no matched value is persisted. This is not a complete personal-data classifier. All browser data came from fresh synthetic contexts.','outsideAuditChanges':outside,'filesPreexistingAtBaseline':old,'newTextFilesChecked':len(text_files),'sourceJwtCandidates':len(tokens),'sourceContactCandidates':len(contacts),'valueHits':hits,'screenshotsWithExif':exif,'pass':not(outside or old or hits or exif)}
    if '--check-only' not in sys.argv:write_json(OUT/'evidence/privacy-guard.json',report)
    print(json.dumps({k:report[k] for k in ['pass','outsideAuditChanges','filesPreexistingAtBaseline','newTextFilesChecked','valueHits','screenshotsWithExif']},ensure_ascii=False))
    if not report['pass']:raise SystemExit(1)

if __name__=='__main__':main()
