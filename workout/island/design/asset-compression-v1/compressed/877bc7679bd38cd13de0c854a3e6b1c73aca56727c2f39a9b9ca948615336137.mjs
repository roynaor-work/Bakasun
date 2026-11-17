// Pure game logic: economy, weapons, waves, enemies, heat and damage. No DOM, no Three.js.
export const VERSION = 2;

// Weapons. mode 'heat' = continuous fire limited by heat; 'mag' = magazine + reload.
export const WEAPONS = {
  mg:{name:'מקלע חוף',short:'מקלע',icon:'≡',desc:'שני קנים מסתובבים. מהיר, מדויק, מתחמם.',mode:'heat',unlock:0,upBase:110,damage:15,rate:9,pellets:1,spread:.004,heatPerShot:3.1,mag:0,reload:0,splash:0,chain:0,color:'#ffd27a'},
  shotgun:{name:'רסס סערה',short:'רסס',icon:'⁘',desc:'שמונה רסיסים בכל ירייה. קטלני מקרוב, מתפזר למרחק.',mode:'mag',unlock:420,upBase:130,damage:12,rate:1.9,pellets:8,spread:.045,heatPerShot:0,mag:6,reload:1.7,splash:0,chain:0,color:'#ffb067'},
  cannon:{name:'תותח נפץ',short:'תותח',icon:'◉',desc:'פגז שמתפוצץ באזור הפגיעה. שובר שריון ורפסודות.',mode:'mag',unlock:850,upBase:160,damage:130,rate:1.15,pellets:1,spread:.002,heatPerShot:0,mag:4,reload:2.3,splash:6.5,chain:0,color:'#ff9a4d'},
  tesla:{name:'סליל ברק',short:'ברק',icon:'ϟ',desc:'קרן חשמלית שננעלת ומדלגת לעוד שני אויבים. מצוין נגד רחפנים.',mode:'heat',unlock:1400,upBase:190,damage:9.5,rate:14,pellets:1,spread:0,heatPerShot:2.35,mag:0,reload:0,splash:0,chain:2,color:'#8fe9ff'}
};
export const WEAPON_ORDER = ['mg','shotgun','cannon','tesla'];
export const WEAPON_MAX = 6;

export const UPGRADE_DEFS = {
  armor:{name:'ביצורי החוף',icon:'⬡',desc:'עוד 25 נקודות הגנה לחומת האי.',base:100,max:6},
  cooling:{name:'מערכת קירור',icon:'❄',desc:'קירור מהיר יותר וטעינה מחדש קצרה יותר לכל הנשקים.',base:80,max:6},
  rocket:{name:'ראש נפץ',icon:'↗',desc:'טילים חזקים יותר וטווח פיצוץ רחב יותר.',base:110,max:6},
  frost:{name:'מקפיא ימי',icon:'✳',desc:'ההקפאה נמשכת יותר זמן ונטענת מהר יותר.',base:90,max:5},
  turret:{name:'צריח סיוע',icon:'⌖',desc:'צריח אוטומטי על האגף. דרגה 3 מוסיפה צריח שני.',base:180,max:4}
};

export const PERKS = [
  {id:'chain',name:'ברק קופץ',desc:'כל פגיעה רביעית קופצת לאויב סמוך.'},
  {id:'chill',name:'קליעים מקפיאים',desc:'פגיעות מאטות את האויב לזמן קצר.'},
  {id:'bounty',name:'אוצרות חוף',desc:'עוד 35% מטבעות מכל רובוט שהופל.'},
  {id:'pierce',name:'חודרי שריון',desc:'תוספת 30% לנזק של כל הנשקים.'},
  {id:'cool',name:'קירור ימי',desc:'התחממות נמוכה ב־40% וטעינה מהירה יותר.'},
  {id:'charge',name:'סוללת חירום',desc:'כוח האש נטען פי שניים מהר יותר.'},
  {id:'eagle',name:'עין הנץ',desc:'פגיעה בעין הזוהרת עושה פי 3 נזק במקום פי 2.'}
];

