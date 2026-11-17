/** Deterministic export/packing. Node 22+, ImageMagick 7. No npm dependencies.
 * node source/build-assets.mjs /tmp/racing-themes-renders /path/to/generated-props.png
 * Generated source art stays outside the repository; final runtime assets are here.
 */
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const [renders, sourceArt] = process.argv.slice(2);
if (!renders) throw new Error('Pass render directory and optionally the transparent source atlas PNG; otherwise delivered prop atlases are retained.');
const regenerateProps=Boolean(sourceArt&&sourceArt!=='--reuse-props');
const temp = '/tmp/racing-themes-pack';
await mkdir(temp, {recursive: true});
const magick = (...args) => execFileSync('magick', args.map(String), {maxBuffer: 16*1024*1024});
const hex = s => s.match(/[a-f\d]{2}/gi).map(x => parseInt(x,16));

export const definitions = [
  {id:'city-night', name:'עיר בלילה', subtitle:'חלונות חמים · אספלט קריר', v7:'neon',
    sky:['#081428','#29364e'], fog:'#172b42', sun:'#8bb7fa', ambient:'#8bb6e7', rim:'#bb83e5',
    ambientIntensity:1.45, sunIntensity:1.3, exposure:1.22, accent:'#71d9ed', ground:'#283340', asphalt:'#384353', line:'#ece9d6',
    props:['streetlight','planter-tree','chevron-sign','traffic-cone','light-bollard','planter-bush'],
    propNames:['פנס רחוב','עץ באדנית','שלט פנייה','חרוט תנועה','עמוד אור','שיח באדנית'],
    heights:[4.2,3.2,1.6,.65,.9,.8], cropY:[0,266],
    crops:[[40,0,226,266],[300,0,230,266],[555,0,225,266],[805,0,193,266],[1080,0,125,266],[1265,0,271,266]],
    layerNames:['קו רקיע מרוחק','רובע חלונות מואר','גינות ומבנים נמוכים'], groundRoughness:.48},
  {id:'desert', name:'מדבר', subtitle:'אבן חול · אור אחר הצהריים', v7:'coast/ridge palette extension',
    sky:['#729fb6','#f0cf9b'], fog:'#d8b88e', sun:'#ffe0ad', ambient:'#c7d5db', rim:'#e9f7ff',
    ambientIntensity:2.05, sunIntensity:3, exposure:1.06, accent:'#f0b56a', ground:'#d0aa72', asphalt:'#625d56', line:'#f4e4c3',
    props:['saguaro','barrel-cactus','sandstone-rock','dry-scrub','chevron-sign','reflector-post'],
    propNames:['קקטוס גבוה','קקטוס כדורי','סלע חול','שיח יבש','שלט פנייה','עמוד מחזיר אור'],
    heights:[3,1.2,1.1,.9,1.6,.85], cropY:[266,510],
    crops:[[45,266,204,244],[292,266,213,244],[512,266,260,244],[790,266,236,244],[1050,266,204,244],[1330,266,160,244]],
    layerNames:['מצוקי אבן באובך','דיונות רכות','אבנים וצמחייה נמוכה'], groundRoughness:.94},
  {id:'snow', name:'שלג', subtitle:'פסגות בהירות · צל כחול', v7:'ridge',
    sky:['#7096af','#dce1da'], fog:'#b2c5cd', sun:'#ffe7c0', ambient:'#c0d4df', rim:'#e9f7ff',
    ambientIntensity:2.05, sunIntensity:2.45, exposure:1.04, accent:'#87c7ff', ground:'#dbe7eb', asphalt:'#536574', line:'#f0cb7c',
    props:['snow-spruce','snow-pine','snow-rock','chevron-sign','snow-pole','frosted-lamp'],
    propNames:['אשוח מושלג','אורן מושלג','סלע מושלג','שלט פנייה','סמן שלג','פנס חורפי'],
    heights:[4.2,2.5,1.3,1.6,1.8,2], cropY:[510,768],
    crops:[[25,510,247,258],[315,510,160,258],[505,510,270,258],[800,510,225,258],[1120,510,100,258],[1320,510,172,258]],
    layerNames:['פסגות עם כיפות שלג','יער מחטים','גדות שלג ועצים'], groundRoughness:.84},
  {id:'coast', name:'חוף', subtitle:'ים טורקיז · שמש חמימה', v7:'coast',
    sky:['#4b7896','#f5ce9c'], fog:'#d9c3a4', sun:'#ffe0ad', ambient:'#c0d4df', rim:'#e9f7ff',
    ambientIntensity:2.05, sunIntensity:3, exposure:1.06, accent:'#79d0c1', ground:'#d9c08f', asphalt:'#5c6463', line:'#f3e9cf',
    props:['coconut-palm','young-palm','dune-grass','coastal-rock','chevron-sign','timber-bollard'],
    propNames:['דקל קוקוס','דקל צעיר','עשב חולות','סלע חוף','שלט פנייה','עמוד עץ'],
    heights:[4.6,2.4,.8,.9,1.6,.7], cropY:[768,1024],
    crops:[[0,768,289,256],[292,768,215,256],[514,768,258,256],[775,768,253,256],[1040,768,214,256],[1315,768,172,256]],
    layerNames:['איים מרוחקים','ים וגלים','דיונות ודקלים'], groundRoughness:.88},
];

