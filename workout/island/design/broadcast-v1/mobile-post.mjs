import * as T from '../../vendor/three.module.js';

const vertex = `varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
const bloomFragment = `
uniform sampler2D source; uniform vec2 texel; uniform float threshold; uniform float knee;
varying vec2 vUv;
vec3 bright(vec2 uv){vec3 c=texture2D(source,uv).rgb;float l=max(c.r,max(c.g,c.b));return c*smoothstep(threshold-knee,threshold+knee,l);}
void main(){vec3 c=bright(vUv)*.28;c+=bright(vUv+texel*vec2(1.,1.))*.18;c+=bright(vUv+texel*vec2(-1.,1.))*.18;c+=bright(vUv+texel*vec2(1.,-1.))*.18;c+=bright(vUv-texel)*.18;gl_FragColor=vec4(c,1.);}`;
const fragment = `
uniform sampler2D source; uniform sampler2D depthMap; uniform sampler2D bloomMap;
uniform vec2 texel; uniform vec2 motion; uniform vec2 viewport; uniform float nearPlane; uniform float farPlane;
uniform float focus; uniform float focusRange; uniform float dofRadius; uniform float vignette;
uniform float bloomStrength; uniform float bloomRadius; uniform float exposure; uniform float contrast; uniform float saturation; uniform float warmth;
uniform float depthEnabled; uniform float bloomEnabled; uniform float motionEnabled; uniform float fxEnabled;
uniform float aaEnabled;
uniform float depthGuard; uniform float innerRadius;
varying vec2 vUv;
float zAt(vec2 uv){float d=texture2D(depthMap,uv).x;return nearPlane*farPlane/(farPlane-d*(farPlane-nearPlane));}
vec3 guarded(vec2 uv,float z,vec3 centre){float z2=zAt(uv);return mix(centre,texture2D(source,uv).rgb,1.-smoothstep(depthGuard*.5,depthGuard,abs(z2-z)));}
vec3 antialias(vec3 centre){
  vec3 nw=texture2D(source,vUv+texel*vec2(-1.,1.)).rgb,ne=texture2D(source,vUv+texel).rgb;
  vec3 sw=texture2D(source,vUv-texel).rgb,se=texture2D(source,vUv+texel*vec2(1.,-1.)).rgb;
  vec3 luma=vec3(.299,.587,.114);float a=dot(nw,luma),b=dot(ne,luma),c=dot(sw,luma),d=dot(se,luma),m=dot(centre,luma);
  float lo=min(m,min(min(a,b),min(c,d))),hi=max(m,max(max(a,b),max(c,d)));
  if(hi-lo<max(.035,hi*.12))return centre;
  vec2 direction=vec2(-((a+b)-(c+d)),(a+c)-(b+d));float reduce=max((a+b+c+d)*.03125,.0078125);
  direction=clamp(direction/(min(abs(direction.x),abs(direction.y))+reduce),vec2(-4.),vec2(4.))*texel;
  vec3 p=.5*(texture2D(source,vUv+direction*(-1./6.)).rgb+texture2D(source,vUv+direction*(1./6.)).rgb);
  vec3 q=p*.5+.25*(texture2D(source,vUv-direction*.5).rgb+texture2D(source,vUv+direction*.5).rgb);
  float ql=dot(q,luma);return ql<lo||ql>hi?p:q;
}
void main(){
  vec3 c=texture2D(source,vUv).rgb;
  if(aaEnabled>.5)c=antialias(c);
  if(fxEnabled>.5){
    if(depthEnabled>.5 && dofRadius>0.){
      float z=zAt(vUv);float coc=smoothstep(focusRange*.45,focusRange,abs(z-focus))*dofRadius;
      vec2 r=texel*coc;vec3 base=c;
      c=(base*2.+guarded(vUv+vec2(r.x,0.),z,base)+guarded(vUv-vec2(r.x,0.),z,base)+guarded(vUv+vec2(0.,r.y),z,base)+guarded(vUv-vec2(0.,r.y),z,base))/6.;
    }
    if(motionEnabled>.5){c=c*.72+texture2D(source,vUv+motion).rgb*.14+texture2D(source,vUv-motion).rgb*.14;}
    if(bloomEnabled>.5){vec2 r=texel*bloomRadius;vec3 b=texture2D(bloomMap,vUv).rgb*.4;b+=texture2D(bloomMap,vUv+vec2(r.x,0.)).rgb*.15;b+=texture2D(bloomMap,vUv-vec2(r.x,0.)).rgb*.15;b+=texture2D(bloomMap,vUv+vec2(0.,r.y)).rgb*.15;b+=texture2D(bloomMap,vUv-vec2(0.,r.y)).rgb*.15;c+=b*bloomStrength;}
    c*=exposure;float l=dot(c,vec3(.2126,.7152,.0722));c=mix(vec3(l),c,saturation);
    c*=vec3(1.+warmth,1.,1.-warmth);c=max(vec3(0.),(c-.18)*contrast+.18);
    // Aspect-correct radius in screen space; never blur or darken the HTML HUD.
    vec2 p=(vUv-.5)*vec2(viewport.x/viewport.y,1.);float radius=length(p)/length(vec2(viewport.x/viewport.y*.5,.5));
    c*=1.-smoothstep(innerRadius,1.,radius)*vignette;
  }
  gl_FragColor=vec4(c,1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** One LDR scene target, optional quarter target and one fused composite.
 * No EffectComposer, SSAO, SSR, full-resolution ping-pong, or frame history.
 */
export class MobilePost {
  constructor(renderer, config) {
    this.renderer = renderer; this.config = config; this.enabled = true;
    this.depthSupported = renderer.capabilities.isWebGL2 || !!renderer.extensions.get('WEBGL_depth_texture');
    this.target = new T.WebGLRenderTarget(1, 1, {depthBuffer: true, stencilBuffer: false, type: T.UnsignedByteType, minFilter: T.LinearFilter, magFilter: T.LinearFilter});
    this.target.texture.colorSpace = T.LinearSRGBColorSpace;
    if (this.depthSupported) this.target.depthTexture = new T.DepthTexture(1, 1, T.UnsignedShortType);
    this.bloom = new T.WebGLRenderTarget(1, 1, {depthBuffer: false, stencilBuffer: false, type: T.UnsignedByteType});
    this.bloom.texture.colorSpace = T.LinearSRGBColorSpace;
    const effects = config.effects;
    this.bloomMaterial = new T.ShaderMaterial({vertexShader: vertex, fragmentShader: bloomFragment, depthTest: false, depthWrite: false, toneMapped: false,
      uniforms: {source: {value: this.target.texture}, texel: {value: new T.Vector2()}, threshold: {value: effects.bloom.threshold}, knee: {value: effects.bloom.softKnee}}});
    const u = this.uniforms = {source: {value: this.target.texture}, depthMap: {value: this.target.depthTexture || this.target.texture}, bloomMap: {value: this.bloom.texture},
      texel: {value: new T.Vector2()}, viewport: {value: new T.Vector2(1, 1)}, motion: {value: new T.Vector2()},
      nearPlane: {value: .12}, farPlane: {value: 240}, focus: {value: 30}, focusRange: {value: 20}, dofRadius: {value: 0},
      vignette: {value: effects.vignette.strength}, innerRadius: {value: effects.vignette.innerRadius}, depthGuard: {value: effects.simulatedDof.depthEdgeGuardMetres},
      bloomStrength: {value: effects.bloom.strength}, bloomRadius: {value: effects.bloom.radiusQuarterPixels * 4}, exposure: {value: 1}, contrast: {value: 1}, saturation: {value: 1}, warmth: {value: 0},
      depthEnabled: {value: 0}, bloomEnabled: {value: 0}, motionEnabled: {value: 0}, fxEnabled: {value: 1}, aaEnabled: {value: 0}};
    this.material = new T.ShaderMaterial({vertexShader: vertex, fragmentShader: fragment, uniforms: u, depthTest: false, depthWrite: false});
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    geometry.setAttribute('uv', new T.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.quad = new T.Mesh(geometry, this.material); this.scene = new T.Scene(); this.scene.add(this.quad); this.camera = new T.Camera();
  }
  resize(width, height, pixelRatio) {
    this.width = Math.max(1, Math.round(width * pixelRatio)); this.height = Math.max(1, Math.round(height * pixelRatio)); this.pixelRatio = pixelRatio;
    this.target.setSize(this.width, this.height); this.bloom.setSize(Math.max(1, Math.ceil(this.width / 4)), Math.max(1, Math.ceil(this.height / 4)));
    this.uniforms.texel.value.set(1 / this.width, 1 / this.height); this.uniforms.viewport.value.set(width, height);
    this.bloomMaterial.uniforms.texel.value.set(2 / this.width, 2 / this.height);
  }
  render(scene, camera, rig, tier, reducedMotion) {
    const u = this.uniforms, fx = this.config.effects;
    const grade = fx.colorGrade[rig.sport];
    for (const key of ['exposure', 'contrast', 'saturation', 'warmth']) u[key].value = grade[key];
    u.nearPlane.value = camera.near; u.farPlane.value = camera.far;
    u.focus.value = rig.focusDistance; u.focusRange.value = rig.preset.focusRangeMetres;
    u.dofRadius.value = tier.dof ? fx.simulatedDof.maxRadiusCssPixels * this.pixelRatio * rig.preset.dofMultiplier : 0;
    u.depthEnabled.value = tier.dof && this.depthSupported ? 1 : 0; u.bloomEnabled.value = tier.bloom ? 1 : 0;
    u.aaEnabled.value = tier.antialias ? 1 : 0;
    u.motionEnabled.value = tier.motionBlur && !reducedMotion ? 1 : 0; u.fxEnabled.value = this.enabled ? 1 : 0;
    const max = fx.motionBlur.maxRadiusCssPixels;
    u.motion.value.copy(rig.motion).multiplyScalar(rig.preset.motionMultiplier);
    const pixels = new T.Vector2(u.motion.value.x * this.width, u.motion.value.y * this.height);
    if (pixels.length() > max * this.pixelRatio) pixels.setLength(max * this.pixelRatio);
    u.motion.value.set(pixels.x / this.width, pixels.y / this.height);
    const renderer = this.renderer;
    renderer.setRenderTarget(this.target); renderer.render(scene, camera);
    if (tier.bloom && this.enabled) {this.quad.material = this.bloomMaterial; renderer.setRenderTarget(this.bloom); renderer.render(this.scene, this.camera);}
    this.quad.material = this.material; renderer.setRenderTarget(null); renderer.render(this.scene, this.camera);
  }
  memoryBytes() { return this.width * this.height * 6 + Math.ceil(this.width / 4) * Math.ceil(this.height / 4) * 4; }
  dispose() { this.target.dispose(); this.bloom.dispose(); this.material.dispose(); this.bloomMaterial.dispose(); this.quad.geometry.dispose(); }
}
