import * as T from '../vendor/three.module.js';

/** A bounded contact-occlusion pass over the unchanged authored materials.
 * Depth is rendered with the city; eight nearby depth taps darken creases and
 * building/ground junctions. Low quality renders directly without this pass. */
export class CityOcclusion{
  constructor(renderer){
    this.renderer=renderer;this.enabled=Boolean(renderer.capabilities.isWebGL2&&renderer.extensions.has('EXT_color_buffer_float'));this.disposed=false;
    if(!this.enabled)return;
    this.target=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType,depthBuffer:true});
    this.target.depthTexture=new T.DepthTexture(1,1,T.UnsignedIntType);
    this.target.samples=Math.min(4,renderer.capabilities.maxSamples||0);
    this.uniforms={cityColor:{value:this.target.texture},cityDepth:{value:this.target.depthTexture},inverseProjection:{value:new T.Matrix4()},radiusUV:{value:new T.Vector2()},radiusWorld:{value:.5},strength:{value:1.15}};
    this.material=new T.ShaderMaterial({uniforms:this.uniforms,depthWrite:false,depthTest:false,vertexShader:`
      varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}
    `,fragmentShader:`
      #include <common>
      uniform sampler2D cityColor;uniform sampler2D cityDepth;
      uniform mat4 inverseProjection;uniform vec2 radiusUV;uniform float radiusWorld;uniform float strength;varying vec2 vUv;
      vec3 pointAt(vec2 uv){float depth=texture2D(cityDepth,clamp(uv,vec2(.001),vec2(.999))).x;vec4 p=inverseProjection*vec4(uv*2.-1.,depth*2.-1.,1.);return p.xyz/p.w;}
      float occluder(vec2 offset,vec3 point,vec3 normal){
        vec3 delta=pointAt(vUv+offset*radiusUV)-point;float distance=length(delta);
        float falloff=1.-smoothstep(radiusWorld*.1,radiusWorld*1.65,distance);
        return max(dot(normal,delta/max(distance,.001))-.035,0.)*falloff;
      }
      void main(){
        vec3 point=pointAt(vUv),normal=normalize(cross(dFdx(point),dFdy(point)));
        float ao=occluder(vec2(1.,0.),point,normal)+occluder(vec2(-1.,0.),point,normal)+occluder(vec2(0.,1.),point,normal)+occluder(vec2(0.,-1.),point,normal);
        ao+=occluder(vec2(.5,.5),point,normal)+occluder(vec2(-.5,.5),point,normal)+occluder(vec2(.5,-.5),point,normal)+occluder(vec2(-.5,-.5),point,normal);
        vec3 color=texture2D(cityColor,vUv).rgb;float attenuation=1.-strength*min(.35,ao*.275);
        gl_FragColor=vec4(color*attenuation,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `});
    this.geometry=new T.PlaneGeometry(2,2);this.quad=new T.Mesh(this.geometry,this.material);this.quad.frustumCulled=false;
    this.scene=new T.Scene();this.scene.add(this.quad);this.camera=new T.Camera();this.bufferSize=new T.Vector2();
  }
  render(scene,camera,quality='high'){
    this.active=false;
    if(this.disposed||!this.enabled||quality==='low')return false;
    const renderer=this.renderer;renderer.getDrawingBufferSize(this.bufferSize);
    const scale=Math.min(1,1440/Math.max(this.bufferSize.x,this.bufferSize.y)),w=Math.max(1,Math.round(this.bufferSize.x*scale)),h=Math.max(1,Math.round(this.bufferSize.y*scale));
    if(this.target.width!==w||this.target.height!==h)this.target.setSize(w,h);
    this.uniforms.inverseProjection.value.copy(camera.projectionMatrixInverse);
    this.uniforms.radiusUV.value.set(.5/(camera.right-camera.left),.5/(camera.top-camera.bottom));
    const previous=renderer.getRenderTarget(),reset=renderer.info.autoReset;
    try{renderer.setRenderTarget(this.target);renderer.render(scene,camera);renderer.setRenderTarget(previous);renderer.info.autoReset=false;renderer.render(this.scene,this.camera);}
    finally{renderer.setRenderTarget(previous);renderer.info.autoReset=reset;}
    this.active=true;return true;
  }
  metrics(){return {enabled:this.enabled&&!this.disposed,active:Boolean(this.active),extraPasses:this.active?1:0,maxDimension:1440};}
  dispose(){if(this.disposed)return;this.disposed=true;this.active=false;const depth=this.target?.depthTexture;if(this.target)this.target.depthTexture=null;this.target?.dispose();depth?.dispose();this.geometry?.dispose();this.material?.dispose();}
}
