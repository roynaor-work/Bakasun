import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from '../workout/island/vendor/three.module.js';
import {ReadyPlotsInterface,readyPlotsActive} from '../workout/island/ui/ready-plots.mjs';
import {ReadyPlotsView} from '../workout/island/view/ready-plots.mjs';
import {IslandView} from '../workout/island/view/island-view.mjs';
import {IslandInterface} from '../workout/island/ui/interface.mjs';
import {CityManagementInterface} from '../workout/island/ui/city-management.mjs';
import {createTranslator} from '../workout/island/ui/translate.mjs';
import {loadData} from '../workout/island/engine/load-data.mjs';
import {createEngine} from '../workout/island/engine/engine.mjs';

const strings=JSON.parse(await readFile(new URL('../workout/island/data/strings.he.json',import.meta.url),'utf8'));
class Element{
  constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.attributes={};this.classList={add(){}};this.style={setProperty(){}};}
  setAttribute(key,value){this.attributes[key]=String(value);}
  append(...items){for(const item of items){item.parentElement=this;this.children.push(item);}}
  replaceChildren(...items){this.children=[];this.append(...items);}
}
const installDOM=()=>{const old=globalThis.document;globalThis.document={createElement:tag=>new Element(tag)};return ()=>{globalThis.document=old;};};
const findAction=(node,action)=>node.dataset?.action===action?node:node.children?.map(child=>findAction(child,action)).find(Boolean);
function fixture(){
  const types=new Map([['house',{id:'house',category:'basic',icon:'🏠',title:'building.house',cost:80}],['basketball',{id:'basketball',category:'sports',icon:'🏀',title:'building.basketball',cost:150}],['tennis',{id:'tennis',category:'sports',icon:'🎾',title:'building.tennis',cost:180}]]);
  const lots=[{id:'home-1',typeId:'house',x:2,z:3,w:2,d:2,color:'#57a97b',number:1,status:'available',ok:true},{id:'basket-1',typeId:'basketball',x:6,z:3,w:3,d:2,color:'#4f9bc4',number:2,status:'locked',reason:'reason.locked',ok:false},{id:'tennis-1',typeId:'tennis',x:11,z:3,w:3,d:2,color:'#adbf70',number:3,status:'unavailable',reason:'reason.money',ok:false}];
  let charges=0;const drawn=[],focus=[],selection=[];
  const engine={state:{readyPlan:{version:1,lots:structuredClone(lots)},buildings:[],money:100},readyPlots:()=>lots.filter(row=>!engine.state.buildings.some(b=>b.plot===row.id)).map(row=>({...row})),buildReadyPlot(id){const row=engine.readyPlots().find(row=>row.id===id);if(!row?.ok)return {ok:false,reason:row?.reason||'reason.invalid'};charges++;engine.state.money-=types.get(row.typeId).cost;const building={id:'built-'+id,typeId:row.typeId,plot:id,x:row.x,z:row.z};engine.state.buildings.push(building);return {ok:true,id:building.id};},readyPlotForType:id=>engine.readyPlots().find(row=>row.typeId===id)};
  engine.registry={buildings:types};engine.state.world={size:32,stage:0};
  const ui={engine,data:{featureFlags:{readyPlots:true}},t:createTranslator(strings,id=>assert.fail('missing translation '+id)),getBuilding:id=>types.get(id),label:type=>strings[type.title],view:{setReadyPlots:rows=>drawn.push(structuredClone(rows)),setReadyPlotSelection:id=>selection.push(id),focusReadyPlot:row=>focus.push(row.id),highlightCityBuildings(){}},cancelPlacement(){},closeDetails(){},closeInfo(){},setDockOpen(){},showInfo(){},toast(){},result(){},openModal(){this.modalCleanup?.();this.modalCleanup=null;const overlay=new Element('div');this.modal=new Element('section');overlay.append(this.modal);return this.modal;},closeModal(){this.modalCleanup?.();this.modalCleanup=null;this.modal=null;}};
  const ready=new ReadyPlotsInterface(ui);ui.readyPlots=ready;ready.refresh();return {ui,ready,engine,lots,drawn,focus,selection,get charges(){return charges;}};
}

