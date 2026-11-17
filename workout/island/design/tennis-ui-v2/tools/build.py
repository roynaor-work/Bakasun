#!/usr/bin/env python3
"""Original vector sources and exact Chromium PNG exports. Writes only this package."""
import base64
import hashlib
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PALETTE = dict(ink='#173f36', deep='#102e29', cream='#f5efdc', brass='#d4bf82',
               clay='#b76c4c', red='#e15c4f', redDark='#7c322d', dust='#e8b68b',
               dustLight='#f3d4ac', lime='#d8df91', yellow='#e4c66b',
               green='#80bf89', purple='#b397cf')
INK, DEEP, CREAM, BRASS = [PALETTE[k] for k in ('ink','deep','cream','brass')]
CONTROLS = [
    dict(id='serve', labelHe='הגשה', keyboard='Space', group='bottom-right'),
    dict(id='slice', labelHe='חיתוך', keyboard='S', group='bottom-right'),
    dict(id='drop', labelHe='דרופ', keyboard='D', group='bottom-right'),
    dict(id='smash', labelHe='סמאש', keyboard='X', group='bottom-right'),
    dict(id='placement', labelHe='בחירת מיקום', keyboard='A', group='center-right'),
    dict(id='brake', labelHe='בלימה', keyboard='B', group='bottom-left'),
]
EFFECTS = [
    dict(id='power-serve', labelHe='הגשה חזקה', durationMs=460, fadeOutMs=240,
         sizePx=104, scale=[.75,1.16], rotateDeg=0, anchorSpace='ball-contact'),
    dict(id='spin', labelHe='ספין', durationMs=640, fadeOutMs=280,
         sizePx=88, scale=[.86,1.12], rotateDeg=32, anchorSpace='ball-contact'),
    dict(id='perfect-green', labelHe='ירוק מושלם', durationMs=700, fadeOutMs=300,
         sizePx=96, scale=[.72,1.18], rotateDeg=0, anchorSpace='ball-contact'),
    dict(id='out', labelHe='יצא', durationMs=1500, fadeOutMs=0,
         sizePx=52, scale=[1,1], rotateDeg=0, anchorSpace='court-contact'),
    dict(id='net', labelHe='רשת', durationMs=900, fadeOutMs=220,
         sizePx=78, scale=[.92,1.02], rotateDeg=0, anchorSpace='net-contact'),
]
METER = dict(states=['moving','locked','hidden'], sizePx=[32,176], railWidthPx=12,
             trackY=[14,162], positionConvention='0 = top; 1 = bottom; y = 14 + 148*p',
             cycleMs=1400, travelRange=[.06,.94], settleMs=220, lockHoldMs=420,
             hideFadeMs=180, hiddenAtMsAfterLock=600,
             bands=[dict(id='red',ranges=[[0,.18],[.82,1]]),
                    dict(id='yellow',ranges=[[.18,.34],[.66,.82]]),
                    dict(id='green',ranges=[[.34,.46],[.54,.66]]),
                    dict(id='purple',ranges=[[.46,.54]])],
             note='Purple is the narrow center peak; green flanks it. Bands are visual examples, not scoring rules.')

def svg(body, width=128, height=128):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
            f'viewBox="0 0 {width} {height}" fill="none" stroke-linecap="round" '
            f'stroke-linejoin="round">{body}</svg>\n')

def path(d, stroke='currentColor', width=5, extra=''):
    return f'<path d="{d}" stroke="{stroke}" stroke-width="{width}" {extra}/>'

def ball(x,y,r=8,color=CREAM):
    return (f'<circle cx="{x}" cy="{y}" r="{r}" fill="{color}"/>'
            +path(f'M{x-r*.7:g} {y-r*.7:g}Q{x+r*.5:g} {y:g} {x-r*.2:g} {y+r*.9:g}',DEEP,2))

