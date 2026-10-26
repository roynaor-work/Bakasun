import {fireIndicators,drawFireIndicators} from './fire-navigation.mjs?v=island-alpine-20261026-1';
export function drawWaterDrop(p,x,y,size=12){p.save();p.translate(x,y);p.scale(size/12,size/12);p.fillStyle='#087cf0';p.strokeStyle='#e6f8ff';p.lineWidth=2;p.beginPath();p.moveTo(0,-16);p.bezierCurveTo(-3,-9,-10,-2,-10,4);p.bezierCurveTo(-10,17,10,17,10,4);p.bezierCurveTo(10,-2,3,-9,0,-16);p.fill();p.stroke();p.restore();}
/** Simple GPU-free city. It uses the same streets, targets, crew and hose state. */
function transform(m,ctx){const b=ctx.balance,c=ctx.config,scale=c.width/b.city.extent,focus=m.camera||m.truck;return {scale,x:c.width/2-focus.x*scale,y:c.height/2-focus.z*scale};}
function projectWorld(w,m,ctx){const a=transform(m,ctx);return {x:a.x+w.x*a.scale,y:a.y+w.z*a.scale};}
function project(x,y,m,ctx){const r=ctx.balance.render;return projectWorld({x:(x-r.logicalCenter[0])*r.worldScale,z:(y-r.logicalCenter[1])*r.worldScale},m,ctx);}
export function drawFireArrow(p,m,ctx,projectTarget,truckScreen){drawFireIndicators(p,fireIndicators(m,ctx,projectTarget,truckScreen));}

