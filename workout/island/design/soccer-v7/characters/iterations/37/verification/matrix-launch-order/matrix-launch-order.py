from pathlib import Path
import tempfile, json, hashlib, subprocess, shutil, time, os, signal

base=Path(tempfile.mkdtemp(prefix='soccer-v7-matrix-pool-check-'))
for folder in ['source','vendor','models','offline','verification']: (base/folder).mkdir()
source=Path(__file__).resolve().parents[4]/'source/audit-transition-matrix.cjs'
shutil.copyfile(source,base/'source/audit-transition-matrix.cjs')
ids=[f'player-{i:02d}' for i in range(1,7)]+['goalkeeper','referee']
(base/'asset-manifest.json').write_text(json.dumps({'characters':[{'id':x,'kits':[{'lod0':f'models/{x}-lod0.glb','lod1':f'models/{x}-lod1.glb'}]} for x in ids]}))
for name in ['animations.json','rig.json','motion-manifest.json','verification/boot-bounds.json']: (base/name).write_text('{}')
for name in ['preview.html','preview.css','preview.js','source/motion-runtime.js','source/audit-action-observer.cjs','vendor/viewer-runtime.js','vendor/data.js']: (base/name).write_text('fixture')
for name in ids:
 for lod in [0,1]:
  (base/f'models/{name}-lod{lod}.glb').write_bytes(b'fixture-model')
  (base/f'offline/{name}-lod{lod}.js').write_text('fixture-payload')
(base/'source/audit-transitions.cjs').write_text(r"""
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{spawn}=require('child_process');
const root=path.resolve(__dirname,'..'),args=process.argv,arg=n=>{const x=args.find(x=>x.startsWith(n+'='));return x?x.slice(n.length+1):args[args.indexOf(n)+1];};
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const characterID=arg('--character'),testedLOD=+arg('--lod'),updateRateHz=+arg('--sample-hz'),file=arg('--out'),model='models/'+characterID+'-lod'+testedLOD+'.glb';
const log=type=>fs.appendFileSync(path.join(root,'executed.jsonl'),JSON.stringify({type,pid:process.pid,time:Date.now(),file})+'\n');log('start');
const helper=process.env.FIXTURE_DESCENDANTS==='1'?spawn(process.execPath,['-e','setTimeout(()=>{},20000)'],{stdio:'ignore'}):null;
setTimeout(()=>{const report={pass:true,complete:true,observerSource:{file:'source/audit-action-observer.cjs',sha256:sha(path.join(root,'source/audit-action-observer.cjs'))},checks:{fixture:true},characterID,testedLOD,updateRateHz,auditSource:{file:'source/audit-transitions.cjs',sha256:sha(__filename)},servedResources:{'vendor/viewer-runtime.js':{sha256:sha(path.join(root,'vendor/viewer-runtime.js'))},'vendor/data.js':{sha256:sha(path.join(root,'vendor/data.js'))}},loadedModels:[{path:model,sha256:sha(path.join(root,model))}],results:Array.from({length:66},()=>({sampleCount:1,minVertexY:.002,boundaries:[],supportCoverage:{},maxPlantAnchorDistanceMeters:0,maximumLandingProjectionMeters:0,maximumRecoveryLifetimeSeconds:0,maximumLandingReleaseSoleStepMeters:0,maxSettledAuthoredHandSupportResidualMeters:0}))};fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(report));log('finish');if(helper)helper.kill('SIGTERM');},Number(process.env.FIXTURE_DELAY||100));
""")
matrix=base/'source/audit-transition-matrix.cjs'
checks={}; evidence={}; owned=[]
def journal_path(out): return Path('/tmp')/('soccer-v7-transition-matrix-'+hashlib.sha256(str(out).encode()).hexdigest()[:16]+'.json')
def identity(pid):
 try:
  stat=Path(f'/proc/{pid}/stat').read_text();parts=stat[stat.rfind(') ')+2:].split();return {'pid':pid,'startedTicks':parts[19],'state':parts[0]}
 except FileNotFoundError: return None
def alive(item):
 current=identity(item['pid']) if item else None
 return current and current['startedTicks']==item['startedTicks'] and current['state'] not in ['Z','X']
def command(out,workers=2):
 result=['node',str(matrix),'--out',str(out)]
 if workers is not None: result+=['--workers',str(workers)]
 return result
def begin(out,delay=1000,desc=False,workers=2):
 log=(base/(out.name+'.log')).open('w');env=os.environ|{'FIXTURE_DELAY':str(delay),'FIXTURE_DESCENDANTS':'1' if desc else '0'}
 child=subprocess.Popen(command(out,workers),stdout=log,stderr=subprocess.STDOUT,env=env);owned.append(child);return child
def run(out,workers=2,delay=80): return subprocess.run(command(out,workers),capture_output=True,text=True,timeout=30,env=os.environ|{'FIXTURE_DELAY':str(delay),'FIXTURE_DESCENDANTS':'0'})
def read(out): return json.loads(journal_path(out).read_text())
def wait_active(out,desc=False):
 for _ in range(200):
  try:
   state=read(out);jobs=list(state.get('activeJobs',{}).values())
   if len(jobs)==2 and all(x.get('child') for x in jobs) and (not desc or all(len(x.get('ownedProcesses',[]))>=2 for x in jobs)): return state
  except FileNotFoundError: pass
  time.sleep(.025)
 raise RuntimeError('Two active workers were not observed')
def starts(): return sum(json.loads(line)['type']=='start' for line in (base/'executed.jsonl').read_text().splitlines())

