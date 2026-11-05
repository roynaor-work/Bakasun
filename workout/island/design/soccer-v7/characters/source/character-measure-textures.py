#!/usr/bin/env python3
"""Measure current atlas encoding without changing delivered assets.

Run through the same Blender Python as character_build.py. Add -- --write to
replace the checked-in measurement JSON only after every comparison passes.
All candidate images and pre-encoding captures remain in a fresh /tmp folder.
"""
from pathlib import Path
import ast,datetime,hashlib,importlib.util,json,math,os,sys,tempfile
sys.dont_write_bytecode=True
import numpy as np
import PIL
from PIL import Image,features
PACKAGE=Path(__file__).resolve().parents[1]
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else sys.argv[1:]
WRITE_REPORT='--write' in args
SOURCE=PACKAGE/'source'
TEMP=Path(tempfile.mkdtemp(prefix='soccer-v7-texture-measure-',dir='/tmp'))
manifest=json.loads((PACKAGE/'asset-manifest.json').read_text())
# Follow the delivered atlas branches rather than the caller's shell.
recipe=manifest.get('authoring',{})
for field,env_name in {
 'faceVariant':'SOCCER_CHARACTER_FACE_VARIANT',
 'hairTextureVariant':'SOCCER_CHARACTER_HAIR_TEXTURE_VARIANT',
 'clothVariant':'SOCCER_CHARACTER_CLOTH_VARIANT',
 'eyeVariant':'SOCCER_CHARACTER_EYE_VARIANT',
}.items():
 if field in recipe:os.environ[env_name]=str(recipe[field])
sys.path.insert(0,str(SOURCE))
spec=importlib.util.spec_from_file_location('final_v7_atlas',SOURCE/'character_atlas.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
source_hash=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
source_names=['character_atlas.py','character_groom_atlas.py','character_build.py','character_hair.py','character_normal_field.py','character_cloth17.py','character_eye19.py','character_sock21.py','character_seams.py','character_face_helper.py','character_fetch_skin.py','character_face27.py','character_hair29.py','character_hair31.py','character_hair_shape31.py','character_farcap32.py','character_cloth_finish.py','character-measure-textures.py']
source_before={str(p):source_hash(SOURCE/p) for p in source_names}
people_node=next(n for n in ast.parse((SOURCE/'character_build.py').read_text()).body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='PEOPLE' for t in n.targets))
scope={};exec(compile(ast.Module(body=[people_node],type_ignores=[]),str(SOURCE/'character_build.py'),'exec'),scope)
people=scope['PEOPLE']
expected={person['id']:person['kits'][0]['textures'] for person in manifest['characters']}
actual_before={str(p):source_hash(PACKAGE/p) for row in expected.values() for p in row.values()}
skin_inputs=m.skin_source_info()
m.ROOT=TEMP;m.TEXTURES=TEMP/'textures';m.TEXTURES.mkdir(exist_ok=True)
original_save=Image.Image.save;original_quantize=Image.Image.quantize;original_unique=np.unique
active={};records=[]

def palette_metrics(before,after):
 a=np.asarray(before,dtype=np.float64);b=np.asarray(after,dtype=np.float64)
 same=(a==b).all(2)
 u=a/127.5-1;v=b/127.5-1
 u/=np.maximum(np.linalg.norm(u,axis=2,keepdims=True),1e-12);v/=np.maximum(np.linalg.norm(v,axis=2,keepdims=True),1e-12)
 ang=np.degrees(np.arccos(np.clip((u*v).sum(2),-1,1)));ang[same]=0
 result={'identicalPixelFraction':float(same.mean()),'meanAngularErrorDegrees':float(ang.mean()),'p99AngularErrorDegrees':float(np.quantile(ang,.99)),'maximumAngularErrorDegrees':float(ang.max()),'patches':{}}
 for kind in ['face','shirt','hair','wisps','scalp']:
  x0,y0,x1,y1=m._box(kind);z=ang[y0:y1,x0:x1]
  result['patches'][kind]={'meanAngularErrorDegrees':float(z.mean()),'p99AngularErrorDegrees':float(np.quantile(z,.99)),'maximumAngularErrorDegrees':float(z.max())}
 return result

def quantize(self,*args,**kwargs):
 result=original_quantize(self,*args,**kwargs)
 if self.mode=='RGB' and kwargs.get('method')==Image.Quantize.MEDIANCUT:
  active['normalPalette']=palette_metrics(self,result.convert('RGB'))
  original_save(self,TEMP/(active['id']+'-normal-before-palette.png'),format='PNG',optimize=True)
 return result

def unique(a,*args,**kwargs):
 if kwargs.get('return_inverse') and getattr(a,'shape',None)==(1024*1024,3):
  active['ormBeforePalette']=np.array(a).reshape(1024,1024,3)
 return original_unique(a,*args,**kwargs)

def save(self,fp,*args,**kwargs):
 path=Path(fp) if isinstance(fp,(str,Path)) else None
 format_name=str(kwargs.get('format','')).upper()
 if path and (format_name=='WEBP' or path.suffix.lower()=='.webp'):
  reference=np.array(self.convert('RGBA'))
  original_save(self,TEMP/(active['id']+'-basecolor-before-webp.png'),format='PNG',optimize=True)
  result=original_save(self,fp,*args,**kwargs)
  decoded=np.array(Image.open(path).convert('RGBA'))
  x0,y0,x1,y1=m._box('face');delta=reference[y0:y1,x0:x1,:3].astype(float)-decoded[y0:y1,x0:x1,:3].astype(float)
  mse=float(np.mean(delta*delta))
  active['basecolorWebP']={'facePatchImageBounds':[x0,y0,x1,y1],'faceRGBMeanAbsoluteError':float(np.abs(delta).mean()),'faceRGBMSE':mse,'facePSNRdB':None if mse==0 else float(10*math.log10(255**2/mse)),'alphaExact':bool(np.array_equal(reference[...,3],decoded[...,3])),'webpQuality':kwargs.get('quality'),'webpMethod':kwargs.get('method'),'alphaQuality':kwargs.get('alpha_quality'),'exactFlag':kwargs.get('exact')}
  return result
 if path and path.name.endswith('-orm.png'):
  active['ormPaletteExact']=bool(np.array_equal(active['ormBeforePalette'],np.array(self.convert('RGB'))))
 return original_save(self,fp,*args,**kwargs)