def glyph(name, color, accent):
    if name == 'serve':
        return (f'<ellipse cx="61" cy="65" rx="15" ry="21" transform="rotate(35 61 65)" stroke="{color}" stroke-width="5"/>'
                +path('m49 82-14 19',color,7)+path('m52 56 19 15m-20 0 16-21',color,2)
                +ball(84,34,7,accent)+path('M84 51v20m-6-7 6 7 6-7',accent,4))
    if name == 'slice':
        return (path('M34 72Q61 32 92 58',color,5)+path('m80 43 12 15-18 2',color,5)
                +path('m42 88 44-13',accent,6)+path('m42 98 29-9',accent,3)+ball(37,53,7,color))
    if name == 'drop':
        return (path('M32 61Q62 24 86 57Q97 72 79 86',color,5)
                +path('m79 72 0 14 15-3',color,5)+ball(33,62,7,accent)
                +path('M59 98h35',accent,4)+path('M64 106h22',accent,2))
    if name == 'smash':
        return (path('m71 27-27 40h21l-8 34 31-46H66Z',color,5, f'fill="{color}"')
                +path('m33 38 7 11m49 33 9 7m-65-7 7-3',accent,3))
    if name == 'placement':
        return (f'<circle cx="64" cy="65" r="22" stroke="{color}" stroke-width="4"/>'
                f'<circle cx="64" cy="65" r="6" fill="{accent}"/>'
                +path('M64 29v12m0 48v12M28 65h12m48 0h12',color,5))
    return (path('M43 79 32 65Q27 59 23 64Q20 68 25 76l16 20Q47 104 58 104h15Q91 104 91 85V58Q91 51 85 51Q79 51 79 58V43Q79 36 73 36Q67 36 67 43V34Q67 27 61 27Q55 27 55 34v9Q55 36 49 36Q43 36 43 43Z',color,4)
            +path('M55 43v27m12-27v25m12-10v15',color,3)+path('M55 88h22',accent,4))

def button(name,state):
    pressed = state == 'pressed'
    disabled = state == 'disabled'
    primary = name == 'serve'
    fill = BRASS if pressed else (INK if primary else DEEP)
    opacity = '.54' if disabled else '.94'
    color = DEEP if pressed else ('#99aaa0' if disabled else CREAM)
    accent = INK if pressed else ('#99aaa0' if disabled else BRASS)
    border = '#82958b' if disabled else (CREAM if pressed else BRASS)
    body = f'<rect x="7" y="10" width="114" height="112" rx="30" fill="{DEEP}" opacity=".20"/>'
    body += f'<rect x="7" y="6" width="114" height="112" rx="30" fill="{fill}" fill-opacity="{opacity}" stroke="{border}" stroke-width="2"'
    body += ' stroke-dasharray="4 6"/>' if disabled else '/>'
    body += path('M36 13h56',border,2,'opacity=".6"')
    if primary and not disabled:
        body += '<path d="M18 35a24 24 0 0 1 24-20h44" stroke="#d4bf82" stroke-width="3"/>'
    body += f'<g color="{color}" transform="translate(0 {2 if pressed else 0})">{glyph(name,color,accent)}</g>'
    if pressed:
        body += f'<circle cx="105" cy="18" r="7" fill="{CREAM}"/>'
    return svg(body)

def rail():
    return ('<defs><linearGradient id="quality" x1="0" y1="14" x2="0" y2="162" gradientUnits="userSpaceOnUse">'
            +''.join(f'<stop offset="{p}" stop-color="{c}"/>' for p,c in [
                ('0',PALETTE['red']),('.18',PALETTE['red']),('.22',PALETTE['yellow']),
                ('.32',PALETTE['yellow']),('.36',PALETTE['green']),('.45',PALETTE['green']),
                ('.46',PALETTE['purple']),('.54',PALETTE['purple']),('.55',PALETTE['green']),
                ('.64',PALETTE['green']),('.68',PALETTE['yellow']),('.78',PALETTE['yellow']),
                ('.82',PALETTE['red']),('1',PALETTE['red'])])+ '</linearGradient></defs>'
            +f'<rect x="9" y="1" width="22" height="174" rx="11" fill="{DEEP}" fill-opacity=".52" stroke="{CREAM}" stroke-opacity=".48"/>'
            +'<rect x="14" y="14" width="12" height="148" rx="6" fill="url(#quality)" fill-opacity=".90"/>'
            +f'<path d="M12 82h16m-16 12h16" stroke="{CREAM}" stroke-opacity=".8"/>'
            +f'<path d="M18 88h4" stroke="{CREAM}" stroke-width="2"/>')

def needle():
    return (path('M2 6h27',DEEP,4)+path('M2 6h27',CREAM,2)
            +f'<path d="m1 1 8 5-8 5Z" fill="{CREAM}" stroke="{DEEP}" stroke-width="1"/>')

