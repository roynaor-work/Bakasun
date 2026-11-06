import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {ROOT,RUNTIME,decodedParts,webpSize,filesUnder} from './audit-helpers.mjs';
import {LEVELS,NON_PLAYER_BUDGET,crowdPlacements,bowlPoint,bowlArcPoint,bowlPerimeter,TIERS} from '../runtime/layout.mjs';
import {measureTriangles,THREE} from '../runtime/stadium.mjs';

const totals=[];
test('The shipped renderer is exactly three.js r160',()=>assert.equal(THREE.REVISION,'160'));
for(let index=0;index<3;index++)test(`LOD${index}: decoded triangles per part, including every crowd instance <= 40,000`,async t=>{
  const report=await decodedParts(path.join(RUNTIME,`stadium-lod${index}.glb`));
  const crowd=crowdPlacements(LEVELS[index]);
  // PlaneGeometry(1,1) has two triangles. Four glow sprites add eight, and
  // Three's textured background adds two. Every non-player object is included.
  const parts=Object.fromEntries(report.parts);parts.Crowd=crowd.length*2;parts.Halos=8;parts.Sky=2;
  const total=Object.values(parts).reduce((a,b)=>a+b,0);totals[index]=total;
  for(const [part,count]of Object.entries(parts)){
    assert.ok(Number.isInteger(count)&&count>0,part+' must contain whole triangles');t.diagnostic(`${part}: ${count}`);
  }
  assert.ok(total<=NON_PLAYER_BUDGET,`${total} exceeds ${NON_PLAYER_BUDGET}`);
  assert.ok(report.bytes<=1_500_000,'GLB exceeds decimal 1.5 MB');
  assert.ok(crowd.length>200,'Crowd must not disappear at a lower LOD');
  t.diagnostic(`TOTAL ${total}; ${crowd.length} cards, ${crowd.length*3} illustrated spectators; GLB ${report.bytes} bytes`);
});

test('Three levels reduce the complete scene, with exactly one level active',()=>{
  assert.equal(totals.length,3);assert.ok(totals[0]>totals[1]&&totals[1]>totals[2]);
  assert.ok(totals[2]<totals[0]*.25,'The far level must materially reduce the budget');
  const root=new THREE.Group(),levels=[];
  for(let i=0;i<3;i++){
    const group=new THREE.Group(),mesh=new THREE.InstancedMesh(new THREE.PlaneGeometry(),new THREE.MeshBasicMaterial(),10*(i+1));
    mesh.userData.part='Crowd';group.add(mesh);levels.push(group);root.add(group);
  }
  for(let active=0;active<3;active++){
    levels.forEach((g,i)=>g.visible=i===active);assert.equal(measureTriangles(root).total,20*(active+1));
  }
  assert.equal(measureTriangles(root,{visibleOnly:false}).total,120);
  root.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
});

test('Continuous perimeter, closed corners and crowd cards stay outside the field',()=>{
  for(const tier of TIERS){
    const a=bowlPoint(0,tier.hx,tier.hz,tier.radius),b=bowlPoint(1,tier.hx,tier.hz,tier.radius);
    assert.deepEqual(a,b);
    let last=a;
    for(let i=1;i<=2048;i++){
      const p=bowlPoint(i/2048,tier.hx,tier.hz,tier.radius);
      assert.ok(Math.hypot(p[0]-last[0],p[1]-last[1])<1,'Open seam in bowl perimeter');last=p;
      assert.ok(Math.abs(p[0])>=55||Math.abs(p[1])>=37,'Bowl intrudes on the playing field');
    }
  }
  for(const level of LEVELS)for(const card of crowdPlacements(level)){
    assert.ok(Math.abs(card.x)>55||Math.abs(card.z)>37);assert.ok(card.height>1&&card.height<2);
    assert.ok(Number.isInteger(card.variant)&&card.variant>=0&&card.variant<16);
  }
});

test('Arc-length placement keeps crowd spacing uniform on corners and straights',()=>{
  for(const tier of TIERS){
    const expected=bowlPerimeter(tier.hx,tier.hz,tier.radius)/2048;
    let previous=bowlArcPoint(0,tier.hx,tier.hz,tier.radius);
    for(let i=1;i<=2048;i++){
      const p=bowlArcPoint(i/2048,tier.hx,tier.hz,tier.radius),distance=Math.hypot(p[0]-previous[0],p[1]-previous[1]);
      assert.ok(Math.abs(distance-expected)<expected*.01,'Crowd arc distance is not uniform');previous=p;
    }
  }
});

test('Triangle accounting includes transparent double-sided passes',()=>{
  const material=new THREE.MeshBasicMaterial({transparent:true,side:THREE.DoubleSide}),mesh=new THREE.Mesh(new THREE.PlaneGeometry(),material);
  assert.equal(measureTriangles(mesh).total,4);
  material.forceSinglePass=true;assert.equal(measureTriangles(mesh).total,2);
  mesh.geometry.dispose();material.dispose();
});

test('The deliverable obeys byte limits and contains no raw JSON, video or archive',async t=>{
  const files=await filesUnder(ROOT);let total=0;
  for(const file of files){
    const bytes=(await fs.stat(file)).size;total+=bytes;
    assert.ok(!/\.(json|jsonl|json5|mp4|mov|webm|avi|zip|tar|gz)$/i.test(file),path.relative(ROOT,file));
    assert.ok(bytes<=(file.endsWith('.glb')?1_500_000:5_000_000),`${path.relative(ROOT,file)} exceeds file limit`);
    if(file.endsWith('.webp')){
      const size=webpSize(await fs.readFile(file));
      if(file.startsWith(RUNTIME+path.sep))assert.ok(size.every(x=>x<=1024),`${file}: ${size}`);
    }
    if(file.endsWith('.html'))assert.ok(bytes<10_000,'Preview must be a lightweight HTML shell');
  }
  assert.ok(total<=60_000_000,`${total} exceeds package limit`);t.diagnostic(`Package ${total} bytes; ${files.length} files`);
});

test('Runtime imports are local, complete and contained in runtime/',async()=>{
  const files=(await filesUnder(RUNTIME)).filter(f=>/\.(mjs|js)$/.test(f));
  for(const file of files){
    const source=await fs.readFile(file,'utf8');
    const imports=[...source.matchAll(/^\s*(?:import|export)\s+(?:[\w*$,\s{}]+\s+from\s*)?['"]([^'"]+)['"]/gm)].map(m=>m[1]);
    for(const specifier of imports){
      assert.ok(specifier.startsWith('.'),`Non-local import: ${specifier}`);
      const resolved=path.resolve(path.dirname(file),specifier);assert.ok(resolved.startsWith(RUNTIME+path.sep));await fs.access(resolved);
    }
    assert.ok(imports.every(specifier=>!/\?v=/.test(specifier)),'No version query tags');
  }
});
