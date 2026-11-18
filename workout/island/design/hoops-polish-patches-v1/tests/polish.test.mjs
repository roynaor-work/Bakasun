import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import test from 'node:test';

const root=path.resolve(process.env.HOOPS_TEST_ROOT||fileURLToPath(new URL('../../../../../',import.meta.url)));
const island=pathToFileURL(path.join(root,'workout/island/'));
const fromIsland=file=>import(new URL(file,island));
const {readHoopsPolish}=await fromIsland('minigames/hoops-polish-flags.mjs');
const {createCourt}=await fromIsland('minigames/hoops-court.mjs');
const {hoopsColliders,stepBall}=await fromIsland('minigames/hoops-ball.mjs');
const {hoopsImpactSamples,hoopsImpactCue}=await fromIsland('minigames/hoops-polish-audio.mjs');
const {createHoopsBasketMotion,createHoopsBallHandoff,markHoopsRim,updateHoopsBallShadow}=await fromIsland('minigames/hoops-polish-view.mjs');
const T=await fromIsland('vendor/three.module.js');
const config=JSON.parse(await readFile(new URL('data/config.json',island))).minigames.streetSlam;
const court=createCourt(config.court),colliders=hoopsColliders(court,config.court);
const features=['physics','rim','net','audio','lighting','shadow','transitions'];

function advance(ball,options) {
  return stepBall(ball,1/60,court,colliders,config.physics,options);
}
function atRim(side,{x=0,y=0,z=0,vx=0,vy=0,vz=0}={}) {
  return {x:side*(court.rimX+x),y:court.rimY+y,z,vx:side*vx,vy,vz};
}

test('each query flag stands alone and the kill switch overrides explicit opt-ins',()=>{
  assert.deepEqual(Object.keys(readHoopsPolish('')),features);
  assert.ok(Object.values(readHoopsPolish('')).every(Boolean));
  for(const feature of features) {
    const flag='hoopsPolish'+feature[0].toUpperCase()+feature.slice(1);
    const flags=readHoopsPolish(`?${flag}=0`);
    assert.deepEqual(features.filter(key=>!flags[key]),[feature]);
    assert.ok(Object.values(readHoopsPolish(`?${flag}=1&hoopsPolish=0`)).every(value=>!value));
  }
});

test('symmetric torus hits rebound and a clean swish crosses exactly once at either basket',()=>{
  for(const side of [1,-1]) {
    const options={rimPhysics:true,impactDetails:true};
    const hard=atRim(side,{y:.139,z:court.rimR+.012,vy:-4});
    const result=advance(hard,options),hit=result.events.find(event=>event.type==='rim');
    assert.ok(hit?.speed>3);
    assert.equal(hit.side,side);
    assert.ok(hit.ny>.9);
    assert.ok(hard.vy>1.6);
    assert.equal(result.crossings.length,0);
    const glass=atRim(side,{x:.21,y:.58,vx:6});
    const board=advance(glass,options).events.find(event=>event.type==='board');
    assert.equal(board?.side,side);
    assert.ok(glass.vx*side<0);
    const clean=atRim(side,{y:.06,vy:-5});
    assert.deepEqual(advance(clean,options).crossings,[{side,radius:0}]);
    assert.deepEqual(advance(clean,options).crossings,[]);
  }
});

test('slow top contacts have a visible dwell, leave the rim, and can fall inside or outside',()=>{
  for(const side of [1,-1])for(const offset of [-.004,0,.004]) {
    const ball=atRim(side,{y:.157,z:court.rimR+offset,vy:-.45});
    let firstHit,cleared,crossings=0,rimSounds=0;
    for(let frame=0;frame<90;frame++) {
      const result=advance(ball,{rimPhysics:true,impactDetails:true});
      if(result.touchedRim)firstHit??=frame;
      if(firstHit!==undefined&&ball.y<=court.rimY+.09)cleared??=frame;
      rimSounds+=result.events.filter(event=>event.type==='rim').length;
      crossings+=result.crossings.length;
    }
    assert.ok(cleared-firstHit>=8&&cleared-firstHit<=29,`top dwell ${cleared-firstHit} frames`);
    assert.equal(crossings,offset<0?1:0);
    assert.equal(rimSounds,1,'resting contacts stay below the impulse threshold');
  }
});

