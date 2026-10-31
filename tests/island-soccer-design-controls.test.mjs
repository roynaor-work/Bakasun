import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSoccer} from '../workout/island/minigames/soccer.mjs';
import {soccerDesignControlState,soccerDesignControlPlan,soccerDesignLayout,createSoccerGestureRecognizer,createSoccerDesignInput} from '../workout/island/minigames/soccer-design-controls.mjs';

const json=path=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
const controls=json('../workout/island/design/controls/soccer.json'),interaction=json('../workout/island/design/controls/interaction.json'),config=json('../workout/island/data/config.json').minigames.soccer;
const thresholds=interaction.gesture_thresholds,rect={left:0,top:0,right:104,bottom:104,width:104,height:104},button={left:200,top:0,right:264,bottom:64,width:64,height:64};
const field=()=>({phase:'playing',mode:'attack',role:'field',controlled:0,ball:{owner:0},restart:null});
function recognizer(onCancel=()=>{}){const input=createSoccerGestureRecognizer({thresholds,onCancel});input.setState('attack',['stick','kick','pass','sprint','switch']);input.setEnabled(true);return input;}
const frame=(input,time=0)=>input.sample(1,time);

test('authoritative restart and keeper ownership select the supplied design states',()=>{
  const s=field();assert.equal(soccerDesignControlState(s),'attack');s.mode='defense';assert.equal(soccerDesignControlState(s),'defense');
  s.role='keeper';s.ball.owner=null;assert.equal(soccerDesignControlState(s),'goalkeeper');s.ball.owner=0;assert.equal(soccerDesignControlState(s),'keeper_ball');
  for(const [type,key]of [['throwIn','throw_in'],['corner','corner'],['goalKick','goal_kick'],['freeKick','free_kick']]){s.phase='restartReady';s.restart={type,team:0};assert.equal(soccerDesignControlState(s),key);s.restart.team=1;assert.equal(soccerDesignControlState(s),'opponent_restart');}
});

test('opponent restart has movement and switching but no queued shooting, passing or sprint',()=>{
  const state={...field(),phase:'restartReady',restart:{type:'throwIn',team:1}},plan=soccerDesignControlPlan(state,controls);
  assert.deepEqual(plan.allowed,['stick','switch']);assert.equal(plan.slots.primary,undefined);assert.equal(plan.slots.secondary,undefined);assert.equal(plan.slots.sprint,undefined);
  const input=recognizer();input.begin('kick',1,232,32,button,0);assert.equal(frame(input).kickHeld,true);
  input.setState(plan.key,plan.allowed);assert.equal(frame(input).kickHeld,false);input.end(1,232,32,10);assert.equal(frame(input).kickHeld,false);
  assert.equal(input.begin('pass',2,232,32,button,20),false);
});

test('an explicitly selected keeper cannot switch to a field player at an opponent restart',()=>{
  const state={...field(),role:'keeper',phase:'restartReady',restart:{type:'throwIn',team:1}},plan=soccerDesignControlPlan(state,controls);
  assert.equal(plan.key,'opponent_restart');assert.deepEqual(plan.allowed,['stick']);assert.equal(plan.slots.trick,undefined);assert.equal(plan.slots.pause.id,'pause');
  state.role='field';const fieldPlan=soccerDesignControlPlan(state,controls);assert.deepEqual(fieldPlan.allowed,['stick','switch']);assert.equal(fieldPlan.slots.trick.id,'switch');
});

for(const [width,height]of [[844,390],[390,844]])test(`all supplied control states fit ${width}x${height}, with48px targets and8px gaps`,()=>{
  const layout=soccerDesignLayout(controls,width,height);
  for(const definition of Object.values(controls.states)){
    const visible=definition.controls.map(entry=>layout[entry.slot]);
    for(const box of visible){assert.ok(box.width>=48&&box.height>=48);assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width&&box.y+box.height<=height);}
    for(let i=0;i<visible.length;i++)for(let j=i+1;j<visible.length;j++){
      const a=visible[i],b=visible[j],gapX=Math.max(a.x-b.x-b.width,b.x-a.x-a.width),gapY=Math.max(a.y-b.y-b.height,b.y-a.y-a.height);
      assert.ok(gapX>=8||gapY>=8,'visible hit rectangles may not overlap or squeeze out the required gap');
    }
  }
  assert.equal(layout.stick.x,12);assert.equal(layout.pause.x,12);assert.equal(layout.primary.x,width-layout.primary.width-12);
  const mirrored=soccerDesignLayout(controls,width,height,false);assert.equal(mirrored.primary.x,12);assert.equal(mirrored.stick.x,width-layout.stick.width-12);assert.equal(mirrored.pause.x,12,'handedness does not relocate pause');
});

