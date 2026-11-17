// Original modular stadium geometry, vertex-colored turf/architecture and skies.
// No photographs, fonts, raster textures, third-party models, or signage text.
import * as T from '../vendor/three.module.js';
import {Document, KHRMaterialsUnlit, KHRLightsPunctual, rgb, accessor, save, writeJSON} from './common.mjs';

let seed=1;
function random(){seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;}
const Q=new T.Quaternion(), UP=new T.Vector3(0,1,0), FORWARD=new T.Vector3(0,0,-1);
const mix=(a,b,t)=>a.map((v,i)=>v*(1-t)+b[i]*t);

class Venue {
  constructor(id){
    this.doc=new Document();this.doc.createBuffer();this.scene=this.doc.createScene(id);
    this.buckets=new Map();this.groups=new Map();
    this.unlit=this.doc.createExtension(KHRMaterialsUnlit);
    this.lights=this.doc.createExtension(KHRLightsPunctual);
  }
  group(name){
    if(!this.groups.has(name)){const n=this.doc.createNode(name);this.scene.addChild(n);this.groups.set(name,n);}
    return this.groups.get(name);
  }
  add(group,geometry,hex,position=[0,0,0],scale=[1,1,1],rotation=[0,0,0],style='matte',colors=null){
    const key=group+'/'+style;
    if(!this.buckets.has(key))this.buckets.set(key,{group,style,p:[],n:[],c:[],i:[]});
    const b=this.buckets.get(key),g=geometry.clone();
    g.applyMatrix4(new T.Matrix4().compose(new T.Vector3(...position),new T.Quaternion().setFromEuler(new T.Euler(...rotation)),new T.Vector3(...scale)));
    const p=g.attributes.position,n=g.attributes.normal,base=b.p.length/3,c=rgb(hex);
    for(let i=0;i<p.count;i++){
      b.p.push(p.getX(i),p.getY(i),p.getZ(i));
      b.n.push(n.getX(i),n.getY(i),n.getZ(i));
      b.c.push(...(colors?colors(i,p):c));
    }
    if(g.index)for(const i of g.index.array)b.i.push(base+i);
    else for(let i=0;i<p.count;i++)b.i.push(base+i);
    g.dispose();
  }
  box(group,p,s,color,rot=0){this.add(group,BOX,color,p,s,[0,rot,0]);}
  beam(group,a,b,r,color,style='matte'){
    const v=new T.Vector3(...b).sub(new T.Vector3(...a));
    const q=Q.setFromUnitVectors(UP,v.clone().normalize());
    const e=new T.Euler().setFromQuaternion(q);
    this.add(group,CYL,color,a.map((x,i)=>(x+b[i])/2),[r,v.length(),r],e.toArray().slice(0,3),style);
  }
  sphere(group,p,s,color,style='matte'){this.add(group,SPHERE,color,p,s,[0,0,0],style);}
  ring(group,rx,rz,y,width,color,style='matte',segments=64){
    const g=new T.BufferGeometry(),p=[],n=[],ix=[];
    for(let s=0;s<=segments;s++){
      const a=s/segments*Math.PI*2;
      p.push(Math.cos(a)*rx,y,Math.sin(a)*rz,Math.cos(a)*(rx+width),y,Math.sin(a)*(rz+width));
      n.push(0,1,0,0,1,0);
    }
    for(let s=0;s<segments;s++){const i=s*2;ix.push(i,i+2,i+1,i+1,i+2,i+3);}
    g.setAttribute('position',new T.Float32BufferAttribute(p,3)).setAttribute('normal',new T.Float32BufferAttribute(n,3)).setIndex(ix);
    this.add(group,g,color,[0,0,0],[1,1,1],[0,0,0],style);g.dispose();
  }
  riser(group,rx,rz,y,height,color,segments=48){
    const g=new T.BufferGeometry(),p=[],ix=[];
    for(let s=0;s<=segments;s++){
      const a=s/segments*Math.PI*2,x=Math.cos(a)*rx,z=Math.sin(a)*rz;
      p.push(x,y,z,x,y-height,z);
    }
    for(let s=0;s<segments;s++){const i=s*2;ix.push(i,i+1,i+2,i+1,i+3,i+2);}
    g.setAttribute('position',new T.Float32BufferAttribute(p,3)).setIndex(ix);g.computeVertexNormals();
    this.add(group,g,color);g.dispose();
  }
  light(name,type,position,target,color,intensity,options={}){
    const light=this.lights.createLight(name).setType(type).setColor(rgb(color)).setIntensity(intensity);
    if(type!=='directional')light.setRange(options.range||180);
    if(type==='spot')light.setInnerConeAngle(options.inner||.28).setOuterConeAngle(options.outer||.65);
    const q=new T.Quaternion().setFromUnitVectors(FORWARD,new T.Vector3(...target).sub(new T.Vector3(...position)).normalize());
    const node=this.doc.createNode(name).setTranslation(position).setRotation(q.toArray()).setExtension('KHR_lights_punctual',light);
    this.scene.addChild(node);
  }
  finish(){
    for(const b of this.buckets.values()){
      const material=this.doc.createMaterial(b.style+' / vertex colors').setRoughnessFactor(.92).setMetallicFactor(0).setDoubleSided(true);
      if(['sky','glow','beam'].includes(b.style))material.setExtension('KHR_materials_unlit',this.unlit.createUnlit());
      if(b.style==='beam')material.setAlphaMode('BLEND').setBaseColorFactor([1,1,1,.035]);
      const p=this.doc.createPrimitive().setMaterial(material)
        .setAttribute('POSITION',accessor(this.doc,b.group+' positions','VEC3',new Float32Array(b.p)))
        .setAttribute('NORMAL',accessor(this.doc,b.group+' normals','VEC3',new Float32Array(b.n)))
        .setAttribute('COLOR_0',accessor(this.doc,b.group+' linear colors','VEC3',new Float32Array(b.c)))
        .setIndices(accessor(this.doc,b.group+' indices','SCALAR',new Uint32Array(b.i)));
      this.group(b.group).addChild(this.doc.createNode(b.group+' '+b.style).setMesh(this.doc.createMesh(b.group).addPrimitive(p)));
    }
    return this.doc;
  }
}
const BOX=new T.BoxGeometry(1,1,1),CYL=new T.CylinderGeometry(1,1,1,6),SPHERE=new T.IcosahedronGeometry(1,1);

