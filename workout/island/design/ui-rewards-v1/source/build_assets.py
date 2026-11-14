#!/usr/bin/env python3
"""Rebuild original vector rewards and lossless 256px exports. No network access.

Requires Python 3, Pillow and Playwright; CHROMIUM_PATH defaults to /usr/bin/chromium.
Run from any directory: python source/build_assets.py
"""
import base64
import hashlib
import io
import json
import os
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
INK = '#173E40'
PAPER = '#FFFCF4'
STAR = 'M128 31 Q132 31 135 39 L158 86 211 94 Q222 96 214 105 L176 143 185 197 Q187 208 177 203 L128 178 79 203 Q69 208 71 197 L80 143 42 105 Q34 96 45 94 L98 86 121 39 Q124 31 128 31Z'
ASSETS = []


def gradient(name, top, bottom):
    return f'<linearGradient id="{name}" x1="0" y1="0" x2="0" y2="1"><stop stop-color="{top}"/><stop offset="1" stop-color="{bottom}"/></linearGradient>'


DEFS = gradient('gold', '#FFE8A0', '#E9BA57') + gradient('sea', '#36978A', '#24786D') + gradient('coral', '#FFBEA5', '#EB947F')


def spark(x, y, size=12, color='#E9BA57'):
    return f'<path d="M{x} {y-size}Q{x+2} {y-2} {x+size} {y}Q{x+2} {y+2} {x} {y+size}Q{x-2} {y+2} {x-size} {y}Q{x-2} {y-2} {x} {y-size}Z" fill="{color}"/>'


def star_shape(fill='url(#gold)', stroke='#9E671F', width=7):
    return f'<path d="{STAR}" fill="{fill}" stroke="{stroke}" stroke-width="{width}" stroke-linejoin="round"/>'


def star(state='full', frame=None):
    empty = star_shape('#E6ECE1', '#82948A')
    full = star_shape() + '<path d="m113 77 14-29 12 26" fill="none" stroke="#FFFCF4" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>'
    if frame is not None:
        if frame == 0:
            return empty
        if frame == 7:
            return full
        scales = [1, .72, .88, 1.08, 1.13, 1.04, .98, 1]
        # Warm color fades in without white flashes. Peak silhouette stays in 256px.
        opacity = [0, .35, .7, 1, 1, 1, 1, 1][frame]
        s = scales[frame]
        bits = empty + f'<g transform="translate(128 128) scale({s}) translate(-128 -128)" opacity="{opacity}">{full}</g>'
        if frame in (3, 4, 5):
            bits += spark(222, 51, 9) + spark(32, 190, 7, '#EB947F')
        return bits
    if state == 'empty':
        return empty
    if state == 'half':
        return '<defs><clipPath id="half"><rect x="128" width="128" height="256"/></clipPath></defs>' + empty + f'<g clip-path="url(#half)">{full}</g><path d="M128 39V176" stroke="#9E671F" stroke-width="3"/>'
    return full


