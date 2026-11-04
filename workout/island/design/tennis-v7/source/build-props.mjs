import fs from 'node:fs/promises';
import {root,THREE as T,Document,primitive,save,writeJSON} from './common.mjs';
const records=[];
{
 const doc=new Document();doc.createBuffer();const scene=doc.createScene('Tennis net / regulation profile');
 const meshMat=doc.createMaterial('Woven net / actual 1.8mm cords').setBaseColorFactor([.045,.066,.045,1]).setDoubleSided(true).setRoughnessFactor(.94);
 const iv=doc.createMaterial('Net ivory tape').setBaseColorFactor([...new T.Color('#EEE8CF').toArray(),1]).setRoughnessFactor(.82);
 const post=doc.createMaterial('Net green posts').setBaseColorFactor([...new T.Color('#2A4C43').toArray(),1]).setRoughnessFactor(.65);
 const top=x=>.914+.156*(x/6.4)**2;
 const p=[],ii=[];
 const quad=(a,b,c,d)=>{const i=p.length/3;p.push(...a,...b,...c,...d);ii.push(i,i+1,i+2,i,i+2,i+3);};
 for(let i=0;i<=284;i++){
  const x=-6.39+i/284*12.78;quad([x-.0009,.035,0],[x+.0009,.035,0],[x+.0009,top(x)-.035,0],[x-.0009,top(x)-.035,0]);
 }
 for(let row=1;row<=19;row++)for(let c=0;c<32;c++){
  const x=-6.4+c/32*12.8,x2=-6.4+(c+1)/32*12.8,y=.035+(top(x)-.07)*row/20,y2=.035+(top(x2)-.07)*row/20;
  quad([x,y-.0009,0],[x2,y2-.0009,0],[x2,y2+.0009,0],[x,y+.0009,0]);
 }
 const geom=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(p,3)).setIndex(ii);geom.computeVertexNormals();
 scene.addChild(doc.createNode('Net woven mesh').setMesh(doc.createMesh('Net woven mesh').addPrimitive(primitive(doc,geom,meshMat,'Net'))));
 const tapePos=[],tapeIndices=[];
 for(let i=0;i<=64;i++){
  const x=-6.4+i/64*12.8,y=top(x);tapePos.push(x,y-.047,-.012,x,y+.004,-.012,x,y+.004,.012,x,y-.047,.012);
 }
 for(let i=0;i<64;i++)for(let side=0;side<4;side++){const a=i*4+side,b=i*4+(side+1)%4;tapeIndices.push(a,b,a+4,b,b+4,a+4);}
 const tape=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(tapePos,3)).setIndex(tapeIndices);tape.computeVertexNormals();
 scene.addChild(doc.createNode('Top tape / center sag').setMesh(doc.createMesh('Top tape').addPrimitive(primitive(doc,tape,iv,'Tape'))));
 for(const x of [-6.4,6.4]){
  const g=new T.CylinderGeometry(.045,.052,1.12,12);g.translate(x,.56,0);
  scene.addChild(doc.createNode('Net post '+x).setMesh(doc.createMesh('Post').addPrimitive(primitive(doc,g,post,'Post'))));
 }
 const strap=new T.BoxGeometry(.05,.93,.026);strap.translate(0,.465,.001);
 scene.addChild(doc.createNode('Center strap / 0.914m').setMesh(doc.createMesh('Center strap').addPrimitive(primitive(doc,strap,iv,'Strap'))));
 records.push(await save(doc,'models/net.glb',{kind:'net',width:12.8,centerHeight:.914,postHeight:1.07,cordWidth:.0018,holeWidth:.045,shadow:'Real geometry plus directional soft projection in preview'}));
}
{
 const doc=new Document();doc.createBuffer();const scene=doc.createScene('Tennis ball / 67mm');
 const mat=doc.createMaterial('Yellow felt').setBaseColorFactor([...new T.Color('#D0DD57').toArray(),1]).setRoughnessFactor(1);
 const body=new T.SphereGeometry(.0335,20,14);scene.addChild(doc.createNode('Felt ball').setMesh(doc.createMesh('Felt ball').addPrimitive(primitive(doc,body,mat,'Ball'))));
 const seams=doc.createMaterial('Inset ivory seams').setBaseColorFactor([...new T.Color('#F5EFD3').toArray(),1]).setRoughnessFactor(1);
 class Seam extends T.Curve{getPoint(t,target=new T.Vector3()){
  const a=t*Math.PI*2;return target.set(Math.cos(a),.43*Math.sin(a*2),Math.sin(a)).normalize().multiplyScalar(.0338);
 }}
 const tube=new T.TubeGeometry(new Seam(),80,.0009,4,true);
 scene.addChild(doc.createNode('Continuous tennis seam').setMesh(doc.createMesh('Seam').addPrimitive(primitive(doc,tube,seams,'Seam'))));
 records.push(await save(doc,'models/ball.glb',{kind:'ball',diameter:.067}));
}
await writeJSON('props.json',records);
