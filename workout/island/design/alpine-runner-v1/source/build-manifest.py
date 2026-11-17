#!/usr/bin/env python3
# SPDX-License-Identifier: CC0-1.0
"""Inventory the finished delivery; run after rebuilding assets or preview files."""
import hashlib,json
from pathlib import Path

PACK=Path(__file__).resolve().parents[1]
def read(name):return json.loads((PACK/name).read_text())
def record(path):
    data=path.read_bytes()
    return {'path':path.relative_to(PACK).as_posix(),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
character=read('character-spec.json');world=read('world-spec.json');motion=read('verification/motion-qa.json')
inventory=[record(p) for p in sorted((PACK/'assets').rglob('*')) if p.is_file()]
inventory += [record(p) for p in sorted((PACK/'vendor').glob('*')) if p.is_file()]
inventory += [record(PACK/p) for p in ['preview.html','preview.css','preview.mjs','character-spec.json','world-spec.json']]
manifest={
 'schemaVersion':1,'id':'alpine-runner-v1','title':'מסלול הפסגה','version':'1.0.0','createdDate':'2026-11-17',
 'sourceBaseCommit':'43b27dc235387e3cb737aee9558cdf9d5fd5a262',
 'scope':{'directory':'workout/island/design/alpine-runner-v1/','existingFilesChanged':False,'integration':'Standalone asset and playable review pack; integration remains with the game maintainer.'},
 'authorship':{'art':'Original procedural meshes, animation curves, icons and VFX contracts; no third-party game art, branding, or captured movement.','assetLicense':'CC0-1.0','runtimeLicense':'MIT (Three.js); full notice in vendor/LICENSE.three'},
 'coordinates':{'units':'metres','up':'+Y','forward':'+Z','anatomicalLeft':'+X','laneCentersMeters':[-2.4,0,2.4],'tileOrigin':'near port z=0; far port z=30; grounded surface y=0 at both ports'},
 'characters':{'spec':'character-spec.json','trianglesPerVariant':1200,'boneCount':18,'sampleRateHz':30,'variants':character['suits'],'clips':character['clips'],'rootPolicy':character['rootPolicy'],'transitions':character['transitions']},
 'track':{'spec':'world-spec.json','lengthMeters':30,'variants':world['tiles'],'ports':world['ports'],'streaming':{'activeTileSlots':6,'tileSequence':[t['id'] for t in world['tiles']],'recycleBehindMeters':35,'lookAheadMeters':125,'matchingPairsChecked':64}},
 'props':world['props'],
 'icons':{'directory':'assets/icons','format':'SVG','viewBox':[0,0,64,64],'embeddedText':False,'count':16},
 'effects':{'contracts':['assets/effects/snow-spray.json','assets/effects/ski-trail.json','assets/effects/turbo-streaks.json'],'preview':{'ambientSnowPointPool':100,'skiSprayPointPool':48,'reducedMotionPools':[36,18],'random':'seeded LCG32; seed 0x51a17e'}},
 'preview':{'entry':'preview.html','viewport':{'width':844,'height':390},'network':'HTTP server needed for modules and GLB fetch; all runtime resources local, no external requests.','camera':'rear third-person perspective','simulationHz':120,'maximumFrameCatchupSeconds':.25,'input':{'keyboard':{'ArrowLeft':'lane left','ArrowRight':'lane right','ArrowUp / Space':'jump','ArrowDown':'slide','P / Escape':'pause'},'touch':'swipe in four directions or use icon buttons'},'gameplayTuning':{'baseSpeedMetersPerSecond':14,'maximumBaseSpeedMetersPerSecond':19,'turboSpeedMetersPerSecond':22,'powerDurationSeconds':{'turbo':6,'magnet':9,'shield':9,'double_coin':9},'fenceRequiredRootLiftMeters':1.05,'slideHoldSeconds':[.2,.6]},'testMode':'?test=1 exposes deterministic __alpine.advance; optional ?autoplay=1 and ?tile=forest'},
 'budgets':{'wholeFolderMaximumBytes':8000000,'tileMaximumBytes':150000,'largestTileBytes':max(t['bytes'] for t in world['tiles']),'inventoriedRuntimeBytes':sum(i['bytes'] for i in inventory),'allGlbBytes':sum(i['bytes'] for i in inventory if i['path'].endswith('.glb'))},
 'qa':{'khronosReport':'verification/assets.json','motionReport':'verification/motion-qa.json','browserReport':'verification/browser.json','motionToolCommit':motion['qaCommit'],'minimumActionScore':motion['minimumScore'],'requiredActionScoreExclusive':88,'deliveredClips':13,'measuredCompleteActions':11,'jumpScoring':'jump_rise + jump_apex + jump_land sampled as a single continuous action. Individual airborne phase diagnostics are retained and are not passing standalone scores.','phonePerformance':'Not measured; software Chromium checks are functional evidence.'},
 'inventory':inventory,
}
(PACK/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'runtimeBytes':manifest['budgets']['inventoriedRuntimeBytes'],'glbBytes':manifest['budgets']['allGlbBytes'],'largestTileBytes':manifest['budgets']['largestTileBytes']}))
