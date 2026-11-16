#!/usr/bin/env python3
"""Validate the delivered files (not the drawing implementation)."""
import hashlib
import json
from pathlib import Path
import subprocess
import xml.etree.ElementTree as ET

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


def main():
    m=json.loads((ROOT/'manifest.json').read_text())
    assert len(m['weapons'])==6
    assert len({w['id'] for w in m['weapons']})==6
    assert m['preview']=={'file':'preview.html','width':844,'height':390}
    assert (ROOT/'LICENSE.txt').is_file() and (ROOT/'REPORT.md').is_file()
    inventory={a['path']:a for a in m['assets']}
    for item in inventory.values():
        file=(ROOT/item['path']).resolve()
        assert file.is_relative_to(ROOT)
        data=file.read_bytes()
        assert len(data)==item['bytes'], file
        assert hashlib.sha256(data).hexdigest()==item['sha256'], file
    expected={p.relative_to(ROOT).as_posix() for folder in ['src','atlases','icons','audio'] for p in (ROOT/folder).iterdir() if p.is_file()}
    assert expected==set(inventory), 'Inventory must cover every asset'
    atlas_results=[]; audio_results=[]
    for w in m['weapons']:
        image=Image.open(ROOT/w['atlas'])
        assert image.mode=='RGBA' and list(image.size)==w['atlasSize']
        assert (ROOT/w['atlas']).stat().st_size <= 600000
        rgba=np.array(image)
        assert np.all(rgba[rgba[:,:,3]==0,:3]==0), 'Hidden RGB can cause matte fringes'
        rects=[]; frames=[]
        for role,animation in w['animations'].items():
            assert len(animation['frames'])==4 and animation['frameMs']>0
            hashes=[]
            for name in animation['frames']:
                f=w['frames'][name];x,y,width,height=f['rect'];px,py=f['pivotPx']
                assert 0<=x and 0<=y and x+width<=image.width and y+height<=image.height
                assert 0<=px<=width and 0<=py<=height
                assert width>0 and height>0
                for ax,ay,aw,ah in rects:
                    assert x>=ax+aw or ax>=x+width or y>=ay+ah or ay>=y+height, 'Overlapping frames'
                rects.append((x,y,width,height))
                tile=rgba[y:y+height,x:x+width];alpha=tile[:,:,3]
                assert alpha.max()>0 and alpha.min()==0, f'{w["id"]}/{name}: empty or opaque'
                # Two clear pixels on every edge prevent adjacent frame bleed with bilinear filtering.
                assert not (alpha[:2].any() or alpha[-2:].any() or alpha[:,:2].any() or alpha[:,-2:].any()), f'{w["id"]}/{name}: clipped or missing gutter'
                digest=hashlib.sha256(tile.tobytes()).hexdigest();hashes.append(digest)
                frames.append({'id':name,'alphaPixels':int(np.count_nonzero(alpha)), 'sha256':digest})
            assert len(set(hashes))==4, f'{w["id"]}/{role}: repeated animation frames'
        state_hashes=[]
        for item in [*w['button'].values(),w['refill']]:
            for ext,file in item.items():
                assert file in inventory
                if ext=='png':
                    im=Image.open(ROOT/file)
                    assert im.size==(128,128) and im.mode=='RGBA'
                    assert im.getextrema()[3][0]==0 and im.getextrema()[3][1]>0
                    state_hashes.append(hashlib.sha256(im.tobytes()).hexdigest())
                else:
                    doc=ET.parse(ROOT/file).getroot()
                    assert doc.attrib['viewBox']=='0 0 128 128'
                    assert not any('href' in key for child in doc.iter() for key in child.attrib), 'External SVG reference'
        assert len(set(state_hashes))==4
        for event,formats in w['audio'].items():
            for ext in ['ogg','mp3']:
                file=ROOT/formats[ext]
                assert file.stat().st_size<=60000
                info=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','stream=codec_name,sample_rate,channels:format=duration','-of','json',str(file)]))
                stream=info['streams'][0]
                assert stream['channels']==1 and stream['sample_rate']=='44100'
                assert stream['codec_name']==('vorbis' if ext=='ogg' else 'mp3')
                duration=float(info['format']['duration'])
                assert abs(duration-formats['durationSeconds'])<.09
                pcm=np.frombuffer(subprocess.check_output(['ffmpeg','-v','error','-i',str(file),'-f','f32le','-acodec','pcm_f32le','-']),dtype='<f4')
                peak=float(np.max(np.abs(pcm)));rms=float(np.sqrt(np.mean(pcm**2)))
                assert 0.05<peak<.99 and rms>.008, 'Silent or clipped audio'
                assert abs(float(np.mean(pcm)))<.006, 'DC offset'
                assert np.max(np.abs(pcm[:88]))<.4 and np.max(np.abs(pcm[-88:]))<.1, 'Missing click-suppression fade'
                audio_results.append({'file':formats[ext],'bytes':file.stat().st_size,'durationSeconds':round(duration,4),'codec':stream['codec_name'],'peak':round(peak,5),'rms':round(rms,5)})
        atlas_results.append({'id':w['id'],'bytes':(ROOT/w['atlas']).stat().st_size,'size':w['atlasSize'],'frames':frames})
    # All media must stay within conservative decimal KB limits.
    assert all(p.stat().st_size<=600000 for p in ROOT.rglob('*.png'))
    result={'passed':True,'weapons':6,'atlases':atlas_results,'frameCount':sum(len(a['frames']) for a in atlas_results),'buttonStates':18,'refillIcons':6,'audio':audio_results,'inventoryFiles':len(inventory),'assetBytes':sum(x['bytes'] for x in inventory.values()),'notes':['All 96 frames have two transparent edge pixels.','Every animation contains four distinct frames.','Decoded audio checked for codec, duration, mono, peak, RMS, DC offset and fades.','SHA-256 inventory verified.']}
    (ROOT/'verification/assets.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:result[k] for k in ['passed','weapons','frameCount','buttonStates','refillIcons','inventoryFiles','assetBytes']},ensure_ascii=False))


if __name__=='__main__':main()
