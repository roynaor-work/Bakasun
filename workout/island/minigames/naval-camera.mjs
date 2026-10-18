/** Pure sea/camera math, shared by WebGL, Canvas and aiming. No render clock. */
export function navalWorldPoint(x,z,balance,y=0){
 const r=balance.render;return {x:z*r.enemySpacing/balance.combat.laneSpacing,y,z:-(x-balance.shipX)*r.worldScale};
}
const mix=(a,b,t)=>a+(b-a)*t;
export function navalCameraPose(ship,aim,aiming,balance,previous,dt=0){
 const c=balance.render.follow,desired=ship.heading||0;
 const ease=previous?1-Math.exp(-c.ease*Math.max(0,dt)):1;
 const heading=previous?previous.heading+Math.atan2(Math.sin(desired-previous.heading),Math.cos(desired-previous.heading))*ease:desired;
 const zoom=mix(previous?.zoom??Number(aiming),Number(aiming),ease),distance=mix(c.distance,c.aimDistance,zoom),height=mix(c.height,c.aimHeight,zoom);
 const p=navalWorldPoint(ship.x,ship.z,balance),a=navalWorldPoint(aim.x,aim.z,balance);
 const ahead=(a.x-p.x)*Math.sin(heading)-(a.z-p.z)*Math.cos(heading),weight=ahead>c.aimForwardMin?zoom*c.aimFocus:0;
 const focus={x:mix(p.x+Math.sin(heading)*c.lookAhead,a.x,weight),y:c.lookHeight,z:mix(p.z-Math.cos(heading)*c.lookAhead,a.z,weight)};
 return {heading,zoom,fov:mix(c.fov,c.aimFov,zoom),position:{x:p.x-Math.sin(heading)*distance,y:height,z:p.z+Math.cos(heading)*distance},focus};
}
function basis(camera){
 const p=camera.position,f=camera.focus,dx=f.x-p.x,dy=f.y-p.y,dz=f.z-p.z,len=Math.hypot(dx,dy,dz),flat=Math.hypot(dx,dz);
 const forward={x:dx/len,y:dy/len,z:dz/len},right={x:-dz/flat,y:0,z:dx/flat};
 return {forward,right,up:{x:-right.z*forward.y,y:right.z*forward.x-right.x*forward.z,z:right.x*forward.y}};
}
export function projectNavalPoint(point,camera,width,height){
 const b=basis(camera),d={x:point.x-camera.position.x,y:point.y-camera.position.y,z:point.z-camera.position.z},dot=v=>d.x*v.x+d.y*v.y+d.z*v.z,depth=dot(b.forward),scale=height/(2*Math.tan(camera.fov*Math.PI/360));
 return {x:width/2+dot(b.right)*scale/depth,y:height/2-dot(b.up)*scale/depth,depth};
}
export function navalWaterAt(x,y,camera,width,height,balance){
 const b=basis(camera),scale=height/(2*Math.tan(camera.fov*Math.PI/360)),u=(x-width/2)/scale,v=(height/2-y)/scale;
 const ray={x:b.forward.x+b.right.x*u+b.up.x*v,y:b.forward.y+b.up.y*v,z:b.forward.z+b.right.z*u+b.up.z*v};
 if(ray.y>=0)return null;const t=-camera.position.y/ray.y,r=balance.render;
 return {x:balance.shipX-(camera.position.z+ray.z*t)/r.worldScale,z:(camera.position.x+ray.x*t)/r.enemySpacing*balance.combat.laneSpacing};
}

export function navalProjectileHeight(ammo,progress,time,balance){
 const fx=balance.render.effects;
 if(ammo===2)return fx.torpedoHeight+Math.sin(time*balance.render.waveSpeed)*balance.aim.torpedoBob*balance.render.worldScale;
 return (1-progress)*fx.muzzleY*balance.render.playerScale+Math.sin(progress*Math.PI)*balance.targeting.arcHeight*balance.render.worldScale*fx.projectileHeightScale;
}
