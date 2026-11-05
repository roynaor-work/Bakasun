import * as THREE from '../vendor/three.module.js';

/** Two tiny procedural sky probes, generated once. Never render scene mirrors. */
export function createSkyProbes(renderer){
 const generator=new THREE.PMREMGenerator(renderer),targets=[];
 for(const storm of [false,true]){
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=128;
  const c=canvas.getContext('2d'),gradient=c.createLinearGradient(0,0,0,128);
  for(const [stop,color]of (storm?[[0,'#1e344b'],[.4,'#637989'],[.54,'#8f9c9e'],[.64,'#304b58'],[1,'#132d39']]:[[0,'#274760'],[.38,'#79929c'],[.5,'#e3ba84'],[.57,'#977e63'],[.68,'#244a59'],[1,'#0b2735']]))gradient.addColorStop(stop,color);
  c.fillStyle=gradient;c.fillRect(0,0,256,128);
  if(!storm){const glow=c.createRadialGradient(42,63,1,42,63,25);glow.addColorStop(0,'#fff2ce');glow.addColorStop(.15,'#f5ce90');glow.addColorStop(1,'#d0a06d00');c.fillStyle=glow;c.fillRect(12,37,62,50);}
  const texture=new THREE.CanvasTexture(canvas);texture.mapping=THREE.EquirectangularReflectionMapping;texture.colorSpace=THREE.SRGBColorSpace;
  const target=generator.fromEquirectangular(texture);targets.push(target);texture.dispose();
 }
 generator.dispose();
 return{sunset:targets[0].texture,storm:targets[1].texture,info:targets.map(t=>({width:t.width,height:t.height,format:'RGBA16F',bytes:t.width*t.height*8})),dispose(){targets.forEach(t=>t.dispose());}};
}