try:
 out=base/'two-workers';p=begin(out,delay=700);active=wait_active(out)
 checks['twoWorkersActuallyOverlap']=len({x['child']['pid'] for x in active['activeJobs'].values()})==2
 duplicate=run(out);checks['oneKernelOwnerExcludesDuplicate']=duplicate.returncode==75
 sequences=[];valid_json=True
 while p.poll() is None:
  try: sequences.append(read(out)['writeSequence'])
  except json.JSONDecodeError: valid_json=False
  time.sleep(.025)
 state=read(out);aggregate=json.loads((out/'transitions-matrix.json').read_text());events=[json.loads(line) for line in (base/'executed.jsonl').read_text().splitlines() if str(out)+'/' in json.loads(line)['file']];active_count=0;peak=0
 for event in events:
  active_count+=1 if event['type']=='start' else -1;peak=max(peak,active_count)
 checks['twoWorkersActuallyOverlap']=checks['twoWorkersActuallyOverlap'] and peak==2
 checks['serializedAtomicJournalIntegrity']=valid_json and sequences==sorted(sequences) and state['maximumConcurrentWorkersObserved']==2 and len(state['completed'])==17 and len({x['file'] for x in state['completed']})==17 and state['activeJobs']=={}
 dispatch=[int(line.split('/17')[0].split('Starting ')[1]) for line in (base/(out.name+'.log')).read_text().splitlines() if line.startswith('Starting ')]
 checks['dense120JobLaunchesFirst']=dispatch[0]==17
 checks['equalHzDispatchRetainsOriginalJobOrder']=dispatch[1:]==list(range(1,17))
 checks['allSeventeenAggregateSemantics']=p.returncode==0 and aggregate['pass'] and len(aggregate['runs'])==17 and [x['report'] for x in aggregate['runs']]==[f'transitions/{x}-lod{lod}-30hz.json' for x in ids for lod in [0,1]]+['transitions-120hz.json']
 count=starts();state['completed'].pop();state['status']='interrupted-or-failed';state['activeJobs']={};journal_path(out).write_text(json.dumps(state));resumed=run(out)
 checks['exactPartialResumeRunsOnlyMissingJob']=resumed.returncode==0 and starts()==count+1 and len(read(out)['completed'])==17
 report=Path(read(out)['completed'][0]['reportPath']);saved=report.read_bytes();report.write_bytes(saved+b' ');rejected=run(out);report.write_bytes(saved)
 checks['changedReportBytesRejected']=rejected.returncode!=0 and 'Completed report no longer matches' in rejected.stderr and starts()==count+1
 runtime=base/'vendor/viewer-runtime.js';saved_runtime=runtime.read_bytes();runtime.write_bytes(saved_runtime+b' changed');rejected=run(out);runtime.write_bytes(saved_runtime)
 checks['changedInputSnapshotRejected']=rejected.returncode!=0 and 'Input snapshot changed' in rejected.stderr and starts()==count+1
 holder=subprocess.Popen(['node','-e','setTimeout(()=>{},20000)'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);owned.append(holder);saved_journal=journal_path(out).read_bytes();state=read(out);state['activeJobs']={'2':{'child':identity(holder.pid),'ownedProcesses':[identity(holder.pid)]}};journal_path(out).write_text(json.dumps(state));rejected=run(out);holder.terminate();holder.wait(timeout=5);journal_path(out).write_bytes(saved_journal)
 checks['liveOrphanWorkerRejected']=rejected.returncode!=0 and 'An owned matrix job is still live' in rejected.stderr
 default=base/'default-one';p=begin(default,delay=20,workers=None);p.wait(timeout=20);state=read(default)
 checks['defaultRemainsOneWorker']=p.returncode==0 and state['workerCount']==1 and state['maximumConcurrentWorkersObserved']==1
 for mode in ['input-change','signal']:
  out=base/mode;p=begin(out,delay=3000,desc=True);state=wait_active(out,desc=True);identities=[i for x in state['activeJobs'].values() for i in [x['child'],*x['ownedProcesses']]]
  unrelated=subprocess.Popen(['node','-e','setTimeout(()=>{},20000)'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);owned.append(unrelated);unrelated_identity=identity(unrelated.pid)
  if mode=='input-change': runtime.write_bytes(saved_runtime+b' changed during execution')
  else: os.kill(state['owner']['pid'],signal.SIGTERM)
  p.wait(timeout=12);state=read(out);runtime.write_bytes(saved_runtime)
  checks[mode+'AbortsOwnedWorkersOnly']=p.returncode!=0 and state['status']=='interrupted-or-failed' and not state.get('cleanup',{}).get('stillLive',[{}]) and not any(alive(i) for i in identities) and alive(unrelated_identity) and not (out/'transitions-matrix.json').exists()
  evidence[mode]={'returnCode':p.returncode,'journalPath':str(journal_path(out)),'cleanup':state.get('cleanup'),'unrelatedStayedAlive':bool(alive(unrelated_identity))}
  unrelated.terminate();unrelated.wait(timeout=5)
 result={'kind':'controlled-matrix-pool-fixtures-not-character-validation','matrixSourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'fixtureRoot':str(base),'checks':checks,'pass':all(checks.values()),'evidence':evidence}
 (Path(__file__).resolve().parent/'matrix-launch-order.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
 if not result['pass']: raise SystemExit(1)
finally:
 for journal_file in Path('/tmp').glob('soccer-v7-transition-matrix-*.json'):
  try:
   state=json.loads(journal_file.read_text())
   if str(state.get('outputDirectory','')).startswith(str(base)+'/') and alive(state.get('owner')): os.kill(state['owner']['pid'],signal.SIGTERM)
  except (FileNotFoundError,ProcessLookupError,json.JSONDecodeError): pass
 for child in owned:
  if child.poll() is None:
   child.terminate()
   try: child.wait(timeout=3)
   except subprocess.TimeoutExpired: child.kill()
