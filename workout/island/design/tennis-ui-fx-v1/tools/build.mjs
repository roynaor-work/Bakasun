// Original vector artwork. Rebuild with: node tools/build.mjs (Sharp required).
import { createRequire } from 'node:module';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const root = fileURLToPath(new URL('../', import.meta.url));
const p = { ink:'#173f36', deep:'#102e29', cream:'#f5efdc', brass:'#d4bf82', clay:'#b76c4c', red:'#e15c4f', redDark:'#7c322d', dust:'#e8b68b', dustLight:'#f3d4ac', lime:'#d8df91' };
const assets = [];
const svg = body => `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" fill="none" stroke-linecap="round" stroke-linejoin="round">${body}</svg>\n`;
const sha = b => createHash('sha256').update(b).digest('hex');
const fileRecord = async (path, bytes, extra={}) => {
  await writeFile(resolve(root, path), bytes);
  return { path, bytes:Buffer.byteLength(bytes), sha256:sha(bytes), ...extra };
};
async function asset(id, body, options={}) {
  const source = Buffer.from(svg(body));
  const vector = await fileRecord(`svg/${id}.svg`, source, {width:256,height:256});
  const png = {};
  for (const size of [256,512]) {
    const bytes = await sharp(source).resize(size,size).ensureAlpha().png({compressionLevel:9,adaptiveFiltering:true}).toBuffer();
    png[size] = await fileRecord(`png/${size}/${id}.png`, bytes, {width:size,height:size});
  }
  const record = {id, svg:vector, png, anchor:{x:128,y:128,normalized:[.5,.5]}, frames:1, ...options};
  assets.push(record);
  return record;
}
await Promise.all(['svg','png/256','png/512','verification'].map(dir => mkdir(resolve(root,dir),{recursive:true})));

// Opaque red face, cream separator and dark edge stay readable on all surfaces.
await asset('out-cross', `<path d="m80 80 96 96m0-96-96 96" stroke="${p.deep}" stroke-opacity=".62" stroke-width="38"/><path d="m80 80 96 96m0-96-96 96" stroke="${p.cream}" stroke-width="29"/><path d="m80 80 96 96m0-96-96 96" stroke="${p.red}" stroke-width="20"/><path d="m80 77 96 96m-1-95-94 94" stroke="#f8997e" stroke-opacity=".65" stroke-width="3"/>`,
  {role:'court-decal', contentRect:[61,61,134,134], displaySizePx:[48,48], durationMs:1500, fadeOutMs:0, placement:'Actual out bounce (ball.x, ground, ball.z); fixed to the court until 1500ms, not attached to the ball.'});

await asset('line-hit-ring', `<circle cx="128" cy="128" r="65" stroke="${p.deep}" stroke-opacity=".65" stroke-width="21"/><circle cx="128" cy="128" r="65" stroke="${p.cream}" stroke-width="13"/><circle cx="128" cy="128" r="65" stroke="${p.brass}" stroke-width="3"/><circle cx="128" cy="128" r="11" fill="${p.cream}"/><circle cx="128" cy="128" r="5" fill="${p.ink}"/><path d="M128 39v10m0 158v10M39 128h10m158 0h10" stroke="${p.cream}" stroke-width="5"/>`,
  {role:'court-decal', contentRect:[36,36,184,184], displaySizePx:[64,64], durationMs:550, placement:'Center on the actual line contact. A line hit is in; never use this as an out marker.'});

for (const [index,name] of ['left','center','right'].entries()) {
  const ticks = [94,128,162].map((x,i)=>`<rect x="${x-10}" y="196" width="20" height="6" rx="3" fill="${i===index?p.brass:p.cream}" opacity="${i===index?1:.28}"/>`).join('');
  const wing = index===0?'M72 146 57 158l15 12':index===2?'m184 146 15 12-15 12':'m118 162 10 9 10-9';
  await asset(`serve-arrow-${name}`, `<path d="m128 50 51 63-28-3v66h-46v-66l-28 3Z" fill="${p.deep}" stroke="${p.deep}" stroke-width="13"/><path d="m128 50 51 63-28-3v66h-46v-66l-28 3Z" fill="${p.cream}" stroke="${p.brass}" stroke-width="3"/><path d="M128 75v72" stroke="${p.ink}" stroke-width="6"/><path d="${wing}" stroke="${p.brass}" stroke-width="5"/>${ticks}`,
    {role:'court-selector',contentRect:[52,43,152,160],anchor:{x:128,y:176,normalized:[.5,.6875]},displaySizePx:[64,64],state:name,stateIndex:index,placement:'Anchor at the selected service-line position; move the whole asset horizontally, never move the anchor within the image.'});
}