// Enemy table: hp, speed, damage, reward, armor (0..1 damage reduction).
export const ENEMIES = {
  scout:{name:'חזרזיר',hp:40,speed:4.6,damage:8,reward:14,armor:0},
  runner:{name:'רץ',hp:26,speed:8,damage:6,reward:16,armor:0},
  heavy:{name:'משוריין',hp:170,speed:2.6,damage:16,reward:34,armor:.45},
  drone:{name:'רחפן',hp:34,speed:5.2,damage:7,reward:22,armor:0},
  raft:{name:'רפסודה',hp:95,speed:3.8,damage:0,reward:26,armor:.2},
  mortar:{name:'מרגמה',hp:75,speed:3.4,damage:9,reward:30,armor:.15},
  shark:{name:'כריש פלדה',hp:95,speed:7.5,damage:11,reward:32,armor:.15},
  manta:{name:'מנטה מעופפת',hp:60,speed:6.5,damage:14,reward:30,armor:0},
  crab:{name:'סרטן מצור',hp:260,speed:2.1,damage:13,reward:48,armor:.5},
  king:{name:'מלך הברזל',hp:2900,speed:1.45,damage:28,reward:320,armor:.35},
  hive:{name:'ספינת הכוורת',hp:2200,speed:2.2,damage:9,reward:360,armor:.25},
  turtle:{name:'צב המבצר',hp:2800,speed:1.25,damage:30,reward:460,armor:.4},
  leviathan:{name:'לווייתן הפלדה',hp:2400,speed:3,damage:12,reward:560,armor:.3}
};
export const BOSSES = ['king','hive','turtle','leviathan'];
export const isBoss=k=>BOSSES.includes(k);

// Weather: a look plus one small rule, so it changes how a wave plays, not only how it looks.
export const WEATHER = {
  clear:{name:'שמיים בהירים',rule:'',cooling:1,chain:0},
  fog:{name:'ערפל',rule:'האויבים מגיחים מתוך הערפל · העיניים הזוהרות נראות ראשונות',cooling:1,chain:0},
  rain:{name:'גשם',rule:'הגשם מקרר · המקלע וסליל הברק מתחממים לאט יותר',cooling:1.35,chain:0},
  storm:{name:'סערה',rule:'ברקים באוויר · סליל הברק קופץ למטרה נוספת',cooling:1.15,chain:1}
};

export function freshSave(){
  return {version:VERSION,coins:250,nextWave:1,bestWave:0,kills:0,
    weapons:Object.fromEntries(WEAPON_ORDER.map(k=>[k,k==='mg'?1:0])),
    upgrades:Object.fromEntries(Object.keys(UPGRADE_DEFS).map(k=>[k,0]))};
}
// Old v1 cost formula, used to refund upgrades that no longer exist.
function v1Spent(base,level){let s=0;for(let i=0;i<level;i++)s+=Math.round(base*1.65**i);return s;}
const int=(v,min,max)=>Math.max(min,Math.min(max,Math.floor(Number(v)||0)));

export function sanitizeSave(raw){
  const s=freshSave(); if(!raw||typeof raw!=='object')return s;
  if(raw.version===1){ // migrate: keep progress, refund removed 'damage'/'rate' upgrades, keep the rest
    for(const k of ['coins','nextWave','bestWave','kills'])if(Number.isFinite(raw[k]))s[k]=int(raw[k],k==='nextWave'?1:0,1e7);
    const u=raw.upgrades||{};s.coins=Math.min(1e7,s.coins+v1Spent(90,int(u.damage,0,8))+v1Spent(100,int(u.rate,0,8)));
    for(const k of ['armor','cooling','rocket','turret'])s.upgrades[k]=int(u[k],0,UPGRADE_DEFS[k].max);
    return s;
  }
  if(raw.version!==VERSION)return s;
  for(const k of ['coins','nextWave','bestWave','kills'])if(Number.isFinite(raw[k]))s[k]=int(raw[k],k==='nextWave'?1:0,1e7);
  for(const [k,d] of Object.entries(UPGRADE_DEFS))s.upgrades[k]=int(raw.upgrades?.[k],0,d.max);
  for(const k of WEAPON_ORDER)s.weapons[k]=int(raw.weapons?.[k],0,WEAPON_MAX);
  s.weapons.mg=Math.max(1,s.weapons.mg);
  return s;
}

