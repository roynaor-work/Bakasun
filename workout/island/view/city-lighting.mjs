import * as T from '../vendor/three.module.js';

/** Bake the coastal sky once. Authored GLB materials remain untouched: metals
 * and glass receive the same image-based illumination as the building kit. */
export function cityLighting(renderer,scene){
  const sky=new T.Scene(),geometry=new T.SphereGeometry(30,24,16);
  const material=new T.ShaderMaterial({side:T.BackSide,vertexShader:`
    varying vec3 direction;
    void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}
  `,fragmentShader:`
    varying vec3 direction;
    void main(){
      vec3 n=normalize(direction);
      vec3 horizon=vec3(.76,.85,.84),zenith=vec3(.31,.53,.69),ground=vec3(.24,.31,.22);
      vec3 color=n.y>0.?mix(horizon,zenith,pow(n.y,.6)):mix(horizon,ground,pow(-n.y,.45));
      float sun=pow(max(0.,dot(n,normalize(vec3(-17.,30.,15.)))),96.);
      color+=vec3(1.,.82,.55)*sun*1.1;
      gl_FragColor=vec4(color*.24,1.);
    }
  `});
  sky.add(new T.Mesh(geometry,material));
  let generator,target;
  try {generator=new T.PMREMGenerator(renderer);target=generator.fromScene(sky,.04,.1,80);scene.environment=target.texture;}
  catch {target?.dispose();target=null;}
  finally {generator?.dispose();geometry.dispose();material.dispose();}
  let disposed=false;
  return {dispose(){if(disposed)return;disposed=true;if(scene.environment===target?.texture)scene.environment=null;target?.dispose();}};
}