/** Logical aim and world navigation coordinates travel together on every tap. */
export function fireObjectives(m,ctx){
  const b=ctx.balance,r=b.render,items=[];
  m.flames.forEach((f,index)=>{if(f.active&&(f.heat>0||f.warning>0)&&r.sites[index])items.push({kind:'fire',index,x:f.x,y:f.y,world:r.sites[index]});});
  m.rescues.forEach((rescue,index)=>{if(!rescue.rescued&&!rescue.expired)items.push({kind:'rescue',index,x:rescue.x,y:rescue.y,world:rescue.world});});
  b.city.hydrants.forEach((world,index)=>items.push({kind:'hydrant',index,x:r.logicalCenter[0]+world[0]/r.worldScale,y:r.logicalCenter[1]+world[2]/r.worldScale,world}));
  return items;
}
export function pickFireObjective(x,y,m,ctx,projectWorld,projectTarget,truckScreen){
  const items=fireObjectives(m,ctx);let nearest=null,best=1;
  for(const item of items){
    const height=item.kind==='hydrant'?ctx.balance.hydrant.height+1.2:item.kind==='rescue'?2:1.2;
    const p=projectWorld([item.world[0],item.world[1]+height,item.world[2]]),radius=item.kind==='hydrant'?38:44;
    if(!p)continue;const distance=Math.hypot(p.x-x,p.y-y)/radius;if(distance<best){best=distance;nearest=item;}
  }
  for(const marker of fireIndicators(m,ctx,projectTarget,truckScreen)){
    const distance=Math.hypot(marker.x-x,marker.y-y)/(marker.size+12);if(distance>=best)continue;
    // The low-water edge marker names the nearest hydrant, which need not be 0.
    const item=items.find(item=>item.kind===marker.kind&&(marker.kind==='hydrant'?item.world[0]===marker.world[0]&&item.world[2]===marker.world[2]:item.index===marker.index));if(item){nearest=item;best=distance;}
  }
  return nearest?{...nearest,world:[...nearest.world]}:null;
}
function objectiveScreen(item,projectWorld,height=0){return projectWorld([item.world[0],item.world[1]+height,item.world[2]]);}
function targetBrackets(p,x,y,color){
  p.strokeStyle=color;p.lineWidth=1.7;p.beginPath();for(const side of [-1,1]){p.moveTo(x+side*15,y-9);p.lineTo(x+side*20,y-9);p.lineTo(x+side*20,y+9);p.lineTo(x+side*15,y+9);}p.stroke();
}
/** Small scene cues explain selection, parking range and actual cooling. */
export function drawFireFeedback(p,m,ctx,projectWorld,projectTarget,truckScreen){
  const b=ctx.balance,r=b.render,guide=m.guidance||{},navigation=m.navigation||{},items=fireObjectives(m,ctx),index=guide.targetIndex??navigation.targetIndex??navigation.index;
  const kind=guide.kind==='drive'?navigation.kind:guide.kind,selection=m.selectedObjective||{kind,index};
  const selected=items.find(item=>item.kind===selection.kind&&item.index===selection.index);
  const cooling=m.spraying&&Number.isInteger(m.coolingTarget)&&m.coolingPower>0;
  p.save();
  for(const item of items){
    if(item.kind!=='fire')continue;const f=m.flames[item.index];if(f.warning>0||f.heat<=0)continue;
    const q=objectiveScreen(item,projectWorld,1.8),active=cooling&&m.coolingTarget===item.index;
    if(!q||q.x<-40||q.x>ctx.config.width+40||q.y<0||q.y>ctx.config.height)continue;
    const width=r.barWidth+4,height=Math.max(4,r.barHeight),heat=Math.max(0,Math.min(1,f.heat));
    p.fillStyle='#10212cbd';p.fillRect(q.x-width/2-2,q.y-2,width+4,height+4);p.fillStyle=active?'#9de2ec':heat>.65?'#e7aa76':'#ead4a0';p.fillRect(q.x-width/2,q.y,width*heat,height);
    if(active){p.strokeStyle='#c7f4f6';p.lineWidth=1;p.beginPath();p.arc(q.x+width/2+6,q.y+height/2,3,0,Math.PI*2);p.stroke();}
  }
  if(navigation.active&&Number.isFinite(navigation.target?.x)&&Number.isFinite(navigation.target?.z)){
    const q=projectWorld([navigation.target.x,.2,navigation.target.z]),origin=truckScreen();
    if(q&&origin){p.strokeStyle='#badde1aa';p.lineWidth=1.25;p.setLineDash([4,7]);p.beginPath();p.moveTo(origin.x,origin.y+8);
      for(const step of navigation.path||[])if(Number.isFinite(step.x)&&Number.isFinite(step.z)){const point=projectWorld([step.x,.2,step.z]);if(point)p.lineTo(point.x,point.y);}
      p.lineTo(q.x,q.y);p.stroke();p.setLineDash([]);p.strokeStyle='#b8e3e6';p.lineWidth=1.8;p.beginPath();if(p.ellipse)p.ellipse(q.x,q.y,13,6,0,0,Math.PI*2);else p.arc(q.x,q.y,9,0,Math.PI*2);p.stroke();p.fillStyle='#d9f1ed';p.fillRect(q.x-2,q.y-2,4,4);
    }
  }
  if(selected){
    const q=objectiveScreen(selected,projectWorld,selected.kind==='hydrant'?b.hydrant.height+1.2:selected.kind==='rescue'?2:0);
    const inRange=selected.kind==='fire'?Math.hypot(m.nozzle.x-selected.x,m.nozzle.y-selected.y)<=m.range:selected.kind==='rescue'?Math.hypot(m.truck.x-selected.world[0],m.truck.z-selected.world[2])<=b.rescue.truckRadius:m.atHydrant;
    if(q)targetBrackets(p,q.x,q.y,inRange?'#a9e4e7':'#e1b27f');
  }
  const target=m.ladder.target;
  if(m.rescuing&&target&&target.progress>0){
    const q=projectWorld([target.world[0],target.world[1]+2,target.world[2]]),progress=Math.max(0,Math.min(1,target.progress/target.seconds));
    if(q){p.strokeStyle='#b9e1c4';p.lineWidth=3;p.beginPath();p.arc(q.x,q.y,18,-Math.PI/2,-Math.PI/2+Math.PI*2*progress);p.stroke();}
  }
  if(m.spraying||m.rescuing){
    const q=projectTarget(m.aim.x,m.aim.y);if(q){p.strokeStyle=m.rescuing?'#b9e1c4':cooling?'#c4f1f4':m.inRange?'#a5d4df':'#e1b27f';p.lineWidth=1.5;p.beginPath();p.arc(q.x,q.y,13,0,Math.PI*2);p.stroke();p.fillStyle=p.strokeStyle;p.fillRect(q.x-1.5,q.y-1.5,3,3);}
  }
  p.restore();
}

