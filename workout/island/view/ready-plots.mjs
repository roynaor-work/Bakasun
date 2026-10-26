import * as T from '../vendor/three.module.js';

/** Persistent vacant-lot ink: two instance batches and one label atlas. Names
 * arrive translated from the UI. Zoomed-out labels use compact icon/number tags;
 * names appear once a plot has enough screen space, avoiding a wall of text. */
export class ReadyPlotsView{
  constructor(scene,ground,{capacity=128,canvas}={}){
    this.ground=ground;this.capacity=capacity;this.rows=[];this.disposed=false;
    this.geometry=new T.PlaneGeometry(1,1);
    this.fillMaterial=new T.MeshBasicMaterial({transparent:true,opacity:.12,depthWrite:false,side:T.DoubleSide,toneMapped:false});
    this.borderMaterial=new T.MeshBasicMaterial({transparent:true,opacity:.88,depthWrite:false,side:T.DoubleSide,toneMapped:false});
    this.fill=new T.InstancedMesh(this.geometry,this.fillMaterial,capacity);this.border=new T.InstancedMesh(this.geometry,this.borderMaterial,capacity*4);
    for(const mesh of [this.fill,this.border]){mesh.count=0;mesh.frustumCulled=false;mesh.renderOrder=2;scene.add(mesh);}
    this.canvas=canvas||document.createElement('canvas');this.canvas.width=1152;this.canvas.height=Math.ceil(capacity/8)*64;
    this.texture=new T.CanvasTexture(this.canvas);this.texture.colorSpace=T.SRGBColorSpace;this.texture.generateMipmaps=false;this.texture.minFilter=T.LinearFilter;
    const positions=[],centers=[],extents=[],visibility=[],uvFull=[],uvCompact=[],indices=[];
    for(let i=0;i<capacity;i++){
      const x=i%8*144,y=Math.floor(i/8)*64;
      for(const [px,py]of [[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]]){positions.push(px,py,0);centers.push(0,0,0);extents.push(1);visibility.push(1);uvFull.push((x+(px+.5)*144)/this.canvas.width,1-(y+(.5-py)*36)/this.canvas.height);uvCompact.push((x+(px+.5)*32)/this.canvas.width,1-(y+40+(.5-py)*24)/this.canvas.height);}
      const n=i*4;indices.push(n,n+1,n+2,n,n+2,n+3);
    }
    this.labelGeometry=new T.BufferGeometry();for(const [name,values,n]of [['position',positions,3],['center',centers,3],['extent',extents,1],['labelVisible',visibility,1],['uvFull',uvFull,2],['uvCompact',uvCompact,2]])this.labelGeometry.setAttribute(name,new T.Float32BufferAttribute(values,n));this.labelGeometry.setIndex(indices);this.labelGeometry.setDrawRange(0,0);
    this.labelMaterial=new T.ShaderMaterial({uniforms:{map:{value:this.texture},viewport:{value:new T.Vector2(1,1)}},transparent:true,depthTest:false,depthWrite:false,toneMapped:false,
      vertexShader:'attribute vec3 center;attribute float extent;attribute float labelVisible;attribute vec2 uvFull;attribute vec2 uvCompact;uniform vec2 viewport;varying vec2 vUv;void main(){vec4 p=projectionMatrix*modelViewMatrix*vec4(center,1.);float pixels=min(viewport.x*projectionMatrix[0][0],viewport.y*projectionMatrix[1][1])*extent*.5;float compact=1.-step(58.,pixels);vUv=mix(uvFull,uvCompact,compact);vec2 size=mix(vec2(104.,26.),vec2(32.,24.),compact);p.xy+=position.xy*size*2./viewport*p.w;gl_Position=labelVisible>.5?p:vec4(2.,2.,2.,1.);}',
      fragmentShader:'uniform sampler2D map;varying vec2 vUv;void main(){gl_FragColor=texture2D(map,vUv);if(gl_FragColor.a<.02)discard;\n#include <colorspace_fragment>\n}'});
    this.labels=new T.Mesh(this.labelGeometry,this.labelMaterial);this.labels.frustumCulled=false;this.labels.renderOrder=3;scene.add(this.labels);
  }
  resize(w,h){this.labelMaterial.uniforms.viewport.value.set(Math.max(1,w),Math.max(1,h));}
  setSelection(id){if(id===this.selected)return;this.selected=id;this.signature=null;this.show(this.rows,this.size);}
  show(rows=[],size=32){
    if(this.disposed)return;const signature=JSON.stringify([size,rows,this.selected]);if(signature===this.signature)return;this.signature=signature;this.size=size;this.rows=rows.slice(0,this.capacity);
    const context=this.canvas.getContext('2d'),dummy=new T.Object3D(),offset=(size-1)/2;let index=0;this.fill.count=this.rows.length;
    context.clearRect(0,0,this.canvas.width,this.canvas.height);context.textBaseline='middle';context.direction='rtl';
    const mark=(mesh,i,x,z,w,d,color,y)=>{dummy.position.set(x-offset,this.ground+y,z-offset);dummy.rotation.set(-Math.PI/2,0,0);dummy.scale.set(w,d,1);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,new T.Color(color));};
    for(const [i,row]of this.rows.entries()){
      const future=row.status==='locked'||row.status==='planned'||row.reason==='reason.learningOrder',color=this.selected===row.id?'#e3ad45':future?'#909c98':row.color||'#579b7b',x=row.x+(row.w-1)/2,z=row.z+(row.d-1)/2,w=row.w-.14,d=row.d-.14;
      mark(this.fill,i,x,z,w,d,color,.044);
      for(const side of [-1,1]){mark(this.border,index++,x+side*w/2,z,.06,d,color,.048);mark(this.border,index++,x,z+side*d/2,w,.06,color,.048);}
      for(let corner=0;corner<4;corner++){this.labelGeometry.attributes.center.setXYZ(i*4+corner,x-offset,this.ground+.17,z-offset);this.labelGeometry.attributes.extent.setX(i*4+corner,this.selected===row.id?100:Math.min(row.w,row.d));}
      const tx=i%8*144,ty=Math.floor(i/8)*64;context.fillStyle=future?'#e0e3de':'#fcf8e8';context.fillRect(tx+1,ty+1,142,34);context.strokeStyle=color;context.lineWidth=2;context.strokeRect(tx+2,ty+2,140,32);context.fillStyle=future?'#66716d':'#264c45';context.font='bold 16px Arial';context.textAlign='center';context.fillText(`${row.icon||'◇'} ${row.label||row.typeId}`,tx+72,ty+18,136);
      context.fillStyle=future?'#d8ddd8':'#fcf8e8';context.fillRect(tx+1,ty+41,30,22);context.fillStyle=future?'#65706a':'#264c45';context.font='bold 14px Arial';context.fillText(`${row.icon||'◇'} ${row.number}`,tx+16,ty+52,29);
    }
    this.texture.needsUpdate=true;this.border.count=index;this.labelGeometry.setDrawRange(0,this.rows.length*6);this.labelGeometry.attributes.center.needsUpdate=true;this.labelGeometry.attributes.extent.needsUpdate=true;
    for(const mesh of [this.fill,this.border]){mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;}
    if(this.lastCamera)this.update(this.lastCamera,this.lastRect);
  }
  labelBox(row,camera,rect){
    const offset=(this.size-1)/2,p=new T.Vector3(row.x+(row.w-1)/2-offset,this.ground+.17,row.z+(row.d-1)/2-offset).project(camera),extent=this.selected===row.id?100:Math.min(row.w,row.d),full=Math.min(rect.width*camera.projectionMatrix.elements[0],rect.height*camera.projectionMatrix.elements[5])*extent*.5>=58;
    return {x:rect.left+(p.x+1)*rect.width/2,y:rect.top+(1-p.y)*rect.height/2,halfW:full?52:16,halfH:full?13:12,depth:p.z};
  }
  update(camera,rect){
    if(this.disposed)return;this.lastCamera=camera;this.lastRect={left:rect.left,top:rect.top,width:rect.width,height:rect.height};this.visibleIds=new Set();const accepted=[],visibility=this.labelGeometry.attributes.labelVisible;visibility.array.fill(0);
    // Selected guidance wins; otherwise stable saved order and available lots
    // win over future lots. Only badges are culled: every ground outline stays.
    const priority=row=>this.selected===row.id?-1:row.status==='locked'||row.reason==='reason.learningOrder'?1:0;
    const candidates=this.rows.map((row,index)=>({row,index})).sort((a,b)=>priority(a.row)-priority(b.row)||a.row.number-b.row.number);
    for(const {row,index}of candidates){const box=this.labelBox(row,camera,rect);if(box.depth< -1||box.depth>1||box.x+box.halfW<rect.left||box.x-box.halfW>rect.left+rect.width||box.y+box.halfH<rect.top||box.y-box.halfH>rect.top+rect.height)continue;
      if(accepted.some(other=>Math.abs(box.x-other.x)<box.halfW+other.halfW+6&&Math.abs(box.y-other.y)<box.halfH+other.halfH+6))continue;
      accepted.push(box);this.visibleIds.add(row.id);for(let corner=0;corner<4;corner++)visibility.setX(index*4+corner,1);
    }
    visibility.needsUpdate=true;
  }
  pick(clientX,clientY,camera,rect){
    let best=null,distance=Infinity;
    for(const row of this.rows){if(this.visibleIds&&!this.visibleIds.has(row.id))continue;const box=this.labelBox(row,camera,rect),dx=Math.abs(box.x-clientX),dy=Math.abs(box.y-clientY),d=Math.hypot(dx,dy);if(box.depth>=-1&&box.depth<=1&&dx<=box.halfW&&dy<=box.halfH&&d<distance){best=row;distance=d;}}
    return best?{x:best.x,z:best.z,readyPlotId:best.id}:null;
  }
  pickCell(cell){const row=cell&&this.rows.find(row=>cell.x>=row.x&&cell.x<row.x+row.w&&cell.z>=row.z&&cell.z<row.z+row.d);return row?{x:row.x,z:row.z,readyPlotId:row.id}:null;}
  metrics(){return {plots:this.rows.length,labels:this.visibleIds?.size??this.rows.length,draws:3,disposed:this.disposed};}
  dispose(){if(this.disposed)return;this.disposed=true;for(const mesh of [this.fill,this.border]){mesh.removeFromParent();mesh.dispose();}this.labels.removeFromParent();for(const resource of [this.geometry,this.fillMaterial,this.borderMaterial,this.texture,this.labelGeometry,this.labelMaterial])resource.dispose();this.rows=[];}
}
