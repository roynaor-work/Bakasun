import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {IslandInterface} from '../workout/island/ui/interface.mjs';
import {LearningInterface} from '../workout/island/learning/interface.mjs';
import {createTranslator} from '../workout/island/ui/translate.mjs';

const strings=JSON.parse(await readFile(new URL('../workout/island/data/strings.he.json',import.meta.url),'utf8'));
class Element{
  constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.attributes={};this.events={};this.style={setProperty(){}};this.classList={add(){},remove(){}};this.hidden=false;}
  append(...items){for(const item of items){if(item.parentElement)item.parentElement.children=item.parentElement.children.filter(old=>old!==item);item.parentElement=this;this.children.push(item);}}
  replaceChildren(...items){for(const item of this.children)item.parentElement=null;this.children=[];this.append(...items);}
  setAttribute(key,value){this.attributes[key]=String(value);}
  getAttribute(key){return this.attributes[key];}
  addEventListener(type,handler){(this.events[type]||=[]).push(handler);}
  contains(item){for(let n=item;n;n=n.parentElement)if(n===this)return true;return false;}
  closest(selector){for(let n=this;n;n=n.parentElement)if(selector.split(',').some(s=>s==='button'&&n.tagName==='BUTTON'||s==='a'&&n.tagName==='A'||s==='[role="button"]'&&n.attributes.role==='button'))return n;return null;}
  querySelectorAll(selector){const matches=item=>selector.startsWith('.')?item.className?.split(' ').includes(selector.slice(1)):selector.startsWith('[data-action=')?item.dataset.action===selector.slice(13,-1):item.tagName===selector.toUpperCase();return this.children.flatMap(child=>[...(matches(child)?[child]:[]),...child.querySelectorAll(selector)]);}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  getBoundingClientRect(){return {width:390,height:44};}
  focus(){document.activeElement=this;}
  remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(child=>child!==this);}
}
function fixture(){
  const oldDocument=globalThis.document,oldObserver=globalThis.ResizeObserver,events={},toast=new Element('div');
  globalThis.document={createElement:tag=>new Element(tag),activeElement:null,querySelector:selector=>selector==='#toast'?toast:null,addEventListener:(type,fn)=>{(events[type]||=[]).push(fn);}};globalThis.ResizeObserver=class{observe(){}disconnect(){}};
  const calls=[],root=new Element('main'),ui=Object.create(IslandInterface.prototype);
  Object.assign(ui,{root,t:createTranslator(strings,id=>assert.fail('missing '+id)),data:{featureFlags:{parentTransfer:true},categories:[{id:'basic',icon:'⌂',title:'category.basic',color:'#789'},{id:'sports',icon:'⚽',title:'category.sports',color:'#789'}],config:{ui:{parentHoldMs:600}}},engine:{undo:()=>{calls.push('undo');return {ok:true};},state:{buildings:[{id:'hall-1',typeId:'cityHall',x:8,z:8}],avatar:{created:true}}},view:{home:()=>calls.push('home'),setReadyPlotSelection:id=>calls.push(['selection',id]),focusCell:(x,z)=>calls.push(['focus',x,z])},readyPlots:{focusedId:'old-lot',addEntry(){}},drawCatalog:()=>calls.push('catalog'),closeInfo:()=>calls.push('close-info'),showInfo:id=>calls.push(['info',id]),showAvatar:()=>calls.push('avatar'),showParent:()=>calls.push('parent'),toast:id=>calls.push(id),result:value=>value});
  ui.cancelPlacement=()=>calls.push('cancel-placement');ui.buildShell();ui.drawCityToggle(17732);const restore=()=>{globalThis.document=oldDocument;globalThis.ResizeObserver=oldObserver;};return {ui,root,calls,events,restore};
}
const action=(root,id)=>root.querySelector(`[data-action=${id}]`);

test('the default HUD keeps money, tasks, home, more and a closed build affordance; full controls start closed',()=>{
  const f=fixture();try{const {ui,root}=f;assert.equal(ui.cityToggle.children.length,1);assert.equal(ui.cityToggle.children[0].children[1].textContent,'17,732');assert.equal(ui.tasksToggle.textContent,'משימות');assert.equal(ui.dockToggle.textContent,'בנייה');assert.equal(ui.dock.dataset.open,'false');assert.equal(ui.catalog.hidden,true);assert.equal(ui.cityDetails.hidden,true);assert.equal(ui.mission.hidden,true);assert.equal(ui.morePanel.hidden,true);assert.equal(ui.cameraControls.children[0].children.length,2);
    for(const id of ['help','undo','parent','open-city-hall','avatar-edit'])assert.ok(ui.morePanel.contains(action(root,id)),id+' remains available inside More');
  }finally{f.restore();}
});

