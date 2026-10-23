import * as T from '../vendor/three.module.js';

/** Bounded presentation cues driven only by the live state and event id. */
export function createUltraSoccerEffects(scene,config,track){
  const nodes=[],color=new T.Color(),dummy=new T.Object3D();
  const ringGeometry=track(new T.RingGeometry(.36,.41,32));
  for(let i=0;i<3;i++){
    const material=track(new T.MeshBasicMaterial({color:'#dfe9d5',transparent:true,opacity:0,side:T.DoubleSide,depthWrite:false}));
    const mesh=new T.Mesh(ringGeometry,material);mesh.rotation.x=-Math.PI/2;mesh.visible=false;scene.add(mesh);nodes.push({mesh,age:1,life:.4});
  }
  // A tapered, height-correct ribbon makes a fast airborne ball legible without
  // the old row of opaque ghost balls. Its length is capped to 140 ms of flight.
  const positions=new Float32Array(8*6*3),colors=new Float32Array(8*6*3),geometry=track(new T.BufferGeometry());
  geometry.setAttribute('position',new T.BufferAttribute(positions,3));geometry.setAttribute('color',new T.BufferAttribute(colors,3));
  const material=track(new T.MeshBasicMaterial({color:'#e5eee0',vertexColors:true,transparent:true,opacity:.34,side:T.DoubleSide,depthWrite:false}));
  const ribbon=new T.Mesh(geometry,material);ribbon.frustumCulled=false;ribbon.visible=false;scene.add(ribbon);
  const footGeometry=track(new T.PlaneGeometry(.14,.045)),scuffs=new T.InstancedMesh(footGeometry,track(new T.MeshBasicMaterial({color:'#b7b788',transparent:true,opacity:.4,depthWrite:false,side:T.DoubleSide})),32);scuffs.frustumCulled=false;scene.add(scuffs);
  let lastEvent=-1,cursor=0,previousBall=null,visibleCues=0;
  function cue(x,z,scale=1,tint='#e8e5c7'){
    const item=nodes[cursor++%nodes.length];item.age=0;item.mesh.position.set(x,.045,z);item.scale=scale;item.mesh.material.color.set(tint);item.mesh.visible=true;
  }
  return {update(s,dt,quality){
    const b=s.ball,speed=Math.hypot(b.vx,b.vz),event=s.event;
    if(s.eventId!==lastEvent){lastEvent=s.eventId;
      if(['shot','pass','header','save','post','steal'].includes(event?.type)){const p=s.players[event.player??b.lastPlayer];cue(p?.x??b.x,p?.z??b.z,event.type==='shot'?1.2:.8,event.type==='save'?'#b3e0df':'#e7dfbd');}
    }
    if(previousBall&&previousBall.y>config.physics.ballRadius+.16&&b.y<=config.physics.ballRadius+.035&&b.owner===null)cue(b.x,b.z,.7);
    previousBall={y:b.y};visibleCues=0;
    for(const item of nodes){item.age+=dt;item.mesh.visible=item.age<item.life;if(item.mesh.visible){const u=item.age/item.life;item.mesh.scale.setScalar(item.scale*(.5+u*1.4));item.mesh.material.opacity=(1-u)*.25;visibleCues++;}}
    ribbon.visible=quality<2&&b.owner===null&&speed>12;
    if(ribbon.visible){
      const ux=-b.vz/(speed||1),uz=b.vx/(speed||1);let at=0;
      for(let i=0;i<8;i++){
        const point=k=>{const t=k*.018,w=.07*(1-k/8);return {x:b.x-b.vx*t,y:Math.max(.05,b.y-b.vy*t-.5*config.physics.gravity*t*t),z:b.z-b.vz*t,w};};
        const a=point(i),v=point(i+1);
        for(const [p,side]of [[a,-1],[a,1],[v,-1],[v,-1],[a,1],[v,1]]){positions.set([p.x+ux*p.w*side,p.y,p.z+uz*p.w*side],at);const fade=Math.max(.05,1-i/8);color.setRGB(fade,fade,fade);colors.set([color.r,color.g,color.b],at);at+=3;}
      }
      geometry.attributes.position.needsUpdate=geometry.attributes.color.needsUpdate=true;
    }
    let count=0;
    for(const p of s.players){const running=Math.hypot(p.vx,p.vz)>3.8||p.slideTime>0;if(!running)continue;for(let k=0;k<3;k++){
      const u=((s.elapsed*4+p.id*.21+k/3)%1),spread=p.slideTime>0?.25:.13;
      dummy.position.set(p.x-p.fx*u*.65+Math.sin(k*5)*spread,.028,p.z-p.fz*u*.65+Math.cos(k*5)*spread);dummy.rotation.set(-Math.PI/2,0,Math.atan2(p.fx,p.fz));dummy.scale.setScalar(1-u);dummy.updateMatrix();scuffs.setMatrixAt(count++,dummy.matrix);
    }}scuffs.count=quality<2?count:0;scuffs.instanceMatrix.needsUpdate=true;
  },metrics:()=>({impactCues:visibleCues,flightRibbon:ribbon.visible,scuffs:scuffs.count})};
}
