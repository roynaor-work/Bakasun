"""Isolated jersey construction candidates 17 and 18; default cloth stays 15.

Authoring API
------------
enhance_jersey(person, shirt, make_mesh, rectuv) modifies only the supplied
Blender shirt's vertex positions and returns four additional Cloth objects.
It is a no-op unless SOCCER_CHARACTER_CLOTH_VARIANT is 17 or 18. Call it after
fitted_shirt and before protected seams, relaxation or QEM. For this variant,
the builder must skip its older flat collar binding. The canonical 18 skin
weights and original shirt topology/UVs stay unchanged.

Bindings trace the actual garment edge loops; their first row touches an
existing surface edge and their other rows project onto the same cloth.
All raised offsets are outward, 0..1.8 mm. The hem starts at the connected
outer turn of the source's sewn facing, rather than its inner boundary.
Post-QEM ensure_hem_clearance must run on the shirt AND bindingKind='hem'.

Approximate added near budget: collar 240, hem 384, cuffs 128 each = 880
triangles total. Suggested far budgets: collar 96, hem 128, cuffs 48 each.
Every returned object has surface, atlasRegion, atlasClass and bindingKind.

Variant 18 keeps the 17 formulas reproducible, but uses narrower asymmetric
tension folds whose displacement has a positive dot with the original normal.
Its collar/cuffs use the otherwise unused scalp UV tile as same-hue matte rib
knit: collar 12 mm wide, cuffs 8 mm, with flat 1.15..1.25 mm raised profiles.
The hem is a flat 10 mm facing raised 1.15 mm. Added near triangles total
1008 (240 collar, 384 hem, 192 each cuff); suggested far total 352.

cloth_patch and stitch_patch use only NumPy/Pillow and the existing 1024 UV
layout. They create fine yarn normals without broad painted fold shading;
the 2..4 mm folds are actual geometry and keep garment boundaries pinned.
No model, image or manifest is saved by this module.
"""
import heapq
import math
import os
import numpy as np
from PIL import Image, ImageFilter


JOINTS = (
    'Root','Hips','Spine','Chest','Neck','Head',
    'LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand',
    'LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot',
)


def enabled():
    return os.environ.get('SOCCER_CHARACTER_CLOTH_VARIANT','15') in ('17','18')


def _normal(height, strength):
    dy,dx=np.gradient(np.asarray(height,dtype=float))
    normal=np.stack((-dx*strength,dy*strength,np.ones_like(dx)),axis=-1)
    normal/=np.linalg.norm(normal,axis=-1)[...,None]
    return Image.fromarray(np.clip(np.round((normal*.5+.5)*255),0,255).astype(np.uint8),'RGB')


def _rgb(values):
    return Image.fromarray(np.clip(np.round(values),0,255).astype(np.uint8),'RGB')


def cloth_patch(kind, color, w, h, seam_mask=None):
    """Fine non-grid yarns; hue is unchanged and raised seams follow real UVs."""
    yy,xx=np.mgrid[:h,:w]
    # Near-Nyquist yarn spacing fades under mipmapping instead of turning into
    # the old 3..4 texel waffle grid. Slightly curved yarns avoid ruled bands.
    phase=.18*np.sin(yy*.37)+.12*np.sin(xx*.23+yy*.19)
    yarn=.70*np.sin(xx*2.72+yy*.15+phase)
    yarn+=.23*np.sin(yy*2.58-xx*.11+.14*np.sin(xx*.41))
    yarn+=.07*np.sin(xx*1.91+yy*1.73)
    if kind=='socks':
        yarn+=.24*np.sin(xx*2.35+.1*np.sin(yy*.29))
    height=yarn*(.105 if kind=='shirt' else .075)
    shade=yarn*.0018
    if kind=='shirt' and seam_mask is not None:
        mask=seam_mask.convert('L')
        core=np.asarray(mask.filter(ImageFilter.GaussianBlur(.30)),float)/255
        halo=np.asarray(mask.filter(ImageFilter.GaussianBlur(.90)),float)/255
        # A narrow pressed groove with raised thread shoulders, never a
        # quarter-U line drawn across an unrelated front UV island.
        height+=halo*.19-core*.15
        shade+=halo*.012-core*.035
    col=np.array(color,dtype=float)[None,None,:]*(1+shade[...,None])
    rough=np.clip(213+yarn*2.2,205,220)
    return _rgb(col),_normal(height,1.35),rough


