import {DynamicDrawUsage,Euler,Matrix3,Matrix4,Vector3} from '../vendor/three.module.js';

const clamp = (value,min,max) => Math.min(max,Math.max(min,value));
const smooth = x => x*x*(3-2*x);

/** Remember the rim's vertex range even when it shares a draw call with the stand. */
export function markHoopsRim(mesh,side,first=0,count=mesh.geometry.attributes.position.count) {
  (mesh.userData.hoopsRims ??= []).push({side,first,count});
}

function recordAttribute(attribute,first,count) {
  const rest = new Float32Array(count*3);
  for(let i=0;i<count;i++) {
    const index=first+i;
    rest[i*3]=attribute.getX(index);
    rest[i*3+1]=attribute.getY(index);
    rest[i*3+2]=attribute.getZ(index);
  }
  (attribute.isInterleavedBufferAttribute?attribute.data:attribute).setUsage(DynamicDrawUsage);
  return {attribute,rest,first,count};
}

function upload({attribute,first,count}) {
  if(attribute.isInterleavedBufferAttribute) {
    attribute.data.addUpdateRange(first*attribute.data.stride,count*attribute.data.stride);
  } else {
    attribute.addUpdateRange(first*3,count*3);
  }
  attribute.needsUpdate=true;
}

function visible(mesh) {
  for(let node=mesh;node;node=node.parent)if(!node.visible)return false;
  return true;
}

function pulse(age,hz,decay,span) {
  if(age<0||age>=span)return 0;
  return Math.sin(age*2*Math.PI*hz)*Math.exp(-age*decay)*smooth(clamp((span-age)/.14,0,1));
}

/** Use simulation ticks for the elastic response, including during slow-motion replay. */
export function createHoopsBasketMotion(arena,nets,court,{rim,net},reducedMotion) {
  const sides=new Map([1,-1].map(side=>[side,{
    pivot:new Vector3(side*(court.rimX+court.rimR),court.rimY,0),
    deflection:new Matrix4(),rimParts:[],nets:[],pitch:0,twist:0,pull:0,flare:0,swayX:0,swayZ:0,
  }]));
  const impulses=[],rot=new Euler(),shift=new Vector3(),point=new Vector3(),local=new Matrix4(),normalMatrix=new Matrix3();
  arena.updateMatrixWorld(true);
  if(rim)arena.traverse(mesh=>{
    for(const {side,first,count} of mesh.userData.hoopsRims||[]) {
      const pos=recordAttribute(mesh.geometry.attributes.position,first,count);
      const normal=mesh.geometry.attributes.normal;
      const world=mesh.matrixWorld.clone();
      sides.get(side).rimParts.push({mesh,pos,normal:normal?recordAttribute(normal,first,count):null,world,inverse:world.clone().invert(),moved:false});
    }
  });
  for(const {mesh,side} of nets) {
    const parent=mesh.parent.matrixWorld.clone(),worldToNet=mesh.matrixWorld.clone().invert();
    const origin=new Vector3().applyMatrix4(worldToNet);
    const center=new Vector3(side*court.rimX,court.rimY,0).applyMatrix4(worldToNet);
    const xAxis=new Vector3(1,0,0).applyMatrix4(worldToNet).sub(origin);
    const zAxis=new Vector3(0,0,1).applyMatrix4(worldToNet).sub(origin);
    const localY=new Vector3(0,1,0).applyMatrix4(worldToNet).sub(origin).y;
    const attribute=mesh.geometry.attributes.position;
    const pos=net?recordAttribute(attribute,0,attribute.count):null;
    let weights=null;
    if(pos) {
      // v8 stores court-space vertices; the older hoops store them under the rim.
      // In either case, derive the pinned lip from the highest authored knot.
      let top=-Infinity;
      for(let i=0;i<pos.count;i++)top=Math.max(top,pos.rest[i*3+1]);
      weights=new Float32Array(pos.count);
      for(let i=0;i<pos.count;i++)weights[i]=smooth(clamp(((top-pos.rest[i*3+1])/localY-.028)/.36,0,1));
    }
    sides.get(side).nets.push({mesh,parent,inverse:parent.clone().invert(),restMatrix:mesh.matrix.clone(),
      center,xAxis,zAxis,localY,pos,weights,moved:false,flexed:false});
  }

  function effects(events,snapshot) {
    for(const event of events) {
      const isRim=event.type==='contact'&&event.what==='rim';
      const isScore=event.type==='score'&&!event.goaltend;
      if(!isRim&&!isScore)continue;
      const side=event.side??(isScore?snapshot?.dir?.[event.team]:Math.sign(event.x));
      const tick=event.tick??snapshot?.tick;
      if(!sides.has(side)||!Number.isFinite(tick))continue;
      const power=(reducedMotion?.27:1)*(isRim?clamp(event.speed/5,.15,1):event.shotType==='dunk'?1:.73);
      const vertical=clamp(event.ny??1,-1,1),z=clamp((event.z??0)/court.rimR,-1,1);
      const x=clamp(((event.x??side*court.rimX)-side*court.rimX)/court.rimR,-1,1);
      impulses.push({tick,side,
        pitch:(isRim?side*Math.sign(vertical||1)*(.035+.055*Math.abs(vertical)):event.shotType==='dunk'?side*.072:0)*power,
        twist:isRim?z*.052*power:0,
        pull:(isRim?.035:.101)*power,flare:(isRim?.14:.31)*power,
        swayX:(isRim?-x*.062:-side*.028)*power,swayZ:-z*.071*power});
      // The engine records up to 12 seconds of replay. Keep the impacts for that window and bound the list in busy play.
      if(impulses.length>128)impulses.shift();
    }
  }

  function update(tick) {
    for(const state of sides.values())state.pitch=state.twist=state.pull=state.flare=state.swayX=state.swayZ=0;
    for(let i=impulses.length-1;i>=0;i--) {
      const impulse=impulses[i],age=(tick-impulse.tick)/60;
      if(age>=1.25)break;
      if(age<0)continue;
      const state=sides.get(impulse.side);
      const ring=pulse(age,6.5,7,.86),pull=pulse(age,3.2,4.8,1.17),sway=pulse(age,3.8,4.2,1.25);
      state.pitch+=impulse.pitch*ring;state.twist+=impulse.twist*ring;
      state.pull+=impulse.pull*pull;state.flare+=impulse.flare*pull;
      state.swayX+=impulse.swayX*sway;state.swayZ+=impulse.swayZ*sway;
    }
    for(const state of sides.values()) {
      const {pivot,deflection}=state;
      const turning=rim&&(state.pitch!==0||state.twist!==0);
      if(turning) {
        deflection.makeRotationFromEuler(rot.set(clamp(state.twist,-.05,.05),0,clamp(state.pitch,-.095,.095)));
        shift.copy(pivot).sub(point.copy(pivot).applyMatrix4(deflection));
        deflection.setPosition(shift);
      }
      for(const part of state.rimParts) {
        if((!turning&&!part.moved)||!visible(part.mesh))continue;
        if(turning) {
          local.multiplyMatrices(part.inverse,deflection).multiply(part.world);
          normalMatrix.getNormalMatrix(local);
        }
        for(const data of [part.pos,part.normal]) {
          if(!data)continue;
          const {attribute,rest,first,count}=data;
          for(let i=0;i<count;i++) {
            point.fromArray(rest,i*3);
            if(turning) {
              if(data===part.pos)point.applyMatrix4(local);
              else point.applyMatrix3(normalMatrix);
            }
            attribute.setXYZ(first+i,point.x,point.y,point.z);
          }
          upload(data);
        }
        part.moved=turning;
      }
      const swayX=clamp(state.swayX,-.09,.09),swayZ=clamp(state.swayZ,-.09,.09);
      const pull=clamp(state.pull,-.10,.10),flare=clamp(state.flare,-.27,.27);
      const flexing=net&&(pull!==0||flare!==0||swayX!==0||swayZ!==0);
      for(const data of state.nets) {
        if(!visible(data.mesh))continue;
        if(turning||data.moved) {
          if(turning)local.multiplyMatrices(data.inverse,deflection).multiply(data.parent).multiply(data.restMatrix);
          else local.copy(data.restMatrix);
          local.decompose(data.mesh.position,data.mesh.quaternion,data.mesh.scale);
          data.mesh.updateMatrix();data.moved=turning;
        }
        if(!flexing&&!data.flexed)continue;
        const {attribute,rest,count}=data.pos;
        const dx=data.xAxis.x*swayX+data.zAxis.x*swayZ,dz=data.xAxis.z*swayX+data.zAxis.z*swayZ;
        for(let i=0;i<count;i++) {
          const j=i*3,x=rest[j],y=rest[j+1],z=rest[j+2];
          // Leave the top knots fixed. The basket lip moves the entire net separately.
          const weight=data.weights[i];
          attribute.setXYZ(i,x+((x-data.center.x)*flare+dx)*weight,y-pull*data.localY*weight,z+((z-data.center.z)*flare+dz)*weight);
        }
        upload(data.pos);data.flexed=flexing;
      }
    }
  }
  return {effects,update};
}

