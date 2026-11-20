/** Basketball v24.1 referee (Codex hoops-ref-scoreboard-v1, CC0 clips and clothing on the repository's MakeHuman referee; runtime copy
 * assets/hoops-v241/referee/referee.glb): one official on the far sideline, the one the broadcast camera sees, who trails the ball along the
 * line and makes the call the whistle sounds: the whistle gesture on a steal or an intercepted pass (v24.1's short whistle), the foul signal
 * on a foul, the direction on a violation, both arms up on a made three. The pack's six clips scored 92.4-100 on motion-qa-v1 (its report);
 * the run is played in place at the speed the referee moves (1.6 m/s at rate 1 on the 1.66 m model, x his scale).
 * The model's twenty primitives become two skinned meshes on the one skeleton (textured with the atlas, plain colours): two draw calls,
 * 1,225 triangles. Presentation only: the simulation never reads it. `?hoopsReferee=0` = no referee (v24); the scoreboard of the pack is not
 * connected (the v8 hall already has the engine-fed hanging board; the pack's board is 112 meshes with English labels baked in).
 * Pure parts (`refereeGesture`, `stepReferee`) run in node tests. */
import {mergeGeometries} from '../vendor/BufferGeometryUtils.js';
import {hoopsRefereeEnabled} from './hoops-v241.mjs?v=island-v2-20261107-20';
export {hoopsRefereeEnabled};

const phoneFixAEnabled=()=>{try{const p=new URLSearchParams(globalThis.location?.search||'');return p.get('phoneFixes')!=='0'&&p.get('phoneFixA')!=='0';}catch{return true;}};
export const refereeUrl=()=>new URL('../assets/hoops-v241/referee/referee.glb',import.meta.url).href;
export const REFEREE=Object.freeze({height:1.85,modelHeight:1.655,runSpeed:1.6,maxSpeed:6.2,accel:9,line:.9,lead:.85,deadZone:.7,
  clips:Object.freeze(['idle','run','whistle','foul','three_points','direction'])});

/** The gesture an engine event earns, null for none. Pure. */
export function refereeGesture(e){
  switch(e?.type){
    case 'steal':case 'interception':return phoneFixAEnabled()?null:'whistle';
    case 'foul':return 'foul';
    case 'violation':return 'direction';
    case 'score':return e.points===3?'three_points':null;
    default:return null;
  }
}
/** One step of the referee on the far sideline: trails the ball's x (`lead` of it) inside the court length, a dead zone so he does not
 * shuffle, acceleration-limited. `st` = {x, vx}; returns it. Pure. */
export function stepReferee(st,{ballX=0,hx=14.3,dt=1/60,gesture=false}={}){
  const R=REFEREE,lim=hx-1.2,target=Math.max(-lim,Math.min(lim,ballX*R.lead)),dx=target-st.x;
  const want=gesture?0:Math.abs(dx)<R.deadZone?0:Math.sign(dx)*Math.min(R.maxSpeed,Math.abs(dx)*2.2);
  const dv=want-st.vx,step=R.accel*dt;st.vx+=Math.abs(dv)<=step?dv:Math.sign(dv)*step;
  st.x=Math.max(-lim,Math.min(lim,st.x+st.vx*dt));return st;
}

/** Twenty primitives -> two skinned meshes (with / without the atlas), vertex colour = the material colour; same skeleton and bind. */
export function mergeRefereeMeshes(T,scene){
  const skinned=[];scene.traverse(o=>{if(o.isSkinnedMesh)skinned.push(o);});
  if(!skinned.length)throw Error('Referee: no skinned mesh');
  const groups={tex:[],plain:[]};for(const m of skinned)(m.material.map?groups.tex:groups.plain).push(m);
  const out=[];
  for(const [kind,list] of Object.entries(groups)){
    if(!list.length)continue;
    const parts=list.map(m=>{
      const src=m.geometry,g=new T.BufferGeometry();
      for(const n of ['position','normal','uv','skinIndex','skinWeight']){
        if(n==='uv'&&kind==='plain')continue;const a=src.attributes[n];if(!a)throw Error('Referee: primitive without '+n);
        const f=new Float32Array(a.count*a.itemSize);for(let i=0;i<a.count;i++)for(let k=0;k<a.itemSize;k++)f[i*a.itemSize+k]=k===0?a.getX(i):k===1?a.getY(i):k===2?a.getZ(i):a.getW(i);
        g.setAttribute(n,new T.BufferAttribute(f,a.itemSize));
      }
      g.setIndex(new T.BufferAttribute(Uint32Array.from(src.index?src.index.array:[...Array(src.attributes.position.count).keys()]),1));
      const c=m.material.color||new T.Color(1,1,1),n=g.attributes.position.count,col=new Float32Array(n*3);for(let i=0;i<n;i++){col[i*3]=c.r;col[i*3+1]=c.g;col[i*3+2]=c.b;}
      g.setAttribute('color',new T.BufferAttribute(col,3));return g;
    });
    const merged=mergeGeometries(parts,false);for(const g of parts)g.dispose();if(!merged)throw Error('Referee: primitives do not merge');
    const map=list[0].material.map||null,material=new T.MeshStandardMaterial({name:'referee-'+kind,map,vertexColors:true,roughness:kind==='tex'?.72:.5,metalness:0,alphaTest:map?.5:0});
    const mesh=new T.SkinnedMesh(merged,material);mesh.name='referee-'+kind;mesh.frustumCulled=false;mesh.castShadow=true;mesh.receiveShadow=false;
    mesh.bind(skinned[0].skeleton,skinned[0].bindMatrix);skinned[0].parent.add(mesh);out.push(mesh);
  }
  for(const m of skinned){m.removeFromParent();m.geometry.dispose();if(!out.some(o=>o.material.map===m.material.map))m.material.map?.dispose();m.material.dispose();}
  return out;
}

