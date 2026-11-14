/** CC0-1.0. Dependency-injected three r160 adapter, matching tennis-crowd-3d-v1. */
export async function createCourt({T, base = new URL('../', import.meta.url), surface = 'clay', time = 'day', lod = 'high'} = {}) {
  if (!T || !['clay','grass','hard'].includes(surface) || !['day','sunset','night'].includes(time) || !['high','low'].includes(lod)) throw new Error('Invalid court options');
  base = new URL(base, import.meta.url);
  const root = new T.Group(); root.name = 'TennisCourtsV1';
  const resources = new Set(), textures = {}, effects = [], seats = [];
  let disposed = false;
  const keep = r => (resources.add(r), r);
  const loader = new T.TextureLoader();
  const roles = {
    court:`${surface}/court.png`, net:'shared/net.png', shadow:'shared/ball-shadow.png',
    lower:'shared/stand-lower.png', upper:'shared/stand-upper.png', signs:'shared/blank-signs.png',
    sky:`shared/sky-${time}.png`, lamp:'shared/floodlight-lamp.png', beam:'shared/floodlight-beam.png',
    ...(surface==='hard'?{}:{effect:`shared/${surface==='clay'?'clay-dust':'grass-spray'}.png`})
  };
  function dispose() {
    if (disposed) return; disposed = true;
    root.removeFromParent(); resources.forEach(r => r.dispose?.()); resources.clear(); root.clear();
  }
  try {
    // Wait for every request before cleanup, including a partial load failure.
    const results = await Promise.allSettled(Object.entries(roles).map(async ([key,file]) => {
      const tex = keep(await loader.loadAsync(new URL(`runtime/textures/${file}`,base).href));
      tex.colorSpace = T.SRGBColorSpace;
      tex.anisotropy = 4;
      textures[key] = tex;
    }));
    const failure = results.find(r=>r.status==='rejected'); if (failure) throw failure.reason;
    const material = (color, options={}) => keep(new T.MeshStandardMaterial({color,roughness:.94,...options}));
    const basic = (map, options={}) => keep(new T.MeshBasicMaterial({map,transparent:true,side:T.DoubleSide,forceSinglePass:true,...options}));
    const boxGeometry = keep(new T.BoxGeometry(1,1,1));
    const planeGeometry = keep(new T.PlaneGeometry(1,1));
    const steel = material('#344953'), concrete = material('#697a79'), trim = material('#c7ac74');
    function box(size,pos,mat,parent=root) {
      const mesh = new T.Mesh(boxGeometry,mat); mesh.scale.set(...size);mesh.position.set(...pos);parent.add(mesh);return mesh;
    }
    function plane(size,pos,mat,parent=root) {
      const mesh = new T.Mesh(planeGeometry,mat); mesh.scale.set(...size,1);mesh.position.set(...pos);parent.add(mesh);return mesh;
    }
    const floor = plane([16,28],[0,.005,0],material('#ffffff',{map:textures.court})); floor.rotation.x = -Math.PI/2;
    box([54,.12,60],[0,-.10,0],material(time==='night'?'#283c40':'#526d60'));
    // Seamless panoramic backdrop follows sky direction, never showing a hard vertical join.
    textures.sky.wrapS=T.RepeatWrapping;
    const skyGeometry=keep(new T.CylinderGeometry(75,75,90,64,1,true));
    const sky=new T.Mesh(skyGeometry,keep(new T.MeshBasicMaterial({map:textures.sky,side:T.BackSide,fog:false})));
    // The downward game camera sees the sky's upper color above the far apron.
    sky.position.y=0;root.add(sky);
    const hemisphere = new T.HemisphereLight(time==='night'?'#9fbad3':'#e1efeb','#4c5144',time==='night'?.85:2.0);root.add(hemisphere);
    const sun=new T.DirectionalLight(time==='sunset'?'#ffc58e':'#fff5df',time==='night'?.15:time==='sunset'?2.0:2.5);
    sun.position.set(-12,20,10);root.add(sun);

    // 48-segment sagged net: the top is 1.07 m at the posts, .914 m centrally.
    const ng=keep(new T.PlaneGeometry(11.3,1.07,48,1)), np=ng.attributes.position;
    for(let i=0;i<np.count;i++) {
      const x=np.getX(i), fraction=(np.getY(i)+.535)/1.07;
      np.setY(i, fraction*(.914+.156*(Math.abs(x)/5.65)**2));
    }
    ng.computeVertexNormals();
    const net=new T.Mesh(ng,basic(textures.net,{alphaTest:.06,depthWrite:false})); net.position.y=.018;root.add(net);
    for(const x of [-5.65,5.65]) {
      box([.09,1.13,.09],[x,.565,0],steel);
      box([.17,.06,.17],[x,1.15,0],trim);
    }

    const placements=[-1,1].flatMap(sign=>[-10,0,10].map(z=>({x:sign*10.4,z,yaw:-sign*Math.PI/2})))
      .concat([-1,1].flatMap(sign=>[-5,5].map(x=>({x,z:sign*19.5,yaw:sign<0?Math.PI:0}))));
    const fitZ=z=>Math.abs(z)>=5?Math.sign(z)*(Math.abs(z)-2.885):z;
    const seatColors=['#6f9b96','#c5ac6d','#678695','#a6b8a7'];
    const instances=[], backs=[];
    // One merged geometry for all fixed structure, one instanced seat-pan batch.
    // Group tiers share the exact original crowd positions; no extra rise is added.
    const fixedPositions=[],fixedNormals=[],fixedColors=[];
    const nMatrix=new T.Matrix3(),matrix=new T.Matrix4(),v=new T.Vector3(),n=new T.Vector3();
    function mergeBox(size,pos,color,parent) {
      const m=new T.Matrix4().compose(new T.Vector3(...pos),new T.Quaternion(),new T.Vector3(...size));
      matrix.multiplyMatrices(parent.matrix,m);nMatrix.getNormalMatrix(matrix);
      const g=boxGeometry.toNonIndexed(),p=g.attributes.position,normal=g.attributes.normal,c=new T.Color(color);
      for(let i=0;i<p.count;i++) {
        v.fromBufferAttribute(p,i).applyMatrix4(matrix);n.fromBufferAttribute(normal,i).applyMatrix3(nMatrix).normalize();
        fixedPositions.push(v.x,v.y,v.z);fixedNormals.push(n.x,n.y,n.z);fixedColors.push(c.r,c.g,c.b);
      }
      g.dispose();
    }
    for(const p of placements) {
      const stand=new T.Group();stand.position.set(p.x,0,fitZ(p.z));stand.rotation.y=p.yaw;stand.updateMatrix();
      root.add(stand);
      for(let row=0;row<5;row++) {
        const elevation=.28+row*.42,z=.42+row*.88;
        mergeBox([10,.24,.88],[0,elevation-.12,z+.12],row<2?'#667976':'#4c626a',stand);
        if(row===1||row===4) {
          const facade=plane([10,.55],[0,elevation-.40,z-.31],basic(row===1?textures.lower:textures.upper),stand);
          facade.rotation.y=Math.PI;
        }
        // Center aisle, stair treads and two distinct gold tier edges.
        mergeBox([.66,.06,.88],[0,elevation+.02,z+.12],'#b9ad86',stand);
        if(row===0||row===2) mergeBox([10,.035,.045],[0,elevation+.02,z-.31],'#c7ac74',stand);
        for(let col=0;col<12;col++) {
          const x=col<6?-4.5+col*.7:.95+(col-6)*.7, localZ=.48+row*.88-.06;
          const seat={id:seats.length,x:p.x+Math.cos(p.yaw)*x+Math.sin(p.yaw)*localZ,
            y:elevation-.025,z:fitZ(p.z)-Math.sin(p.yaw)*x+Math.cos(p.yaw)*localZ,yaw:p.yaw+Math.PI,row,col,tier:row<2?'lower':'upper'};
          seats.push(seat);
          // The crowd's feet use seat.y; its pelvis is .50 m higher.
          instances.push({position:[seat.x,seat.y+.48,seat.z],yaw:p.yaw,color:seatColors[(row+col)%4]});
          if(lod==='high') backs.push({position:[seat.x+Math.sin(p.yaw)*.25,seat.y+.76,seat.z+Math.cos(p.yaw)*.25],yaw:p.yaw,color:seatColors[(row+col)%4]});
        }
      }
      if(lod==='high') {
        for(const x of [-4.8,4.8]) {
          mergeBox([.055,2.4,.055],[x,2.4,4.2],'#344953',stand);
          mergeBox([.055,.055,4.0],[x,3.3,2.2],'#c7ac74',stand);
        }
        mergeBox([9.7,.06,.06],[0,3.32,4.2],'#c7ac74',stand);
      }
    }
    const fixed=keep(new T.BufferGeometry());fixed.setAttribute('position',new T.Float32BufferAttribute(fixedPositions,3));
    fixed.setAttribute('normal',new T.Float32BufferAttribute(fixedNormals,3));fixed.setAttribute('color',new T.Float32BufferAttribute(fixedColors,3));
    fixed.computeBoundingSphere();root.add(new T.Mesh(fixed,material('#ffffff',{vertexColors:true})));
    function batch(data,size) {
      const mesh=new T.InstancedMesh(boxGeometry,material('#ffffff'),data.length),dummy=new T.Object3D();keep(mesh);
      for(const [i,entry] of data.entries()) {
        dummy.position.set(...entry.position);dummy.rotation.y=entry.yaw;dummy.scale.set(...size);dummy.updateMatrix();
        mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,new T.Color(entry.color));
      }
      mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();root.add(mesh);
    }
    batch(instances,[.48,.065,.43]);if(lod==='high')batch(backs,[.48,.47,.065]);

    const signMap=textures.signs;signMap.repeat.set(.25-.012,.95);signMap.offset.set(.006,.025);
    const signMaterial=basic(signMap);
    for(const z of [-13.4,13.4])for(const x of [-5.4,-1.8,1.8,5.4]) {
      const sign=plane([3.4,.9],[x,.51,z],signMaterial);if(z>0)sign.rotation.y=Math.PI;
    }
    for(const x of [-7.7,7.7])for(const z of [-9,-4.5,4.5,9]) {
      const sign=plane([3.1,.8],[x,.46,z],signMaterial);sign.rotation.y=x<0?Math.PI/2:-Math.PI/2;
    }
    for(const x of [-8.9,8.9])for(const z of [-12.3,12.3]) {
      box([.14,8.7,.14],[x,4.35,z],steel);
      const lamp=plane([1.8,.8],[x,8.6,z],basic(textures.lamp));lamp.rotation.y=z<0?0:Math.PI;lamp.rotation.x=-.15;
      if(time==='night') {
        const glow=new T.Sprite(keep(new T.SpriteMaterial({map:textures.shadow,color:'#e9f5ff',blending:T.AdditiveBlending,depthWrite:false,opacity:.3})));
        glow.position.set(x,8.6,z);glow.scale.set(2,1.2,1);root.add(glow);
        const target=new T.Object3D();target.position.set(x*.25,0,z*.25);root.add(target);
        const spot=new T.SpotLight('#d6edff',42,36,.65,.75,1);spot.position.set(x,8.6,z);spot.target=target;root.add(spot);
        const beam=plane([7.2,10],[x*.76,4.2,z*.76],basic(textures.beam,{blending:T.AdditiveBlending,depthWrite:false,opacity:.34}));
        beam.rotation.x=z<0?-.37:.37;beam.rotation.y=z<0?0:Math.PI;
      }
    }
    const shadow=plane([.75,.52],[0,.024,0],basic(textures.shadow,{depthWrite:false}));shadow.rotation.x=-Math.PI/2;
    if(textures.effect)for(let i=0;i<4;i++) {
      const map=keep(textures.effect.clone());map.repeat.set((128-1)/768,(128-1)/128);map.offset.set(.5/768,.5/128);
      const mesh=plane([1.8,1.8],[0,.65,0],basic(map,{depthWrite:false}));mesh.visible=false;mesh.renderOrder=3;
      effects.push({mesh,map,start:-10});
    }
    let clock=0,nextEffect=0;
    function impact(x,z) {
      if(disposed||!effects.length||![x,z].every(Number.isFinite))return;
      const effect=effects[nextEffect++%effects.length];effect.start=clock;
      effect.mesh.position.set(x,.67,z);effect.mesh.visible=true;
    }
    function update({seconds=clock,ballPosition=[0,.13,0],camera}={}) {
      if(disposed)return;
      clock=seconds;
      const [x,y,z]=ballPosition;
      shadow.position.set(x,.024,z);shadow.material.opacity=Math.max(.15,.86-y*.16);
      shadow.scale.set(.55+y*.16,.38+y*.10,1);
      for(const effect of effects) {
        const age=clock-effect.start;effect.mesh.visible=age>=0&&age<.6;
        if(effect.mesh.visible) {
          effect.map.offset.x=(Math.min(5,Math.floor(age/.1))*128+.5)/768;
          if(camera)effect.mesh.quaternion.copy(camera.quaternion);
        }
      }
    }
    const stats={surface,time,lod,seats:seats.length,tiers:2,images:Object.keys(roles).length,
      coordinateSystem:{units:'meters',up:'+Y',forward:'+Z'}};
    update();
    return {root,seats,stats,update,impact,dispose};
  } catch(error) {dispose();throw error;}
}
