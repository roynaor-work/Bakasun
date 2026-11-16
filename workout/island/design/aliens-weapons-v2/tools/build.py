#!/usr/bin/env python3
"""Original vector VFX + deterministic DSP. Run from any directory; see REPORT.md."""
import hashlib
import json
import math
from pathlib import Path
import subprocess
import tempfile
import wave

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
BASE = '43b27dc235387e3cb737aee9558cdf9d5fd5a262'
WEAPONS = [
    ('piercing-laser', 'לייזר חודר', 'LANCE', '#69e8ff', 'קרן ארוכה החודרת דרך כמה מטרות', 0.34, 0.30),
    ('guided-missile', 'טיל מונחה', 'SEEKER', '#ff946e', 'טיל עוקב עם שובל פליטה', 0.55, 0.62),
    ('charge-bomb', 'פצצת מטען', 'CORE', '#ffd477', 'מטען כבד ופיצוץ רחב', 0.68, 1.00),
    ('shield', 'מגן', 'AEGIS', '#72f2bf', 'בועת הגנה ופגיעת ספיגה', 0.60, 0.42),
    ('electric-pulse', 'פולס חשמלי', 'ION', '#beabff', 'טבעת חשמל מתרחבת', 0.46, 0.54),
    ('double-missile', 'טיל כפול', 'GEMINI', '#ff8ec9', 'שני טילים ושתי פגיעות', 0.60, 0.72),
]


def write(path, value):
    p = ROOT / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(value, encoding='utf-8')


def circle(x, y, r, fill, stroke='none', width=1, opacity=1):
    return f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}" stroke="{stroke}" stroke-width="{width}" opacity="{opacity}"/>'


def path(d, color, width=2, fill='none', opacity=1):
    return f'<path d="{d}" fill="{fill}" stroke="{color}" stroke-width="{width}" stroke-linecap="round" stroke-linejoin="round" opacity="{opacity}"/>'


def defs(color, prefix):
    return f'''<defs>
<radialGradient id="{prefix}glow"><stop stop-color="{color}" stop-opacity=".65"/><stop offset=".45" stop-color="{color}" stop-opacity=".19"/><stop offset="1" stop-color="{color}" stop-opacity="0"/></radialGradient>
<radialGradient id="{prefix}orb" cx=".35" cy=".27"><stop stop-color="#fffef0"/><stop offset=".18" stop-color="{color}" stop-opacity=".75"/><stop offset=".6" stop-color="{color}" stop-opacity=".05"/><stop offset=".86" stop-color="{color}" stop-opacity=".08"/><stop offset="1" stop-color="{color}" stop-opacity=".7"/></radialGradient>
<linearGradient id="{prefix}metal"><stop stop-color="#1e304b"/><stop offset=".3" stop-color="#edf8ff"/><stop offset=".55" stop-color="#8ca4c8"/><stop offset=".75" stop-color="#385074"/><stop offset="1" stop-color="#17273e"/></linearGradient>
<linearGradient id="{prefix}face" x2="0" y2="1"><stop stop-color="#243b58"/><stop offset="1" stop-color="#0c182a"/></linearGradient>
</defs>'''


def bolt(x, y, scale, color, prefix, phase=0):
    return f'''<g transform="translate({x} {y}) scale({scale})">
{circle(0, 20, 23, f'url(#{prefix}glow)')}
{path('M-8 12 -21 30 -8 26M8 12 21 30 8 26', color, 2, '#22344c')}
{path('M0-36C-8-26-9-17-9 23L0 30 9 23C9-17 8-26 0-36Z', '#22314b', 2, f'url(#{prefix}metal)')}
{path('M0-36-7-20H7Z', color, 1, color)}
{path('M-7 13H7M-7 19H7', '#142239', 2)}
{circle(0, -5, 4, color)}
{path(f'M-5 29Q-8 42 0 {54+phase*3}Q8 42 5 29Z', color, 1, color, .85)}
{path(f'M-2 30 0 {45+phase*2} 2 30', '#fffcec', 2)}
</g>'''


def sparks(color, phase, count=10, cx=64, cy=64, radius=None):
    out = ''
    r = radius or (18 + phase * 11)
    for i in range(count):
        a = (i / count * 2 * math.pi) + .19 * phase
        r0, r1 = r * .74, min(59, r + 7 - phase)
        out += path(f'M{cx+math.cos(a)*r0:.2f} {cy+math.sin(a)*r0:.2f}L{cx+math.cos(a)*r1:.2f} {cy+math.sin(a)*r1:.2f}', color, 3-phase*.4, opacity=1-phase*.2)
    return out


