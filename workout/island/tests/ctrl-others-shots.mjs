// Stick side per game, per landscape size. Each game is also rotated to portrait mid-game and back
// (390x844, 360x740, 320x568 are the portrait twins of 844x390, 740x360, 568x320).
// A saved "left" hand value is set first (the case that used to mirror the layout).
// OUT=<dir>, LABEL=before|after. Writes <OUT>/<LABEL>.json and PNGs.
import {verify} from './night-browser.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const out=process.env.OUT,label=process.env.LABEL||'after';await mkdir(out,{recursive:true});
const GAMES=[['tennis','island.tennis.hand'],['navalDuel','island.naval.hand'],['fireRescue','island.fire.hand'],['alienDefense','island.aliens.hand'],['islandRacing',null],['boarDefense',null]];
const rows=[];
const measure=()=>({w:innerWidth,h:innerHeight}),probe=({w,h})=>{
 const rect=n=>{const b=n.getBoundingClientRect();return b.width?b:null;};
 const zoneNode=document.querySelector('.soccer-stick-zone')||document.querySelector('.racing-steering'),zr=zoneNode&&rect(zoneNode);
 const btns=[...document.querySelectorAll('#shoot,#pass,#drop,#sprint,#switch,.racing-action')].filter(rect);
 const hit=btns.filter(n=>{const b=rect(n);return zr&&b.left<zr.right&&b.right>zr.left&&b.top<zr.bottom&&b.bottom>zr.top;}).map(n=>n.id||n.className);
 const z=n=>Number(getComputedStyle(n).zIndex)||0;
 const c=n=>n?{x:Math.round(n.left+n.width/2),y:Math.round(n.top+n.height/2)}:null;
 const act=btns.length?btns.map(rect).reduce((a,b)=>({left:Math.min(a.left,b.left),right:Math.max(a.right,b.right),top:Math.min(a.top,b.top),bottom:Math.max(a.bottom,b.bottom),width:0}),{left:1e9,right:-1e9,top:1e9,bottom:-1e9}):null;
 if(act)act.width=act.right-act.left;
 return {w,h,stickCentre:c(zr),stickRect:zr&&{l:Math.round(zr.left),r:Math.round(zr.right)},actionCentre:act&&{x:Math.round((act.left+act.right)/2)},overlap:hit,actionsAboveStick:zoneNode?btns.every(n=>z(n)>=z(zoneNode)):null,stickInLeftHalf:zr?zr.right<=w*.5+1:null,
  rotateOverlay:!!document.querySelector('.soccer-rotate:not([hidden])'),leftHandedClass:!!document.querySelector('.left-handed'),handToggle:!!document.querySelector('[data-action$="-hand"],[data-alien-hand],[data-naval-hand]')};
};
await verify('ctrl-others-'+label,[{width:844,height:390},{width:740,height:360},{width:568,height:320}],async({page,viewport,start,exit,tick})=>{
 const tag=(v)=>`${v.width}x${v.height}`;
 for(const [id,key] of GAMES){
  try{if(key)await page.evaluate(k=>localStorage.setItem(k,'left'),key);}catch{}
  const base={id};
  try{
   await start(id);await tick(600);
   const phases=[['landscape',viewport],['portrait',{width:viewport.height,height:viewport.width}],['landscape-again',viewport]];
   for(const [phase,v] of phases){
    await page.setViewportSize(v);await tick(300);
    const r=await page.evaluate(probe,await page.evaluate(measure));
    await page.screenshot({path:`${out}/${label}-${id}-${phase}-${tag(v)}.png`});
    rows.push({...base,phase,size:tag(v),...r});
   }
  }catch(e){rows.push({...base,size:tag(viewport),error:String(e.message).slice(0,200)});}
  try{await page.setViewportSize(viewport);await exit();}catch{}
  try{if(key)await page.evaluate(k=>localStorage.removeItem(k),key);}catch{}
  await writeFile(`${out}/${label}.json`,JSON.stringify(rows,null,1));
 }
 return {};
});
