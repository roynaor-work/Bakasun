import {test} from 'node:test';import assert from 'node:assert/strict';
import {freshSave,sanitizeSave,buyUpgrade,upgradeCost,stats,wavePlan,waveBoss,tickHeat,enemyStats,ENEMIES,WEAPONS,WEAPON_ORDER,WEAPON_MAX,weaponStats,weaponCost,buyWeapon,sustainedDps,computeDamage,BOSSES,isBoss,waveWeather,WEATHER} from '../workout/island/minigames/boar-island/core.mjs';

test('purchases charge once and insufficient funds cannot alter progression',()=>{const s=freshSave();const price=upgradeCost(s,'armor');assert.equal(buyUpgrade(s,'armor'),true);assert.equal(s.coins,250-price);assert.equal(stats(s).hp,125);s.coins=0;const before=JSON.stringify(s);assert.equal(buyUpgrade(s,'cooling'),false);assert.equal(buyWeapon(s,'shotgun'),false);assert.equal(JSON.stringify(s),before);});
test('invalid saves recover and levels are capped',()=>{const s=sanitizeSave({version:2,coins:-3,nextWave:0,weapons:{mg:0,shotgun:99},upgrades:{armor:999,cooling:-4}});assert.equal(s.coins,0);assert.equal(s.nextWave,1);assert.equal(s.weapons.mg,1);assert.equal(s.weapons.shotgun,WEAPON_MAX);assert.equal(s.upgrades.armor,6);assert.equal(s.upgrades.cooling,0);assert.deepEqual(sanitizeSave(null),freshSave());});
test('v0.1 saves migrate: progress kept, removed upgrades refunded',()=>{const old={version:1,coins:100,nextWave:4,bestWave:3,kills:40,upgrades:{damage:2,rate:1,cooling:2,armor:1,rocket:0,turret:1}};const s=sanitizeSave(old);
  assert.equal(s.version,2);assert.equal(s.nextWave,4);assert.equal(s.kills,40);assert.equal(s.upgrades.cooling,2);assert.equal(s.upgrades.turret,1);assert.equal(s.weapons.mg,1);
  assert.equal(s.coins,100+90+Math.round(90*1.65)+100);});
test('weapons: unlock then upgrade, cost grows, stats grow, max level stops buying',()=>{const s=freshSave();s.coins=1e6;
  for(const k of WEAPON_ORDER){if(k!=='mg'){assert.equal(s.weapons[k],0);assert.equal(weaponCost(s,k),WEAPONS[k].unlock);assert.ok(buyWeapon(s,k));}
    const a=weaponStats(s,k);const c1=weaponCost(s,k);assert.ok(buyWeapon(s,k));assert.ok(weaponCost(s,k)>c1);const b=weaponStats(s,k);assert.ok(b.damage>a.damage&&b.rate>a.rate);
    while(buyWeapon(s,k));assert.equal(s.weapons[k],WEAPON_MAX);assert.equal(weaponCost(s,k),Infinity);}});
test('each weapon has a distinct role (sustained single-target dps within a sane band)',()=>{const s=freshSave();for(const k of WEAPON_ORDER)s.weapons[k]=1;const cool=stats(s).cooling;
  const d=Object.fromEntries(WEAPON_ORDER.map(k=>[k,sustainedDps(weaponStats(s,k),cool)]));for(const v of Object.values(d))assert.ok(v>40&&v<200,JSON.stringify(d));
  assert.ok(WEAPONS.cannon.splash>0&&WEAPONS.tesla.chain>0&&WEAPONS.shotgun.pellets>1&&WEAPONS.mg.mode==='heat');});
test('armor: plain hits are reduced, eye hits and explosions pierce more',()=>{const plain=computeDamage(100,{armor:.45});const crit=computeDamage(100,{armor:.45,crit:true});const boom=computeDamage(100,{armor:.45,explosive:true});
  assert.equal(Math.round(plain),55);assert.ok(crit>plain*2);assert.ok(boom>plain);assert.equal(computeDamage(10,{crit:true,critMul:3}),30);});
