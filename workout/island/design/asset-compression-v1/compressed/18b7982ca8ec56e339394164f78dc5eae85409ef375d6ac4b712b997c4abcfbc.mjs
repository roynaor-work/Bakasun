import * as T from '../vendor/three.module.js';

/** One full-screen, depth-free sky. Nothing in the scenery can occlude a ship. */
export function alienEnvironment(scene){
 const uniforms={time:{value:0},aspect:{value:2}};
 const geometry=new T.PlaneGeometry(2,2),material=new T.ShaderMaterial({depthTest:false,depthWrite:false,uniforms,
 vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,1.,1.);}',
 fragmentShader:`precision highp float;
 varying vec2 vUv;uniform float time;uniform float aspect;
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
 float fbm(vec2 p){float n=0.,a=.5;for(int i=0;i<5;i++){n+=a*noise(p);p=mat2(1.6,-1.2,1.2,1.6)*p+3.7;a*=.5;}return n;}
 void main(){
  vec2 uv=vUv,p=(uv-.5)*vec2(aspect,1.);float t=time*.003;
  float cloud=fbm(p*3.+vec2(t,0.));float vein=fbm(p*8.+cloud*3.);
  float band=exp(-pow((p.y-p.x*.23+.03)*3.5,2.));
  vec3 col=vec3(.009,.019,.039);
  col+=vec3(.03,.14,.19)*band*pow(cloud,1.7)*2.2;
  col+=vec3(.26,.075,.33)*pow(max(0.,vein-.28),2.)*band*2.4;
  col+=vec3(.03,.19,.25)*pow(max(0.,cloud-.4),2.)*7.;
  col*=.83+.17*fbm(p*24.+vein);
  for(int i=0;i<2;i++){float grid=i==0?190.:340.;vec2 q=uv*vec2(aspect,1.)*grid;vec2 cell=floor(q);vec2 f=fract(q)-.5;float h=hash(cell+float(i)*29.);float star=pow(max(0.,1.-length(f)*3.),8.);col+=mix(vec3(.4,.65,1.),vec3(1.,.77,.53),h)*star*step(.983,h)*(i==0?.7:.3);}
  // A moon at the edge of the field. Analytic lighting, terrain and atmosphere.
  vec2 d=(uv-vec2(.025,.27))*vec2(aspect,1.);float radius=.255,dist=length(d);
  if(dist<radius){vec3 n=vec3(d/radius,sqrt(max(0.,1.-dist*dist/(radius*radius))));float terrain=fbm(n.xy*9.+n.z*2.);float lit=max(0.,dot(n,normalize(vec3(.55,.6,.3))));vec3 land=mix(vec3(.022,.042,.065),vec3(.15,.23,.25),terrain);float crater=pow(noise(n.xy*47.),4.);land*=.8+crater*.3;float rim=pow(1.-n.z,4.);col=land*(.18+lit*.9)+vec3(.06,.28,.37)*rim*.6;}
  col+=vec3(.055,.24,.32)*exp(-abs(dist-radius)*180.)*.22;
  float vignette=1.-.28*pow(length((uv-.5)*1.3),1.5);gl_FragColor=vec4(col*vignette,1.);
 }`});
 const sky=new T.Mesh(geometry,material);sky.frustumCulled=false;sky.renderOrder=-100;scene.add(sky);
 const hemi=new T.HemisphereLight('#c5e4ff','#13172c',1.1),key=new T.DirectionalLight('#ffe7ce',2.1),rim=new T.DirectionalLight('#5bc6ff',2.8),fill=new T.DirectionalLight('#b7a1ff',.7);
 key.position.set(-12,22,8);rim.position.set(8,10,-18);fill.position.set(20,5,12);scene.add(hemi,key,rim,fill);
 return {update(t,aspect){uniforms.time.value=t;uniforms.aspect.value=aspect;},dispose(){for(const o of [sky,hemi,key,rim,fill])o.removeFromParent();geometry.dispose();material.dispose();}};
}