def effect(kind, role, phase, color, p):
    glow = f'url(#{p}glow)'
    orb = f'url(#{p}orb)'
    if role == 'projectile':
        if kind == 'piercing-laser':
            w = [13, 16, 14, 11][phase]
            return f'''<ellipse cx="64" cy="256" rx="{w*2.6}" ry="246" fill="{glow}"/>
{path('M64 24V488', color, w, opacity=.28)}{path('M64 22V490', color, w*.48)}{path('M64 22V490', '#f5ffff', 3)}
{path(f'M47 {55+phase*74} 44 {82+phase*74}M81 {190+phase*59} 84 {217+phase*59}', color, 2, opacity=.6)}
{circle(64, 488, 14, glow)}{circle(64, 24, 7, '#f5ffff')}
'''
        if kind == 'guided-missile':
            return bolt(64, 51, .86, color, p, phase)
        if kind == 'double-missile':
            return bolt(42, 52, .65, color, p, phase) + bolt(86, 43, .65, color, p, (phase+2)%4)
        if kind == 'charge-bomb':
            return circle(64,64,53,glow)+path('M64 25 91 42 91 76 64 94 37 76 37 42Z', '#1a2941',3,f'url(#{p}metal)')+circle(64,60,21,'#12243b',color,3)+circle(64,60,13+phase,glow)+circle(64,60,8+phase,color)+path('M48 36 53 28H75L80 36M52 85V94M76 85V94',color,4)+path('M60 59H68M64 55V63','#fff8d4',2)
        if kind == 'shield':
            out = circle(64,64,55,glow)+circle(64,64,46+phase*.5,orb,color,1.6)+path('M30 46A39 39 0 0 1 67 25', '#e5fff4',3,opacity=.7)
            for x,y in [(44,54),(65,42),(85,54),(44,78),(65,66),(85,78)]:
                out += path(f'M{x-10} {y-6}V{y+6}L{x} {y+12} {x+10} {y+6}V{y-6}L{x} {y-12}Z',color,1,opacity=.16)
            return out+circle(64,64,4,color,opacity=.45)
        if kind == 'electric-pulse':
            r = [16,29,42,54][phase]
            out = circle(64,64,min(61,r+7),glow)+circle(64,64,r,'none',color,3)+circle(64,64,max(5,r-6),'none',color,1, .3)
            for i in range(6):
                a = i*60+phase*11
                out += f'<g transform="rotate({a} 64 64)">'+path(f'M64 {64-r-3} 59 {64-r+4} 67 {64-r+2} 64 {64-r+9}', '#f5edff',2)+'</g>'
            return out
    if role == 'fire':
        if kind in ('shield','electric-pulse'):
            r=[13,26,40,52][phase]
            return circle(64,64,min(60,r+6),glow)+circle(64,64,r,'none',color,4-phase*.7)+sparks(color,phase,8)
        if kind == 'charge-bomb':
            return circle(64,80,34+phase*3,glow)+path(f'M34 91Q{40-phase*3} {24+phase*8} 64 {22+phase*9}Q{88+phase*3} {24+phase*8} 94 91',color,4-phase*.7)+circle(64,85,12+phase*3,glow)+path('M54 91 64 47 74 91', '#fff2ce',3, color,.85-phase*.19)
        xs = [43,85] if kind=='double-missile' else [64]
        out=''
        for x in xs:
            out += circle(x,84,28+phase*2,glow)+path(f'M{x-12} 96 {x-6} 72 {x} {28+phase*14} {x+6} 72 {x+12} 96Z',color,1,color,.9-phase*.2)+path(f'M{x} 91V{46+phase*13}', '#fff',3)
        return out
    if role == 'trail':
        out=''
        if kind in ('guided-missile','double-missile'):
            for x in ([43,85] if kind=='double-missile' else [64]):
                out+=f'<ellipse cx="{x}" cy="61" rx="18" ry="53" fill="{glow}"/>'
                out+=path(f'M{x} 12Q{x-9+phase*3} 47 {x+2} 70T{x-6} 113',color,7,opacity=.45)
                out+=path(f'M{x} 13Q{x-6+phase*2} 44 {x} 64', '#fff0df',2,opacity=.8)
                for j in range(5):
                    out+=circle(x+math.sin(j+phase)*7,44+j*13,4-j*.5,color,opacity=.3-j*.045)
            return out
        if kind=='piercing-laser':
            return circle(64,64,47,glow)+path('M64 14V114',color,5,opacity=.6)+sparks(color,phase,6,radius=19)
        if kind=='charge-bomb':
            return circle(64,39,31,glow)+''.join(circle(64+math.sin(j+phase)*8,27+j*16,10-j*1.2,glow) for j in range(5))+path('M64 18V48', '#fff1d5',3)
        return circle(64,64,53,'none',color,1.5,.28)+sparks(color,phase,12,radius=45)
    if role == 'impact':
        r=[17,32,45,54][phase]
        opacity=[1,.95,.65,.3][phase]
        if kind=='shield':
            return circle(64,64,min(60,r+8),glow)+circle(64,64,r,'none',color,4-phase*.8)+path(f'M43 {64-r/2} 64 {64-r/2-8} 85 {64-r/2}V{64+r/3}L64 {64+r/2} 43 {64+r/3}Z', '#e2fff4',2,opacity=opacity)
        if kind=='electric-pulse':
            return effect(kind,'projectile',phase,color,p)+sparks(color,phase,6,radius=r)
        if kind=='double-missile':
            out=''
            for x,y in [(40,70),(87,49)]:
                rr=min(28,r*.53)
                out+=circle(x,y,rr+8,glow)+circle(x,y,rr, 'none',color,2.3,opacity)+sparks(color,phase,6,x,y,rr)
            return out
        if kind=='piercing-laser':
            return circle(64,64,min(60,r+8),glow)+path(f'M64 {64-r}V{64+r}M{64-r*.7} 64H{64+r*.7}', '#edffff',3,opacity=opacity)+sparks(color,phase,8,radius=r)
        out=circle(64,64,min(61,r+8),glow)+circle(64,64,r,'none',color,4-phase*.7,opacity)
        if phase<3:
            n=12 if kind=='charge-bomb' else 9
            points=' '.join(f'{64+math.cos(i*math.pi/n)*(r*.85 if i%2==0 else r*.46):.2f},{64+math.sin(i*math.pi/n)*(r*.85 if i%2==0 else r*.46):.2f}' for i in range(n*2))
            out+=f'<polygon points="{points}" fill="{color}" opacity="{opacity*.8}"/>'+circle(64,64,r*.27,'#fff8df',opacity=opacity)
        if kind=='charge-bomb':
            out+=f'<ellipse cx="64" cy="64" rx="{min(59,r*1.15)}" ry="{r*.35}" fill="none" stroke="#ffeeb5" stroke-width="2" opacity="{opacity}"/>'
        return out+sparks(color,phase,12 if kind=='charge-bomb' else 8,radius=r)
    raise ValueError((kind,role))


