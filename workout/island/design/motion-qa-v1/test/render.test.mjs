// SPDX-License-Identifier: CC0-1.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {renderReport,renderClip,comparisonRows} from '../report.mjs';
import {sheetSvg,selectEight,bonesFor} from '../sheets.mjs';

const clip=(id,score)=>({id,score,duration:1,height:1.8,metrics:{example:{value:0,status:'green'}},reasons:['synthetic reason']});
test('report puts lower scores first and keeps active content external',()=>{
  const html=renderReport({libraries:[{id:'test',clips:[clip('better',90),clip('worse',10)]}]});
  assert.ok(html.indexOf('worse</a>')<html.indexOf('better</a>'));
  assert.match(html,/script-src 'self'/);
  assert.doesNotMatch(html,/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?[^\s][\s\S]*?<\/script>/);
  assert.doesNotMatch(html,/\son(?:click|load|error)=/i);
});
test('clip labels, reasons, and evidence cannot inject HTML',()=>{
  const specimen=clip('<img src=x onerror=alert(1)>',20);
  specimen.reasons=['<script>bad()</script>'];
  specimen.metrics.example.evidence={description:'</pre><script>bad()</script>'};
  const html=renderClip(specimen,{id:'synthetic'});
  assert.doesNotMatch(html,/<script>bad/);
  assert.match(html,/&lt;script&gt;bad/);
  assert.match(html,/&lt;img src=x onerror/);
});
test('version comparison reports missing clips and signed score changes',()=>{
  const rows=comparisonRows({libraries:[
    {id:'old',sport:'soccer',version:9,clips:[clip('same',80),clip('removed',70)]},
    {id:'next',sport:'soccer',version:10,clips:[clip('same',60),clip('added',90)]},
  ]});
  assert.equal(rows.find(row=>row.id==='same').delta,-20);
  assert.equal(rows.find(row=>row.id==='removed').after,undefined);
  assert.equal(rows.find(row=>row.id==='added').before,undefined);
});
test('sheets are standalone SVG images with exactly eight sampled panels',()=>{
  const frames=Array.from({length:61},(_,i)=>({t:i/60,root:[0,0,0],joints:{Hips:[0,1,0],Spine:[0,1.2,0],Chest:[0,1.4,0],Neck:[0,1.5,0],Head:[0,1.7,0]}}));
  assert.equal(selectEight(frames).length,8);
  const svg=sheetSvg(clip('synthetic',50),frames);
  assert.match(svg,/xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  assert.equal((svg.match(/\/ 8 ·/g)??[]).length,8);
  assert.match(svg,/1\.000 s/);
  assert.doesNotMatch(svg,/<script|href="https?:/);
});
test('canonical eighteen-bone rigs keep torso and arms connected',()=>{
  const edges=bonesFor(Object.fromEntries(['Hips','Spine','Chest','Neck','Head','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand'].map(name=>[name,[0,1,0]])));
  for(const expected of [['Chest','Neck'],['Chest','LeftArm'],['Chest','RightArm']]) {
    assert.ok(edges.some(edge=>edge[0]===expected[0]&&edge[1]===expected[1]),expected.join(' → '));
  }
});
test('sheet selection uses time spacing on nonuniform frame grids',()=>{
  const frames=[0,.01,.02,.03,.04,.05,.06,.4,.6,.8,1].map(t=>({t}));
  const chosen=selectEight(frames);
  assert.equal(chosen[0].t,0);
  assert.equal(chosen.at(-1).t,1);
  assert.ok(chosen.some(frame=>frame.t===.4));
  assert.ok(chosen.some(frame=>frame.t===.6));
});