def stitch_patch(color, w, h):
    """Same-hue twin stitch rows, readable through relief and small contrast."""
    if os.environ.get('SOCCER_CHARACTER_CLOTH_VARIANT','15')=='18':
        return _stitch_patch18(color,w,h)
    yy,xx=np.mgrid[:h,:w];v=(yy+.5)/max(h,1)
    edge=np.sin(math.pi*v)**.75
    phase=np.mod(xx+.6*np.sin(yy*.6),6.5)
    thread=np.exp(-((phase-1.6)/1.0)**4)
    twin=np.exp(-((v-.25)/.11)**2)+np.exp(-((v-.75)/.11)**2)
    shade=-.021*edge+.049*twin*thread
    col=np.array(color,dtype=float)[None,None,:]*(1+shade[...,None])
    height=.16*edge+.105*twin*thread
    rough=np.clip(215+3*edge-4*twin*thread,207,220)
    return _rgb(col).convert('RGBA'),_normal(height,1.25),rough


def _stitch_patch18(color, w, h):
    """A flat folded facing, with two restrained rows of actual thread relief."""
    yy,xx=np.mgrid[:h,:w];v=(yy+.5)/max(h,1)
    twin=np.exp(-((v-.24)/.105)**2)+np.exp(-((v-.76)/.105)**2)
    phase=np.mod(xx+.35*np.sin(yy*.65),6.5)
    thread=np.exp(-((phase-1.55)/.92)**4)
    facing=np.sin(math.pi*v)**.4
    shade=-.020*facing-.012*twin+.047*twin*thread
    col=np.array(color,dtype=float)[None,None,:]*(1+shade[...,None])
    height=.026*facing+.078*twin*thread-.020*twin
    rough=np.clip(224+2*facing-2*twin*thread,218,230)
    return _rgb(col).convert('RGBA'),_normal(height,1.1),rough


def rib_patch18(color, w, h):
    """Opaque 6.8% darker rib knit for the variant-18 collar and sleeve bands.

    Uses only the legacy scalp tile. U follows the edge and V spans the band;
    narrow ribs run across its width. All channels multiply by the same tone.
    """
    yy,xx=np.mgrid[:h,:w];v=(yy+.5)/max(h,1)
    rib=np.cos(xx*2.15+.10*np.sin(yy*.55))
    yarn=.65*np.sin(xx*2.71+yy*.14)+.35*np.sin(yy*2.49-xx*.13)
    twin=np.exp(-((v-.16)/.075)**2)+np.exp(-((v-.84)/.075)**2)
    phase=np.mod(xx+.25*np.sin(yy*.6),6.5)
    thread=np.exp(-((phase-1.5)/.9)**4)
    shade=.932+.0038*rib+.0015*yarn-.008*twin+.023*twin*thread
    col=np.array(color,dtype=float)[None,None,:]*shade[...,None]
    height=.060*rib+.012*yarn+.027*twin*thread
    rough=np.clip(229+1.8*rib-1.2*twin*thread,224,233)
    return _rgb(col).convert('RGBA'),_normal(height,1.25),rough


def _unit(vector, fallback=None):
    length=float(np.linalg.norm(vector))
    if length>1e-12:return np.asarray(vector)/length
    return np.array([0,0,1.],float) if fallback is None else np.asarray(fallback,dtype=float)


def _loops(flat):
    adjacency={}
    for i in range(0,len(flat),2):
        a,b=int(flat[i]),int(flat[i+1])
        adjacency.setdefault(a,set()).add(b);adjacency.setdefault(b,set()).add(a)
    if any(len(neighbors)!=2 for neighbors in adjacency.values()):
        raise ValueError('Cloth17 requires closed, unbranched garment boundaries')
    remaining=set(adjacency);result=[]
    while remaining:
        first=min(remaining);previous=None;current=first;order=[]
        while True:
            order.append(current);remaining.discard(current)
            candidates=adjacency[current]-({previous} if previous is not None else set())
            following=min(candidates)
            if following==first:break
            if following in order:raise ValueError('Cloth17 boundary self-intersection in edge order')
            previous,current=current,following
        if len(order)<8:raise ValueError('Cloth17 boundary has too few vertices')
        result.append(order)
    return result


