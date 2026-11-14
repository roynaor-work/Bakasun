#!/usr/bin/env python3
"""Author the vector masters, render exact RGBA exports, and inventory the pack.

Requires Python 3, Pillow, Playwright and a local Chromium. No network requests.
Run from any directory: python tools/build.py
"""
from pathlib import Path
from base64 import b64decode
from io import BytesIO
import hashlib
import json
import math
import os
import shutil
import xml.etree.ElementTree as ET

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
INK, WHITE, GOLD = '#102731', '#FFF8E8', '#FFD06B'
GREEN, YELLOW, RED = '#70D9AB', '#FFD06B', '#F07867'
assets = []


def path(d, fill='none', stroke=INK, width=8, **attrs):
    extra = ' '.join(f'{k.replace("_", "-")}="{v}"' for k, v in attrs.items())
    return f'<path d="{d}" fill="{fill}" stroke="{stroke}" stroke-width="{width}" stroke-linecap="round" stroke-linejoin="round" {extra}/>'


def circle(x, y, r, fill, stroke='none', width=0, **attrs):
    extra = ' '.join(f'{k.replace("_", "-")}="{v}"' for k, v in attrs.items())
    return f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}" stroke="{stroke}" stroke-width="{width}" {extra}/>'


def rect(x, y, w, h, fill, rx=0, stroke='none', width=0):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" stroke="{stroke}" stroke-width="{width}"/>'


def emit(key, title, body, group, display, anchor=(256, 256), **meta):
    data = (f'<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" aria-labelledby="title"><title id="title">{title}</title>{body}</svg>\n').encode()
    dest = ROOT/'svg'/f'{key}.svg'
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    assets.append(dict(id=key, name=title, category=group, canvas=[512, 512],
                       anchorPx=list(anchor), anchorUV=[v/512 for v in anchor],
                       recommendedDisplayPx=display, license='CC0-1.0',
                       formats={'svg': f'svg/{key}.svg', 'png256': f'png/256/{key}.png', 'png512': f'png/512/{key}.png'}, **meta))


def marker():
    return ('<ellipse cx="256" cy="256" rx="104" ry="42" fill="#102731" fill-opacity=".18" stroke="#102731" stroke-width="19"/>'
            '<ellipse cx="256" cy="256" rx="104" ry="42" fill="none" stroke="#FFF8E8" stroke-width="9"/>'
            + path('M134 256h34m176 0h34M256 188v26m0 84v26', stroke=INK, width=18)
            + path('M134 256h34m176 0h34M256 188v26m0 84v26', stroke=GOLD, width=8)
            + circle(256, 256, 14, GOLD, INK, 6))


def aim_assets():
    dots = ''
    # A composition reference. Runtime should place aim-dot instances on the
    # weapon's actual projected trajectory, never stretch this curve to fit.
    for i in range(18):
        t = i/18
        x = (1-t)**2*60+2*(1-t)*t*188+t*t*384
        y = (1-t)**2*450+2*(1-t)*t*122+t*t*142
        r = 6+2*t
        dots += circle(round(x, 2), round(y, 2), round(r+3, 2), INK, opacity='.8')
        dots += circle(round(x, 2), round(y, 2), round(r, 2), WHITE)
    body = dots + '<g transform="translate(179.2 -62.8) scale(.8)">'+marker()+'</g>'
    emit('aim-guide', 'Dotted trajectory with predicted landing point', body, 'aim', [210, 210],
         anchor=(60, 450), endPx=[384, 142], usage='Composition reference only; rebuild the dots along the actual projected trajectory.')
    emit('aim-dot', 'Trajectory dot', circle(256, 256, 132, INK)+circle(256, 256, 92, WHITE), 'aim', [10, 10], usage='Instance every 12 CSS px along the projected trajectory. An 8–12 px square yields a visible dot about 4–6 px wide, including its dark outline.')
    emit('predicted-impact', 'Predicted landing point', marker(), 'aim', [74, 74], usage='Center on the projected surface intersection. Hide when no valid surface exists.')