await asset('drop-meter-track', `<rect x="91" y="10" width="74" height="236" rx="15" fill="${p.deep}" opacity=".38"/><rect x="96" y="8" width="64" height="236" rx="13" fill="${p.ink}" stroke="${p.cream}" stroke-width="3"/><rect x="108" y="29" width="27" height="196" rx="5" fill="${p.deep}" stroke="${p.brass}" stroke-opacity=".5" stroke-width="2"/><path d="M143 29h8m-8 49h5m-5 49h8m-8 49h5m-5 48h8" stroke="${p.cream}" stroke-opacity=".7" stroke-width="2"/><path d="M99 123h5m-5 39h5" stroke="${p.lime}" stroke-width="3"/><rect x="99" y="124" width="4" height="37" rx="2" fill="${p.lime}" opacity=".45"/>`,
  {role:'hud-meter',contentRect:[91,6,74,240],anchor:{x:128,y:244,normalized:[.5,.953125]},displaySizePx:[176,176],fillRect:[111,32,21,190],placement:'Vertical at the screen edge, above controls. Square transparent export; visible rail is 44px wide at the recommended size.'});
await asset('drop-meter-fill', `<defs><linearGradient id="power" x1="121" y1="222" x2="121" y2="32" gradientUnits="userSpaceOnUse"><stop stop-color="${p.brass}"/><stop offset=".46" stop-color="${p.lime}"/><stop offset=".7" stop-color="${p.brass}"/><stop offset="1" stop-color="${p.red}"/></linearGradient></defs><rect x="111" y="32" width="21" height="190" rx="3" fill="url(#power)"/><path d="M115 38v178" stroke="${p.cream}" stroke-opacity=".28" stroke-width="2"/>`,
  {role:'hud-meter-fill',contentRect:[111,32,21,190],anchor:{x:128,y:244,normalized:[.5,.953125]},displaySizePx:[176,176],clipRect:[111,32,21,190],placement:'Stack exactly over drop-meter-track. Clip the fill from its bottom y=222 upward; do not resize the SVG/PNG or the track.'});
await asset('drop-meter-needle', `<path d="m149 120-14 8 14 8h14v-16Z" fill="${p.cream}" stroke="${p.deep}" stroke-width="3"/><path d="M112 128h20" stroke="${p.cream}" stroke-width="3"/>`,
  {role:'hud-meter-needle',contentRect:[110,118,55,20],displaySizePx:[176,176],placement:'Its reference tip is (135,128). Translate Y by (222 - 190 * power) - 128 in the 256-unit coordinate system.'});

// Six discrete, registered hand-built puffs. No blur, noise, raster embeds or random seeds.
const dustPhases = [
  {sx:.32,sy:.28,lift:0,alpha:.9}, {sx:.56,sy:.55,lift:4,alpha:.9},
  {sx:.78,sy:.82,lift:9,alpha:.76}, {sx:.94,sy:1,lift:16,alpha:.58},
  {sx:1.08,sy:1.12,lift:23,alpha:.34}, {sx:1.18,sy:1.2,lift:30,alpha:.12}
];
for (const [i,f] of dustPhases.entries()) {
  const grains = [[-73,-6,5],[-57,-31,3],[-35,-53,3],[12,-62,4],[54,-39,3],[83,-14,4],[-92,9,2],[93,10,2]].map(([x,y,r],n)=>`<circle cx="${(128+x*f.sx).toFixed(2)}" cy="${(166+y*f.sy-f.lift).toFixed(2)}" r="${(r*(1-i*.07)).toFixed(2)}" fill="${n%2?p.dustLight:p.dust}" opacity="${f.alpha.toFixed(2)}"/>`).join('');
  await asset(`clay-dust-${String(i+1).padStart(2,'0')}`, `<g opacity="${f.alpha}" transform="translate(128 ${166-f.lift}) scale(${f.sx} ${f.sy})"><path d="M-83 7q-21-21-4-33 9-9 22-2-3-27 19-31 14-2 24 13 5-31 28-29 21 1 26 26 24-19 39 2 6 9 2 21 22-5 29 13 8 24-25 29H-59Z" fill="${p.dust}"/><path d="M-65-7q-18-18 0-29 12-7 22 6 0-24 18-25 13 0 20 15 13-15 26-4 10 7 8 19 15-11 27 1 6 6 5 14" fill="${p.dustLight}" opacity=".62"/><path d="M-77 12Q0 29 78 12" stroke="#c88e67" stroke-width="5" opacity=".5"/></g>${grains}`,
    {role:'court-particle',contentRect:[4,35,248,154],anchor:{x:128,y:176,normalized:[.5,.6875]},displaySizePx:[96,96],frameIndex:i,durationMs:60,placement:'All six images share the same ground anchor. Advance by elapsed milliseconds; clear the sprite at 360ms.'});
}

