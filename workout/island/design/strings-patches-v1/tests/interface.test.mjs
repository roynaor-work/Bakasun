import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import test from 'node:test';

const island=join(process.env.ISLAND_PATCH_CHECKOUT,'workout/island');
const load=file=>import(pathToFileURL(join(island,file)));
const {ActivityInterface}=await load('ui/activity.mjs');
const {offlinePanel}=await load('ui/offline-panel.mjs');
const {appendLoadReports,readGameReport}=await load('ui/load-report.mjs');
const {createTranslator}=await load('ui/translate.mjs');
const {LearningInterface}=await load('learning/interface.mjs');
const {createQuestion}=await load('learning/questions.mjs');
const catalog=JSON.parse(readFileSync(join(island,'data/strings.he.json'),'utf8'));
const translate=createTranslator(catalog,key=>assert.fail(`Missing translation ${key}`));

class Element {
  dataset={};
  children=[];
  attributes={};
  handlers={};
  classList={add(){},remove(){}};
  style={};
  constructor(tag,ownerDocument){Object.assign(this,{tag,ownerDocument});}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=nodes;}
  setAttribute(name,value){this.attributes[name]=String(value);}
  addEventListener(name,handler){this.handlers[name]=handler;}
  get firstChild(){return this.children[0];}
  focus(){}
  get descendants(){return this.children.flatMap(child=>[child,...child.descendants]);}
  querySelectorAll(selector){
    const action=selector.match(/^\[data-action=([\w-]+)\]$/)?.[1];
    return this.descendants.filter(node=>action?node.dataset.action===action:
      selector.startsWith('.')?node.className?.split(' ').includes(selector.slice(1)):node.tag===selector);
  }
  querySelector(selector){return this.querySelectorAll(selector)[0];}
}
const document={createElement:tag=>new Element(tag,document)};

function useGlobal(t,name,value){
  const saved=Object.getOwnPropertyDescriptor(globalThis,name);
  Object.defineProperty(globalThis,name,{configurable:true,writable:true,value});
  t.after(()=>saved?Object.defineProperty(globalThis,name,saved):delete globalThis[name]);
}

test('equipment card uses a short button and a complete accessible name for large prices',t=>{
  useGlobal(t,'document',document);
  const dialog=document.createElement('section');
  const id='fireRescue',title='משאבת המים הארוכה ביותר של תחנת הכיבוי בעיר';
  const ui=Object.assign(Object.create(ActivityInterface.prototype),{
    engine:{registry:{minigames:new Map([[id,{title:'minigame.fireRescue'}]])},
      state:{money:123456,minigameProgress:{[id]:{stars:[1,2]}},minigameEquipment:{[id]:{tall:0,full:1}}}},
    data:{config:{minigames:{[id]:{equipment:{
      tall:{title:'equipment.tank',description:'equipment.hint',levels:[{stars:2,cost:123456}]},
      full:{title:'equipment.range',description:'equipment.hint',levels:[{stars:2,cost:1}]},
    }}}}},
    t:createTranslator({...catalog,'equipment.tank':title}),
    modal:()=>dialog,
    playButton:()=>document.createElement('button'),
  });
  ui.equipment(id);
  const [available,owned]=dialog.querySelectorAll('[data-action=equipment-buy]');
  assert.equal(available.textContent,'שדרוג · 123,456 🪙');
  assert.equal(available.attributes['aria-label'],`${title} · שדרוג לרמה 1 · מחיר במטבעות: 123,456`);
  assert.equal(available.disabled,false);
  assert.equal(dialog.querySelector('h3').textContent,`${title} · רמה 0`);
  assert.equal(owned.textContent,'הושלם');
  assert.equal(owned.disabled,true);
  assert.match(owned.attributes['aria-label'],/רמה 1/u);
});

test('star and coin labels render quantities of zero, one and two without agreement errors',()=>{
  for(const n of [0,1,2]){
    assert.equal(translate('minigame.totalStars',{stars:n}),`כוכבים שנאספו: ${n}`);
    assert.equal(translate('catch.stars',{count:n}),`כוכבים: ${n}`);
    assert.equal(translate('minigame.result',{score:10,money:n,parts:0}),`ניקוד: 10 · מטבעות: ${n} · חלקים: 0`);
    assert.match(translate('minigame.starBonus',{stars:n,level:2}),/ללא תשלום/u);
  }
});

test('the learning UI speaks hints, retry feedback and answers through their voice fields',t=>{
  useGlobal(t,'document',document);
  const question=createQuestion('language',7,{index:1,rng:()=>0});
  const calls=[];
  const round={question,station:'language',index:1,total:8};
  const dialog=document.createElement('section');
  dialog.append(document.createElement('h2'));
  const learning=Object.assign(Object.create(LearningInterface.prototype),{
    dialog,counter:document.createElement('span'),body:document.createElement('div'),feedback:document.createElement('p'),footer:document.createElement('div'),
    engine:{learningRound:()=>round,state:{buildings:[]},answerLearning:()=>({ok:true,hint:question.hint})},
    voice:{available:true,speak:value=>calls.push(value)},
  });
  learning.drawQuestion();
  learning.help.onclick();
  learning.answer('__wrong__');
  learning.engine.answerLearning=()=>({ok:true,resolved:true,answer:question.answer});
  learning.answer('__wrong__');
  assert.deepEqual(calls,[
    question.voice,question.hintVoice,`נְנַסֶּה שׁוּב. ${question.hintVoice}`,`הַתְּשׁוּבָה הִיא: ${question.answerVoice}.`,
  ]);
  assert.match(learning.feedback.textContent,new RegExp(question.answer));
  assert.equal(learning.feedback.textContent.includes(question.answerVoice),false);
});

for(const search of ['', '?offlineV25=0']){
  test(`download details remain in the parent report (${search||'current panel'})`,async t=>{
    const storage=new Map();
    const error='Synthetic download error 123 \u0645\u0644\u0641!';
    useGlobal(t,'document',document);
    useGlobal(t,'location',{protocol:'https:',search});
    useGlobal(t,'navigator',{serviceWorker:{register:async()=>null}});
    useGlobal(t,'localStorage',{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)});
    useGlobal(t,'caches',{has:async()=>false,open:async()=>{throw Error(error);}});
    useGlobal(t,'fetch',async()=>({ok:true,json:async()=>({games:{soccer:['fixture']},shell:[],core:[]})}));
    const panel=offlinePanel();
    await new Promise(resolve=>setImmediate(resolve));
    await panel.querySelector('[data-action=offline-download-all]').handlers.click();
    assert.match(panel.querySelector('.offline-status').textContent,/ההורדה לא הושלמה\. אפשר לנסות שוב\./u);
    assert.ok(!panel.descendants.some(node=>node.textContent?.includes(error)));
    assert.ok(readGameReport('offline').includes(error));

    const parent=document.createElement('section');
    appendLoadReports(parent);
    assert.equal(parent.children.length,1);
    assert.equal(parent.children[0].dataset.report,'offline');
    assert.ok(parent.querySelector('pre').textContent.includes(error));
  });
}
