import {fs,path,root} from './mesh.mjs';
import {createHash} from 'node:crypto';
import {catalog} from '../catalog.mjs';
const audit=JSON.parse(await fs.readFile(path.join(root,'verification/assets.json'),'utf8'));
const byId=new Map(catalog.map(c=>[c.id,c]));
const files=audit.rows.map(row=>{
 const stem=row.filename.slice(0,-4),match=stem.match(/^(.*)-lod(\d+)$/),id=match?match[1]:stem,lod=match?Number(match[2]):0;
 return {id,lod,file:'models/'+row.filename,bytes:row.bytes,sha256:row.sha256,triangles:row.triangles,vertices:row.vertices,materials:row.materials,
   name:byId.get(id)?.name||id,role:byId.get(id)?.family||'תשתיות חווה',axes:{up:'+Y',forward:'+Z'},units:'meters',
   textures:row.textures.map(t=>({name:t.name,embedded:true,size:t.size,bytes:t.bytes,sha256:t.sha256})),
   animations:row.animations.map(a=>a.name),canonical18:row.skins.length>0&&row.skins.every(s=>s.sameCanonicalNames&&s.sameCanonicalParents),
   bounds:row.bounds,boundsSpace:row.boundsSpace,anchors:row.anchors,draco:{required:true,extension:'KHR_draco_mesh_compression'}};
});
const groups=[...new Set(files.map(f=>f.id))].map(id=>({id,name:byId.get(id)?.name||id,levels:files.filter(f=>f.id===id).map(f=>({lod:f.lod,file:f.file,triangles:f.triangles,bytes:f.bytes})),
  switching:(id.startsWith('guard-')&&id!=='guard-station'&&id!=='guard-crowd')||id.startsWith('boar-')?'Projected CSS height: >160px LOD0; 80–160px LOD1; <80px LOD2. LOD2 is a baked static pose; inspector always uses LOD0.':['farm-fence','island-palm','crop-patch','hay-bale','island-cloud'].includes(id)?'Farm batch LOD: 12m from camera; instanced per component.':'0/1 via Three LOD: 13m fleet, 17m individual scenery; scale thresholds with projected size at integration.'}));
const json={schemaVersion:1,pack:'defense-v7',generatedUTC:new Date().toISOString(),threeRevision:'160',runtime:'Local HTML or single-file offline.html. No build required at runtime.',baseCommit:'5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275',
  target:{platform:'medium phone browser',fps:30,maxGLBBytes:1500000,maxTextureSide:1024,characterAtlases:1,dprMax:1.5,adaptiveDprMin:.5},
  coordinates:{units:'meters',up:'+Y',forward:'+Z',root:'asset_root for authored props; collapsed v5 bind for guards'},
  guards:{skeleton:'skeleton.json',namesAndParents:'motion2 canonical 18',bind:'Retarget into the collapsed soccer-v5 bind; canonical local quaternions must be calibrated before use.',clips:{idle:{loop:true,rootMotion:false},patrol:{loop:true,rootMotion:false,source:'existing calibrated run'},alert:{loop:false,rootMotion:false}}},
  boars:{clips:{trot:{loop:true,durationSeconds:.8}},rig:'Four named rigid leg pivots, ground-compensated translation; anchors hit, ground, nose.'},
  effects:{module:'effects.mjs',class:'DefenseEffects',atlas:'textures/effects-atlas.png',atlasSize:[512,512],frames:16,durationSeconds:1.1,pools:{bursts:1,lasers:2,embers:32}},
  farm:{layout:'farm-layout.json',groundY:.23,fenceSpanMeters:2,instanced:['farm-fence','island-palm','crop-patch','hay-bale','guard-crowd','island-cloud','farm-lanterns']},
  rendering:{default:'PBR',underLoad:'DPR down to .75, contact shadows, matte Lambert without point lights/CSS blur, lowest LOD; finally DPR .5 if long frames persist. The delivered GLBs retain PBR materials.',frameCap:30,paused:'No repeated WebGL draws until the view changes. Pause and inspector controls restore up to DPR 1.5.'},groups,files};
await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify(json,null,2));
const tex=await Promise.all((await fs.readdir(path.join(root,'textures'))).sort().map(async filename=>{const bytes=await fs.readFile(path.join(root,'textures',filename));const size=filename.endsWith('.png')?[bytes.readUInt32BE(16),bytes.readUInt32BE(20)]:null;return {file:'textures/'+filename,bytes:bytes.length,MB:bytes.length/1e6,size,sha256:createHash('sha256').update(bytes).digest('hex')};}));
await fs.writeFile(path.join(root,'verification/texture-files.json'),JSON.stringify(tex,null,2));
let budget=await fs.readFile(path.join(root,'BUDGET.md'),'utf8');budget=budget.split('\n## טקסטורות חיצוניות')[0];
budget+='\n## טקסטורות חיצוניות\n\nהאטלסים גם מוטמעים ב־GLB; עותקים אלה נמסרים לעריכה ושחזור. בכל דמות מפה אחת זהה בכל רמות הפירוט.\n\n| קובץ | גודל | MB |\n|---|---:|---:|\n';
for(const t of tex)budget+=`| \`${t.file}\` | ${t.size?.join('×')||'—'} | ${t.MB.toFixed(6)} |\n`;
await fs.writeFile(path.join(root,'BUDGET.md'),budget);
console.log(JSON.stringify({models:files.length,assetGroups:groups.length,textures:tex.length}));
