"""Create delivery weights and checksums after all evidence writers have finished."""
import hashlib
from collections import Counter
from common import *

def main():
    soak=json.loads((OUT/'evidence/soak.json').read_text())
    if not soak.get('finished'):raise RuntimeError('The two-hour evidence writer is still running; do not package intermediate files.')
    reserved={'DELIVERY.json','FILE-WEIGHTS.md','SHA256SUMS'}
    files=[p for p in OUT.rglob('*') if p.is_file() and '__pycache__' not in p.parts and str(p.relative_to(OUT)) not in reserved]
    rows=sorted([{'path':str(p.relative_to(OUT)),'bytes':p.stat().st_size} for p in files],key=lambda x:(-x['bytes'],x['path']))
    findings=json.loads((OUT/'findings.json').read_text());tests=json.loads((OUT/'evidence/verification-summary.json').read_text())
    r={'packagedAt':stamp(),'base':BASE,'branch':'codex/audit-2026-11-05-20261105','targetRepository':'roynaor-work/Bakasun','requestedPullRequest':'draft against main; do not merge','scope':'new files under audit/2026-11-05/ only; product and existing tests unchanged','findingCount':len(findings),'priorities':dict(Counter('P'+str(x['priority']) for x in findings)),'payloadFiles':len(rows),'payloadBytes':sum(x['bytes'] for x in rows),'payloadMB':sum(x['bytes'] for x in rows)/1e6,'weightExclusions':sorted(reserved)+['__pycache__/'],'largestFiles':rows[:12],'screenshots':sum(p.suffix=='.jpg' for p in files),'iterations':sorted(p.name for p in (OUT/'iterations').iterdir() if p.is_dir() and (p/'CRITIQUE.md').exists()),'soak':{'started':soak['started'],'finished':soak['finished'],'elapsedSeconds':soak['elapsedSeconds'],'samples':len(soak['samples']),'segments':len(soak['segments'])},'unitTotalsPerRun':[x['totals'] for x in tests['unitRuns']],'limits':['No physical phone GPU/30fps certification.','file:// is blocked by managed Chromium policy; local-file response fulfilment with offline=true passed, direct file:// outside this environment unverified.','Original offline automatic-download test had failing runs; later diagnostic and repeated outcomes are all retained.','No live database, Storage, payment, message or production deployment was changed.'],'entrypoints':{'review':'index.html','report':'REPORT.md','weights':'WEIGHTS.md','textures':'TEXTURES.md','fileWeights':'FILE-WEIGHTS.md'}}
    write_json(OUT/'DELIVERY.json',r)
    lines=['# משקלי קובצי המסירה','','MB עשרוניים. אלה קובצי ביקורת חדשים, לא נכסי runtime חדשים. משולשים ו־GLB במוצר המקורי מפורטים ב־WEIGHTS.md. הרשימה אינה כוללת את שלושת קובצי המטא הנוצרים בשלב האריזה, או bytecode זמני. SHA256SUMS כולל גם DELIVERY.json ו־FILE-WEIGHTS.md, ואינו כולל את עצמו.','',f'{len(rows)} קובצי payload, {r["payloadBytes"]:,} bytes ({r["payloadMB"]:.3f}MB).','','| קובץ חדש | bytes | MB |','|---|---:|---:|']
    lines += [f'| `{x["path"]}` | {x["bytes"]} | {x["bytes"]/1e6:.6f} |' for x in rows]
    (OUT/'FILE-WEIGHTS.md').write_text('\n'.join(lines)+'\n')
    checksum_files=sorted(files+[OUT/'DELIVERY.json',OUT/'FILE-WEIGHTS.md'])
    (OUT/'SHA256SUMS').write_text(''.join(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+str(p.relative_to(OUT))+'\n' for p in checksum_files))
    print(json.dumps({'payloadFiles':len(rows),'payloadMB':r['payloadMB'],'largest':rows[:5]},ensure_ascii=False))

if __name__=='__main__':main()