def effect(name):
    red, green, lime = [PALETTE[k] for k in ('red','green','lime')]
    if name=='power-serve':
        body = (path('m39 183 101-77',DEEP,32, 'opacity=".25"')
                +path('m39 183 101-77',BRASS,20,'opacity=".45"')
                +path('m57 168 94-73',CREAM,8)+path('m45 137 69-53',BRASS,5)
                +path('m91 196 72-57',BRASS,5)+ball(160,91,23,lime)
                +path('M163 41v-14m35 35 12-9m-4 45h17',CREAM,5)
                +path('m113 52-8-11',BRASS,4))
    elif name=='spin':
        body = (f'<circle cx="128" cy="128" r="76" stroke="{DEEP}" stroke-width="16" opacity=".24"/>'
                +path('M63 145a68 68 0 0 1 108-70',CREAM,8)
                +path('m165 52 9 26-27 2',CREAM,8)
                +path('M194 111a68 68 0 0 1-107 71',BRASS,8)
                +path('m91 205-7-26 26-1',BRASS,8)+ball(128,128,26,lime)
                +path('m49 83 7-10m144 104 7-11',CREAM,3))
    elif name=='perfect-green':
        body = (f'<circle cx="128" cy="128" r="66" stroke="{DEEP}" stroke-width="22" opacity=".25"/>'
                f'<circle cx="128" cy="128" r="66" stroke="{green}" stroke-width="11"/>'
                +path('m94 128 23 24 46-49',CREAM,10)
                +path('M128 29v15m0 168v15M29 128h15m168 0h15',BRASS,5)
                +path('m58 58 10 10m120 120 10 10m0-140-10 10M68 188l-10 10',green,4))
    elif name=='out':
        body = (path('m83 83 90 90m0-90-90 90',DEEP,38,'opacity=".5"')
                +path('m83 83 90 90m0-90-90 90',CREAM,27)
                +path('m83 83 90 90m0-90-90 90',red,18)
                +path('m83 81 90 90', '#f3ad91',3))
    else:
        body = (f'<rect x="48" y="109" width="160" height="81" rx="4" fill="{DEEP}" fill-opacity=".6" stroke="{CREAM}" stroke-width="5"/>'
                +path('M48 126h160M48 148h160M48 170h160M69 109v81m24-81v81m23-81v81m24-81v81m23-81v81m24-81v81',BRASS,2)
                +path('M45 104h166',CREAM,7)+ball(121,83,18,PALETTE['lime'])
                +path('M149 54q43 32 15 64',red,6)+path('m158 103 6 16 17-5',red,6)
                +path('m80 65-9-8m41-19 1-11',CREAM,4))
    return svg(body,256,256)

def descriptor(relative, width, height):
    data=(ROOT/relative).read_bytes()
    return dict(path=relative,width=width,height=height,bytes=len(data),sha256=hashlib.sha256(data).hexdigest())