test('the pre-patch solver and event shapes are identical with the master switch off',{
  skip:!process.env.HOOPS_BASELINE_ROOT,
},async()=>{
  const baseline=pathToFileURL(path.resolve(process.env.HOOPS_BASELINE_ROOT,'workout/island')+'/');
  const old=await import(new URL('minigames/hoops-ball.mjs',baseline));
  const flags=readHoopsPolish('?hoopsPolish=0');
  const options={rimPhysics:flags.physics,impactDetails:flags.rim||flags.net||flags.audio};
  for(const side of [1,-1]) {
    for(const [dy,dz,vy] of [[.16,.02,-5],[.42,-.18,-2],[.2,court.rimR,-1],[.62,.31,2]]) {
      const current=atRim(side,{x:.06,y:dy,z:dz,vx:1,vy,vz:.8}),previous={...current};
      for(let frame=0;frame<100;frame++) {
        assert.deepEqual(advance(current,options),old.stepBall(previous,1/60,court,colliders,config.physics));
        assert.deepEqual(current,previous);
      }
    }
  }
});

function mesh(points) {
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(points.flat(),3));
  return new T.Mesh(geometry,new T.MeshBasicMaterial());
}

test('a hit rotates its own rim range, holds the mount and net lip, and restores both in replay',()=>{
  const arena=new T.Group(),x=court.rimX,y=court.rimY,r=court.rimR;
  const ring=mesh([[x+r,y,0],[x-r,y,.08],[-x-r,y,0],[-x+r,y,.08],[0,0,0]]);
  arena.add(ring);
  markHoopsRim(ring,1,0,2);
  markHoopsRim(ring,-1,2,2);
  const net=mesh([[0,0,.18],[.05,-.40,.09]]),other=net.clone();
  other.geometry=net.geometry.clone();
  net.position.set(x,y,0);other.position.set(-x,y,0);
  arena.add(net,other);
  const values=object=>Array.from(object.geometry.attributes.position.array);
  const start=values(ring),netStart=values(net),mount=net.position.clone();
  const motion=createHoopsBasketMotion(arena,[{mesh:net,side:1},{mesh:other,side:-1}],court,{rim:true,net:true},false);
  motion.effects([{type:'contact',what:'rim',speed:5,side:1,x:x-r,z:.10,ny:.95,tick:42}],{tick:42});
  motion.update(44);
  const bent=values(ring);
  assert.ok(Math.abs(start[4]-bent[4])>.015);
  assert.ok(Math.abs(start[1]-bent[1])<.00001,'pivot stays fixed');
  assert.deepEqual(bent.slice(6),start.slice(6),'other rim and stand are unchanged');
  assert.deepEqual(values(net).slice(0,3),netStart.slice(0,3),'lip positions are pinned in net space');
  assert.notEqual(values(net)[4],netStart[4]);
  assert.notDeepEqual(net.position,mount,'net mount follows the rim');
  assert.deepEqual(values(other),netStart);
  motion.update(122);
  assert.deepEqual(values(ring),start);
  assert.deepEqual(values(net),netStart);
  assert.deepEqual(net.position,mount);
  motion.update(44);
  assert.deepEqual(values(ring),bent,'replaying the same tick gives the same geometry');
});

