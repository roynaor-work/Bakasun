import * as THREE from './vendor/three.module.js';
import {createBallGeometry} from './surfaces.mjs';
/** An optional, anonymous ball for checking the basket/replay integration. */
export function createBall() {
  const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d');
  x.fillStyle='#c27a35';x.fillRect(0,0,256,256);
  for(let y=0;y<256;y+=4)for(let i=0;i<256;i+=4){x.fillStyle=(i+y)%12?'#b46b2c':'#d58b42';x.fillRect(i+(y%8?2:0),y,1,1);}
  x.strokeStyle='#33291e';x.lineWidth=4;
  for(const a of [0,64,128,192,256]){x.beginPath();x.moveTo(a,0);x.lineTo(a,256);x.stroke();}
  for(const offset of [0,128]){x.beginPath();for(let i=0;i<=256;i++)x.lineTo(i,128+60*Math.sin(i/256*Math.PI*2+offset));x.stroke();}
  const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;
  const mesh=new THREE.Mesh(createBallGeometry(),new THREE.MeshStandardMaterial({map:texture,roughness:.82}));mesh.name='optional-replay-ball';
  return {mesh,dispose(){mesh.removeFromParent();mesh.geometry.dispose();mesh.material.dispose();texture.dispose();}};
}