test('physical swipe directions are unchanged by RTL text, and follow only the camera direction',()=>{
  assert.equal(controls.direction,'rtl');const input=recognizer();input.begin('pass',1,232,32,button,0);input.move(1,204,32,10);
  assert.equal(input.sample(1,10).passAim.x,-1);assert.equal(input.sample(-1,10).passAim.x,1);
});

test('contract dead-zone and full-stick sprint use320ms with hysteresis',()=>{
  const input=recognizer();input.beginStick(1,54,52,rect,0);assert.equal(frame(input).moveX,0);
  input.move(1,102,52,0);assert.equal(frame(input,319).sprintHeld,false);assert.equal(frame(input,320).sprintHeld,true);
  input.move(1,93,52,350);assert.equal(frame(input,350).sprintHeld,true,'running stays on above the .75 off threshold');
  input.move(1,89,52,360);assert.equal(frame(input,360).sprintHeld,false);
  input.end(1,89,52,370);assert.equal(frame(input,400).moveX,0,'release never leaves a moving player');
});

test('the full-stick hold must stay above .9 until sprint activates',()=>{
  const input=recognizer();input.beginStick(1,102,52,rect,0);input.move(1,93,52,200);assert.equal(frame(input,1000).sprintHeld,false);
});

test('one-finger transfer requires120ms in a visible action and stops movement',()=>{
  const input=recognizer();input.beginStick(1,102,52,rect,0);input.move(1,220,32,10,[{action:'pass',rect:button}]);
  assert.equal(frame(input,129).passHeld,false);const selected=frame(input,130);assert.equal(selected.passHeld,true);assert.equal(selected.moveX,0);assert.equal(selected.moveZ,0);assert.equal(input.snapshot.stickMode,'action');
  input.end(1,220,32,150);assert.equal(frame(input,150).passHeld,false);assert.equal(frame(input,151).passHeld,false);
});

test('pointer cancellation and leaving a button cancel every unfinished request',()=>{
  let cancelled=0;const input=recognizer(()=>cancelled++);input.beginStick(1,102,52,rect,0);input.begin('kick',2,232,32,button,0);frame(input,400);
  const previous=cancelled;input.move(2,button.right+25,32,410);const stopped=frame(input,420);assert.equal(stopped.moveX,0);assert.equal(stopped.kickHeld,false);assert.equal(stopped.sprintHeld,false);assert.ok(cancelled>previous);
  input.begin('pass',3,232,32,button,430);input.cancelPointer(3);assert.equal(frame(input,440).passHeld,false);
});

function isolatedModel(){
  const model=createSoccer({config}),state=model.getState(),player=state.players[state.controlled];
  for(const other of state.players)if(other!==player)other.recover=100;player.cooldown=0;state.ball.grace=100;model.drainEvents();return model;
}
test('a tap between frames requests exactly one shot, without a synthetic click action',()=>{
  const model=isolatedModel(),input=recognizer(()=>model.clearInput()),step=config.match.fixedStep;
  input.begin('kick',1,232,32,button,0);input.end(1,232,32,10);
  model.update(step,frame(input,16));model.update(step,frame(input,32));
  assert.equal(model.drainEvents().filter(event=>event.type==='shot').length,1);
  for(let i=0;i<8;i++)model.update(step,frame(input,48+i*16));assert.equal(model.drainEvents().filter(event=>event.type==='shot').length,0);
});

test('a hold beyond the supplied320ms threshold lofts once on release in the real model',()=>{
  assert.equal(config.passing.loftThresholdSeconds*1000,thresholds.hold_from_ms);
  const model=isolatedModel(),input=recognizer(()=>model.clearInput()),step=config.match.fixedStep;input.begin('pass',1,232,32,button,0);
  for(let i=0;i<24;i++)model.update(step,frame(input,i*step*1000));
  assert.equal(model.drainEvents().filter(event=>['pass','loft'].includes(event.type)).length,0,'held pass stays with the owner');
  input.end(1,232,32,400);model.update(step,frame(input,416));assert.equal(model.drainEvents().filter(event=>event.type==='loft').length,1);
});

test('cancelling a real charge clears it without shooting on the next model frame',()=>{
  const model=isolatedModel(),input=recognizer(()=>model.clearInput()),step=config.match.fixedStep;input.begin('kick',1,232,32,button,0);
  for(let i=0;i<10;i++)model.update(step,frame(input,i*16));assert.equal(model.getState().charging,true);
  input.cancelPointer(1);model.update(step,frame(input,200));assert.equal(model.getState().charging,false);assert.equal(model.drainEvents().some(event=>event.type==='shot'),false);
});