test('net-only mode reacts at the scored end and ignores awarded goaltending points',()=>{
  const arena=new T.Group(),plus=mesh([[.18,0,0],[.09,-.41,0]]),minus=mesh([[.18,0,0],[.09,-.41,0]]);
  plus.position.set(court.rimX,court.rimY,0);minus.position.set(-court.rimX,court.rimY,0);
  arena.add(plus,minus);
  const motion=createHoopsBasketMotion(arena,[{mesh:plus,side:1},{mesh:minus,side:-1}],court,{rim:false,net:true},false);
  const base=minus.geometry.attributes.position.getY(1);
  motion.effects([{type:'score',side:-1,tick:20,goaltend:true}],{tick:20});
  motion.update(24);
  assert.equal(minus.geometry.attributes.position.getY(1),base);
  motion.effects([{type:'score',side:-1,tick:30}],{tick:30});
  motion.update(34);
  assert.ok(minus.geometry.attributes.position.getY(1)<base-.02);
  assert.equal(plus.geometry.attributes.position.getY(1),base);
  motion.update(116);
  assert.equal(minus.geometry.attributes.position.getY(1),base);
});

test('handoffs ease into catch and release and reset when the replay timeline changes',()=>{
  const apply=createHoopsBallHandoff(court.ballR),point=new T.Vector3();
  const sample=(x,state,tick,replay=null,owner=null,dt=1/60)=>{
    apply(point.set(x,1,0),{state,owner},tick,replay,dt);
    return point.x;
  };
  assert.equal(sample(0,'pass',1),0);
  assert.equal(sample(.5,'held',2,null,'a'),0);
  const ease=sample(.5,'held',3,null,'a');
  assert.ok(ease>0&&ease<.1);
  assert.equal(sample(.5,'held',13,null,'a',.2),.5);
  assert.equal(sample(.85,'shot',14),.5);
  assert.equal(sample(6,'held',15,{},'a'),6);
  assert.equal(sample(2,'dead',16),2);
});

test('the contact shadow tracks the ball toward the floor and fades outside the run-off',()=>{
  const shadow={position:new T.Vector3(),scale:new T.Vector3(),material:{}},key={position:new T.Vector3(5,24,7)};
  const ball={position:new T.Vector3(0,court.ballR,0),visible:true};
  updateHoopsBallShadow(shadow,ball,court,key,.014);
  const contactOpacity=shadow.material.opacity;
  assert.equal(shadow.position.x,0);
  ball.position.y=3;
  updateHoopsBallShadow(shadow,ball,court,key,.014);
  assert.ok(shadow.position.x<-.5&&shadow.position.z<-.7&&shadow.scale.x>1.9);
  assert.ok(shadow.material.opacity<contactOpacity*.25);
  ball.position.x=court.hx+3;
  updateHoopsBallShadow(shadow,ball,court,key,.014);
  assert.equal(shadow.visible,false);
});

test('authored impacts choose different samples or filters and are included in the offline package',async()=>{
  assert.deepEqual([1,3,6].map(speed=>hoopsImpactCue('rim',speed).sample),['rim-hit-01','rim-hit-02','rim-hit-03']);
  assert.deepEqual([1,3,6].map(speed=>hoopsImpactCue('floor',speed).sample),['ball-parquet-soft','ball-parquet-medium','ball-parquet-hard']);
  assert.equal(hoopsImpactCue('board').sample,'backboard-thud');
  assert.equal(hoopsImpactCue('pad').lowpass,690);
  assert.equal(hoopsImpactCue('block').rate,1.29);
  assert.equal(hoopsImpactCue('net').sample,'net-swish');
  assert.equal(hoopsImpactCue('whistle'),null);
  const manifest=JSON.parse(await readFile(new URL('offline-manifest.json',island)));
  for(const [,spec] of hoopsImpactSamples())for(const url of [spec.url,spec.alt]) {
    const name=url.href.slice(island.href.length),bytes=await readFile(url);
    assert.ok(manifest.games.hoops.includes(name),name);
    assert.deepEqual(manifest.files[name],[createHash('sha256').update(bytes).digest('hex').slice(0,16),bytes.length]);
  }
  for(const name of ['flags','audio','view'])assert.ok(manifest.shell.includes(`minigames/hoops-polish-${name}.mjs`));
});