Image.Image.save=save;Image.Image.quantize=quantize;np.unique=unique
try:
 for person in people:
  active={'id':person['id']}
  kit=('kit-a' if int(person['id'][-2:])<=3 else 'kit-b') if person['role']=='field' else ('keeper' if person['role']=='goalkeeper' else 'referee')
  paths=m.atlas(person,kit)
  comparisons=[]
  for channel,relative in paths.items():
   generated=TEMP/relative;actual=PACKAGE/expected[person['id']][channel]
   generated_rgb=np.array(Image.open(generated).convert('RGBA'));actual_rgb=np.array(Image.open(actual).convert('RGBA'))
   comparisons.append({'channel':channel,'actualFile':expected[person['id']][channel],'bytes':actual.stat().st_size,'sha256':source_hash(actual),'regeneratedSha256':source_hash(generated),'encodedBytesIdentical':generated.read_bytes()==actual.read_bytes(),'decodedRGBAIdentical':bool(np.array_equal(generated_rgb,actual_rgb)),'dimensions':list(Image.open(actual).size)})
  active.pop('ormBeforePalette',None);active['actualTextureComparison']=comparisons
  active['pass']=active['basecolorWebP']['alphaExact'] and active['ormPaletteExact'] and all(x['decodedRGBAIdentical'] and x['encodedBytesIdentical'] for x in comparisons)
  records.append(active)
  TEMP.joinpath('records-checkpoint.json').write_text(json.dumps(records,indent=2,allow_nan=False)+'\n')
  print(person['id'],'PSNR',round(active['basecolorWebP']['facePSNRdB'],3),'alpha',active['basecolorWebP']['alphaExact'],'sameActual',active['pass'],flush=True)
finally:
 Image.Image.save=original_save;Image.Image.quantize=original_quantize;np.unique=original_unique
source_after={str(p):source_hash(SOURCE/p) for p in source_names}
actual_after={str(p):source_hash(PACKAGE/p) for row in expected.values() for p in row.values()}
report={'schemaVersion':2,'kind':'current-delivery-texture-codec-measurement','generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'method':'Regenerated all eight atlas sets into /tmp using current authoring sources and original skin cache. Intercepted the exact pre-WebP RGBA image and pre-palette normal/ORM inputs in memory; source assets, actual textures and models were not written. Compared generated images with current delivered textures.','sourceScope':'Current source and actual delivered texture SHA256 identify scope; this report does not reuse earlier round10 candidate measurements.','software':{'python':sys.version.split()[0],'pillow':PIL.__version__,'numpy':np.__version__,'webp':features.version('webp')},'sourceSHA256':source_before,'skinInputs':skin_inputs,'measurementStart':'basecolor after authoring color quantization, before WebP; normal after authored 8bit quantization, before 256-color palette; ORM before exact palette conversion','limitations':['PSNR/MAE measure WebP encoding of the atlas face rectangle, not photorealism or reference-game likeness.','Normal angular error isolates PNG palette quantization; it does not assess the realism of authored surface normals.','DecodedRGBA comparison binds these measurements to actual current image files. A later texture/source edit invalidates that scope.'],'actualSourcesAndTexturesUnchanged':source_before==source_after and actual_before==actual_after,'summary':{'characters':len(records),'alphaExactAll':all(r['basecolorWebP']['alphaExact'] for r in records),'ormPaletteExactAll':all(r['ormPaletteExact'] for r in records),'allActualImagesDecodedIdentically':all(all(x['decodedRGBAIdentical'] for x in r['actualTextureComparison']) for r in records),'allActualEncodedFilesIdentical':all(all(x['encodedBytesIdentical'] for x in r['actualTextureComparison']) for r in records),'minimumFacePSNRdB':min(r['basecolorWebP']['facePSNRdB'] for r in records),'maximumFaceRGBMAE':max(r['basecolorWebP']['faceRGBMeanAbsoluteError'] for r in records),'maximumMeanNormalPaletteAngularDegrees':max(r['normalPalette']['meanAngularErrorDegrees'] for r in records)},'characters':records,'pass':all(r['pass'] for r in records) and source_before==source_after and actual_before==actual_after}
report['sourceSHA256']={str(Path(k).name):v for k,v in report['sourceSHA256'].items()}
report['authoringRecipe']=recipe
TEMP.joinpath('metrics.json').write_text(json.dumps(report,indent=2,allow_nan=False)+'\n')
print('Temporary measurement directory',str(TEMP),flush=True)
if report['pass'] and WRITE_REPORT:
 SOURCE.joinpath('character-texture-quality.json').write_text(json.dumps(report,indent=2,allow_nan=False)+'\n')
 print('WROTE source/character-texture-quality.json',json.dumps(report['summary']),flush=True)
elif not report['pass']:
 print('SCOPE MISMATCH: report only in /tmp; existing source report untouched',json.dumps(report['summary']),flush=True)

else:
 print('PASS; add -- --write to update source/character-texture-quality.json',flush=True)