def reticle(key, color, shape, title, distance):
    if shape == 'circle':
        ring = circle(256, 256, 103, 'none', INK, 22)+circle(256, 256, 103, 'none', color, 10)
    elif shape == 'diamond':
        d = 'M256 114 398 256 256 398 114 256Z'
        ring = path(d, stroke=INK, width=22)+path(d, stroke=color, width=10)
    else:
        d = 'M186 124h-62v62m202-62h62v62m0 140v62h-62m-140 0h-62v-62'
        ring = path(d, stroke=INK, width=24)+path(d, stroke=color, width=11)
    d = 'M256 80v48m0 256v48M80 256h48m256 0h48'
    body = ring+path(d, stroke=INK, width=24)+path(d, stroke=color, width=11)
    body += circle(256, 256, 14, INK)+circle(256, 256, 7, WHITE)
    emit(key, title, body, 'reticle', [88, 88], rangeNormalized=distance, nonColorCue=shape,
         usage='Distance to predicted impact, divided by the selected weapon effective range. This is not hit probability.')


def effects():
    rays = ''
    for i in range(8):
        a = i*math.pi/4
        x1, y1 = 256+math.cos(a)*92, 256+math.sin(a)*92
        x2, y2 = 256+math.cos(a)*(158 if i%2 else 184), 256+math.sin(a)*(158 if i%2 else 184)
        d = f'M{x1:.2f} {y1:.2f} {x2:.2f} {y2:.2f}'
        rays += path(d, stroke=INK, width=23)+path(d, stroke=GOLD if i%2 else WHITE, width=11)
    star = 'M256 174 279 232 338 256 279 280 256 338 232 280 174 256 232 232Z'
    emit('hit-spark', 'Hit · contact spark', rays+path(star, GOLD, INK, 8)+circle(256, 256, 28, WHITE), 'hit', [104, 104], durationMs=220, animation={'fromScale': .55, 'toScale': 1.15, 'fadeAfter': .35}, usage='Ordinary metal contact. One shot; never loop.')
    body = circle(256, 256, 149, 'none', INK, 21)+circle(256, 256, 149, 'none', GOLD, 10)
    body += circle(256, 256, 95, 'none', WHITE, 10)
    for a in [0, 90, 180, 270]:
        body += f'<g transform="rotate({a} 256 256)">'+path('M235 210 256 230 277 210', stroke=INK, width=23)+path('M235 210 256 230 277 210', stroke=GOLD, width=11)+'</g>'
    emit('hit-ring', 'Hit · precision ring', body, 'hit', [112, 112], durationMs=300, animation={'fromScale': .6, 'toScale': 1.25, 'fadeAfter': .25}, usage='Precision hit confirmation. One shot.')
    body = circle(256, 256, 48, GOLD, INK, 8)
    for i in range(7):
        a = i*360/7
        body += f'<g transform="rotate({a:.2f} 256 256)">'+path('M244 163 259 84 284 146 268 181Z', '#C9B27A' if i%2 else WHITE, INK, 7)+'</g>'
    body += path('M238 256h36m-18-18v36', stroke=WHITE, width=10)
    emit('hit-shards', 'Hit · armor fragments', body, 'hit', [118, 118], durationMs=340, animation={'fromScale': .5, 'toScale': 1.3, 'fadeAfter': .2}, usage='Armor plate contact; brass and steel fragments, no gore.')
    body = '<ellipse cx="256" cy="365" rx="165" ry="36" fill="#102731" fill-opacity=".14"/>'
    body += path('M100 348Q65 307 117 282q-10-62 48-67-8-64 48-72 46-7 60 48 56-27 86 21 12 17 8 39 64-4 67 52 1 44-58 52Z', '#DDC393', '#8A785D', 7)
    body += path('M139 307q-25-20 0-36m54-45q-4-33 28-34m99 74q27-9 36 15', stroke='#FFF2D0', width=10)
    body += path('M118 175 104 150m283 62 22-17M77 267l-16-3', stroke='#C9B27A', width=10)
    body += circle(354, 137, 12, '#DDC393')+circle(153, 123, 8, '#DDC393')
    emit('miss-dust', 'Miss · soft sand puff', body, 'miss', [108, 108], anchor=(256, 348), durationMs=420, animation={'fromScale': .7, 'toScale': 1.15, 'risePx': 12, 'fadeAfter': .1}, usage='Miss on sand only. Place anchor at ground contact; use the game water splash for water.')


