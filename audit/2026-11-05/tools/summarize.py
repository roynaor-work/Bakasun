"""Save compact provenance; raw TAP stays outside the repository."""
import re,importlib.metadata
from common import *

def tap(path):
    p=Path(path)
    if not p.exists():return {'missing':True}
    s=p.read_text(errors='replace')
    totals={k:int(v) for k,v in re.findall(r'^# (tests|suites|pass|fail|cancelled|skipped|todo) (\d+)$',s,re.M)}
    ms=re.findall(r'^# duration_ms ([\d.]+)',s,re.M)
    selected=[{'status':m.group(1),'name':m.group(2).split(' # SKIP')[0],'skipped':' # SKIP' in m.group(2)} for m in re.finditer(r'^(ok|not ok) \d+ - (.+)$',s,re.M) if 'B3-' in m.group(2) or m.group(1)=='not ok']
    return {'complete':bool(totals),'totals':totals,'durationMs':float(ms[-1]) if ms else None,'B3Skipped':sum(x['skipped'] for x in selected),'selectedTests':selected,
      'skipNames':[m.group(1).split(' # SKIP')[0] for m in re.finditer(r'^ok \d+ - (.+ # SKIP.*)$',s,re.M)]}

def main():
    r={'at':stamp(),'base':'5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275','node':subprocess.check_output(['node','--version'],text=True).strip(),'pythonPlaywright':importlib.metadata.version('playwright'),
      'conditions':'Existing tests unchanged; ISLAND_PLAYWRIGHT adapter only selects system Chromium and blocks external requests. No live payment/database/email action.',
      'unitRuns':[tap('/tmp/bakasun-audit-unit-adapted-'+i+'.tap') for i in ['01','02','03']],
      'csp':tap('/tmp/bakasun-audit-csp.tap'),'offline':tap('/tmp/bakasun-audit-offline-suite.tap'),'offlineAutoRepeat':tap('/tmp/bakasun-audit-offline-auto-repeat.tap'),
      'offlineAutoLaterRepeat':tap('/tmp/bakasun-audit-offline-auto-later-repeat.tap'),
      'offlineCiRuntime':tap('/tmp/bakasun-audit-offline-ci-runtime.tap'),
      'cspCiRuntime':tap('/tmp/bakasun-audit-csp-ci-runtime.tap'),
      'nodePlaywrightVersions':{'default':'1.57.0','ciComparison':'1.62.1','meaning':'CI version comparison uses the pinned driver with the same system Chromium and Node 24, not the complete hosted CI runner.'},
      'soccerBrowser':tap('/tmp/bakasun-audit-soccer-motion2-corrected.tap'),
      'autoDiagnostics':{'oneActivePage':tap('/tmp/bakasun-audit-offline-one-page.tap'),'twoPagesRepeat':tap('/tmp/bakasun-audit-offline-two-pages-repeat.tap'),'meaning':'Diagnostic interventions and repeated original setup are reported separately; closing the saver page is not a fix or passing result for the unchanged original setup.'},
      'defaultRuntimeException':{'focusedFile':'tests/workout-royiki.test.mjs','reason':'Playwright package available but its default browser binary missing; server opened before launch and outside finally; timeout exit 124 after 35 seconds','productFailure':False},
      'githubObserved':{'baseCommitWorkflowRuns':[],'baseCommitStatuses':[],'meaning':'Connector returned empty lists; live CI status and branch protection are not established.'}}
    write_json(OUT/'evidence/verification-summary.json',r)
    p=Path('/tmp/bakasun-audit-csp/csp-negative-fixtures.json')
    if p.exists():
        src=json.loads(p.read_text());results=[]
        for x in src:
            if x['name'].endswith('result'):
                results.append({k:v for k,v in x.items() if k in ['name','phase','loaded','error','metrics','calls','triangles','crowd','crowdLevel','characterVersion','v5','arenaSource','v4Fallbacks','crowd3d']})
        write_json(OUT/'evidence/csp-summary.json',{'at':stamp(),'suite':r['csp']['totals'],'conditions':'Shipped island policy; existing helper additionally attaches it as an HTML response header to tools. Worker fixtures may add their own response policy; see A33. Expected negative-fixture violations are not product violations.','runtimeResults':results})
    print('unit totals',[x['totals'] for x in r['unitRuns']]);print('CSP',r['csp']['totals'],'offline',r['offline']['totals'])

if __name__=='__main__':main()