function sky(v,night,street){
  const top=rgb(night?'#09152E':street?'#6297C1':'#3489BD'),horizon=rgb(night?'#43526E':street?'#F7D8AE':'#D2EBE9');
  const geometry=new T.SphereGeometry(420,32,16);
  v.add('Sky',geometry,'#FFFFFF',[0,0,0],[1,1,1],[0,0,0],'sky',(_,p)=>{
    const t=Math.max(0,Math.min(1,p.getY(_)/360));return mix(horizon,top,Math.sqrt(t));
  });geometry.dispose();
  v.sphere('Sky_Orb',night?[-170,160,-190]:[-185,230,-205],night?[9,9,9]:[12,12,12],night?'#DDECF4':'#FFF0CC','glow');
  if(night){
    for(let i=0;i<88;i++){
      const a=random()*Math.PI*2,y=90+random()*220,r=Math.sqrt(390**2-y**2);
      v.sphere('Sky_Stars',[Math.cos(a)*r,y,Math.sin(a)*r],[.18,.18,.18],i%3?'#A9C2DB':'#F8E4C4','glow');
    }
  }else{
    for(let i=0;i<9;i++){
      const a=i/9*Math.PI*2;
      for(let j=0;j<3;j++)v.sphere('Sky_Clouds',[Math.cos(a)*230+j*11,65+(i%3)*17+j*2,Math.sin(a)*230],[18+j*2,5+j,8+j],street?'#F2DCC6':'#EDF2E7','sky');
    }
  }
}
function pitch(v,width,length,night,street){
  const x=width/2,z=length/2;
  v.box('Ground',[0,-.55,0],[street?135:180,1,street?125:215],street?'#AB9F83':'#223F3C');
  v.box('Apron',[0,-.01,0],[width+11,.12,length+11],street?'#9C9D91':'#49636A');
  for(let i=0;i<12;i++)v.box('Pitch_Turf',[-x+(i+.5)*width/12,.04,0],[width/12,.03,length],
    (i%2? (night?'#33815B':street?'#54885F':'#418B5A'):(night?'#28744D':street?'#487F58':'#367D4D')));
  const line='#E7EFDB',lw=street?.09:.12,y=.069;
  const segment=(a,b)=>{
    const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);
    v.box('Pitch_Lines',[(a[0]+b[0])/2,y,(a[1]+b[1])/2],[len,.012,lw],line,-Math.atan2(dz,dx));
  };
  for(const [a,b]of[[[-x,-z],[x,-z]],[[x,-z],[x,z]],[[x,z],[-x,z]],[[-x,z],[-x,-z]],[[-x,0],[x,0]]])segment(a,b);
  const circle=street?4.6:9.15;
  v.ring('Pitch_Lines',circle,circle,y,lw,line);
  v.add('Pitch_Lines',CYL,line,[0,y,0],[.13,.02,.13]);
  for(const sign of[-1,1]){
    const areaW=street?20:40.32,areaD=street?8:16.5,goalAreaW=street?9:18.32,goalAreaD=street?3:5.5;
    for(const [w,d]of[[areaW,areaD],[goalAreaW,goalAreaD]]){
      segment([-w/2,z*sign],[-w/2,(z-d)*sign]);segment([-w/2,(z-d)*sign],[w/2,(z-d)*sign]);segment([w/2,(z-d)*sign],[w/2,z*sign]);
    }
    const penaltyZ=(z-(street?6:11))*sign;
    v.add('Pitch_Lines',CYL,line,[0,y,penaltyZ],[.14,.02,.14]);
    const radius=street?4.6:9.15,start=Math.asin((areaD-(street?6:11))/radius);
    for(let i=0;i<26;i++){
      const a=Math.PI+start+i/26*(Math.PI-2*start),b=Math.PI+start+(i+1)/26*(Math.PI-2*start);
      segment([Math.cos(a)*radius,penaltyZ+Math.sin(a)*radius*sign],[Math.cos(b)*radius,penaltyZ+Math.sin(b)*radius*sign]);
    }
    goal(v,z*sign,street?5:7.32,street?2:2.44,sign);
  }
  for(const a of[-1,1])for(const b of[-1,1]){
    v.beam('Corner_Flags',[x*a,0,z*b],[x*a,1.55,z*b],.025,'#EAEADD');
    v.box('Corner_Flags',[x*a+.19,1.32,z*b],[.38,.26,.018],street?'#E3B85F':'#F3D476');
  }
}
function goal(v,z,width,height,sign){
  const d=1.9*sign,x=width/2,c='#EFF1E9';
  for(const sx of[-x,x]){
    v.beam('Goals',[sx,.07,z],[sx,height,z],.065,c);
    v.beam('Goals',[sx,height,z],[sx,height-.25,z+d],.045,c);
    v.beam('Goals',[sx,height-.25,z+d],[sx,.07,z+d],.04,c);
    v.beam('Goals',[sx,.07,z],[sx,.07,z+d],.04,c);
  }
  v.beam('Goals',[-x,height,z],[x,height,z],.065,c);
  const net='#C3CFCC';
  for(let i=0;i<=Math.ceil(width/.36);i++){
    const px=-x+i/Math.ceil(width/.36)*width;
    v.beam('Goal_Nets',[px,.07,z+d],[px,height-.25,z+d],.007,net);
    v.beam('Goal_Nets',[px,height,z],[px,height-.25,z+d],.007,net);
  }
  for(let i=0;i<=6;i++){
    const h=.07+i/6*(height-.32);
    v.beam('Goal_Nets',[-x,h,z+d],[x,h,z+d],.007,net);
    for(const sx of[-x,x])v.beam('Goal_Nets',[sx,h,z],[sx,h,z+d],.007,net);
  }
}
function bowl(v,night){
  const segments=48;
  const seatColors=night?['#4F7D96','#89999C','#CAAD72','#466479']:['#4B8299','#AEC8CA','#DBBF89','#537288'];
  const shirts=['#D7CFC0','#405C70','#B86C55','#6D8E91','#CDA548','#63827A'];
  for(let tier=0;tier<3;tier++){
    const name=`Stands_Tier0${tier+1}`;
    v.group(name).setExtras({layer:tier+1,rows:5,role:'tiered-stands'});
    for(let row=0;row<5;row++){
      const rx=43+tier*7+row*1.12,rz=63+tier*7+row*1.12,y=1+tier*5+row*.72;
      v.ring(name,rx,rz,y,1.1,row%2?'#829997':'#91A7A0','matte',segments);
      v.riser(name,rx,rz,y,.72,tier===1?'#476F7B':'#5B8186',segments);
      for(let s=0;s<segments;s++){
        const a=(s+.5)/segments*Math.PI*2;
        // Pale radial aisles interrupt the seat rows at regular intervals.
        if(s%6===0){v.box(name,[Math.cos(a)*(rx+.5),y+.05,Math.sin(a)*(rz+.5)],[1.05,.1,3.9],'#D0C9B4',-a);continue;}
        for(let k=0;k<3;k++){
          const theta=(s+(k+.5)/3)/segments*Math.PI*2,px=Math.cos(theta)*(rx+.6),pz=Math.sin(theta)*(rz+.6);
          const rot=Math.PI/2-theta;
          v.box('Seats',[px,y+.24,pz],[.65,.16,.52],seatColors[(s+row+tier)%seatColors.length],rot);
          if(random()>.25){
            v.box('Crowd',[px,y+.55,pz],[.38,.42,.28],shirts[(s+row+k)%shirts.length],rot);
            const tone=['#C48964','#8F5B43','#E3B48B','#AE7752'][(s+k+row)%4];
            v.add('Crowd',HEAD,tone,[px,y+.88,pz],[.13,.15,.13]);
          }
        }
      }
    }
    v.ring('Tier_Walkways',43+tier*7+5.6,63+tier*7+5.6,1+tier*5+3.1,1.3,'#536B72','matte',segments);
    for(let s=0;s<segments;s++){
      const a=s/segments*Math.PI*2,b=(s+1)/segments*Math.PI*2;
      const rx=43+tier*7,rz=63+tier*7,y=1+tier*5;
      v.beam('Rails',[Math.cos(a)*rx,y+.9,Math.sin(a)*rz],[Math.cos(b)*rx,y+.9,Math.sin(b)*rz],.045,'#C3D1CE');
    }
  }
  v.ring('Roof',58,78,17.8,7.8,night?'#21384D':'#D3DED7');
  v.ring('Roof_Trim',58,78,17.73,.6,night?'#A3D7D8':'#81A7AF','glow');
  for(let i=0;i<24;i++){
    const a=i/24*Math.PI*2;
    v.beam('Roof_Structure',[Math.cos(a)*65,0,Math.sin(a)*85],[Math.cos(a)*65,17.8,Math.sin(a)*85],.25,'#425D68');
    v.beam('Roof_Structure',[Math.cos(a)*65,17.5,Math.sin(a)*85],[Math.cos(a)*58,17.8,Math.sin(a)*78],.13,'#6F8A91');
  }
  for(const sign of[-1,1])v.box('Entry_Tunnels',[sign*44,1.3,0],[2,2.6,5],'#162F3C');
}
const HEAD=new T.IcosahedronGeometry(1,0);
function boards(v,width,length,street){
  const palette=['#D5E0D6','#274D60','#BDCF72','#719998'];
  for(const sign of[-1,1]){
    for(let i=0;i<10;i++)v.box('Boards_Blank',[sign*(width/2+2),.53,-length/2+(i+.5)*length/10],[.18,.86,length/10-.18],palette[i%4]);
    for(let i=0;i<6;i++){
      if(i===2||i===3)continue;
      v.box('Boards_Blank',[-width/2+(i+.5)*width/6,.53,sign*(length/2+2)],[width/6-.18,.86,.18],palette[(i+1)%4]);
    }
  }
  v.group('Boards_Blank').setExtras({text:false,logos:false,role:'blank-pitch-side-boards'});
}
function floodlights(v,night){
  for(const x of[-1,1])for(const z of[-1,1]){
    const px=x*45,pz=z*62,top=27;
    v.beam('Floodlight_Towers',[px,0,pz],[px,top,pz],.3,'#526F7B');
    v.beam('Floodlight_Towers',[px-1,0,pz],[px,top-2,pz],.1,'#597581');
    v.beam('Floodlight_Towers',[px+1,0,pz],[px,top-2,pz],.1,'#597581');
    const angle=Math.atan2(px,pz);
    v.box('Floodlight_Frames',[px,top,pz],[4.6,1.8,.5],'#213B4D',angle);
    for(let a=0;a<6;a++){
      const off=(a%3-1)*1.42,y=top+(Math.floor(a/3)-.5)*.83;
      v.add('Floodlight_Lenses',BOX,night?'#F5F5D6':'#C8D9DB',[px+Math.cos(angle)*off,y,pz-Math.sin(angle)*off],[1.18,.62,.15],[0,angle,0],night?'glow':'matte');
    }
    if(night){
      const pos=[px,top,pz],target=[x*10,0,z*18];
      v.light(`Floodlight_${x}_${z}`,'spot',pos,target,'#EBF3FF',15000,{inner:.34,outer:.85,range:170});
      const direction=new T.Vector3(...target).sub(new T.Vector3(...pos)),len=direction.length();
      const e=new T.Euler().setFromQuaternion(new T.Quaternion().setFromUnitVectors(UP,direction.clone().normalize()));
      const cone=new T.CylinderGeometry(17,.15,len,16,1,true);
      // Cylinder wide at +Y: rotate its axis so the broad end points at the pitch.
      v.add('Floodlight_Beams',cone,'#BDDDEE',pos.map((a,i)=>(a+target[i])/2),[1,1,1],e.toArray().slice(0,3),'beam');cone.dispose();
    }
  }
}
function neighborhood(v){
  for(let tier=0;tier<3;tier++){
    const name=`Stands_Tier0${tier+1}`;
    v.group(name).setExtras({layer:tier+1,role:'tiered-neighborhood-bleachers'});
    for(const side of[-1,1]){
      v.box(name,[side*(24+tier*1.1),.35+tier*.58,-3],[1.1,.18,26],'#AAB4AE');
      v.box('Bleacher_Benches',[side*(24+tier*1.1),.65+tier*.58,-3],[.45,.15,25],tier===1?'#5E9490':'#E3CF9C');
      for(let i=0;i<15;i++)if(random()>.4){
        const x=side*(24+tier*1.1),y=.96+tier*.58,z=-15+i*1.7;
        v.box('Crowd',[x,y,z],[.4,.48,.3],['#E5CC94','#609B97','#B46A54'][i%3]);
        v.add('Crowd',HEAD,'#BE8964',[x,y+.36,z],[.14,.16,.14]);
      }
    }
  }
  for(const side of[-1,1]){
    for(let z=-32;z<=32;z+=4)v.beam('Fence_Posts',[side*22,0,z],[side*22,3.7,z],.045,'#526F6A');
    for(const y of[.3,3.7])v.beam('Fence_Posts',[side*22,y,-32],[side*22,y,32],.035,'#526F6A');
    for(let z=-32;z<32;z+=1){
      v.beam('Fence_Mesh',[side*22,.3,z],[side*22,3.7,z+2.5],.009,'#81918A');
      v.beam('Fence_Mesh',[side*22,.3,z+2.5],[side*22,3.7,z],.009,'#81918A');
    }
  }
  const colors=['#C4B49B','#B6B7AA','#D7C7AB','#B59F8B','#D7CDB7'];
  for(let i=0;i<14;i++){
    const side=i<7?-1:1,k=i%7,z=-48+k*16,x=side*(43+(k%2)*5),h=9+(k%4)*3.7;
    v.box('Neighborhood_Buildings',[x,h/2,z],[13,h,12],colors[i%colors.length]);
    v.box('Neighborhood_Roofs',[x,h+.18,z],[13.6,.4,12.6],'#B5AC98');
    for(let floor=1;floor<h/3;floor++)for(let win=0;win<3;win++){
      const wz=z-4+win*4;
      v.box('Neighborhood_Windows',[x-side*6.52,floor*3,wz],[.08,1.4,1.4],win%2?'#577882':'#314E5C');
      if(floor%2===0)v.box('Neighborhood_Balconies',[x-side*7.1,floor*3-.8,wz],[1.4,.15,2.4],'#CDC4AE');
    }
    if(k%2===0)v.box('Neighborhood_Roofs',[x+3,h+1,z],[1.9,1.6,1.9],'#8C9691');
  }
  for(const side of[-1,1])for(const z of[-23,22]){
    const x=side*30;
    v.beam('Street_Lamps',[x,0,z],[x,8,z],.09,'#465D60');
    v.box('Street_Lamps',[x-side*.6,8,z],[1.4,.18,.42],'#E3D7B5');
  }
  for(let i=0;i<14;i++){
    const a=i/14*Math.PI*2,x=Math.cos(a)*35,z=Math.sin(a)*42;
    v.beam('Trees',[x,0,z],[x,4.8,z],.24,'#87745A');
    v.sphere('Trees',[x,5,z],[2.5,3,2.5],i%2?'#55795A':'#70865B');
  }
}