def medal(kind):
    colors = {'bronze': ('#F5CEA0', '#BA784A', '#7F4C30'), 'silver': ('#F0F5F5', '#A8BCC3', '#596F7A'), 'gold': ('#FFE8A0', '#E9BA57', '#9E671F'), 'diamond': ('#D9FCFA', '#64C5D1', '#286B82')}
    top, bottom, line = colors[kind]
    body = '<path d="M69 28H108L138 111 100 137Z" fill="#24786D" stroke="#173E40" stroke-width="6" stroke-linejoin="round"/><path d="M148 28H187L156 137 118 111Z" fill="#EB947F" stroke="#173E40" stroke-width="6" stroke-linejoin="round"/><path d="m81 33 30 77m63-77-25 77" stroke="#FFFCF4" stroke-opacity=".5" stroke-width="7"/>'
    body += f'<defs>{gradient("metal", top, bottom)}</defs><circle cx="128" cy="158" r="73" fill="{line}"/><circle cx="128" cy="151" r="73" fill="url(#metal)" stroke="{line}" stroke-width="7"/><circle cx="128" cy="151" r="57" fill="none" stroke="{line}" stroke-width="3" opacity=".55"/><path d="M77 130a55 55 0 0 1 51-34" fill="none" stroke="#FFFCF4" stroke-width="7" stroke-linecap="round" opacity=".8"/>'
    if kind == 'diamond':
        body += '<path d="m128 111 32 19-32 53-32-53Z" fill="#FFFCF4" stroke="#286B82" stroke-width="5" stroke-linejoin="round"/><path d="m96 130 32 3 32-3m-32-19-13 20 13 52 13-52Z" fill="none" stroke="#64C5D1" stroke-width="3"/>'
    else:
        # Different center symbols make tiers distinguishable beyond color alone.
        if kind == 'bronze':
            body += '<circle cx="128" cy="151" r="22" fill="#FFFCF4" stroke="#7F4C30" stroke-width="5"/>'
        elif kind == 'silver':
            body += '<path d="m128 120 25 31-25 31-25-31Z" fill="#FFFCF4" stroke="#596F7A" stroke-width="5" stroke-linejoin="round"/>'
        else:
            body += f'<g transform="translate(80 103) scale(.375)">{star_shape(PAPER, line, 10)}</g>'
    return body


def trophy():
    return '<ellipse cx="128" cy="229" rx="78" ry="11" fill="#173E40" opacity=".12"/><path d="M82 64H42v23q0 44 51 49m81-72h40v23q0 44-51 49" fill="none" stroke="#9E671F" stroke-width="14" stroke-linecap="round"/><path d="M82 60H43m131 0h39" stroke="#FFE8A0" stroke-width="7" stroke-linecap="round"/><path d="M77 39h102v58q0 62-51 62T77 97Z" fill="url(#gold)" stroke="#9E671F" stroke-width="7"/><path d="M91 53v41q0 35 16 44" stroke="#FFFCF4" stroke-width="9" stroke-linecap="round" fill="none" opacity=".8"/><g transform="translate(83 49) scale(.35)">' + star_shape(PAPER, '#C28B32', 9) + '</g><path d="M115 159h26v29h23l15 34H77l15-34h23Z" fill="url(#sea)" stroke="#173E40" stroke-width="7" stroke-linejoin="round"/><path d="M99 200h58" stroke="#B9DDC8" stroke-width="6" stroke-linecap="round"/>' + spark(33, 37, 13, '#EB947F') + spark(222, 151, 12)


def coin(x=128, y=128, scale=1):
    return f'<g transform="translate({x} {y}) scale({scale}) translate(-128 -128)"><circle cx="128" cy="137" r="84" fill="#9E671F"/><circle cx="128" cy="126" r="84" fill="url(#gold)" stroke="#9E671F" stroke-width="7"/><circle cx="128" cy="126" r="65" fill="none" stroke="#C28B32" stroke-width="5"/><path d="M73 100a61 61 0 0 1 44-35" fill="none" stroke="#FFFCF4" stroke-width="8" stroke-linecap="round"/><g transform="translate(77 73) scale(.4)">{star_shape(PAPER, "#C28B32", 9)}</g></g>'


