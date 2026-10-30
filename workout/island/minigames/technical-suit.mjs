import * as T from '../vendor/three.module.js';

// Authored sport outerwear follows the existing rig in root space. No gameplay state changes.
export function createTechnicalSuit(root,{hips,neck,arms},{mesh,mat},color){
 const coral=new T.Color(color||'#d56846'),cream=new T.Color('#ded8c1'),ink=new T.Color('#223943');
 const weave=new Uint8Array(128*128*4);for(let y=0;y<128;y++)for(let x=0;x<128;x++){const i=(y*128+x)*4,n=((x*73856093^y*19349663)>>>0)%17-8,val=128+n+(x%3===0?6:0)-(y%3===0?5:0);weave[i]=weave[i+1]=weave[i+2]=val;weave[i+3]=255;}
 const weaveTex=new T.DataTexture(weave,128,128,T.RGBAFormat);weaveTex.wrapS=weaveTex.wrapT=T.RepeatWrapping;weaveTex.repeat.set(7,9);weaveTex.magFilter=T.LinearFilter;weaveTex.minFilter=T.LinearMipmapLinearFilter;weaveTex.generateMipmaps=true;weaveTex.anisotropy=4;weaveTex.needsUpdate=true;
 const fabric=mat('#ffffff',{vertexColors:true,roughness:.86,metalness:0,bumpMap:weaveTex,bumpScale:.0015});
 const detail=mat('#233943',{roughness:.82}),hardware=mat('#b7bdb5',{metalness:.6,roughness:.35});
 function geometry(rows,radial){const p=new Float32Array((rows+1)*(radial+1)*3),c=new Float32Array(p.length),uv=[],ix=[];for(let j=0;j<=rows;j++)for(let i=0;i<=radial;i++)uv.push(i/radial,j/rows);for(let j=0;j<rows;j++)for(let i=0;i<radial;i++){const a=j*(radial+1)+i,b=a+radial+1;ix.push(a,a+1,b,a+1,b+1,b);}const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(p,3).setUsage(T.DynamicDrawUsage));g.setAttribute('color',new T.BufferAttribute(c,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(ix);return g;}
 const rings=[[0,.173,.235],[.055,.197,.26],[.18,.204,.275],[.36,.209,.282],[.57,.196,.28],[.77,.178,.255],[.91,.145,.20],[1,.105,.125]],R=24;
 const torsoGeo=geometry(rings.length-1,R);for(let i=0;i<torsoGeo.index.count;i+=3){const a=torsoGeo.index.getX(i+1);torsoGeo.index.setX(i+1,torsoGeo.index.getX(i+2));torsoGeo.index.setX(i+2,a);}const coat=mesh(torsoGeo,fabric,root);coat.frustumCulled=false;
 // Geometry topology, colour blocks, folds and sleeve radii are static. Prepare
 // them once; only positions/normals need uploading when the rig actually moves.
 const torsoOffsets=new Float32Array(torsoGeo.attributes.position.array.length);
 for(let j=0;j<rings.length;j++){const [t,rx,rz]=rings[j],col=j===0?ink:t>.77?cream:coral;for(let i=0;i<=R;i++){const a=i/R*Math.PI*2,fold=Math.sin(a*5+t*13)*.0035+Math.sin(a*9-t*8)*.002,index=j*(R+1)+i;torsoOffsets[index*3]=Math.cos(a)*(rx+fold)-Math.sin(t*Math.PI)*.015;torsoOffsets[index*3+1]=Math.sin(a*3+t*17)*.002;torsoOffsets[index*3+2]=Math.sin(a)*(rz+fold);torsoGeo.attributes.color.setXYZ(index,col.r,col.g,col.b);}}
 const sleeveOffsets=[];for(let j=0;j<=12;j++){const t=j/12;let radius=.113*(1-t)+.070*t;radius+=Math.sin(t*Math.PI)*.013;if(t>.88)radius*=.94;const row=[];for(let i=0;i<=12;i++){const a=i/12*Math.PI*2,wrinkle=1+Math.sin(t*30+a*3)*.027;row.push([Math.cos(a)*radius*wrinkle,Math.sin(a)*radius*wrinkle]);}sleeveOffsets.push({t,row});}
 const sleeves=[];for(const side of ['L','R']){const g=geometry(12,12),m=mesh(g,fabric,root);m.frustumCulled=false;for(let j=0;j<=12;j++){const t=j/12,col=t>.91?ink:t<.23?cream:coral;for(let i=0;i<=12;i++)g.attributes.color.setXYZ(j*13+i,col.r,col.g,col.b);}sleeves.push({side,g});}
 const hood=mesh(new T.TorusGeometry(.125,.047,10,28),fabric,root);hood.geometry.deleteAttribute('color');hood.material=mat(coral,{roughness:.94});hood.rotation.x=Math.PI/2;hood.scale.set(.85,1.1,.8);
 const collar=mesh(new T.TorusGeometry(.107,.025,8,28),detail,root);collar.rotation.x=Math.PI/2;collar.scale.set(.88,1,1);
 const zipGeo=new T.BufferGeometry().setFromPoints([new T.Vector3(),new T.Vector3(),new T.Vector3()]);const zipper=new T.Line(zipGeo,new T.LineBasicMaterial({color:'#273b42'}));root.add(zipper);
 const pull=mesh(new T.BoxGeometry(.012,.034,.024),hardware,root);
 const rootInverse=new T.Matrix4(),bones=[hips,neck,...arms.L,...arms.R],points=bones.map(()=>new T.Vector3()),previous=new Float64Array(bones.length*3).fill(NaN);
 const bottom=new T.Vector3(),top=new T.Vector3(),center=new T.Vector3(),ctrl=new T.Vector3(),tangent=new T.Vector3(),v=new T.Vector3(),up=new T.Vector3(0,1,0),binormal=new T.Vector3(),normal=new T.Vector3();
 function finish(g){g.attributes.position.needsUpdate=true;g.computeVertexNormals();}
 function update(){
  root.updateMatrixWorld(true);rootInverse.copy(root.matrixWorld).invert();let changed=false;
  for(let i=0;i<bones.length;i++){const p=points[i].setFromMatrixPosition(bones[i].matrixWorld).applyMatrix4(rootInverse),offset=i*3;for(let c=0;c<3;c++){const value=c===0?p.x:c===1?p.y:p.z;if(!Number.isFinite(previous[offset+c])||Math.abs(value-previous[offset+c])>1e-9)changed=true;previous[offset+c]=value;}}
  if(!changed)return;
  const [H,N]=points;bottom.copy(H);bottom.x-=.01;bottom.y-=.075;top.copy(N);top.x+=.025;top.y-=.018;
  for(let j=0;j<rings.length;j++){const t=rings[j][0];center.copy(bottom).lerp(top,t);for(let i=0;i<=R;i++){const index=j*(R+1)+i,off=index*3;torsoGeo.attributes.position.setXYZ(index,center.x+torsoOffsets[off],center.y+torsoOffsets[off+1],center.z+torsoOffsets[off+2]);}}
  finish(torsoGeo);
  for(let sideIndex=0;sideIndex<sleeves.length;sideIndex++){const {g}=sleeves[sideIndex],offset=2+sideIndex*3,A=points[offset],B=points[offset+1],D=points[offset+2];ctrl.copy(B).multiplyScalar(2).addScaledVector(A,-.5).addScaledVector(D,-.5);
   for(let j=0;j<=12;j++){const {t,row}=sleeveOffsets[j];center.copy(A).multiplyScalar((1-t)**2).addScaledVector(ctrl,2*(1-t)*t).addScaledVector(D,t*t);tangent.copy(ctrl).sub(A).multiplyScalar(2*(1-t));v.copy(D).sub(ctrl);tangent.addScaledVector(v,2*t).normalize();binormal.crossVectors(tangent,up).normalize();if(binormal.lengthSq()<.1)binormal.set(0,0,1);normal.crossVectors(binormal,tangent).normalize();
    for(let i=0;i<=12;i++){v.copy(center).addScaledVector(normal,row[i][0]).addScaledVector(binormal,row[i][1]);g.attributes.position.setXYZ(j*13+i,v.x,v.y,v.z);}}
   finish(g);
  }
  hood.position.copy(N);hood.position.x-=.045;hood.position.y-=.055;collar.position.copy(N);collar.position.x+=.017;collar.position.y-=.002;
  const p=zipGeo.attributes.position;for(let j=0;j<3;j++){const t=.15+j*.38;center.copy(bottom).lerp(top,t);p.setXYZ(j,center.x+.205-(t>.7?(t-.7)*.22:0),center.y,center.z);}p.needsUpdate=true;pull.position.set(p.getX(2)+.004,p.getY(2)-.04,p.getZ(2));
 }
 update();return {update};
}