const records=[];
for(const [id,label,night,street]of[
  ['stadium-day','אצטדיון יום',false,false],['stadium-night','אצטדיון לילה',true,false],['neighborhood','מגרש שכונתי',false,true],
]){
  seed=1187;const v=new Venue(id),width=street?34:68,length=street?52:105;
  sky(v,night,street);pitch(v,width,length,night,street);boards(v,width,length,street);
  if(street)neighborhood(v);else{bowl(v,night);floodlights(v,night);}
  v.light(night?'Moon_Fill':'Sun','directional',[-90,130,-60],[0,0,0],night?'#A6BDDF':street?'#FFD8A4':'#FFF0D8',night?.42:street?2.3:2.1);
  const atmosphere={sky:night?'#839FC0':street?'#E1CFB4':'#C4E1E8',ground:night?'#23382F':street?'#70664F':'#657D61',hemisphereIntensity:night?.8:1.35,
    background:night?'#111F38':street?'#B8CACC':'#A7CCD8',fogNear:night?190:240,fogFar:400,exposure:night?1.25:1.05};
  v.doc.getRoot().setExtras({id,label,units:'meters',up:'+Y',forward:'+Z',pitch:{width,length},atmosphere,standLayers:3,signageText:false});
  const record=await save(v.finish(),`venues/${id}.glb`);
  records.push({...record,id,label,pitch:{widthMeters:width,lengthMeters:length},standLayers:3,sky:'vertex-colored gradient dome',
    boards:{text:false,logos:false},lighting:{embedded:'KHR_lights_punctual',directional:1,spots:night?4:0,atmosphere},
    camera:{position:street?[57,43,72]:[103,78,131],target:[0,street?2:3,0]}});
}
await writeJSON('venues.json',{schemaVersion:1,venues:records});
