#!/usr/bin/env python3
"""CC0-1.0. Measure immutable bind/skin data and the new hand topology."""
import sys
sys.dont_write_bytecode = True
from collections import Counter
from itertools import product
import hashlib
import json
import numpy as np
from build import HERE, SOURCE, accessor, read_glb


def measure(name):
    source, sb = read_glb(SOURCE / 'models' / (name+'.glb'))
    target, tb = read_glb(HERE / 'runtime/models' / (name+'.glb'))
    sp, tp = source['meshes'][0]['primitives'][0], target['meshes'][0]['primitives'][0]
    original_count = source['accessors'][sp['attributes']['POSITION']]['count']
    differences = {}
    for attr, index in sp['attributes'].items():
        a, b = accessor(source, sb, index), accessor(target, tb, tp['attributes'][attr])[:original_count]
        differences[attr] = float(np.max(np.abs(a.astype(float)-b.astype(float))))
        assert a.tobytes() == b.tobytes(), (name, attr)
    for i, morph in enumerate(sp['targets']):
        a=accessor(source,sb,morph['POSITION'])
        b=accessor(target,tb,tp['targets'][i]['POSITION'])[:original_count]
        assert a.tobytes() == b.tobytes(), (name, 'morph', i)
    assert source['nodes'] == target['nodes']
    a=accessor(source,sb,source['skins'][0]['inverseBindMatrices'])
    b=accessor(target,tb,target['skins'][0]['inverseBindMatrices'])
    assert a.tobytes() == b.tobytes()
    assert source['skins'][0]['joints'] == target['skins'][0]['joints']
    positions=accessor(target,tb,tp['attributes']['POSITION'])
    triangles=accessor(target,tb,tp['indices']).reshape(-1,3)
    joints=accessor(target,tb,tp['attributes']['JOINTS_0'])
    weights=accessor(target,tb,tp['attributes']['WEIGHTS_0'])
    assert np.isfinite(positions).all() and np.isfinite(weights).all()
    assert np.max(np.abs(weights.sum(1)-1)) < 2e-6
    assert joints.max() < 18
    assert len(triangles)-source['accessors'][sp['indices']]['count']//3 <= 300
    # Count boundary edges touching any authored/intersection vertex, welding
    # only positional UV duplicates. An attached wrist must have zero holes.
    lookup={}; welded=[]; representatives=[]
    for p in positions:
        # Adjacent UV seams may straddle a rounding boundary by <0.1 microns.
        # Search neighbouring spatial cells instead of rounding them apart.
        cell=tuple(np.floor(p/2e-6).astype(int))
        match=None
        for offset in product([-1,0,1],repeat=3):
            key=tuple(cell[k]+offset[k] for k in range(3))
            for candidate in lookup.get(key,[]):
                if np.linalg.norm(p-representatives[candidate])<2e-6:
                    match=candidate;break
            if match is not None:break
        if match is None:
            match=len(representatives);representatives.append(p)
            lookup.setdefault(cell,[]).append(match)
        welded.append(match)
    edges=Counter()
    touched=set()
    areas=[]
    for tri in triangles:
        for i in range(3):
            a,b=int(tri[i]),int(tri[(i+1)%3]); edge=tuple(sorted((welded[a],welded[b])))
            edges[edge]+=1
            if a>=original_count or b>=original_count:touched.add(edge)
        if np.any(tri>=original_count):
            a,b,c=positions[tri];areas.append(float(np.linalg.norm(np.cross(b-a,c-a))/2))
    bad=[(edge,edges[edge]) for edge in touched if edges[edge]!=2]
    assert not bad, (name,'open/nonmanifold authored wrist edge',bad[:6])
    assert min(areas)>1e-11
    used_original=np.unique(triangles[triangles<original_count])
    return {'model':name,'bones':len(target['skins'][0]['joints']),
            'nodesAndParentsIdentical':True,'inverseBindMatricesByteIdentical':True,
            'originalAttributeMaxAbsError':differences,'originalSportMorphsByteIdentical':True,
            'originalVertices':original_count,'referencedOriginalVertices':len(used_original),
            'newVertices':len(positions)-original_count,'triangles':len(triangles),
            'newEdgeManifoldFailures':len(bad),'minimumNewTriangleAreaMeters2':min(areas),
            'maxWeightSumError':float(np.max(np.abs(weights.sum(1)-1))),
            'draco':any('draco' in e.lower() for e in target.get('extensionsUsed',[]))}


if __name__=='__main__':
    results=[measure(n) for n in ['soccer','guard','wing','center']]
    doc={'results':results,'analyticImplication':'Identical rest transforms, bind matrices, original attributes and original morphs imply identical retained-vertex deformation for every possible animation pose, not only the sampled clips.'}
    (HERE/'verification/invariants.json').write_text(json.dumps(doc,indent=2)+'\n')
    print(json.dumps(results,indent=2))