def gift(frame=0):
    lifts = [0, -4, -10, -24, -39, -48, -46, -44]
    angles = [0, -3, 4, -6, -10, -13, -11, -10]
    lift, angle = lifts[frame], angles[frame]
    body = '<ellipse cx="128" cy="235" rx="83" ry="9" fill="#173E40" opacity=".12"/>'
    if frame >= 3:
        opacity = min(1, (frame - 2) / 3)
        body += f'<g opacity="{opacity}"><path d="m80 153-20-69 47 39 20-67 24 67 47-39-22 69Z" fill="#FFE8A0"/><g transform="translate(99 71) scale(.23)">{star_shape(PAPER, "#C28B32", 12)}</g>{spark(38, 104, 9, "#EB947F")}{spark(215, 79, 11)}</g>'
    body += '<rect x="53" y="135" width="150" height="91" rx="16" fill="url(#sea)" stroke="#173E40" stroke-width="7"/><path d="M67 150v55" stroke="#B9DDC8" stroke-width="7" stroke-linecap="round" opacity=".5"/><path d="M111 138h34v85h-34Z" fill="#FFE8A0" stroke="#9E671F" stroke-width="4"/>'
    if frame >= 3:
        body += '<ellipse cx="128" cy="139" rx="68" ry="11" fill="#173E40"/><ellipse cx="128" cy="139" rx="45" ry="6" fill="#FFE8A0"/>'
    body += f'<g transform="translate(0 {lift}) rotate({angle} 128 124)"><path d="M125 102C80 98 72 66 91 62c21-4 34 29 37 37 3-8 16-41 37-37 19 4 11 36-34 40" fill="url(#coral)" stroke="#A35C44" stroke-width="6" stroke-linejoin="round"/><rect x="43" y="103" width="170" height="39" rx="11" fill="url(#sea)" stroke="#173E40" stroke-width="7"/><path d="M59 113h137" stroke="#B9DDC8" stroke-width="5" stroke-linecap="round" opacity=".5"/><path d="M110 106h36v33h-36Z" fill="#FFE8A0" stroke="#9E671F" stroke-width="4"/><circle cx="128" cy="98" r="10" fill="#E9BA57" stroke="#9E671F" stroke-width="5"/></g>'
    return body


def button(kind, state):
    pressed = state == 'pressed'
    palettes = {
        ('primary', 'default'): ('#24786D', '#173E40', '#B9DDC8'),
        ('primary', 'pressed'): ('#1C5F58', '#173E40', '#8EC1AD'),
        ('primary', 'disabled'): ('#DDE5D9', '#A8B6A7', '#FFFCF4'),
        ('secondary', 'default'): ('#FFFCF4', '#739A8B', '#FFFFFF'),
        ('secondary', 'pressed'): ('#DBEADA', '#52796B', '#FFFCF4'),
        ('secondary', 'disabled'): ('#F0F0E5', '#BBC5B7', '#FFFCF4'),
    }
    fill, line, light = palettes[(kind, state)]
    y = 13 if pressed else 5
    return f'<rect x="4" y="15" width="248" height="237" rx="48" fill="{line}"/><rect x="4" y="{y}" width="248" height="233" rx="48" fill="{fill}" stroke="{line}" stroke-width="7"/><path d="M50 {y+12}H206" stroke="{light}" stroke-width="5" opacity=".45" stroke-linecap="round"/>'


def add(id_, body, role, label, **meta):
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><defs>{DEFS}</defs>{body}</svg>\n'
    path = f'svg/{id_}.svg'
    (ROOT / path).parent.mkdir(parents=True, exist_ok=True)
    (ROOT / path).write_text(svg, encoding='utf-8')
    ASSETS.append({'id': id_, 'role': role, 'labelHe': label, 'width': 256, 'height': 256, 'textEmbedded': False, 'mirrorInRTL': False, 'license': 'CC0-1.0', 'files': {'svg': path, 'png': f'png/{id_}.png'}, **meta})


