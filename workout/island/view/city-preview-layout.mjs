/** Pure layout for the read-only "full city" preview (`?cityPreview=full|half|empty`).
 * Nothing here touches the engine, the save or the DOM: it only returns a list of
 * building rows ({id,typeId,level,x,z}) for the view to draw. */
export const PREVIEW_MODES=Object.freeze(['full','half','empty']);
/** Footprints used only by the preview. In the real game most buildings are 1x1, which shrinks a
 * 50 m hospital or a 60 m stadium to a toy; here they get the room their models were made for. */
export const PREVIEW_FOOTPRINT=Object.freeze({
  factory:[3,3],hospital:[3,3],school:[3,3],mathLab:[3,3],powerPlant:[3,3],soccer:[4,4],
  park:[2,2],fireStation:[2,2],police:[2,2],cityHall:[2,2],library:[2,2]
});
export const PREVIEW_SIZE=32;
const LINE_FIRST=2,LINE_STEP=7,BLOCK=6;
/** Road lines for the 32x32 plan: x or z = 2, 9, 16, 23, 30. */
export const roadLines=(size=PREVIEW_SIZE)=>{const lines=[];for(let v=LINE_FIRST;v<size;v+=LINE_STEP)lines.push(v);return lines;};

/** Block templates, 6x6 cells. [typeId, level, dx, dz]; unlisted cells get `fill`. */
const TEMPLATES={
  homes:   {items:[['park',1,2,2]],fill:'house',trees:.1},
  towers:  {items:[['park',2,2,2]],fill:'house',tall:true,trees:.06},
  // Buildings that are not in the game catalogue yet (props from the 58 city models): mall, skyscraper, office, hotel, cinema.
  downtown:{items:[],props:[[13,0,0,3,2,2.2],[15,4,0,2,2,6.2],[14,0,3,2,2,3.4],[16,2,3,2,2,3.6],[38,4,3,2,2,2.2]],fill:'shop'},
  market:  {items:[['shop',1,1,1],['shop',1,4,1],['shop',1,1,4],['shop',1,4,4],['park',2,2,2]],fill:'house',trees:.1},
  factory: {items:[['factory',2,0,0],['factory',1,3,0],['factory',3,0,3],['factory',2,3,3]],fill:null},
  silos:   {items:[['factory',3,0,0],['factory',1,3,0],['factory',2,0,3],['waterTower',1,5,5]],fill:null},
  power:   {items:[['powerPlant',1,0,0],['factory',2,3,3],['waterTower',1,5,0]],fill:'house',trees:.2},
  care:    {items:[['hospital',1,0,0],['police',1,4,0],['fireStation',1,4,3],['house',1,0,4],['house',1,1,4],['house',1,2,4]],fill:null},
  learn:   {items:[['school',1,0,0],['mathLab',1,3,0],['library',1,0,4],['park',1,3,4]],fill:null},
  civic:   {items:[['cityHall',1,2,2],['library',1,0,0],['police',1,4,0],['fireStation',1,0,4],['park',2,4,4]],fill:'house'},
  stadium: {items:[['soccer',1,1,1]],fill:'house'},
  mixed:   {items:[['school',1,0,0],['park',1,4,0],['shop',1,3,3],['shop',1,4,3]],fill:'house',trees:.1}
};
/** Which template goes in each of the 4x4 blocks (rows = z, columns = x). */
const PLAN=[
  ['homes','downtown','market','factory'],
  ['towers','civic','learn','silos'],
  ['homes','stadium','care','power'],
  ['mixed','homes','market','factory']
];
/** Industry sits on the east side, towers in the middle, houses and parks on the west. */
const hash=(a,b,c=0)=>{let h=(a*73856093)^(b*19349663)^(c*83492791);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967296;};
const levelFor=(block,x,z,tall)=>{
  const centre=Math.abs(x-PREVIEW_SIZE/2)+Math.abs(z-PREVIEW_SIZE/2);
  const r=hash(x,z,7);
  if(tall)return centre<12?(r<.4?4:3):(r<.5?3:2);
  return r<.7?1:r<.95?2:3;
};

/** All road rows for the plan (full grid, one row per cell). */
export function previewRoads(size=PREVIEW_SIZE){
  const lines=roadLines(size),rows=[],first=lines[0],last=lines[lines.length-1],seen=new Set();
  const add=(x,z)=>{const k=`${x},${z}`;if(!seen.has(k)){seen.add(k);rows.push({id:`pr${rows.length}`,typeId:'road',level:1,x,z});}};
  for(const line of lines)for(let v=first;v<=last;v++){add(v,line);add(line,v);}
  return rows;
}