test('More exposes working utilities, closes on Escape with focus restored, and closes on outside pointer input',()=>{
  const f=fixture();try{const {ui,root,events,calls}=f;ui.moreToggle.onclick();assert.equal(ui.morePanel.hidden,false);assert.equal(ui.moreToggle.getAttribute('aria-expanded'),'true');action(root,'undo').onclick();action(root,'help').onclick();action(root,'avatar-edit').onclick();action(root,'open-city-hall').onclick();assert.ok(calls.includes('undo'));assert.ok(calls.includes('help.world'));assert.ok(calls.includes('avatar'));assert.ok(calls.some(call=>Array.isArray(call)&&call[0]==='info'&&call[1]==='hall-1'));
    ui.setMoreOpen(true);action(root,'help').focus();for(const handle of events.keydown)handle({key:'Escape'});assert.equal(ui.morePanel.hidden,true);assert.equal(document.activeElement,ui.moreToggle);
    ui.moreToggle.onclick();for(const handle of events.pointerdown)handle({target:new Element('canvas')});assert.equal(ui.morePanel.hidden,true);assert.equal(ui.moreToggle.getAttribute('aria-expanded'),'false');
  }finally{f.restore();}
});

test('money and task affordances reveal their complete panels only on request, and Build closes those panels',()=>{
  const f=fixture();try{const {ui}=f;ui.cityToggle.onclick();assert.equal(ui.cityDetails.hidden,false);assert.equal(ui.root.dataset.hudPanel,'city');assert.equal(ui.cityToggle.getAttribute('aria-expanded'),'true');ui.cityToggle.onclick();assert.equal(ui.cityDetails.hidden,true);
    ui.tasksToggle.onclick();assert.equal(ui.mission.hidden,false);assert.equal(ui.missionDetails.hidden,false);assert.equal(ui.tasksToggle.getAttribute('aria-expanded'),'true');ui.tasksToggle.onclick();assert.equal(ui.mission.hidden,true);
    ui.tasksToggle.onclick();ui.setDockOpen(true);assert.equal(ui.mission.hidden,true);assert.equal(ui.catalog.hidden,false);assert.equal(ui.dock.dataset.open,'true');assert.equal(ui.dockToggle.textContent,'×');ui.setDockOpen(false);assert.equal(ui.dockToggle.textContent,'בנייה');assert.equal(ui.catalog.hidden,true);
  }finally{f.restore();}
});

test('Home clears the selected prepared lot before returning to the overview without changing game data',()=>{
  const f=fixture();try{const before=structuredClone(f.ui.engine.state);action(f.root,'home').onclick();assert.equal(f.ui.readyPlots.focusedId,null);assert.ok(f.calls.includes('home'));assert.ok(f.calls.some(call=>Array.isArray(call)&&call[0]==='selection'&&call[1]===null));assert.deepEqual(f.ui.engine.state,before);}finally{f.restore();}
});

test('daily learning remains reachable inside Tasks and retains its own daily action',()=>{
  const f=fixture();let learning;try{const {ui}=f;let daily=0;ui.modalRoot=new Element('div');ui.engine.refreshLearningDay=()=>{};ui.engine.learningRound=()=>null;ui.engine.learningStatus=()=>({complete:true,target:1,rounds:1});ui.engine.subscribe=()=>()=>{};learning=new LearningInterface({ui,engine:ui.engine});learning.daily=()=>{daily++;};assert.equal(learning.panel.parentElement,ui.tasksContent);assert.equal(ui.mission.hidden,true);ui.tasksToggle.onclick();assert.equal(ui.mission.hidden,false);learning.mapButton.onclick();assert.equal(daily,1);assert.match(learning.mapButton.textContent,/1\/1/);}finally{learning?.dispose();f.restore();}
});

test('the trusted click guard accepts a workout link across its children and still blocks world-to-new-button retargeting',()=>{
  const f=fixture();try{const link=new Element('a'),strong=new Element('strong'),span=new Element('span');link.append(strong,span);let blocked=false;
    for(const handle of f.events.pointerdown)handle({target:strong});for(const handle of f.events.click)handle({target:link,isTrusted:true,detail:1,preventDefault(){blocked=true;},stopImmediatePropagation(){}});assert.equal(blocked,false);
    for(const handle of f.events.pointerdown)handle({target:new Element('canvas')});for(const handle of f.events.click)handle({target:new Element('button'),isTrusted:true,detail:1,preventDefault(){blocked=true;},stopImmediatePropagation(){}});assert.equal(blocked,true);
  }finally{f.restore();}
});
