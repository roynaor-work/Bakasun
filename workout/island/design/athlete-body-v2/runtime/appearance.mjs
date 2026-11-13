/** CC0-1.0. Optional design adapter; no game module is patched or imported.
 * MeshStandardMaterial program shared by all actors; per-actor uniforms carry
 * number and palette. Rest-space projection follows the existing skinning.
 */
const REGION_NAMES = ['skin', 'uniform_primary', 'uniform_secondary', 'uniform_trim', 'shoe_upper', 'shoe_sole', 'eyes', 'hair', 'sock'];
export const DEFAULT_COLORS = Object.freeze({skin:'#bd8058', uniform_primary:'#187e83', uniform_secondary:'#16363b', uniform_trim:'#e7dbb9', shoe_upper:'#253540', shoe_sole:'#d4d5cb', eyes:'#e0e0e0', hair:'#442d22', sock:'#e7dbb9'});
export const BODY_SHAPES = Object.freeze({soccer:[1,1], guard:[.97,.98], wing:[1.045,1.035], center:[1.12,1.09]});

export function validateNumber(value) {
  if (!Number.isInteger(value) || value < 0 || value > 99) throw new RangeError('Player number must be an integer from 0 to 99');
  return value;
}

const VARYINGS = `
varying vec3 vAthleteRest;
varying vec3 vAthleteNormal;
varying float vAthleteRegion;
varying float vAthleteGlove;
`;
const MASKS = `
uniform float athleteNumber;
uniform float athleteNumbers;
uniform float athleteCrest;
uniform float athleteGloves;
uniform vec3 athleteTrim;
uniform vec3 athleteSecondary;
float athleteSegment(vec2 p, vec2 a, vec2 b) {
  vec2 d = b-a;
  return length(p-a-d*clamp(dot(p-a,d)/dot(d,d),0.0,1.0))-.046;
}
float athleteDigit(vec2 p, float digit) {
  // Original seven-segment glyphs, no font or image dependency.
  float n=floor(digit+.5);
  vec4 a; vec3 b;
  if(n<.5)      {a=vec4(1,1,1,1);b=vec3(1,1,0);}
  else if(n<1.5){a=vec4(0,1,1,0);b=vec3(0,0,0);}
  else if(n<2.5){a=vec4(1,1,0,1);b=vec3(1,0,1);}
  else if(n<3.5){a=vec4(1,1,1,1);b=vec3(0,0,1);}
  else if(n<4.5){a=vec4(0,1,1,0);b=vec3(0,1,1);}
  else if(n<5.5){a=vec4(1,0,1,1);b=vec3(0,1,1);}
  else if(n<6.5){a=vec4(1,0,1,1);b=vec3(1,1,1);}
  else if(n<7.5){a=vec4(1,1,1,0);b=vec3(0,0,0);}
  else if(n<8.5){a=vec4(1,1,1,1);b=vec3(1,1,1);}
  else         {a=vec4(1,1,1,1);b=vec3(0,1,1);}
  float d=2.0;
  if(a.x>.5)d=min(d,athleteSegment(p,vec2(-.20,.42),vec2(.20,.42)));
  if(a.y>.5)d=min(d,athleteSegment(p,vec2(.26,.35),vec2(.26,.07)));
  if(a.z>.5)d=min(d,athleteSegment(p,vec2(.26,-.07),vec2(.26,-.35)));
  if(a.w>.5)d=min(d,athleteSegment(p,vec2(-.20,-.42),vec2(.20,-.42)));
  if(b.x>.5)d=min(d,athleteSegment(p,vec2(-.26,-.35),vec2(-.26,-.07)));
  if(b.y>.5)d=min(d,athleteSegment(p,vec2(-.26,.07),vec2(-.26,.35)));
  if(b.z>.5)d=min(d,athleteSegment(p,vec2(-.20,0),vec2(.20,0)));
  float aa=max(length(fwidth(p))*.7,.003);
  return 1.0-smoothstep(-aa,aa,d);
}
float athleteNumberMask(vec2 uv) {
  if(athleteNumber<9.5)return athleteDigit(uv*vec2(1.05,1.0),athleteNumber);
  vec2 p=uv*vec2(1.8,1.0);
  return max(athleteDigit(p+vec2(.43,0),floor(athleteNumber/10.0)),
             athleteDigit(p-vec2(.43,0),mod(athleteNumber,10.0)));
}
float athleteCrestMask(vec2 p) {
  // Hollow geometric shield: a designated team-mark area, no real insignia.
  float d=max(abs(p.x)-.40, max(p.y-.44, -p.y+.7*abs(p.x)-.43));
  float aa=max(fwidth(d),.008);
  return 1.0-smoothstep(.025-aa,.025+aa,abs(d));
}
`;

/** Recolors vertex regions and installs the number/crest/glove shader.
 * Call only on an owned clone of a v2 skinned scene. Returned controller owns
 * the cloned geometries/materials, but shares the atlas with the loaded source.
 * Sport and goalkeeper morphs are orthogonal; selecting a sport keeps gloves.
 */
