#!/usr/bin/env python3
"""Create the delivery manifest from authored files, not estimated budgets. CC0-1.0."""
from pathlib import Path
import hashlib
import json
import struct
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
MODELS=['supply_buoy','ammo_crate','patrol_boat','small_destroyer','tower_submarine',
        'shell_regular','shell_heavy','landing_flag']


def filemeta(name):
    data=(ROOT/name).read_bytes()
    return {'file':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}


def modelmeta(name):
    blob=(ROOT/(name+'.glb')).read_bytes()
    length=struct.unpack_from('<I',blob,12)[0]
    d=json.loads(blob[20:20+length])
    binary=blob[28+length:]
    counts={}
    scene_bounds={}
    def walk(index,offset,points):
        node=d['nodes'][index]
        offset=offset+np.array(node.get('translation',[0,0,0]))
        triangles=0
        if 'mesh' in node:
            for p in d['meshes'][node['mesh']]['primitives']:
                a=d['accessors'][p['attributes']['POSITION']]
                v=d['bufferViews'][a['bufferView']]
                start=v.get('byteOffset',0)+a.get('byteOffset',0)
                arr=np.frombuffer(binary,dtype='<f4',count=a['count']*3,offset=start).reshape(-1,3)
                points.extend(arr+offset)
                triangles+=a['count']//3
        return triangles+sum(walk(c,offset,points) for c in node.get('children',[]))
    for s in d['scenes']:
        points=[]
        counts[s['name']]=sum(walk(i,np.zeros(3),points) for i in s['nodes'])
        lo,hi=np.min(points,axis=0),np.max(points,axis=0)
        scene_bounds[s['name']]={'min':np.round(lo,5).tolist(),'max':np.round(hi,5).tolist(),
                                 'size':np.round(hi-lo,5).tolist()}
    out={'id':name,**filemeta(name+'.glb'),'license':'CC0-1.0','source':'source/build.py',
         'atlas':'naval_atlas_1024.png','trianglesByScene':counts,
         'trianglesAllSceneInstances':sum(counts.values()),
         'boundsMetres':scene_bounds[d['scenes'][0]['name']],
         'waterlineY':0,'defaultScene':d['scenes'][0]['name']}
    if len(d['scenes'])==3:
        out.update({'states':list(counts),'triangleBudget':2500,
            'stateContract':'Select gltf.scenes[model.states.indexOf(state)]; never attach all three scenes at once. Loader scene names may receive suffixes.',
            'rigLookup':'Within the active scene use node.extras.role (GLTFLoader: object.userData.role). Loaders may suffix duplicate node names across scenes.',
            'rig':{'turret':{'node':'turret','axis':'+Y','yawDegrees':[-150,150]},
                   'barrel':{'node':'barrel','axis':'+X','positiveElevationUsesNegativeRotation':True,
                             'elevationDegrees':[-10,35]},'muzzle':{'node':'muzzle','forward':'+Z'}},
            'sinking':{'scene':'sinking','animation':'sinking','durationSeconds':2.8,'loop':False,
                       'finalRootY':-2.7,'clampWhenFinished':True},
            'damage':'Dented hull or broken plate, dark impact patch, tilted mast/periscope; no people or gore.'})
    if name=='supply_buoy':
        out.update({'triangleBudget':800,'light':{'node':'light','defaultOn':True,
          'extension':'KHR_lights_punctual','type':'point','intensityCandela':2,'rangeMetres':2.5,
          'emissiveMaterial':'amber_lens_on','emissiveFactor':[1,.58,.15]}})
    if name=='landing_flag':
        out['decal']={'node':'landing_decal','material':'landing_decal_hidden','shape':'circular annulus',
                      'alphaMode':'BLEND','defaultOpacity':0,'suggestedOpacity':.55,
                      'plane':'XZ','yMetres':.012,'textureAlternative':'landing_decal.png',
                      'depthWriteWhenEnabled':False}
    if name.startswith('shell_'):
        out['spawnOrigin']='Geometric center; flight and pointed tip face +Z.'
    return out


