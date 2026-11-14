// Original geometric HUD artwork. Run with Node 22 and Playwright (Chromium).
import {mkdir, writeFile, readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('.',import.meta.url));
const {chromium}=await import(process.env.HUD_PLAYWRIGHT_MODULE||'playwright');
const palette={ink:'#142a35',mint:'#b9ddc8',paper:'#fffdf4',gold:'#e9ba57',coral:'#eb947f',sea:'#24786d'};
const {ink,mint,paper,gold}=palette;
const items=[];
function add(id,role,art,extra={}){items.push({id,role,art,anchorPx:[128,128],displayCanvasPx:[80,80],...extra});}
function outlined(shape,color,width=6){return `<g fill="none" stroke-linecap="round" stroke-linejoin="round"><g stroke="${ink}" stroke-width="${width+6}">${shape}</g><g stroke="${color}" stroke-width="${width}">${shape}</g></g>`;}
for(const [size,rx,ry] of [['small',56,17],['medium',78,23],['large',100,29]]){
 const ellipse=`<ellipse cx="128" cy="128" rx="${rx}" ry="${ry}"/>`;
 add(`control-ring-${size}`,'controlled-player-ground',outlined(ellipse,mint,6)+`<path d="M ${128-rx*.68} ${128+ry*.7} Q 128 ${128+ry*1.4} ${128+rx*.68} ${128+ry*.7}" fill="none" stroke="${paper}" stroke-width="3" stroke-linecap="round"/>`,{variant:size,displayCanvasPx:[72,72],layer:10});
}
add('control-arrow','controlled-player-head',`<path d="m 97 95 31 38 31-38-31 9Z" fill="${mint}" stroke="${ink}" stroke-width="7" stroke-linejoin="round"/><path d="m 109 97 19 8 19-8" fill="none" stroke="${paper}" stroke-width="3" stroke-linecap="round"/>`,{anchorPx:[128,133],displayCanvasPx:[88,88],layer:30,orientation:'down'});
for(const [index,strength,tail,width] of [[1,'low',144,8],[2,'medium',173,11],[3,'high',202,14]]){
 let art=outlined(`<path d="M128 ${tail}V77m-26 20 26-30 26 30"/>`,mint,width);
 for(let i=0;i<index;i++) art+=`<path d="M ${119-i} ${tail+15+i*12}h${18+i*2}" stroke="${paper}" stroke-width="5" stroke-linecap="round"/>`;
 add(`pass-direction-${strength}`,'pass-direction',art,{variant:strength,strength:index,anchorPx:[128,234],displayCanvasPx:[100,100],layer:12,orientation:'up',rotationOriginPx:[128,234],normalizedStrengthRange:[(index-1)/3,index/3]});
}
add('receiver-open','unmarked-pass-receiver',outlined('<path d="m128 90 27 27-27 27-27-27Zm-42 16v22m84-22v22"/>',mint,6)+`<circle cx="128" cy="117" r="5" fill="${paper}"/>`,{anchorPx:[128,144],displayCanvasPx:[82,82],layer:30});
add('ball-nearest','nearest-player-to-ball',outlined('<path d="M90 112a43 24 0 0 1 76 0"/>',paper,5)+`<circle cx="128" cy="88" r="6" fill="${gold}" stroke="${ink}" stroke-width="4"/>`,{anchorPx:[128,112],displayCanvasPx:[72,72],layer:11});
add('shot-power-track','shot-charge-background',`<rect x="32" y="113" width="192" height="30" rx="15" fill="${ink}" fill-opacity=".94" stroke="${paper}" stroke-opacity=".75" stroke-width="3"/><path d="M94 120v16m62-16v16" stroke="${paper}" stroke-opacity=".2" stroke-width="2"/>`,{displayCanvasPx:[72,72],layer:30,fillRectPx:[39,120,178,16]});
add('shot-power-fill','shot-charge-fill',`<rect x="39" y="120" width="178" height="16" rx="8" fill="${gold}"/><path d="M47 123h162" stroke="${paper}" stroke-opacity=".4" stroke-width="2" stroke-linecap="round"/>`,{displayCanvasPx:[72,72],layer:31,fillRectPx:[39,120,178,16],clip:'Reveal from x=39 to x=39+178*clamp(charge,0,1); never scale the track.'});
add('ball-offscreen','offscreen-ball-edge',`<path d="m128 68 25 29h-50Z" fill="${gold}" stroke="${ink}" stroke-width="6" stroke-linejoin="round"/><circle cx="128" cy="135" r="26" fill="${paper}" stroke="${ink}" stroke-width="6"/><path d="m128 120 13 9-5 15h-16l-5-15Z" fill="${ink}"/><path d="m128 109v11m25 7-12 2m3 27-8-12m-24 12 8-12m-18-17 13 2" fill="none" stroke="${ink}" stroke-width="4"/>`,{displayCanvasPx:[80,80],layer:40,orientation:'up',rotationOriginPx:[128,128]});
add('scoreboard-plate','compact-score-and-clock-background',`<rect x="8" y="100" width="240" height="56" rx="12" fill="${ink}" fill-opacity=".94" stroke="${mint}" stroke-opacity=".5" stroke-width="1.5"/><path d="M21 117v22" stroke="${mint}" stroke-width="3" stroke-linecap="round"/><path d="M167 111v34" stroke="${mint}" stroke-opacity=".25"/><path d="M235 117v22" stroke="${gold}" stroke-width="3" stroke-linecap="round"/>`,{anchorPx:[8,100],displayCanvasPx:[256,256],layer:50,panelRectPx:[8,100,240,56],textSlotsPx:{home:[30,109,42,36],score:[76,109,50,36],away:[130,109,30,36],clock:[175,109,52,36]}});
for(const dir of ['svg','png'])await mkdir(path.join(root,dir),{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:256,height:256},deviceScaleFactor:1});
 await page.setContent('<style>html,body{margin:0;background:transparent}img{display:block;width:256px;height:256px}</style><img alt="">');
 for(const item of items){
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">${item.art}</svg>\n`;
  await writeFile(path.join(root,'svg',item.id+'.svg'),svg);
  const bounds=await page.evaluate(async source=>{const img=document.querySelector('img');img.src='data:image/svg+xml;base64,'+source;await img.decode();const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d');x.drawImage(img,0,0);const d=x.getImageData(0,0,256,256).data;let l=256,t=256,r=0,b=0;for(let y=0;y<256;y++)for(let x=0;x<256;x++)if(d[(y*256+x)*4+3]){l=Math.min(l,x);t=Math.min(t,y);r=Math.max(r,x);b=Math.max(b,y);}return [l,t,r-l+1,b-t+1];},Buffer.from(svg).toString('base64'));
  await page.screenshot({path:path.join(root,'png',item.id+'.png'),omitBackground:true});
  item.contentBoundsPx=bounds;
 }
}finally{await browser.close();}
const assets=[];
for(const {art,...item} of items){
 const files={};for(const format of ['svg','png']){const name=`${format}/${item.id}.${format}`,data=await readFile(path.join(root,name));files[format]={path:name,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')};}
 assets.push({...item,files});
}
const manifest={schemaVersion:1,id:'soccer-hud-clean-v1',version:'1.0.0',license:'CC0-1.0',scope:'Design assets and standalone preview only',referenceViewportPx:[844,390],radar:false,canvasPx:[256,256],maxFileBytes:300000,alpha:'straight RGBA; transparent canvas',colorSpace:'sRGB',bakedText:false,palette,styleReferences:['../../minigames/ultra-soccer-ui.css','../ui-kit-v2/ui-kit.css','../../minigames/soccer-view.mjs'],coordinates:{origin:'top-left',bounds:'[x,y,width,height], canvas pixels',anchor:'Place anchorPx at the projected target; displayCanvasPx scales the full 256 canvas.',rotation:'Degrees clockwise, unrotated direction is up for pass/edge arrows; use rotationOriginPx.',alpha:'Do not add an opaque background. Use premultipliedAlpha=false when uploading straight-alpha textures.'},runtimeText:{locale:'he',direction:'rtl',numbersDirection:'ltr',strings:{controlled:'השחקן הנשלט',open:'חופשי',nearest:'קרוב לכדור',shotPower:'עוצמת בעיטה',offscreen:'הכדור מחוץ למסך',home:'בית',away:'חוץ'},scoreboard:'HTML or game text; isolate each team name with bdi dir=rtl; score and MM:SS in bdi dir=ltr. No text is part of a sprite.'},behavior:{controlled:'Exactly one ground ring and one overhead arrow. The three ring variants keep the same canvas scale.',pass:'Show while aiming; low [0,1/3), medium [1/3,2/3), high [2/3,1]. One/two/three tail ticks also encode intensity.',open:'One suggested eligible teammate at a time; only if unmarked and a clear passing lane. Suppress on controlled player.',nearest:'Mark the closest visible player to the ball, including opponents; suppress when that player is controlled. Use 0.4m advantage for 150ms before switching.',shot:'Track and clipped fill beside controlled player only while charging. Clip fill in canvas coordinates; clamp 0..1.',offscreen:'Hide for visible ball. Intersect direction ray with safe viewport rectangle; do not clamp x/y independently. Clamp center using 34px padding or device safe inset +20px, whichever is larger. Reserve top-left score area and bottom control areas.',scoreboard:'240x56 logical panel at [16,12]. Clock is a match-state value; paused time does not advance.'},assets};
await writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(`Built ${assets.length} SVG/PNG pairs; largest image: ${Math.max(...assets.flatMap(x=>Object.values(x.files).map(f=>f.bytes)))} bytes`);
