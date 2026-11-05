#!/usr/bin/env python3
"""Check producer-specific canonical audit bindings. No browser/model/source writes.

Default invocation writes verification/package-consistency.json only after all
12 canonical reports pass, are complete for their producer, and bind current
inputs. --check-only never writes. Hashes inside historical witnesses are not
recursively interpreted: only each producer's explicit input/provenance fields
are checked. Run after the final package and canonical reports are frozen.
"""
from pathlib import Path
import argparse,base64,datetime,hashlib,json,re,sys

NAMES=['assets','floor-envelope','boot-bounds','transitions-matrix','skinning','skinning-30hz','locomotion','locomotion-30hz','pitch','equivariance','ui-controls','cpu']
DECLARED={'manifest':'asset-manifest.json','motion':'animations.json','preview':'preview.js','motionRuntime':'source/motion-runtime.js','locomotion':'source/locomotion-space.js','locomotionCurve':'source/locomotion-curve.js','dribble':'source/locomotion-dribble.js','recovery':'source/recovery-state.js','scene':'source/scene.js','props':'source/props.js','palmSupport':'source/palm-support.js','bootBounds':'verification/boot-bounds.json'}
KINDS={'assets':'independent-draco-character-audit','floor-envelope':'canonical18-postIK-full-skinned-mesh-floor-envelope','boot-bounds':'shared-rigid-boot-foot-local-clearance-bounds','transitions-matrix':'actual-bundled-viewer-transition-matrix','skinning':'observed-viewer-full-mesh-skinning-equivalence','skinning-30hz':'observed-viewer-full-mesh-skinning-equivalence','locomotion':'actual-bundled-viewer-locomotion','locomotion-30hz':'actual-bundled-viewer-locomotion','pitch':'actual-bundled-viewer-curved-pitch-contact-audit','equivariance':'actual-bundled-viewer-yaw-equivariance-audit','ui-controls':'real-ui-controls-browser-smoke','cpu':'host-browser-twelve-actor-cpu-render-profile'}
PRODUCERS={'assets':'source/audit.mjs','floor-envelope':'source/floor-envelope.mjs','boot-bounds':'source/boot-bounds.mjs','transitions-matrix':'source/audit-transition-matrix.cjs','skinning':'source/audit-skinning.mjs','skinning-30hz':'source/audit-skinning.mjs','locomotion':'source/audit-locomotion.cjs','locomotion-30hz':'source/audit-locomotion.cjs','pitch':'source/audit-pitch.cjs','equivariance':'source/audit-equivariance.cjs','ui-controls':'source/audit-ui.mjs','cpu':'source/audit-cpu.mjs'}