def main():
    metrics=json.loads((ROOT/'audio_metrics.json').read_text())
    audio=[]
    for name in ['supply_collect','shell_hit_ship','base_cannon','depot_burst']:
        values=[m for m in metrics if Path(m['file']).stem==name]
        audio.append({'id':name,'license':'CC0-1.0','source':'source/build.py::synth',
            'durationSeconds':values[0]['sourceDurationSeconds'],'targetIntegratedLUFS':-16,
            'measurementToleranceLU':.1,'sampleRate':48000,'channels':1,'loop':False,
            'files':[{**filemeta(v['file']),'format':Path(v['file']).suffix[1:],
                      'mimeType':'audio/ogg' if v['file'].endswith('.ogg') else 'audio/mpeg',
                      'measuredIntegratedLUFS':v['integratedLUFS'],'measuredTruePeakDBTP':v['truePeakDBTP']}
                     for v in values]})
    fps={'bow_mist':16,'landing_splash':24,'water_explosion':20,'foam':12,'vulcan_missile':32}
    sprites=[]
    for name in fps:
        sprites.append({'id':name,**filemeta(name+'.png'),'license':'CC0-1.0',
            'source':'source/build.py::sprite_frame','width':256,'height':256,'columns':4,'rows':4,
            'frameWidth':64,'frameHeight':64,'frameCount':16,'fps':fps[name],
            'durationSeconds':16/fps[name],'frameOrder':'row-major, left-to-right, top-to-bottom',
            'uvOrigin':'top-left','colorSpace':'sRGB','alpha':'straight/unpremultiplied',
            'blending':'normal','cellPaddingPixels':3,'mipmaps':False,
            'loop':name in ['bow_mist','foam','vulcan_missile'],
            'plane':'camera-facing; missile tip is image top / local +Y' if name=='vulcan_missile' else 'XZ water plane or camera-facing, per integration',
            'lastFrameAction':'wrap' if name in ['bow_mist','foam','vulcan_missile'] else 'remove',
            'recommendedWorldSizeMetres':[.40,.40] if name=='vulcan_missile' else [2,2]})
    result={'schemaVersion':1,'id':'naval-extras-v1','version':'1.0.0','createdDate':'2026-11-13',
        'baseBranch':'main','baseCommit':'d759582c171600dd7c7df7906c2fb38ae7f8b88a',
        'assetLicense':'CC0-1.0','licensesFile':'LICENSES.md','report':'REPORT.md','preview':'preview.html',
        'coordinates':{'handedness':'right','forward':'+Z','up':'+Y','right':'+X','units':'metres','waterPlane':'Y=0'},
        'style':{'audienceAge':7,'geometry':'warm low poly','text':False,'brands':False,'nationalInsignia':False},
        'compression':{'draco':False,'meshopt':False,'requiredExtensions':[]},
        'atlas':{**filemeta('naval_atlas_1024.png'),'width':1024,'height':1024,'colorSpace':'sRGB',
                 'sharing':'One external atlas referenced by all eight GLBs; preserve relative URLs.',
                 'license':'CC0-1.0','source':'source/build.py::atlas'},
        'models':[modelmeta(n) for n in MODELS],
        'effects':sprites[:4],'vulcanMissile':sprites[4],
        'landingDecal':{**filemeta('landing_decal.png'),'width':256,'height':256,
                       'license':'CC0-1.0','source':'source/build.py::effects','alpha':'straight/unpremultiplied',
                       'defaultOpacity':0,'plane':'XZ'},
        'audio':audio,
        'integration':{'runtimeModified':False,'stateSwitch':'Keep the GLTFLoader result, select scenes by the ordered model.states array.',
            'sinking':'Play the sinking clip once on the sinking scene with an AnimationMixer, then remove the entity.',
            'poolReset':'Stop and uncache the mixer, restore root position/quaternion and rig angles before reuse.',
            'atlasSampling':'Use default GLTFLoader sRGB base-color handling; sprite textures should not generate mipmaps.',
            'previewDependencies':['../../vendor/three.module.js','../../vendor/GLTFLoader.js','../../vendor/BufferGeometryUtils.js'],
            'previewDependencyLicense':'Existing repository Three.js files are MIT; no third-party file is added to this pack.',
            'offline':'Serve the repository over HTTP; preview uses only same-origin files.'}}
    (ROOT/'manifest.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print('Catalogued',len(result['models']),'models,',len(sprites),'flipbooks,',len(audio)*2,'audio encodings')


if __name__=='__main__':
    main()
