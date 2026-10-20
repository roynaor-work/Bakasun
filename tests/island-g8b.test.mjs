import test from 'node:test';
import assert from 'node:assert/strict';
import {GameShell} from '../workout/island/ui/game-shell.mjs';

// A small DOM boundary fixture; layout and the real CSS are covered in g8b-browser.
class Node extends EventTarget {
 constructor(tag='div'){super();this.tagName=tag;this.children=[];this.dataset={};this.attributes={};this.style={};this.textContent='';}
 append(...nodes){for(const n of nodes){n.parent=this;this.children.push(n);}}
 replaceChildren(...nodes){this.children=[];this._text='';this.append(...nodes);}
 set textContent(value){this._text=value;this.children=[];}
 get textContent(){return this._text;}
 setAttribute(k,v){this.attributes[k]=String(v);}
 getAttribute(k){return this.attributes[k]??null;}
 hasAttribute(k){return k in this.attributes;}
 get firstChild(){return this.children[0];}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}
 focus(){globalThis.document.activeElement=this;}
 querySelectorAll(tag){return this.children.flatMap(n=>[...(n.tagName===tag?[n]:[]),...n.querySelectorAll(tag)]);}
 querySelector(tag){return this.querySelectorAll(tag)[0];}
 set innerHTML(value){assert.equal(this.tagName,'template');this.content=new Node();const svg=new Node('svg');svg.append(new Node('path'));this.content.append(svg);}
}
function fixture(t,{muted=false}={}){
 const doc=new Node('document');doc.createElement=tag=>new Node(tag);doc.hidden=false;
 const saved=Object.getOwnPropertyDescriptor(globalThis,'document');Object.defineProperty(globalThis,'document',{configurable:true,value:doc});
 const dialog=new Node(),stage=new Node(),controls=new Node(),pauseButton=new Node('button'),canvas=new Node('canvas'),icon=new Node('svg'),button=new Node('button');
 pauseButton.append(icon);pauseButton.setAttribute('aria-label','game.pause');pauseButton.title='original';pauseButton.style.background='#173e4be6';
 button.setAttribute('aria-label','kick');button.style.opacity='.65';controls.append(button);stage.append(canvas);dialog.append(pauseButton,stage,controls);
 const calls=[],sound={muted,setPaused(v){this.paused=v;},setMuted(v){this.muted=v;},unlock(){this.unlocked=true;}},shell=new GameShell({dialog,stage,controls,pauseButton,sound,t:key=>key,onExit:()=>calls.push('exit')});
 shell.bind({setPaused:v=>calls.push(v)});
 t.after(()=>{shell.dispose();if(saved)Object.defineProperty(globalThis,'document',saved);else delete globalThis.document;});
 const action=name=>shell.sheet.querySelectorAll('button').find(n=>n.dataset.action===name);
 return {shell,dialog,stage,controls,pauseButton,icon,button,canvas,sound,calls,doc,action};
}
test('G8b pause presents exactly one row of resume, sound and exit icons',t=>{
 const f=fixture(t);f.shell.pause('exit');
 const card=f.shell.sheet.firstChild,actions=card.children.at(-1);
 assert.equal(f.shell.sheet.getAttribute('role'),'dialog');assert.equal(f.shell.sheet.getAttribute('aria-modal'),'true');
 assert.deepEqual(actions.children.map(n=>n.dataset.action),['game-resume','game-pause-sound','game-exit']);
 assert.equal(card.querySelectorAll('svg').length,3,'no decorative duplicate exit icon');
 for(const b of actions.children){assert.equal(b.textContent,'');assert.ok(b.getAttribute('aria-label'));assert.equal(b.querySelectorAll('svg').length,1);}
 assert.equal(f.doc.activeElement,f.action('game-resume'));f.action('game-exit').onclick();assert.equal(f.calls.at(-1),'exit');
});
for(const muted of [false,true])test(`G8b sound icon, accessible label and toggle follow muted=${muted}`,t=>{
 const f=fixture(t,{muted});f.shell.pause();const mute=f.action('game-pause-sound'),initial=mute.firstChild.firstChild.getAttribute('d');
 assert.equal(mute.getAttribute('aria-pressed'),String(muted));assert.equal(mute.title,muted?'sound.unmute':'sound.mute');
 mute.onclick();assert.equal(f.sound.muted,!muted);assert.equal(mute.getAttribute('aria-pressed'),String(!muted));assert.notEqual(mute.firstChild.firstChild.getAttribute('d'),initial);
 mute.onclick();assert.equal(mute.firstChild.firstChild.getAttribute('d'),initial);
});
test('G8b repeated pause/resume preserves game-owned control and pause-button DOM and styles',t=>{
 const f=fixture(t),originalStyle={...f.pauseButton.style},controlStyle={...f.button.style},attributes={...f.pauseButton.attributes};
 for(let i=0;i<3;i++){
  f.shell.pause();const first=f.shell.sheet;assert.equal(f.dialog.dataset.paused,'true');assert.equal(f.controls.inert,true);assert.equal(f.stage.inert,true);assert.equal(f.sound.paused,true);
  f.shell.pause('exit');assert.ok(!f.dialog.children.includes(first),'reopening replaces the sheet');assert.equal(f.dialog.children.filter(n=>n.className==='game-pause-sheet').length,1);
  f.action('game-resume').onclick();assert.equal(f.shell.sheet,null);assert.equal(f.dialog.dataset.paused,'false');assert.equal(f.controls.inert,false);assert.equal(f.stage.inert,false);assert.equal(f.sound.paused,false);assert.equal(f.doc.activeElement,f.canvas);
  assert.equal(f.pauseButton.firstChild,f.icon);assert.equal(f.controls.firstChild,f.button);assert.deepEqual(f.pauseButton.style,originalStyle);assert.deepEqual(f.button.style,controlStyle);assert.deepEqual(f.pauseButton.attributes,attributes);
 }
});
test('G8b a hidden document cannot resume and disposal removes the pause sheet',t=>{
 const f=fixture(t);f.shell.pause();f.doc.hidden=true;f.shell.resume();assert.equal(f.shell.paused,true);assert.equal(f.controls.inert,true);
 f.shell.dispose();assert.equal(f.dialog.children.some(n=>n.className==='game-pause-sheet'),false);assert.equal(f.sound.paused,false);
});