/** Shape the existing contact shadow using the same key direction as the arena. */
export function updateHoopsBallShadow(shadow,ball,court,key,floorY) {
  const {x,y,z}=ball.position,height=Math.max(0,y-court.ballR),projection=Math.min(3.6,height)/key.position.y;
  const sx=x-key.position.x*projection,sz=z-key.position.z*projection;
  const edge=Math.min(court.hx+1.25-Math.abs(sx),court.hz+1.25-Math.abs(sz));
  const spread=1+Math.min(height,4)*.35;
  shadow.position.set(sx,floorY,sz);
  shadow.scale.set(spread,spread*(.92+Math.min(height,.8)*.1),1);
  shadow.material.opacity=(.075+.50*Math.exp(-1.1*height))*smooth(clamp(edge/.55,0,1));
  shadow.visible=ball.visible&&edge>0;
}

export function createHoopsBallHandoff(radius) {
  const offset=new Vector3(),previous=new Vector3();
  let lastState,lastOwner,lastReplay,lastTick,span=0,elapsed=0;
  return (position,ball,tick,replay,dt)=>{
    const next=ball.state,held=next==='held';
    const continuous=lastState&&replay===lastReplay&&Math.abs(tick-lastTick)<=12&&
      next!=='dead'&&next!=='toss'&&lastState!=='dead'&&lastState!=='toss';
    if(!continuous)span=0;
    else if(held!==(lastState==='held')||(held&&ball.owner!==lastOwner)) {
      offset.copy(previous).sub(position);
      span=offset.lengthSq()<=.75**2?(held?.135:.105):0;
      elapsed=0;
    } else elapsed+=dt;
    if(elapsed<span) {
      position.addScaledVector(offset,1-smooth(elapsed/span));
      position.y=Math.max(radius,position.y);
    }
    previous.copy(position);lastState=next;lastOwner=ball.owner;lastReplay=replay;lastTick=tick;
  };
}
