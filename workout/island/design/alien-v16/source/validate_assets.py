"""CC0-1.0 asset contract checks. Python 3, NumPy, Pillow, ffmpeg, ffprobe.

No application code is imported or modified. Reports measured delivery data.
"""
from pathlib import Path
import hashlib
import io
import json
import struct
import subprocess
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
REPO=ROOT.parents[3]


def glb(path):
    b=path.read_bytes()
    magic,version,length=struct.unpack_from('<III',b)
    assert magic==0x46546c67 and version==2 and length==len(b)
    n,t=struct.unpack_from('<II',b,12)
    assert t==0x4e4f534a
    j=json.loads(b[20:20+n]);bn,bt=struct.unpack_from('<II',b,20+n)
    assert bt==0x004e4942
    data=b[28+n:28+n+bn]
    return j,data


def accessor(j,data,index):
    a=j['accessors'][index];v=j['bufferViews'][a['bufferView']]
    comps={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
    dtype={5126:'<f4',5123:'<u2',5125:'<u4'}[a['componentType']]
    offset=v.get('byteOffset',0)+a.get('byteOffset',0)
    stride=v.get('byteStride',np.dtype(dtype).itemsize*comps)
    return np.ndarray((a['count'],comps),dtype=dtype,buffer=data,
                      offset=offset,strides=(stride,np.dtype(dtype).itemsize)).copy()


def measure(path,check=False):
    j,data=glb(path);pts=[];triangles=0
    def visit(index,parent):
        nonlocal triangles
        n=j['nodes'][index]
        if 'matrix' in n:
            local=np.array(n['matrix']).reshape((4,4),order='F')
        else:
            x,y,z,w=n.get('rotation',[0,0,0,1])
            rot=np.array([[1-2*y*y-2*z*z,2*x*y-2*z*w,2*x*z+2*y*w],
                          [2*x*y+2*z*w,1-2*x*x-2*z*z,2*y*z-2*x*w],
                          [2*x*z-2*y*w,2*y*z+2*x*w,1-2*x*x-2*y*y]])
            local=np.eye(4);local[:3,:3]=rot@np.diag(n.get('scale',[1,1,1]))
            local[:3,3]=n.get('translation',[0,0,0])
        world=parent@local
        if 'mesh' in n:
            for p in j['meshes'][n['mesh']]['primitives']:
                a=accessor(j,data,p['attributes']['POSITION'])
                pts.extend((world@np.column_stack((a,np.ones(len(a)))).T).T[:,:3])
                triangles+=j['accessors'][p['indices']]['count']//3
                if check:
                    assert 'TEXCOORD_0' in p['attributes'] and 'NORMAL' in p['attributes']
        for child in n.get('children',[]):visit(child,world)
    roots=j['scenes'][j.get('scene',0)]['nodes']
    for node in roots:visit(node,np.eye(4))
    low=np.min(pts,axis=0);high=np.max(pts,axis=0)
    if check:
        assert path.stat().st_size<150000, (path.name,path.stat().st_size)
        assert not any('draco' in e.lower() for e in j.get('extensionsUsed',[]))
        assert not j.get('extensionsRequired'),j.get('extensionsRequired')
        names=[n['name'] for n in j['nodes']]
        for name in ['Core','Turret_L','Turret_R','Muzzle_L','Muzzle_R']:
            assert names.count(name)==1,(path,name)
        for name in ['Core','Turret_L','Turret_R']:
            n=j['nodes'][names.index(name)]
            assert n.get('children') or 'mesh' in n
        assert len(roots)==1
        n=j['nodes'][roots[0]]
        assert n.get('translation',[0,0,0])==[0,0,0]
        assert n.get('scale',[1,1,1])==[1,1,1]
        assert n.get('rotation',[0,0,0,1])==[0,0,0,1]
        assert n['extras']['forward']=='+Z' and n['extras']['up']=='+Y'
        assert np.allclose((high-low)[[0,2]],[7.4,5.55],atol=.001)
        assert abs(low[1])<.001 and high[1]<=1.961
        assert len(j['images'])==1
        image=j['images'][0];v=j['bufferViews'][image['bufferView']]
        buf=data[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
        embedded=Image.open(io.BytesIO(buf)).convert('RGB')
        external=Image.open(ROOT/f'textures/{path.stem}-basecolor.png').convert('RGB')
        assert embedded.size==(1024,1024)
        assert np.array_equal(embedded,external),'Embedded texture must match the supplied sidecar'
        for v in j['buffers']:assert 'uri' not in v
    return dict(file=str(path.relative_to(REPO)),bytes=path.stat().st_size,
                triangles=triangles,min=low.round(6).tolist(),max=high.round(6).tolist(),
                dimensions=(high-low).round(6).tolist())


def main():
    anims=json.loads((ROOT/'animations.json').read_text())['animations']
    animation_results=[]
    for name,a in anims.items():
        sheet=Image.open(ROOT/a['sheet'])
        w,h=a['frameWidth'],a['frameHeight']
        assert sheet.size==(w*a['count'],h) and sheet.mode=='RGBA'
        hashes=[]
        for i,f in enumerate(a['frames']):
            im=Image.open(ROOT/f);arr=np.array(im)
            assert im.size==(w,h) and im.mode=='RGBA'
            assert np.array_equal(im,sheet.crop((i*w,0,(i+1)*w,h)))
            assert arr[:,:,3].max()>0 and (arr[:,:,3]==0).any()
            assert arr[0,:,3].max()==arr[-1,:,3].max()==0
            assert arr[:,0,3].max()==arr[:,-1,3].max()==0
            hashes.append(hashlib.sha256(arr.tobytes()).hexdigest())
        assert len(set(hashes))==a['count'],'Every animation frame must be distinct'
        animation_results.append(dict(name=name,frame=[w,h],sheet=list(sheet.size),count=a['count']))
    assert Image.open(ROOT/'sprites/player-laser.png').size==(512,64)
    tokens=[]
    for p in sorted((ROOT/'icons').glob('bonus-*.png')):
        im=Image.open(p);assert im.size==(96,96) and im.mode=='RGBA'
        assert np.array(im)[:,:,3].max()==255
        tokens.append(p.name)
    assert len(tokens)==6
    reference=measure(REPO/'workout/island/assets/alien-v13/player-ship.glb')
    models=[measure(p,True) for p in sorted((ROOT/'models').glob('*.glb'))]
    assert len(models)==6
    audio=[]
    durations={'laser-zap':.15,'laser-hum-loop':1,'plasma-shot':.2,'boss-alarm':1}
    for name,dur in durations.items():
        p=ROOT/f'audio/{name}.ogg'
        meta=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(p)]))
        stream=meta['streams'][0]
        assert stream['codec_name']=='opus' and stream['channels']==1
        assert p.stat().st_size<20000
        pcm=subprocess.check_output(['ffmpeg','-v','error','-i',str(p),'-f','f32le','-acodec','pcm_f32le','pipe:1'])
        x=np.frombuffer(pcm,dtype='<f4')
        assert len(x)==round(dur*48000),(name,len(x))
        assert np.max(np.abs(x))<.65 and np.isfinite(x).all()
        row=dict(file=f'audio/{name}.ogg',bytes=p.stat().st_size,duration=dur,
                 decodedSamples=len(x),sampleRate=int(stream['sample_rate']),
                 peak=float(np.max(np.abs(x))),rms=float(np.sqrt(np.mean(x*x))))
        # Opus pre-skip is honored by FFmpeg and Web Audio. Measure decoded
        # samples; the container's duration also includes the encoder pre-skip.
        if name=='laser-hum-loop':
            assert len(x)==48000
            delta=np.diff(x)
            seam=abs(float(x[0]-x[-1]));peak_delta=float(np.max(np.abs(delta)))
            assert seam<=peak_delta*1.25,(seam,peak_delta)
            # Compare first/last 10 ms energy: no silent join or envelope dip.
            start_rms=np.sqrt(np.mean(x[:480]**2));end_rms=np.sqrt(np.mean(x[-480:]**2))
            assert .9<start_rms/end_rms<1.1
            row.update(loopSeamDelta=seam,maxAdjacentDelta=peak_delta,
                       seamEnergyRatio=float(start_rms/end_rms))
        audio.append(row)
    result=dict(license='CC0-1.0',status='pass',reference=reference,animations=animation_results,
                bonusTokens=tokens,models=models,audio=audio,
                budgets=dict(glbBytesExclusive=150000,oggBytesExclusive=20000))
    (ROOT/'verification/asset-results.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(dict(status='pass',animations=len(animation_results),models=len(models),audio=len(audio),
                         maxGlbBytes=max(m['bytes'] for m in models)),indent=2))


if __name__=='__main__':main()
