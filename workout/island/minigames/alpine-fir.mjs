import * as T from '../vendor/three.module.js';
import {mergeGeometries} from '../vendor/BufferGeometryUtils.js?v=island-boar-20261029-1';

const hash=(a,b,c=0)=>{const q=Math.sin(a*127.1+b*311.7+c*57.3)*43758.5453;return q-Math.floor(q);};
function tint(g,snow,bark,variant){g.deleteAttribute('uv');const p=g.attributes.position,c=new Float32Array(p.count*3),base=new T.Color(snow?'#ffffff':bark?'#554a3a':'#305449');for(let i=0;i<p.count;i++){const variation=.88+.16*hash(Math.round(p.getX(i)*13),Math.round(p.getZ(i)*11),variant);c.set([base.r*variation,base.g*variation,base.b*variation],i*3);}g.setAttribute('color',new T.BufferAttribute(c,3));return g;}
function firGeometry(snow,variant,far){
 const parts=[],layers=far?7:10,branches=far?4:6,NX=far?3:5,NR=far?4:6;
 if(!snow){const g=new T.CylinderGeometry(.035,.12,7,6);g.translate(0,3.5,0);parts.push(tint(g,false,true,variant));}
 for(let k=0;k<layers;k++)for(let b=0;b<branches;b++){
  if(hash(k,b,variant+1)<.10&&k>0)continue;
  const fHeight=k/(layers-1),y=.65+fHeight*5.9+(hash(k,b,variant)-.5)*.22,r=(1-fHeight*.88)*(1.6+hash(b,k,variant)*.44),angle=b/branches*Math.PI*2+k*.79+(hash(b,k,variant+6)-.5)*.36;
  const p=[],ix=[],coverage=snow?.81:1,widthBase=far?.46:.48;
  for(let j=0;j<=NX;j++)for(let i=0;i<=NR;i++){const f=j/NX,q=i/NR*Math.PI*2,width=Math.sin(Math.PI*f)**.58*widthBase*(1-fHeight*.70)*coverage+.003,along=.07+f*r*(snow?.95:1),cross=Math.cos(q)*width*(1+.13*Math.sin(j*7+b)),height=Math.sin(q)*width*(snow?.42:.52),sag=(.22+hash(k,b,variant+3)*.20)*f*f;
   p.push(Math.cos(angle)*along-Math.sin(angle)*cross,y+.13-sag+(snow?.075:0)+height,Math.sin(angle)*along+Math.cos(angle)*cross);}
  for(let j=0;j<NX;j++)for(let i=0;i<NR;i++){const a=j*(NR+1)+i,d=a+NR+1;ix.push(a,d,a+1,a+1,d,d+1);}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setIndex(ix);g.computeVertexNormals();parts.push(tint(g,snow,false,variant));
 }
 const top=new T.ConeGeometry(snow?.13:.19,.85,far?5:7);top.translate(0,6.8,0);parts.push(tint(top,snow,false,variant));
 const result=mergeGeometries(parts);for(const g of parts)g.dispose();result.computeBoundingBox();return result;
}

/** Visual forest pools only. Placement is deterministic and kept outside the playable pipe. */
export function createFirForest(scene,{course,deckEdge,terrainY,place,density=1,dusk=false,mobile=false}){
 const green=new T.MeshStandardMaterial({color:'#ffffff',vertexColors:true,roughness:.96,envMapIntensity:.18});
 const snowy=new T.MeshStandardMaterial({color:dusk?'#bbc4d7':'#d2e0e4',vertexColors:true,roughness:.93,envMapIntensity:.17});
 const pools=[];for(let far=0;far<2;far++)for(let variant=0;variant<3;variant++){
  const foliage=new T.InstancedMesh(firGeometry(false,variant,!!far),green,360),snow=new T.InstancedMesh(firGeometry(true,variant,!!far),snowy,360);
  for(const m of [foliage,snow]){m.count=0;m.frustumCulled=false;m.castShadow=!far;m.receiveShadow=true;scene.add(m);}pools.push({far:!!far,variant,foliage,snow,count:0});
 }
 const trees=[];let seed=82317;const rnd=()=>((seed=Math.imul(seed,1664525)+1013904223)>>>0)/4294967296;
 const rowStep=density>1.5?3.25:4.15;
 for(let s=-35;s<course.length+90;s+=rowStep)for(const side of [-1,1])for(let band=0;band<2;band++){
  if(rnd()>(band?.64:.90))continue;const k=(band?1.05:.8)+rnd()*(band?.9:.65),width=.84+rnd()*.25,radius=2.25*k*width+.35,raw=deckEdge+(band?12:1.4)+rnd()*(band?23:9),x=side*Math.max(raw,deckEdge+radius+.35);
  trees.push({s:s+rnd()*3.2,x,k,width,rot:rnd()*Math.PI*2,variant:Math.floor(rnd()*3),roll:(rnd()-.5)*.035});
 }
 trees.sort((a,b)=>a.s-b.s);const dummy=new T.Object3D();let nearCount=0,farCount=0,clearance=Infinity,lastWindow='';
 for(const [lodIndex,tr] of trees.entries()){tr.lodIndex=lodIndex;place(dummy,tr.s,tr.x,terrainY(tr.s,Math.abs(tr.x),Math.sign(tr.x))-.25,tr.roll,tr.rot);dummy.scale.set(tr.k*tr.width,tr.k,tr.k*tr.width);dummy.updateMatrix();tr.matrix=dummy.matrix.clone();}
 for(const tr of trees)clearance=Math.min(clearance,Math.abs(tr.x)-deckEdge-(2.25*tr.k*tr.width+.35));
 return {update(ps,far,quality){const windowKey=Math.floor(ps/2)+':'+quality+':'+far;if(windowKey===lastWindow)return;lastWindow=windowKey;for(const p of pools)p.count=0;const limit=Math.min(far,quality==='low'?165:285);let index=0;
  for(const tr of trees){if(tr.s<ps-35||tr.s>ps+limit)continue;if(quality==='low'&&tr.lodIndex%2)continue;const distant=quality==='low'||Math.abs(tr.s-ps)>(mobile?65:95),p=pools[(distant?3:0)+tr.variant];if(p.count>=360)continue;
   p.foliage.setMatrixAt(p.count,tr.matrix);p.snow.setMatrixAt(p.count,tr.matrix);p.count++;
  }
  nearCount=farCount=0;for(const p of pools){for(const m of [p.foliage,p.snow]){m.count=p.count;m.visible=p.count>0;m.instanceMatrix.needsUpdate=true;}if(p.far)farCount+=p.count;else nearCount+=p.count;}
 },metrics(){return {trees:nearCount+farCount,nearTrees:nearCount,farTrees:farCount,treeVariants:3,treeDeckClearance:+clearance.toFixed(3)};},dispose(){for(const p of pools){p.foliage.dispose();p.snow.dispose();}}};
}