def build():
    for state, label in [('empty', 'כוכב ריק'), ('half', 'חצי כוכב'), ('full', 'כוכב מלא')]:
        add(f'star-{state}', star(state), 'rating-star', label, fillOrigin='right' if state == 'half' else None, minDisplayPx=32)
    for i in range(8):
        add(f'star-light-{i:02}', star(frame=i), 'animation-frame', 'הדלקת כוכב', frameIndex=i)
    for kind, label in [('bronze', 'ארד'), ('silver', 'כסף'), ('gold', 'זהב'), ('diamond', 'יהלום')]:
        add(f'medal-{kind}', medal(kind), 'medal', label, minDisplayPx=56)
    add('trophy', trophy(), 'reward', 'גביע', minDisplayPx=64)
    # The badge is a blank scalable skin; its Hebrew caption belongs in the DOM.
    badge = '<rect x="6" y="13" width="244" height="237" rx="62" fill="#C28B32"/><rect x="6" y="5" width="244" height="237" rx="62" fill="#FFE8A0" stroke="#9E671F" stroke-width="6"/><rect x="18" y="17" width="220" height="213" rx="50" fill="none" stroke="#FFFCF4" stroke-width="4"/>'
    add('badge-new-record', badge, 'text-surface', 'שיא חדש', nineSlice={'insets': [72]*4, 'borderWidthPx': 16}, textColor=INK, contentInsetPx=18)
    add('progress-track', '<rect x="4" y="4" width="248" height="248" rx="124" fill="#E2E9DB" stroke="#8DA498" stroke-width="7"/><path d="M56 18h144" stroke="#173E40" stroke-opacity=".09" stroke-width="8" stroke-linecap="round"/>', 'progress-track', 'מסילת התקדמות', nineSlice={'insets': [120]*4, 'borderWidthPx': 10}, direction='rtl')
    add('progress-fill', '<rect x="3" y="3" width="250" height="250" rx="125" fill="url(#sea)"/><path d="M56 23h144" stroke="#B9DDC8" stroke-width="10" stroke-linecap="round" opacity=".7"/>', 'progress-fill', 'מילוי התקדמות', nineSlice={'insets': [120]*4, 'borderWidthPx': 7}, direction='rtl')
    for kind in ['primary', 'secondary']:
        for state in ['default', 'pressed', 'disabled']:
            add(f'button-{kind}-{state}', button(kind, state), 'button-surface', ('ראשי' if kind == 'primary' else 'משני'), kind=kind, state=state, nineSlice={'insets': [64]*4, 'borderWidthPx': 16}, minTouchPx=56, textColor=(PAPER if kind == 'primary' and state != 'disabled' else '#52685D' if state == 'disabled' else INK))
    add('panel-background', '<rect x="4" y="11" width="248" height="242" rx="42" fill="#173E40" opacity=".09"/><rect x="4" y="3" width="248" height="242" rx="42" fill="#FFFCF4"/>', 'panel-background', 'רקע פאנל תוצאה', nineSlice={'insets': [56]*4, 'borderWidthPx': 24})
    add('panel-border', '<rect x="4" y="3" width="248" height="242" rx="42" fill="none" stroke="#B4CDBB" stroke-width="5"/><path d="M47 5H209" stroke="#E9BA57" stroke-width="5" stroke-linecap="round"/>', 'panel-border', 'קו פאנל תוצאה', nineSlice={'insets': [56]*4, 'borderWidthPx': 24})
    add('coin', coin(), 'currency', 'מטבע', minDisplayPx=32)
    add('coins', coin(91, 151, .72) + coin(155, 109, .72) + spark(49, 57, 11), 'currency', 'מטבעות', minDisplayPx=40)
    add('gift-closed', gift(), 'reward', 'מתנה סגורה', minDisplayPx=64, minTouchPx=56)
    add('gift-open', gift(7), 'reward', 'מתנה פתוחה', minDisplayPx=64, minTouchPx=56)
    for i in range(8):
        add(f'gift-open-{i:02}', gift(i), 'animation-frame', 'פתיחת מתנה', frameIndex=i)


def export_pngs():
    (ROOT / 'png').mkdir(exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), args=['--no-sandbox'])
        page = browser.new_page(viewport={'width': 256, 'height': 256}, device_scale_factor=1)
        page.set_content('<style>*{box-sizing:border-box}html,body{margin:0;background:transparent}img{display:block;width:256px;height:256px}</style><img alt="">')
        for asset in ASSETS:
            data = base64.b64encode((ROOT / asset['files']['svg']).read_bytes()).decode()
            page.eval_on_selector('img', 'async (img,src)=>{img.src=src; await img.decode()}', 'data:image/svg+xml;base64,' + data)
            pixels = page.screenshot(omit_background=True)
            with Image.open(io.BytesIO(pixels)) as im:
                im.save(ROOT / asset['files']['png'], optimize=True)
        browser.close()