/** The referee in `scene` (loaded with the game's GLB loader `load(url)`). Returns a controller; throws on a file without the six clips. */
export async function createHoopsReferee({T,load,court,url=refereeUrl()}){
  const data=await load(url),root=data.scene;root.name='hoops-referee';
  const clips=Object.fromEntries((data.animations||[]).map(c=>[c.name,c]));
  for(const name of REFEREE.clips)if(!clips[name])throw Error('Referee clip missing: '+name);
  const meshes=mergeRefereeMeshes(T,root),scale=REFEREE.height/REFEREE.modelHeight;root.scale.setScalar(scale);
  // a soft contact shadow (the players have the view's instanced blobs)
  const shadow=new T.Mesh(new T.CircleGeometry(.42,24).rotateX(-Math.PI/2),new T.MeshBasicMaterial({color:0x000000,transparent:true,opacity:.28,depthWrite:false}));shadow.renderOrder=-1;shadow.name='referee-shadow';
  const group=new T.Group();group.name='hoops-referee-root';group.add(root,shadow);
  const mixer=new T.AnimationMixer(root),actions={};
  for(const name of REFEREE.clips){const a=mixer.clipAction(clips[name]);a.setLoop(name==='idle'||name==='run'?T.LoopRepeat:T.LoopOnce,Infinity);a.clampWhenFinished=true;a.enabled=true;a.setEffectiveWeight(0);a.play();actions[name]=a;}
  const st={x:0,vx:0,yaw:Math.PI,gesture:null,gestureT:0,weights:{idle:1}},metrics={gestures:{},status:'ready',triangles:meshes.reduce((n,m)=>n+m.geometry.index.count/3,0),draws:meshes.length};
  const z=court.hz+REFEREE.line;group.position.set(0,0,z);
  let disposed=false;
  return {group,metrics,
    get x(){return st.x;},get gesture(){return st.gesture;},
    /** A call: the gesture of the event (refereeGesture), from its start; a new call replaces the one in progress. */
    event(e){const g=refereeGesture(e);if(!g||disposed)return null;st.gesture=g;st.gestureT=0;actions[g].reset().play();metrics.gestures[g]=(metrics.gestures[g]||0)+1;return g;},
    /** One frame: `ball` world position, `visible` false hides him (replays). */
    update(dt,{ball,visible=true}={}){
      if(disposed)return;group.visible=visible;if(!visible||!(dt>0))return;dt=Math.min(.05,dt);
      if(st.gesture){st.gestureT+=dt;if(st.gestureT>=clips[st.gesture].duration)st.gesture=null;}
      stepReferee(st,{ballX:ball?.x||0,hx:court.hx,dt,gesture:!!st.gesture});
      const speed=Math.abs(st.vx);
      // faces the ball, or the way he runs along the line (the run clip is a forward run)
      const want=speed>.6&&!st.gesture?(st.vx>0?Math.PI/2:-Math.PI/2):Math.atan2((ball?.x||0)-st.x,(ball?.z||0)-z);
      let d=((want-st.yaw+Math.PI*3)%(Math.PI*2))-Math.PI;st.yaw+=d*(1-Math.exp(-dt*8));
      const target=st.gesture||(speed>.4?'run':'idle'),k=1-Math.exp(-dt/.12);
      for(const name of REFEREE.clips){const w=(st.weights[name]||0)+((name===target?1:0)-(st.weights[name]||0))*k;st.weights[name]=w<.003&&name!==target?0:w;actions[name].setEffectiveWeight(st.weights[name]);}
      actions.run.timeScale=Math.max(.6,Math.min(1.9,speed/(REFEREE.runSpeed*scale)));
      mixer.update(dt);root.position.set(0,0,0);root.rotation.y=st.yaw;group.position.x=st.x;
    },
    dispose(){if(disposed)return;disposed=true;mixer.stopAllAction();mixer.uncacheRoot(root);group.removeFromParent();for(const m of meshes){m.geometry.dispose();m.material.map?.dispose();m.material.dispose();}shadow.geometry.dispose();shadow.material.dispose();root.traverse(o=>o.skeleton?.dispose?.());metrics.status='disposed';}};
}
