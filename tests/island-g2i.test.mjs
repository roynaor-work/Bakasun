import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createAlienModel} from '../workout/island/minigames/aliens.mjs';import {seededRandom} from '../workout/island/minigames/context.mjs';import {initialHangar,hangarAction,validHangar} from '../workout/island/activity/hangar.mjs';import {loadData} from '../workout/island/engine/load-data.mjs';import {migrateSave,migrations,validateSave,CURRENT_VERSION} from '../workout/island/engine/persistence.mjs';import {createEngine} from '../workout/island/engine/engine.mjs';import {alienBot} from '../workout/island/tests/g2h-bot.mjs';
const root=new URL('../workout/island/',import.meta.url),data=await loadData(root,async u=>({ok:true,json:async()=>JSON.parse(await readFile(u,'utf8'))})),config=data.config.minigames,balance=config.alienDefense,make=(extra={})=>createAlienModel({config,balance,level:1,random:seededRandom(3),...extra});
const noOverlap=m=>{for(let i=0;i<m.aliens.length;i++)for(let j=i+1;j<m.aliens.length;j++){const a=m.aliens[i],b=m.aliens[j];assert.ok(Math.hypot(a.x-b.x,a.y-b.y)+1e-6>=a.radius+b.radius,`${i}/${j} overlap`);}};
test('G2i twelve scouts enter above the screen, face the player and never overlap across every sampled frame',()=>{
 const m=make(),scout=balance.enemyTypes.findIndex(type=>type.id==='scout');assert.ok(scout>=0);
 assert.equal(m.aliens.length,12);assert.deepEqual([...new Set(m.aliens.map(a=>a.kind))],[scout]);
 assert.ok(m.aliens.every(a=>a.y+a.radius<0&&a.facing===1));
 for(let i=0;i<900&&!m.result;i++){noOverlap(m);m.update(1/120,{});noOverlap(m);}
 assert.ok(m.aliens.some(a=>a.y>0));assert.ok(m.bolts.length>0);
});
test('G2i initial fire is one projectile and hangar rate rank is a small 5 percent increase',()=>{const a=make(),b=make({hangar:{rapid:1}});a.update(.01,{firing:true});b.update(.01,{firing:true});assert.equal(a.shots.length,1);assert.equal(a.shots[0].kind,0);const h=initialHangar();h.credits=1;assert.ok(hangarAction(h,'rapid',balance.hangar));assert.equal(h.rapid,1);assert.equal(h.credits,0);assert.equal(balance.hangar.rankRate,.05);});
test('G2i configured miners warn and deploy bounded mines, shields absorb hits, and destroyed splitters create two separated children',()=>{
 const minerKind=balance.enemyTypes.findIndex(type=>type.mineSeconds>0),minerLevel=balance.levels.findIndex(stage=>stage.enemyRoster?.includes(minerKind))+1;assert.ok(minerKind>=0&&minerLevel>0);
 const m=make({level:minerLevel,roundChoices:false});let warned=false;
 for(let i=0;i<400&&!m.result;i++){warned||=m.aliens.some(a=>a.attackKind==='mine'&&a.tellTime>0)&&m.telegraphs.length>0;m.update(.02,{});noOverlap(m);assert.ok(m.bolts.filter(b=>b.mine).length<=2);assert.ok(m.bolts.length<=m.behavior.bulletCap);}
 assert.ok(warned);assert.ok(m.bolts.some(b=>b.mine));
 const shieldLevel=balance.stageBehaviors.findIndex(behavior=>behavior.shield>0)+1;assert.ok(shieldLevel>0);
 const shield=make({level:shieldLevel,roundChoices:false});for(let i=0;i<Math.ceil((balance.formation.entrySeconds+.04)/.02);i++)shield.update(.02,{});
 const protectedAlien=shield.aliens.find(a=>a.shield>0);assert.ok(protectedAlien);const hp=protectedAlien.hp,guard=protectedAlien.shield;
 shield.shots.push({x:protectedAlien.x,y:protectedAlien.y,vx:0,vy:0,hp:1,damage:1,kind:0});shield.update(.00001,{});
 assert.equal(protectedAlien.shield,guard-1);assert.equal(protectedAlien.hp,hp);noOverlap(shield);
 const splitterKind=balance.enemyTypes.findIndex(type=>type.children===2),splitLevel=balance.levels.findIndex((stage,index)=>stage.enemyRoster?.includes(splitterKind)&&balance.stageBehaviors[index].shield===0)+1;assert.ok(splitterKind>=0&&splitLevel>0);
 const n=make({level:splitLevel,roundChoices:false});for(let i=0;i<Math.ceil((balance.formation.entrySeconds+.04)/.02);i++)n.update(.02,{});
 const parent=n.aliens.find(a=>a.kind===splitterKind&&!a.child);assert.ok(parent);assert.equal(parent.shield,0);
 const count=n.aliens.length,parentId=parent.id,parentHp=parent.maxHp,parentScale=parent.scale;
 n.shots.push({x:parent.x,y:parent.y,vx:0,vy:0,hp:1,damage:parent.hp+1,kind:0});n.update(.00001,{});
 assert.ok(!n.aliens.some(a=>a.id===parentId));assert.equal(n.aliens.length,count+1);
 const children=n.aliens.filter(a=>a.child);assert.equal(children.length,2);assert.ok(children.every(a=>a.reward===0&&a.shield===0&&a.maxHp<parentHp&&a.scale<parentScale));assert.equal(n.score,n.settings.points);
 noOverlap(n);for(let i=0;i<5;i++){n.update(.02,{});noOverlap(n);}
});
test('G2i hangar spends earned coins on damage only, selects either small rank, changes paint and validates',()=>{const h=initialHangar();h.damage=2;assert.equal(hangarAction(h,'repair',balance.hangar),false);h.coins=10;assert.ok(hangarAction(h,'repair',balance.hangar));assert.equal(h.coins,6);assert.equal(h.damage,0);h.credits=1;assert.ok(hangarAction(h,'shield',balance.hangar));assert.equal(hangarAction(h,'rapid',balance.hangar),false);assert.ok(hangarAction(h,'paint',balance.hangar));assert.ok(validHangar(h,balance.hangar));});
test('G2i authentic schema 13 migrates explicitly to 14 and the complete original chain validates',async()=>{const old=JSON.parse(await readFile(new URL('./fixtures/save-v13.json',import.meta.url))),e=createEngine(data,{storage:null}),before=structuredClone(old),r=migrateSave(old,data,e.registry);assert.equal(CURRENT_VERSION,18);assert.ok(r.ok);assert.deepEqual(old,before);assert.deepEqual(r.state.hangar,initialHangar());assert.deepEqual(r.state,migrations[17](migrations[16](migrations[15](migrations[14](migrations[13](old,data),data),data),data)));assert.deepEqual(r.state.soccerRoster,old.soccerRoster);let s={version:1,createdAt:1e6,updatedAt:1e6,money:200,buildings:e.state.buildings,world:e.state.world,avatar:e.state.avatar,players:e.state.players,team:e.state.team};for(let v=1;v<CURRENT_VERSION;v++){s=migrations[v](s,data,e.registry);assert.equal(s.version,v+1);}assert.ok(validateSave(s,data,e.registry).ok);});
test('G2i ten seeded easy pilots clear stage one at least seven times',()=>{const wins=Array.from({length:10},(_,i)=>alienBot(config,1,i+1).outcome==='win').filter(Boolean).length;console.log('G2i easy wins',wins);assert.ok(wins>=7);});

test('G2i authentic v14 export retains hangar choices on reload and additive import cannot duplicate a spent credit',async()=>{const raw=await readFile(new URL('./fixtures/save-v14.json',import.meta.url),'utf8'),e=createEngine(data,{storage:{getItem:()=>raw,setItem(){}}});assert.equal(e.state.version,18);assert.equal(e.state.hangar.rapid,1);assert.equal(e.state.hangar.paint,1);assert.equal(e.state.hangar.spent,1);assert.ok(validateSave(e.state,data,e.registry).ok);assert.ok(e.importJSON(raw).ok);assert.equal(e.state.hangar.credits,0);});
test('G2i every returned frame stays separated across three seeds at stages 1, 5 and 10',()=>{for(const level of [1,5,10])for(const seed of [1,3,7]){const m=make({level,random:seededRandom(seed)});for(let i=0;i<3600&&!m.result;i++){if(m.choosing)m.chooseUpgrade(0);m.update(.02,{firing:true,x:180,spread:i%1500===0,nova:i%600===0});noOverlap(m);}}});
