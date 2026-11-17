/** City buildings and vehicles drawn from the 58 compressed Meshy models in
 * assets/models/city. Nothing is loaded until the city actually contains a
 * mapped building; a model that fails to load falls back to the older model or
 * to the procedural building. `?cityModels=0` turns the whole layer off. */
export const CITY_DIR='assets/models/city/';
export const TILE_METERS=6.4;      // 1 city tile; the sedan (4.6 m) is then the old .72-tile car
export const FOOTPRINT_MARGIN=.92; // a model never fills more than 92% of its plot
export const MAX_HEIGHT_TILES=3.4;
/** id -> [file, suggested longest side in metres] (from assets/models/city/catalog.json). */
export const CITY_FILES=Object.freeze({
  1:['01-small-house-red-roof',11],4:['04-duplex-house',14],5:['05-apartment-4-floors',22],7:['07-residential-tower',30],
  9:['09-corner-shop',12],19:['19-factory-with-chimney',40],20:['20-warehouse',36],21:['21-industrial-silos',28],
  22:['22-power-plant',60],25:['25-water-tower',20],28:['28-fire-station',26],29:['29-police-station',26],30:['30-hospital',50],
  31:['31-school-building',36],32:['32-university-building',50],33:['33-library',24],34:['34-town-hall',30],35:['35-small-stadium',60],
  39:['39-park-with-fountain',34],40:['40-playground',20],47:['47-sedan-car',4.6],49:['49-fire-truck',9],50:['50-police-car',4.8],51:['51-ambulance',6],52:['52-taxi',4.6]
});
/** building id -> model id, or one model id per level (shorter lists repeat the last). */
export const CITY_MAP=Object.freeze({
  house:[1,4,5,7],shop:[9],factory:[20,19,21],park:[40,39,39],fireStation:[28],waterTower:[25],hospital:[30],school:[31],police:[29],
  soccer:[35],cityHall:[34],library:[33],mathLab:[32],powerPlant:[22]
});
/** Cars on the road network, in the order they are dealt out. */
export const CITY_CARS=Object.freeze([47,52,50,51]);
export const cityModelsEnabled=(search=globalThis.location?.search||'',flags={})=>flags.cityModels!==false&&!/[?&]cityModels=0(?:&|$)/.test(search);
/** `lod` picks the light copy (about a third of the triangles, 256 px texture) built by tools/city-models-lod.mjs. */
export const LOD_DIR=CITY_DIR+'lod/';
export const cityModelPath=(id,lod=false)=>CITY_FILES[id]?(lod?LOD_DIR:CITY_DIR)+CITY_FILES[id][0]+'.glb':null;
export const modelIdFor=(buildingId,level=1)=>{const list=CITY_MAP[buildingId];return list?list[Math.min(Math.max(1,level),list.length)-1]:null;};

/** Spec for one building at one level: sized from the model's own bounds so it fits its plot. */
export function citySpec(record,level=1,old=null,lod=false){
  const id=modelIdFor(record.id,level),path=id&&cityModelPath(id,lod);if(!path)return null;
  const [w,d]=record.footprint||[1,1],meters=CITY_FILES[id][1],margin=record.footprintMargin??FOOTPRINT_MARGIN;
  return {path,rotationY:0,scale:1,fit:{box:{length:meters/TILE_METERS,w:w*margin,d:d*margin,h:MAX_HEIGHT_TILES}},...(old?{fallback:old}:{})};
}
/** Vehicles face -X like the original car, so the same quarter turn applies. */
export function carSpec(id,old=null){
  const path=cityModelPath(id);if(!path)return null;
  return {path,rotationY:-90,scale:1,fit:{box:{length:CITY_FILES[id][1]/TILE_METERS}},...(old?{fallback:old}:{})};
}

export class CityModels{
  constructor(models,{enabled=true}={}){this.models=models;this.enabled=enabled;this.requested=new Set();this.onLoaded=()=>{};}
  maps(buildingId){return this.enabled&&Boolean(CITY_MAP[buildingId]);}
  oldSpec(record,level){return record.levels?.[level-1]?.model??record.model??null;}
  /** With `lod` on, the light copy is wanted; until it has loaded the full one (if already here) keeps standing, and the other way round. */
  spec(record,level=1){
    if(!this.maps(record.id))return null;
    const old=this.oldSpec(record,level),want=citySpec(record,level,old,this.lod);
    if(!want||this.models.assets.has(want.path))return want;
    const other=citySpec(record,level,old,!this.lod);
    return other&&this.models.assets.has(other.path)?{...other,wanted:want}:want;
  }
  /** Starts loading the model once; calls onLoaded when it (or its fallback) is ready. */
  request(record,level=1){
    const spec=this.spec(record,level),target=spec?.wanted||spec;if(!target||this.requested.has(target.path))return;
    this.requested.add(target.path);this.models.load(target).then(ok=>{if(ok)this.onLoaded(target);});
  }
  /** Which file is actually drawn now: '' while loading (procedural) or when nothing is mapped. */
  key(record,level=1){
    const spec=this.spec(record,level);if(!spec)return '';
    if(this.models.assets.has(spec.path))return spec.path;
    return spec.fallback&&this.models.has(spec.fallback)?spec.fallback.path:'';
  }
  /** A copy of the record whose model for this level is the new spec. */
  recordFor(record,level=1){
    const spec=this.spec(record,level);if(!spec)return record;
    return {...record,model:spec,levels:(record.levels||[]).map((row,i)=>i===level-1?{...row,model:spec}:row)};
  }
}