class Node extends EventTarget{
  constructor(document,box=button,isButton=true){super();this.ownerDocument=document;this.box=box;this.isButton=isButton;this.hidden=false;this.disabled=false;this.dataset={};this.styles=new Map();this.style={setProperty:(key,value)=>this.styles.set(key,value)};this.classes=new Set();this.classList={add:key=>this.classes.add(key),remove:key=>this.classes.delete(key),toggle:(key,on)=>on?this.classes.add(key):this.classes.delete(key)};this.pointers=new Set();}
  matches(selector){return selector.split(',').includes('button')&&this.isButton;}
  getBoundingClientRect(){return this.box;}
  setPointerCapture(id){this.pointers.add(id);}hasPointerCapture(id){return this.pointers.has(id);}releasePointerCapture(id){this.pointers.delete(id);}
}
function dispatch(node,type,values={}){const event=new Event(type,{cancelable:true});for(const [key,value]of Object.entries(values))Object.defineProperty(event,key,{value});node.dispatchEvent(event);return event;}
function domFixture(t){
  const document=new EventTarget(),window=new EventTarget();document.defaultView=window;
  const nodes={stick:new Node(document,rect,false),primary:new Node(document),secondary:new Node(document),sprint:new Node(document),trick:new Node(document)},knob=new Node(document,rect,false),root=new Node(document,rect,false);
  root.querySelector=selector=>selector==='#joystick'?nodes.stick:selector==='#knob'?knob:null;
  let time=0,cancelled=0;const input=createSoccerDesignInput({root,nodes,config:config.controls,interaction,now:()=>time,onCancel:()=>cancelled++});
  input.setPlan(soccerDesignControlPlan(field(),controls));input.setEnabled(true);t.after(()=>input.dispose());
  return {input,nodes,window,document,setTime:value=>time=value,get cancelled(){return cancelled;},key:(type,code,target=nodes.secondary,extra={})=>dispatch(window,type,{code,target,repeat:false,...extra})};
}

test('native focused Space owns only its pass button, merges movement, and suppresses its follow-up click',t=>{
  const f=domFixture(t);f.key('keydown','Space');f.key('keydown','ArrowRight');let sample=f.input.sample();assert.equal(sample.passHeld,true);assert.equal(sample.kickHeld,false);assert.equal(sample.moveX,1);
  f.setTime(2000);f.key('keyup','Space');f.input.sample();dispatch(f.nodes.secondary,'click',{detail:0});assert.equal(f.input.sample().passHeld,false);
});

for(const reason of ['resize','orientationchange','blur'])test(`${reason} clears movement, charge and sprint and requires a new contact`,t=>{
  const f=domFixture(t);f.key('keydown','KeyX');f.key('keydown','ArrowRight');f.key('keydown','ShiftLeft');assert.equal(f.input.sample().passHeld,true);
  dispatch(f.window,reason);const sample=f.input.sample();assert.equal(sample.moveX,0);assert.equal(sample.passHeld,false);assert.equal(sample.sprintHeld,false);
  f.key('keydown','KeyX',f.nodes.secondary,{repeat:true});assert.equal(f.input.sample().passHeld,false);f.key('keyup','KeyX');f.key('keydown','KeyX');assert.equal(f.input.sample().passHeld,true);
});

test('losing focused-button ownership cancels the charged keyboard action',t=>{
  const f=domFixture(t);f.key('keydown','Space');assert.equal(f.input.sample().passHeld,true);dispatch(f.nodes.secondary,'blur');f.key('keyup','Space');assert.equal(f.input.sample().passHeld,false);
});

test('a viewport change cancels before release even when its native resize event is delayed',t=>{
  const f=domFixture(t);f.key('keydown','Space');assert.equal(f.input.sample().passHeld,true);const previous=f.cancelled;
  f.window.innerWidth=845;f.window.innerHeight=390;f.key('keyup','Space');const sample=f.input.sample();
  assert.ok(f.cancelled>previous,'sample must clear the model charge before forwarding release');assert.equal(sample.passHeld,false);
});

test('unrelated focused buttons and disabled controls never queue a soccer request',t=>{
  const f=domFixture(t),outside=new Node(f.document);f.key('keydown','KeyX',outside);f.key('keydown','ArrowRight',outside);assert.equal(f.input.sample().passHeld,false);assert.equal(f.input.sample().moveX,0);
  f.input.setEnabled(false);f.key('keydown','KeyX');dispatch(f.nodes.primary,'pointerdown',{pointerId:1,clientX:232,clientY:32});f.input.setEnabled(true);assert.equal(f.input.sample().kickHeld,false);assert.equal(f.input.sample().passHeld,false);
});