/** The plan once: game buildings (`rows`), preview-only model props (`props`, from the 58 city models), trees and rocks. */
const planCache=new Map();
export function previewPlan(size=PREVIEW_SIZE){
  if(planCache.has(size))return planCache.get(size);
  const lines=roadLines(size),rows=[],props=[],trees=[];
  for(let bz=0;bz<lines.length-1;bz++)for(let bx=0;bx<lines.length-1;bx++){
    const template=TEMPLATES[PLAN[bz]?.[bx]];if(!template)continue;
    const ox=lines[bx]+1,oz=lines[bz]+1,taken=new Set();
    const take=(dx,dz,w,d)=>{for(let i=0;i<w;i++)for(let j=0;j<d;j++)taken.add(`${dx+i},${dz+j}`);};
    const put=(typeId,level,dx,dz)=>{
      const [w,d]=PREVIEW_FOOTPRINT[typeId]||[1,1];take(dx,dz,w,d);
      rows.push({id:`pb${rows.length}`,typeId,level,x:ox+dx,z:oz+dz,large:w*d>1,block:`${bx},${bz}`});
    };
    for(const [typeId,level,dx,dz] of template.items)put(typeId,level,dx,dz);
    for(const [model,dx,dz,w,d,h] of template.props||[]){take(dx,dz,w,d);props.push({model,x:ox+dx,z:oz+dz,w,d,h});}
    if(template.fill)for(let dz=0;dz<BLOCK;dz++)for(let dx=0;dx<BLOCK;dx++){
      if(taken.has(`${dx},${dz}`))continue;
      if(template.trees&&hash(ox+dx,oz+dz,11)<template.trees){taken.add(`${dx},${dz}`);trees.push({model:[41,42,44,42][Math.floor(hash(ox+dx,oz+dz,5)*4)],x:ox+dx+.5,z:oz+dz+.5,scale:.85+hash(ox+dx,oz+dz,9)*.4});continue;}
      put(template.fill,levelFor(template,ox+dx,oz+dz,template.tall),dx,dz);
    }
  }
  // Rocks on the grass outside the ring road, traffic lights at four crossings and a small bridge on the west road end.
  const rocks=[[1,6],[1,21],[31,11],[31,26],[9,1],[23,31],[17,31]].filter(([x,z])=>x<size&&z<size).map(([x,z],i)=>({model:45,x:x+.5,z:z+.5,scale:.7+hash(x,z,2)*.5,rot:i}));
  const lights=[];for(const [x,z] of [[9,16],[16,16],[23,16],[16,9]])lights.push({model:55,x:x+.25,z:z+.25},{model:55,x:x+.75,z:z+.75,rot:Math.PI});
  const bridge={model:53,x:0.5,z:16.5,w:3,d:1,h:1.2,rot:Math.PI/2};
  const plan={rows,props,trees,rocks,lights,bridge};planCache.set(size,plan);return plan;
}
export const previewBuildings=(size=PREVIEW_SIZE)=>previewPlan(size).rows;

/** Rows for one mode. `half` keeps every large/civic building and about half of the small ones. */
export function previewState(mode='full',size=PREVIEW_SIZE){
  if(mode==='empty')return {size,buildings:Array.from({length:9},(_,i)=>({id:`pe${i}`,typeId:'road',level:1,x:3+i,z:7}))};
  const roads=previewRoads(size),all=previewBuildings(size);
  const buildings=mode==='half'?all.filter(row=>row.large||hash(row.x,row.z,3)<.5):all;
  return {size,buildings:[...roads,...buildings]};
}

/** True when two preview rows overlap or fall outside the island (used by tests). */
export function layoutProblems(rows,size=PREVIEW_SIZE){
  const cells=new Map(),problems=[];
  const plan=previewPlan(size);
  const all=[...rows,...(rows.some(r=>r.typeId!=='road')?plan.props.map(p=>({...p,typeId:'prop'+p.model,fp:[p.w,p.d]})):[])];
  for(const row of all){
    const [w,d]=row.fp||(row.typeId==='road'?[1,1]:PREVIEW_FOOTPRINT[row.typeId]||[1,1]);
    for(let i=0;i<w;i++)for(let j=0;j<d;j++){
      const x=row.x+i,z=row.z+j,key=`${x},${z}`;
      if(x<0||z<0||x>=size||z>=size)problems.push(`outside ${row.typeId} ${key}`);
      if(cells.has(key))problems.push(`overlap ${row.typeId} ${row.id} with ${cells.get(key)} at ${key}`);
      cells.set(key,`${row.typeId} ${row.id}`);
    }
  }
  return problems;
}
