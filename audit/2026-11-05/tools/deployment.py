"""Model the checked-in Pages copy/filter rules without changing or copying apps."""
from common import *
from collections import Counter

def main():
    tracked=baseline_files()
    published=[];pruned=[]
    for rel in tracked:
        if not rel:continue
        top=rel.split('/')[0]
        if top not in {'js','css','icons','workout','north'} and rel not in {'index.html','manifest.json','sw.js'}:continue
        excluded=rel.startswith(('workout/docs/','workout/tests/')) or (rel.startswith('workout/island/design/') and 'source' in Path(rel).parts) or Path(rel).suffix in {'.md','.csv','.xlsx','.sql','.bundle'}
        if excluded:pruned.append(rel);continue
        p=ROOT/rel
        if p.is_file():published.append({'path':rel,'bytes':p.stat().st_size})
    artifacts=[r for r in published if any(s in Path(r['path']).parts for s in ['verification','review','tools','sources','tests','previews']) or Path(r['path']).suffix in {'.py','.blend','.ttf'}]
    m=json.loads((ROOT/'workout/island/offline-manifest.json').read_text())
    declared={p for key in ['core','shell'] for p in m[key]}
    declared.update(p for paths in m['games'].values() for p in paths)
    pergame={}
    for game,paths in m['games'].items():
        rows=[{'path':p,'bytes':(ROOT/'workout/island'/p).stat().st_size} for p in set(paths) if (ROOT/'workout/island'/p).is_file()]
        pergame[game]={'files':len(rows),'bytes':sum(r['bytes'] for r in rows)}
    shell=[p for p in set(m['shell']+m['core']) if (ROOT/'workout/island'/p).is_file()]
    published_paths={r['path'] for r in published}
    r={'at':stamp(),'method':'path model of .github/workflows/pages.yml, not an observation of live hosting','publishedFiles':len(published),'publishedBytes':sum(r['bytes'] for r in published),'prunedFiles':len(pruned),
      'nonRuntimeArtifacts':{'files':len(artifacts),'bytes':sum(r['bytes'] for r in artifacts),'largest':sorted(artifacts,key=lambda r:-r['bytes'])[:30]},
      'offline':{'uniqueFiles':len(declared),'bytes':sum((ROOT/'workout/island'/p).stat().st_size for p in declared if (ROOT/'workout/island'/p).is_file()),'shellFiles':len(shell),'shellBytes':sum((ROOT/'workout/island'/p).stat().st_size for p in shell),'games':pergame,
        'missingFromCheckout':[p for p in declared if p and not (ROOT/'workout/island'/p).is_file()], 'missingFromDeployment':[p for p in declared if 'workout/island/'+(p or 'index.html') not in published_paths]}}
    write_json(OUT/'evidence/deployment.json',r);print(json.dumps(r,ensure_ascii=False,indent=2))

if __name__=='__main__':main()
