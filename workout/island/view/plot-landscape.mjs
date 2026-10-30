/** Small streetscape details stay on the perimeter of the existing plot.
 * Coordinates follow the authored building front, with a clear central gate.
 * All returned pieces join CityStreets' existing three instance batches. */
export function plotLandscape(building,type,front={dx:0,dz:1},quality='high'){
  const [w,d]=type.footprint||[1,1],residential=type.id==='house',commercial=type.id==='shop';
  const civic=type.category==='services'||type.category==='learning'||type.id==='cityHall',industrial=type.id==='factory';
  const result={planes:[],boxes:[],shrubs:[],gardens:0,plazas:0,parking:0};
  if(w<2||d<2||(!residential&&!commercial&&!civic&&!industrial))return result;
  const dx=front.dx||0,dz=front.dz||(!dx?1:0),width=dx?d:w,depth=dx?w:d,cx=building.x+(w-1)/2,cz=building.z+(d-1)/2;
  const point=(u,v)=>({x:cx+dz*u+dx*v,z:cz-dx*u+dz*v});
  const dimensions=(a,b)=>({w:Math.abs(dz)*a+Math.abs(dx)*b,d:Math.abs(dx)*a+Math.abs(dz)*b});
  const plane=(u,v,a,b,color,y,surface='stone')=>{const p=point(u,v),size=dimensions(a,b);result.planes.push({...p,y,w:size.w,h:size.d,d:1,color,flat:true,surface});};
  const box=(u,y,v,a,h,b,color)=>result.boxes.push({...point(u,v),y,...dimensions(a,b),h,color});
  const shrub=(u,y,v,a,h,b,color)=>result.shrubs.push({...point(u,v),y,...dimensions(a,b),h,color});
  const frontEdge=depth/2-.09,sideEdge=width/2-.09,opening=.74;
  if(residential){
    result.gardens=1;
    // Limestone garden walls frame the land without covering the facade.
    box(0,.115,-frontEdge,width-.12,.19,.065,'#b5b198');
    box(0,.225,-frontEdge,width-.1,.035,.085,'#dfd4bb');
    if(quality!=='low'){
      box(0,.055,-frontEdge+.13,width-.27,.07,.17,'#736b4c');
      shrub(0,.22,-frontEdge+.13,width-.3,.27,.16,'#43674b');
    }
    for(const side of [-1,1]){
      box(side*sideEdge,.115,0,.065,.19,depth-.12,'#b5b198');
      box(side*sideEdge,.225,0,.085,.035,depth-.1,'#dfd4bb');
      const span=(width-.12-opening)/2,u=side*(opening/2+span/2);
      box(u,.115,frontEdge,span,.19,.065,'#b5b198');
      if(quality!=='low'){
        box(u,.22,frontEdge,span+.015,.035,.09,'#e1d8bf');
        // A clipped hedge and flowers give the narrow garden its own scale.
        box(u,.055,frontEdge-.13,span-.045,.065,.16,'#756d4b');
        shrub(u,.2,frontEdge-.13,span-.025,.23,.16,'#466f4b');
        for(const shift of [-.12,.12])if(Math.abs(u+shift)<width/2-.16)shrub(u+shift,.325,frontEdge-.13,.065,.06,.065,(building.x+building.z)%2?'#e4bc71':'#d9b2b7');
      }
      box(side*(opening/2+.025),.16,frontEdge,.095,.29,.095,'#ded3b8');
    }
    // The pale path meets the street apron and passes through the open gate.
    plane(0,depth/2-.29,.48,.52,'#d6c7a6',.112);
    for(const shift of [-.13,.02,.17])plane(0,depth/2-.29+shift,.44,.012,'#a6a48d',.114,'plain');
  }else{
    result.plazas=1;
    // Expansion joints and inset pavers read at city-camera scale, while the
    // center remains clear for the unchanged original model and its entrance.
    plane(0,depth/2-.16,width-.15,.22,'#dbd5c4',.113);
    for(const side of [-1,1]){
      const u=side*(width/2-.25),v=depth/2-.19;
      box(u,.08,-depth/2+.18,.31,.12,.22,'#a29a80');
      shrub(u,.22,-depth/2+.18,.25,.24,.18,'#4f765b');
      if(quality==='low')continue;
      if(civic){
        // Benches face the frontage; all feet and backrests stay on the lot.
        box(u,.16,v,.34,.055,.14,'#9a7656');
        box(u,.255,v-.06,.34,.15,.035,'#9a7656');
        for(const foot of [-.11,.11])box(u+foot,.085,v,.035,.13,.1,'#48615f');
      }else{
        // Compact painted bays provide optional original-car instance sites
        // inside the plot; the central doorway and road remain unobstructed.
        plane(u,v,.35,.28,'#596862',.114,'asphalt');result.parking++;
        (result.parkingBays||=[]).push({...point(u,v),heading:Math.atan2(dx,dz)+Math.PI});
        for(const edge of [-1,1])plane(u+edge*.155,v,.018,.26,'#e6dfc8',.116,'plain');
        plane(u,v-.13,.32,.018,'#e6dfc8',.117,'plain');
      }
    }
  }
  return result;
}
