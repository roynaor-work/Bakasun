import * as THREE from './vendor/three.module.js';
/** Geometry factories shared by the runtime and the independent Node budget. */
export function createBallGeometry(){return new THREE.SphereGeometry(.121,16,8);}
export function createScoreSurfaces(material,shotMaterial) {
  const group=new THREE.Group();group.name='live-score-surfaces';
  function plane(w,h,mat,name,p,ry=0){const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),mat);m.name=name;m.position.set(...p);m.rotation.y=ry;group.add(m);}
  for(const side of [-1,1]) {
    plane(4.48,2.12,material,'video-face-long',[0,10.7,side*1.331],side<0?Math.PI:0);
    plane(2.48,2.12,material,'video-face-end',[side*2.331,10.7,0],side*Math.PI/2);
    for(const face of [-1,1])plane(.61,.36,shotMaterial,'shot-clock',[side*13.2+face*.116,4.24,0],face*Math.PI/2);
  }
  return group;
}
