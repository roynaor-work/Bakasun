"""Prove that the burn-in candidate differs only in one camera-height line.

This reconstructs the entire old HTML and verifies its captured SHA-256. It does
not accept an arbitrary changed module or silently relabel the burn-in source.
"""
from pathlib import Path
import zipfile,json,re,hashlib,datetime
ROOT=Path(__file__).resolve().parents[1]
old_capture=json.loads((ROOT/'iterations/09/capture.json').read_text())
with zipfile.ZipFile(ROOT/'iterations/09/source.zip') as z:old_app=z.read('rendered/app.js').decode()
current=(ROOT/'index.html').read_text()
m=re.search(r'<script type="module">(.*?)</script>\s*</body>',current,re.S);new_app=m.group(1)
old_line='  target.set(0,CONFIG[state.ship].deck+3,0);'
new_line='  target.set(0,CONFIG[state.ship].deck+(camera.aspect>1?1.5:3),0);'
one_line=old_app.count(old_line)==1 and old_app.replace(old_line,new_line,1)==new_app
restored=current[:m.start(1)]+old_app+current[m.end(1):]
reconstructed_sha=hashlib.sha256(restored.encode()).hexdigest()
report={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'pass':one_line and reconstructed_sha==old_capture['sourceSha256'],
 'burnInSourceSha256':old_capture['sourceSha256'],'finalSourceSha256':hashlib.sha256(current.encode()).hexdigest(),
 'reconstructedWholeHtmlSha256':reconstructed_sha,'exactlyOneCameraLineChanged':one_line,
 'oldLine':old_line.strip(),'newLine':new_line.strip(),
 'scope':'Only the near landscape camera target height changed. Every other byte of the HTML, modules and embedded binary assets reconstructs to the burn-in candidate hash.',
 'finalSourceChecks':'Fresh final-source renders, all-type orientation matrix, context recovery, 15-minute cold reload cycles and functional browser checks are required separately.'}
(ROOT/'verification/soak-compatibility.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
if not report['pass']:raise SystemExit(1)
