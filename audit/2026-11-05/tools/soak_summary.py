"""Summarize completed segments; compare the same route after GC within each context."""
from common import *
def main():
    d=json.loads((OUT/'evidence/soak.json').read_text())
    if not d.get('finished'):raise RuntimeError('Soak is still running; no completion summary yet.')
    cycles={'bakasun':5,'workout':4,'north':3,'island':1};rows=[]
    for segment in d['segments']:
        samples=[s for s in d['samples'] if s['segment']==segment['index']];same=[s for s in samples if s.get('step',0)%cycles[segment['app']]==0 and s.get('metrics')]
        start=datetime.datetime.fromisoformat(segment['started']);end=datetime.datetime.fromisoformat(segment['finished'])
        row={'segment':segment['index'],'app':segment['app'],'activeSeconds':round((end-start).total_seconds(),2),'samples':len(samples),'errors':sum(len(x.get('newErrors',[])) for x in samples),'harnessErrors':sum('harnessError' in x for x in samples)}
        if same:
            first,last=same[0],same[-1];row['sameRouteComparison']={'firstStep':first['step'],'lastStep':last['step'],'firstHeapBytes':first['metrics']['JSHeapUsedSize'],'lastHeapBytes':last['metrics']['JSHeapUsedSize'],'firstListeners':first['metrics']['JSEventListeners'],'lastListeners':last['metrics']['JSEventListeners'],'firstNodes':first['metrics']['Nodes'],'lastNodes':last['metrics']['Nodes']}
        rows.append(row)
    out={'at':stamp(),'started':d['started'],'finished':d['finished'],'elapsedSeconds':d['elapsedSeconds'],'samples':len(d['samples']),'reportedJavaScriptErrors':sum(x['errors'] for x in rows),'harnessErrors':sum(x['harnessErrors'] for x in rows),'segments':rows,'conditions':'Fresh context per segment, GC before CDP samples, first/last comparison on the same route. Overall elapsed includes startup; the final segment can be shorter. No GPU memory, physical phone FPS or proof against silent rendering stalls.'}
    write_json(OUT/'evidence/soak-summary.json',out);print(json.dumps({k:v for k,v in out.items() if k!='segments'},ensure_ascii=False))
if __name__=='__main__':main()
