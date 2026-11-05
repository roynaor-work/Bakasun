"""Freeze authoring sources and asset hashes for a visual iteration."""
from pathlib import Path
from PIL import Image, ImageDraw
import sys,zipfile,json,hashlib,datetime,re,base64
ROOT=Path(__file__).resolve().parents[1]
number=sys.argv[1].zfill(2);out=ROOT/'iterations'/number;out.mkdir(parents=True,exist_ok=True)
html=(ROOT/'index.html').read_text();runtime_sha=hashlib.sha256(html.encode()).hexdigest()
capture=json.loads((out/'capture.json').read_text())
if runtime_sha!=capture['sourceSha256']:raise SystemExit('Refusing to archive a different runtime from the captured iteration')
with zipfile.ZipFile(out/'source.zip','w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for folder in ('src','tools'):
        for p in sorted((ROOT/folder).glob('*')):
            if p.is_file():z.write(p,p.relative_to(ROOT))
    # Keep the exact runtime sources from the rendered HTML even if authoring
    # scripts were updated immediately after capture. No duplicated GLB payloads.
    z.writestr('rendered/metadata.json',json.dumps({'sourceHtmlSha256':runtime_sha,'captureSourceSha256':capture['sourceSha256'],'capturedAt':capture['completedAt'],'archiveCreatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()},indent=2))
    app=re.search(r'<script type="module">(.*?)</script>\s*</body>',html,re.S)
    if app:z.writestr('rendered/app.js',app.group(1))
    imports=re.search(r'<script type="importmap">(.*?)</script>',html,re.S)
    if imports:
        for key,value in json.loads(imports.group(1))['imports'].items():
            if key in ('naval-ocean','naval-effects','naval-crew'):
                z.writestr('rendered/'+key+'.js',base64.b64decode(value.split(',',1)[1]))
rows=[]
for p in sorted((ROOT/'assets').rglob('*')):
    if p.is_file():rows.append({'file':str(p.relative_to(ROOT)),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
(out/'asset-hashes.json').write_text(json.dumps({'capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'assets':rows},indent=2)+'\n')
# Review-only contact sheet. Individual source-resolution screenshots are retained.
files=['390x844-near.png','390x844-far.png','844x390-near.png','844x390-far.png']
if all((out/f).exists() for f in files):
    sheet=Image.new('RGB',(1280,900),'#10232f');d=ImageDraw.Draw(sheet)
    slots=[(12,32,286,620),(310,32,286,620),(608,32,660,305),(608,380,660,305)]
    for name,(x,y,w,h) in zip(files,slots):
        im=Image.open(out/name);im.thumbnail((w,h),Image.Resampling.LANCZOS);sheet.paste(im,(x,y));d.text((x,y-19),name,fill='#d0b996')
    d.text((20,858),f'NAVAL V7 / ITERATION {number} / actual offline WebGL captures',fill='#d0b996')
    sheet.save(out/'contact-sheet.jpg',quality=90,optimize=True)
print('Checkpoint',number)
