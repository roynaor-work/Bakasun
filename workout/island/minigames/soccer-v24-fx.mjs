/** Soccer v24 effects (Codex soccer-fx-v1, CC0; runtime copy in assets/soccer-v24/fx/sprites). Presentation only, driven by the drained
 * match events (noteEvent) and the live state; no particle objects, no lights, a fixed pool per sheet:
 *  - landing-turf when a high ball lands, slide-turf on a slide, power-kick lines on a hard shot (camera-facing sprites);
 *  - goal-confetti over the scoring goal and goal-net-ripple on the back of its net (on the Codex goals of the pitch kit);
 *  - selected-player-ring (looping, on the grass) in place of the plain selector ring, click-ring on a player switch;
 *  - ball-trail: a textured ribbon behind a fast free ball in place of the plain ribbon (UV scrolling).
 * Sheets follow the pack's loading contract (sRGB, straight alpha, linear filtering, no mipmaps, clamp; repeat in U for the trail).
 * Calm (reduced motion or the economy tiers) keeps only the cues that carry information: the selection ring and the switch ring. */
import * as T from '../vendor/three.module.js';
import {SOCCER_FX_SPRITES,soccerFxFrame,soccerFxUv,soccerFxForEvent,soccerBallLanded,soccerV24Url} from './soccer-v24.mjs?v=island-v2-20261107-12';

const POOL={'landing-turf':3,'slide-turf':3,'goal-confetti':2,'goal-net-ripple':1,'click-ring':2,'power-kick':2};
const GROUND=new Set(['click-ring','selected-player-ring']);
const motionPreference=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');

