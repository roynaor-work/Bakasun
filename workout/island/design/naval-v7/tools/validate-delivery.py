"""Validate the actual delivered HTML, binary dependencies, evidence and repo scope."""
from pathlib import Path
from html.parser import HTMLParser
import base64,hashlib,json,re,struct,subprocess,sys,datetime
ROOT=Path(__file__).resolve().parents[1];REPO=ROOT.parents[3]
PREFIX='workout/island/design/naval-v7/'
ALLOW_PENDING='--allow-pending' in sys.argv
FINAL='--final' in sys.argv
checks=[];pending=[]
def check(name,value,details=None):checks.append({'check':name,'pass':bool(value),'details':details})
def read(name):
    p=ROOT/name
    return json.loads(p.read_text()) if p.exists() else None
def git(*args):return subprocess.check_output(['git',*args],cwd=REPO,text=True).strip()
session=read('verification/session.json');runtime=(ROOT/'index.html').read_text();runtime_sha=hashlib.sha256(runtime.encode()).hexdigest()
match=re.search(r'<script id="naval-assets" type="application/json">(.*?)</script>',runtime,re.S)
embedded=json.loads(match.group(1));count=0
for key,value in embedded.items():
    p=(ROOT/key).resolve();check('Embedded asset stays inside package: '+key,p.is_relative_to(ROOT))
    if p.is_file():
        actual=base64.b64decode(value,validate=True);check('Embedded bytes match source: '+key,actual==p.read_bytes());count+=1
    else:check('Embedded asset exists: '+key,False)
check('All 15 GLBs and 6 PNGs are embedded',sum(k.endswith('.glb') for k in embedded)==15 and sum(k.endswith('.png') for k in embedded)==6,count)
mapping=json.loads(re.search(r'<script type="importmap">(.*?)</script>',runtime,re.S).group(1))['imports']
check('Eight local modules, no CDN module',len(mapping)==8 and all(v.startswith('data:text/javascript;base64,') for v in mapping.values()))
class URLs(HTMLParser):
    def __init__(self):super().__init__();self.external=[]
    def handle_starttag(self,tag,attrs):
        for name,value in attrs:
            if tag in ('script','img','link','iframe','audio','video','source') and name in ('src','href') and value and re.match(r'https?://',value):self.external.append(value)
urls=URLs();urls.feed(runtime);check('No external runtime resource tags',not urls.external,urls.external)
for part in ['README.md','REPORT.md','INTEGRATION.md','ASSET-WEIGHTS.md','CHECKLIST.md','LICENSES.md','LICENSE.assets','manifest.json','review.html']:
    check('Delivery file exists: '+part,(ROOT/part).is_file())
review=(ROOT/'review.html').read_text();ru=URLs();ru.feed(review);check('Review HTML has no external resource tags',not ru.external,ru.external)
review_check=read('verification/review-page-check.json')
check('Interactive ten-round review works offline on mobile',review_check and review_check['pass'] and review_check['sourceSha256']==hashlib.sha256(review.encode()).hexdigest())
layout=read('verification/layout-matrix/report.json')
check('All four hulls, orientations and distances match final source',layout and layout['pass'] and layout['sourceSha256']==runtime_sha and len(layout['cases'])==16)

rounds=[];mandatory=0;matrix=0
for folder in sorted((ROOT/'iterations').iterdir()):
    if not (folder/'capture.json').exists():continue
    c=json.loads((folder/'capture.json').read_text());rounds.append(folder.name);matrix+=len(c['screens'])
    check('Round '+folder.name+' has critique/source/hash evidence',all((folder/n).is_file() for n in ['REVIEW.md','source.zip','asset-hashes.json','contact-sheet.jpg']))
    check('Round '+folder.name+' has no browser errors/network requests',not c['errors'] and not c['externalRequests'] and not c['failedRequests'])
    for width,height in [(390,844),(844,390)]:
        for view in ['near','far']:
            name=f'{width}x{height}-{view}.png';b=(folder/name).read_bytes();dims=struct.unpack('>II',b[16:24]);check(folder.name+'/'+name+' exact dimensions',dims==(width,height),dims);mandatory+=1
check('At least six complete visual rounds',len(rounds)>=6,rounds)
check('Final visual capture matches delivered HTML',read('iterations/'+rounds[-1]+'/capture.json')['sourceSha256']==runtime_sha)
manifest=read('manifest.json');validation=read('verification/asset-validation.json')
check('All asset validation passes',validation['pass'],len(validation['checks']))
for kind,ship in manifest['ships'].items():
    levels=ship['lods'];check(kind+' has 3 LODs',len(levels)==3)
    check(kind+' LOD1/2 each use one draw',all(l['drawsPerInstance']==1 for l in levels[1:]))
    for lod in levels:check('Manifest hash '+lod['file'],hashlib.sha256((ROOT/lod['file']).read_bytes()).hexdigest()==lod['sha256'])
