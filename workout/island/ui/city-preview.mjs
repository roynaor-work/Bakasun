import {PreviewProps} from '../view/city-preview-props.mjs?v=island-v2-20261107-5';
import {PREVIEW_FOOTPRINT,PREVIEW_MODES,previewState,previewPlan} from '../view/city-preview-layout.mjs?v=island-v2-20261107-5';

/** `?cityPreview=full|half|empty` shows a made-up city on top of the real view. Read only:
 * the engine gets a storage that can read but never write, the view is pinned to the
 * preview rows, and leaving the mode just reloads the page without the flag. */
export const previewMode=(search=globalThis.location?.search||'')=>{
  const value=new URLSearchParams(search).get('cityPreview');
  return value===''||value==='1'?'full':PREVIEW_MODES.includes(value)?value:null;
};

/** Reads pass through to the real storage; every write or removal is dropped. */
export function readOnlyStorage(real){
  return {
    getItem:key=>real.getItem(key),setItem(){},removeItem(){},clear(){},
    key:index=>real.key(index),get length(){return real.length;}
  };
}

/** Below this camera zoom the light model copies are used. */
export const LOD_ZOOM=2.2;
const SMALL_MARGIN={house:.78,shop:.8,waterTower:.8};
const TEXT={full:'מלאה',half:'חצי מלאה',empty:'ריקה',tour:'סיבוב',photo:'צילום',exit:'יציאה',title:'תצוגת עיר (קריאה בלבד)'};
const STYLE=`
#city-preview-bar{position:fixed;inset-block-start:calc(6px + env(safe-area-inset-top));inset-inline:0;display:flex;gap:6px;justify-content:center;align-items:center;z-index:9000;pointer-events:none;direction:rtl;font:600 13px/1 Assistant,system-ui,sans-serif}
#city-preview-bar>*{pointer-events:auto}
#city-preview-bar .cp-title{background:rgba(20,28,36,.78);color:#f4e7be;padding:9px 12px;border-radius:999px}
#city-preview-bar button{min-height:40px;min-width:40px;padding:0 14px;border:0;border-radius:999px;background:rgba(255,255,255,.88);color:#17303a;font:inherit;box-shadow:0 1px 4px rgba(0,0,0,.25)}
#city-preview-bar button[aria-pressed=true]{background:#f0c75e}
#city-preview-bar .cp-exit{background:#17303a;color:#fff}
html[data-city-preview] #interface>*,html[data-city-preview] #modal-root{display:none!important}
html[data-city-photo] #city-preview-bar{display:none}
html[data-city-photo] #city-preview-photo{display:block}
#city-preview-photo{display:none;position:fixed;inset-block-end:8px;inset-inline-start:8px;z-index:9000;opacity:.0;width:48px;height:48px;border:0;background:transparent}
`;

