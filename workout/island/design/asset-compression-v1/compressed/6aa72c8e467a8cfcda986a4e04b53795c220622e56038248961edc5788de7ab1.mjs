/** Pure sea/camera math, shared by WebGL, Canvas and aiming. No render clock. */
export function navalWorldPoint(x,z,balance,y=0){
 const r=balance.render;return {x:z*r.enemySpacing/balance.combat.laneSpacing,y,z:-(x-balance.shipX)*r.worldScale};
}
const mix=(a,b,t)=>a+(b-a)*t;
export function navalCameraPose(ship,aim,aiming,balance,previous,dt=0,framing){
 if(framing?.battle)return aimBlend(ship,aim,aiming,balance,previous,dt,framing);
 const c=balance.render.follow,desired=ship.heading||0;
 const ease=previous?1-Math.exp(-c.ease*Math.max(0,dt)):1;
 const heading=previous?previous.heading+Math.atan2(Math.sin(desired-previous.heading),Math.cos(desired-previous.heading))*ease:desired;
 const zoom=mix(previous?.zoom??Number(aiming),Number(aiming),ease),distance=mix(c.distance,c.aimDistance,zoom),height=mix(c.height,c.aimHeight,zoom);
 const p=navalWorldPoint(ship.x,ship.z,balance),a=navalWorldPoint(aim.x,aim.z,balance);
 const ahead=(a.x-p.x)*Math.sin(heading)-(a.z-p.z)*Math.cos(heading),weight=ahead>c.aimForwardMin?zoom*c.aimFocus:0;
 const focus={x:mix(p.x+Math.sin(heading)*c.lookAhead,a.x,weight),y:c.lookHeight,z:mix(p.z-Math.cos(heading)*c.lookAhead,a.z,weight)};
 return {heading,zoom,fov:mix(c.fov,c.aimFov,zoom),position:{x:p.x-Math.sin(heading)*distance,y:height,z:p.z+Math.cos(heading)*distance},focus};
}

/** Aiming moves behind the turret along the real firing direction and leans
 * toward the predicted landing. The battle framing returns when it ends. */
function aimBlend(ship,aim,aiming,balance,previous,dt,framing){
 // Timed transition: in over enterSeconds, out over exitSeconds, smoothstep eased.
 const ctl=balance.aimControls||{},ac=balance.aimCamera,seconds=Math.max(0,Number.isFinite(dt)?dt:0);
 let progress=previous?(previous.progress??previous.zoom??0):Number(aiming);
 progress=aiming?Math.min(1,progress+seconds/Math.max(.01,ctl.enterSeconds??.22)):Math.max(0,progress-seconds/Math.max(.01,ctl.exitSeconds??.3));
 const zoom=progress*progress*(3-2*progress),base=battleCamera(ship,aim,false,balance,previous?.base??previous,dt,framing);
 if(!ac||zoom<1e-3||!Number.isFinite(framing.aimYaw))return {...base,zoom,progress,base};
 const p=navalWorldPoint(ship.x,ship.z,balance),ahead=navalWorldPoint(ship.x+Math.cos(framing.aimYaw)*10,(ship.z||0)+Math.sin(framing.aimYaw)*10,balance),dx=ahead.x-p.x,dz=ahead.z-p.z,len=Math.hypot(dx,dz)||1,d={x:dx/len,z:dz/len};
 const target=framing.landing||aim,l=navalWorldPoint(target.x,target.z,balance),reach=Math.max(8,Math.min(70,(l.x-p.x)*d.x+(l.z-p.z)*d.z));
 const along={x:p.x+d.x*reach,z:p.z+d.z*reach},look={x:mix(p.x+d.x*10,along.x,ac.focusMix),z:mix(p.z+d.z*10,along.z,ac.focusMix)};
 const side=(ac.side||0)*(framing.aimSide===-1?-1:1),rx=-d.z,rz=d.x;
 const shot={heading:Math.atan2(d.x,-d.z),fov:ac.fov,position:{x:p.x-d.x*ac.distance+rx*side,y:ac.height,z:p.z-d.z*ac.distance+rz*side},focus:{x:look.x+rx*side*.35,y:ac.lookHeight,z:look.z+rz*side*.35}};
 const heading=base.heading+Math.atan2(Math.sin(shot.heading-base.heading),Math.cos(shot.heading-base.heading))*zoom,mv=(a,b)=>({x:mix(a.x,b.x,zoom),y:mix(a.y,b.y,zoom),z:mix(a.z,b.z,zoom)});
 return {heading,zoom,progress,fov:mix(base.fov,shot.fov,zoom),position:mv(base.position,shot.position),focus:mv(base.focus,shot.focus),frameDistance:base.frameDistance,frameHeight:base.frameHeight,base};
}
/** A battle camera keeps both hulls on the water while the player steers. The
 * fleet, rather than the turret or ship's turn, establishes the viewing axis.
 * Aiming changes the lens only slightly, so holding fire never hides the boat. */
