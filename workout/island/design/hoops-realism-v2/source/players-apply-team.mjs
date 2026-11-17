/** Real uniform-region masks, core Three.js materials, no imported runtime.
 * applyTeam(THREE, gltf.scene, {primary, secondary, trim}, maskTexture)
 * Mask = linear RGB data; R jersey background, G shorts background, B trim.
 * Printed numerals / outlines have zero coverage and retain the atlas colour.
 */
export function applyTeam(THREE,root,colours,maskTexture){
 if(!maskTexture)throw new Error('A delivered player team mask is required.');
 maskTexture.flipY=false;maskTexture.colorSpace=THREE.NoColorSpace;
 const palette={primary:'#47b8bf',secondary:'#123f52',trim:'#f4dfba',...colours};
 const uniforms=[];
 const channelFor=name=>name==='team_primary'?0:name==='team_secondary'?1:name==='team_trim'?2:name==='compression'?3:-1;
 const made=new Map();
 root.traverse(object=>{
  if(!object.isMesh)return;
  const materials=Array.isArray(object.material)?object.material:[object.material];
  const next=materials.map(source=>{
   const channel=channelFor(source.name);if(channel<0)return source;
   if(made.has(source))return made.get(source);
   const material=source.clone(),name=channel===0?'primary':channel===1||channel===3?'secondary':'trim';
   const tint={value:new THREE.Color(palette[name])},primary={value:new THREE.Color(palette.primary)},secondary={value:new THREE.Color(palette.secondary)},trim={value:new THREE.Color(palette.trim)};
   uniforms.push({name,tint,primary,secondary,trim});
   material.color.setRGB(1,1,1);
   material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,{hoopsTeamMask:{value:maskTexture},hoopsTeamTint:tint,hoopsPrimary:primary,hoopsSecondary:secondary,hoopsTrim:trim});
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_pars_fragment>','#include <map_pars_fragment>\nuniform sampler2D hoopsTeamMask;\nuniform vec3 hoopsTeamTint;\nuniform vec3 hoopsPrimary;\nuniform vec3 hoopsSecondary;\nuniform vec3 hoopsTrim;');
    const colour=channel===3?'hoopsTeamTint':channel===2?'hoopsTeamTint':channel===1?'hoopsTeamTint':'vec3(1.0)*(1.0-clamp(dot(hoopsMask,vec3(1.0)),0.0,1.0))+hoopsPrimary*hoopsMask.r+hoopsSecondary*hoopsMask.g+hoopsTrim*hoopsMask.b';
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>\n#ifdef USE_MAP\nvec3 hoopsMask=texture2D(hoopsTeamMask,vMapUv).rgb;\ndiffuseColor.rgb *= ${colour};\n#endif`);
   };
   material.customProgramCacheKey=()=>`hoops-realism-v2-mask-${channel}`;
   material.needsUpdate=true;made.set(source,material);return material;
  });
  object.material=Array.isArray(object.material)?next:next[0];
 });
 return {
  setColors(values){Object.assign(palette,values);for(const {name,tint,primary,secondary,trim}of uniforms){tint.value.set(palette[name]);primary.value.set(palette.primary);secondary.value.set(palette.secondary);trim.value.set(palette.trim);}},
  dispose(){for(const material of made.values())material.dispose();},
  materials:[...made.values()],
 };
}