test('catalog and whole-footprint taps open the dedicated lot without placement or a charge',()=>{
  const restore=installDOM();try{const f=fixture();const before=structuredClone(f.engine.state);IslandInterface.prototype.selectBuilding.call({...f.ui,readyPlots:f.ready},'house');assert.deepEqual(f.focus,['home-1']);assert.equal(f.charges,0);assert.deepEqual(f.engine.state,before);
    assert.equal(f.ready.selectCell({x:8,z:4}),true);assert.equal(f.focus.at(-1),'basket-1');assert.equal(findAction(f.ui.modal,'ready-plot-build').disabled,true);assert.equal(f.ready.selectCell({x:31,z:31}),false);
  }finally{restore();}
});

test('one confirmation builds once and removes only the occupied lot while preserving other coordinates and numbers',()=>{
  const restore=installDOM();try{const f=fixture(),original=f.engine.readyPlots();f.ready.show('home-1');const confirm=findAction(f.ui.modal,'ready-plot-build');confirm.onclick();confirm.onclick();assert.equal(f.charges,1);assert.equal(f.engine.state.money,20);assert.equal(f.ui.modal,null);assert.deepEqual(f.engine.readyPlots(),original.slice(1));assert.deepEqual(f.drawn.at(-1).map(row=>[row.id,row.x,row.z,row.number]),original.slice(1).map(row=>[row.id,row.x,row.z,row.number]));assert.equal(f.selection.at(-1),null);
  }finally{restore();}
});

test('a stale confirmation cannot charge when current availability has changed',()=>{
  const restore=installDOM();try{const f=fixture();f.ready.show('home-1');const confirm=findAction(f.ui.modal,'ready-plot-build');f.lots[0].ok=false;f.lots[0].status='unavailable';f.lots[0].reason='reason.money';confirm.onclick();assert.equal(f.charges,0);assert.equal(f.engine.state.money,100);assert.equal(confirm.disabled,true);f.ready.selectCell({x:13,z:4});assert.equal(findAction(f.ui.modal,'ready-plot-build').disabled,true);
  }finally{restore();}
});

test('finishing a confirmation retains the newer tutorial focus and unchanged availability is not announced repeatedly',()=>{
  const restore=installDOM();try{const f=fixture();f.ready.show('home-1');const status=f.ui.modal.children.find(item=>item.className==='ready-plot-status');let text=status.textContent,writes=0;Object.defineProperty(status,'textContent',{get:()=>text,set:value=>{text=value;writes++;}});f.ready.refresh();f.ready.refresh();assert.equal(writes,0,'unchanged live status has no new mutations');
    const build=f.engine.buildReadyPlot;f.engine.buildReadyPlot=id=>{const result=build(id);f.ready.focus(f.lots[1]);return result;};findAction(f.ui.modal,'ready-plot-build').onclick();assert.equal(f.selection.at(-1),'basket-1');assert.equal(f.ready.focusedId,'basket-1');
  }finally{restore();}
});

test('the accessible lot list includes distinct sport names, prices and future lots',()=>{
  const restore=installDOM();try{const f=fixture(),parent=new Element('div');f.ready.addEntry(parent);f.ready.refresh();f.ready.openList();const buttons=f.ui.modal.children.at(-1).children;assert.equal(buttons.length,3);assert.equal(buttons[1].children[2].textContent,strings['building.basketball']);assert.equal(buttons[2].children[2].textContent,strings['building.tennis']);assert.match(buttons[2].children[3].textContent,/180/);assert.equal(buttons[1].dataset.status,'locked');assert.equal(parent.children[0].attributes['aria-label'],strings['ready.listCount'].replace('{count}','3'));
  }finally{restore();}
});

test('municipal plan selections use the same saved lot confirmation and old engines retain their fallback',()=>{
  let selected,ghost=0;const ui={readyPlots:{active:true,show:id=>{selected=id;}},closeModal(){},selectBuilding(){throw Error('manual placement');},updateGhost(){ghost++;},view:{focusCell(){}}};CityManagementInterface.prototype.chooseSite.call({ui},{id:'tennis-1',typeId:'tennis',x:9,z:4});assert.equal(selected,'tennis-1');assert.equal(ghost,0);assert.equal(readyPlotsActive({state:{}}),false);
  const restore=installDOM();try{const f=fixture();f.ui.data.featureFlags.readyPlots=false;f.ready.refresh();assert.equal(f.ready.active,false);assert.deepEqual(f.drawn.at(-1),[]);}finally{restore();}
});

