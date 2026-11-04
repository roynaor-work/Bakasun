// Stick side per game at 844x390 and 390x844, with the "left" hand value saved (the case that used to mirror the layout).
// OUT=<dir> for PNGs, LABEL=before|after. Prints one JSON line per game/viewport.
import {verify} from './night-browser.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const out=process.env.OUT,label=process.env.LABEL||'after';await mkdir(out,{recursive:true});
const GAMES=[['tennis','island.tennis.hand'],['navalDuel','island.naval.hand'],['fireRescue','island.fire.hand'],['alienDefense','island.aliens.hand'],['islandRacing',null],['boarDefense',null]];
const rows=[];
await verify('ctrl-others-'+label,[{width:844,height:390},{width:390,height:844},{width:360,height:740},{width:320,height:568}],async({page,viewport,start,exit,tick})=>{
 for(const [id,key] of GAMES){
  try{if(key)await page.evaluate(k=>localStorage.setItem(k,'left'),key);}catch{}
  try{
   await start(id);await tick(600);
   const r=await page.evaluate(({w,h})=>{
    const mid=(sel)=>{const n=document.querySelector(sel);if(!n)return null;const b=n.getBoundingClientRect();return b.width?{x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2),w:Math.round(b.width)}:null;};
    const stick=mid('.soccer-stick-zone')||mid('.racing-steering'),action=mid('#shoot')||mid('.racing-actions')||mid('#pass');
    const zone=document.querySelector('.soccer-stick-zone')||document.querySelector('.racing-steering'),zr=zone?.getBoundingClientRect(),btns=[...document.querySelectorAll('#shoot,#pass,#drop,#sprint,#switch,.racing-actions,.racing-action')].filter(n=>n.getBoundingClientRect().width),hit=btns.filter(n=>{const b=n.getBoundingClientRect();return zr&&b.left<zr.right&&b.right>zr.left&&b.top<zr.bottom&&b.bottom>zr.top;}).map(n=>n.id||n.className),z=n=>Number(getComputedStyle(n).zIndex)||0,zo=zone?(btns.every(n=>z(n)>=z(zone))):null,leftHalf=zr?zr.right<=w*0.5+1:null;
    return {w,h,overlap:hit,actionsAbove:zo,zoneInLeftHalf:leftHalf,stick,action,cls:document.querySelector('.game-controls,.soccer-controls,.alien-controls')?.className||null};
   },{w:innerWidth,h:innerHeight});
   await page.screenshot({path:`${out}/${label}-${id}-${viewport.width}x${viewport.height}.png`});
   rows.push({id,viewport:`${viewport.width}x${viewport.height}`,...r});
  }catch(e){rows.push({id,viewport:`${viewport.width}x${viewport.height}`,error:String(e.message).slice(0,160)});}
  try{await exit();}catch{}
  try{if(key)await page.evaluate(k=>localStorage.removeItem(k),key);}catch{}
  await writeFile(`${out}/${label}.json`,JSON.stringify(rows,null,1));console.log(JSON.stringify(rows.at(-1)));
 }
 return {};
});
await writeFile(`${out}/${label}.json`,JSON.stringify(rows,null,1));
for(const r of rows)console.log(JSON.stringify(r));