def boar(frame):
    # Shared front-facing construction: the existing CC0 boarDefense.svg is
    # the silhouette reference; game PAL.scout supplies the material colors.
    # ImageGen supplied a three-pose art-direction reference, not raster data.
    ears = [
        ('M146 175 68 161 49 238 121 225Z', 'M366 175 444 161 463 238 391 225Z'),
        ('M148 169 66 104 65 201 119 255Z', 'M364 169 446 104 447 201 393 255Z'),
        ('M148 169 66 104 65 201 119 255Z', 'M366 175 437 191 466 258 389 232Z'),
    ][frame-1]
    out = ''.join(path(d, '#5F7A84', INK, 10) for d in ears)
    inner = [
        ('M129 184 77 179 64 220 114 210Z', 'M383 184 435 179 448 220 398 210Z'),
        ('M127 173 80 130 80 195 118 231Z', 'M385 173 432 130 432 195 394 231Z'),
        ('M127 173 80 130 80 195 118 231Z', 'M387 190 425 204 446 240 394 218Z'),
    ][frame-1]
    out += ''.join(path(d, '#B66F50', 'none', 0) for d in inner)
    out += path('M151 119 203 103h106l52 16 43 73 29 114-39 85-66 45H184l-66-45-39-85 29-114Z', '#3C5960', INK, 10)
    out += path('M124 194 161 147 351 147 388 194 400 305 365 362H147l-35-57Z', '#D49A7C', INK, 8)
    out += path('M131 208 157 178h198l29 30-14 82-38 51H178l-38-51Z', '#C88865', 'none', 0)
    out += path('M131 208 157 178h198l29 30-31-12H164Z', '#E4B393', 'none', 0)
    out += path('M116 195 146 132 185 112h142l39 20 30 63-46-18H162Z', '#5F7A84', INK, 9)
    out += path('M148 139 177 122h158l30 17-18 20H166Z', '#8099A0', 'none', 0)
    out += path('M165 160h184', stroke='#ADC0BD', width=5)
    out += path('M226 120 219 61l15-15h44l15 15-7 59Z', '#C9B27A', INK, 9)
    out += path('M234 58h44l5 13h-48Z', '#F1D493', 'none', 0)
    out += path('M236 74h46l-8 36h-30Z', '#B39355', 'none', 0)
    out += path('M118 225 91 299 121 348l23-24-12-41 14-53Z', '#5F7A84', INK, 8)
    out += path('M394 225 421 299 391 348l-23-24 12-41-14-53Z', '#5F7A84', INK, 8)
    for x, y in [(187, 180), (325, 180), (115, 279), (397, 279)]:
        out += circle(x, y, 10, '#C9B27A', INK, 4)+circle(x-2, y-3, 3, '#F1D493')
    brows = [
        ('M158 224 185 205 222 211 220 233 185 227 163 239Z', 'M290 211 327 205 354 224 349 239 327 227 292 233Z'),
        ('M155 208 187 187 226 205 218 228 187 212 160 228Z', 'M286 205 325 187 357 208 352 228 325 212 294 228Z'),
        ('M158 218 184 204 222 206 220 229 184 226 163 239Z', 'M290 206 328 214 355 231 346 246 323 235 291 229Z'),
    ][frame-1]
    out += ''.join(path(d, '#D7B66D', INK, 6) for d in brows)
    if frame == 2:
        for x in [192, 320]:
            out += f'<ellipse cx="{x}" cy="269" rx="30" ry="44" fill="#FFF8E8" stroke="{INK}" stroke-width="7"/>'
            out += f'<ellipse cx="{x+4}" cy="275" rx="10" ry="17" fill="{INK}"/>'
    else:
        for x in [192, 320]:
            out += rect(x-16, 244, 32, 50 if frame == 1 else 45, INK, 13)+rect(x-8, 252, 9, 13, WHITE, 2)
    for side in [0, 1]:
        tusk = path('M162 350q-38-5-30-45 3-12 12-20-1 34 29 34Z', '#ECE0BB', INK, 7)
        tusk += path('M139 314q2 20 22 25', stroke=WHITE, width=6)
        out += tusk if side == 0 else '<g transform="translate(512 0) scale(-1 1)">'+tusk+'</g>'
    out += path('M203 315 228 298h56l25 17 25 32-5 41-32 33h-82l-32-33-5-41Z', '#E2AE95', INK, 8)
    out += path('M203 315 228 298h56l25 17 11 15H192Z', '#F3C3A2', 'none', 0)
    out += path('M190 374h132l-25 42h-82Z', '#C08768', 'none', 0)
    for x in [234, 278]:
        out += path(f'M{x-8} 341 {x} 335l8 6v24l-8 6-8-6Z', '#754A39', 'none', 0)
    if frame == 3:
        out += '<ellipse cx="256" cy="395" rx="12" ry="17" fill="#102731"/>'
    if frame == 2:
        out += path('M357 80 372 35l16 8-23 41Z', GOLD, INK, 5)
        out += path('M379 94 408 64l12 14-34 23Z', GOLD, INK, 5)
    emit(f'boar-surprise-0{frame}', f'Robot boar surprise · frame {frame}', out, 'boar', [128, 128],
         anchor=(256, 436), sequence='boar-surprise', frame=frame, durationMs=[90, 140, 170][frame-1],
         usage='Play 01 → 02 → 03 once, then restore the game model. Fixed head, snout and bottom anchor across all frames.')