function battleCamera(ship,aim,aiming,balance,previous,dt,{enemies=[],width=844,height=390}){
 const c=balance.render.follow,p=navalWorldPoint(ship.x,ship.z,balance);
 const fleet=enemies.filter(e=>e.active&&e.hp>0&&Number.isFinite(e.x)&&Number.isFinite(e.z));
 const targets=fleet.length?fleet:[aim],center=targets.reduce((a,e)=>({x:a.x+e.x/targets.length,z:a.z+e.z/targets.length}),{x:0,z:0});
 const bearing=Math.atan2(center.z-ship.z,center.x-ship.x),lastHeading=previous?.heading??bearing,delta=Math.atan2(Math.sin(bearing-lastHeading),Math.cos(bearing-lastHeading));
 const seconds=Math.max(0,Number.isFinite(dt)?dt:0),ease=previous?1-Math.exp(-c.ease*seconds):1;
 const heading=lastHeading+Math.max(-seconds*.85,Math.min(seconds*.85,delta*ease));
 const zoom=mix(previous?.zoom??Number(aiming),Number(aiming),ease),fov=c.fov-zoom*Math.min(3,c.fov-c.aimFov);
 const lookAhead=Math.min(c.lookAhead,22),focus={x:p.x+Math.sin(heading)*lookAhead,y:c.lookHeight,z:p.z-Math.cos(heading)*lookAhead};
 const baseDistance=c.distance,baseHeight=Math.max(c.height,12);
 let distance=baseDistance,altitude=baseHeight;
 const pose=()=>({heading,zoom,fov,position:{x:p.x-Math.sin(heading)*distance,y:altitude,z:p.z+Math.cos(heading)*distance},focus,frameDistance:distance,frameHeight:altitude});
 const subjects=[{...ship,player:true},...fleet],points=[];
 for(const e of subjects){const q=navalWorldPoint(e.x,e.z,balance),scale=e.player?1:e.hullScale||1,length=(e.player?5.7:4.1)*scale,beam=(e.player?1.8:1.5)*scale,angle=e.heading||0;
  const hullPoint=(along,across,y)=>({x:q.x+Math.sin(angle)*along+Math.cos(angle)*across,y,z:q.z-Math.cos(angle)*along+Math.sin(angle)*across});
  // Hulls are long and narrow. A square containing the whole boat plus mast
  // exaggerated the nearest corners and forced a distant overhead camera.
  for(let n=0;n<8;n++){const a=n*Math.PI/4;points.push(hullPoint(Math.cos(a)*length,Math.sin(a)*beam,0));points.push(hullPoint(Math.cos(a)*length,Math.sin(a)*beam,1.2*scale));}
  for(const along of [-length*.35,length*.35])for(const across of [-beam*.65,beam*.65])points.push(hullPoint(along,across,(e.player?4.6:3.8)*scale));
  points.push(hullPoint(0,0,(e.player?5.2:4.2)*scale));
 }
 const w=Math.max(1,width),h=Math.max(1,height);
 const fits=scale=>{distance=baseDistance*scale;altitude=baseHeight*scale;const camera=pose();return points.every(point=>{const q=projectNavalPoint(point,camera,w,h);return q.depth>1&&q.x>w*.10&&q.x<w*.90&&q.y>h*.18&&q.y<h*.88;});};
 let low=1,high=1;
 while(!fits(high)&&high<8)high*=1.35;
 if(high>1)for(let n=0;n<9;n++){const mid=(low+high)/2;if(fits(mid))high=mid;else low=mid;}
 // Fit the intended pose before smoothing. Otherwise every static frame tries
 // to squeeze back to the unfitted base and causes repeated zoom pulses.
 const fitted=high*1.015,wantedDistance=baseDistance*fitted,wantedHeight=baseHeight*fitted;
 distance=Math.max(wantedDistance,mix(previous?.frameDistance??wantedDistance,wantedDistance,ease));
 altitude=Math.max(wantedHeight,mix(previous?.frameHeight??wantedHeight,wantedHeight,ease));
 return pose();
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