export function upgradeCost(save,key){return Math.round(UPGRADE_DEFS[key].base*1.65**save.upgrades[key]);}
export function buyUpgrade(save,key){const d=UPGRADE_DEFS[key];if(!d||save.upgrades[key]>=d.max)return false;const cost=upgradeCost(save,key);if(save.coins<cost)return false;save.coins-=cost;save.upgrades[key]++;return true;}
export function weaponCost(save,key){const w=WEAPONS[key],lv=save.weapons[key];if(lv>=WEAPON_MAX)return Infinity;return lv===0?w.unlock:Math.round(w.upBase*1.6**(lv-1));}
export function buyWeapon(save,key){if(!WEAPONS[key])return false;const c=weaponCost(save,key);if(!Number.isFinite(c)||save.coins<c)return false;save.coins-=c;save.weapons[key]++;return true;}

export function stats(save){const u=save.upgrades;return {turretDamage:8+u.turret*5,turretGap:1.3/(1+.35*Math.max(0,u.turret-1)),hp:100+u.armor*25,cooling:21+u.cooling*5,reloadMul:1-u.cooling*.08,rocket:100+u.rocket*38,radius:10+u.rocket*1.6,rocketCd:13,frostTime:6+u.frost,frostCd:20-u.frost*1.5,turret:u.turret};}
export function weaponStats(save,key){
  const w=WEAPONS[key],lv=Math.max(1,save.weapons[key]),st=stats(save);
  return {...w,level:lv,damage:w.damage*(1+.22*(lv-1)),rate:w.rate*(1+.06*(lv-1)),mag:w.mag?w.mag+Math.floor((lv-1)/2):0,reload:w.reload*st.reloadMul,splash:w.splash?w.splash+(lv-1)*.5:0,chain:w.chain?w.chain+Math.floor((lv-1)/3):0};
}
// Expected damage per second while firing at a single target (all pellets hit), including heat or reload downtime.
export function sustainedDps(ws,cooling){
  const burst=ws.damage*ws.pellets*ws.rate;
  if(ws.mode==='mag'){const t=ws.mag/ws.rate;return burst*t/(t+ws.reload);}
  const heatUp=ws.heatPerShot*ws.rate; // heat per second while firing
  if(heatUp<=cooling)return burst;
  const on=100/heatUp,off=75/cooling;return burst*on/(on+off);
}

export function computeDamage(amount,{armor=0,crit=false,explosive=false,critMul=2}={}){
  const a=explosive?armor*.3:crit?armor*.5:armor;
  return amount*(crit?critMul:1)*(1-a);
}

