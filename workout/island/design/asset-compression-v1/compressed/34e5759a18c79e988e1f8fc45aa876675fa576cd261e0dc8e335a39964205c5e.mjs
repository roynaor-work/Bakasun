/** Renderer boundary: replace these entity factories with GLB adapters in a future
 * Three.js session. Models and their collision coordinates do not depend on art.
 * Sprites, gradients and backdrops are baked once, never in a frame callback. */
const TAU=Math.PI*2;
function surface(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
export function oval(p,x,y,rx,ry,color){p.fillStyle=color;p.beginPath();p.ellipse(x,y,rx,ry,0,0,TAU);p.fill();}
function shade(p,top,bottom,height){const g=p.createLinearGradient(0,-height,0,height);g.addColorStop(0,top);g.addColorStop(1,bottom);return g;}
function hull(p,color,dark){p.fillStyle=shade(p,color,dark,22);p.beginPath();p.moveTo(-45,-3);p.quadraticCurveTo(-35,25,26,19);p.lineTo(46,-7);p.quadraticCurveTo(0,1,-45,-3);p.fill();}
export function createAlienVisual(type,config,balance){
  const palette=config.visuals.palette;
  const c=surface(100,88),p=c.getContext('2d'),v=config.visuals,color=balance.alienColors[type];p.translate(50,44);
  oval(p,0,8,41,21,palette.halo);
  if(type===1){p.fillStyle=palette.armor;p.fillRect(-33,-3,66,21);p.strokeStyle=color;p.lineWidth=4;p.strokeRect(-30,0,60,16);}
  if(type===3){p.strokeStyle=color;p.lineWidth=5;for(let i=-1;i<=1;i+=2){p.beginPath();p.moveTo(i*20,8);p.lineTo(i*37,21);p.lineTo(i*42,12);p.stroke();}}
  if(type===4){oval(p,-29,-6,10,22,color);oval(p,29,-6,10,22,color);}
  p.fillStyle=shade(p,palette.pearl,color,28);p.beginPath();p.ellipse(0,-9,type===1?23:19,20,0,Math.PI,TAU);p.fill();
  oval(p,0,2,34,type===2?10:15,shade(p,color,palette.alienTrim,22));
  oval(p,0,-9,21,14,palette.eyeGlass);
  for(let i=-1;i<=1;i+=2){oval(p,i*8,-10,6,8,palette.pupil);oval(p,i*8+2,-12,2,3,palette.white);}
  p.strokeStyle=palette.alienTrim;p.lineWidth=2;p.beginPath();p.arc(0,-3,5,0,Math.PI);p.stroke();
  for(let i=-1;i<=1;i++){oval(p,i*21,8,4,3,color);oval(p,i*21,7,2,1,palette.white);}
  if(type===2){p.strokeStyle=color;p.lineWidth=4;p.beginPath();p.moveTo(-34,4);p.lineTo(-44,-13);p.lineTo(-21,-4);p.moveTo(34,4);p.lineTo(44,-13);p.lineTo(21,-4);p.stroke();}
  for(let side=-1;side<=1;side+=2){p.strokeStyle=color;p.lineWidth=2;p.beginPath();p.moveTo(side*12,-22);p.quadraticCurveTo(side*24,-28,side*20,-35);p.stroke();oval(p,side*20,-35,3,3,palette.cockpitShine);}
  p.strokeStyle=color;p.lineWidth=3;p.beginPath();p.moveTo(0,-27);p.lineTo(5,-34);p.stroke();oval(p,5,-34,4,4,color);
  return c;
}
export function createSpacecraftVisual(config){
  const palette=config.visuals.palette;
  const c=surface(100,110),p=c.getContext('2d');p.translate(50,55);
  p.fillStyle=shade(p,palette.shipPearl,palette.shipBlue,35);p.beginPath();p.moveTo(0,-37);p.bezierCurveTo(14,-17,12,-4,36,24);p.lineTo(10,18);p.lineTo(0,28);p.lineTo(-10,18);p.lineTo(-36,24);p.bezierCurveTo(-12,-4,-14,-17,0,-37);p.fill();
  p.fillStyle=palette.gold;p.fillRect(-29,11,9,13);p.fillRect(20,11,9,13);oval(p,0,-4,9,19,palette.cockpit);oval(p,-2,-9,4,9,palette.cockpitShine);
  p.strokeStyle=palette.ivory;p.lineWidth=2;p.beginPath();p.moveTo(0,-32);p.lineTo(-10,13);p.moveTo(0,-32);p.lineTo(10,13);p.stroke();return c;
}
export function createFireSiteVisual(kind,config){
  const palette=config.visuals.palette;
  const c=surface(110,100),p=c.getContext('2d'),v=config.visuals;p.translate(55,74);
  oval(p,0,10,47,10,palette.shadow);
  if(kind==='tree'){
    p.fillStyle=palette.bark;p.fillRect(-6,-39,12,49);oval(p,-16,-42,23,28,palette.leafDark);oval(p,15,-45,26,31,palette.leaf);oval(p,-2,-64,24,23,palette.leafLight);
  }else if(kind==='car'){
    p.fillStyle=palette.carBody;p.beginPath();p.moveTo(-40,-19);p.lineTo(-23,-23);p.lineTo(-13,-42);p.lineTo(17,-42);p.lineTo(30,-24);p.lineTo(43,-18);p.lineTo(40,3);p.lineTo(-40,3);p.fill();
    p.fillStyle=palette.carGlass;p.fillRect(-10,-37,22,14);p.fillStyle=palette.glassFrame;p.fillRect(-3,-35,3,10);oval(p,-24,3,10,10,palette.tire);oval(p,25,3,10,10,palette.tire);oval(p,-24,3,4,4,palette.wheel);oval(p,25,3,4,4,palette.wheel);
  }else{
    p.fillStyle=kind==='warehouse'?palette.warehouse:palette.plaster;p.fillRect(-39,-42,78,50);p.fillStyle=kind==='warehouse'?palette.roof:palette.tile;p.beginPath();p.moveTo(-46,-42);p.lineTo(0,-71);p.lineTo(46,-42);p.closePath();p.fill();
    p.fillStyle=palette.window;if(kind==='warehouse')p.fillRect(-24,-29,48,37);else{p.fillRect(-28,-29,17,18);p.fillRect(13,-29,17,18);p.fillStyle=palette.door;p.fillRect(-5,-21,14,29);}
    p.fillStyle=palette.glass;p.fillRect(-26,-27,5,7);p.fillRect(15,-27,5,7);p.fillStyle=palette.plasterEdge;p.fillRect(-40,5,80,4);
    if(kind==='roof'){p.fillStyle=palette.chimney;p.fillRect(19,-71,11,26);}
  }return c;
}
export function createShipVisual(kind,config,variant={}){
  const a=config.visuals.palette,c=surface(132,126),p=c.getContext('2d'),color=variant.hull||(kind==='player'?a.playerHull:kind==='boss'?a.bossHull:a.enemyHull);p.translate(66,76);if(variant.beam)p.scale(variant.beam*.85,variant.length*.72);
  function face(points,fill){p.fillStyle=fill;p.beginPath();for(let i=0;i<points.length;i++){if(i)p.lineTo(...points[i]);else p.moveTo(...points[i]);}p.closePath();p.fill();}
  oval(p,0,28,46,10,a.shadow);
  face([[-36,17],[0,-53],[40,10],[30,42],[-29,45]],a.hullShade);
  face([[-36,8],[0,-61],[40,0],[30,28],[-29,31]],color);
  face([[-30,7],[0,-55],[34,1],[26,23],[-24,26]],a.deck);
  face([[-17,-17],[6,-31],[23,-14],[-1,0]],a.cabinGlass);
  face([[-17,-17],[-1,0],[-1,22],[-17,7]],a.cabin);
  face([[-1,0],[23,-14],[23,10],[-1,22]],color);
  face([[-16,-20],[5,-35],[25,-16],[-1,1]],a.ivory);
  face([[-10,-23],[4,-32],[17,-21],[3,-12]],a.cabin);
  face([[-9,-23],[3,-12],[3,-5],[-9,-16]],a.cabinGlass);
  face([[3,-12],[17,-21],[17,-13],[3,-5]],a.glass);
  p.strokeStyle=a.mast;p.lineWidth=3;p.beginPath();p.moveTo(4,-25);p.lineTo(4,-69);p.moveTo(-5,-58);p.lineTo(15,-58);p.stroke();face([[5,-67],[27,-61],[5,-54]],color);
  oval(p,-1,-42,9,5,a.turret);p.save();p.translate(-1,-42);p.rotate(-.2);p.fillStyle=a.cannon;p.fillRect(-3,-20,7,21);p.fillStyle=a.ivory;p.fillRect(-3,-21,7,3);p.restore();
  p.fillStyle=a.cannon;p.fillRect(13,-7,8,15);oval(p,17,-7,5,3,a.gold);
  p.strokeStyle=a.foam;p.lineWidth=1.5;p.beginPath();p.moveTo(-32,6);p.lineTo(0,-54);p.lineTo(35,0);p.stroke();
  for(let i=0;i<5;i++){const y=3+i*5;p.strokeStyle=a.mast;p.beginPath();p.moveTo(-31+i,y);p.lineTo(-31+i,y-6);p.stroke();}
  p.strokeStyle=a.gold;p.lineWidth=3;p.beginPath();p.ellipse(-18,14,5,7,-.3,0,TAU);p.stroke();return c;
}
export function createGameArt(id,config,balance){
  const palette=config.visuals.palette;
  const c=surface(config.width,config.height),p=c.getContext('2d'),v=config.visuals,w=c.width,h=c.height;
  const g=p.createLinearGradient(0,0,0,h);
  if(id==='alienDefense'){
    g.addColorStop(0,palette.spaceTop);g.addColorStop(.6,palette.spaceMiddle);g.addColorStop(1,palette.spaceBottom);p.fillStyle=g;p.fillRect(0,0,w,h);
    for(let i=0;i<3;i++){const r=p.createRadialGradient(70+i*125,150+i*83,0,70+i*125,150+i*83,140);r.addColorStop(0,i%2?palette.nebulaPurple:palette.nebulaTeal);r.addColorStop(1,palette.transparent);p.fillStyle=r;p.fillRect(0,0,w,h);}
    oval(p,315,325,80,80,v.planetColor);oval(p,332,310,73,74,palette.planetLight);oval(p,323,303,14,8,palette.crater);oval(p,350,340,20,12,palette.crater);
    oval(p,65,90,24,24,palette.spaceMiddle);p.strokeStyle=palette.nebulaTeal;p.lineWidth=6;p.beginPath();p.ellipse(65,90,39,10,-.35,0,TAU);p.stroke();oval(p,242,55,9,9,v.planetColor);
    return {backdrop:c,aliens:balance.enemyTypes.map((_,i)=>createAlienVisual(i,config,balance)),player:createSpacecraftVisual(config)};
  }
  if(id==='fireRescue'){
    g.addColorStop(0,palette.fireSkyTop);g.addColorStop(.65,palette.fireSkyMiddle);g.addColorStop(1,palette.fireSkyBottom);p.fillStyle=g;p.fillRect(0,0,w,h);
    for(let i=0;i<6;i++){p.fillStyle=palette.skyline;p.fillRect(i*68,60+(i%3)*9,45,62);}
    p.fillStyle=v.ground;p.fillRect(0,125,w,h-125);p.fillStyle=v.street;p.fillRect(0,195,w,30);p.fillRect(0,297,w,30);p.fillRect(0,395,w,38);
    p.strokeStyle=palette.roadMark;p.lineWidth=2;p.setLineDash([12,16]);for(let y=211;y<430;y+=101){p.beginPath();p.moveTo(0,y);p.lineTo(w,y);p.stroke();}p.setLineDash([]);
    const sites={};for(const site of balance.sites){sites[site.kind]||=createFireSiteVisual(site.kind,config);p.drawImage(sites[site.kind],site.x-55,site.y-65,110,100);}
    return {backdrop:c,truck:createTruckVisual(config)};
  }
  g.addColorStop(0,palette.seaSkyTop);g.addColorStop(.68,palette.seaSkyMiddle);g.addColorStop(1,palette.seaSkyBottom);p.fillStyle=g;p.fillRect(0,0,w,h);
  oval(p,290,69,28,28,palette.sun);for(let i=0;i<3;i++){oval(p,60+i*120,85+i*24,30,8,palette.cloud);}
  p.fillStyle=palette.distantIsland;p.beginPath();p.moveTo(0,balance.waterY);p.lineTo(50,balance.waterY-38);p.lineTo(110,balance.waterY);p.lineTo(235,balance.waterY);p.lineTo(280,balance.waterY-24);p.lineTo(w,balance.waterY);p.fill();
  const sea=p.createLinearGradient(0,balance.waterY,0,h);sea.addColorStop(0,palette.waterTop);sea.addColorStop(1,palette.waterBottom);p.fillStyle=sea;p.fillRect(0,balance.waterY,w,h-balance.waterY);
  return {backdrop:c,player:createShipVisual('player',config),enemies:balance.shipTypes.map(type=>createShipVisual('enemy',config,type)),boss:createShipVisual('boss',config,balance.boss)};
}
export function drawHealthBar(p,x,y,width,height,value,max,config){
  const ratio=Math.max(0,Math.min(1,value/Math.max(1,max))),v=config.visuals;
  p.fillStyle=v.hpBack;p.fillRect(x-2,y-2,width+4,height+4);p.fillStyle=ratio>.5?v.hpGood:ratio>.25?v.hpWarn:v.hpDanger;p.fillRect(x,y,width*ratio,height);
}

/** Original truck artwork, baked once; articulated crew are drawn separately. */
export function createTruckVisual(config){
  const c=surface(180,100),p=c.getContext('2d'),a=config.visuals.palette;
  oval(p,90,86,83,10,a.shadow);
  p.fillStyle=a.enemyHull;p.beginPath();p.moveTo(9,30);p.lineTo(113,30);p.lineTo(118,15);p.lineTo(151,15);p.lineTo(172,39);p.lineTo(172,77);p.lineTo(9,77);p.closePath();p.fill();
  p.fillStyle=a.cabinGlass;p.beginPath();p.moveTo(124,21);p.lineTo(148,21);p.lineTo(163,40);p.lineTo(124,40);p.fill();
  p.fillStyle=a.ivory;p.fillRect(9,51,164,9);p.fillStyle=a.cannon;p.fillRect(18,37,31,12);p.fillRect(54,37,31,12);p.fillRect(91,37,20,12);
  p.strokeStyle=a.ivory;p.lineWidth=3;for(let x=18;x<111;x+=11){p.beginPath();p.moveTo(x,17);p.lineTo(x,28);p.stroke();}p.beginPath();p.moveTo(14,17);p.lineTo(114,17);p.moveTo(14,27);p.lineTo(114,27);p.stroke();
  for(let x=37;x<=144;x+=107){oval(p,x,78,15,16,a.tire);oval(p,x,78,8,8,a.wheel);oval(p,x,78,3,3,a.ivory);}
  p.fillStyle=a.cockpitShine;p.fillRect(130,8,21,8);p.fillStyle=a.gold;p.fillRect(162,49,11,9);p.fillStyle=a.metal||a.cannon;p.fillRect(20,65,85,9);
  p.strokeStyle=a.gold;p.lineWidth=5;p.beginPath();p.arc(73,63,11,0,Math.PI*2);p.stroke();p.fillStyle=a.ivory;p.fillRect(167,68,10,8);return c;
}

/** Rounded, clothed figures with independent shoulders, elbows, hips and knees. */
export function drawCrew(p,x,y,time,config,firefighter=false,walking=false,aim=0){
  const a=config.visuals.palette,step=walking?Math.sin(time*8)*7:Math.sin(time*2)*1.5;
  p.save();p.translate(x,y);oval(p,0,4,13,4,a.shadow);p.lineCap='round';
  p.strokeStyle=a.cannon;p.lineWidth=7;
  for(let side=-1;side<=1;side+=2){p.beginPath();p.moveTo(side*4,-16);p.lineTo(side*5+step*side*.5,-7);p.lineTo(side*6-step*side,1);p.stroke();}
  p.fillStyle=firefighter?a.uniform:a.carBody;p.beginPath();p.roundRect(-10,-37,20,23,6);p.fill();
  p.strokeStyle=firefighter?a.gold:a.ivory;p.lineWidth=3;p.beginPath();p.moveTo(-9,-23);p.lineTo(9,-23);p.stroke();
  p.strokeStyle=firefighter?a.uniform:a.carBody;p.lineWidth=6;
  for(let side=-1;side<=1;side+=2){p.beginPath();p.moveTo(side*8,-32);p.lineTo(side*13,-25+step*side*.4);p.lineTo(firefighter?Math.cos(aim)*16:side*15,firefighter?-30+Math.sin(aim)*9:-38-step*side);p.stroke();}
  oval(p,0,-44,8,10,a.skin);oval(p,-3,-46,1,1.5,a.pupil);oval(p,3,-46,1,1.5,a.pupil);
  if(firefighter){oval(p,0,-51,11,5,a.helmet);p.fillStyle=a.helmet;p.fillRect(-8,-54,16,7);}else{oval(p,0,-52,8,4,a.bark);}
  p.restore();
}

/** Ammunition icons are baked into small canvases once, with no asset requests. */
export function createAmmoVisual(index,config){
  const c=surface(44,28),p=c.getContext('2d'),a=config.visuals.palette;
  const shell=(x,y,color)=>{p.fillStyle=color;p.beginPath();p.roundRect(x,y,10,20,[6,6,2,2]);p.fill();p.fillStyle=a.cannon;p.fillRect(x,y+15,10,3);};
  if(index===2){p.fillStyle=a.cockpitShine;p.beginPath();p.ellipse(22,14,19,6,0,0,TAU);p.fill();p.fillStyle=a.cannon;p.fillRect(3,6,6,16);}
  else {shell(index===1?11:17,4,index===3?a.healShell:a.gold);if(index===1)shell(24,1,a.ivory);if(index===3){p.fillStyle=a.ivory;p.fillRect(20,8,3,10);p.fillRect(17,11,9,3);}}
  c.setAttribute('aria-hidden','true');return c;
}
