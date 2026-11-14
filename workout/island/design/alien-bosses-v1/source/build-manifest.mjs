import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const metadata=JSON.parse(fs.readFileSync(path.join(root,'source/model-metadata.json')));
const descriptions=[
  {name:'אם־חללית',subtitle:'שלושה תותחים, בתור',color:'#ff668f',shape:'capsule',pattern:'alternating-turrets',cycleSeconds:4.8,speed:1.5,warningSeconds:.9,targets:[['hull',12,true],['turret_left',5,false],['turret_center',5,false],['turret_right',5,false]],timeline:[
    {at:0,type:'tell',node:'turret_left'},{at:.9,type:'shot',node:'turret_left',anchor:'turret_left_muzzle',angles:[0]},
    {at:1.1,type:'tell',node:'turret_center'},{at:2,type:'shot',node:'turret_center',anchor:'turret_center_muzzle',angles:[-.16,0,.16]},
    {at:2.2,type:'tell',node:'turret_right'},{at:3.1,type:'shot',node:'turret_right',anchor:'turret_right_muzzle',angles:[0]}]},
  {name:'מגן קוסמי',subtitle:'קודם הגנרטור, אחר כך הליבה',color:'#ffb547',shape:'ring',pattern:'gated-ring-pairs',cycleSeconds:4.6,speed:1.2,warningSeconds:1,targets:[['hull',12,true],['generator',6,true]],timeline:[
    {at:0,type:'tell',node:'hull'},{at:1,type:'shot',node:'hull',anchor:'hull_muzzle_left',angles:[-.25,0]},
    {at:1,type:'shot',node:'hull',anchor:'hull_muzzle_right',angles:[0,.25]}]},
  {name:'זחל חלל',subtitle:'חמישה מקטעים, כל אחד בנפרד',color:'#f4773d',shape:'diamond',pattern:'segment-wave',cycleSeconds:5.6,speed:1.35,warningSeconds:1,targets:Array.from({length:5},(_,i)=>[`segment_0${i+1}`,5,true]),timeline:Array.from({length:5},(_,i)=>[
    {at:i*.55,type:'tell',node:`segment_0${i+1}`},
    {at:1+i*.55,type:'shot',node:`segment_0${i+1}`,anchor:`segment_0${i+1}_muzzle`,angles:[i%2?.18:-.18]}]).flat().sort((a,b)=>a.at-b.at)}
];
const frames=Array.from({length:6},(_,i)=>({x:i*128,y:0,w:128,h:128}));
const bosses=metadata.map((m,i)=>{
  const d=descriptions[i];return {id:m.id,nameHe:d.name,subtitleHe:d.subtitle,model:`models/${m.id}.glb`,triangles:m.triangles,modelBytes:m.bytes,rootNode:'boss_root',entranceSeconds:1.2,retreatSeconds:1.1,
    damageStates:{intact:{clip:'Damage_Intact',weights:[0,0],hpRatioAbove:.99},damaged:{clip:'Damage_Damaged',weights:[1,0],hpRatioAbove:.34},critical:{clip:'Damage_Critical',weights:[0,1],hpRatioAtMost:.34}},
    clips:{idle:'Idle',entrance:'Entrance',retreat:'Retreat'},parts:m.parts,anchors:m.anchors,
    targets:d.targets.map(([node,maxHp,required])=>({node,maxHp,required,radius:node==='hull'?1.1:node==='generator'?.34:.48,localCenter:node==='generator'?[0,.3,0]:[0,0,0]})),
    rules:m.id==='cosmic-guardian'?{invulnerableWhile:'generator.hp > 0',protectedTargets:['hull'],shieldNode:'shield',onGeneratorDestroyed:'hide shield; expose hull; do not regenerate'}:m.id==='mothership'?{onTurretDestroyed:'hide turret; stop its scheduled attacks',victory:'hull.hp === 0'}:{onSegmentDestroyed:'hide only that segment; stop only its attacks',victory:'all five segments.hp === 0'},
    attack:{pattern:d.pattern,cycleSeconds:d.cycleSeconds,warningSeconds:d.warningSeconds,projectileSpeedMetersPerSecond:d.speed,homing:false,maxConcurrentProjectiles:12,anglesUnit:'radians from +Z around Y',timeline:d.timeline},
    projectile:{path:`sprites/${m.id}-projectile.png`,width:64,height:64,pivot:[.5,.5],color:d.color,shape:d.shape,radiusMeters:.11,forwardImage:'+Y (down)',blend:'normal',premultipliedAlpha:false},
    effects:Object.fromEntries(['explosion','entrance','retreat'].map(k=>[k,{path:`sprites/${m.id}-${k}.png`,width:768,height:128,frameWidth:128,frameHeight:128,frames,frameCount:6,fps:k==='explosion'?12:8,loop:false,pivot:[.5,.5],blend:'normal',premultipliedAlpha:false,disposeAfterSeconds:k==='explosion'?.5:.75}])),
    audio:Object.fromEntries(['entrance','hit','explosion','death'].map(k=>[k,{ogg:`audio/${m.id}-${k}.ogg`,mp3:`audio/${m.id}-${k}.mp3`,gain:.45,maxBytesPerFile:80000}]))};
});
const files=[];for(const dir of ['models','sprites','audio'])for(const name of fs.readdirSync(path.join(root,dir)).sort()){
  const relative=`${dir}/${name}`,data=fs.readFileSync(path.join(root,relative));files.push({path:relative,bytes:data.length,sha256:crypto.createHash('sha256').update(data).digest('hex')});
}
const manifest={schemaVersion:1,package:'alien-bosses-v1',license:'CC0-1.0',baseCommit:'19d9cdc5e3718236df5a2fc4d8b8c26c72007575',preview:{path:'preview.html',viewport:[844,390],serverRequired:true},coordinates:{up:'+Y',forward:'+Z',units:'meters',scale:1},ageGuidance:{age:7,style:'rounded toy spacecraft; friendly faces; confetti pops; cheerful departure',minimumTelegraphSeconds:.9,screenShake:false,fullScreenFlash:false,homing:false},playerPaletteReference:{source:'../../minigames/ultra-alien-effects.mjs',colors:['#93dbff','#65eeff','#c5b2ff'],bossColors:['#ff668f','#ffb547','#f4773d'],distinction:'warm hues plus capsule/ring/diamond shapes; player uses cool narrow streaks'},integration:{referenceController:'encounter.mjs',liveGameIntegrated:false,damage:'Morph weights and painted scuff node scales; no shader or extension required. Set every mesh in the target part only.',destroyedParts:'Hide the part group and trigger its six-frame explosion at its world position.',lifecycle:'Do not accept hits or schedule shots during entrance, retreat or gone. One death cue and retreat; no respawn in the reference controller.'},budgets:{targetTrianglesPerBoss:3000,tolerancePercent:10,audioBytesPerFile:80000},bosses,files};
fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({bosses:bosses.map(b=>({id:b.id,triangles:b.triangles})),files:files.length,bytes:files.reduce((s,f)=>s+f.bytes,0)}));