def glyph(kind, color):
    white='#ecf7ff'
    if kind=='piercing-laser':
        return path('M64 31V85',color,11,opacity=.28)+path('M64 31V85',white,3)+path('M47 44V35H54M81 73V83H74M48 65H56M72 53H80',color,3)
    if kind in ('guided-missile','double-missile'):
        def m(x,y,s):
            return f'<g transform="translate({x} {y}) scale({s})">'+path('M0-29Q-11-17-9 17H9Q11-17 0-29Z',white,2,'#274059')+path('M-9 7-17 23-7 18M9 7 17 23 7 18',color,3)+circle(0,-5,3,color)+path('M-4 24 0 34 4 24',color,3)+'</g>'
        if kind=='double-missile': return m(49,57,.75)+m(78,52,.75)
        return m(64,53,.85)+path('M39 38V30H47M82 30H90V38M39 77V85H47M90 77V85H82',color,2)
    if kind=='charge-bomb':
        return path('M64 34 85 46V71L64 85 43 71V46Z',color,3,'#273c50')+circle(64,59,13,'#10243c',color,2)+path('M59 59H69M64 54V64M53 38V31H75V38',white,3)
    if kind=='shield':
        return path('M64 32 88 42 84 66Q79 80 64 87Q49 80 44 66L40 42Z',color,3,'#203f45')+path('M64 41V76M50 48 64 41 78 48',white,2)
    return circle(64,59,25,'none',color,3)+circle(64,59,18,'none',color,1,.4)+path('M67 36 52 62H64L59 81 78 54H65Z',white,2,white)


