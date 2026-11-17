"""Prove that this branch only adds files below the user-authorized folder."""
from pathlib import Path
import subprocess,json,sys
ROOT=Path(__file__).resolve().parents[1]
REPO=ROOT.parents[3]
PREFIX='workout/island/design/naval-sea-v2/'
BASE=json.loads((ROOT/'manifest.json').read_text())['baseCommit']
def git(*args):return subprocess.check_output(['git',*args],cwd=REPO,text=True).strip()
tracked=git('diff','--name-status',BASE)
changes=[dict(status=line.split('\t')[0],path=line.split('\t')[-1]) for line in tracked.splitlines()]
untracked=git('ls-files','--others','--exclude-standard')
changes.extend(dict(status='A',path=p) for p in untracked.splitlines())
changes.sort(key=lambda change:change['path'])
violations=[x for x in changes if x['status']!='A' or not x['path'].startswith(PREFIX)]
report=dict(passed=not violations,branch=git('branch','--show-current'),baseCommit=BASE,newFiles=len(changes),violations=violations,changes=changes)
(ROOT/'verification/scope-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k!='changes'},indent=2))
sys.exit(0 if report['passed'] else 1)