for (const [name,rx,ry,opacity,height] of [['low',35,12,.56,0],['mid',54,18,.32,1.5],['high',76,27,.16,3]]) {
  await asset(`ball-shadow-${name}`, `<defs><radialGradient id="shadow"><stop stop-color="${p.deep}" stop-opacity="${opacity}"/><stop offset=".35" stop-color="${p.deep}" stop-opacity="${opacity*.86}"/><stop offset=".7" stop-color="${p.deep}" stop-opacity="${opacity*.36}"/><stop offset="1" stop-color="${p.deep}" stop-opacity="0"/></radialGradient></defs><ellipse cx="128" cy="128" rx="${rx}" ry="${ry}" fill="url(#shadow)"/>`,
    {role:'ground-shadow',contentRect:[128-rx,128-ry,rx*2,ry*2],displaySizePx:[64,64],heightM:height,centerAlpha:opacity,placement:'Always projected onto ground under the ball. Crossfade adjacent height samples; alpha and softness are already baked, no additional opacity curve.'});
}

for (const kind of ['out','net']) {
  const accent = kind==='out'?p.red:p.brass;
  const icon = kind==='out'
    ? `<path d="m201 118 18 18m0-18-18 18" stroke="${p.red}" stroke-width="5"/>`
    : `<path d="M195 123h29m-28 0v17m27-17v17m-20-17v14m7-14v14m7-14v14m-21-7h27m-27 6h27" stroke="${p.cream}" stroke-opacity=".8" stroke-width="1.8"/><circle cx="212" cy="113" r="5" fill="${p.brass}"/>`;
  await asset(`sign-${kind}`, `<rect x="12" y="91" width="232" height="82" rx="12" fill="${p.deep}" opacity=".3"/><rect x="12" y="84" width="232" height="84" rx="10" fill="${p.ink}" stroke="${p.cream}" stroke-opacity=".8" stroke-width="2"/><path d="M24 85h208" stroke="${accent}" stroke-width="4"/><path d="M184 102v48" stroke="${p.cream}" stroke-opacity=".18" stroke-width="1"/>${icon}<path d="M28 155h140" stroke="${p.brass}" stroke-opacity=".35" stroke-width="1"/>`,
    {role:'hud-sign',contentRect:[11,82,234,91],displaySizePx:[192,192],textInAsset:false,labelKey:`tennis.${kind}`,labelHe:kind==='out'?'אאוט':'נטו',textRect:[28,102,140,48],textAnchor:[98,126],placement:'Decorative background only. Overlay a live DOM span or a separate runtime text layer in textRect; no outlined or rasterized lettering.'});
}