// Hand-made waves 1-10, then generated waves. Each entry: [kind,count].
const WAVES = [
  null,
  {gap:1.9,mix:[['scout',8]]},
  {gap:1.5,mix:[['scout',9],['runner',3]]},
  {gap:1.35,mix:[['scout',9],['runner',3],['drone',3]]},
  {gap:1.15,mix:[['scout',10],['runner',4],['heavy',2],['raft',2]]},
  {gap:1.5,mix:[['scout',8],['runner',3]],boss:'king'},
  {gap:1.1,mix:[['scout',9],['runner',4],['shark',3],['mortar',2]]},
  {gap:1.05,mix:[['scout',8],['runner',4],['crab',2],['heavy',2],['raft',2]]},
  {gap:1.0,mix:[['scout',9],['drone',4],['manta',4],['mortar',2]]},
  {gap:.92,mix:[['scout',10],['runner',5],['heavy',2],['shark',3],['crab',2],['manta',3],['raft',2]]},
  {gap:1.15,mix:[['drone',6],['scout',6],['manta',3],['heavy',2]],boss:'hive'},
  // 11-20: second chapter, each wave with its own weather and theme
  {gap:.95,weather:'fog',mix:[['scout',10],['runner',4],['shark',4],['raft',3],['heavy',1]]},
  {gap:.95,weather:'rain',mix:[['scout',8],['heavy',3],['crab',3],['mortar',3],['runner',3]]},
  {gap:.72,mix:[['runner',12],['scout',6],['drone',6],['manta',4]]},
  {gap:.9,weather:'storm',mix:[['scout',10],['runner',5],['heavy',2],['drone',5],['shark',3],['crab',2],['manta',3]]},
  {gap:1.2,weather:'rain',mix:[['scout',8],['heavy',2],['mortar',2],['runner',3]],boss:'turtle'},
  {gap:.85,weather:'fog',mix:[['scout',8],['drone',7],['manta',6],['runner',4]]},
  {gap:.9,weather:'rain',mix:[['scout',9],['crab',5],['mortar',4],['heavy',3],['runner',3]]},
  {gap:.85,weather:'storm',mix:[['scout',10],['shark',7],['raft',4],['runner',5],['manta',2]]},
  {gap:.78,weather:'storm',mix:[['scout',12],['runner',6],['heavy',3],['drone',5],['raft',2],['mortar',3],['shark',4],['crab',3],['manta',4]]},
  {gap:1.1,weather:'storm',mix:[['scout',7],['runner',4],['manta',3]],boss:'leviathan'}
];
const CYCLE=['clear','fog','rain','storm','clear','rain'];
function waveSpec(wave){
  if(wave<WAVES.length)return WAVES[wave];
  const n=wave-14; // continues from the size of the hand-made wave 19
  return {gap:Math.max(.62,.9-n*.02),weather:CYCLE[wave%CYCLE.length],mix:[['scout',9+n],['runner',5+Math.floor(n/2)],['heavy',2+Math.floor(n/3)],['drone',3+Math.floor(n/2)],['raft',2+Math.floor(n/4)],['mortar',2+Math.floor(n/3)],['shark',2+Math.floor(n/3)],['crab',1+Math.floor(n/3)],['manta',2+Math.floor(n/3)]],boss:wave%5===0?BOSSES[(wave/5-1)%BOSSES.length]:null};
}
export function waveWeather(wave){return waveSpec(wave).weather||'clear';}
function seeded(seed){let s=seed*9301+49297;return()=>((s=(s*9301+49297)%233280)/233280);}
// Pacing (v0.4): every wave is three attacks with a short calm between them, about 1-1.5 minutes per wave
// (bosses ~2). Enemy counts are scaled up for that, and the reward per robot down, so the shop economy stays the same.
export const PULSES=3,LULL=6.5,REWARD_MUL=.75;
export function waveScale(wave){return wave<=2?1.25:wave<=4?1.4:wave<=20?1.5:1.25;}
export function wavePlan(wave){
  const spec=waveSpec(wave),rnd=seeded(wave),list=[],m=waveScale(wave);
  const gap=spec.gap*(wave>=6&&wave<=19?1.15:1);
  for(const [k,c] of spec.mix)for(let i=0;i<Math.max(1,Math.round(c*m));i++)list.push(k);
  // Deterministic shuffle, but keep the first three spawns easy scouts so the wave opens readable.
  for(let i=list.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[list[i],list[j]]=[list[j],list[i]];}
  list.sort((a,b)=>(a==='scout'?0:1)-(b==='scout'?0:1)||0);
  const head=list.splice(0,3),rest=list;for(let i=rest.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[rest[i],rest[j]]=[rest[j],rest[i]];}
  const all=[...head,...rest],cuts=[Math.round(all.length*.34),Math.round(all.length*.67)];let t=0;
  const plan=all.map((kind,i)=>{const pulse=i<cuts[0]?1:i<cuts[1]?2:3;if(i&&(i===cuts[0]||i===cuts[1]))t+=LULL;const e={kind,time:+(t+(i?rnd()*.4:0)).toFixed(2)};if(i===cuts[0]||i===cuts[1])e.pulse=pulse;t+=gap;return e;});
  if(spec.boss)plan.push({kind:spec.boss,time:6});
  return plan.sort((a,b)=>a.time-b.time);
}
export function waveBoss(wave){return waveSpec(wave).boss||null;}

export function enemyStats(kind,wave){
  const d=ENEMIES[kind];const scale=1+(wave-1)*.14;
  const bossScale=BOSSES.includes(kind)?1+Math.max(0,Math.floor(wave/5)-(kind==='turtle'?3:kind==='leviathan'?4:1))*.35:1;
  // early waves hit softer so a first-time player can learn the controls
  return {hp:Math.round(d.hp*scale*bossScale),speed:d.speed*(1+Math.min(wave,30)*.02),damage:Math.round(d.damage*Math.min(1,.65+.07*wave)*10)/10,reward:Math.max(1,Math.round(d.reward*(1+(wave-1)*.04)*(BOSSES.includes(kind)?1:REWARD_MUL))),armor:d.armor};
}

export function tickHeat(heat,dt,firing,cooling,fury=false,perk='',heatRate=28){
  if(fury)return {heat:Math.max(0,heat-cooling*dt*2),overheated:false};
  const next=Math.min(100,Math.max(0,heat+dt*(firing?heatRate*(perk==='cool'?.6:1):-cooling)));
  return {heat:next,overheated:next>=100};
}
export function waveBonus(wave){return 60+wave*15;}
