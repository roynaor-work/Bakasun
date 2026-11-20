/** Playable room view for devices that cannot create the WebGL interior. */
export function createCanvasInteriorScene({model,canvas}){
  const paint=canvas.getContext('2d');
  if(!paint)throw new Error('Fire interior canvas unavailable');
  let width=1,height=1,dpr=1,scale=1;

  function resize(w,h,pixelRatio){
    width=w;height=h;dpr=pixelRatio;scale=Math.min(w/8.3,h/5.3);
    canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
  }
  function project([x,y,z]){
    return {x:width/2+x*scale,y:height*.72+(z*.29-y)*scale};
  }
  function pick(x,y){
    let target=null,distance=scale*.58;
    for(const spot of model.room.spots){
      if(spot.done)continue;
      const point=project([spot.pos[0],spot.pos[1]+.25,spot.pos[2]]);
      const d=Math.hypot(x-point.x,y-point.y);
      if(d<distance){target=spot;distance=d;}
    }
    return target?[...target.pos]:[(x-width/2)/scale,0,(y-height*.72)/(.29*scale)];
  }
  function stroke(a,b,color,width){
    paint.strokeStyle=color;paint.lineWidth=width;paint.beginPath();
    paint.moveTo(a.x,a.y);paint.lineTo(b.x,b.y);paint.stroke();
  }
  function render(){
    paint.setTransform(dpr,0,0,dpr,0,0);
    paint.fillStyle='#201b23';paint.fillRect(0,0,width,height);
    const a=project([-3.32,3.04,-2.42]),b=project([3.32,0,-2.42]);
    paint.fillStyle='#9e8578';paint.fillRect(a.x,a.y,b.x-a.x,b.y-a.y);
    const c=project([3.32,0,2.42]);
    paint.fillStyle='#715646';paint.fillRect(a.x,b.y,b.x-a.x,c.y-b.y);
    const room=model.room;
    if(!room)return;
    for(const spot of room.spots){
      const point=project([spot.pos[0],spot.pos[1]+.25,spot.pos[2]]);
      paint.fillStyle=spot.done?'#382c2a':{normal:'#f1ae5a',electric:'#b7d1ff',oil:'#f6d77a',heavy:'#ff8273'}[spot.kind];
      paint.beginPath();paint.arc(point.x,point.y,scale*.21,0,Math.PI*2);paint.fill();
      paint.font=scale*.3+'px sans-serif';paint.textAlign='center';paint.textBaseline='middle';
      paint.fillText(spot.done?'✓':{normal:'🔥',electric:'⚡',oil:'🍳',heavy:'🔥'}[spot.kind],point.x,point.y);
    }
    const friend=room.friend;
    if(friend.state!=='out'){
      const walking=friend.state==='walking'||friend.state==='team',mix=walking?friend.t:0;
      const point=project([friend.pos[0]+(friend.exit[0]-friend.pos[0])*mix,friend.height*.5,friend.pos[2]+(friend.exit[2]-friend.pos[2])*mix]);
      paint.font=scale*.48+'px sans-serif';paint.textAlign='center';paint.textBaseline='middle';
      paint.fillText({girl:'👧',cat:'🐱',dog:'🐶'}[friend.id],point.x,point.y);
    }
    if(model.spraying&&model.aim)stroke(project([-1.9,.75,2.42]),project(model.aim),model.tool==='water'?'#bfe9f7':'#f6f1dc',Math.max(2,scale*.06));
  }
  return {ready:true,loadFailed:false,resize,project,pick,render,update(){},dispose(){},metrics(){return {mode:'canvas',ready:true,width,height};}};
}