def meter_assets():
    frame = rect(204, 36, 104, 440, '#102731', 24, '#C9B27A', 5)
    frame += rect(224, 64, 64, 376, '#071A22', 14, '#607B80', 3)
    for y in [86, 170, 254, 338, 422]:
        frame += path(f'M208 {y}h8m80 0h8', stroke='#C9B27A', width=4)
    frame += path('M244 455h24', stroke=WHITE, width=4)
    fill = '<defs><linearGradient id="charge" x1="0" y1="1" x2="0" y2="0"><stop stop-color="#70D9AB"/><stop offset=".62" stop-color="#FFD06B"/><stop offset="1" stop-color="#F07867"/></linearGradient></defs>'
    fill += rect(230, 70, 52, 364, 'url(#charge)', 9)
    for y in range(102, 434, 33):
        fill += path(f'M231 {y}h50', stroke=INK, width=5, opacity='.55')
    emit('power-frame', 'Power meter · fixed frame', frame, 'power', [256, 256], usage='Layer with power-fill. Full canvas is square; visible frame occupies x=204…308, y=36…476.')
    emit('power-fill', 'Power meter · bottom-up fill', fill, 'power', [256, 256], fillBoundsPx=[230, 70, 52, 364], usage='Reveal with a bottom-anchored clip from y=434 upward; do not scale the full texture.')
    thumb = path('M186 256 209 241v30Z', GOLD, INK, 5)+path('M326 256 303 241v30Z', GOLD, INK, 5)
    emit('power-thumb', 'Power meter · charge marker', thumb, 'power', [256, 256], usage='Translate vertically by (434 − power × 364 − 256) master px. Keep the same layer size as the frame.')
    emit('power-meter', 'Power meter · complete reference', frame+fill+'<g transform="translate(0 -186)">'+thumb+'</g>', 'power', [256, 256], usage='Full-charge composition reference; runtime should use separate frame, fill and marker layers.')


