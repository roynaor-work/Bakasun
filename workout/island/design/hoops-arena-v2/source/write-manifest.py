"""Write an auditable delivery inventory after all generation/checks finish.
This manifest hashes every delivered file except itself (no circular hashes).
"""
import hashlib
import json
from pathlib import Path
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
geo=json.loads((ROOT/'verification/geometry.json').read_text())
files=[]
for file in sorted(ROOT.rglob('*')):
    if not file.is_file() or file.name=='manifest.json':continue
    assert not file.is_symlink()
    data=file.read_bytes()
    entry={'path':file.relative_to(ROOT).as_posix(),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
    if file.suffix.lower() in ('.jpg','.png'):
        with Image.open(file) as im:entry.update(width=im.width,height=im.height)
    files.append(entry)

manifest={
    'id':'hoops-arena-v2','version':'2.0.0','date':'2026-11-17',
    'repository':'roynaor-work/Bakasun','branch':'codex/hoops-arena-v2',
    'baseCommit':'43b27dc235387e3cb737aee9558cdf9d5fd5a262',
    'scope':'workout/island/design/hoops-arena-v2/','entrypoint':'preview.html',
    'preview':{'viewport':[844,390],'alsoChecked':[390,844],
        'cameraViews':['broadcast','court','hoop','ceiling'],'offlineAssets':True,
        'runtimeModule':'arena.mjs','renderOnDemand':True,'runtimeExternalRequests':0},
    'coordinates':geo['coordinates'],
    'dimensions':{'courtMetres':[28,15],'rimHeightMetres':3.05,'rimInnerDiameterMetres':.45,
        'backboardMetres':[1.8,1.05],'woodRepeatMetres':[4,4]},
    'anchors':{'arenaOrigin':[0,0,0],'eastRim':[12.425,3.05,0],'westRim':[-12.425,3.05,0],
        'hoopAssetOrigin':'floor beneath ring centre','hoopAssetRim':[0,3.05,0],
        'hoopAssetSupportDirection':'+X'},
    'components':{'tiers':3,'rowsPerTier':3,'standSides':4,'seats':geo['seats'],
        'hoops':2,'luminaireBars':20,'playerEntrances':2,'teamBenches':2,'teamBenchSeatsEach':10,
        'scorersTable':1,'adText':False,'brands':False,'fullRoofInAsset':True},
    'models':geo['models'],
    'format':{'container':'GLB','gltfVersion':'2.0','arenaExtensions':['KHR_mesh_quantization'],
        'hoopExtensions':[],'embeddedImages':True,'decoderRequired':False,
        'quantization':{'positionBits':16,'normalBits':12,'sceneComponentsRemoved':0}},
    'materials':{'textures':[
        {'path':'textures/maple-albedo.jpg','channels':'RGB, sRGB base colour'},
        {'path':'textures/maple-normal.png','channels':'RGB, linear tangent normal, OpenGL convention'},
        {'path':'textures/maple-orm.png','channels':'R occlusion=1, G roughness, B metallic=0, linear'}],
        'tangentSpace':'explicit floor tangent: +X, handedness -1',
        'previewReflection':{'planar':True,'opacity':.045,'blurred':True,'renderTarget':[768,384]},
        'lightingRecipe':'preview.mjs','unbranded':True},
    'runtime':{'threeVersion':'0.160.1','sharedSeatMeshes':True,'previewGpuInstances':True,
        'staticTerracesMergedBySideAndMaterial':True,'cutawayAffectsSavedAsset':False,
        'requiresHostLighting':True,'physicalPhoneBenchmark':False},
    'budgets':{'packageLimitBytes':6_000_000,'modelLimitBytes':2_000_000,'tileLimitBytes':200_000,
        'packageBytes':0,'largestTileBytes':max(f['bytes'] for f in files if f['path'].startswith('textures/'))},
    'validation':{'khronos':{'errors':0,'warnings':0,'infos':0,'hints':0},
        'reports':['verification/arena-khronos.json','verification/hoop-khronos.json','verification/assets.json',
            'verification/browser.json','verification/repository-tests.json','verification/scope.json']},
    'provenance':{'geometry':'original deterministic authoring in source/build.py',
        'textures':'original deterministic authoring in source/textures.py; seed 20261117',
        'thirdPartyModels':False,'thirdPartyImages':False,'licenses':'LICENSES.md'},
    'files':files
}
payload=''
for _ in range(8):
    total=sum(f['bytes'] for f in files)+len(payload.encode())
    manifest['budgets']['packageBytes']=total
    new=json.dumps(manifest,ensure_ascii=False,indent=2)+'\n'
    if new==payload:break
    payload=new
assert manifest['budgets']['packageBytes']<=6_000_000
for m in manifest['models']:assert m['bytes']<=2_000_000
(ROOT/'manifest.json').write_text(payload)
print(json.dumps({'files':len(files)+1,'budgets':manifest['budgets']},indent=2))
