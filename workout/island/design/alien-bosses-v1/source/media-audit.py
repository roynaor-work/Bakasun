from pathlib import Path
import hashlib,json,subprocess
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
manifest=json.loads((ROOT/'manifest.json').read_text())
sprites=[];audio=[]
for b in manifest['bosses']:
    for kind,cfg in b['effects'].items():
        im=Image.open(ROOT/cfg['path']);assert im.mode=='RGBA' and im.size==(768,128)
        hashes=[]
        for i in range(6):
            frame=im.crop((i*128,0,(i+1)*128,128));alpha=np.asarray(frame)[:,:,3]
            assert alpha.max()>0 and alpha.min()==0
            assert alpha[0,:].max()<10 and alpha[-1,:].max()<10 and alpha[:,0].max()<10 and alpha[:,-1].max()<10
            hashes.append(hashlib.sha256(frame.tobytes()).hexdigest())
        assert len(set(hashes))==6
        sprites.append({'path':cfg['path'],'frames':6,'mode':im.mode,'size':im.size,'distinctFrameHashes':hashes})
    im=Image.open(ROOT/b['projectile']['path']);assert im.mode=='RGBA' and im.size==(64,64)
    sprites.append({'path':b['projectile']['path'],'mode':im.mode,'size':im.size})
    for cue,cfg in b['audio'].items():
        for ext in ['ogg','mp3']:
            p=ROOT/cfg[ext];assert p.stat().st_size<=80000
            probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_format','-show_streams','-of','json',str(p)]))
            stream=probe['streams'][0];assert stream['channels']==1 and int(stream['sample_rate'])==22050
            decoded=subprocess.check_output(['ffmpeg','-v','error','-i',str(p),'-f','f32le','-acodec','pcm_f32le','-'])
            x=np.frombuffer(decoded,dtype='<f4');peak=float(np.abs(x).max());rms=float(np.sqrt(np.mean(x*x)))
            assert len(x)>0 and np.isfinite(x).all() and peak<.75 and rms>.005
            audio.append({'path':cfg[ext],'bytes':p.stat().st_size,'duration':float(probe['format']['duration']),'sampleRate':22050,'channels':1,'peakDbfs':round(20*np.log10(peak),2),'rmsDbfs':round(20*np.log10(rms),2)})
result={'sprites':sprites,'audio':audio,'maxAudioBytes':max(x['bytes'] for x in audio),'maxDecodedPeakDbfs':max(x['peakDbfs'] for x in audio)}
(ROOT/'verification'/'media-audit.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'sprites':len(sprites),'audio':len(audio),'maxAudioBytes':result['maxAudioBytes'],'maxPeakDbfs':result['maxDecodedPeakDbfs']}))
