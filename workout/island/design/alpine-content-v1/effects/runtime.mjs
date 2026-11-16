// CC0-1.0. Optional, bounded visual effects. Pass the host's own THREE instance.
// createAlpineEffects(THREE, {scene, particleTexture, trailTexture, seed})
// update(dt, {position, heading, moving, leftSki, rightSki}); metres, -Z downhill.
export function createAlpineEffects(T, {scene, particleTexture, trailTexture, seed = 316}) {
  const presets = [{rate:18, cap:24}, {rate:42, cap:48}, {rate:78, cap:96}];
  const capacity=96, segments=28, life=1.15;
  let preset=1, carry=0, alive=0, disposed=false;
  const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
  const particles=[], positions=new Float32Array(capacity*3);
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(positions,3).setUsage(T.DynamicDrawUsage));geometry.setDrawRange(0,0);
  const material=new T.PointsMaterial({map:particleTexture,color:0xf4f1df,size:.24,transparent:true,opacity:.78,depthWrite:false,sizeAttenuation:true});
  const points=new T.Points(geometry,material);points.frustumCulled=false;points.name='alpine-snow-spray';scene.add(points);
  const tracks=[[],[]], trailPositions=new Float32Array(2*segments*6*3),uvs=new Float32Array(2*segments*6*2);
  const trailGeometry=new T.BufferGeometry();trailGeometry.setAttribute('position',new T.BufferAttribute(trailPositions,3).setUsage(T.DynamicDrawUsage));trailGeometry.setAttribute('uv',new T.BufferAttribute(uvs,2).setUsage(T.DynamicDrawUsage));trailGeometry.setDrawRange(0,0);
  const trailMaterial=new T.MeshBasicMaterial({map:trailTexture,color:0xffffff,transparent:true,opacity:.65,depthWrite:false,side:T.DoubleSide});
  const trail=new T.Mesh(trailGeometry,trailMaterial);trail.frustumCulled=false;trail.name='alpine-twin-ski-trail';scene.add(trail);
  function spawn(position,heading) {
    if(particles.length>=presets[preset].cap)return;
    const lateral=(random()-.5)*1.8, back=.7+random()*1.8, s=Math.sin(heading),c=Math.cos(heading);
    particles.push({x:position.x+(random()-.5)*.5,y:position.y+.06,z:position.z,vx:lateral*c+back*s,vy:.6+random()*.8,vz:-lateral*s+back*c,age:0,life:.45+random()*.35});
  }
  function update(dt, state={}) {
    if(disposed)return;
    dt=Math.max(0,Math.min(Number.isFinite(dt)?dt:0,.05));
    const {position,heading=0,moving=false,leftSki,rightSki}=state;
    if(moving&&position){carry+=dt*presets[preset].rate;while(carry>=1){spawn(position,heading);carry--;}}else carry=0;
    alive=0;
    for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.age+=dt;if(p.age>=p.life){particles.splice(i,1);continue;}p.vy-=2.8*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;positions.set([p.x,Math.max(.015,p.y),p.z],alive++*3);}
    geometry.attributes.position.needsUpdate=true;geometry.setDrawRange(0,alive);
    [leftSki,rightSki].forEach((p,side)=>{
      const track=tracks[side];for(const item of track)item.age+=dt;
      while(track.length&&track[0].age>life)track.shift();
      if(moving&&p){const last=track.at(-1);if(last&&Math.hypot(p.x-last.x,p.y-last.y,p.z-last.z)>1.5)track.length=0;
        if(!track.length||Math.hypot(p.x-track.at(-1).x,p.z-track.at(-1).z)>.045){track.push({x:p.x,y:p.y+.014,z:p.z,age:0});if(track.length>segments+1)track.shift();}}
    });
    let count=0;
    for(const track of tracks)for(let i=1;i<track.length;i++){
      const a=track[i-1],b=track[i],d=Math.hypot(b.x-a.x,b.z-a.z)||1,nx=-(b.z-a.z)/d*.06,nz=(b.x-a.x)/d*.06;
      const vertices=[[a.x-nx,a.y,a.z-nz],[b.x-nx,b.y,b.z-nz],[b.x+nx,b.y,b.z+nz],[a.x-nx,a.y,a.z-nz],[b.x+nx,b.y,b.z+nz],[a.x+nx,a.y,a.z+nz]];
      const uv=[[0,1-a.age/life],[0,1-b.age/life],[1,1-b.age/life],[0,1-a.age/life],[1,1-b.age/life],[1,1-a.age/life]];
      for(let v=0;v<6;v++){trailPositions.set(vertices[v],count*3);uvs.set(uv[v],count*2);count++;}
    }
    trailGeometry.attributes.position.needsUpdate=true;trailGeometry.attributes.uv.needsUpdate=true;trailGeometry.setDrawRange(0,count);
  }
  return {
    update,
    setIntensity(value){preset=Math.max(0,Math.min(2,Number(value)|0));while(particles.length>presets[preset].cap)particles.pop();},
    reset(){particles.length=0;tracks.forEach(t=>t.length=0);carry=0;alive=0;geometry.setDrawRange(0,0);trailGeometry.setDrawRange(0,0);},
    stats(){return {particles:particles.length,cap:presets[preset].cap,trailSegments:tracks.reduce((sum,t)=>sum+Math.max(0,t.length-1),0),disposed};},
    dispose(){if(disposed)return;disposed=true;scene.remove(points,trail);geometry.dispose();material.dispose();trailGeometry.dispose();trailMaterial.dispose();particles.length=0;tracks.forEach(t=>t.length=0);}
  };
}