def main():
    assets=[]
    source=[]
    for control in CONTROLS:
        control['states']={state:f"button-{control['id']}-{state}" for state in ['idle','pressed','disabled']}
        for state,identifier in control['states'].items():
            source.append((identifier,'buttons',button(control['id'],state),128,128,
                           dict(role='button',control=control['id'],state=state,displaySizePx=[56,56],anchor=[.5,.5])))
    for name,body,w,h in [
        ('track',rail(),32,176),('needle',needle(),32,12),
        ('moving',rail()+f'<g transform="translate(0 49.44)">{needle()}</g>',32,176),
        ('locked',rail()+f'<rect x="10" y="76" width="20" height="24" rx="8" stroke="{BRASS}" stroke-width="2"/>'
         +f'<g transform="translate(0 82)">{needle()}</g>',32,176),
        ('hidden','',32,176),
    ]:
        source.append((f'meter-{name}','meter',svg(body,w,h),w,h,
                       dict(role='meter-'+name,displaySizePx=[w,h],anchor=[1,.5])))
    for fx in EFFECTS:
        fx['asset']='fx-'+fx['id']
        source.append((fx['asset'],'fx',effect(fx['id']),256,256,
                       dict(role='effect',displaySizePx=[fx['sizePx']]*2,anchor=[.5,.5])))
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox'])
        page=browser.new_page()
        for identifier,group,markup,w,h,metadata in source:
            svg_path=f'svg/{group}/{identifier}.svg'
            png_path=f'png/{group}/{identifier}.png'
            (ROOT/svg_path).parent.mkdir(exist_ok=True,parents=True)
            (ROOT/png_path).parent.mkdir(exist_ok=True,parents=True)
            (ROOT/svg_path).write_text(markup,encoding='utf-8')
            result=page.evaluate('''async ({markup,w,h}) => {
                const img=new Image();
                img.src='data:image/svg+xml;base64,'+btoa(markup);
                await img.decode();
                const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
                canvas.getContext('2d').drawImage(img,0,0,w,h);
                return canvas.toDataURL('image/png').split(',')[1];
            }''',dict(markup=markup,w=w,h=h))
            (ROOT/png_path).write_bytes(base64.b64decode(result))
            assets.append(dict(id=identifier,svg=descriptor(svg_path,w,h),png=descriptor(png_path,w,h),**metadata))
        chromium_version=browser.version
        browser.close()
    config=dict(controls=CONTROLS,effects=EFFECTS,meter=METER,
                assets={a['id']:dict(svg=a['svg']['path'],png=a['png']['path']) for a in assets})
    (ROOT/'tennis-config.js').write_text('// Generated by tools/build.py; no network or module loader needed.\nwindow.TENNIS_UI_V2_CONFIG = '
                                         +json.dumps(config,ensure_ascii=False,indent=2)+';\n',encoding='utf-8')
    manifest=dict(schemaVersion=2,id='tennis-ui-v2',version='2.0.0',created='2026-11-17',locale='he-IL',
        branch='codex/tennis-ui-v2',baseCommit='43b27dc235387e3cb737aee9558cdf9d5fd5a262',license='CC0-1.0',
        styleReference=dict(repository='roynaor-work/Bakasun',branch='codex/tennis-ui-fx-v1',
                            commit='1861d9f488003e50bc1e7810d1e4506651c05851',
                            path='workout/island/design/tennis-ui-fx-v1',
                            description='Forest green, cream, brass, clay; warm highlights and rounded clean strokes.'),
        palette=PALETTE,controls=CONTROLS,meter=METER,effects=EFFECTS,assets=assets,
        layout=dict(referenceViewport=[844,390],minHitTargetPx=56,gapPx=12,
                    meterRect=[796,97,32,176],centerClearRect=[198,92,440,198],
                    bottomRightOrderLeftToRight=['slice','drop','smash','serve'],
                    bottomRightButtonRects=[[540,306,56,56],[608,306,56,56],[676,306,56,56],[744,306,56,56]],
                    placementButtonRect=[712,166,56,56],brakeButtonRect=[24,306,56,56],
                    safeArea='CSS env(safe-area-inset-*); physical right is stable in RTL; controls reflow below 620px.'),
        integration=dict(scope='New assets and isolated preview only; game integration is a separate task.',
            entrypoints=['tennis-config.js','tennis-ui.css','tennis-ui.js'],
            globalAPI='TennisUIV2.create(root, {config, assetBase, onServe, onAction})',
            start='startServe(); click/Space locks the visible position; setPosition(p) supports authoritative samples.',
            stop='endServe() hides meter and serve control immediately, including when called during a lock.',
            serveLifecycle='moving → locked (220ms settle, 420ms hold total) → hidden (180ms fade). Serve button and aim marker leave at 420ms. Meter is fully removed at 600ms. Hit FX have finite lifetimes.',
            controls='idle / pressed / disabled. Disabled is a native disabled button. Placement is an aria-pressed toggle; brake is held using pointer capture or keydown/keyup.',
            eventPolicy='Consume authoritative game outcomes; color bands, court and effects in preview do not calculate scores or legal serves.',
            noTextBaked=True,text='Live Hebrew DOM labels and aria-live status; no SVG text, glyph outlines, fonts or external images.',
            texture=dict(transparent=True,colorSpace='sRGB',alpha='straight; renderer owns premultiplication',depthWrite=False),
            anchor='Normalized [x,y], top-left origin. Top-left = eventPoint − anchor * displaySize. Reproject court/net world contacts every frame.',
            layering=['court','placement marker','contact FX','ball','HUD'],
            clock='Active time only. setPaused(true) and document.hidden freeze meter, lock and all FX without consuming lifetime.',
            reducedMotion='Static pointer at 0.5 unless caller sets position; lock/hide still work. Static FX at full opacity for their duration; no rotation, scaling or settling.',
            input='Touch, mouse and keyboard. No document-wide preventDefault except matched shortcuts outside editable elements.',
            limits='No gameplay logic changes, no real-device performance claim, no runtime court or character assets.'),
        provenance=dict(art='Original hand-authored SVG geometry for this package; all PNGs rasterized from those exact sources.',
                        fonts='system-ui only; no font files',generator='tools/build.py',rasterizer='Chromium '+chromium_version),
        maxFileBytes=400000)
    (ROOT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(dict(assets=len(assets),exports=len(assets)*2,graphicsBytes=sum(a[f]['bytes'] for a in assets for f in ['svg','png']),chromium=chromium_version)))

if __name__=='__main__': main()