export function decorateAthlete(T, root, options = {}) {
  const state = {bodyId:'soccer', number:7, gloves:false, numbers:true, crest:true, sport:'soccer', colors:{...DEFAULT_COLORS, ...options.colors}, ...options};
  state.colors = {...DEFAULT_COLORS, ...options.colors};
  validateNumber(state.number);
  const owned = [];
  root.traverse(mesh => {
    if (!mesh.isSkinnedMesh) return;
    const geometry = mesh.geometry.clone();
    mesh.geometry = geometry;
    const material = mesh.material.clone();
    material.name = 'athlete_body_v2';
    material.vertexColors = true;
    material.roughness = .88;
    if (material.map) material.map.colorSpace = T.SRGBColorSpace;
    const uniforms = {
      athleteNumber:{value:state.number}, athleteNumbers:{value:1}, athleteCrest:{value:1}, athleteGloves:{value:0},
      athleteTrim:{value:new T.Color()}, athleteSecondary:{value:new T.Color()},
      athleteShape:{value:new T.Vector2(...(BODY_SHAPES[state.bodyId] || BODY_SHAPES.soccer))},
    };
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = VARYINGS + `attribute float _region;\nattribute float _glove;\nuniform vec2 athleteShape;\n` + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
        vAthleteRest=vec3(position.x/athleteShape.x,position.y,position.z/athleteShape.y);
        vAthleteNormal=normal;
        vAthleteRegion=_region;
        vAthleteGlove=_glove;
        #include <begin_vertex>
      `);
      shader.fragmentShader = VARYINGS + MASKS + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
        #include <color_fragment>
        float shirt=1.0-step(.25,abs(vAthleteRegion-1.0));
        float shorts=1.0-step(.25,abs(vAthleteRegion-2.0));
        vec3 restNormal=normalize(vAthleteNormal);
        float back=shirt*step(.035,-vAthleteRest.z)*step(.35,-restNormal.z);
        float front=step(.035,vAthleteRest.z)*step(.35,restNormal.z);
        vec2 backUV=vec2(-vAthleteRest.x/ .23,(vAthleteRest.y-1.165)/ .27);
        vec2 shortsUV=vec2((vAthleteRest.x-.100)/ .072,(vAthleteRest.y-.732)/ .105);
        float marking=athleteNumbers*max(back*athleteNumberMask(backUV),shorts*front*athleteNumberMask(shortsUV));
        vec2 crestUV=vec2((vAthleteRest.x-.082)/ .058,(vAthleteRest.y-1.235)/ .070);
        marking=max(marking,athleteCrest*shirt*front*athleteCrestMask(crestUV));
        diffuseColor.rgb=mix(diffuseColor.rgb,athleteTrim,clamp(marking,0.0,1.0));
        float glove=athleteGloves*step(.5,vAthleteGlove);
        diffuseColor.rgb=mix(diffuseColor.rgb,athleteSecondary,glove);
        float cuff=glove*step(.768,vAthleteRest.y);
        diffuseColor.rgb=mix(diffuseColor.rgb,athleteTrim,cuff);
      `);
    };
    material.customProgramCacheKey = () => 'athlete-body-v2-masks-1';
    mesh.material = material;
    mesh.frustumCulled = false;
    owned.push({mesh, geometry, material, uniforms});
  });
  if (!owned.length) throw Error('A v2 skinned athlete scene is required');

  function update(next = {}) {
    if ('number' in next) validateNumber(next.number);
    if (next.colors) state.colors = {...state.colors, ...next.colors};
    Object.assign(state, Object.fromEntries(Object.entries(next).filter(([k]) => k !== 'colors')));
    for (const {mesh, geometry, uniforms} of owned) {
      const color = geometry.attributes.color, region = geometry.attributes._region;
      const palette = REGION_NAMES.map(n => new T.Color(state.colors[n]));
      for (let i=0; i<color.count; i++) {
        const c=palette[Math.round(region.getX(i))];
        if (c) color.setXYZ(i,c.r,c.g,c.b);
      }
      color.needsUpdate = true;
      uniforms.athleteNumber.value=state.number;
      uniforms.athleteNumbers.value=state.numbers ? 1 : 0;
      uniforms.athleteCrest.value=state.crest ? 1 : 0;
      uniforms.athleteGloves.value=state.gloves ? 1 : 0;
      uniforms.athleteTrim.value.set(state.colors.uniform_trim);
      uniforms.athleteSecondary.value.set(state.colors.uniform_secondary);
      if (mesh.morphTargetInfluences) {
        for (const sport of ['basketball','hockey','tennis']) {
          const i=mesh.morphTargetDictionary[sport];
          if (i!==undefined) mesh.morphTargetInfluences[i]=state.sport===sport ? 1 : 0;
        }
        const i=mesh.morphTargetDictionary.goalkeeper_gloves;
        if (i!==undefined) mesh.morphTargetInfluences[i]=state.gloves ? 1 : 0;
      }
    }
  }
  update();
  return {root, update, get state(){return {...state,colors:{...state.colors}};},
    dispose(){for(const {geometry,material} of owned){geometry.dispose();material.dispose();}}};
}
