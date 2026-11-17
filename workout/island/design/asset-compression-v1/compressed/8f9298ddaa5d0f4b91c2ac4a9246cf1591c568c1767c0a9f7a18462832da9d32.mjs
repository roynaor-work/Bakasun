import * as T from '../vendor/three.module.js';
// Original articulated outerwear model; no third-party character or animation data.
export function createProRider(unused,id,color,scene,kit){
 const {mesh,mat,basic,snowboard,contactTex}=kit,root=new T.Group(),body=new T.Group();root.add(body);
 const coat=mat(id==='player'?'#ce6545':color,{roughness:.92}),accent=mat('#e6d7b8',{roughness:.9}),pants=mat('#263c48',{roughness:.93}),rubber=mat('#15242e',{roughness:.83}),seam=mat('#34505c',{roughness:.9}),lens=mat('#dfb466',{metalness:.55,roughness:.16});
 function ellipsoid(parent,m,x,y,z,sx,sy,sz){const a=mesh(new T.SphereGeometry(1,24,16),m,parent,x,y,z);a.scale.set(sx,sy,sz);return a;}
 const pelvis=ellipsoid(body,pants,0,.84,0,.20,.18,.27);
 const torso=new T.Group();body.add(torso);torso.position.set(.015,1.12,0);torso.rotation.z=-.10;
 const jacket=ellipsoid(torso,coat,0,.025,0,.23,.33,.32);
 ellipsoid(torso,coat,-.015,-.16,0,.245,.16,.31);
 ellipsoid(torso,accent,-.045,.215,0,.18,.075,.31);
 // Hood, raised collar, zipper, hem and subtle sleeve cuffs make a sport garment silhouette.
 ellipsoid(torso,coat,-.15,.31,0,.13,.15,.19);
 ellipsoid(torso,rubber,.045,.36,0,.105,.08,.14);
 const zipper=mesh(new T.CylinderGeometry(.009,.009,.48,5),rubber,torso,.232,.04,0);zipper.rotation.z=-.08;
 const hem=mesh(new T.TorusGeometry(.26,.014,5,36),rubber,torso,0,-.235,0);hem.rotation.x=Math.PI/2;hem.scale.x=.87;
 const head=new T.Group();head.position.set(.04,1.61,0);body.add(head);head.rotation.y=.45;
 ellipsoid(head,rubber,0,-.025,0,.125,.14,.125);
 const helmet=ellipsoid(head,rubber,-.015,.09,0,.158,.175,.145);
 const helmetPanel=ellipsoid(head,seam,-.024,.11,0,.151,.158,.137);
 const goggle=ellipsoid(head,lens,.10,.055,-.075,.09,.064,.15);goggle.rotation.y=.38;
 const strap=mesh(new T.TorusGeometry(.144,.014,5,36),accent,head,0,.055,0);strap.rotation.z=Math.PI/2;strap.scale.y=.95;
 for(const z of [-.055,.055]){const vent=mesh(new T.BoxGeometry(.1,.008,.014),rubber,head,-.025,.25,z);vent.rotation.z=.06;}
 const ball=new T.SphereGeometry(1,16,12),limbGeo=new T.CylinderGeometry(1,1,1,16,3),up=new T.Vector3(0,1,0);
 const limb=(material,r)=>{const g=mesh(limbGeo,material,body);g.userData.r=r;return g;};
 const legs=[{sign:-1,upper:limb(pants,.124),lower:limb(pants,.102)},{sign:1,upper:limb(pants,.13),lower:limb(pants,.105)}];
 const arms=[{sign:-1,upper:limb(coat,.108),lower:limb(coat,.086)},{sign:1,upper:limb(coat,.108),lower:limb(coat,.086)}];
 for(const l of legs){l.knee=ellipsoid(body,pants,0,0,0,.13,.14,.12);l.boot=ellipsoid(body,rubber,.02,.23,l.sign*.33,.115,.14,.19);l.binding=ellipsoid(body,accent,.045,.25,l.sign*.33,.119,.038,.095);}
 for(const a of arms){a.hand=ellipsoid(body,rubber,0,0,0,.085,.10,.08);a.elbow=ellipsoid(body,coat,0,0,0,.105,.11,.10);a.cuff=ellipsoid(body,accent,0,0,0,.086,.035,.09);}
 snowboard(color,root);
 const shadow=mesh(new T.PlaneGeometry(1.6,2.6),basic({map:contactTex,transparent:true,depthWrite:false,opacity:.4}),scene);shadow.rotation.x=-Math.PI/2;shadow.castShadow=shadow.receiveShadow=false;
 const v=(x,y,z)=>new T.Vector3(x,y,z);
 function segment(mesh,a,b){mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(up,b.clone().sub(a).normalize());mesh.scale.set(mesh.userData.r,a.distanceTo(b),mesh.userData.r);}
 return {root,body,shadow,pose(t,lean,air,impact=0,grab=0){air=Math.max(0,Math.min(1,air));const compression=impact*.13+Math.abs(lean)*.045+air*.07+grab*.11;
  torso.position.y=1.14-compression;torso.rotation.z=-.18-grab*.25;torso.rotation.x=lean*.10;pelvis.position.y=.84-compression;
  head.position.set(.10+grab*.12,1.62-compression,0);head.rotation.y=.45+lean*.25;
  for(const l of legs){const s=l.sign,a=v(-.035,.84-compression,s*.16),k=v(.24+compression,.52-compression*.4,s*.28),f=v(.02,.25,s*.33);segment(l.upper,a,k);segment(l.lower,k,f);l.knee.position.copy(k);}
  for(const a of arms){const s=a.sign,reaching=grab*(s>0?1:.25),shoulder=v(.02,1.34-compression,s*.27),elbow=v(.20+reaching*.1,1.12-compression-reaching*.2,s*(.46+air*.06)),hand=v(.30,1.03-compression-reaching*.48,s*(.57-reaching*.24));segment(a.upper,shoulder,elbow);segment(a.lower,elbow,hand);a.hand.position.copy(hand);a.cuff.position.copy(hand).lerp(elbow,.18);a.elbow.position.copy(elbow);}
 }};
}