export function installCityPreview({view,engine,mode='full',documentRef=document,locationRef=location,raf=globalThis.requestAnimationFrame?.bind(globalThis)}){
  const root=documentRef.documentElement;root.dataset.cityPreview=mode;
  const style=documentRef.createElement('style');style.textContent=STYLE;documentRef.head.append(style);
  const state={mode,rows:null,world:null};
  const original={setWorld:view.setWorld.bind(view),definition:view.definition.bind(view)};
  // Larger footprints for the big buildings; everything else is the registry's own record.
  // Small houses and shops get a smaller share of their plot so the street shows yards instead of a solid wall.
  view.definition=id=>{const record=original.definition(id);const footprint=PREVIEW_FOOTPRINT[id];if(!record)return record;const margin=SMALL_MARGIN[id];return footprint||margin?{...record,...(footprint?{footprint}:{}),...(margin?{footprintMargin:margin}:{})}:record;};
  const props=new PreviewProps(view);
  const showProps=()=>{if(state.mode==='empty')props.clear();else props.show(previewPlan(),{lod:Boolean(lodOn),half:state.mode==='half'});};
  const build=next=>{
    state.mode=next;root.dataset.cityPreview=next;const plan=previewState(next);
    state.world={...engine.state,world:{...engine.state.world,size:plan.size},buildings:plan.buildings};
    original.setWorld(state.world,true);if(lodOn!==null)shadows(lodOn);view.home?.();
    showProps();
    for(const button of bar.querySelectorAll('[data-mode]'))button.setAttribute('aria-pressed',String(button.dataset.mode===next));
    return plan.buildings.length;
  };
  // The interface keeps calling view.setWorld(engine.state); keep the view on the preview rows.
  view.setWorld=(_,force)=>{if(state.world){original.setWorld(state.world,force);if(lodOn)shadows(true);}};
  const bar=documentRef.createElement('div');bar.id='city-preview-bar';
  bar.innerHTML=`<span class="cp-title">${TEXT.title} · <span data-fps>--</span></span>`+PREVIEW_MODES.map(m=>`<button type="button" data-mode="${m}" aria-pressed="false">${TEXT[m]}</button>`).join('')
    +`<button type="button" data-tour aria-pressed="false">${TEXT.tour}</button><button type="button" data-photo>${TEXT.photo}</button><button type="button" class="cp-exit" data-exit>${TEXT.exit}</button>`;
  documentRef.body.append(bar);
  const photo=documentRef.createElement('button');photo.id='city-preview-photo';photo.type='button';photo.setAttribute('aria-label','חזרה מהצילום');documentRef.body.append(photo);
  // Live frame rate in the title, so the phone check can read it off the screen.
  let frames=0,since=performance.now(),fpsFrame=0;
  const fpsLoop=now=>{frames++;if(now-since>=1000){const el=bar.querySelector('[data-fps]');if(el)el.textContent=Math.round(frames*1000/(now-since))+' fps';frames=0;since=now;}fpsFrame=raf(fpsLoop);};
  fpsFrame=raf(fpsLoop);
  let touring=false,last=0,frame=0;
  const spin=now=>{if(!touring)return;const dt=Math.min(.1,(now-last)/1000||0);last=now;view.angle+=dt*.16;view.updateCamera?.();frame=raf(spin);};
  const setTour=on=>{touring=on;bar.querySelector('[data-tour]').setAttribute('aria-pressed',String(on));if(on){last=performance.now();frame=raf(spin);}};
  bar.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.dataset.mode)build(button.dataset.mode);
    else if('tour' in button.dataset)setTour(!touring);
    else if('photo' in button.dataset){root.dataset.cityPhoto='';}
    else if('exit' in button.dataset){const url=new URL(locationRef.href);url.searchParams.delete('cityPreview');locationRef.replace(url.href);}
  });
  photo.addEventListener('click',()=>{delete root.dataset.cityPhoto;});
  view.avatar?.holder&&(view.avatar.holder.visible=false);
  // Distant buildings use the light model copies; close up (zoom) or in photo mode the full ones. `?cityLod=0` = always full.
  const lodAllowed=!/[?&]cityLod=0(?:&|$)/.test(locationRef.search||'');
  const wantLod=()=>lodAllowed&&!('cityPhoto' in root.dataset)&&view.zoom<LOD_ZOOM;
  // Light mode: light models, light street planting and palms, no real shadows from the small buildings (the soft contact shadows stay).
  const applyLod=want=>{
    view.cityModels.lod=want;view.cityStreets.lodPalms=want;view.streetQuality=want?'low':null;
    view.cityStreets.onPalmLod=()=>{if(state.world)view.syncCity(state.world.buildings,true);};
    original.setWorld(state.world,false);view.syncCity(state.world.buildings,true);shadows(want);showProps();
  };
  const shadows=want=>view.buildingRoot.traverse(m=>{if(m.isMesh)m.castShadow=!want;});
  let lodOn=null;
  const syncLod=()=>{const want=wantLod();if(want!==lodOn&&state.world){lodOn=want;applyLod(want);}};
  const lodTimer=setInterval(syncLod,400);
  const count=build(mode);syncLod();
  return {state,build,setTour,count,dispose(){cancelAnimationFrame?.(fpsFrame);props.dispose();clearInterval(lodTimer);view.cityModels.lod=false;view.cityStreets.lodPalms=false;view.streetQuality=null;touring=false;cancelAnimationFrame?.(frame);bar.remove();photo.remove();style.remove();delete root.dataset.cityPreview;delete root.dataset.cityPhoto;view.setWorld=original.setWorld;view.definition=original.definition;}};
}