test('real prepared-city confirmation uses the engine once and leaves every other permanent reservation unchanged',async()=>{
  const data=await loadData(new URL('../workout/island/',import.meta.url),async url=>({ok:true,json:async()=>JSON.parse(await readFile(url,'utf8'))})),engine=createEngine(data,{storage:{getItem:()=>null,setItem(){}},now:()=>1000000});
  assert.equal(engine.enableReadyBuilding().ok,true);assert.equal(engine.state.world.size,32);
  const restore=installDOM();try{const f=fixture();Object.assign(f.ui,{engine,data,getBuilding:id=>engine.registry.buildings.get(id)});f.ready.refresh();const plan=structuredClone(engine.state.readyPlan),rows=engine.readyPlots(),site=engine.readyPlotForType('house');assert.ok(site?.ok);let calls=0;const build=engine.buildReadyPlot;engine.buildReadyPlot=id=>{calls++;return build(id);};
    f.ready.show(site.id);assert.equal(calls,0);const confirm=findAction(f.ui.modal,'ready-plot-build');confirm.onclick();confirm.onclick();assert.equal(calls,1);assert.equal(engine.state.buildings.filter(row=>row.typeId==='house').length,1);assert.deepEqual(engine.state.readyPlan,plan);assert.equal(engine.readyPlots().length,rows.length-1);for(const row of engine.readyPlots()){const old=rows.find(before=>before.id===row.id);assert.deepEqual([row.x,row.z,row.number],[old.x,old.z,old.number]);}
  }finally{restore();}
});

function viewRows(count=100){return Array.from({length:count},(_,i)=>({id:'lot-'+i,typeId:i%2?'basketball':'tennis',x:i%10*4,z:Math.floor(i/10)*4,w:3,d:2,number:i+1,status:i%3?'available':'locked',color:'#64aa86',label:i%2?'כדורסל':'טניס',icon:i%2?'🏀':'🎾'}));}

test('vacant lots have no badges, label atlas, persistent wash or outlines at any camera zoom',()=>{
  const scene=new T.Scene(),view=new ReadyPlotsView(scene,.34,{capacity:1,canvas:{getContext(){assert.fail('an atlas must never be created');}}}),rows=viewRows();
  view.show(rows,48);assert.equal(view.rows.length,100);assert.equal(view.metrics().plots,100);assert.equal(view.metrics().labels,0);assert.equal(view.metrics().draws,0);
  assert.ok(scene.children.every(mark=>!mark.visible));assert.equal(view.canvas,undefined);assert.equal(view.texture,undefined);assert.equal(view.labels,undefined);assert.equal(view.fillMaterial.map,null);
  const camera=new T.OrthographicCamera(-32,32,32,-32,.1,100),rect={left:0,top:0,width:360,height:740};
  camera.position.set(0,30,0);camera.up.set(0,0,-1);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  for(const extent of [32,8,2]){Object.assign(camera,{left:-extent,right:extent,top:extent,bottom:-extent});camera.updateProjectionMatrix();view.resize(360,740);view.update(camera,rect);assert.equal(view.pick(180,370,camera,rect),null);assert.equal(view.metrics().draws,0);assert.equal(view.metrics().labels,0);}
  view.dispose();
});

test('only the selected lot receives a faint flat wash and thin ground outline within its actual footprint',()=>{
  const scene=new T.Scene(),view=new ReadyPlotsView(scene,.34),rows=viewRows(),before=structuredClone(rows),row=rows[99];
  view.show(rows,48);view.setSelection(row.id);scene.updateMatrixWorld(true);
  assert.equal(view.metrics().draws,2);assert.equal(view.metrics().selected,1);assert.equal(view.metrics().labels,0);assert.equal(scene.children.filter(mark=>mark.visible).length,2);
  assert.equal(view.border.isLineLoop,true);assert.equal(view.borderMaterial.linewidth,1);assert.ok(view.fillMaterial.opacity<=.12);assert.ok(view.borderMaterial.opacity<=.55);
  const offset=23.5;
  for(const mark of [view.fill,view.border]){
    const positions=mark.geometry.attributes.position,point=new T.Vector3();let minY=Infinity,maxY=-Infinity;
    for(let i=0;i<positions.count;i++){
      point.fromBufferAttribute(positions,i).applyMatrix4(mark.matrixWorld);minY=Math.min(minY,point.y);maxY=Math.max(maxY,point.y);
      assert.ok(point.x>row.x-.5-offset&&point.x<row.x+row.w-.5-offset);assert.ok(point.z>row.z-.5-offset&&point.z<row.z+row.d-.5-offset);
    }
    assert.ok(Math.abs(maxY-minY)<1e-6,'selection contains no upright sign or pole');assert.ok(minY>.34&&maxY<.39);
  }
  assert.equal(view.pick(0,0),null,'even a selected plot has no floating hit target');view.show(rows.slice(1),48);assert.equal(view.metrics().draws,2);assert.equal(view.rows.at(-1).number,100);assert.deepEqual(rows,before);
  view.setSelection(null);assert.equal(view.metrics().draws,0);assert.ok(scene.children.every(mark=>!mark.visible));
  view.setSelection(row.id);view.show(rows.slice(0,-1),48);assert.equal(view.metrics().draws,0,'building/removing the selected reservation clears its ground mark');view.dispose();
});

