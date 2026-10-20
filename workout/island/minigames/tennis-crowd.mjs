// Seat coordinates are shared by the renderer and the simulation's regression tests.
export function tennisSeats(config){
 const e=config.render.environment,seats=[];
 for(let side=0;side<4;side++)for(let row=0;row<e.crowdRows;row++)for(let column=0;column<e.crowdColumns;column++){
  const along=(column-(e.crowdColumns-1)/2)*e.crowdSpacing;
  const x=side<2?(side===0?-1:1)*(e.crowdSideX+row*e.crowdRowGap):along;
  const z=side<2?along:(side===2?-1:1)*(e.crowdEndZ+row*e.crowdEndRowGap);
  seats.push({side,row,column,x,y:e.crowdFloor+row*e.crowdRise,z,facing:side<2?(side===0?Math.PI/2:-Math.PI/2):(side===2?0:Math.PI)});
 }
 return seats;
}
const lerp=(a,b,t)=>a+(b-a)*t;
// Repose the complete mesh; every source triangle and UV is retained. The arms
// follow shoulder/elbow/wrist segments and the legs bend at the hip and knee.
export function seatedVertex(x,y,z,variant=0,clap=0,type=0){
 const sourceY=y,sign=Math.sign(x),ax=Math.abs(x),hip=.86,knee=.43;
 if(y<hip){if(y>knee){z+=(hip-y);y=.48+(y-knee)*.10;}else{z+=hip-knee;y+=.05;}}
 else y-=.34;
 if(ax>.20&&sourceY>.65){
  const u=Math.min(1,(ax-.23)/(type===1?.34:.48)),upper=Math.min(1,u*2),lower=Math.max(0,u*2-1);
  const rest=variant===1?[sign*.12,1.04,.32]:variant===2&&sign>0?[.15,1.28,.25]:[sign*.20,.88,.43];
  const elbow=[sign*.32,.94,.16],wrist=[lerp(rest[0],sign*.055,clap),lerp(rest[1],1.22,clap),lerp(rest[2],.43,clap)];
  const a=lower>0?elbow:[sign*.23,1.04,0],b=lower>0?wrist:elbow,t=lower>0?lower:upper;
  const thickness=sourceY-(type===1?1.48-1.1*ax:1.50-.85*ax);
  const smooth=(a,b,v)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
  const armFloor=1.05-.8*Math.max(0,ax-.23),weight=smooth(.20,.29,ax)*smooth(armFloor-.08,armFloor-.02,sourceY);
  x=lerp(x,lerp(a[0],b[0],t),weight);y=lerp(y,lerp(a[1],b[1],t)+thickness*.65,weight);z+=lerp(a[2],b[2],t)*weight;
 }
 const lean=[-.06,.05,.015][variant];z+=(sourceY>hip?(sourceY-hip)*lean:0);x+=sourceY>1.55?(sourceY-1.55)*(variant-1)*.1:0;
 return [x,y,z];
}
