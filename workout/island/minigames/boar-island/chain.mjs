// 07/11/2026 weapon chain. core.mjs is a preserved source file, so the additions live here:
// every base weapon continues into two more once it reaches the last upgrade (10, was 6).
// `family` picks the model, sound and firing branch; `prev` is the weapon that must be fully upgraded first.
import * as core from './core.mjs';
export * from './core.mjs';
const {WEAPONS}=core;
Object.assign(WEAPONS,{
  mg2:{family:'mg',prev:'mg',name:'מקלע כפול',short:'כפול',icon:'≣',desc:'שני קנים בכל ירייה. מהיר יותר, אותו חום.',mode:'heat',unlock:3200,upBase:320,damage:20,rate:15,pellets:1,spread:.005,heatPerShot:1.9,mag:0,reload:0,splash:0,chain:0,color:'#ffe08a'},
  shotgun2:{family:'shotgun',prev:'shotgun',name:'רסס כבד',short:'רסס כבד',icon:'⁙',desc:'עשרה רסיסים, מחסנית גדולה, קטלני מקרוב.',mode:'mag',unlock:3600,upBase:340,damage:17,rate:2.2,pellets:10,spread:.05,heatPerShot:0,mag:8,reload:1.8,splash:0,chain:0,color:'#ffc27a'},
  cannon2:{family:'cannon',prev:'cannon',name:'תותח כבד',short:'תותח כבד',icon:'◎',desc:'פגז גדול יותר, פיצוץ רחב.',mode:'mag',unlock:4200,upBase:380,damage:230,rate:1.3,pellets:1,spread:.002,heatPerShot:0,mag:5,reload:2.4,splash:7.5,chain:0,color:'#ffae66'},
  tesla2:{family:'tesla',prev:'tesla',name:'סליל כפול',short:'ברק כפול',icon:'ϟϟ',desc:'קרן חזקה שמדלגת לשלושה אויבים.',mode:'heat',unlock:4800,upBase:420,damage:14,rate:16,pellets:1,spread:0,heatPerShot:1.75,mag:0,reload:0,splash:0,chain:3,color:'#9ff0ff'},
  mg3:{family:'mg',prev:'mg2',name:'מיני-גאן',short:'מיני-גאן',icon:'≋',desc:'קצב אש עצום. לא עוצר.',mode:'heat',unlock:9000,upBase:700,damage:26,rate:24,pellets:1,spread:.007,heatPerShot:1.2,mag:0,reload:0,splash:0,chain:0,color:'#fff0a8'},
  shotgun3:{family:'shotgun',prev:'shotgun2',name:'תותח רסס',short:'תותח רסס',icon:'⁜',desc:'שנים עשר רסיסים בקצב מהיר. מחסל מקרוב.',mode:'mag',unlock:9800,upBase:740,damage:24,rate:2.6,pellets:12,spread:.055,heatPerShot:0,mag:10,reload:2,splash:0,chain:0,color:'#ffd49a'},
  cannon3:{family:'cannon',prev:'cannon2',name:'מרגמת נפץ',short:'מרגמה',icon:'◍',desc:'פגז ענק, פיצוץ גדול שמטאטא קבוצות.',mode:'mag',unlock:11000,upBase:800,damage:380,rate:1.5,pellets:1,spread:.002,heatPerShot:0,mag:6,reload:2.6,splash:9,chain:0,color:'#ffc080'},
  tesla3:{family:'tesla',prev:'tesla2',name:'מטען סערה',short:'סערה',icon:'ϟϟϟ',desc:'ברק שמדלג לחמישה אויבים. מצוין נגד נחילים.',mode:'heat',unlock:12500,upBase:860,damage:20,rate:18,pellets:1,spread:0,heatPerShot:1.55,mag:0,reload:0,splash:0,chain:4,color:'#c4f6ff'}
});
export const WEAPON_ORDER=['mg','shotgun','cannon','tesla','mg2','shotgun2','cannon2','tesla2','mg3','shotgun3','cannon3','tesla3'];
export const BASE_WEAPONS=['mg','shotgun','cannon','tesla'];
export const WEAPON_MAX=10,LEGACY_WEAPON_MAX=6;
let legacy=false; // `?boar=v1`: four weapons, six levels
export function setLegacy(v){legacy=Boolean(v);}
export const weaponMax=()=>legacy?LEGACY_WEAPON_MAX:WEAPON_MAX;
export const fam=key=>WEAPONS[key]?.family||key;
export function weaponLocked(save,key){const p=WEAPONS[key]?.prev;return Boolean(p)&&(save.weapons[p]||0)<weaponMax();}
export function freshSave(){const s=core.freshSave();for(const k of WEAPON_ORDER)s.weapons[k]??=0;return s;}
export function sanitizeSave(raw){
  const s=core.sanitizeSave(raw);
  if(raw?.version===core.VERSION)for(const k of WEAPON_ORDER){const v=Math.floor(Number(raw.weapons?.[k])||0);s.weapons[k]=Math.max(0,Math.min(WEAPON_MAX,v));}
  s.weapons.mg=Math.max(1,s.weapons.mg);for(const k of WEAPON_ORDER)s.weapons[k]??=0;return s;
}
export function weaponCost(save,key){
  const w=WEAPONS[key],lv=save.weapons[key]||0;
  if(lv>=weaponMax()||lv===0&&!legacy&&weaponLocked(save,key))return Infinity;
  return lv===0?w.unlock:Math.round(lv<=6?w.upBase*1.6**(lv-1):w.upBase*1.6**5*1.4**(lv-6));
}
export function buyWeapon(save,key){if(!WEAPONS[key])return false;const c=weaponCost(save,key);if(!Number.isFinite(c)||save.coins<c)return false;save.coins-=c;save.weapons[key]=(save.weapons[key]||0)+1;return true;}
