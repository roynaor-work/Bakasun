"""Bind reports and screenshots to the delivered bytes; enforce folder scope."""
import hashlib
import json
import subprocess
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
REPO=ROOT.parents[3]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()

def main():
    manifest=json.loads((ROOT/'manifest.json').read_text())
    assets=json.loads((ROOT/'verification/assets.json').read_text())
    browser=json.loads((ROOT/'verification/browser.json').read_text())
    assert assets['pass'] and browser['pass']
    for a in manifest['assets']:
        p=ROOT/a['path'];assert p.stat().st_size==a['bytes'];assert sha(p)==a['sha256']
        assert browser['sourceSha256'][a['path']]==a['sha256']
        checked=next(x for x in assets['assets'] if x['path']==a['path'])
        assert checked['sha256']==a['sha256']
        assert checked['gltfErrors']==checked['gltfWarnings']==checked['decodedErrors']==checked['decodedWarnings']==0
    for s in manifest['sources']:assert sha(ROOT/s['path'])==s['sha256'],s['path']
    for c in browser['captures']:assert sha(ROOT/c['path'])==c['sha256'],c['path']
    assert len(browser['clips'])==16 and len(browser['layouts'])==2
    assert not browser['errors'] and not browser['externalRequests'] and not browser['failedRequests']
    scope='workout/island/design/soccer-v4/'
    status=subprocess.check_output(['git','-C',str(REPO),'status','--porcelain','--untracked-files=all'],text=True)
    changed=[]
    for line in status.splitlines():
        filename=line[3:]
        assert filename.startswith(scope),f'Change outside requested folder: {line}'
        assert line[:2] in ['??','A ',' A'],f'Existing file changed: {line}'
        changed.append(filename)
    inventory=[{'path':str(p.relative_to(ROOT)),'bytes':p.stat().st_size,'sha256':sha(p)} for p in sorted(ROOT.rglob('*')) if p.is_file() and p.name!='inventory.json']
    result={'pass':True,'scope':scope,'runtimeBytes':manifest['runtimeBytes'],'files':inventory,'trackedChangesOutsideScope':False,'changedFiles':len(changed)}
    (ROOT/'inventory.json').write_text(json.dumps(result,indent=2)+'\n')
    print(f'PASS: {len(inventory)} files, {manifest["runtimeBytes"]} runtime bytes; reports and captures match GLBs; additions only in {scope}')

if __name__=='__main__':main()