export function createSoccerFxV1({scene,config,track=x=>x,fetchTexture=url=>new T.TextureLoader().loadAsync(url)}){
  const slots=[],pending=[],sheets=new Map(),hx=config.pitch.length/2,radius=config.physics.ballRadius;
  let status='loading',failure=null,disposed=false,ring=null,ringAge=0,trail=null,netPlanes=[],previousY=null,counts={},active=0;
  const ids=Object.keys(SOCCER_FX_SPRITES);
  function sheetTexture(id,texture){
    const spec=SOCCER_FX_SPRITES[id];
    texture.colorSpace=T.SRGBColorSpace;texture.premultiplyAlpha=false;texture.generateMipmaps=false;texture.minFilter=texture.magFilter=T.LinearFilter;
    texture.wrapS=spec.scrollU?T.RepeatWrapping:T.ClampToEdgeWrapping;texture.wrapT=T.ClampToEdgeWrapping;return track(texture);
  }
  function material(id,texture,extra={}){
    const spec=SOCCER_FX_SPRITES[id];
    return track(new T.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,toneMapped:false,fog:false,side:T.DoubleSide,blending:spec.additive?T.AdditiveBlending:T.NormalBlending,...extra}));
  }
  const ready=Promise.all(ids.map(id=>fetchTexture(soccerV24Url('fx/sprites/'+id+'.png')).then(texture=>[id,texture]))).then(list=>{
    if(disposed){for(const [,t]of list)t.dispose();return false;}
    for(const [id,texture]of list)sheets.set(id,sheetTexture(id,texture));
    // event sprites: camera-facing for dust, confetti and speed lines, ground planes for the rings; each slot owns a clone of its sheet's
    // texture (same image source, one upload) so slots animate independently
    for(const [id,count]of Object.entries(POOL)){
      if(id==='goal-net-ripple')continue;
      for(let i=0;i<count;i++){
        const texture=track(sheets.get(id).clone()),spec=SOCCER_FX_SPRITES[id];
        let node;
        if(GROUND.has(id)){node=new T.Mesh(track(new T.PlaneGeometry(1,1)),material(id,texture));node.rotation.x=-Math.PI/2;}
        else{node=new T.Sprite(track(new T.SpriteMaterial({map:texture,transparent:true,depthWrite:false,toneMapped:false,fog:false,blending:spec.additive?T.AdditiveBlending:T.NormalBlending})));node.center.set(spec.anchor[0],1-spec.anchor[1]);}
        node.name='soccer-v24-fx-'+id;node.visible=false;node.renderOrder=3;scene.add(node);slots.push({id,spec,node,texture,age:spec.seconds,size:spec.size});
      }
    }
    // the net ripple: one vertical plane over the back of each goal's net (shown on the scoring goal)
    for(const side of [-1,1]){
      const texture=track(sheets.get('goal-net-ripple').clone()),spec=SOCCER_FX_SPRITES['goal-net-ripple'];
      const plane=new T.Mesh(track(new T.PlaneGeometry(config.pitch.goalWidth,config.pitch.goalHeight)),material('goal-net-ripple',texture,{opacity:.85}));
      plane.position.set(side*(hx+config.pitch.goalDepth-.04),config.pitch.goalHeight/2,0);plane.rotation.y=side>0?-Math.PI/2:Math.PI/2;
      plane.name='soccer-v24-fx-net-ripple';plane.visible=false;plane.renderOrder=3;scene.add(plane);netPlanes.push({side,plane,texture,spec,age:9});
    }
    // the selection ring (looping, on the grass under the controlled player)
    {const texture=track(sheets.get('selected-player-ring').clone()),spec=SOCCER_FX_SPRITES['selected-player-ring'];
      const mesh=new T.Mesh(track(new T.PlaneGeometry(spec.size,spec.size)),material('selected-player-ring',texture));mesh.rotation.x=-Math.PI/2;mesh.name='soccer-v24-fx-selection';mesh.visible=false;mesh.renderOrder=2;scene.add(mesh);ring={mesh,texture,spec};}
    // the trail: a tapered ribbon (8 segments) with U along the flight, the sheet scrolling
    {const segments=8,positions=new Float32Array((segments+1)*2*3),uvs=new Float32Array((segments+1)*2*2),index=[];
      for(let i=0;i<=segments;i++){uvs.set([i/segments,0,i/segments,1],i*4);if(i<segments){const a=i*2;index.push(a,a+1,a+2,a+1,a+3,a+2);}}
      const geometry=track(new T.BufferGeometry());geometry.setAttribute('position',new T.BufferAttribute(positions,3));geometry.setAttribute('uv',new T.BufferAttribute(uvs,2));geometry.setIndex(index);
      const texture=sheets.get('ball-trail'),mesh=new T.Mesh(geometry,material('ball-trail',texture,{opacity:.85}));mesh.frustumCulled=false;mesh.visible=false;mesh.name='soccer-v24-fx-trail';mesh.renderOrder=2;scene.add(mesh);
      trail={mesh,positions,texture,segments};}
    status='ready';return true;
  }).catch(error=>{status='fallback';failure=String(error?.message||error);return false;});
  function emit(id,x,y,z,{size,rotation=0}={}){
    if(status!=='ready')return false;
    const list=slots.filter(s=>s.id===id);if(!list.length)return false;
    const slot=list.reduce((a,b)=>b.age>a.age?b:a);slot.age=0;slot.size=size??slot.spec.size;slot.node.position.set(x,y,z);slot.node.visible=true;
    if(slot.node.isSprite)slot.node.material.rotation=rotation;counts[id]=(counts[id]||0)+1;return true;
  }
  function frameUv(texture,spec,age){const uv=soccerFxUv(spec,soccerFxFrame(spec,age));texture.offset.set(...uv.offset);texture.repeat.set(...uv.repeat);}
  /** Screen-space angle of the ball's velocity, for the speed lines of a hard shot. */
  const screen=new T.Vector3(),ahead=new T.Vector3();
  function travelAngle(camera,b){if(!camera)return 0;screen.set(b.x,b.y,b.z).project(camera);ahead.set(b.x+(b.vx||0)*.1,b.y+(b.vy||0)*.1,b.z+(b.vz||0)*.1).project(camera);return Math.atan2(ahead.y-screen.y,(ahead.x-screen.x)*(camera.aspect||1));}
  return {
    ready,
    get status(){return status;},
    get ringActive(){return status==='ready'&&ring!==null;},
    /** Drained match events (soccer-session -> view.noteEvent), handled at the next update with the then-current positions. */
    noteEvent(event){if(event&&pending.length<32)pending.push(event);},
    update(s,dt,{quality=0,camera=null,markers=true,kitGoals=false,controlled=null,calm=false}={}){
      if(disposed||status!=='ready')return;
      const reduced=calm||motionPreference?.matches===true,economy=quality>=2;
      for(const event of pending.splice(0)){
        if(event.type==='goal'){
          if(reduced||economy)continue;
          const side=Math.sign(s.ball.x)||1;emit('goal-confetti',side*(hx-1.2),2.2,s.ball.z*.5);
          if(kitGoals){const n=netPlanes.find(p=>p.side===side);if(n){n.age=0;n.plane.visible=true;counts['goal-net-ripple']=(counts['goal-net-ripple']||0)+1;}}
          continue;
        }
        const id=soccerFxForEvent(event,s);if(!id||(reduced||economy)&&id!=='click-ring')continue;
        const p=s.players[event.player];
        if(id==='slide-turf'&&p)emit(id,p.x,.05,p.z);
        else if(id==='click-ring'&&p)emit(id,p.x,.06,p.z);
        else if(id==='power-kick')emit(id,s.ball.x,Math.max(.25,s.ball.y),s.ball.z,{rotation:travelAngle(camera,s.ball)});
      }
      // landing dust: a free ball back on the grass after a real flight
      if(!reduced&&!economy&&soccerBallLanded(previousY,s.ball,radius))emit('landing-turf',s.ball.x,.04,s.ball.z);
      previousY=s.ball.y;active=0;
      for(const slot of slots){
        slot.age+=Math.max(0,dt);const spec=slot.spec,alive=slot.age<spec.seconds;slot.node.visible=alive;if(!alive)continue;active++;
        frameUv(slot.texture,spec,slot.age);
        slot.node.scale.set(slot.size,slot.size,1);
      }
      for(const n of netPlanes){n.age+=Math.max(0,dt);const hold=1.1;n.plane.visible=kitGoals&&n.age<n.spec.seconds+hold;if(!n.plane.visible)continue;active++;
        frameUv(n.texture,n.spec,Math.min(n.age,n.spec.seconds-1e-3));n.plane.material.opacity=.85*(n.age<n.spec.seconds?1:Math.max(0,1-(n.age-n.spec.seconds)/hold));}
      // selection ring under the controlled player (markers off during the show's cuts, as the old selector)
      if(ring){ringAge+=Math.max(0,dt);const c=controlled||s.players[s.controlled];ring.mesh.visible=Boolean(markers&&c);if(ring.mesh.visible){ring.mesh.position.set(c.x,.05,c.z);const grow=1+Math.max(0,s.selectionTime||0)*.35;ring.mesh.scale.set(grow,grow,1);frameUv(ring.texture,ring.spec,reduced?0:ringAge);active++;}}
      // trail: a free ball faster than 12 m/s (the old ribbon's rule), at most 140 ms of flight, tapered, U scrolling
      if(trail){const b=s.ball,speed=Math.hypot(b.vx||0,b.vz||0),show=!economy&&!reduced&&(b.owner===null||b.owner===undefined)&&speed>12;trail.mesh.visible=show;
        if(show){const ux=-(b.vz||0)/speed,uz=(b.vx||0)/speed,g=config.physics.gravity??12;
          for(let i=0;i<=trail.segments;i++){const t=i*.0175,w=.075*(1-i/trail.segments)+.004,x=b.x-(b.vx||0)*t,y=Math.max(.05,b.y-(b.vy||0)*t-.5*g*t*t),z=b.z-(b.vz||0)*t;
            trail.positions.set([x+ux*w,y,z+uz*w,x-ux*w,y,z-uz*w],i*6);}
          trail.mesh.geometry.attributes.position.needsUpdate=true;trail.mesh.geometry.computeBoundingSphere();trail.texture.offset.x=(trail.texture.offset.x+SOCCER_FX_SPRITES['ball-trail'].scrollU*Math.max(0,dt))%1;active++;}}
    },
    metrics:()=>({status,failure,active,counts:{...counts},ring:Boolean(ring?.mesh.visible),trail:Boolean(trail?.mesh.visible)}),
    dispose(){if(disposed)return;disposed=true;for(const s of slots)s.node.removeFromParent();for(const n of netPlanes)n.plane.removeFromParent();ring?.mesh.removeFromParent();trail?.mesh.removeFromParent();slots.length=0;pending.length=0;}
  };
}
