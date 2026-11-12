// SPDX-License-Identifier: CC0-1.0
// מקור: בדיקת מסירה מקורית שנכתבה עבור חבילת ההוקי.
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {CANON_BONES, CANON_NAMES} from '../../../minigames/athletes-core.mjs';

const base = new URL('../', import.meta.url);
const problems = [], checks = [];
function check(condition, label, details = null) {
  checks.push({label, passed: !!condition, ...(details === null ? {} : {details})});
  if (!condition) problems.push(label);
}
const expected = [
  'skate_push_slow','skate_push_medium','skate_push_fast','skate_glide',
  'skate_crossover_left','skate_crossover_right','skate_stop_left','skate_stop_right',
  'skate_turn_45','skate_turn_90','skate_turn_180','skate_backward',
  'ready_1','ready_2','ready_3','shot_wrist','shot_slap','pass','receive','body_check',
  'goalie_stance','goalie_butterfly','goalie_slide_left','goalie_slide_right',
  'goalie_glove_high','goalie_glove_low','goalie_stick_save','celebrate_1','celebrate_2','celebrate_3',
];
const near = (a,b,eps=1e-5) => a.length === b.length && a.every((v,i)=>Math.abs(v-b[i])<eps);
const bytesPer = {5120:1,5121:1,5122:2,5123:2,5125:4,5126:4};
const elements = {SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
const reader = {5120:'readInt8',5121:'readUInt8',5122:'readInt16LE',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'};
function glb(relative) {
  const buf = readFileSync(new URL(relative,base));
  check(buf.readUInt32LE(0)===0x46546c67 && buf.readUInt32LE(4)===2, relative+' כותרת GLB');
  check(buf.readUInt32LE(8)===buf.length, relative+' אורך GLB');
  let json, bin;
  for(let at=12; at<buf.length;) {
    const length=buf.readUInt32LE(at), type=buf.readUInt32LE(at+4);
    if(type===0x4e4f534a) json=JSON.parse(buf.subarray(at+8,at+8+length).toString('utf8'));
    if(type===0x004e4942) bin=buf.subarray(at+8,at+8+length);
    at+=8+length;
  }
  check(!!json && !!bin, relative+' חלקי JSON ובינארי');
  check(!(json.extensionsUsed||[]).some(e=>/draco/i.test(e)),relative+' ללא Draco');
  check(!(json.buffers||[]).some(b=>b.uri) && !(json.images||[]).some(i=>i.uri),relative+' ללא משאבים חיצוניים');
  function accessor(index) {
    const a=json.accessors[index], v=json.bufferViews[a.bufferView], n=elements[a.type], size=bytesPer[a.componentType];
    const stride=v.byteStride||n*size, offset=(v.byteOffset||0)+(a.byteOffset||0), values=[];
    for(let i=0;i<a.count;i++)for(let k=0;k<n;k++)values.push(bin[reader[a.componentType]](offset+i*stride+k*size));
    return {a,values};
  }
  return {json,bin,accessor,bytes:buf.length,sha256:createHash('sha256').update(buf).digest('hex')};
}
const models=[];
for(const [name,limit] of [['skater',8000],['goalie',10000]]) {
  const relative='models/'+name+'.glb', g=glb(relative), {json:j,accessor:a}=g;
  const skin=j.skins?.[0];
  check(j.skins?.length===1 && skin.joints.length===18,relative+' שלד אחד עם 18 עצמות');
  for(const region of ['uniform_primary','uniform_secondary','uniform_trim']) {
    const primitives=j.meshes.flatMap(m=>m.primitives).filter(p=>j.materials[p.material]?.name===region);
    check(primitives.length>0&&primitives.every(p=>p.attributes.COLOR_0!==undefined),relative+' אזור צבע '+region);
    check(primitives.every(p=>near(j.materials[p.material].pbrMetallicRoughness?.baseColorFactor||[1,1,1,1],[1,1,1,1])),relative+' בסיס לבן לאזור '+region);
  }
  check(j.nodes.filter(n=>n.skin!==undefined).every(n=>!n.matrix&&near(n.translation||[0,0,0],[0,0,0])&&near(n.rotation||[0,0,0,1],[0,0,0,1])&&near(n.scale||[1,1,1],[1,1,1])),relative+' רשת קשורה ללא שינוי צירים');
  check(JSON.stringify(skin.joints.map(i=>j.nodes[i].name))===JSON.stringify(CANON_NAMES),relative+' סדר עצמות קנוני');
  const parents={};j.nodes.forEach((n,i)=>(n.children||[]).forEach(c=>parents[c]=i));
  for(let i=0;i<CANON_BONES.length;i++) {
    const b=CANON_BONES[i], node=j.nodes[skin.joints[i]];
    check(near(node.translation||[0,0,0],b.rest),relative+' מנוחת '+b.name);
    check(near(node.rotation||[0,0,0,1],[0,0,0,1])&&near(node.scale||[1,1,1],[1,1,1]),relative+' צירי '+b.name);
    if(b.parent)check(j.nodes[parents[skin.joints[i]]]?.name===b.parent,relative+' הורה '+b.name);
  }
  const world={};
  for(const b of CANON_BONES)world[b.name]=b.rest.map((v,i)=>v+(b.parent?world[b.parent][i]:0));
  const ib=a(skin.inverseBindMatrices).values;
  check(ib.length===18*16,relative+' מטריצות קשירה');
  for(let i=0;i<18;i++) {
    const p=world[CANON_NAMES[i]], ideal=[1,0,0,0,0,1,0,0,0,0,1,0,-p[0],-p[1],-p[2],1];
    check(near(ib.slice(i*16,i*16+16),ideal),relative+' קשירת מנוחה '+CANON_NAMES[i]);
  }
  let triangles=0, vertices=0, maxJoint=0, weightError=0;
  const min=[Infinity,Infinity,Infinity], max=[-Infinity,-Infinity,-Infinity], colors=new Set();
  for(const mesh of j.meshes)for(const p of mesh.primitives) {
    check((p.mode??4)===4,relative+' משולשים');
    const pos=a(p.attributes.POSITION), weights=a(p.attributes.WEIGHTS_0), joints=a(p.attributes.JOINTS_0), color=a(p.attributes.COLOR_0);
    triangles+=(p.indices===undefined?pos.a.count:j.accessors[p.indices].count)/3;vertices+=pos.a.count;
    check(pos.values.every(Number.isFinite)&&weights.values.every(Number.isFinite),relative+' קודקודים סופיים');
    for(let i=0;i<pos.a.count;i++) {
      for(let k=0;k<3;k++){min[k]=Math.min(min[k],pos.values[i*3+k]);max[k]=Math.max(max[k],pos.values[i*3+k]);}
      maxJoint=Math.max(maxJoint,...joints.values.slice(i*4,i*4+4));
      let w=weights.values.slice(i*4,i*4+4);
      if(weights.a.normalized)w=w.map(v=>v/(weights.a.componentType===5123?65535:255));
      weightError=Math.max(weightError,Math.abs(w.reduce((x,y)=>x+y,0)-1));
      colors.add(color.values.slice(i*elements[color.a.type],i*elements[color.a.type]+3).map(v=>+v.toFixed(5)).join(','));
    }
  }
  check(triangles<=limit,relative+' תקציב משולשים',{triangles,limit});
  check(maxJoint<18 && weightError<1e-4,relative+' משקלי שלד תקינים',{maxJoint,weightError});
  check(Math.abs(max[1]-min[1]-1.85)<.005,relative+' גובה 1.85 מטר',{height:max[1]-min[1],min,max});
  models.push({name,triangles,vertices,min,max,colorCount:colors.size,bytes:g.bytes,sha256:g.sha256});
}
const stick=glb('models/stick.glb');
check(!stick.json.skins?.length,'המקל הוא אביזר עצמאי');
const sockets=stick.json.nodes.filter(n=>/grip|blade/i.test(n.name||''));
check(sockets.some(n=>/grip/i.test(n.name))&&sockets.some(n=>/blade/i.test(n.name)),'נקודות אחיזה ולהב במקל',sockets.map(n=>({name:n.name,translation:n.translation})));

const pack=JSON.parse(readFileSync(new URL('clips.json',base),'utf8'));
check(pack.schemaVersion===1&&pack.fps===30,'סכמה וקצב 30 פריימים לשנייה');
check(expected.every(id=>pack.states[id]),'כיסוי כל התנועות המבוקשות',{expected:expected.length,actual:Object.keys(pack.states).length});
const clips=[];
for(const [id,c]of Object.entries(pack.states)) {
  check(typeof c.loop==='boolean'&&c.durationSeconds>0,id+' משך ולולאה');
  check(Array.isArray(c.events)&&Array.isArray(c.supports)&&c.supports.length>0,id+' אירועים וחלונות מגע');
  check(c.keyframes.length===Math.round(c.durationSeconds*30)+1,id+' דגימה מלאה ב־30 הרץ');
  let maxQError=0;
  for(let i=0;i<c.keyframes.length;i++) {
    const f=c.keyframes[i];
    check(Math.abs(f.time-i/(c.keyframes.length-1))<1e-5,id+' זמן '+i);
    check(JSON.stringify(Object.keys(f.rotations))===JSON.stringify(CANON_NAMES),id+' כל העצמות בפריים '+i);
    check(Array.isArray(f.hipsOffsetMeters)&&f.hipsOffsetMeters.length===3&&f.hipsOffsetMeters.every(Number.isFinite),id+' אגן בפריים '+i);
    for(const q of Object.values(f.rotations)) {
      if(q.length!==4||!q.every(Number.isFinite))maxQError=Infinity;
      else maxQError=Math.max(maxQError,Math.abs(Math.hypot(...q)-1));
    }
  }
  check(maxQError<1e-5,id+' קווטרניונים מנורמלים',maxQError);
  check(c.supports.every(s=>['LeftFoot','RightFoot'].includes(s.bone)&&s.start>=0&&s.end>s.start&&s.end<=c.durationSeconds+1e-6&&s.contact==='blade'),id+' חלונות להב בשניות');
  check(c.events.every(e=>(e.timeSeconds??e.time)>=0&&(e.timeSeconds??e.time)<=c.durationSeconds+1e-6),id+' זמני אירועים בשניות');
  if(c.loop) {
    const first=c.keyframes[0],last=c.keyframes.at(-1);
    const error=Math.max(...CANON_NAMES.map(n=>{const p=first.rotations[n],q=last.rotations[n];return Math.min(Math.hypot(...p.map((v,i)=>v-q[i])),Math.hypot(...p.map((v,i)=>v+q[i])));}));
    check(error<1e-4&&near(first.hipsOffsetMeters,last.hipsOffsetMeters),id+' סגירת לולאה',{quaternionError:error});
  }
  clips.push({id,frames:c.keyframes.length,durationSeconds:c.durationSeconds,loop:c.loop,supports:c.supports.length,events:c.events.length,maxQuaternionNormError:maxQError});
}
mkdirSync(new URL('evidence/',base),{recursive:true});
const result={license:'CC0-1.0',source:'source/validate.mjs',passed:!problems.length,totalChecks:checks.length,failures:problems,models,stick:{bytes:stick.bytes,sockets},clips,checks};
writeFileSync(new URL('evidence/validation.json',base),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({passed:result.passed,totalChecks:checks.length,failures:problems,models,clips:clips.length}));
if(problems.length)process.exitCode=1;
