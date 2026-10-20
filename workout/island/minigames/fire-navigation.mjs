const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
/** Preserve radial throttle while undoing the camera's ground foreshortening. */
export function fireScreenMovement(x,z,verticalScale=1){
  const length=Math.hypot(x,z),worldZ=z/verticalScale,normal=Math.hypot(x,worldZ)||1;
  return {moveX:x/normal*length,moveZ:worldZ/normal*length};
}
export function followFireCamera(camera,truck,balance,dt){
  const c=balance.city,v=balance.vehicle,speed=Math.hypot(truck.velocityX||0,truck.velocityZ||0),lead=c.cameraLead*Math.min(1,speed/v.speed),blend=1-Math.exp(-c.cameraFollow*dt);
  const x=truck.x+(speed?truck.velocityX/speed*lead:0),z=truck.z+(speed?truck.velocityZ/speed*lead:0);
  camera.x+=(x-camera.x)*blend;camera.z+=(z-camera.z)*blend;
}
/** Each live off-screen objective gets its own edge marker. Visibility is based
 * on its projected anchor, never on hose range or which objective is nearest. */
export function fireIndicators(model,ctx,projectTarget,truckScreen){
  const {width,height}=ctx.config,b=ctx.balance,origin=truckScreen(),targets=[];
  model.flames.forEach((f,index)=>{if(f.active&&(f.heat>0||f.warning>0))targets.push({kind:'fire',index,x:f.x,y:f.y,world:b.render.sites[index]});});
  model.rescues.forEach((r,index)=>{if(!r.rescued&&!r.expired)targets.push({kind:'rescue',index,x:r.x,y:r.y,world:r.world});});
  if(model.water/model.maxWater<=b.hydrant.lowWaterRatio&&!model.atHydrant){const hp=[...b.city.hydrants].sort((a,c)=>Math.hypot(a[0]-model.truck.x,a[2]-model.truck.z)-Math.hypot(c[0]-model.truck.x,c[2]-model.truck.z))[0];targets.push({kind:'hydrant',index:0,x:b.render.logicalCenter[0]+hp[0]/b.render.worldScale,y:b.render.logicalCenter[1]+hp[2]/b.render.worldScale,world:hp});}
  const inset=28,top=76,bottom=height-28,left=inset,right=width-inset,markers=[];
  for(const t of targets){
    const p=projectTarget(t.x,t.y);
    if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x>=0&&p.x<=width&&p.y>=0&&p.y<=height)continue;
    const dx=p.x-origin.x,dy=p.y-origin.y,angle=Math.atan2(dy,dx);
    const sx=clamp(origin.x,left,right),sy=clamp(origin.y,top,bottom);
    const u=Math.min(dx>0?(right-sx)/dx:dx<0?(left-sx)/dx:Infinity,dy>0?(bottom-sy)/dy:dy<0?(top-sy)/dy:Infinity);
    let x=sx+dx*u,y=sy+dy*u;
    // Keep the lower corners free for the stick and action buttons.
    if(y>height-180&&(x<180||x>width-180))y=height-180;
    const distance=Math.hypot(model.truck.x-t.world[0],model.truck.z-t.world[2]),near=clamp(1-distance/b.city.extent,0,1),size=17+near*6;
    markers.push({...t,x,y,angle,distance,size,color:t.kind==='hydrant'?'#8edcfa':t.kind==='rescue'?'#8df2d7':`hsl(${Math.round(18+near*26)} 96% ${Math.round(58+near*8)}%)`,targetScreen:{...p}});
  }
  // Separate objectives sharing an edge without dropping any of them.
  for(let pass=0;pass<markers.length;pass++)for(let i=0;i<markers.length;i++)for(let j=0;j<i;j++){
    const a=markers[i],b=markers[j];if(Math.hypot(a.x-b.x,a.y-b.y)>=a.size+b.size+6)continue;
    if(a.y===top||a.y===bottom){a.x=clamp(b.x+(a.size+b.size+8),left,right);if(a.x===right)b.x=clamp(b.x-a.size-b.size-8,left,right);}
    else{a.y=clamp(b.y+a.size+b.size+8,top,height-180);if(a.y===height-180)b.y=clamp(b.y-a.size-b.size-8,top,height-180);}
  }
  return markers;
}
export function drawFireIndicators(p,markers){
  for(const m of markers){
    p.save();p.translate(m.x,m.y);p.fillStyle='#173e4bf2';p.strokeStyle=m.color;p.lineWidth=2.5;
    p.beginPath();p.arc(0,0,m.size,0,Math.PI*2);p.fill();p.stroke();
    p.save();p.rotate(m.angle);p.fillStyle=m.color;p.beginPath();p.moveTo(m.size+9,0);p.lineTo(m.size-2,-7);p.lineTo(m.size-2,7);p.closePath();p.fill();p.restore();
    p.fillStyle=m.color;
    if(m.kind==='fire'){p.beginPath();p.moveTo(0,-12);p.bezierCurveTo(2,-5,11,-2,9,6);p.bezierCurveTo(5,15,-11,12,-9,2);p.bezierCurveTo(-8,-2,-4,-3,-4,-8);p.lineTo(-1,-3);p.closePath();p.fill();p.fillStyle='#fff3cc';p.beginPath();p.moveTo(0,-1);p.quadraticCurveTo(9,10,0,10);p.quadraticCurveTo(-7,9,0,-1);p.fill();}
    else if(m.kind==='hydrant'){p.beginPath();p.moveTo(0,-12);p.bezierCurveTo(-3,-6,-9,1,-8,6);p.bezierCurveTo(-6,15,8,13,8,5);p.bezierCurveTo(8,0,3,-6,0,-12);p.fill();}
    else{p.beginPath();p.arc(0,-6,4,0,Math.PI*2);p.fill();p.strokeStyle=m.color;p.lineWidth=3;p.beginPath();p.moveTo(0,0);p.lineTo(0,7);p.moveTo(-8,-3);p.lineTo(0,2);p.lineTo(8,-3);p.moveTo(-5,12);p.lineTo(0,7);p.lineTo(5,12);p.stroke();}
    p.restore();
  }
}