def main():
    aim_assets()
    reticle('reticle-green', GREEN, 'circle', 'Reticle · within range', {'min': 0, 'maxInclusive': .6})
    reticle('reticle-yellow', YELLOW, 'diamond', 'Reticle · range edge', {'minExclusive': .6, 'maxInclusive': 1})
    reticle('reticle-red', RED, 'brackets', 'Reticle · beyond effective range', {'minExclusive': 1})
    effects()
    for frame in range(1, 4):
        boar(frame)
    meter_assets()
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium'), args=['--no-sandbox'])
        page = browser.new_page()
        for asset in assets:
            svg = (ROOT/asset['formats']['svg']).read_text()
            ET.fromstring(svg)
            for size in [256, 512]:
                encoded = page.evaluate('''async ({svg,size}) => {
                  const blob = new Blob([svg], {type:'image/svg+xml'}), url=URL.createObjectURL(blob);
                  try {
                    const img = new Image(); img.src=url; await img.decode();
                    const c=document.createElement('canvas'); c.width=c.height=size;
                    c.getContext('2d').drawImage(img,0,0,size,size);
                    return c.toDataURL('image/png').split(',')[1];
                  } finally { URL.revokeObjectURL(url); }
                }''', {'svg': svg, 'size': size})
                dest = ROOT/asset['formats'][f'png{size}']
                dest.parent.mkdir(parents=True, exist_ok=True)
                img = Image.open(BytesIO(b64decode(encoded))).convert('RGBA')
                img.save(dest, optimize=True)
            files = []
            for fmt, name in asset['formats'].items():
                dest = ROOT/name
                raw = dest.read_bytes()
                assert len(raw) <= 500_000, f'File too large: {dest}'
                item = {'format': fmt, 'path': name, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}
                if fmt.startswith('png'):
                    img = Image.open(dest)
                    assert img.mode == 'RGBA' and img.size == (int(fmt[3:]),)*2
                    alpha = img.getchannel('A')
                    assert alpha.getextrema() == (0, 255)
                    assert all(img.getpixel(pt)[3] == 0 for pt in [(0,0),(0,img.height-1),(img.width-1,0),(img.width-1,img.height-1)])
                    box = alpha.getbbox()
                    assert box[0] > 0 and box[1] > 0 and box[2] < img.width and box[3] < img.height, f'Clipped artwork: {dest}: {box}'
                    item.update(width=img.width, height=img.height, alpha=True, visibleBoundsPx=list(box))
                files.append(item)
            asset['files'] = files
        browser.close()
    manifest = dict(schemaVersion=1, id='boars-aim-v1', version='1.0.0', date='2026-11-14',
                    branch='codex/boars-aim-v1', baseCommit='19d9cdc5e3718236df5a2fc4d8b8c26c72007575',
                    scope='Design assets and standalone preview; not integrated into the game.',
                    license='CC0-1.0', maxFileBytes=500_000, pngSizes=[256,512],
                    svgMasterSize=[512,512], premultipliedAlpha=False, colorSpace='sRGB',
                    palette={'ink':INK,'paper':WHITE,'green':GREEN,'yellow':YELLOW,'red':RED,'steel':'#5F7A84','brass':'#C9B27A','skin':'#D49A7C'},
                    references=[{'path':'../ui-kit-v2/intro/boarDefense.svg','license':'CC0-1.0','purpose':'boar silhouette and vector language'},
                                {'path':'../../minigames/boar-island/game.js','purpose':'PAL.scout and island material palette'},
                                {'tool':'OpenAI ImageGen','purpose':'three-pose art-direction reference; final SVGs are editable paths, not embedded raster images'}],
                    distancePolicy={'units':'distance / selected weapon effective range','green':'0 ≤ ratio ≤ 0.60','yellow':'0.60 < ratio ≤ 1.00','red':'ratio > 1.00','statusTextRequired':True,'nullPrediction':'Hide line, endpoint and reticle; show a textual no-surface state.','thresholds':'Design defaults, not existing game balance. Supply actual weapon range and collision prediction during integration.'},
                    sequences={'boar-surprise':{'frames':['boar-surprise-01','boar-surprise-02','boar-surprise-03'],'frameDurationsMs':[90,140,170],'loop':False,'anchorPx':[256,436],'reducedMotion':'Hold frame 02 for 400ms; no scale or translation.'}},
                    preview={'entry':'preview.html','viewport':[844,390],'scene':'preview-scene.webp','sceneRole':'Preview-only capture of the existing local game; not a transparent runtime asset.','input':'Touch or drag the scene; distance and power sliders; fire, variation, reaction and gallery buttons.','noNetwork':True},
                    assets=assets)
    (ROOT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'assets':len(assets),'files':len(assets)*3,'maxAssetBytes':max(f['bytes'] for a in assets for f in a['files'])}))


if __name__ == '__main__':
    main()
