// Readable players (28/11/2026): the child's player big enough to read on a phone (844x390) and outlined, with the player on the ball.
// Football's full match camera comes closer; basketball's broadcast lens already keeps its players above 60 px, and this file holds it there.
// `?readablePlayers=0` gives back the previous look; without a page (node) everything is off so earlier contracts test the earlier look.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {READABLE,readablePlayersEnabled,applyReadablePlayersSoccer,hoopsBroadcastPixels,readableOutlinePlan,createPlayerOutlines,OUTLINE_VERTEX} from '../workout/island/minigames/readable-players.mjs';
import {expandSoccerConfig} from '../workout/island/minigames/soccer-squad.mjs';
import {applySoccerFull,soccerFullCamera} from '../workout/island/minigames/soccer-full.mjs';
import {applySoccerPitchV23,applySoccerControlV23} from '../workout/island/minigames/soccer-v23.mjs';
import {applySoccerV249View} from '../workout/island/minigames/soccer-r249.mjs';
import {applySoccerV250View,SOCCER_V250} from '../workout/island/minigames/soccer-r250.mjs';
import {createSoccer} from '../workout/island/minigames/soccer.mjs';

const text=p=>readFileSync(new URL('../workout/island/'+p,import.meta.url),'utf8');
const config=JSON.parse(text('data/config.json')).minigames;
const withLocation=(search,fn)=>{const had=Object.getOwnPropertyDescriptor(globalThis,'location');try{globalThis.location={search};return fn();}finally{if(had)Object.defineProperty(globalThis,'location',had);else delete globalThis.location;}};
const full=()=>applySoccerV250View(applySoccerV249View(applySoccerControlV23(applySoccerPitchV23(expandSoccerConfig(applySoccerFull(config.soccer,{v241:true}))),'v23'),{enabled:true,look:false}),{enabled:true,saveReplay:false});

test('switch: on a page, off with ?readablePlayers=0, off in node',()=>{
  assert.equal(readablePlayersEnabled(),false,'node: the earlier look');
  withLocation('',()=>assert.equal(readablePlayersEnabled(),true));
  withLocation('?readablePlayers=0',()=>assert.equal(readablePlayersEnabled(),false));
  withLocation('?readablePlayers=1&soccerV250=0',()=>assert.equal(readablePlayersEnabled(),true));
  assert.equal(readablePlayersEnabled('?readablePlayers=0'),false);assert.equal(readablePlayersEnabled(''),true);
});

test('football: the full match camera is closer, nothing else moves, off = the same object',()=>{
  const cfg=full(),next=applyReadablePlayersSoccer(cfg,{enabled:true}),C=READABLE.soccer.camera,was=cfg.full.camera,now=next.full.camera;
  assert.equal(applyReadablePlayersSoccer(cfg,{enabled:false}),cfg);assert.equal(applyReadablePlayersSoccer(cfg),cfg,'node: unchanged');
  assert.equal(applyReadablePlayersSoccer(next,{enabled:true}),next,'idempotent');
  assert.equal(was.base,SOCCER_V250.camera.base,'the source config is not touched');
  assert.equal(now.base,C.base);assert.equal(now.near,C.near);assert.equal(now.speedZoom,C.speedZoom);assert.equal(now.portraitBase,C.portraitBase);
  assert.equal(next.view.camera.nearDistance,C.base);assert.equal(next.view.camera.portraitNearDistance,C.portraitBase);
  for(const key of Object.keys(was))if(!['base','near','speedZoom','portraitBase'].includes(key))assert.deepEqual(now[key],was[key],key+' is unchanged');
  assert.equal(now.far,was.far,'a long ball still gets the wide frame');
  // moderate: between 10% and 20% closer, so the frame still holds a ground pass
  const ratio=now.base/was.base;assert.ok(ratio>.8&&ratio<.9,'ratio '+ratio);
  const small={...cfg,full:undefined};assert.equal(applyReadablePlayersSoccer(small,{enabled:true}),small,'the small match keeps its camera');
});

test('football: a run with the ball is framed about a fifth closer and the frame is still wider than a ground pass',()=>{
  const run=cfg=>{const g=createSoccer({config:cfg,seed:5,stage:3,difficulty:'normal',role:'field',airVersion:'v23',v241:true,v249:true}),s=g.getState(),me=s.players[s.controlled];
    Object.assign(me,{x:4,z:2,vx:0,vz:0});Object.assign(s.ball,{x:4.4,z:2,y:.11,vx:6,vz:0,vy:0,owner:me.id,flight:null});
    let cam=null;for(let i=0;i<240;i++)cam=soccerFullCamera(s,844/390,cfg,cam,1/60);return cam;};
  const cfg=full(),before=run(cfg),after=run(applyReadablePlayersSoccer(cfg,{enabled:true}));
  const gain=before.distance/after.distance;assert.ok(gain>1.14&&gain<1.25,'players '+gain.toFixed(3)+' times taller');
  // 40.5 px measured in the browser at the earlier distance: the same moment now reaches the target
  assert.ok(40.5*gain>=READABLE.soccer.targetPixels-1,'pixels '+(40.5*gain).toFixed(1));
  const fov=cfg.view.camera.fovDegrees*Math.PI/180,width=2*after.distance*Math.tan(fov/2)*844/390;
  assert.ok(width>SOCCER_V250.tap.groundRange,'frame width at the ball '+width.toFixed(1)+' m');
});