const manifest = {
  schemaVersion:1, id:'tennis-ui-fx-v1', version:'1.0.0', created:'2026-11-14', locale:'he-IL', license:'CC0-1.0',
  baseCommit:'19d9cdc5e3718236df5a2fc4d8b8c26c72007575', maxFileBytes:400000,
  units:{artboard:[256,256],pngSizes:[256,512],anchorOrigin:'top-left',anchorConvention:'position = ground/screen point minus anchor * displaySize / 256',rectConvention:'[x,y,width,height] in 256-unit artboard',time:'milliseconds; delta from active simulation, pause aware'},
  palette:p, style:{reference:'../../minigames/tennis.css',description:'Quiet tournament UI: forest green, cream, brass and clay. Rounded clean strokes, small warm highlights, red only for out/overpower.',provenance:'Original hand-authored SVG geometry; PNGs rasterized from the exact SVG, no external artwork or fonts.'},
  integration:{scope:'Asset package and isolated preview only; no gameplay files changed.',
    textures:{transparent:true,colorSpace:'sRGB',alpha:'straight/unpremultiplied PNG; use renderer-managed premultiplication',depthWrite:false},
    ground:{threeJS:'For already-flattened art (dust/shadow), use screen-projected ground anchors. For out/ring/arrow use an XZ plane at courtY + 0.008 with depthTest:true, depthWrite:false, polygonOffset enabled; reproject the anchor after camera movement.',order:['ball-shadow','line-hit-ring','clay-dust','out-cross','ball','hud']},
    eventPolicy:'Consume authoritative simulation results. Do not infer out, line hit or net from preview coordinates or change scoring. Preview events are manual demonstrations.',
    rtl:'Court left/right are physical screen/world directions; never mirror the selection order in RTL.',
    noTextBaked:true,preload:'Preload the selected PNG resolution before starting a timed event; hold no frame for network loading.',reducedMotion:'Keep the out cross for 1500ms; use dust frame 3 as a static 180ms stamp; snap arrows and remove cosmetic ball motion.'},
  effects:{
    out:{asset:'out-cross',durationMs:1500,fadeOutMs:0,loop:false,clock:'active simulation time; hidden at age >= 1500ms',anchorSpace:'court-ground',movement:'fixed contact point, reproject every rendered frame'},
    lineHit:{asset:'line-hit-ring',durationMs:550,scale:[.82,1.12],opacity:[1,0],loop:false,anchorSpace:'court-ground'},
    serve:{states:[{id:'left',asset:'serve-arrow-left',xM:-2.75},{id:'center',asset:'serve-arrow-center',xM:0},{id:'right',asset:'serve-arrow-right',xM:2.75}],nearServiceLineZM:6.4,transitionMs:180,wrap:false,input:'ArrowLeft/ArrowRight or touch; clamp index to 0..2. Values are placement suggestions, not service legality rules.'},
    dropPower:{track:'drop-meter-track',fill:'drop-meter-fill',needle:'drop-meter-needle',range:[0,1],fillRect:[111,32,21,190],clip:'[111, 222 - 190*p, 21, 190*p]',needleDeltaY:'222 - 190*p - 128',previewSweetRange:[.32,.52],sweetRangePolicy:'Illustrative only. Integrator must supply the real drop-shot range.',placement:'screen edge, respecting safe area; mirror HUD position for left-handed controls, not the scale direction'},
    clayDust:{frames:Array.from({length:6},(_,i)=>({asset:`clay-dust-${String(i+1).padStart(2,'0')}`,index:i,durationMs:60})),frameCount:6,totalDurationMs:360,fps:1000/60,loop:false,clearAtEnd:true,surfaces:['clay'],anchor:[128,176]},
    ballShadow:{samples:['low','mid','high'].map(name=>assets.find(a=>a.id===`ball-shadow-${name}`)).map(a=>({asset:a.id,heightM:a.heightM})),heightRangeM:[0,3],interpolation:'Clamp height, linearly crossfade adjacent samples (weights sum to 1). All use displaySize 64 and the same ground anchor.',groundLocked:true,hideWhenBallHidden:true},
    signs:{out:{asset:'sign-out',labelHe:'אאוט'},net:{asset:'sign-net',labelHe:'נטו'},text:{inAsset:false,direction:'rtl',font:'system-ui, sans-serif',weight:750,color:p.cream,minFontSizePx:18,region:[28,102,140,48],center:[98,126],ariaLive:'polite; announce once per actual event'},durationMs:1500}
  },
  assets
};
await writeFile(resolve(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const template = await readFile(resolve(root,'tools/preview.template.html'),'utf8');
await writeFile(resolve(root,'preview.html'),template.replace('<!-- MANIFEST -->',JSON.stringify(manifest).replaceAll('<','\\u003c')));
console.log(JSON.stringify({assets:assets.length,svg:assets.length,png:assets.length*2,maxAssetBytes:Math.max(...assets.flatMap(a=>[a.svg.bytes,...Object.values(a.png).map(f=>f.bytes)]))}));
