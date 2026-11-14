/** CC0 review environment, regulation court; no imported arena or decoder. */
import * as T from '../../vendor/three.module.js';
export function makeSeats(){
  const seats=[];
  for(const side of [-1,1])for(let row=0;row<5;row++){
    for(let col=0;col<56;col++)seats.push({x:(col-27.5)*.59,y:.38+row*.51,z:side*(10.65+row*.88),yaw:side>0?Math.PI:0,row});
    for(let col=0;col<24;col++)seats.push({x:side*(17.25+row*.88),y:.38+row*.51,z:(col-11.5)*.71,yaw:-side*Math.PI/2,row});
  }
  return seats.map((s,id)=>({...s,id,variant:(id*7+Math.floor(id/12)*5)%12,team:s.x<0?0:1}));
}
export function makeEnvironment(){
  const root=new T.Group();
  function box(size,p,c){const m=new T.Mesh(new T.BoxGeometry(...size),new T.MeshBasicMaterial({color:c}));m.position.set(...p);root.add(m);return m;}
  box([48,.15,39],[0,-.12,0],'#171f25');box([32,.06,19],[0,-.015,0],'#304047');
  // Alternating maple planks, shared geometry/material via InstancedMesh.
  const plank=new T.InstancedMesh(new T.BoxGeometry(28.65,.04,.381),new T.MeshBasicMaterial(),40),d=new T.Object3D();
  for(let i=0;i<40;i++){d.position.set(0,.012,(i-19.5)*.381);d.updateMatrix();plank.setMatrixAt(i,d.matrix);plank.setColorAt(i,new T.Color(i%2?'#bd955d':'#c6a26b'));}root.add(plank);
  const points=[],line=(a,b)=>points.push(...a,...b),y=.04,hx=14.325,hz=7.62;
  const rect=(x1,x2,z1,z2)=>{line([x1,y,z1],[x2,y,z1]);line([x2,y,z1],[x2,y,z2]);line([x2,y,z2],[x1,y,z2]);line([x1,y,z2],[x1,y,z1]);};
  rect(-hx,hx,-hz,hz);line([0,y,-hz],[0,y,hz]);
  for(let i=0;i<64;i++){const a=i/64*Math.PI*2,b=(i+1)/64*Math.PI*2;line([Math.cos(a)*1.83,y,Math.sin(a)*1.83],[Math.cos(b)*1.83,y,Math.sin(b)*1.83]);}
  for(const side of [-1,1]){
    const rim=side*12.75;
    box([5.8,.006,4.88],[side*(hx-2.9),.039,0],side<0?'#3d6c70':'#854e3c');
    rect(side<0?-hx:hx-5.8,side<0?-hx+5.8:hx,-2.44,2.44);
    for(let i=0;i<48;i++){const a=-1.17+i/48*2.34,b=-1.17+(i+1)/48*2.34;line([rim-side*Math.cos(a)*7.24,y,Math.sin(a)*7.24],[rim-side*Math.cos(b)*7.24,y,Math.sin(b)*7.24]);}
    const m=new T.Mesh(new T.TorusGeometry(.2286,.023,5,20),new T.MeshBasicMaterial({color:'#f68043'}));m.rotation.x=Math.PI/2;m.position.set(rim,3.05,0);root.add(m);
    box([.055,1.07,1.83],[side*13.105,3.435,0],'#d0d9cf');
    box([.18,2.1,.22],[side*15.4,1.05,0],'#263d48');
    box([2.3,.16,.17],[side*14.3,2.1,0],'#263d48');
    for(let row=0;row<5;row++){
      const yy=.38+row*.51;
      box([34,yy,.88],[0,yy/2,side*(10.65+row*.88)],row%2?'#24323b':'#2b3a43');
      box([.88,yy,18],[side*(17.25+row*.88),yy/2,0],row%2?'#24323b':'#2b3a43');
    }
    box([34,.5,.18],[0,3.8,side*15.2],side<0?'#286671':'#9c5039');
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(points,3));root.add(new T.LineSegments(g,new T.LineBasicMaterial({color:'#f2e9d1'})));
  const seatGeo=new T.BoxGeometry(.43,.07,.36),seatMat=new T.MeshBasicMaterial({color:'#3c515a'}),seats=makeSeats(),chairs=new T.InstancedMesh(seatGeo,seatMat,seats.length);
  seats.forEach((s,i)=>{d.position.set(s.x,s.y+.46,s.z);d.rotation.y=s.yaw;d.updateMatrix();chairs.setMatrixAt(i,d.matrix);});root.add(chairs);
  root.add(new T.HemisphereLight(0xd9e7ef,0x252127,2));
  const sun=new T.DirectionalLight(0xffedcd,2);sun.position.set(-5,15,-8);root.add(sun);
  return root;
}

export function cameraPose(name,portrait=false){
  if(name==='game'){
    // cameraFor at a stationary ball/handler x=z=0, attack=+1, no punch.
    if(portrait){const px=14.325-6.2;return {position:[px-9.5,6,-7.62*.35],target:[px+2.4,1.1,0],fov:52};}
    const cz=-(7.62+7),cy=6.4,ly=1.45;
    return {position:[4,cy,cz],target:[4,ly,0],fov:Math.min(40,Math.max(16,2*Math.atan(8.2/2/Math.hypot(cz,cy-ly))*180/Math.PI))};
  }
  return ({wide:{position:[32,24,-36],target:[0,1,0],fov:50},side:{position:[29,8,0],target:[0,2,0],fov:56},rear:{position:[0,8,28],target:[0,2,0],fov:55},gallery:{position:[0,4.2,12.8],target:[0,1.65,0],fov:43},levels:{position:[0,2.5,6.2],target:[0,1.2,0],fov:42}})[name];
}
