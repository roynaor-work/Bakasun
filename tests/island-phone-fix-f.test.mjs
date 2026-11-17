import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.resolve(process.env.PHONE_FIX_ROOT||fileURLToPath(new URL('../',import.meta.url)));
let sequence=0;
async function load(search=''){
  globalThis.location={search};
  return import(pathToFileURL(path.join(root,'workout/island/minigames/boar-island/chain.mjs')).href+'?F='+sequence++);
}
const game=await load();
function overheat(g,save){const ws=g.weaponStats(save,'mg');let heat=0,t=0,shots=0;for(;t<30;t+=1/900){heat=g.tickHeat(heat,1/900,true,g.stats(save).cooling,false,'',ws.heatPerShot*ws.rate).heat;if(heat>=100)break;}return {seconds:t,shots:t*ws.rate,heatPerSecond:ws.heatPerShot*ws.rate};}
test('F: the stock Vulcan fires at least 4.7 seconds before overheating',()=>{
 const observed=overheat(game,game.freshSave());
 assert.ok(observed.seconds>=4.7,JSON.stringify(observed));
 assert.ok(observed.seconds<5.2,'base heat still limits continuous fire');
});
test('F: the starter wallet buys two useful Vulcan levels with rising prices',()=>{
 const s=game.freshSave();assert.equal(s.coins,250);
 assert.equal(game.weaponCost(s,'mg'),80);assert.equal(game.buyWeapon(s,'mg'),true);
 assert.equal(game.weaponCost(s,'mg'),120);assert.equal(game.buyWeapon(s,'mg'),true);
 assert.equal(s.weapons.mg,3);assert.equal(s.coins,50);
 assert.equal(game.weaponCost(s,'mg'),180);assert.equal(game.buyWeapon(s,'mg'),false);
});
test('F: every Vulcan level increases damage/rate and reduces active heating',()=>{
 const s=game.freshSave();let previous=game.weaponStats(s,'mg');
 for(let lv=2;lv<=game.WEAPON_MAX;lv++){
  s.weapons.mg=lv;const current=game.weaponStats(s,'mg');
  assert.ok(current.damage>previous.damage&&current.rate>previous.rate);
  assert.ok(current.heatPerShot*current.rate<previous.heatPerShot*previous.rate,`level ${lv} heats faster`);
  previous=current;
 }
 assert.equal(game.weaponCost(s,'mg'),Infinity);
});
test('F: cooling upgrades reduce active Vulcan heat, as well as cooling it at rest',()=>{
 const s=game.freshSave(),stock=overheat(game,s);s.upgrades.cooling=1;const improved=overheat(game,s);
 assert.ok(improved.seconds>stock.seconds*1.04,JSON.stringify({stock,improved}));
 assert.ok(game.stats(s).cooling>game.stats(game.freshSave()).cooling);
});
test('F: tuning preserves saved balances and secondary weapon economy/stats',async()=>{
 const legacy=await load('?phoneFixF=0'),save=game.freshSave();save.coins=777;save.weapons.mg=5;save.upgrades.cooling=3;
 assert.deepEqual(game.sanitizeSave(save),legacy.sanitizeSave(save));
 for(const key of ['shotgun','cannon','tesla']){
  assert.deepEqual(game.weaponStats(save,key),legacy.weaponStats(save,key));
  assert.equal(game.weaponCost(save,key),legacy.weaponCost(save,key));
 }
});
if(process.env.PHONE_FIX_ROLLBACK==='1')for(const search of ['?phoneFixF=0','?phoneFixes=0','?boar=v1'])test('F rollback '+search,async()=>{
 const old=await load(search),s=old.freshSave();assert.equal(old.weaponCost(s,'mg'),110);
 const stock=overheat(old,s);assert.ok(stock.seconds>3.58&&stock.seconds<3.59,JSON.stringify(stock));
 s.weapons.mg=2;assert.equal(old.weaponCost(s,'mg'),176);
 s.upgrades.cooling=1;assert.equal(old.weaponStats(s,'mg').heatPerShot,3.1);
});
test('F: the MG shop DPS estimate includes cooling pauses even with purchased cooling',()=>{
 const s=game.freshSave();s.upgrades.cooling=3;const ws=game.weaponStats(s,'mg'),st=game.stats(s),on=overheat(game,s).seconds;
 let heat=100,off=0;while(heat>=25){heat=game.tickHeat(heat,1/900,false,st.cooling).heat;off+=1/900;}
 const measuredDps=ws.damage*ws.rate*on/(on+off),displayed=game.sustainedDps(ws,st.cooling);
 assert.ok(Math.abs(displayed-measuredDps)/measuredDps<.005,JSON.stringify({displayed,measuredDps,on,off}));
});
test('F: both URL rollback flags reach the real embedded campaign adapter',async()=>{
 const {runBoarSession}=await import(pathToFileURL(path.join(root,'workout/island/minigames/boar-session.mjs')));
 for(const key of ['phoneFixF','phoneFixes']){
  globalThis.location={search:`?${key}=0&dev=1`};let embedded;
  const node=()=>Object.assign(new EventTarget(),{classList:{add(){},remove(){}},setAttribute(){},removeAttribute(){},remove(){}});
  const document={defaultView:node(),createElement:()=>node()};
  const dialog=node();dialog.querySelector=()=>null;
  const canvas=node();canvas.ownerDocument=document;canvas.parentElement={append(frame){embedded=frame;}};
  const session=runBoarSession({canvas,dialog,controls:node(),status:{},warning:{},t:k=>k,cancel(){}});
  try{assert.equal(new URL(embedded.src).searchParams.get(key),'0',key+' missing from iframe');}finally{session.dispose();}
 }
});