// PNG encoding and optional palette reduction are deterministic raster packing,
// not generative image edits. Retain partial alpha and straight-alpha edges.
function png(input, output, resize, colors=192) {
  magick(input, ...(resize?['-resize',resize]:[]), '-strip', '+dither', '-colors',colors,
    '-define','png:compression-level=9', '-define','png:exclude-chunk=date,time', output);
}
async function rgba(file, width, height, pixel) {
  const data = Buffer.alloc(width*height*4);
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const v=pixel(x,y); const i=(y*width+x)*4;
    data[i]=v[0];data[i+1]=v[1];data[i+2]=v[2];data[i+3]=v[3]??255;
  }
  const raw=path.join(temp,'pixels.rgba');
  await writeFile(raw,data);
  magick('-size',`${width}x${height}`,'-depth','8',`rgba:${raw}`,'-strip','+dither','-colors','128',
    '-define','png:compression-level=9','-define','png:exclude-chunk=date,time',file);
}

const manifest={
  schemaVersion:1,id:'racing-themes-v1',version:'1.0.0',date:'2026-11-17',
  baseCommit:'43b27dc235387e3cb737aee9558cdf9d5fd5a262',branch:'codex/racing-themes-v1',
  preview:{file:'preview.html',width:844,height:390,offline:true,entry:'Open preview.html directly; no server/build/CDN required.'},
  budget:{unit:'decimal bytes',maxBytesPerTheme:600000,scope:'All PNGs required by one theme, including sky, 3 layers, asphalt, shoulder, both lines, barrier and all 6 props. No shared asset discount.'},
  rendering:{colorSpace:'sRGB',alpha:'straight / unassociated',filter:'linear',premultiplyAlpha:false,
    layerOrder:['sky','far','middle','near','shoulder','asphalt','edge-line','lane-line','barrier','props'],
    backgroundPeriodMetres:40,propAtlas:{cellWidth:128,cellHeight:160,gutter:8,columns:6,rows:1,anchor:[.5,.9375]},
    notes:['Apply lighting colors in linear space in a 3D engine; PNGs are sRGB.','The preview is an asset composition study. Connect textures/billboards to the v7 renderer separately.','Props contain authored lighting. Avoid a second directional lighting pass on sprite billboards.','Signs use geometry only; localize labels in live HTML/renderer if needed.','Extrude or isolate atlas frames before mipmapping; do not repeat the whole atlas.']},
  reference:{folder:'../racing-v7/',files:['REFERENCE.md','world.mjs','iterations/17/neon-drive-apex-near-844x390.jpg','iterations/17/coast-garage-velour-near-844x390.jpg'],
    style:'Polished three-dimensional arcade, soft materials, readable asphalt, warm/cool light, no outlines; city and coast inherit the v7 sky and lighting values.'},
  themes:[]
};
const atlasFiles=[];
for(const [ti,t] of definitions.entries()) {
  const dir=path.join(root,t.id);await mkdir(dir,{recursive:true});
  const asset=async(file,role,extra={})=>{
    const full=path.join(dir,file),data=await readFile(full);
    const dimensions=magick('identify','-format','%w %h',full).toString().split(' ').map(Number);
    return {file:`${t.id}/${file}`,role,width:dimensions[0],height:dimensions[1],bytes:data.length,
      sha256:createHash('sha256').update(data).digest('hex'),...extra};
  };
  const layers=[];
  for(let i=0;i<3;i++) {
    const name=['far','middle','near'][i];const out=path.join(dir,`${name}.png`);
    png(path.join(renders,`${t.id}-layer-${i}.png`),out,'1024x256!',192);
    // Adjacent pixels at both borders are made identical, after a periodic render.
    // A single duplicated column is preferable to a quantization seam under repeat.
    const edge=path.join(temp,'edge.png');magick(out,'-crop','1x256+0+0','+repage',edge);
    magick(out,edge,'-geometry','+1023+0','-compose','Copy','-composite','-strip',
      '-define','png:exclude-chunk=date,time','-define','png:compression-level=9',out);
    layers.push(await asset(`${name}.png`,'parallax-layer',{id:name,label:t.layerNames[i],repeat:'x',parallax:[.12,.34,.66][i],anchor:[0,1]}));
  }
  png(path.join(renders,`${t.id}-barrier.png`),path.join(dir,'barrier.png'),'256x64!',128);
  const edge=path.join(temp,'edge.png');magick(path.join(dir,'barrier.png'),'-crop','1x64+0+0','+repage',edge);
  magick(path.join(dir,'barrier.png'),edge,'-geometry','+255+0','-compose','Copy','-composite','-strip',
    '-define','png:exclude-chunk=date,time','-define','png:compression-level=9',path.join(dir,'barrier.png'));
  if(regenerateProps){
  const cells=[];
  for(let i=0;i<6;i++) {
    const [x,y,w,h]=t.crops[i];const cell=path.join(temp,`${t.id}-${i}.png`);
    magick(sourceArt,'-crop',`${w}x${h}+${x}+${y}`,'+repage','-trim','+repage',
      '-resize','112x140','-gravity','south','-background','none','-extent','128x152',
      '-gravity','north','-extent','128x160',cell);
    cells.push(cell);
  }
  const rawAtlas=path.join(temp,`${t.id}-props.png`);
  magick(...cells,'+append',rawAtlas);
  png(rawAtlas,path.join(dir,'props.png'),null,256);
  }
  atlasFiles.push(path.join(dir,'props.png'));
  const top=hex(t.sky[0]),bottom=hex(t.sky[1]);
  await rgba(path.join(dir,'sky.png'),4,256,(_x,y)=>top.map((v,i)=>Math.round(v+(bottom[i]-v)*(y/255)**.8)));
  let seed=712700+ti;
  const rnd=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  const texture=(color,shoulder=false)=>{
    const c=hex(color),values=Array.from({length:127*127},()=>rnd());
    return (x,y)=>{
      const v=values[(y%127)*127+(x%127)];
      const coarse=Math.sin(x%127/127*Math.PI*6)*Math.cos(y%127/127*Math.PI*4);
      const grit=(v-.5)*(shoulder?13:9)+coarse*1.2+(v>.988?8:0);
      return c.map(n=>Math.max(0,Math.min(255,Math.round(n+grit))));
    };
  };
  await rgba(path.join(dir,'asphalt.png'),128,128,texture(t.asphalt));
  await rgba(path.join(dir,'shoulder.png'),128,128,texture(t.ground,true));
  const lane=hex(t.line);
  await rgba(path.join(dir,'lane-line.png'),32,128,(x,y)=>[...lane,(x>=12&&x<20&&y>=12&&y<84)?255:0]);
  await rgba(path.join(dir,'edge-line.png'),16,128,(x,_y)=>[...lane,(x>=5&&x<11)?255:0]);
  const theme={id:t.id,name:t.name,subtitle:t.subtitle,v7Reference:t.v7,
    palette:{skyTop:t.sky[0],skyHorizon:t.sky[1],fog:t.fog,ground:t.ground,asphalt:t.asphalt,lane:t.line,accent:t.accent},
    lighting:{hemisphere:{skyColor:t.ambient,groundColor:t.ground,intensity:t.ambientIntensity},
      sun:{color:t.sun,intensity:t.sunIntensity,position:[60,85,-50]},rim:{color:t.rim,intensity:ti===0?1.15:.6,position:[-30,16,40]},exposure:t.exposure,fog:{color:t.fog,near:140,far:700}},
    sky:await asset('sky.png','sky-gradient',{repeat:'x'}),layers,
    road:{asphalt:await asset('asphalt.png','asphalt-tile',{repeat:'xy',metres:[4,4],roughness:t.groundRoughness,metalness:ti===0?.15:0}),
      shoulder:await asset('shoulder.png','shoulder-tile',{repeat:'xy',metres:[4,4]}),
      laneLine:await asset('lane-line.png','lane-line-tile',{repeat:'y',metres:[.8,6],paintedWidthMetres:.2}),
      edgeLine:await asset('edge-line.png','edge-line-tile',{repeat:'y',metres:[.32,4],paintedWidthMetres:.12})},
    barrier:await asset('barrier.png','barrier-tile',{repeat:'x',metres:[8,2],anchor:[0,1],kind:ti===1?'sandstone-wall':ti===3?'timber-and-steel-guardrail':'steel-guardrail'}),
    propAtlas:await asset('props.png','six-prop-atlas',{repeat:'none',alpha:true}),
    props:t.props.map((id,i)=>({id,label:t.propNames[i],frame:[i*128,0,128,160],anchor:[.5,.9375],heightMetres:t.heights[i],roadClearanceMetres:2.5,flipAllowed:!id.includes('sign')}))};
  const assets=[theme.sky,...layers,...Object.values(theme.road),theme.barrier,theme.propAtlas];
  theme.totalBytes=assets.reduce((sum,a)=>sum+a.bytes,0);
  if(theme.totalBytes>manifest.budget.maxBytesPerTheme)throw new Error(`${t.id} over budget: ${theme.totalBytes}`);
  manifest.themes.push(theme);
}
await writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
await writeFile(path.join(root,'manifest.js'),`/* Generated from manifest.json by source/build-assets.mjs; file:// preview fallback. */\nwindow.RACING_THEMES_MANIFEST=${JSON.stringify(manifest)};\n`);
// A visual inspection sheet is review evidence, not a runtime dependency.
magick(...atlasFiles,'-append','-background','#101b27','-alpha','remove',path.join(temp,'props-review.png'));
if(regenerateProps)await writeFile(path.join(root,'source','art-provenance.json'),JSON.stringify({
  generator:'OpenAI image generation tool',date:'2026-11-17',
  sourceImageSha256:createHash('sha256').update(await readFile(sourceArt)).digest('hex'),
  sourceDimensions:[1536,1024],packing:'Crops listed in build-assets.mjs; 6 frames per theme, 128x160 per frame. ImageMagick resize/palette reduction; no external artwork.',
  output:'Only compressed per-theme PNG atlases are delivered; full-resolution authoring output is excluded from runtime.'
},null,2)+'\n');
console.log(JSON.stringify(manifest.themes.map(t=>({theme:t.id,bytes:t.totalBytes,remaining:600000-t.totalBytes})),null,2));
