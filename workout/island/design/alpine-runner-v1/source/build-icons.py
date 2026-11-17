#!/usr/bin/env python3
# SPDX-License-Identifier: CC0-1.0
"""Create the original Alpine Runner icon family and pooled snow effect contracts.

Run from any directory: python3 source/build-icons.py
All shapes are authored here; no external icon, typeface or texture is used.
"""
import json
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
ICONS = BASE / 'assets' / 'icons'
EFFECTS = BASE / 'assets' / 'effects'
ICONS.mkdir(parents=True, exist_ok=True)
EFFECTS.mkdir(parents=True, exist_ok=True)
NAVY = '#19364d'
SNOW = '#f8fcff'
ICE = '#95e7ed'
TEAL = '#29bac0'
GOLD = '#ffce62'
CORAL = '#ff7b76'
LILAC = '#c6b8f2'

# All 16 icons share a 4.4-unit outline and rounded joins. The two-colour
# silhouettes remain clear at a 24-CSS-pixel display size.
shapes = {
    'coin': f'''<ellipse cx="32" cy="32" rx="21" ry="24" fill="{GOLD}"/>
<ellipse cx="32" cy="32" rx="13" ry="16" fill="none"/>
<path d="M28 19v26M36 19v26" stroke="{SNOW}" stroke-width="3.5"/>''',
    'star': f'''<path d="m32 7 7.8 16.1 17.7 2.6-12.8 12.4 3 17.5L32 47.3 16.3 55.6l3-17.5L6.5 25.7l17.7-2.6Z" fill="{GOLD}"/>
<path d="m25 26 7-14 5 11" fill="none" stroke="{SNOW}" stroke-width="3.2"/>''',
    'magnet': f'''<path d="M12 12h14v22a6 6 0 0 0 12 0V12h14v22a20 20 0 0 1-40 0Z" fill="{CORAL}"/>
<path d="M12 12h14v13H12Zm26 0h14v13H38Z" fill="{SNOW}"/>
<path d="m5 4 4 5m50-5-4 5M32 4v7" fill="none" stroke="{TEAL}" stroke-width="3.8"/>''',
    'shield': f'''<path d="M32 6 53 14v17c0 12-9 21-21 27C20 52 11 43 11 31V14Z" fill="{ICE}"/>
<path d="M32 14v34c8-5 13-11 13-18V20Z" fill="{TEAL}" stroke="none"/>
<path d="m22 32 7 7 14-16" fill="none" stroke="{SNOW}" stroke-width="4.5"/>''',
    'turbo': f'''<path d="m35 5-23 31h17l-2 23 25-33H35Z" fill="{GOLD}"/>
<path d="M8 17h9M4 27h6m42 18h8m-13 9h9" fill="none" stroke="{ICE}" stroke-width="4"/>''',
    'double_coin': f'''<ellipse cx="24" cy="27" rx="17" ry="20" fill="{GOLD}"/>
<ellipse cx="40" cy="37" rx="17" ry="20" fill="{GOLD}"/>
<ellipse cx="40" cy="37" rx="9" ry="12" fill="none"/>
<path d="M37 29v16m6-16v16" stroke="{SNOW}" stroke-width="3"/>
<path d="m10 51 6 4m1-39 5-2" fill="none" stroke="{SNOW}" stroke-width="3"/>''',
    'distance': f'''<path d="M23 8h18l14 48H9Z" fill="{ICE}"/>
<path d="M32 15v6m0 9v7m0 9v5" fill="none" stroke="{SNOW}" stroke-width="4.5"/>
<path d="m12 13 6-5m34 5-6-5" fill="none" stroke="{TEAL}" stroke-width="3.4"/>''',
    'pause': f'''<rect x="14" y="10" width="13" height="44" rx="4" fill="{SNOW}"/>
<rect x="37" y="10" width="13" height="44" rx="4" fill="{SNOW}"/>''',
    'play': f'''<path d="M18 9a3 3 0 0 1 4.5-2.6l34 23a3.1 3.1 0 0 1 0 5.2l-34 23A3 3 0 0 1 18 55Z" fill="{SNOW}"/>''',
    'restart': f'''<path d="M15 23a22 22 0 1 1-3 17" fill="none" stroke="{SNOW}" stroke-width="8"/>
<path d="M8 10v18h19Z" fill="{ICE}"/>
<path d="M15 23a22 22 0 1 1-3 17" fill="none" stroke-width="3"/>''',
    'left': f'''<path d="M29 10 7 32l22 22V41h27V23H29Z" fill="{SNOW}"/>''',
    'right': f'''<path d="m35 10 22 22-22 22V41H8V23h27Z" fill="{SNOW}"/>''',
    'jump': f'''<path d="m32 7-20 20h12v24h16V27h12Z" fill="{SNOW}"/>
<path d="M8 56h48" fill="none" stroke="{ICE}" stroke-width="4.5"/>''',
    'slide': f'''<path d="m32 48-20-20h12V10h16v18h12Z" fill="{SNOW}"/>
<path d="M8 56h48" fill="none" stroke="{ICE}" stroke-width="4.5"/>''',
    'wardrobe': f'''<path d="m23 10-9 5L5 31l11 6 4-7v26h24V30l4 7 11-6-9-16-9-5-9 9Z" fill="{CORAL}"/>
<path d="M24 10a8 8 0 0 0 16 0M32 19v37" fill="none"/>
<path d="M23 40h18" fill="none" stroke="{SNOW}" stroke-width="4"/>''',
    'celebrate': f'''<path d="m11 56 8-27 18 18Z" fill="{CORAL}"/>
<path d="m18 32 15 15" fill="none" stroke="{GOLD}" stroke-width="5"/>
<path d="m30 9 2 9m15 1 7-6m-7 26 10 3M25 23l-5-6m17 16 7-7" fill="none" stroke="{GOLD}" stroke-width="4.5"/>
<path d="m48 49-3 7M11 12l-3 5" fill="none" stroke="{ICE}" stroke-width="4.5"/>
<path d="m44 5 2 3m-5 43 2 2" fill="none" stroke="{LILAC}" stroke-width="4.5"/>''',
}
for name, body in shapes.items():
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="{NAVY}" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round">
{body}
</svg>
'''
    (ICONS / f'{name}.svg').write_text(svg, encoding='utf-8')

common = {
    'schemaVersion': 1,
    'authorship': 'Original Alpine Runner v1; CC0-1.0',
    'axes': {'up': '+Y', 'forward': '+Z'},
    'units': {'position': 'metres', 'velocity': 'metres-per-second', 'duration': 'seconds', 'angle': 'radians'},
    'simulation': {'fixedStepSeconds': 1 / 60, 'maxCatchupSteps': 4, 'pauseWhenHidden': True},
    'random': {
        'algorithm': 'xorshift32', 'seed': 19088743,
        'seedPolicy': 'Reset to seed on a new run; never use wall-clock time. Advance unsigned uint32 once per random value.',
        'nextUint32': 'x ^= x << 13; x ^= x >>> 17; x ^= x << 5; x >>>= 0;',
        'unitFloat': 'nextUint32 / 4294967296',
    },
    'lifecycle': 'Allocate once; reuse the oldest inactive slot. Clamp emission to the pool capacity. Dispose GPU resources on preview teardown.',
    'text': False,
}
configs = {
    'snow-spray': {
        'id': 'snow_spray', 'primitive': 'camera-facing-quad', 'poolCapacity': 64,
        'attachmentBones': ['LeftFoot', 'RightFoot'],
        'attachmentOffsetMeters': [0, -0.065, -0.28],
        'emission': {
            'particlesPerSecondPerSki': {'glide': 10, 'laneChange': 20, 'landingBurst': 10, 'turbo': 24},
            'landingBurstIsOneShotPerSki': True,
            'suppressWhen': ['jump_rise', 'jump_apex', 'fall_left', 'fall_right', 'fall_forward'],
        },
        'initialVelocity': {'xRange': [-0.7, 0.7], 'yRange': [0.18, 0.7], 'zRange': [-2.6, -0.8]},
        'gravityMetersPerSecondSquared': [0, -2.1, 0],
        'sizeMetersRange': [0.025, 0.09], 'lifeSecondsRange': [0.35, 0.7],
        'colorHex': ['#f8fcff', '#d9f7ff'],
        'opacityOverLife': [[0, 0], [0.12, 0.7], [0.6, 0.5], [1, 0]],
        'render': {'blending': 'normal', 'depthTest': True, 'depthWrite': False, 'sort': 'back-to-front', 'texture': None},
    },
    'ski-trail': {
        'id': 'ski_trail', 'primitive': 'pooled-two-point-ribbon', 'ribbonCount': 2,
        'pointsPerRibbon': 24, 'poolCapacity': 48,
        'attachmentBones': ['LeftFoot', 'RightFoot'],
        'attachmentOffsetMeters': [0, -0.075, -0.2],
        'pointSpacingMeters': 0.17, 'pointLifeSeconds': 0.72,
        'widthMeters': 0.06, 'surfaceOffsetMeters': 0.008,
        'sampleGroundAtEachPoint': True,
        'breakRibbonWhen': ['airborne', 'fallen', 'teleport', 'run_restart'],
        'resumeOnlyWithFreshPoints': True,
        'colorHex': '#98c9dc',
        'opacityOverLife': [[0, 0.32], [0.65, 0.16], [1, 0]],
        'render': {'blending': 'normal', 'depthTest': True, 'depthWrite': False, 'polygonOffset': [-1, -1], 'texture': None},
    },
    'turbo-streaks': {
        'id': 'turbo_streaks', 'primitive': 'velocity-aligned-quad', 'poolCapacity': 24,
        'attachment': 'player-world-position',
        'emission': {'particlesPerSecond': 20, 'onlyWhen': 'turbo_powerup_active'},
        'spawnBoxMeters': {'x': [-2.6, 2.6], 'y': [0.15, 2.5], 'z': [4, 9]},
        'initialVelocity': {'xRange': [0, 0], 'yRange': [0, 0], 'zRange': [-18, -12]},
        'widthMetersRange': [0.012, 0.025], 'lengthMetersRange': [0.35, 0.9],
        'lifeSecondsRange': [0.3, 0.5], 'colorHex': ['#95e7ed', '#f8fcff'],
        'opacityOverLife': [[0, 0], [0.2, 0.6], [0.75, 0.4], [1, 0]],
        'reduceMotion': {'respectUserPreference': True, 'prefersReducedMotionAction': 'disable', 'policy': 'Disable streaks when prefers-reduced-motion is active; retain colour and HUD icon feedback.'},
        'render': {'blending': 'normal', 'depthTest': True, 'depthWrite': False, 'texture': None},
    },
}
for name, values in configs.items():
    config = dict(common)
    config.update(values)
    (EFFECTS / f'{name}.json').write_text(json.dumps(config, indent=2) + '\n', encoding='utf-8')
print(f'Wrote {len(shapes)} original SVG icons and {len(configs)} effect contracts.')