def _adjacency(mesh):
    neighbors=[set() for _ in mesh.vertices]
    for polygon in mesh.polygons:
        ids=list(polygon.vertices)
        for a,b in zip(ids,ids[1:]+ids[:1]):
            neighbors[a].add(b);neighbors[b].add(a)
    return neighbors


def _boundary_distance(points, neighbors, boundary):
    distance=np.full(len(points),np.inf);queue=[]
    for i in boundary:distance[i]=0;heapq.heappush(queue,(0.,i))
    while queue:
        d,i=heapq.heappop(queue)
        if d>distance[i]:continue
        for j in neighbors[i]:
            candidate=d+float(np.linalg.norm(points[j]-points[i]))
            if candidate<distance[j]:
                distance[j]=candidate;heapq.heappush(queue,(candidate,j))
    return distance


def _fold_displacement(points, normals, distance):
    displacement=np.zeros_like(points)
    for i,(point,normal) in enumerate(zip(points,normals)):
        x,y,z=point
        if not .94<y<1.31 or abs(x)>.205:continue
        angle=math.atan2(abs(x),z-.012)
        # Two diagonal ease folds meet the side waist; a separate underarm
        # ridge follows the direction of fabric tension. No negative troughs.
        ridge=0.
        for center,width,base_y,slope,amplitude,vertical in (
            (1.02,.43,1.020,.065,.0032,.026),
            (1.64,.39,1.071,-.040,.0027,.031),
            (1.38,.40,1.195,.085,.0038,.030),
        ):
            da=angle-center;dy=y-(base_y+slope*da)
            ridge+=amplitude*math.exp(-(da/width)**2-(dy/vertical)**2)
        envelope=min(1.,max(0.,(y-.94)/.035))*min(1.,max(0.,(1.31-y)/.055))
        pin=float(np.clip(distance[i]/.014,0,1));pin=pin*pin*(3-2*pin)
        amount=min(.004,ridge)*envelope*pin
        radial=_unit(np.array([x,0,z-.012]))
        outward=_unit(normal)
        if np.dot(outward,radial)<0:outward=-outward
        direction=_unit(outward*.80+radial*.20,outward)
        displacement[i]=direction*amount
    return displacement


def _fold_displacement18(points, normals, distance):
    """Narrow, asymmetric tension ridges with no original-normal inversion."""
    displacement=np.zeros_like(points)
    for i,(point,normal) in enumerate(zip(points,normals)):
        x,y,z=point
        if not .94<y<1.31 or abs(x)>.205:continue
        side=1 if x>=0 else -1
        angle=math.atan2(abs(x),z-.012)
        ridge=0.
        for center,width,base_y,slope,amplitude,vertical in (
            (1.03,.25,1.023,.064,.0035,.014),
            (1.67,.27,1.074,-.043,.0030,.017),
            (1.38,.24,1.196,.082,.0040,.014),
        ):
            da=angle-(center+side*.025)
            dy=y-(base_y+side*.0035+slope*da)
            asymmetry=.96 if side>0 else .86
            ridge+=amplitude*asymmetry*math.exp(-(da/width)**2-(dy/vertical)**2)
        envelope=min(1.,max(0.,(y-.94)/.035))*min(1.,max(0.,(1.31-y)/.055))
        pin=float(np.clip(distance[i]/.014,0,1));pin=pin*pin*(3-2*pin)
        amount=min(.004,ridge)*envelope*pin
        # An inner sleeve's outward normal points toward the torso. Flipping
        # it to a whole-body radial vector actually moves into that sleeve.
        # Add only a small tangential ease component to its original normal.
        outward=_unit(normal)
        radial=_unit(np.array([x,0,z-.012]))
        tangent=radial-outward*np.dot(radial,outward)
        direction=_unit(outward+tangent*.12,outward)
        displacement[i]=direction*amount
    return displacement


