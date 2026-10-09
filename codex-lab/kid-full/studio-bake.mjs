import * as T from './vendor/three.module.js';

// A fixed diffuse studio is evaluated on the authored normals once. Exported
// vertex colors plus KHR_materials_unlit preserve this exact look in the GLB.
// This is a toy material, with no view-dependent specular or cloth simulation.
const lights=[
 {direction:new T.Vector3(-3,4.5,5).normalize(),color:new T.Color('#fff2e1'),strength:.80},
 {direction:new T.Vector3(3,2,3).normalize(),color:new T.Color('#e3edff'),strength:.30},
 {direction:new T.Vector3(1,3,-4).normalize(),color:new T.Color('#fff5e5'),strength:.32},
];
export function bakeStudio(geometry,material){
 const normals=geometry.attributes.normal,colors=new Float32Array(normals.count*3),normal=new T.Vector3();
 const sky=new T.Color('#fff5eb'),ground=new T.Color('#9da8be'),color=new T.Color(),illumination=new T.Color();
 for(let i=0;i<normals.count;i++){
  normal.fromBufferAttribute(normals,i).normalize();
  illumination.copy(ground).lerp(sky,(normal.y+1)/2).multiplyScalar(.68);
  for(const light of lights){color.copy(light.color).multiplyScalar(light.strength*Math.max(0,normal.dot(light.direction)));illumination.add(color);}
  color.copy(material.color).multiply(illumination);
  // glTF COLOR_0 is a normalized color in [0,1], including float accessors.
  colors.set([Math.min(1,color.r),Math.min(1,color.g),Math.min(1,color.b)],i*3);
 }
 geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
 return new T.MeshBasicMaterial({color:0xffffff,vertexColors:true,map:material.map||null,
  // glTF offers MASK or BLEND; it cannot encode both simultaneously. Numbers
  // use BLEND without a cutoff, with the same depth behavior in source/load.
  transparent:material.transparent,alphaTest:material.transparent?0:material.alphaTest,side:material.side,
  depthWrite:material.transparent?false:material.depthWrite});
}
