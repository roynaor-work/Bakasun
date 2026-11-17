/** CC0-1.0. Asset integration API. Three.js is supplied by the host application.
 * sources: Map<item.id, parsed GLTF>. avatarRoot must be a unique SkeletonUtils
 * clone of a v22 body. Every mutation is to that clone or a cloned geometry.
 */
export function createCustomization(T, avatarRoot, bodyInfo, manifest, sources) {
  let bodyMesh;
  const bones = {};
  avatarRoot.traverse(o => { if (o.isBone) bones[o.name] = o; if (o.isSkinnedMesh) bodyMesh = o; });
  if (!bodyMesh || manifest.skeleton.bones.some(b => !bones[b.name])) throw Error('A canonical v22 body is required');
  const originalGeometry = bodyMesh.geometry;
  bodyMesh.geometry = originalGeometry.clone();
  const originalIndices = Array.from(originalGeometry.index.array);
  const bodyMaterial = new T.MeshStandardMaterial({vertexColors:true, roughness:.9, side:T.DoubleSide});
  const underlayUniforms={avatarPantsBottom:{value:.616},avatarHasTop:{value:1},avatarSleeveBottom:{value:1.16}};
  const srcJoints=originalGeometry.attributes.skinIndex,srcWeights=originalGeometry.attributes.skinWeight;
  const partIds=new Float32Array(originalGeometry.attributes.position.count);
  for(let i=0;i<partIds.length;i++){
    let slot=0;for(let k=1;k<4;k++)if(srcWeights.array[i*4+k]>srcWeights.array[i*4+slot])slot=k;
    const name=manifest.skeleton.bones[srcJoints.array[i*4+slot]].name;
    partIds[i]=/Hand/.test(name)?3:/Foot/.test(name)?4:/Leg/.test(name)?2:/Arm/.test(name)?1:0;
  }
  bodyMesh.geometry.setAttribute('avatarUnderlayPart',new T.BufferAttribute(partIds,1));
  // Clip the covered portion of seam-crossing triangles in canonical space.
  // Dropping a whole long thigh triangle would open a hole below a shorts cuff.
  bodyMaterial.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,underlayUniforms);
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
      attribute float avatarUnderlayPart;
      varying float vAvatarPart; varying vec3 vAvatarCanonical;`)
      .replace('#include <begin_vertex>',`#include <begin_vertex>
      vAvatarPart=avatarUnderlayPart; vAvatarCanonical=position;`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      uniform float avatarPantsBottom; uniform float avatarHasTop; uniform float avatarSleeveBottom;
      varying float vAvatarPart; varying vec3 vAvatarCanonical;`)
      .replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>
      float y=vAvatarCanonical.y;
      if((vAvatarPart<0.5 || (vAvatarPart>1.5 && vAvatarPart<2.5)) && y>avatarPantsBottom && y<0.91) discard;
      if(vAvatarPart<0.5 && avatarHasTop>0.5 && y>0.887 && y<1.432) discard;
      if(vAvatarPart>0.5 && vAvatarPart<1.5 && y>avatarSleeveBottom) discard;`);
  };
  bodyMaterial.customProgramCacheKey=()=> 'avatar-neutral-underlay-v1';
  bodyMesh.material = bodyMaterial;
  bodyMesh.frustumCulled = false;
  if (bodyMesh.morphTargetInfluences) bodyMesh.morphTargetInfluences.fill(0);
  const material = new T.MeshStandardMaterial({vertexColors:true, roughness:.83, side:T.DoubleSide});
  const parts = new Map();
  const items = new Map(manifest.items.map(i => [i.id, i]));
  const colors = Object.fromEntries(manifest.colorRegions.map(r => [r.id, r.default]));
  let activeState;

  function paint(mesh, palette, forceSkin=false) {
    const g = mesh.geometry, color = g.attributes.color, regions = g.attributes._region;
    const linear = new Map(Object.entries(palette).map(([id, hex]) => [Number(id), new T.Color(hex)]));
    for (let i=0; i<color.count; i++) {
      const c = linear.get(forceSkin ? 0 : regions.getX(i));
      if (c) color.setXYZ(i,c.r,c.g,c.b);
    }
    color.needsUpdate = true;
  }

  function add(item) {
    if (item.empty) return;
    const source = sources.get(item.id);
    let template;
    source.scene.traverse(o => { if (o.isSkinnedMesh) template = o; });
    const g = template.geometry.clone(), p = g.attributes.position;
    // Match the x/z deformation already baked into the four v22 body meshes.
    // Joint positions, inverse binds, and the canonical animation contract stay fixed.
    for (let i=0; i<p.count; i++) p.setXYZ(i,p.getX(i)*bodyInfo.width,p.getY(i),p.getZ(i)*bodyInfo.depth);
    g.computeVertexNormals();
    const mesh = new T.SkinnedMesh(g,material);
    mesh.name = item.id; mesh.frustumCulled = false;
    avatarRoot.add(mesh);
    mesh.bind(bodyMesh.skeleton,bodyMesh.bindMatrix);
    mesh.castShadow = mesh.receiveShadow = true;
    parts.set(item.id,mesh);
  }

  function filterBody(state) {
    const gloves=state.accessories.includes('gloves');
    const p = originalGeometry.attributes.position, r = originalGeometry.attributes._region;
    const joints=originalGeometry.attributes.skinIndex,weights=originalGeometry.attributes.skinWeight;
    const longSleeve=['tracksuit','holiday','winter','hoodie','tunic'].includes(state.outfit);
    const longPants=['tracksuit','holiday','winter','denim','tunic'].includes(state.outfit);
    const top=state.outfit!=='swim',sleeves=top&&state.outfit!=='summer';
    const legBottom=longPants?.11:.616;
    const covered=v=>{
      const y=p.getY(v),x=Math.abs(p.getX(v)),region=r.getX(v);
      let slot=0;for(let k=1;k<4;k++)if(weights.array[v*4+k]>weights.array[v*4+slot])slot=k;
      const bone=manifest.skeleton.bones[joints.array[v*4+slot]].name;
      if(top&&region===1&&(!(!sleeves&&x>.13)))return true;
      if(region===2)return true;
      if(top&&x<.145&&y>.887&&y<1.432)return true;
      if(sleeves&&/Arm/.test(bone)&&y>(longSleeve?.81:1.16))return true;
      if(y>legBottom&&y<.91&&(/Leg/.test(bone)||bone==='Hips'))return true;
      if(region===3&&((top&&y>1.15)||(y>.61&&y<.91)))return true;
      if(state.shoes!=='sandals'&&(region===4||region===5))return true;
      return false;
    };
    const kept=[];
    for (let i=0; i<originalIndices.length; i+=3) {
      const tri=originalIndices.slice(i,i+3);
      if (tri.some(v => p.getY(v)>manifest.integration.sourceHeadCutY)) continue;
      if (tri.some(v => r.getX(v)===2)) continue;
      if (top&&sleeves&&tri.some(v => r.getX(v)===1)) continue;
      if (tri.every(covered)) continue;
      if (gloves && tri.every(v => p.getY(v)<.795 && p.getY(v)>.56 && Math.abs(p.getX(v))>.083 && r.getX(v)===0)) continue;
      kept.push(...tri);
    }
    bodyMesh.geometry.setIndex(kept);
    bodyMesh.geometry.computeBoundingSphere();
  }

  function update(state) {
    const accessoryIds = [...new Set(state.accessories || [])];
    underlayUniforms.avatarPantsBottom.value=['tracksuit','holiday','winter','denim','tunic'].includes(state.outfit)?.11:.616;
    underlayUniforms.avatarHasTop.value=state.outfit==='swim'?0:1;
    underlayUniforms.avatarSleeveBottom.value=['summer','swim'].includes(state.outfit)?10:['tracksuit','holiday','winter','hoodie','tunic'].includes(state.outfit)?.81:1.16;
    for (const [id,mesh] of parts) { avatarRoot.remove(mesh); mesh.geometry.dispose(); }
    parts.clear();
    const hiddenHair = accessoryIds.includes('bucket-hat');
    const selected = [state.face,state.outfit,state.shoes,...accessoryIds];
    if (!hiddenHair) selected.push(state.hair);
    for (const id of selected) {
      const item=items.get(id);
      if (!item) throw Error('Unknown customization item: '+id);
      add(item);
    }
    filterBody(state);
    const palette={...colors};
    for (const region of manifest.colorRegions) palette[region.id]=state.colors?.[region.name] || region.default;
    palette[0]=manifest.skinTones[state.skin] || manifest.skinTones[1];
    paint(bodyMesh,palette,true);
    for (const mesh of parts.values()) paint(mesh,palette);
    avatarRoot.updateMatrixWorld(true);bodyMesh.skeleton.update();
    activeState=structuredClone(state);
    return {visibleItems:[...parts.keys()],hairSuppressed:hiddenHair,
            itemTriangles:[...parts.keys()].reduce((n,id)=>n+items.get(id).triangles,0),
            bodyTriangles:bodyMesh.geometry.index.count/3};
  }

  function dispose() {
    for (const mesh of parts.values()) { avatarRoot.remove(mesh);mesh.geometry.dispose(); }
    parts.clear();bodyMesh.geometry.dispose();bodyMaterial.dispose();material.dispose();
    bodyMesh.geometry=originalGeometry;
    bodyMesh.skeleton.dispose();
  }
  return {update,dispose,bones,bodyMesh,parts,get state(){return activeState;}};
}