class BindingError(Exception):pass
class Checker:
 def __init__(self,root):
  self.root=root.resolve();self.cache={};self.bindings={};self.reports=[];self.models={};self.textures={};self.bundle=None;self.checker_sha=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
 def require(self,condition,message):
  if not condition:raise BindingError(message)
 def path(self,file,canonical=False):
  self.require(isinstance(file,str) and file and '://' not in file,'Unknown input path: '+repr(file))
  if file.startswith(str(self.root)+'/'):p=Path(file).resolve()
  elif Path(file).is_absolute():
   # HTTP resource path, not an arbitrary absolute authoring override.
   self.require(file.startswith(('/vendor/','/offline/','/models/','/preview.','/source/','/verification/')),'External/diagnostic input: '+file)
   p=(self.root/file.lstrip('/')).resolve()
  else:p=(self.root/file).resolve()
  allowed=p.is_relative_to(self.root) or canonical and p==(self.root/'../../motion2/soccer.json').resolve()
  self.require(allowed,'Input outside the current package: '+file)
  return p
 def stamp(self,file,canonical=False):
  p=self.path(file,canonical);key=str(p)
  if key not in self.cache:
   self.require(p.is_file(),'Missing current input: '+file);b=p.read_bytes();self.cache[key]={'file':str(p.relative_to(self.root)) if p.is_relative_to(self.root) else '../../motion2/soccer.json','bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
  return self.cache[key]
 def match(self,file,expected,label,canonical=False):
  if isinstance(expected,str):expected={'sha256':expected}
  self.require(isinstance(expected,dict) and re.fullmatch('[a-f0-9]{64}',str(expected.get('sha256',''))) is not None,label+': missing/unknown SHA256 for '+str(file))
  actual=self.stamp(file,canonical);self.require(expected['sha256']==actual['sha256'],label+': stale hash '+str(file))
  if 'bytes' in expected:self.require(expected['bytes']==actual['bytes'],label+': stale byte length '+str(file))
  for name in ['expectedSha256','declaredSha256','actualServedSha256']:
   if name in expected and expected[name] is not None:
    values=expected[name] if isinstance(expected[name],list) else [expected[name]]
    self.require(len(values)==1 and values[0]==actual['sha256'],label+': inconsistent '+name+' '+str(file))
  entry=self.bindings.setdefault(actual['file'],{**actual,'reports':set()});entry['reports'].add(label)
  return actual
 def read(self,file):return json.loads(self.path(file).read_text())
 def source(self,row,label):
  self.require(isinstance(row,dict) and isinstance(row.get('file'),str),label+': missing producer source binding');self.match(row['file'],row,label)
 def stamps(self,rows,label):
  self.require(isinstance(rows,dict) and rows,label+': missing immutable input map')
  for file,row in rows.items():self.match(file,row,label,canonical=(file=='../../motion2/soccer.json'))
 def status(self,r,label,kind=None,complete=True):
  self.require(isinstance(r,dict) and r.get('pass') is True,label+': not PASS')
  if kind:self.require(r.get('kind')==kind,label+': unexpected producer schema '+str(r.get('kind')))
  if complete:self.require(r.get('complete') is True,label+': partial/incomplete')
  for key in ['errors','remoteRequests','changedInputs']:
   if key in r:self.require(isinstance(r[key],list) and not r[key],label+': '+key+' not empty')
  if 'checks' in r:self.require(isinstance(r['checks'],dict) and r['checks'] and all(v is True for v in r['checks'].values()),label+': failed or unknown check value')
  self.require(not r.get('prototype') and not r.get('partialDiagnostic'),label+': diagnostic candidate')
  self.require(not r.get('diagnostic',{}).get('enabled'),label+': diagnostic override')
 def init_package(self):
  manifest=self.read('asset-manifest.json');self.require(len(manifest.get('characters',[]))==8,'Expected eight delivered identities')
  for c in manifest['characters']:
   for kit in c.get('kits',[]):
    for lod in ['lod0','lod1']:
     file=kit[lod];self.require(file==f"models/{c['id']}-{lod}.glb",'Unexpected delivered model path '+file);self.models[file]=kit[lod+'Sha256'];self.match(file,{'sha256':kit[lod+'Sha256'],'bytes':kit[lod+'Bytes']},'current-manifest')
    for file in kit.get('textures',{}).values():self.textures[file]=self.stamp(file)['sha256']
  self.require(len(self.models)==16 and len(self.textures)==24,'Expected16 delivered models/24 maps')
  self.manifest=manifest
  text=self.path('vendor/data.js').read_text();m=re.search(r'globalThis\.SOCCER_V7_DATA\s*=\s*([\s\S]+);\s*$',text);self.require(m is not None,'Current data.js is not JSON-only assignment');self.bundle=json.loads(m.group(1));self.declared(self.bundle.get('hashes'),'current-data')
  self.require(self.bundle.get('manifest')==manifest and self.bundle.get('motion')==self.read('animations.json'),'Current data embeds a stale/different manifest or motion')
  floor=self.read('verification/floor-envelope.json');embedded_floor=self.bundle.get('floor');self.require(isinstance(embedded_floor,dict) and all(embedded_floor.get(key)==floor.get(key) for key in ['pass','complete','motionSha256','runtimeSha256','modelSha256','sampleRateHz','models']),'Current data embeds a missing/incompatible canonical floor envelope; runtime lift arrays and input semantics must match, report timestamps need not')
  boot=self.read('verification/boot-bounds.json');expected_boot={'paddingMeters':boot['paddingMeters'],'modelSha256':{row['file']:row['sha256'] for row in boot['models']},'feet':{name:{'vertices':boot['feet'][name]['supportHull']['vertices']} for name in ['LeftFoot','RightFoot']}}
  self.require(self.bundle.get('bootBounds')==expected_boot,'Current data embeds missing/different support-hull bounds')
  self.require(self.bundle.get('decoderJS')==self.path('vendor/draco_wasm_wrapper.js').read_text(),'Current data embeds a different Draco wrapper');self.require(base64.b64decode(self.bundle.get('decoderWasm',''),validate=True)==self.path('vendor/draco_decoder.wasm').read_bytes(),'Current data embeds different Draco WASM')
  for file,expected in self.models.items():
   script=file.replace('models/','offline/',1).replace('.glb','.js');text=self.path(script).read_text();m=re.search(r'\["([^"\n]+)"\]\s*=\s*"([A-Za-z0-9+/=]+)"',text);self.require(m is not None and m.group(1)==file,'Malformed current offline payload '+script)
   raw=base64.b64decode(m.group(2),validate=True);self.require(hashlib.sha256(raw).hexdigest()==expected,'Current offline GLB differs from manifest '+file);self.match(script,self.stamp(script),'current-offline-payload')
 def declared(self,hashes,label):
  self.require(isinstance(hashes,dict),label+': missing declared package hashes');self.require(set(hashes)==set(DECLARED)|{'models'},label+': missing/unknown crucial declared hash keys '+str(sorted(set(hashes)^ (set(DECLARED)|{'models'}))))
  for key,file in DECLARED.items():self.match(file,hashes[key],label+'/declared')
  self.require(hashes['models']==self.models,label+': declared model inventory/hash mismatch')
 def loaded(self,rows,label,expected=None):
  if isinstance(rows,dict):rows=[{'path':file,**row} for file,row in rows.items()]
  self.require(isinstance(rows,list) and rows,label+': no actual decoded model witnesses');seen=set()
  for row in rows:
   file=row.get('path',row.get('file'));self.require(file in self.models,label+': unknown loaded model '+str(file));self.match(file,row,label+'/decoded');self.require(row['sha256']==self.models[file],label+': decoded model differs from current declared model');seen.add(file)
   if row.get('expectedSha256') is not None:self.require(row['expectedSha256']==self.models[file],label+': loaded expected hash mismatch')
  if expected is not None:self.require(seen==set(expected),label+': wrong decoded model coverage')
  return seen
 def resources(self,rows,label):
  if isinstance(rows,dict):entries=list(rows.items())
  elif isinstance(rows,list):entries=[(row.get('file',row.get('resource',row.get('path'))),row) for row in rows]
  else:raise BindingError(label+': missing actual served-resource schema')
  self.require(entries,label+': empty served resources');seen=set()
  for file,row in entries:
   actual=self.match(file,row,label+'/served');seen.add(actual['file'])
   self.require(not row.get('override'),label+': served override '+str(file))
   if row.get('source'):self.require(self.path(row['source'])==self.path(file),label+': resource source is a diagnostic override '+str(file))
   if 'diskStillMatches' in row:self.require(row['diskStillMatches'] is True,label+': producer recorded changed served resource')
  self.require({'vendor/viewer-runtime.js','vendor/data.js'}<=seen,label+': actual runtime/data resource hashes absent')
 def metadata(self,meta,label):
  self.require(isinstance(meta,dict) and meta.get('diagnosticOverride') is False,label+': missing production session metadata')
  self.require(meta.get('productionSourceFilesPresent') is True and not meta.get('missingProductionSources') and not meta.get('overrides'),label+': missing source or override')
  self.stamps(meta['immutableInputs'],label+'/session-inputs');self.resources(meta['served'],label)
  self.require(not meta.get('errors') and not meta.get('remoteRequests'),label+': session errors/remote requests')
  for field in ['unchanged','servedUnchanged','modelsMatchDisk']:
   self.require(isinstance(meta.get(field),list) and meta[field] and all(row.get('pass') is True for row in meta[field]),label+': stale/incomplete '+field)
  snap=meta.get('packageSnapshot',{});self.require(snap.get('atomicConstruction') is True and isinstance(snap.get('files'),list) and snap['files'],label+': missing atomic package snapshot')
  for row in snap['files']:self.match(row['file'],row,label+'/snapshot')
  integrity=snap.get('modelIntegrity');self.require(isinstance(integrity,list) and len(integrity)==16,label+': wrong package model integrity coverage')
  for row in integrity:
   file=row.get('file');self.require(file in self.models and row.get('pass') is True and all(row.get(k)==self.models[file] for k in ['expected','modelSha256','payloadSha256']),label+': package model/payload integrity mismatch')
  return self.loaded(meta.get('decodedModels'),label)
 def assets(self,r,label):
  self.status(r,label,KINDS[label],False);self.source(r.get('auditSource'),label);self.require(r.get('totals',{}).get('files')==16,label+': partial asset inventory')
  for row in r.get('inputs',{}).values():self.match(row['file'],row,label,canonical=row['file']=='../../motion2/soccer.json')
  self.require({'motion','rig','canonical','manifest','semanticSurfaceHelper'}==set(r.get('inputs',{})),label+': missing crucial producer inputs')
  self.loaded(r.get('assets'),label,self.models);self.require({row['file'] for row in r.get('externalTextureFiles',[])}==set(self.textures),label+': missing external maps')
  for row in r['externalTextureFiles']:self.match(row['file'],row,label+'/texture')
 def floor(self,r,label):
  self.status(r,label,KINDS[label]);self.source(r.get('auditSource'),label);self.match('animations.json',r.get('motionSha256'),label);self.match('source/motion-runtime.js',r.get('runtimeSha256'),label)
  self.require(r.get('modelSha256')==self.models,label+': wrong model hashes');self.loaded(r.get('reports'),label,self.models)
  self.require(r.get('totals',{}).get('models')==16 and r['totals'].get('clips')==31 and r.get('sampleRateHz')==120 and r.get('independentProbeRateHz')==240,label+': partial floor sample coverage')
 def boot(self,r,label):
  self.status(r,label,KINDS[label]);self.source(r.get('source'),label);self.require(set(r.get('inputs',{}))=={'manifest','rig'},label+': missing/unknown producer inputs')
  for row in r['inputs'].values():self.source(row,label)
  self.loaded(r.get('models'),label,self.models)
 def browser(self,r,label,declared_key='declaredPackageHashes',served=True):
  self.status(r,label,KINDS.get(label),complete='complete' in r);self.source(r.get('auditSource'),label);self.declared(r.get(declared_key),label)
  if served:self.resources(r.get('servedResources'),label)
  if 'inputs' in r:self.stamps(r['inputs'],label+'/inputs')
  for field in ['observerSource','palmWitnessSource','palmObserverSource']:
   if field in r:self.source(r[field],label+'/'+field)
  ds=r.get('declaredSourceBindings')
  if ds is not None:
   self.require(ds.get('pass') is True and not ds.get('unknownKeys') and isinstance(ds.get('rows'),list) and len(ds['rows'])==len(DECLARED),label+': invalid/partial declared-source producer verdict')
   self.require({row.get('key') for row in ds['rows']}==set(DECLARED),label+': missing/unknown declared-source rows')
   for row in ds['rows']:
    self.require(row.get('pass') is True and row.get('file')==DECLARED[row['key']],label+': invalid declared-source row');self.match(row['file'],row.get('declaredSha256'),label+'/declared-source-row');self.match(row['file'],row.get('actualSha256'),label+'/measured-source-row')
  elif not label.startswith('skinning'):raise BindingError(label+': current producer declared-source bindings absent')
 def skin(self,r,label):
  self.browser(r,label);self.require(r.get('complete') is True and len(r.get('models',[]))==16 and r.get('totalClipCount')==31 and len(r.get('clipsEvaluated',[]))==31,label+': partial skinning coverage');self.loaded(r['models'],label,self.models)
  self.require(r.get('denseFloor') is True and r.get('denseSampleRateHz')==(30 if label.endswith('30hz') else 120),label+': wrong dense playback rate')
  self.require(set(r.get('currentInputs',{}))==set(DECLARED),label+': missing/unknown current source witnesses')
  for key,row in r['currentInputs'].items():self.require(row.get('file')==DECLARED[key],label+': wrong current source path');self.source(row,label+'/current-inputs')
  if label=='skinning':self.require(r.get('lodLifecycle',{}).get('pass') is True and len(r['lodLifecycle'].get('cases',[]))==192 and len(r.get('coldSeekLifecycle',{}).get('cases',[]))==96,label+': incomplete LOD/cache/cold coverage')
 def transition(self,r,label,expected=None):
  self.browser(r,label);self.require(r.get('kind')=='actual-bundled-viewer-transition-audit' or r.get('kind')=='actual-bundled-viewer-transitions-audit',label+': unexpected transition child schema '+str(r.get('kind')))
  self.require(r.get('auditSource',{}).get('file')=='source/audit-transitions.cjs' and r.get('observerSource',{}).get('file')=='source/audit-action-observer.cjs',label+': wrong transition/observer producer')
  self.require(r.get('complete') is True and len(r.get('results',[]))==66,label+': partial transition child');self.loaded(r.get('loadedModels'),label,[f"models/{r['characterID']}-lod{r['testedLOD']}.glb"])
  if expected:self.require((r['characterID'],r['testedLOD'],r['updateRateHz'])==expected,label+': wrong child selection/rate')
 def matrix(self,r,label):
  self.status(r,label,KINDS[label]);self.source(r.get('auditSource'),label);self.stamps(r.get('inputs'),label+'/snapshot');self.require(not r.get('changedInputs'),label+': changed snapshot')
  self.require({'vendor/viewer-runtime.js','vendor/data.js','source/audit-transition-matrix.cjs','source/audit-transitions.cjs','source/audit-action-observer.cjs',*self.models}<=set(r['inputs']),label+': incomplete crucial snapshot inputs')
  rows=r.get('runs');self.require(isinstance(rows,list) and len(rows)==17,label+': incomplete17 matrix jobs');expected={(file.removeprefix('models/').removesuffix('.glb').rsplit('-lod',1)[0],int(file[-5]),30) for file in self.models};expected.add(('player-01',0,120));seen=set()
  for row in rows:
   selection=(row.get('characterID'),row.get('lod'),row.get('updateRateHz'));seen.add(selection);self.require(row.get('pass') is True and row.get('complete') is True and row.get('exitCode')==0 and row.get('sequences')==66,label+': incomplete/failed child summary')
   file=row.get('reportPackagePath');self.require(isinstance(file,str) and file.startswith('verification/') and file.endswith('.json'),label+': missing/unknown reportPackagePath; do not resolve summary report relative to canonical aggregate')
   self.match(file,row.get('reportSha256'),label+'/child-receipt');child=self.read(file);self.transition(child,label+'/'+file,selection)
   self.source(row.get('auditSource'),label+'/child-summary-auditor');self.source(row.get('observerSource'),label+'/child-summary-observer')
   self.match('vendor/viewer-runtime.js',row.get('runtimeSha256'),label+'/child-runtime');self.match('vendor/data.js',row.get('dataSha256'),label+'/child-data');self.loaded(row.get('models'),label+'/child-summary',[f'models/{selection[0]}-lod{selection[1]}.glb'])
  self.require(seen==expected,label+': wrong matrix model/rate inventory')
 def locomotion(self,r,label):
  self.browser(r,label,'declaredHashes',False);seen=self.metadata(r.get('metadata'),label);expected=f"models/{r.get('characterID')}-lod{r.get('testedLOD')}.glb";active={row.get('path') for row in r.get('state',{}).get('models',[])};self.require(active=={expected} and expected in seen,label+': wrong locomotion active/decoded model')
  self.require(r.get('complete') is True and r.get('hz')==(30 if label.endswith('30hz') else 120) and len(r.get('results',[]))==69,label+': incomplete/wrong-rate locomotion')
 def pitch(self,r,label):
  self.browser(r,label);seen=self.metadata(r.get('provenance'),label);cases=r.get('results',[]);active={actor.get('path') for case in cases for actor in case.get('actors',[])};self.loaded(r.get('loadedModels'),label,active);self.require(r.get('complete') is True and len(active)==6 and all(file.endswith('-lod1.glb') for file in active) and active<=seen and len(cases)==3 and all(len(case.get('actors',[]))==12 for case in cases),label+': incomplete pitch active/session coverage')
 def equivariance(self,r,label):
  self.browser(r,label);self.loaded(r.get('loadedModels'),label,self.models);self.require(r.get('complete') is True and len(r.get('results',[]))==112 and len(r.get('testedModels',[]))==16,label+': incomplete equivariance')
  self.require(r.get('allModels') is True and r.get('coverage',{}).get('models')==16 and r['coverage'].get('posesPerModel')==7 and r['coverage'].get('poseComparisons')==112,label+': wrong equivariance coverage')
  for key in ['modelsMatchDisk','servedResourcesMatchDisk']:self.require(isinstance(r.get(key),list) and r[key] and all(row.get('pass') is True for row in r[key]),label+': stale '+key)
  snap=r.get('packageSnapshot',{});self.require(snap.get('atomicConstruction') is True and len(snap.get('modelIntegrity',[]))==16,label+': missing equivariance RAM integrity');
  for row in snap['modelIntegrity']:
   file=row.get('file');self.require(file in self.models and row.get('pass') is True and all(row.get(k)==self.models[file] for k in ['expected','modelSha256','payloadSha256']),label+': equivariance model integrity mismatch')
 def ui(self,r,label):
  self.status(r,label,KINDS[label]);self.source(r.get('auditSource'),label);required={'preview.html','preview.css','preview.js','vendor/viewer-runtime.js','vendor/data.js'};self.require(set(r.get('inputs',{}))==required,label+': unexpected/missing UI producer input schema');self.stamps(r['inputs'],label+'/inputs')
  expected=['select goalkeeper','scrub actual range to half','toggle play/pause','keyboard orbit and zoom','pointer drag and wheel zoom','advanced lighting LOD wireframe skeleton','landscape layout no horizontal overflow','pitch via actual select','return from pitch and reset'];self.require([step.get('name') for step in r.get('steps',[])]==expected,label+': partial/unknown UI steps')
 def cpu(self,r,label):
  self.status(r,label,KINDS[label],False);self.source(r.get('auditSource'),label);self.require(r.get('stableInputs') is True and r.get('auditSourceStillMatches') is True,label+': unstable profile inputs');self.resources(r.get('servedResources'),label)
  rows=r.get('results');self.require(isinstance(rows,list) and len(rows)==4,label+': incomplete CPU configurations')
  requested=r.get('requested',{});expected={(390,844,1),(390,844,1.5),(844,390,1),(844,390,1.5)};actual={(row.get('configuration',{}).get('width'),row.get('configuration',{}).get('height'),row.get('configuration',{}).get('dpr')) for row in rows};self.require(actual==expected and requested.get('samples',0)>=30 and requested.get('warmup',0)>=5,label+': incomplete CPU requested/configuration schema')
  requested_configs=requested.get('configurations',[]);self.require(len(requested_configs)==4 and {(v.get('width'),v.get('height'),v.get('dpr')) for v in requested_configs}==actual,label+': requested/result configuration mismatch')
  self.require(r.get('physicalDeviceMeasurement') is False and r.get('targetMetOnPhysicalPhone') is None,label+': unknown physical-device claim')
  for row in rows:
   pre=row.get('preflight',{});self.declared(pre.get('packageHashes'),label+'/configuration');loaded=self.loaded(pre.get('models'),label+'/configuration');self.require(len(loaded)==6 and all(file.endswith('-lod1.glb') for file in loaded) and pre.get('actorCount')==12 and pre.get('modelCount')==6 and pre.get('allActorsUseFarLOD') is True and pre.get('floorEnvelopeAvailable') is True,label+': incomplete actual CPU pitch preflight')
  inputs=r.get('verifiedInputs');self.require(isinstance(inputs,list) and inputs,label+': missing verified input schema')
  for row in inputs:self.require(row.get('matches') is True,label+': failed verified input');self.source(row,label+'/verified')
 def run(self):
  # No output is written unless all canonical producers are present and final.
  for name in NAMES:self.require((self.root/'verification'/f'{name}.json').is_file(),'Canonical report not ready: '+name)
  self.init_package()
  for name in NAMES:
   file='verification/'+name+'.json';r=self.read(file)
   source=r.get('source' if name=='boot-bounds' else 'auditSource',{});self.require(source.get('file')==PRODUCERS[name],name+': wrong/missing producer source file')
   if name=='assets':self.assets(r,name)
   elif name=='floor-envelope':self.floor(r,name)
   elif name=='boot-bounds':self.boot(r,name)
   elif name=='transitions-matrix':self.matrix(r,name)
   elif name.startswith('skinning'):self.skin(r,name)
   elif name.startswith('locomotion'):self.locomotion(r,name)
   elif name=='ui-controls':self.ui(r,name)
   else:getattr(self,name.replace('-','_'))(r,name)
   self.reports.append({'file':file,'sha256':self.stamp(file)['sha256'],'pass':True})
  checker_file=Path(__file__).resolve();self.require(checker_file.is_relative_to(self.root),'Run the retained checker inside the package')
  checker_relative=str(checker_file.relative_to(self.root));checker_stamp=self.stamp(checker_relative);self.match(checker_relative,checker_stamp,'consistency-checker')
  for absolute,initial in self.cache.items():
   current=Path(absolute).read_bytes();self.require(len(current)==initial['bytes'] and hashlib.sha256(current).hexdigest()==initial['sha256'],'Input changed during consistency check: '+initial['file'])
  self.require(hashlib.sha256(Path(__file__).read_bytes()).hexdigest()==self.checker_sha,'Consistency checker changed during run')
  return {'schemaVersion':1,'checker':{'file':str(Path(__file__).resolve()),'sha256':self.checker_sha,'scope':'Temporary authoring tool; not a runtime dependency'},'kind':'current-canonical-producer-package-consistency','auditSource':checker_stamp,'generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'complete':True,'pass':True,'method':'Producer-specific explicit input/source/actual served resource/decoded model bindings against current native models and runtime/data. Seventeen child reports resolve from package-root reportPackagePath and their exact receipts. Historical witness hashes are not recursively interpreted.','scope':{'canonicalReports':12,'matrixChildReports':17,'deliveredModels':16,'textureFiles':24,'uiLimit':'UI producer records five stable disk inputs rather than served-response/model hashes; those exact current inputs and globally verified offline payloads are checked without inventing extra UI observations.','notMeasured':'No new geometry, motion, art or phone-performance acceptance is inferred.'},'reports':self.reports,'bindings':[{**row,'reports':sorted(row['reports'])} for row in sorted(self.bindings.values(),key=lambda x:x['file'])],'errors':[]}

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--root',default=str(Path(__file__).resolve().parent.parent));ap.add_argument('--check-only',action='store_true');args=ap.parse_args();checker=Checker(Path(args.root))
 try:
  result=checker.run()
  if not args.check_only:
   output=checker.root/'verification/package-consistency.json';temporary=output.with_suffix('.json.tmp');temporary.write_text(json.dumps(result,indent=2)+'\n');temporary.replace(output)
  print(json.dumps({'pass':True,'complete':True,'canonicalReports':12,'matrixChildren':17,'verifiedFiles':len(checker.bindings),'wroteCanonical':not args.check_only}))
 except (BindingError,KeyError,ValueError,TypeError,OSError) as exc:
  print(json.dumps({'pass':False,'complete':False,'canonicalWritten':False,'reason':str(exc)}));return 1
 return 0
if __name__=='__main__':sys.exit(main())