test('every saved footprint remains clickable without marks, including lots beyond the former atlas capacity',()=>{
  const scene=new T.Scene(),view=new ReadyPlotsView(scene,.34,{capacity:1}),rows=viewRows(160);view.show(rows,64);
  for(const row of rows)for(let z=row.z;z<row.z+row.d;z++)for(let x=row.x;x<row.x+row.w;x++)assert.deepEqual(view.pickCell({x,z}),{x:row.x,z:row.z,readyPlotId:row.id});
  assert.equal(view.pickCell(null),null);assert.equal(view.pickCell({x:-1,z:-1}),null);assert.equal(view.metrics().draws,0);assert.equal(view.metrics().labels,0);
  view.dispose();assert.equal(view.pickCell({x:rows[0].x,z:rows[0].z}),null);
});

test('selection resources release once and a disposed view cannot recreate markings',()=>{
  const scene=new T.Scene(),view=new ReadyPlotsView(scene,.34),rows=viewRows(1);view.show(rows,32);view.setSelection(rows[0].id);
  let released=0;for(const resource of [view.geometry,view.borderGeometry,view.fillMaterial,view.borderMaterial])resource.addEventListener('dispose',()=>released++);
  view.dispose();view.dispose();view.show(rows,32);view.setSelection(rows[0].id);view.update();view.resize();
  assert.equal(released,4);assert.equal(scene.children.length,0);assert.equal(view.metrics().draws,0);assert.equal(view.metrics().plots,0);assert.equal(view.metrics().disposed,true);
});

test('vacant footprint taps take precedence over adjacent roads and overhanging roofs without any floating target',()=>{
  const events={},calls=[],canvas={style:{},addEventListener:(name,handler)=>{events[name]=handler;},setPointerCapture(){},getBoundingClientRect:()=>({left:0,top:0,width:390,height:844})},view=Object.create(IslandView.prototype),lot={id:'saved-tennis',x:11,z:12,w:3,d:2};
  let cell={x:10,z:12};
  Object.assign(view,{canvas,handlers:{},pointers:new Map(),groups:new Map(),camera:{},state:{buildings:[]},cellAt:()=>cell,readyPlots:{rows:[lot],pick:ReadyPlotsView.prototype.pick,pickCell:ReadyPlotsView.prototype.pickCell},ray:{intersectObjects(){calls.push('building-ray');return [{object:{userData:{buildingId:'road-or-roof'}}}];}},onCell:row=>calls.push(row),onSelect:id=>calls.push(id)});
  view.bindEvents();const tap=()=>{events.pointerdown({pointerId:1,clientX:150,clientY:300});events.pointerup({pointerId:1,clientX:150,clientY:300});};
  tap();assert.deepEqual(calls,['building-ray','road-or-roof'],'a road cell can no longer trigger an invisible floating badge');calls.length=0;
  for(let z=lot.z;z<lot.z+lot.d;z++)for(let x=lot.x;x<lot.x+lot.w;x++){cell={x,z};tap();assert.equal(calls.at(-1).readyPlotId,lot.id);}
  assert.equal(calls.includes('building-ray'),false,'an overhanging roof cannot steal any vacant lot cell');calls.length=0;cell={x:0,z:0};tap();assert.deepEqual(calls,['building-ray','road-or-roof'],'ordinary built areas keep normal selection');
  calls.length=0;view.ghost={};cell={x:lot.x,z:lot.z};tap();assert.deepEqual(calls,[cell],'advanced manual placement still uses the ground grid');
});
