import test from 'node:test';
import assert from 'node:assert/strict';
import {WEAPONS,WEAPON_ORDER,BASE_WEAPONS,WEAPON_MAX,weaponCost,weaponLocked,buyWeapon,sanitizeSave,freshSave,weaponStats,setLegacy,weaponMax} from '../workout/island/minigames/boar-island/chain.mjs';

test('Boar: no weapon stops upgrading before the last level; every step has a finite, rising price and stronger stats',()=>{
 for(const k of WEAPON_ORDER){const s=freshSave();s.weapons.mg=WEAPON_MAX;s.weapons.mg2=WEAPON_MAX;s.weapons.shotgun=s.weapons.shotgun2=s.weapons.cannon=s.weapons.cannon2=s.weapons.tesla=s.weapons.tesla2=WEAPON_MAX;
  let last=0,dmg=0;for(let lv=1;lv<WEAPON_MAX;lv++){s.weapons[k]=lv;const c=weaponCost(s,k);assert.ok(Number.isFinite(c),`${k} lv${lv} price`);assert.ok(c>last,`${k} lv${lv} price rises`);last=c;
   const d=weaponStats(s,k).damage;assert.ok(d>dmg,`${k} lv${lv} stronger`);dmg=d;}
  s.weapons[k]=WEAPON_MAX;assert.equal(weaponCost(s,k),Infinity);}
});
test('Boar: every base weapon has at least two successors, each locked until the one before is fully upgraded',()=>{
 for(const base of BASE_WEAPONS){const chain=[];let cur=base;for(;;){const next=WEAPON_ORDER.find(k=>WEAPONS[k].prev===cur);if(!next)break;chain.push(next);cur=next;}
  assert.ok(chain.length>=2,`${base} chain`);
  const s=freshSave();s.coins=1e6;
  assert.ok(weaponLocked(s,chain[0]));assert.equal(buyWeapon(s,chain[0]),false);
  s.weapons[base]=WEAPON_MAX;assert.equal(weaponLocked(s,chain[0]),false);assert.equal(buyWeapon(s,chain[0]),true);assert.equal(s.weapons[chain[0]],1);}
});
test('Boar: an old save loads without loss (levels, coins, upgrades) and the old cap of 6 no longer stops it',()=>{
 const old={version:2,coins:777,nextWave:9,bestWave:8,kills:120,weapons:{mg:6,shotgun:3,cannon:1,tesla:0},upgrades:{armor:2,cooling:1,rocket:0,frost:0,turret:1}};
 const s=sanitizeSave(JSON.parse(JSON.stringify(old)));
 assert.equal(s.coins,777);assert.equal(s.nextWave,9);assert.equal(s.weapons.mg,6);assert.equal(s.weapons.shotgun,3);assert.equal(s.weapons.mg2,0);assert.equal(s.upgrades.armor,2);
 assert.ok(Number.isFinite(weaponCost(s,'mg')),'mg level 6 can still be upgraded');
});
test('Boar: the legacy switch (?boar=v1) restores four weapons-worth of cap',()=>{
 setLegacy(true);try{assert.equal(weaponMax(),6);const s=freshSave();s.weapons.mg=6;assert.equal(weaponCost(s,'mg'),Infinity);}finally{setLegacy(false);}
});
