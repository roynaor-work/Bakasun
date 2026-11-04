/** Tailor the kit after geometry reduction, before Draco compression.
 * The body-derived jersey and shorts occupy nearly the same waist surface.
 * This tucks the shirt under a planar shorts waistband, with shared Hips skin
 * weights at the seam. It changes neither topology, inverse binds nor clips.
 * Called automatically by pack.mjs on fresh Blender raw exports.
 */
export function fixKitFit(doc){
 const report=[];
 const skin=doc.getRoot().listSkins()[0];
 const hipIndex=skin.listJoints().findIndex(j=>j.getName()==='Hips');
 if(hipIndex<0)throw new Error('Canonical Hips joint is required');
 for(const mesh of doc.getRoot().listMeshes())for(const primitive of mesh.listPrimitives()){
  const positions=primitive.getAttribute('POSITION'),uvs=primitive.getAttribute('TEXCOORD_0');
  const weights=primitive.getAttribute('WEIGHTS_0'),joints=primitive.getAttribute('JOINTS_0');
  const jersey=[],shorts=[];
  for(let i=0;i<positions.getCount();i++){
   const uv=uvs.getElement(i,[]);
   if(uv[1]>.5)(uv[0]<.5?jersey:shorts).push(i);
  }
  if(!jersey.length||!shorts.length)continue;
  const top=Math.max(...shorts.map(i=>positions.getElement(i,[])[1]));
  const waist=top-.008;
  function hipBlend(index,amount){
   const js=joints.getElement(index,[]),ws=weights.getElement(index,[]),combined=new Map([[hipIndex,amount]]);
   for(let k=0;k<4;k++)combined.set(js[k],(combined.get(js[k])||0)+ws[k]*(1-amount));
   const sorted=[...combined].sort((a,b)=>b[1]-a[1]).slice(0,4),sum=sorted.reduce((a,b)=>a+b[1],0);
   while(sorted.length<4)sorted.push([0,0]);
   joints.setElement(index,sorted.map(v=>v[0]));weights.setElement(index,sorted.map(v=>v[1]/sum));
  }
  let waistbandVertices=0,tuckedVertices=0;
  // Only the upper 3.5cm ring is levelled; lower shorts retain cloth drape.
  for(const index of shorts){
   const p=positions.getElement(index,[]);
   if(p[1]>top-.035){p[1]=waist;positions.setElement(index,p);hipBlend(index,1);waistbandVertices++;}
  }
  for(const index of jersey){
   const p=positions.getElement(index,[]),u=Math.max(0,Math.min(1,(p[1]-waist)/.085));
   if(u>=1)continue;
   const smooth=u*u*(3-2*u),scale=.80+.20*smooth;
   p[0]*=scale;p[2]*=scale;positions.setElement(index,p);
   const blend=Math.max(0,Math.min(1,(waist+.060-p[1])/.045));
   if(blend)hipBlend(index,blend);
   tuckedVertices++;
  }
  report.push({waistMeters:waist,waistbandVertices,tuckedVertices});
 }
 return report;
}
