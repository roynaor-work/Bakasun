// אי החזירים: לכל נשק קליע, מראה וצליל משלו (v24.1, 14/11/2026).
// Roy after v24: "בנוסף לכל נשק צריך שיהיה משהו שונה / נגיד לקלע כדורים של ירי / בתותח פגזים".
// Until v24 the machine gun and the shotgun drew the same thin yellow streak (a laser line rather than rounds), the cannon a glowing capsule
// that flew almost straight, and the twelve weapons of the chain shared four sounds. v24.1 gives every weapon its own round:
//  - machine guns (מקלע): glowing bullets, a white-hot core in a coloured glow, one per shot; the double gun fires a pair (one from each
//    barrel), the minigun thin white-hot rounds in a fast stream;
//  - shotguns (רסס): a spray of small round pellets, every pellet visible (v24 drew every other one); the heavy one red, bigger pellets;
//    the last one thin steel darts (flechettes);
//  - cannons (תותח): a real shell, a brass case with a pointed nose and a burning tracer at its base, spinning, with a smoke trail, flying
//    a visible arc onto the aim point (the launch is solved so it lands where the crosshair points, in the same flight time as v24's
//    straight shell: only the path bends, by a stronger gravity); the heavy shell is bigger, the mortar a round finned bomb on a high lob;
//  - lightning (ברק): the bolt, cyan; the double coil two strands, the storm a violet bolt with a plasma ball where it strikes;
// and each weapon its own firing sound (pitch, body and tail per weapon, synthesised like the rest of the game's sounds) plus, for shells,
// the whistle of the shell in flight. Only the look and the sound change: damage, rate, spread, hit tests and timing stay the weapon's own.
// Pure description plus a tiny ballistic helper (no DOM, no Three.js): game.js draws it with its own pools. `?boarFx=v24` keeps the v24 look.

/** One look per weapon of the chain (chain.mjs WEAPON_ORDER). kind: bullet | pellet | shell | bolt. Colours: core (hot centre) and glow. */
export const WEAPON_FX=Object.freeze({
  mg:{kind:'bullet',core:'#fff6d8',glow:'#ffc94a',len:1.5,width:.075,glowWidth:.2,speed:300,pair:false,sound:'mg',casing:'brass'},
  mg2:{kind:'bullet',core:'#fff2c4',glow:'#ff9d2e',len:1.7,width:.085,glowWidth:.24,speed:310,pair:true,sound:'mg2',casing:'brass'},
  mg3:{kind:'bullet',core:'#ffffff',glow:'#ffe680',len:2.6,width:.06,glowWidth:.15,speed:380,pair:false,sound:'mg3',casing:'brass'},
  shotgun:{kind:'pellet',core:'#fff1d6',glow:'#ffb35c',len:.42,width:.11,glowWidth:.26,speed:230,sound:'shotgun',casing:'shell'},
  shotgun2:{kind:'pellet',core:'#ffe0c4',glow:'#ff6a3c',len:.5,width:.15,glowWidth:.34,speed:220,sound:'shotgun2',casing:'shell'},
  shotgun3:{kind:'pellet',core:'#f2fbff',glow:'#9fd8ff',len:1.1,width:.05,glowWidth:.14,speed:280,sound:'shotgun3',casing:'shell',dart:true},
  cannon:{kind:'shell',body:'#c9a24a',nose:'#8a3a2a',tracer:'#ffb04a',radius:.17,length:.9,speed:170,gravity:55,smoke:'#c9c9c9',smokeSize:.9,spin:14,sound:'cannon',whistle:'shellWhistle',casing:'shell'},
  cannon2:{kind:'shell',body:'#b8933c',nose:'#5f2a20',tracer:'#ff8a30',radius:.23,length:1.15,speed:170,gravity:50,smoke:'#a9a9a9',smokeSize:1.25,spin:11,sound:'cannon2',whistle:'shellWhistle',casing:'shell'},
  cannon3:{kind:'shell',body:'#5d6b4a',nose:'#3a4430',tracer:'#ffd06a',radius:.27,length:.75,speed:170,gravity:110,smoke:'#bdbdbd',smokeSize:1.4,spin:0,sound:'cannon3',whistle:'mortarWhistle',casing:'shell',mortar:true},
  tesla:{kind:'bolt',color:'#7fe3ff',width:.045,strands:1,sound:'tesla'},
  tesla2:{kind:'bolt',color:'#bff4ff',width:.05,strands:2,sound:'tesla2'},
  tesla3:{kind:'bolt',color:'#c9a2ff',width:.065,strands:2,orb:'#d9b8ff',sound:'tesla3'}
});
export const weaponFx=key=>WEAPON_FX[key]||WEAPON_FX.mg;

/** Launch velocity for a shell from `from` to `to` (world points): the flight time is the straight distance over `speed` (v24's shell
 *  covered it at 170 u/s), and the vertical speed is solved so that under gravity `g` the shell lands on `to` (a still target) at that
 *  time. Returns {vx,vy,vz,t}; the position at time s is from + v s - (0, g s^2 / 2, 0) (game.js flies it exactly like that). */
export function shellLaunch(from,to,speed,g,{minT=.08}={}){
  const dx=to.x-from.x,dz=to.z-from.z,dy=to.y-from.y,h=Math.hypot(dx,dz),t=Math.max(minT,Math.hypot(h,dy)/Math.max(1e-6,speed));
  const vy=dy/t+.5*g*t,ux=h>1e-6?dx/h:0,uz=h>1e-6?dz/h:0,vh=h/t;
  return {vx:ux*vh,vy,vz:uz*vh,t};
}
/** The highest point of that arc above the straight line (for tests and the proof): g t^2 / 8. */
export const shellApex=(g,t)=>g*t*t/8;
/** Where a shell launched with `v` (shellLaunch) is `s` seconds after it left `from`, and its velocity there. */
export function shellAt(from,v,g,s){return {x:from.x+v.vx*s,y:from.y+v.vy*s-.5*g*s*s,z:from.z+v.vz*s,vx:v.vx,vy:v.vy-g*s,vz:v.vz};}