def _resample(points, weights, normals, order, count):
    positions=points[order];delta=np.roll(positions,-1,axis=0)-positions
    length=np.linalg.norm(delta,axis=1);cumulative=np.r_[0.,np.cumsum(length)]
    total=float(cumulative[-1]);samples=[]
    for k in range(count):
        d=total*k/count;j=min(len(order)-1,int(np.searchsorted(cumulative,d,side='right')-1))
        t=(d-cumulative[j])/max(length[j],1e-12);a=order[j];b=order[(j+1)%len(order)]
        samples.append((points[a]*(1-t)+points[b]*t,weights[a]*(1-t)+weights[b]*t,
                        _unit(normals[a]*(1-t)+normals[b]*t),a,b,t))
    return samples,total


def enhance_jersey(person, shirt, make_mesh, rectuv):
    """Raise outward folds and return edge-attached collar, cuffs and hem."""
    if not enabled():return []
    variant=os.environ.get('SOCCER_CHARACTER_CLOTH_VARIANT','15')
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    from mathutils.geometry import closest_point_on_tri
    mesh=shirt.data;mesh.update()
    points=np.array([v.co[:] for v in mesh.vertices],dtype=float)
    normals=np.array([v.normal[:] for v in mesh.vertices],dtype=float)
    original_normals=normals.copy()
    original=points.copy();neighbors=_adjacency(mesh)
    loops=_loops(shirt.get('garmentBoundaryEdges',[]))
    if len(loops)!=4:raise ValueError('Cloth17 expects collar, two cuffs and hem')
    boundary={i for loop in loops for i in loop}
    weights=np.zeros((len(points),18))
    group_map={group.index:JOINTS.index(group.name) for group in shirt.vertex_groups if group.name in JOINTS}
    for vertex in mesh.vertices:
        for group in vertex.groups:
            if group.group in group_map:weights[vertex.index,group_map[group.group]]=group.weight
    totals=weights.sum(axis=1)
    if np.any(totals<.999) or np.any(totals>1.001):raise ValueError('Cloth17 requires normalized canonical weights')
    weights/=totals[:,None]
    distance=_boundary_distance(points,neighbors,boundary)
    displacement=(_fold_displacement18 if variant=='18' else _fold_displacement)(points,normals,distance)
    points+=displacement
    for vertex,point in zip(mesh.vertices,points):vertex.co=point.tolist()
    mesh.update();normals=np.array([v.normal[:] for v in mesh.vertices],dtype=float)
    mesh.calc_loop_triangles();triangles=[list(t.vertices) for t in mesh.loop_triangles]
    bvh=BVHTree.FromPolygons([Vector(p) for p in points],triangles,all_triangles=True)
    triangle_use=[set() for _ in points]
    for index,ids in enumerate(triangles):
        for i in ids:triangle_use[i].add(index)

    def sample_surface(target, reference, allowed):
        if variant=='18':
            # A normal ray across a curved cuff can land far beyond the target
            # while still hitting a connected sleeve face. Use the closest
            # compatible local face for the wider, flatter variant-18 bands.
            hit=normal=index=None
        else:
            hit,normal,index,_=bvh.ray_cast(Vector(target+reference*.025),Vector(-reference),.055)
        if hit is None or index not in allowed:
            # Inner sleeves and torso can lie within a few millimetres of each
            # other. Spatial proximity alone must not join those two surfaces.
            # Restrict fallback projection to the anchor's connected faces.
            best=None
            for candidate in allowed:
                ids=triangles[candidate];a,b,c=(Vector(points[j]) for j in ids)
                face_normal=(b-a).cross(c-a)
                if variant=='18' and np.dot(_unit(np.array(face_normal)),reference)<.20:continue
                position=closest_point_on_tri(Vector(target),a,b,c)
                distance=float((position-Vector(target)).length_squared)
                if best is None or distance<best[0]:
                    best=(distance,position,face_normal,candidate)
            if best is not None:_,hit,normal,index=best
        if hit is None:raise ValueError('Cloth17 binding projection missed its garment')
        q=np.array(hit);normal=_unit(np.array(normal))
        if np.dot(normal,reference)<0:normal=-normal
        ids=triangles[index];a,b,c=points[ids];u=b-a;v=c-a;d=q-a
        d00=np.dot(u,u);d01=np.dot(u,v);d11=np.dot(v,v);den=d00*d11-d01*d01
        if abs(den)<1e-16:factors=np.array([1.,0,0])
        else:
            beta=(d11*np.dot(d,u)-d01*np.dot(d,v))/den
            gamma=(d00*np.dot(d,v)-d01*np.dot(d,u))/den
            factors=np.clip([1-beta-gamma,beta,gamma],0,1);factors/=np.sum(factors)
        weight=factors@weights[ids];weight/=weight.sum()
        return q,normal,weight

    result=[];diagnostics=[]
    for loop in loops:
        center=points[loop].mean(0)
        kind='collar' if center[1]>1.34 else 'hem' if center[1]<1.02 else 'cuff'
        anchor=loop
        if kind=='hem':
            outer=[]
            for i in loop:
                candidates=[j for j in neighbors[i] if j not in boundary and points[j,1]<points[i,1]-.001]
                if not candidates:raise ValueError('Cloth17 could not follow the sewn hem facing to its outer turn')
                outer.append(min(candidates,key=lambda j:points[j,1]))
            if len(set(outer))!=len(loop):raise ValueError('Cloth17 hem outer turn is not a simple closed loop')
            anchor=outer
        count=40 if kind=='collar' else 64 if kind=='hem' else 32
        if variant=='18':
            width=.012 if kind=='collar' else .010 if kind=='hem' else .008
            thickness=.00125 if kind=='collar' else .00115
            # The outer edge attaches exactly; the interior sewn edge retains
            # a 0.18 mm thread height to avoid coplanar triangle flicker.
            profile=((0.,0.),(.26,thickness),(.80,thickness),(1.,.00018))
            region='stitch' if kind=='hem' else 'scalp'
        else:
            width=.009 if kind=='collar' else .009 if kind=='hem' else .0065
            profile=((0.,0.),(.18,.0018),(.76,.00165),(1.,0.)) if kind!='cuff' else ((0.,0.),(.45,.0014),(1.,0.))
            region='stitch'
        samples,circumference=_resample(points,weights,normals,anchor,count)
        anchor_set=set(anchor);vv=[];ww=[];ff=[];uu=[];outward_offsets=[]
        local_faces=[]
        for _,_,_,a,b,_ in samples:
            local={a,b}
            for _ in range(2):local|={j for i in tuple(local) for j in neighbors[i]}
            allowed={index for i in local for index in triangle_use[i] if set(triangles[index]).issubset(local)}
            if not allowed:raise ValueError('Cloth17 anchor has no connected projection patch')
            local_faces.append(allowed)
        for row,(fraction,offset) in enumerate(profile):
            for k,(q,weight,normal,a,b,t) in enumerate(samples):
                tangent=_unit(samples[(k+1)%count][0]-samples[(k-1)%count][0])
                interior=set(neighbors[a])|set(neighbors[b]);interior-=anchor_set
                if kind=='hem':
                    # Select the outer panel above the turn, not the inner facing.
                    interior={j for j in interior if points[j,1]>q[1]+.001}
                if not interior:raise ValueError('Cloth17 has no connected inner surface direction')
                inward=points[sorted(interior)].mean(0)-q
                if variant=='18':
                    conormal=_unit(np.cross(normal,tangent))
                    if np.dot(conormal,inward)<0:conormal=-conormal
                    inward=conormal
                else:
                    inward-=tangent*np.dot(inward,tangent);inward-=normal*np.dot(inward,normal)
                    inward=_unit(inward,np.cross(normal,tangent))
                if row==0:
                    surface=q;surface_normal=normal;surface_weight=weight
                else:
                    surface,surface_normal,surface_weight=sample_surface(q+inward*width*fraction,normal,local_faces[k])
                    if variant=='18':
                        # Curved cuffs shorten a straight target's projected
                        # width. Adjust only the tangential reach, never the
                        # outward thickness, until the sewn band keeps its size.
                        desired=width*fraction;reach=1.
                        for _ in range(4):
                            actual=float(np.linalg.norm(surface-q))
                            if .97*desired<=actual<=1.06*desired:break
                            reach=float(np.clip(reach*desired/max(actual,1e-6),.65,2.0))
                            surface,surface_normal,surface_weight=sample_surface(q+inward*desired*reach,normal,local_faces[k])
                vv.append(surface+surface_normal*offset);ww.append(surface_weight)
                outward_offsets.append(offset)
        for row in range(len(profile)-1):
            for k in range(count):
                j=(k+1)%count;face=[row*count+k,row*count+j,(row+1)*count+j,(row+1)*count+k]
                coords=np.array([vv[i] for i in face]);reference=samples[k][2]+samples[j][2]
                # Use a physical thread pitch, not 28 giant dashes stretched
                # around the entire metre-long hem. Each edge stays inside
                # the existing stitch tile and carries several fine stitches.
                repeat_length=.13 if variant=='18' and region=='scalp' else .08
                edge_u=min(.99,float(np.linalg.norm(samples[j][0]-samples[k][0]))/repeat_length)
                tex=[rectuv(region,0,profile[row][0]),rectuv(region,edge_u,profile[row][0]),
                     rectuv(region,edge_u,profile[row+1][0]),rectuv(region,0,profile[row+1][0])]
                if np.dot(np.cross(coords[1]-coords[0],coords[2]-coords[0]),reference)<0:
                    face.reverse();tex.reverse()
                ff.append(face);uu.append(tex)
        side='-left' if kind=='cuff' and center[0]>0 else '-right' if kind=='cuff' else ''
        obj=make_mesh('jersey-binding'+variant+'-'+kind+side,vv,ff,uu,np.array(ww),atlas_region=region,atlas_class='binding-'+kind+variant)
        obj['surface']='Cloth';obj['bindingKind']=kind;obj['clothVariant']=variant
        obj['bindingWidthMeters']=width;obj['bindingMaximumThicknessMeters']=max(outward_offsets)
        if variant=='18':
            band_points=np.asarray(vv);measured=np.linalg.norm(band_points[-count:]-band_points[:count],axis=1)
            obj['bindingMeasuredChordWidthMinimumMeters']=float(measured.min())
            obj['bindingMeasuredChordWidthMedianMeters']=float(np.median(measured))
            obj['bindingMeasuredChordWidthMaximumMeters']=float(measured.max())
        obj['bindingStitchPitchMeters']=.00215 if variant=='18' and region=='scalp' else .00283
        if variant=='18' and region=='scalp':obj['bindingRibPitchMeters']=.00096
        obj['preClearanceAttachmentMaximumGapMeters']=0.;obj['sourceBoundaryVertices']=len(loop)
        obj['sourceAnchor']='connected-outer-hem-turn' if kind=='hem' else 'garment-boundary'
        obj['recommendedNearTriangles']=len(ff)*2
        obj['recommendedFarTriangles']=128 if kind=='hem' else 96 if kind=='collar' else 64 if variant=='18' else 48
        result.append(obj);diagnostics.append({'kind':kind,'triangles':len(ff)*2,'circumference':circumference})
    shirt['clothVariant']=variant;shirt['clothFoldMaximumOffsetMeters']=float(np.max(np.linalg.norm(displacement,axis=1)))
    shirt['clothFoldDisplacedVertices']=int(np.sum(np.linalg.norm(displacement,axis=1)>.00005))
    shirt['clothBoundaryMaximumDisplacementMeters']=float(np.max(np.linalg.norm(points[list(boundary)]-original[list(boundary)],axis=1)))
    shirt['clothAddedBindingTriangles']=sum(item['triangles'] for item in diagnostics)
    if variant=='18':
        dot=np.sum(displacement*original_normals,axis=1)
        moved=np.linalg.norm(displacement,axis=1)>.00001
        inner=moved&(abs(original[:,0])>.085)&(abs(original[:,0])<.205)&(original[:,1]>1.05)&(original[:,1]<1.27)
        shirt['clothMinimumNormalDisplacementMeters']=float(np.min(dot[moved])) if np.any(moved) else 0.
        shirt['clothInnerSleeveMinimumNormalDisplacementMeters']=float(np.min(dot[inner])) if np.any(inner) else 0.
        if np.any(dot< -1e-9):raise ValueError('Cloth18 displacement points into its original surface')
    if shirt['clothBoundaryMaximumDisplacementMeters']>1e-8:raise ValueError('Cloth17 moved a pinned garment boundary')
    return result
