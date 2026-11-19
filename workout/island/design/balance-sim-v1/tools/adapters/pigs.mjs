import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {join,resolve,dirname,extname,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
const pools=new Map();
export const games=[{id:'boarDefense',name:'חזירים',stages:Array.from({length:30},(_,i)=>i+1),sources:['workout/island/minigames/boar-island/core.mjs','workout/island/minigames/boar-island/chain.mjs','workout/island/minigames/boar-island/game.js','workout/island/minigames/boar-island/aim-v24.mjs'],notes:['קמפיין החזירים אינו מסתיים: 20 גלים מתוכננים ואחריהם גלים מחושבים ללא גבול. נמדדים כל 20 הגלים המתוכננים וגם מדגם הזנב 21–30.','מריצים את לולאת המשחק המקורית ב-Chromium, דרך API הבדיקות הקיים. אין מודל headless מלא; ה-Three.js נדרש לחישוב אזורי הפגיעה.','כל גל מתחיל בשמירה חדשה, מקלע דרגה 1, ללא שדרוגים וללא יתרון. זו מדידת קושי ללא ציוד, ולא הדמיית צבירת מטבעות בין גלים.','אין כוכבים או נפילות במודל זה: stars ו-falls הם null. הבוט הקיים בוחר מטרות בכל זמן תגובה ומוסיף רעד בכל פריים; השהיות הקלט נדגמות בנפרד.','מחולל מזהי UUID של Three מופרד לזרם אקראי נפרד בעותק בלבד: זיהוי אובייקט אינו משנה פיזיקה, והפרדה מונעת מצריכת מספרים על ידי מטמון גרפיקה לשנות את seed המשחק.','השרת מוסיף לעותק בלבד פונקציית איפוס שעון/אפקטים/שמירה ומדדים. פונקציות התנועה, הירי, הנזק והניצחון המקוריות נשארות כפי שהן; לולאת הציור הרגילה עצורה.']}];
export const recommendations=[];
const instrumentation=String.raw`
// balance-sim-v1: per-trial fixture/reset and observer only, appended in memory.
window.__balanceBoarTrial=({stage,seed,profile})=>{
  soundEnabled=false;bot=false;setFiring(false,'none');clearBattlefield();
  for(const list of [particles,sprites,tracers,debris,rings]){for(const x of list){x.m?.removeFromParent();if(x.m?.isSprite)x.m.material?.dispose();}list.length=0;}
  for(const f of floaters)f.el.remove();floaters.length=0;
  elapsed=0;waveTime=0;lastHud=0;lastTime=0;trauma=0;slowmo=0;shakeT=0;recoil=0;recoilRot=0;swapTimer=0;shotCount=0;lastShotAt=-9;firedSince=0;frames=0;
  pointer.x=0;pointer.y=-.05;pointer.down=false;touchAim=null;aimStick=null;firePointer=null;fireSource='none';keys.clear();current='mg';selectedPerk='';
  camera.rotation.set(-.075,0,0);camera.position.set(0,8.6,24);camera.updateMatrixWorld();
  save=freshSave();save.nextWave=stage;save.bestWave=stage-1;
  let engineSeed=seed>>>0;Math.random=()=>{engineSeed=(Math.imul(engineSeed,1664525)+1013904223)>>>0;return engineSeed/4294967296;};
  let botSeed=(seed^0xb04a5eed)>>>0;const botRandom=()=>{botSeed=(Math.imul(botSeed,1664525)+1013904223)>>>0;return botSeed/4294967296;};
  beginWave();camera.updateMatrixWorld();
  let nextDecision=profile.reactionSeconds,steps=0,decisions=0,lapses=0;
  const dt=1/60,max=600,brain={abilities:true,error:profile.aimError,reaction:profile.reactionSeconds,stay:true};
  bot=false;
  while(mode==='battle'&&waveTime<max){
    if(waveTime+1e-9>=nextDecision){nextDecision+=profile.reactionSeconds;decisions++;
      if(botRandom()<profile.lapseProbability){bot=false;setFiring(false,'none');lapses++;}else bot=brain;
    }
    window.__boar.step(1,dt);steps++;
  }
  bot=false;setFiring(false,'none');
  return {outcome:mode==='shop'?'win':mode==='dead'?'lose':'timeout',seconds:+waveTime.toFixed(4),stars:null,falls:null,score:killed,
    reason:mode==='shop'?'wave_complete':mode==='dead'?'defense_breached':'harness_limit',
    objectives:{waveCleared:mode==='shop',enemiesKilled:killed,enemiesRemaining:remaining()},
    diagnostics:{steps,decisions,lapses,patienceExceeded:waveTime>profile.patienceSeconds,hp:+hp.toFixed(3),damageTaken:+damageTaken.toFixed(3),shots:roundShots,hits:roundHits,crits:roundCrits,roundCoins,lastStandUsed,weather:weatherKind,authored:stage<=20,weapon:'mg',weaponLevel:1,sourceBot:true,aimMode:AIM_MODE,rendererDrawsDuringTrial:0}};
};
`;
async function createPool(sourceRoot){
 const root=join(sourceRoot,'workout/island/minigames/boar-island');
 const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.ttf':'font/ttf'};
 const server=createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);let file=resolve(root,'.'+pathname);if(file!==root&&!file.startsWith(root+sep)){res.writeHead(403).end();return;}if((await stat(file)).isDirectory())file=join(file,'index.html');let body=await readFile(file);if(file===join(root,'game.js'))body=Buffer.concat([body,Buffer.from(instrumentation)]);if(file===join(root,'vendor/three.core.js')){const text=body.toString();body=Buffer.from(text.replace(/function generateUUID\(\) \{[\s\S]*?\n\}/,f=>f.replaceAll('Math.random()', 'globalThis.__balanceIdentifierRandom()')));}res.writeHead(200,{'content-type':types[extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(body);}catch(e){res.writeHead(404).end();}});
 await new Promise((yes,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',yes);});
 let playwright;try{playwright=await import('playwright');}catch{playwright=await import(pathToFileURL(process.env.ISLAND_PLAYWRIGHT||resolve(dirname(process.execPath),'../node_modules/playwright/index.mjs')).href);}
 const browser=await playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage']});
 const context=await browser.newContext({viewport:{width:844,height:390},deviceScaleFactor:1,hasTouch:true});
 await context.addInitScript(()=>{localStorage.setItem('boar-island-quality','normal');localStorage.setItem('island.sound','off');globalThis.requestAnimationFrame=()=>0;globalThis.cancelAnimationFrame=()=>{};let identifier=98765;globalThis.__balanceIdentifierRandom=()=>{identifier=(Math.imul(identifier,1664525)+1013904223)>>>0;return identifier/4294967296;};let state=12345;Math.random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};});
 const page=await context.newPage();page.setDefaultTimeout(120000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{await page.goto('http://127.0.0.1:'+server.address().port+'/?qa=1&island=1',{waitUntil:'load'});
 await page.waitForFunction(()=>Boolean(window.__balanceBoarTrial&&window.__boarIsland?.ready));
 return {page,browser,server,errors};}catch(error){await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));throw Error('Boar source runtime failed: '+error.message+'; '+errors.join('; '));}
}
export async function runTrial({sourceRoot,stage,profile,seed}){
 if(!pools.has(sourceRoot))pools.set(sourceRoot,createPool(sourceRoot));
 const pool=await pools.get(sourceRoot);
 const before=pool.errors.length;
 const result=await pool.page.evaluate(args=>window.__balanceBoarTrial(args),{stage,seed,profile});
 if(pool.errors.length>before)throw Error('Boar runtime error: '+pool.errors.slice(before).join('; '));
 return result;
}
export async function cleanup(){for(const pending of pools.values()){const pool=await pending;await pool.browser.close();pool.server.closeAllConnections();await new Promise(resolve=>pool.server.close(resolve));}pools.clear();}