def icon(kind, color, state):
    p=kind+'-'+state+'-'
    if state=='disabled':color='#718398'
    shell=path('M31 8H97L120 31V97L97 120H31L8 97V31Z',color,2,f'url(#{p}face)')
    if state=='pressed':
        shell+=path('M32 14H96L114 32V96L96 114H32L14 96V32Z',color,3,'#102034')+circle(64,59,43,f'url(#{p}glow)')
    else:
        shell+=path('M33 14H95L113 32M15 38V94L33 112', '#dbefff',1,opacity=.23)
    shell+=path('M41 104H87',color,3)+path('M45 110H53M60 110H68M75 110H83',color,2,opacity=.6)
    shell+=glyph(kind,color)
    if state=='disabled':shell+=path('M32 91 96 27','#a4b3c5',3,opacity=.7)
    return svg(128,128,defs(color,p)+f'<g opacity="{.66 if state=="disabled" else 1}">{shell}</g>')


def refill(kind,color):
    p=kind+'-refill-'
    body=path('M35 15H82L97 30V109H31V25Z','#18304b',3,f'url(#{p}metal)')+path('M43 17V9H77V17M39 34H87V94H39Z',color,3,'#10243b')
    body+=f'<g transform="translate(10 4) scale(.66)">{glyph(kind,color)}</g>'
    body+=circle(91,91,24,'#122b3c',color,3)+path('M79 91H103M91 79V103','#edfff6',4)
    return svg(128,128,defs(color,p)+body)


def svg(w,h,body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">{body}</svg>'


def sound(kind,event,duration,index):
    sr=44100
    t=np.arange(round(sr*duration))/sr
    rng=np.random.default_rng(260111+index*101+(17 if event=='impact' else 0))
    noise=rng.uniform(-1,1,len(t))
    low=np.convolve(noise,np.ones(19)/19,mode='same')
    def sweep(a,b,decay,delay=0):
        u=np.maximum(t-delay,0)
        f=b+(a-b)*np.exp(-u*9)
        ph=2*np.pi*np.cumsum(f)/sr
        return np.sin(ph)*np.exp(-u*decay)*(t>=delay)
    if event=='fire':
        if kind=='piercing-laser':x=.55*sweep(2200,280,12)+.18*sweep(3400,560,15)+.08*noise*np.exp(-t*28)
        elif kind=='guided-missile':x=.8*low*np.exp(-t*7)+.2*sweep(180,540,7)+.1*noise*np.exp(-t*26)
        elif kind=='charge-bomb':x=.32*sweep(130,740,4)+.18*sweep(260,1480,6)+.12*low*np.exp(-t*8)
        elif kind=='shield':x=.3*sweep(340,730,7)+.23*sweep(510,1095,6)+.12*sweep(680,1460,8)
        elif kind=='electric-pulse':x=.4*sweep(1300,130,10)+.15*noise*np.exp(-t*15)*(np.sin(t*210)>0)
        else:x=.23*sweep(160,460,8)+.65*low*np.exp(-t*9)+.24*sweep(170,500,8,.09)+.25*np.roll(low,round(sr*.09))*np.exp(-np.maximum(t-.09,0)*9)*(t>=.09)
    else:
        if kind=='shield':x=.3*sweep(850,330,12)+.16*sweep(1275,495,11)+.3*low*np.exp(-t*15)
        elif kind=='electric-pulse':x=.29*sweep(1700,95,9)+.18*noise*np.exp(-t*14)*(np.sin(t*330)>-.3)+.16*sweep(190,75,8)
        elif kind=='piercing-laser':x=.28*sweep(1700,270,17)+.27*noise*np.exp(-t*20)
        else:
            decay=5 if kind=='charge-bomb' else 8
            x=.9*low*np.exp(-t*decay)+.22*noise*np.exp(-t*22)+.3*sweep(110,38,decay)
            if kind=='double-missile':x+=.55*np.roll(x,round(sr*.09))*(t>=.09)
    x-=np.mean(x)
    x*=np.minimum(1,t/.006)*np.minimum(1,(duration-t)/.025)
    x*=.78/max(np.max(np.abs(x)),1e-6)
    with tempfile.TemporaryDirectory(prefix='alien-dsp-') as tmp:
        wav=Path(tmp)/'source.wav'
        with wave.open(str(wav),'wb') as out:
            out.setnchannels(1);out.setsampwidth(2);out.setframerate(sr)
            out.writeframes((x*32767).astype('<i2').tobytes())
        for ext,codec,rate in [('ogg','libvorbis','48k'),('mp3','libmp3lame','64k')]:
            subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(wav),'-map_metadata','-1','-fflags','+bitexact','-flags:a','+bitexact','-c:a',codec,'-b:a',rate,str(ROOT/'audio'/f'{kind}-{event}.{ext}')],check=True)