export function drawFireCity(p,m,ctx){
  const b=ctx.balance,c=ctx.config,a=transform(m,ctx),colors=b.city.colors,s=a.scale;
  p.fillStyle=colors.grass;p.fillRect(0,0,c.width,c.height);p.save();p.translate(a.x,a.y);p.scale(s,s);
  p.fillStyle=colors.sidewalk;for(const x of b.city.roadsX)p.fillRect(x-b.city.roadWidth/2-b.city.sidewalkWidth,-b.city.extent/2,b.city.roadWidth+b.city.sidewalkWidth*2,b.city.extent);for(const z of b.city.roadsZ)p.fillRect(-b.city.extent/2,z-b.city.roadWidth/2-b.city.sidewalkWidth,b.city.extent,b.city.roadWidth+b.city.sidewalkWidth*2);
  p.fillStyle=colors.road;for(const x of b.city.roadsX)p.fillRect(x-b.city.roadWidth/2,-b.city.extent/2,b.city.roadWidth,b.city.extent);for(const z of b.city.roadsZ)p.fillRect(-b.city.extent/2,z-b.city.roadWidth/2,b.city.extent,b.city.roadWidth);
  p.strokeStyle=colors.line;p.lineWidth=.12;p.setLineDash([b.city.dashLength,b.city.dashGap]);for(const x of b.city.roadsX){p.beginPath();p.moveTo(x,-b.city.extent/2);p.lineTo(x,b.city.extent/2);p.stroke();}for(const z of b.city.roadsZ){p.beginPath();p.moveTo(-b.city.extent/2,z);p.lineTo(b.city.extent/2,z);p.stroke();}p.setLineDash([]);
  for(const [i,lot]of b.city.buildings.entries()){p.fillStyle='#29494c35';p.fillRect(lot.x-lot.width/2+.5,lot.z-lot.depth/2+.7,lot.width,lot.depth);p.fillStyle=['#e0b47b','#e5ccad','#8fbdba'][i%3];p.fillRect(lot.x-lot.width/2,lot.z-lot.depth/2,lot.width,lot.depth);p.fillStyle=colors.roof;p.fillRect(lot.x-lot.width/2+.3,lot.z-lot.depth/2+.3,lot.width-.6,lot.depth-.6);p.fillStyle='#476575';for(const dx of [-1.3,0,1.3])p.fillRect(lot.x+dx-.35,lot.z+lot.depth/2-.35,.7,.3);}
  for(const hp of b.city.hydrants){p.strokeStyle='#168fff';p.lineWidth=.17;p.beginPath();p.arc(hp[0],hp[2],b.hydrant.radius,0,Math.PI*2);p.stroke();p.fillStyle='#ed4033';p.fillRect(hp[0]-.35,hp[2]-.8,.7,1.6);p.fillRect(hp[0]-.75,hp[2]-.25,1.5,.4);p.beginPath();p.arc(hp[0],hp[2]-.65,.4,0,Math.PI*2);p.fill();}
  if(m.atHydrant){const hp=[...b.city.hydrants].sort((a,c)=>Math.hypot(a[0]-m.truck.x,a[2]-m.truck.z)-Math.hypot(c[0]-m.truck.x,c[2]-m.truck.z))[0];p.strokeStyle=b.hydrant.hoseColor;p.lineWidth=.2;p.beginPath();p.moveTo(hp[0],hp[2]);p.quadraticCurveTo(hp[0]+1,hp[2]+1,m.truck.x,m.truck.z);p.stroke();}

  for(const f of m.flames)if(f.active&&f.heat>0){const w=b.render.sites[m.flames.indexOf(f)],size=.65+f.heat*.8;p.fillStyle=f.warning?'#ffe7ab':'#f67b42';p.beginPath();p.arc(w[0],w[2],size,0,Math.PI*2);p.fill();p.fillStyle='#ffe6a1';p.beginPath();p.arc(w[0],w[2],size*.5,0,Math.PI*2);p.fill();}
  p.save();p.translate(m.truck.x,m.truck.z);p.rotate(m.truck.yaw);p.fillStyle='#172d3a55';p.fillRect(-1.3,-2.5,2.7,5.4);p.fillStyle='#c9483e';p.fillRect(-1.1,-2.65,2.2,5.3);p.fillStyle='#c2e9e2';p.fillRect(-.9,-2.2,1.8,1);p.fillStyle='#f4d9aa';p.fillRect(-.8,-.7,1.6,2.6);p.strokeStyle='#e5f5ff';p.lineWidth=.13;for(const x of [-.45,.45]){p.beginPath();p.moveTo(x,-.6);p.lineTo(x,2.1);p.stroke();}for(let y=-.5;y<2.1;y+=.35){p.beginPath();p.moveTo(-.45,y);p.lineTo(.45,y);p.stroke();}p.fillStyle=Math.sin(m.time*7)>0?'#bcecff':'#ff776b';p.fillRect(-.7,-1,.55,.3);p.fillRect(.2,-1,.55,.3);p.restore();
  if(m.hose.connected){p.strokeStyle=b.crew.hoseColor;p.lineWidth=.16;p.beginPath();p.moveTo(m.truck.x,m.truck.z);p.quadraticCurveTo(m.truck.x+.7,m.truck.z+1,m.firefighter.x,m.firefighter.z);p.stroke();p.fillStyle='#172c39';p.fillRect(m.firefighter.x-.25,m.firefighter.z-.25,.5,.7);p.fillStyle='#ffd96e';p.beginPath();p.arc(m.firefighter.x,m.firefighter.z,.3,0,Math.PI*2);p.fill();}
  for(const r of m.rescues){if(r.expired)continue;const pending=!r.rescued||r.descent<1;if(pending){p.fillStyle='#ffe7b8';p.beginPath();p.arc(r.world[0],r.world[2],.3,0,Math.PI*2);p.fill();}if(r.progress>0&&pending){p.strokeStyle='#fff2c9';p.lineWidth=.35;p.beginPath();p.moveTo(m.truck.x,m.truck.z);p.lineTo(r.world[0],r.world[2]);p.stroke();}}
  if(m.ladder.extension>0&&m.ladder.target){const r=m.ladder.target,x=m.truck.x+(r.world[0]-m.truck.x)*m.ladder.extension+m.ladder.sway*2,z=m.truck.z+(r.world[2]-m.truck.z)*m.ladder.extension,dx=x-m.truck.x,dz=z-m.truck.z,len=Math.hypot(dx,dz)||1,nx=-dz/len*.35,nz=dx/len*.35;p.strokeStyle='#eff8ff';p.lineWidth=.12;for(const side of [-1,1]){p.beginPath();p.moveTo(m.truck.x+nx*side,m.truck.z+nz*side);p.lineTo(x+nx*side,z+nz*side);p.stroke();}for(let t=0;t<=1;t+=.08){p.beginPath();p.moveTo(m.truck.x+dx*t-nx,m.truck.z+dz*t-nz);p.lineTo(m.truck.x+dx*t+nx,m.truck.z+dz*t+nz);p.stroke();}}
  if(m.spraying){const r=b.render,x=(m.impact.x-r.logicalCenter[0])*r.worldScale,z=(m.impact.y-r.logicalCenter[1])*r.worldScale;p.strokeStyle=b.render.water;p.lineWidth=.18;p.beginPath();p.moveTo(m.firefighter.x,m.firefighter.z);p.lineTo(x,z);p.stroke();}
  p.restore();for(const hp of b.city.hydrants){const q=projectWorld({x:hp[0],z:hp[2]},m,ctx);drawWaterDrop(p,q.x,q.y-28-Math.sin(m.time*3)*3,10);}drawFireArrow(p,m,ctx,(x,y)=>project(x,y,m,ctx),()=>projectWorld(m.truck,m,ctx));drawFireFeedback(p,m,ctx,w=>{const q=projectWorld({x:w[0],z:w[2]},m,ctx);q.y-=w[1]*2;return q;},(x,y)=>project(x,y,m,ctx),()=>projectWorld(m.truck,m,ctx));
}
drawFireCity.project=project;drawFireCity.projectWorld=projectWorld;
drawFireCity.targetAt=(x,y,m,ctx)=>{const a=transform(m,ctx),r=ctx.balance.render;return {x:(x-a.x)/a.scale/r.worldScale+r.logicalCenter[0],y:(y-a.y)/a.scale/r.worldScale+r.logicalCenter[1]};};
drawFireCity.pickObjectiveAt=(x,y,m,ctx)=>pickFireObjective(x,y,m,ctx,w=>{const q=projectWorld({x:w[0],z:w[2]},m,ctx);q.y-=w[1]*2;return q;},(x,y)=>project(x,y,m,ctx),()=>projectWorld(m.truck,m,ctx));
