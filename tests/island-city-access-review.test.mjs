import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {CityAccess} from '../workout/island/ui/city-access.mjs';
import {IslandInterface} from '../workout/island/ui/interface.mjs';
import {navigationActive} from '../workout/island/view/city-navigation.mjs';
import {createActivity} from '../workout/island/activity/runtime.mjs';
import {loadData} from '../workout/island/engine/load-data.mjs';
import {createEngine} from '../workout/island/engine/engine.mjs';

const data=await loadData(new URL('../workout/island/',import.meta.url),async url=>({ok:true,json:async()=>JSON.parse(await readFile(url,'utf8'))}));
function fixture(){
  const old=globalThis.document,events={};let doc;
  class Element{
    constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.attributes={};this.events={};this.hidden=false;this.textContent='';}
    append(...items){for(const n of items){n.parentElement=this;this.children.push(n);}}
    replaceChildren(...items){this.children=[];this.append(...items);}
    get lastChild(){return this.children.at(-1);}
    setAttribute(k,v){this.attributes[k]=String(v);}getAttribute(k){return this.attributes[k]??null;}
    addEventListener(k,fn){(this.events[k]||=[]).push(fn);}
    getContext(){return null;}remove(){}focus(){doc.activeElement=this;}
    querySelector(tag){return this.children.find(n=>n.tagName===tag)||null;}
    contains(n){for(;n;n=n.parentElement)if(n===this)return true;return false;}
  }
  doc={activeElement:null,createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag),addEventListener:(type,fn)=>{(events[type]||=[]).push(fn);}};globalThis.document=doc;
  const engine=createEngine(data,{storage:{getItem:()=>null,setItem(){}},now:()=>1e6});engine.skipTutorial();engine.state.avatar.created=true;engine.enableReadyBuilding();engine.state.money=1e4;for(const type of ['house','fireStation'])engine.buildReadyPlot(engine.readyPlotForType(type).id);
  const view={canvas:new Element('canvas'),pointers:new Map(),route:[],touring:false,following:false,followTour(){this.following=true;},setTour(active){this.touring=this.following=active;}},ui={root:new Element('main'),modalRoot:new Element('div'),cameraControls:new Element('div'),morePanel:new Element('div'),data,view,engine,t:id=>id,getBuilding:id=>engine.registry.buildings.get(id),label:t=>t.id,closeDetails(){},closeInfo(){},cancelPlacement(){},setMoreOpen(){},setDockOpen(){},drawInfo(){}};ui.morePanel.hidden=true;
  const access=new CityAccess({ui,engine,games:{menu(){},training(){}},learning:{daily(){}}});ui.cityAccess=access;
  return {access,ui,view,engine,doc,events,restore(){access.dispose();globalThis.document=old;}};
}

test('the tour bubble exposes Return to character only after follow is released',()=>{
  const f=fixture();try{f.view.touring=true;f.view.following=true;f.access.render();assert.equal(f.access.followButton.hidden,true);f.view.following=false;f.access.render();assert.equal(f.access.followButton.hidden,false);assert.equal(f.access.followButton.parentElement,f.access.tourHint);f.access.followButton.onclick();assert.equal(f.view.following,true);assert.equal(f.access.followButton.hidden,true);for(const fn of f.events.keydown)fn({key:'Escape'});assert.equal(f.view.touring,false);assert.equal(f.access.tourHint.hidden,true);}finally{f.restore();}
});

test('a world tap closes the map and unblocks the waiting emergency without stealing pointer focus',()=>{
  const f=fixture();let activity;try{let now=1e6,launched=0;const blocked=()=>navigationActive(f.view)||!f.access.mapPanel.hidden;activity=createActivity(f.engine,{now:()=>now,random:()=>0,blocked,onLaunch:()=>launched++});assert.equal(activity.prepare('fire').ok,true);f.access.toggleMap(true);assert.equal(blocked(),true);now+=data.config.events.warningMs+1;activity.tick();assert.equal(launched,0);
    const focus={id:'world-input'};f.doc.activeElement=focus;for(const fn of f.events.pointerdown)fn({target:f.view.canvas});for(const fn of f.view.canvas.events.pointerdown)fn({target:f.view.canvas});assert.equal(f.access.mapPanel.hidden,true);assert.equal(blocked(),false);assert.equal(f.doc.activeElement,focus);activity.tick();assert.equal(launched,1);
    f.access.toggleMap(true);for(const fn of f.events.keydown)fn({key:'Escape'});assert.equal(f.access.mapPanel.hidden,true);assert.equal(f.doc.activeElement,f.access.mapButton);
  }finally{activity?.dispose();f.restore();}
});

test('opening a building card or a dialog closes the map without returning pointer focus to Map',async()=>{
  const f=fixture();try{f.access.toggleMap(true);const focus={id:'clicked-control'};f.doc.activeElement=focus;IslandInterface.prototype.showInfo.call(f.ui,f.engine.state.buildings.find(b=>b.typeId==='cityHall').id);assert.equal(f.access.mapPanel.hidden,true);assert.equal(f.doc.activeElement,focus);
    f.access.toggleMap(true);IslandInterface.prototype.openModal.call(f.ui,'test','test');assert.equal(f.access.mapPanel.hidden,true);assert.notEqual(f.doc.activeElement,f.access.mapButton);await Promise.resolve();
  }finally{f.restore();}
});