def main():
    for folder in ['src','icons','audio','atlases','verification']:(ROOT/folder).mkdir(exist_ok=True)
    weapons=[]
    for index,(kind,name,callsign,color,description,fire_s,hit_s) in enumerate(WEAPONS):
        frames={};animations={};parts=[]
        for row,role in enumerate(['projectile','fire','impact','trail']):
            ids=[]
            for phase in range(4):
                w,h=128,512 if role=='projectile' and kind=='piercing-laser' else 128
                x,y=(512+phase*128,0) if h==512 else (phase*128,row*128)
                frame_id=f'{role}-{phase}'
                pivot=[64,488] if h==512 else [64,96] if role=='fire' and kind not in ('shield','electric-pulse') else [64,16] if role=='trail' and kind in ('guided-missile','double-missile','charge-bomb') else [64,64]
                frames[frame_id]={'rect':[x,y,w,h],'pivotPx':pivot}
                ids.append(frame_id)
                prefix=f'{kind}-{role}-{phase}-'
                parts.append(f'<svg x="{x}" y="{y}" width="{w}" height="{h}" viewBox="0 0 {w} {h}">'+defs(color,prefix)+effect(kind,role,phase,color,prefix)+'</svg>')
            size=[128,512] if role=='projectile' and kind=='piercing-laser' else [224,224] if role=='impact' and kind=='charge-bomb' else [152,152] if role=='projectile' and kind=='shield' else [176,176] if role=='projectile' and kind=='electric-pulse' else [96,96]
            animations[role]={'frames':ids,'frameMs':{'projectile':90,'fire':40,'impact':80,'trail':70}[role],'loop':role in ('projectile','trail') and not(kind=='electric-pulse' and role=='projectile'),'displaySizePx':size}
        dims=[1024,512] if kind=='piercing-laser' else [512,512]
        write(f'src/{kind}-atlas.svg',svg(*dims,''.join(parts)))
        icons={}
        for state in ['ready','pressed','disabled']:
            stem=f'icons/{kind}-{state}'
            write(stem+'.svg',icon(kind,color,state))
            icons[state]={'svg':stem+'.svg','png':stem+'.png'}
        stem=f'icons/{kind}-refill'
        write(stem+'.svg',refill(kind,color))
        for event,duration in [('fire',fire_s),('impact',hit_s)]:sound(kind,event,duration,index)
        weapons.append({'id':kind,'nameHe':name,'callsign':callsign,'color':color,'descriptionHe':description,'atlas':f'atlases/{kind}.png','atlasSize':dims,'frames':frames,'animations':animations,'button':icons,'refill':{'svg':stem+'.svg','png':stem+'.png'},'audio':{event:{'ogg':f'audio/{kind}-{event}.ogg','mp3':f'audio/{kind}-{event}.mp3','durationSeconds':duration} for event,duration in [('fire',fire_s),('impact',hit_s)]}})
    subprocess.run(['node',str(ROOT/'tools/rasterize.cjs')],check=True)
    manifest={'schemaVersion':2,'pack':'aliens-weapons-v2','createdDate':'2026-11-16','baseCommit':BASE,'license':'CC0-1.0 assets; MIT tools and preview','preview':{'file':'preview.html','width':844,'height':390},'limits':{'atlasMaxBytes':600000,'audioMaxBytes':60000,'buttonSizePx':128},'rendering':{'origin':'top-left','forward':'-Y','alpha':'straight/unpremultiplied RGBA','blend':'source-over','filter':'linear','paddingPx':2,'rotation':'radians clockwise from -Y around pivotPx','hitFrames':4,'notes':'Rects are untrimmed, unrotated pixel rectangles. Transparent pixels have zero RGB. Use pivotPx with displaySizePx scaling. Set clamp-to-edge and disable mipmaps; add extrusion before enabling mipmaps. Shield projectile is a local bubble, pulse projectile is a one-shot expansion.'},'weapons':weapons}
    assets=[]
    for folder in ['atlases','icons','audio','src']:
        for file in sorted((ROOT/folder).iterdir()):
            data=file.read_bytes()
            assets.append({'path':file.relative_to(ROOT).as_posix(),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
    manifest['assets']=assets
    write('manifest.json',json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    print(f'Built {len(weapons)} weapons, {len(assets)} assets, {sum(a["bytes"] for a in assets):,} bytes')


if __name__=='__main__':main()