def manifest():
    for asset in ASSETS:
        asset['exports'] = {}
        for fmt, file in asset['files'].items():
            data = (ROOT / file).read_bytes()
            asset['exports'][fmt] = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
    animations = {}
    for name, prefix, duration, final in [('star-light', 'star-light', 480, 'star-full'), ('gift-open', 'gift-open', 640, 'gift-open')]:
        animations[name] = {'frames': [f'{prefix}-{i:02}' for i in range(8)], 'frameDurationMs': duration // 8, 'durationMs': duration, 'iterations': 1, 'finalAsset': final, 'reducedMotionAsset': final}
    data = {
        'schemaVersion': 1, 'id': 'ui-rewards-v1', 'version': '1.0.0', 'date': '2026-11-14',
        'descriptionHe': 'ערכת סיום ופרסים לאי, לגיל 7. נכסי עיצוב בלבד; חיבור ללוגיקת המשחק בנפרד.',
        'license': 'CC0-1.0', 'preview': {'path': 'preview.html', 'width': 844, 'height': 390, 'direction': 'rtl', 'language': 'he'},
        'constraints': {'maxFileBytes': 300000, 'pngSize': [256, 256], 'minimumTouchTargetPx': 56, 'embeddedText': False},
        'provenance': {'method': 'Original SVG geometry and local Chromium rasterization; no generated raster imagery or third-party downloads.', 'styleReference': '../ui-kit-v2/tokens.json (CC0-1.0)', 'runtimeDependencies': []},
        'tokens': {'colors': {'ink': INK, 'paper': PAPER, 'sea': '#24786D', 'mint': '#B9DDC8', 'gold': '#E9BA57', 'coral': '#EB947F'}, 'fontFamily': 'Arial, DejaVu Sans, sans-serif', 'minTouchPx': 56, 'focusRing': '3px solid #173E40', 'focusOffsetPx': 3},
        'integration': {'icons': 'Use contain. Do not stretch or mirror reward icons.', 'surfaces': 'Use nineSlice.insets in top/right/bottom/left source pixels with CSS border-image, including fill. Use borderWidthPx as destination CSS pixels. Layer panel-border above panel-background.', 'progress': 'Clip fill from the right; hide fill entirely at 0%. At widths below 14px reduce fill border-image-width to min(7px, half the fill width).', 'text': 'Render captions and values in HTML, lang=he dir=rtl; isolate numbers with bdi. Badge has no baked-in caption.', 'rating': 'Three independent star slots, starting at the right. Example 2.5 = full, full, half. Half is filled on the right. Announce the total once.', 'motion': 'Preload all eight frames, play once on an explicit result/reward event, hold finalAsset. Respect prefers-reduced-motion. Cancel previous runs on replay.', 'sampleValues': 'Preview values are invented UI fixtures, not scoring or economy rules.'},
        'assets': ASSETS, 'animations': animations,
        'totals': {'assetPairs': len(ASSETS), 'svgFiles': len(ASSETS), 'pngFiles': len(ASSETS), 'assetBytes': sum(e['bytes'] for a in ASSETS for e in a['exports'].values()), 'largestAssetBytes': max(e['bytes'] for a in ASSETS for e in a['exports'].values())},
    }
    (ROOT / 'manifest.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    # Classic script allows the preview to work directly from file:// as well as HTTP.
    (ROOT / 'catalog.js').write_text('/* Generated by source/build_assets.py. CC0-1.0. */\nwindow.REWARD_KIT = ' + json.dumps({'assets': [{k: v for k, v in a.items() if k not in ['exports', 'textEmbedded', 'license']} for a in ASSETS], 'animations': animations}, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')
    print(json.dumps(data['totals']))


if __name__ == '__main__':
    build()
    export_pngs()
    manifest()
