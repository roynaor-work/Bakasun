// Assemble an integration manifest from the delivered, independently checked assets.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

const root=path.resolve(import.meta.dirname,'..');
const read=async name=>JSON.parse(await fs.readFile(path.join(root,name),'utf8'));
const players=await read('assets/players/player-metadata.json');
const arena=await read('assets/arena-provenance.json');
const inventory=await read('inventory.json');
const validation=await read('verification/gltf-validation.json');
const entry=file=>inventory.assets.find(a=>a.file===file);
const manifest={
 schemaVersion:1,id:'island-hoops-v4',scope:'Design assets and standalone preview; gameplay integration is separate.',
 coordinates:{units:'metres',up:'+Y',front:'+Z',groundY:0},
 preview:'preview.html',lineup:'previews/lineup-front.png',
 roles:players.players.map(p=>({id:p.id,role:p.role,heightMeters:p.heightMeters,build:p.build,
  chestWidthMeters:p.chestWidthMeters,asset:entry(`assets/players/${p.id}.glb`),
  clips:p.clips,source:{file:p.sourcePath,sha256:p.sourceSha256}})),
 skeleton:{jointNames:players.players[0].jointNames,animationFormat:'glTF 2.0 baked skeletal tracks; animations are embedded in each character GLB.'},
 uniforms:{materials:players.paletteMaterials,palettes:players.teams,policy:'Colors only; no names, numbers, crests, badges or text.'},
 environment:{asset:entry('assets/arena.glb'),anchors:arena.assets.arena.anchors,
  crowd:arena.assets.arena.details},
 props:{ball:{...entry('assets/ball.glb'),...arena.assets.ball.details},hoop:{...entry('assets/hoop.glb'),...arena.assets.hoop.details}},
 runtimeAssetBytes:inventory.runtimeAssetBytes,
 verification:{gltf:'verification/gltf-validation.json',browser:'verification/browser-validation.json',
  allAssetsPass:validation.pass,budget:validation.budget},
 licenses:'LICENSES.md',
 acceptance:{explicitRequirements:['five distinct roles and builds','color-only uniforms for two teams','arena with stands and crowd','ball and hoop','dribble, shoot, steal, block, run','same-scale five-character lineup screenshot'],
  inheritedTask1Requirements:{source:'User brief in Codex chat 1. סקי: עולם ושחקן',maximumGlbBytes:1500000,requiredCompression:'KHR_draco_mesh_compression',maximumTextureDimension:1024,allGlbLoadInBrowser:true,triangleReport:true,viewerConsoleErrors:0}}
};
await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const files=[];
async function walk(dir){for(const e of (await fs.readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
 if(e.name==='__pycache__'||e.name==='node_modules'||e.name==='package-budget.json')continue;
 const p=path.join(dir,e.name);if(e.isDirectory())await walk(p);else{
  const b=await fs.readFile(p);files.push({file:path.relative(root,p),bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')});
 }
}}
await walk(root);
await fs.writeFile(path.join(root,'package-budget.json'),JSON.stringify({schemaVersion:1,runtimeAssetBytes:inventory.runtimeAssetBytes,
 packageBytesExcludingThisReport:files.reduce((s,f)=>s+f.bytes,0),
 note:'Runtime budget counts the eight GLB assets. Evidence, source, docs, shared repository vendor modules and this report are separate.',files},null,2)+'\n');
console.log(`Manifest: ${manifest.roles.length} roles; runtime ${manifest.runtimeAssetBytes} bytes; ${files.length} package files.`);
