import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../runtime/vendor/three.module.js';
import {createPopulation} from '../runtime/population.mjs';
import {createBallGeometry,createScoreSurfaces} from '../runtime/surfaces.mjs';
import {ASSETS} from '../runtime/layout.mjs';
import {decodeParts} from '../source/inspect-glb.mjs';

const totals=[];
for(let level=0;level<3;level++)test('LOD '+level+': decoded per-part triangles + instancing + replay ≤ 35,000',async t=>{
  const {parts,document}=await decodeParts(new URL('../runtime/'+ASSETS[level],import.meta.url));
  // Count node multiplicity as well as unique mesh data. A duplicated mesh node
  // costs triangles, even when the binary geometry is stored only once.
  const nodes=document.nodes;let shell=0;
  function walk(index){const n=nodes[index];if(n.mesh!==undefined){const mesh=document.meshes[n.mesh];for(const p of mesh.primitives)shell+=document.accessors[p.indices].count/3;}for(const c of n.children||[])walk(c);}
  for(const index of document.scenes[document.scene??0].nodes)walk(index);
  for(const p of parts)t.diagnostic(p.name+': '+p.triangles);
  const court=parts.find(p=>p.name==='court__parquet');assert(court?.attributes.TEXCOORD_0,'The floor must retain UVs used by the runtime material');
  assert.equal(court.triangles,2);for(const name of ['rim-home','rim-away'])assert(nodes.some(n=>n.name===name),'Preserved integration anchor '+name);
  for(const side of ['home','away'])assert(parts.some(p=>p.name.startsWith('basket-'+side+'__net')),'Open net geometry');
  const population=createPopulation(level);let populationTris=0;
  population.group.traverse(o=>{if(o.isMesh){const tri=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;const instances=o.isInstancedMesh?o.count:1;const n=tri*instances;populationTris+=n;t.diagnostic(o.name+': '+tri+' × '+instances+' = '+n);assert(o.isInstancedMesh,'Crowd and seats must stay instanced');assert(o.material.forceSinglePass,'Double-sided transparent surfaces must not render twice');}});
  const optionalBall=createBallGeometry(),ball=optionalBall.index.count/3;optionalBall.dispose();
  const screenMaterial=new THREE.MeshBasicMaterial(),shotMaterial=new THREE.MeshBasicMaterial();
  const scoreSurfaces=createScoreSurfaces(screenMaterial,shotMaterial);let screens=0;
  scoreSurfaces.traverse(o=>{if(o.isMesh){screens+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;o.geometry.dispose();}});
  screenMaterial.dispose();shotMaterial.dispose();
  const live=shell+populationTris+ball+screens;
  const replay=live*2; // Main replay + live inset: no shadows or reflection passes.
  t.diagnostic(`SHELL ${shell}; POPULATION ${populationTris}; BALL ${ball}; SCREENS ${screens}; LIVE ${live}; REPLAY ${replay}`);
  assert(replay<=35000,`LOD ${level}: ${replay} exceeds 35,000 including replay`);
  totals[level]=live;population.dispose();
});
test('Three strictly decreasing LOD totals and local r160',()=>{assert.equal(THREE.REVISION,'160');assert(totals[0]>totals[1]&&totals[1]>totals[2]);});
