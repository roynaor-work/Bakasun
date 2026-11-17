// CC0-1.0. Bounded reusable particle buffers; no per-frame geometry allocations.
export function createEffectPreview(T, parent) {
  const max = 40, positions = new Float32Array(max * 3), tails = new Float32Array(max * 6), colors = new Float32Array(max * 3);
  const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new T.BufferAttribute(colors, 3));
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
  const ctx = canvas.getContext('2d'), gradient = ctx.createRadialGradient(16,16,0,16,16,16);
  gradient.addColorStop(0,'rgba(255,255,255,1)'); gradient.addColorStop(.3,'rgba(255,255,255,.7)'); gradient.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle = gradient; ctx.fillRect(0,0,32,32);
  const texture = new T.CanvasTexture(canvas);
  const material = new T.PointsMaterial({size: .12, map: texture, vertexColors: true, transparent: true, depthWrite: false, opacity: .85});
  const points = new T.Points(geometry, material); points.frustumCulled = false; parent.add(points);
  const lineGeometry = new T.BufferGeometry(); lineGeometry.setAttribute('position', new T.BufferAttribute(tails,3));
  const lineMaterial = new T.LineBasicMaterial({color: '#ffd35d', transparent: true, opacity: .9, depthWrite: false, blending: T.AdditiveBlending});
  const lines = new T.LineSegments(lineGeometry, lineMaterial); lines.frustumCulled = false; parent.add(lines);
  const flameGeometry = new T.ConeGeometry(.052, 1, 12, 1, true);
  const flameOuter = new T.MeshBasicMaterial({color:'#ff853f',transparent:true,opacity:.72,depthWrite:false,blending:T.AdditiveBlending,side:T.DoubleSide});
  const flameInner = new T.MeshBasicMaterial({color:'#fff1c1',transparent:true,opacity:.92,depthWrite:false,blending:T.AdditiveBlending,side:T.DoubleSide});
  const flameMeshes = Array.from({length:4},(_,i)=>{
    const mesh = new T.Mesh(flameGeometry,i%2?flameInner:flameOuter);
    mesh.rotation.x = -Math.PI/2; mesh.visible = false; parent.add(mesh); return mesh;
  });
  let item = null, enabled = true;
  const start = new T.Vector3(), emitterPosition = new T.Vector3(), inverse = new T.Matrix4();
  function select(next) {
    item = next;
    material.size = next.kind === 'smoke' ? .42 : .09;
    material.blending = next.kind === 'smoke' ? T.NormalBlending : T.AdditiveBlending;
    material.opacity = next.kind === 'smoke' ? .36 : .95; material.needsUpdate = true;
    lineMaterial.color.set(next.color);
    flameOuter.color.set(next.color);
    flameInner.color.set(next.id === 'effect-ion' ? '#e0faff' : '#fff2b9');
    geometry.setDrawRange(0, next.particles.count); lineGeometry.setDrawRange(0, next.particles.count*2);
  }
  function update(time, root, reducedMotion = false) {
    points.visible = enabled && !!item && !!root && !reducedMotion && item.kind !== 'sparks';
    lines.visible = enabled && !!item && !!root && !reducedMotion && item.kind === 'sparks';
    for(const mesh of flameMeshes)mesh.visible=points.visible&&item.kind==='flame';
    if (!points.visible && !lines.visible) return;
    parent.updateWorldMatrix(true, false); inverse.copy(parent.matrixWorld).invert();
    const cfg=item.particles, baseColor = new T.Color(item.color);
    for (let i=0; i<cfg.count; i++) {
      const emitter = root.getObjectByName(i%2 ? 'EmitterL' : 'EmitterR');
      if (!emitter) continue;
      emitter.getWorldPosition(emitterPosition); start.copy(emitterPosition).applyMatrix4(inverse);
      if(item.kind==='flame'&&i<2){
        for(let layer=0;layer<2;layer++){
          const mesh=flameMeshes[i*2+layer],length=(.53+Math.sin(time*27+i)*.07)*(layer?.72:1);
          mesh.position.set(start.x,start.y,start.z-length*.5);
          mesh.scale.set(layer?.53:1,length,layer?.53:1);
        }
      }
      const phase = ((i*.61803398875 + item.particles.seed*.0001 + time/cfg.lifetime)%1);
      const age = phase*cfg.lifetime, spread = item.kind === 'smoke' ? .13 : item.kind === 'sparks' ? .4 : .035;
      const x=start.x+Math.sin(i*27.13)*spread*age;
      const y=start.y+age*(item.kind === 'smoke' ? .33 : .11)+Math.cos(i*19.7)*spread*age;
      const z=start.z-age*cfg.speed;
      positions.set([x,y,z],i*3);
      const intensity=Math.max(.12,1-phase);
      colors.set([baseColor.r*intensity,baseColor.g*intensity,baseColor.b*intensity],i*3);
      tails.set([x,y,z,x+Math.sin(i*27.13)*.015,y+.008,z+.06+phase*.04],i*6);
    }
    geometry.attributes.position.needsUpdate = geometry.attributes.color.needsUpdate = true;
    lineGeometry.attributes.position.needsUpdate = true;
  }
  return {select,update,setEnabled(value){enabled=!!value;},
    dispose(){points.removeFromParent();lines.removeFromParent();for(const mesh of flameMeshes)mesh.removeFromParent();flameGeometry.dispose();flameOuter.dispose();flameInner.dispose();geometry.dispose();lineGeometry.dispose();material.dispose();lineMaterial.dispose();texture.dispose();},
    metrics:()=>({kind:item?.kind||null,capacity:max,count:item?.particles.count||0,enabled})};
}