test('basketball: the broadcast lens keeps the players above 60 px on a 390 px high screen, wherever the ball is',()=>{
  const view=config.streetSlam.view,court={hz:config.streetSlam.court.width/2},H=READABLE.hoops;
  assert.equal(view.mode,'broadcast');assert.ok(court.hz>7&&court.hz<8);let low=Infinity;
  for(let followZ=-court.hz;followZ<=court.hz;followZ+=1.5)for(let z=-court.hz;z<=court.hz;z+=1.5){
    const px=hoopsBroadcastPixels(view,court,{z,followZ,height:H.playerHeight,viewportHeight:H.viewportHeight});
    if(Math.abs(z-followZ)<=3)assert.ok(px>=H.minPixels,`handler depth ${followZ}, player depth ${z}: ${px.toFixed(1)} px`);
    low=Math.min(low,px);
  }
  assert.ok(low>40,'the worst case, a player on the far sideline while the ball is on the near one: '+low.toFixed(1));
  // the browser measured 81..85 px for the child's player (tools/readable-players-measure.mjs)
  const mid=hoopsBroadcastPixels(view,court,{z:0});assert.ok(mid>75&&mid<100,'centre court '+mid.toFixed(1));
});

test('outline plan: the child\'s player, and the ball holder when he is someone else; nothing in a replay or when off',()=>{
  assert.deepEqual(readableOutlinePlan({controlled:3,holder:3}),[{id:3,kind:'selected'}]);
  assert.deepEqual(readableOutlinePlan({controlled:3,holder:9}),[{id:3,kind:'selected'},{id:9,kind:'holder'}]);
  assert.deepEqual(readableOutlinePlan({controlled:0,holder:null}),[{id:0,kind:'selected'}],'player 0 counts');
  assert.deepEqual(readableOutlinePlan({controlled:undefined,holder:0}),[{id:0,kind:'holder'}]);
  assert.deepEqual(readableOutlinePlan({controlled:3,holder:9,replay:true}),[]);assert.deepEqual(readableOutlinePlan({controlled:3,holder:9,enabled:false}),[]);
});

test('outlines: one companion per solid mesh on the same skeleton, following visibility, hidden when the plan drops the player',async()=>{
  const T=await import('../workout/island/vendor/three.module.js');
  const root=new T.Group(),geo=new T.BoxGeometry(1,1,1),bone=new T.Bone(),skeleton=new T.Skeleton([bone]);root.add(bone);
  const n=geo.attributes.position.count;
  geo.setAttribute('skinIndex',new T.Uint16BufferAttribute(new Array(n*4).fill(0),4));geo.setAttribute('skinWeight',new T.Float32BufferAttribute(new Array(n*4).fill(0).map((_,i)=>i%4?0:1),4));
  const body=new T.SkinnedMesh(geo,new T.MeshBasicMaterial());body.bind(skeleton);root.add(body);
  const lod=new T.SkinnedMesh(geo,body.material);lod.bind(skeleton,body.bindMatrix);lod.visible=false;root.add(lod);
  const hair=new T.Mesh(new T.SphereGeometry(.2),body.material);bone.add(hair);
  const shadow=new T.Mesh(new T.PlaneGeometry(1,1),new T.MeshBasicMaterial({transparent:true,depthWrite:false}));root.add(shadow);
  const o=createPlayerOutlines(T),before=root.children.length;
  o.resize(844,390);o.update([{id:7,kind:'selected',root}]);
  const made=[];root.traverse(x=>{if(x.userData.readableOutline)made.push(x);});
  assert.equal(made.length,3,'body, its hidden LOD copy and the hair; not the transparent shadow');assert.equal(root.children.length,before+2);
  assert.equal(o.count,2,'the hidden LOD copy draws nothing');
  const bodyLine=made.find(x=>x.isSkinnedMesh&&x.visible);assert.equal(bodyLine.skeleton,skeleton);assert.equal(bodyLine.geometry,geo);assert.equal(bodyLine.material.side,T.BackSide);assert.equal(bodyLine.castShadow,false);
  assert.equal(bodyLine.material.color.getHex(),READABLE.outline.selected);
  body.visible=false;lod.visible=true;o.update([{id:7,kind:'holder',root}]);assert.equal(o.count,2);assert.equal(made.find(x=>x.visible).material.color.getHex(),READABLE.outline.holder);
  o.update([{id:7,kind:'holder',root}]);let again=0;root.traverse(x=>{if(x.userData.readableOutline)again++;});assert.equal(again,3,'made once');
  o.update([]);assert.equal(o.count,0);assert.ok(made.every(x=>!x.visible));
  o.update([{id:7,kind:'selected',root},{id:8,kind:'holder',root:null}]);assert.equal(o.count,2);
  o.dispose();let left=0;root.traverse(x=>{if(x.userData.readableOutline)left++;});assert.equal(left,0);
  // the line is a fixed number of pixels: pushed out after projection, scaled by w
  assert.match(OUTLINE_VERTEX,/gl_Position\.xy \+= rpN\.xy \* uReadablePx \* gl_Position\.w/);assert.ok(READABLE.outline.pixels>=1&&READABLE.outline.pixels<=2);
});

test('wiring: both views and the football session use the switch, no words are added to the screen',()=>{
  const soccerView=text('minigames/soccer-view.mjs'),hoopsView=text('minigames/hoops-view.mjs'),session=text('minigames/soccer-session.mjs');
  for(const src of [soccerView,hoopsView]){assert.match(src,/readablePlayersEnabled\(\)\?createPlayerOutlines\(/);assert.match(src,/outlines\?\.resize\(/);assert.match(src,/outlines\?\.dispose\(\)/);assert.match(src,/readableOutlinePlan\(\{controlled:/);}
  assert.match(session,/applyReadablePlayersSoccer\(applySoccerV250View\(/);assert.match(session,/ctx\.drill\?\{enabled:false\}:\{\}\),hud249=/,'drills keep their camera');
  assert.doesNotMatch(text('minigames/readable-players.mjs'),/textContent|innerHTML|createElement/);
});