recovery=read('verification/recovery-check.json');pixels=read('verification/recovery-pixels.json')
check('Frozen-frame WebGL recovery passes',recovery and recovery['pass'] and recovery['sourceSha256']==runtime_sha)
check('Recovered hull pixel comparison passes',pixels and pixels['pass'],pixels)

for name,min_minutes,field in [('soak-report.json',75,'actualRenderMinutes'),('reload-report.json',15,'actualMinutes')]:
    result=read('verification/'+name)
    if not result:pending.append(name)
    else:
        exact=result.get('sourceSha256')==runtime_sha;compat=read('verification/soak-compatibility.json')
        camera_only=name=='soak-report.json' and compat and compat.get('pass') and compat.get('burnInSourceSha256')==result.get('sourceSha256') and compat.get('finalSourceSha256')==runtime_sha
        check(name+' completes required real duration with documented source',result.get('pass') and result.get(field,0)>=min_minutes and (exact or camera_only),{'minutes':result.get(field),'sourceSha256':result.get('sourceSha256'),'exactSource':exact,'provedCameraOnlyDelta':bool(camera_only)})
exercise=read('verification/browser-exercise.json')
if not exercise or exercise.get('sourceSha256')!=runtime_sha:pending.append('final browser-exercise.json')
else:check('Final functional/viewport/reduced-motion checks',exercise.get('pass') and len(exercise['checks'])>=33 and not exercise['externalRequests'])
repo=read('verification/repository-checks.json')
if not repo.get('adaptedFullRun'):pending.append('adapted full repository run')
else:check('Full repository run in installed-browser environment',repo['adaptedFullRun']['summary'].get('fail')==0,repo['adaptedFullRun']['summary'])

branch=git('branch','--show-current');check('Requested branch',branch=='codex/naval-v7-20261105',branch)
diff=git('diff','--name-status',session['baseCommit'],'--').splitlines();untracked=git('ls-files','--others','--exclude-standard').splitlines()
tracked_ok=all(line.startswith('A\t'+PREFIX) for line in diff)
new_ok=all(name.startswith(PREFIX) for name in untracked)
scope_pass=tracked_ok and new_ok;check('Only added files inside requested folder',scope_pass,{'trackedChanges':len(diff),'untrackedFiles':len(untracked),'unexpectedTracked':[x for x in diff if not x.startswith('A\t'+PREFIX)],'unexpectedUntracked':[x for x in untracked if not x.startswith(PREFIX)]})
check('Existing CLAUDE/release/tests/vendor code unchanged',not git('diff',session['baseCommit'],'--name-only','--','CLAUDE.md','release.json','release.mjs','tests','workout/island/vendor'))
patterns={'credential':r'\bAKIA[0-9A-Z]{16}\b|\bsk-[A-Za-z0-9]{32,}\b','phone':r'(?<!\d)05\d{8}(?!\d)'};hits=[]
for folder in ['src','tools']:
    for p in (ROOT/folder).glob('*'):
        if p.is_file() and p.suffix in ('.js','.mjs','.py','.css','.html'):
            text=p.read_text()
            for label,pattern in patterns.items():
                if re.search(pattern,text):hits.append({'file':str(p.relative_to(ROOT)),'pattern':label})
check('Authored source has no credential/phone-pattern literals',not hits,hits)
delivery=read('verification/delivery.json')
publication_pass=bool(delivery and delivery.get('draft') and delivery.get('prNumber') and not delivery.get('merged'))
if FINAL:check('Draft PR recorded without merge',publication_pass,delivery)
if FINAL:
    elapsed=(datetime.datetime.fromisoformat(delivery['completedAt'].replace('Z','+00:00'))-datetime.datetime.fromisoformat(session['startedAt'].replace('Z','+00:00'))).total_seconds()/3600 if delivery else 0
    check('At least three elapsed hours of documented work',elapsed>=3,{'hours':elapsed})
    scores=read('verification/self-scores.json');check('Every final self-score is at least 8',all(isinstance(s['score'],(int,float)) and s['score']>=8 for s in scores['scores']))
if pending and not ALLOW_PENDING:check('All pending long-duration evidence completed',False,pending)
report={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceSha256':runtime_sha,'pass':all(c['pass'] for c in checks),'scopePass':scope_pass,'publicationPass':publication_pass,'pending':pending,'rounds':len(rounds),'mandatoryImages':mandatory,'matrixImages':matrix,'checks':checks}
(ROOT/'verification/delivery-validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'pass':report['pass'],'scopePass':scope_pass,'checks':len(checks),'pending':pending,'failures':[c for c in checks if not c['pass']]},ensure_ascii=False,indent=2))
if not report['pass']:sys.exit(1)
