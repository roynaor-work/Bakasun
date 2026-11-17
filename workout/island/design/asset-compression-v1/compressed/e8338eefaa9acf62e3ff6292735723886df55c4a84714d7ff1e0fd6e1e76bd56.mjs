import * as T from '../vendor/three.module.js';

/** Separate planning ink. One atlas keeps every number legible at 22 screen
 * pixels with one draw; two instance batches hold all footprints and borders. */
export class CitySites{
  constructor(scene,ground){
    this.scene=scene;this.ground=ground;this.geometry=new T.PlaneGeometry(1,1);
    this.fillMaterial=new T.MeshBasicMaterial({transparent:true,opacity:.18,depthWrite:false,side:T.DoubleSide,toneMapped:false});
    this.borderMaterial=new T.MeshBasicMaterial({transparent:true,opacity:.9,depthWrite:false,side:T.DoubleSide,toneMapped:false});
    this.fill=new T.InstancedMesh(this.geometry,this.fillMaterial,12);this.border=new T.InstancedMesh(this.geometry,this.borderMaterial,48);
    this.fill.count=this.border.count=0;this.fill.frustumCulled=this.border.frustumCulled=false;this.fill.renderOrder=3;this.border.renderOrder=4;
    const canvas=document.createElement('canvas');canvas.width=12*64;canvas.height=64;const c=canvas.getContext('2d');
    const positions=[],centers=[],uv=[],indices=[];
    for(let i=0;i<12;i++){
      c.fillStyle='#173f49';c.beginPath();c.arc(i*64+32,32,27,0,Math.PI*2);c.fill();c.strokeStyle='#fff9e9';c.lineWidth=3;c.stroke();c.fillStyle='#fff9e9';c.font='bold 32px Arial';c.textAlign='center';c.textBaseline='middle';c.fillText(String(i+1),i*64+32,33);
      for(const [x,y]of [[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]]){positions.push(x,y,0);centers.push(0,0,0);uv.push((i+x+.5)/12,y+.5);}
      const n=i*4;indices.push(n,n+1,n+2,n,n+2,n+3);
    }
    this.texture=new T.CanvasTexture(canvas);this.texture.colorSpace=T.SRGBColorSpace;
    this.labelGeometry=new T.BufferGeometry();this.labelGeometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));this.labelGeometry.setAttribute('center',new T.Float32BufferAttribute(centers,3));this.labelGeometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));this.labelGeometry.setIndex(indices);this.labelGeometry.setDrawRange(0,0);
    this.labelMaterial=new T.ShaderMaterial({uniforms:{map:{value:this.texture},viewport:{value:new T.Vector2(1,1)}},transparent:true,depthTest:false,depthWrite:false,toneMapped:false,
      vertexShader:'attribute vec3 center; uniform vec2 viewport; varying vec2 vUv; void main(){vUv=uv;vec4 p=projectionMatrix*modelViewMatrix*vec4(center,1.0);p.xy+=position.xy*44.0/viewport*p.w;gl_Position=p;}',
      fragmentShader:'uniform sampler2D map; varying vec2 vUv; void main(){gl_FragColor=texture2D(map,vUv);\n#include <colorspace_fragment>\n}'});
    this.labels=new T.Mesh(this.labelGeometry,this.labelMaterial);this.labels.frustumCulled=false;this.labels.renderOrder=5;scene.add(this.fill,this.border,this.labels);this.rows=[];
  }
  resize(width,height){this.labelMaterial.uniforms.viewport.value.set(Math.max(1,width),Math.max(1,height));}
  show(rows=[],size=16){
    const signature=JSON.stringify([size,rows]);if(signature===this.signature)return;this.signature=signature;this.size=size;this.rows=rows.slice(0,12);
    const dummy=new T.Object3D(),offset=(size-1)/2;let borderIndex=0;this.fill.count=this.rows.length;
    const mark=(mesh,index,x,z,w,d,color,y)=>{dummy.position.set(x-offset,this.ground+y,z-offset);dummy.rotation.set(-Math.PI/2,0,0);dummy.scale.set(w,d,1);dummy.updateMatrix();mesh.setMatrixAt(index,dummy.matrix);mesh.setColorAt(index,new T.Color(color));};
    for(const [i,row]of this.rows.entries()){
      const x=row.x+(row.w-1)/2,z=row.z+(row.d-1)/2,w=row.w-.12,d=row.d-.12;
      mark(this.fill,i,x,z,w,d,row.color,.17);
      for(const side of [-1,1]){mark(this.border,borderIndex++,x+side*w/2,z,.045,d,row.color,.18);mark(this.border,borderIndex++,x,z+side*d/2,w,.045,row.color,.18);}
      for(let corner=0;corner<4;corner++)this.labelGeometry.attributes.center.setXYZ(i*4+corner,x-offset,this.ground+.48,z-offset);
    }
    this.labelGeometry.attributes.center.needsUpdate=true;this.labelGeometry.setDrawRange(0,this.rows.length*6);this.border.count=borderIndex;
    for(const mesh of [this.fill,this.border]){mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;}
  }
  pick(clientX,clientY,camera,rect){
    const offset=(this.size-1)/2;let best=null,distance=22;
    for(const row of this.rows){const p=new T.Vector3(row.x+(row.w-1)/2-offset,this.ground+.48,row.z+(row.d-1)/2-offset).project(camera),d=Math.hypot(rect.left+(p.x+1)*rect.width/2-clientX,rect.top+(1-p.y)*rect.height/2-clientY);if(p.z>=-1&&p.z<=1&&d<distance){best=row;distance=d;}}
    return best?{x:best.x,z:best.z}:null;
  }
  dispose(){for(const mesh of [this.fill,this.border]){mesh.removeFromParent();mesh.dispose();}this.labels.removeFromParent();for(const resource of [this.texture,this.labelGeometry,this.labelMaterial,this.geometry,this.fillMaterial,this.borderMaterial])resource.dispose();}
}
