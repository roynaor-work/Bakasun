// Original source for the baked 384×512 linear CubeUV environment.
import * as THREE from '../runtime/vendor/three.module.js';
export function createCeilingCube() {
  const faces=[];
  for(let face=0;face<6;face++) {
    const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d');
    x.fillStyle=face===2?'#2c3038':face===3?'#191b1d':'#111a27';x.fillRect(0,0,128,128);
    if(face!==3) {
      const row=face===2?[24,92]:[13];
      for(const y of row)for(const sx of [14,46,78,110]) {
        const glow=x.createRadialGradient(sx,y,0,sx,y,17);glow.addColorStop(0,'rgba(255,235,201,.45)');glow.addColorStop(1,'rgba(255,235,201,0)');x.fillStyle=glow;x.fillRect(sx-17,y-17,34,34);
        x.fillStyle='#fff2ce';x.fillRect(sx-10,y-2,20,4);
      }
      if(face!==2){x.fillStyle='#2b615f';x.fillRect(0,72,128,3);}
    }
    faces.push(c);
  }
  const env=new THREE.CubeTexture(faces);env.colorSpace=THREE.SRGBColorSpace;env.needsUpdate=true;return env;
}