test('boss every fifth wave, ordered times, growing size',()=>{for(let w=1;w<=40;w++){const plan=wavePlan(w);const bosses=plan.filter(e=>isBoss(e.kind));assert.equal(bosses.length,w%5===0?1:0);assert.ok(plan.every((e,i)=>!i||e.time>=plan[i-1].time));assert.ok(plan.length>=8);assert.deepEqual(plan,wavePlan(w),'deterministic');}
  assert.equal(waveBoss(5),'king');assert.equal(waveBoss(10),'hive');assert.ok(wavePlan(9).length>wavePlan(1).length);
  assert.ok(wavePlan(1).every(e=>e.kind==='scout'));assert.ok(wavePlan(6).some(e=>e.kind==='mortar'));});
test('heat caps, cooling recovers, fury prevents overheating',()=>{assert.deepEqual(tickHeat(98,.2,true,20),{heat:100,overheated:true});assert.equal(tickHeat(100,4,false,21).heat,16);assert.equal(tickHeat(90,1,true,20,true).heat,50);assert.ok(tickHeat(0,1,true,20,false,'cool').heat<tickHeat(0,1,true,20).heat);});
test('later waves increase resistance, early waves hit softer, all enemies reward',()=>{for(const kind of Object.keys(ENEMIES)){const first=enemyStats(kind,1),later=enemyStats(kind,6);assert.ok(later.hp>first.hp);assert.ok(first.reward>0&&first.speed>0);}
  assert.ok(enemyStats('scout',1).damage<enemyStats('scout',6).damage);assert.ok(enemyStats('king',10).hp>enemyStats('king',5).hp*1.5);});
test('v0.3 invaders: sharks from wave 6, crabs from 7, mantas from 8, all three in 9 and later',()=>{const kinds=w=>new Set(wavePlan(w).map(e=>e.kind));
  assert.ok(kinds(6).has('shark'));assert.ok(kinds(7).has('crab'));assert.ok(kinds(8).has('manta'));for(const w of [9,14,19,21,24])for(const k of ['shark','crab','manta'])assert.ok(kinds(w).has(k),`${k} in wave ${w}`);
  for(let w=1;w<=5;w++)for(const k of ['shark','crab','manta'])assert.ok(!kinds(w).has(k),'not before wave 6');
  assert.ok(ENEMIES.crab.armor>=.5&&ENEMIES.crab.hp>ENEMIES.heavy.hp);assert.ok(ENEMIES.manta.armor===0);});
test('v0.4 chapter 2: hand-made waves 11-20, new bosses at 15 and 20, weather with rules',()=>{
  assert.equal(waveBoss(15),'turtle');assert.equal(waveBoss(20),'leviathan');assert.deepEqual([25,30,35,40].map(waveBoss),['king','hive','turtle','leviathan']);
  assert.equal(waveWeather(5),'clear');assert.equal(waveWeather(11),'fog');assert.equal(waveWeather(12),'rain');assert.equal(waveWeather(20),'storm');
  const seen=new Set();for(let w=11;w<=40;w++){const k=waveWeather(w);assert.ok(WEATHER[k],k);seen.add(k);}assert.equal(seen.size,4);
  assert.ok(WEATHER.rain.cooling>1&&WEATHER.storm.chain===1&&WEATHER.clear.cooling===1);
  const size=w=>wavePlan(w).filter(e=>!isBoss(e.kind)).length;assert.ok(size(19)>size(11));assert.ok(size(21)>=size(19)&&size(21)<size(19)*1.4,'no jump after the hand-made waves');
  for(const k of ['turtle','leviathan']){assert.ok(ENEMIES[k].hp>0&&BOSSES.includes(k));assert.ok(enemyStats(k,15).hp>enemyStats('king',5).hp);}
});
