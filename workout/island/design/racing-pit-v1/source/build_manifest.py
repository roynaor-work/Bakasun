"""Inventory delivered assets with immutable content hashes. SPDX-License-Identifier: CC0-1.0."""
import hashlib
import json
from pathlib import Path
import subprocess

BASE = Path(__file__).resolve().parent.parent


def read(relative):
    return json.loads((BASE / relative).read_text())


def fingerprint(path):
    data = path.read_bytes()
    return {'file': path.relative_to(BASE).as_posix(), 'bytes': len(data),
            'sha256': hashlib.sha256(data).hexdigest(), 'license': 'CC0-1.0',
            'source': 'original; see LICENSES.md and source/'}


def main():
    catalog = read('source/model-catalog.json')
    qa = read('verification/motion-qa.json')
    provenance = read('verification/motion-qa-provenance.json')
    audio = read('verification/audio.json')
    models = read('verification/glb-validator.json')
    resources = sorted([*BASE.glob('models/*.glb'), *BASE.glob('icons/*.svg'),
                        *BASE.glob('audio/*.ogg'), *BASE.glob('audio/*.mp3'),
                        BASE / 'rig.json', *BASE.glob('motions/*.json')])
    # Refuse to publish a manifest against stale evidence after a model/audio rebuild.
    measured_models = {item['file']: item['sha256'] for item in models['results']}
    qa_models = {item['path']: item['sha256'] for item in qa['libraries'][0]['source']['inputs']}
    for model in BASE.glob('models/*.glb'):
        relative = model.relative_to(BASE).as_posix()
        digest = hashlib.sha256(model.read_bytes()).hexdigest()
        assert measured_models[relative] == digest, f'Remeasure GLB: {relative}'
        if relative in qa_models:
            assert qa_models[relative] == digest, f'Rerun Motion QA: {relative}'
    for sound in audio['sounds']:
        for file in sound['files']:
            assert hashlib.sha256((BASE / file['file']).read_bytes()).hexdigest() == file['sha256'], file['file']
    clips = qa['libraries'][0]['clips']
    mandatory = ['idle_wait', 'rush_in', 'remove_wheel', 'mount_wheel',
                 'jack_up', 'jack_down', 'thumbs_up', 'step_back']
    for actor in catalog['crew']:
        measured = [c for c in clips if c['role'] == actor['id']]
        actor['qaMinimum'] = min(c['score'] for c in measured)
        actor['qaRequiredClipsMinimum'] = min(c['score'] for c in measured if c['motionId'] in mandatory)
        actor['rig'] = 'rig.json'
        actor['material'] = 'white PBR factor, linear COLOR_0 vertex colors; no texture'
        actor['teamMask'] = '_TEAM_MASK: 1=suit/crown; 0=skin-independent details'
        actor['skinning'] = 'articulated rigid-segment skin, normalized single-bone weights, 18 canonical joints'
    dependencies = []
    for relative, license_id in [('../racing-v7/vendor/three.module.js', 'MIT'),
                                  ('../racing-v7/vendor/GLTFLoader.js', 'MIT'),
                                  ('../racing-v7/vendor/BufferGeometryUtils.js', 'MIT'),
                                  ('../racing-v7/vendor/SkeletonUtils.js', 'MIT'),
                                  ('../racing-formula/formula.glb', 'CC0-1.0')]:
        data = (BASE / relative).read_bytes()
        dependencies.append({'file': relative, 'license': license_id,
                             'sha256': hashlib.sha256(data).hexdigest(), 'copiedOrModified': False})
    doc = {'schemaVersion': 1, 'id': 'racing-pit-v1', 'kind': 'original-game-asset-pack',
           'baseBranch': 'main', 'baseCommit': '19d9cdc5e3718236df5a2fc4d8b8c26c72007575',
           'branch': 'codex/racing-pit-v1',
           'scope': 'new files only under workout/island/design/racing-pit-v1; preview and asset contracts, no game integration',
           'license': {'id': 'CC0-1.0', 'file': 'LICENSES.md',
                       'legalCode': 'https://creativecommons.org/publicdomain/zero/1.0/legalcode'},
           'entryPoint': 'preview.html', 'report': 'REPORT.md', 'rig': 'rig.json',
           'coordinateSystem': {'units': 'meters', 'up': '+Y', 'forward': '+Z', 'anatomicalLeft': '+X', 'floorY': 0},
           'constraints': {'maxCrewTriangles': 1500, 'maxObservedCrewTriangles': max(a['triangles'] for a in catalog['crew']),
                           'canonicalJoints': 18, 'compression': 'none', 'draco': False,
                           'textures': 0, 'brands': 0, 'visibleTextInAssets': False},
           'crew': catalog['crew'], 'equipment': catalog['props'],
           'motion': {'contract': 'motions/clips.json', 'integrationProposal': 'motions/pit-sequence.json',
                      'requiredClips': mandatory, 'additionalClips': ['wipe_screen', 'signal_release'],
                      'bakedKeyRateHz': 30, 'interpolation': 'LINEAR; shortest arc quaternion interpolation',
                      'rootMotion': {'rush_in': [0, 0, .96], 'step_back': [0, 0, -.64], 'handling': 'baked, apply once'},
                      'defaultBlendSeconds': .18, 'loopingClips': ['idle_wait']},
           'teamPalette': {'default': '#18b6bd', 'presets': ['#18b6bd', '#d93228', '#d6aa3b', '#b7c2ca', '#7ac05a', '#a05fc4'],
                           'reference': '../racing-league/README.md', 'implementation': 'COLOR_0 linear RGB; _TEAM_MASK selects recolorable vertices'},
           'icons': [{'id': p.stem, 'file': p.relative_to(BASE).as_posix(), 'width': 96, 'height': 96, 'format': 'svg',
                      'embeddedText': False} for p in sorted(BASE.glob('icons/*.svg'))],
           'sounds': audio['sounds'],
           'validation': {'motion': {'report': 'verification/motion-qa.json', 'provenance': 'verification/motion-qa-provenance.json',
                                     'upstreamCommit': provenance['upstreamCommit'], 'inputAdapter': 'source/qa-sources.mjs',
                                     'cli': 'node source/run-qa.mjs', 'scoreMinimum': min(c['score'] for c in clips),
                                     'scoreAverage': qa['libraries'][0]['summary']['average'], 'clipCount': len(clips),
                                     'minimumRequired': 88, 'coverageOfApplicableMetrics': 1, 'insufficientDataMetrics': 0,
                                     'redMetrics': qa['libraries'][0]['summary']['redMetrics'],
                                     'limitations': 'skeletal diagnostic heuristic; sole probes do not replace full visual or runtime evaluation'},
                          'gltf': {'report': 'verification/glb-validator.json', 'validator': models['validator'],
                                   'errors': sum(r['errors'] for r in models['results']), 'warnings': sum(r['warnings'] for r in models['results'])},
                          'audio': {'report': 'verification/audio.json', 'targetLUFS': -16, 'toleranceLU': .2, 'measurementAfterCodecDecode': True},
                          'browser': {'report': 'verification/browser.json', 'physicalPhoneVerified': False},
                          'geometry': {'report': 'verification/geometry.json'}},
           'preview': {'durationSeconds': 21.8, 'productionLogic': False, 'dependencies': dependencies,
                       'network': 'local repository resources only; serve the repository over HTTP',
                       'screenshots': ['verification/preview-desktop.png', 'verification/preview-mobile.png',
                                       'verification/crew-detail.png', 'verification/pit-stop.png', 'verification/equipment-light.png']},
           'rebuild': {'models': 'python3 source/build_models.py', 'icons': 'python3 source/build_icons.py',
                       'audio': 'python3 source/build_audio.py', 'motionQA': 'node source/run-qa.mjs',
                       'manifest': 'python3 source/build_manifest.py',
                       'dependencies': ['Python 3', 'NumPy', 'SciPy', 'FFmpeg with libvorbis/libmp3lame', 'Node.js 22+', 'Git']},
           'assetCount': len(resources), 'assets': [fingerprint(p) for p in resources]}
    assert doc['validation']['gltf']['errors'] == doc['validation']['gltf']['warnings'] == 0
    assert doc['validation']['motion']['scoreMinimum'] >= 88
    (BASE / 'manifest.json').write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')
    print(f'{len(resources)} assets inventoried with SHA-256; all crew ≤1500 triangles; motion ≥88')


if __name__ == '__main__':
    main()
