/* Technical atlas packing only. The illustrated input is generated artwork.
 * Usage: node source/pack.cjs /absolute/path/to/generated-atlas.png
 * Requires sharp 0.34+. No application files are read or changed.
 */
const sharp = require('sharp');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const definitions = [
  ['flame-small', 0, 8, 14, true, 'source-over', 'bottom', 'color'],
  ['flame-medium', 8, 8, 14, true, 'source-over', 'bottom', 'color'],
  ['flame-large', 16, 8, 14, true, 'source-over', 'bottom', 'color'],
  ['smoke-light', 24, 8, 10, true, 'source-over', 'bottom', 'color'],
  ['smoke-heavy', 32, 8, 10, true, 'source-over', 'bottom', 'color'],
  ['steam', 40, 6, 12, false, 'source-over', 'bottom', 'color'],
  ['ember', 46, 1, 1, false, 'lighter', 'center', 'particle'],
  ['spark', 47, 1, 1, false, 'lighter', 'center', 'particle'],
  ['extinguish', 48, 6, 12, false, 'source-over', 'bottom', 'color'],
  ['soot', 54, 1, 1, false, 'source-over', 'center', 'alpha-decal'],
  ['ignition', 55, 1, 1, false, 'lighter', 'center', 'flash'],
  ['heat', 56, 8, 10, true, 'displacement', 'bottom', 'alpha-mask']
];
// Atlas generators can place a curl across an ideal grid line. Isolate the
// dominant connected sprite in an expanded source cell before trimming it;
// this keeps neighboring sprite tips out of the delivered animation frames.
function dominantBounds(data,w,h) {
  const seen = new Uint8Array(w*h), queue = new Int32Array(w*h);
  let best = {count:0};
  for(let p=0;p<w*h;p++) {
    if(seen[p] || data[p*4+3]<=8)continue;
    let head=0,tail=1;queue[0]=p;seen[p]=1;
    let x0=w,y0=h,x1=0,y1=0;
    while(head<tail){
      const q=queue[head++],x=q%w,y=Math.floor(q/w);
      x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);
      for(const n of [x>0?q-1:-1,x<w-1?q+1:-1,y>0?q-w:-1,y<h-1?q+w:-1]){
        if(n>=0 && !seen[n] && data[n*4+3]>8){seen[n]=1;queue[tail++]=n;}
      }
    }
    if(tail>best.count)best={count:tail,x0,y0,x1,y1};
  }
  if(!best.count)throw new Error('Empty generated source cell.');
  const left=Math.max(0,best.x0-3),top=Math.max(0,best.y0-3);
  return {left,top,width:Math.min(w,best.x1+4)-left,height:Math.min(h,best.y1+4)-top};
}
(async () => {
  if (!process.argv[2]) throw new Error('Supply the generated 8×8 source PNG.');
  const source = process.argv[2];
  const {width, height} = await sharp(source).metadata();
  const pieces = [];
  const frames = {};
  for (let index = 0; index < 64; index++) {
    const col = index % 8, row = Math.floor(index / 8);
    const left = Math.max(0,Math.round(col * width / 8)-10), top = Math.max(0,Math.round(row * height / 8)-18);
    const w = Math.min(width,Math.round((col + 1) * width / 8)+10) - left;
    const h = Math.min(height,Math.round((row + 1) * height / 8)+8) - top;
    const raw = await sharp(source).extract({left,top,width:w,height:h}).ensureAlpha().raw().toBuffer();
    const bounds = dominantBounds(raw,w,h);
    const scale = Math.min(120/(width/8),112/bounds.width,112/bounds.height);
    const tw = Math.max(1,Math.round(bounds.width*scale)), th = Math.max(1,Math.round(bounds.height*scale));
    const def = definitions.find(d => index >= d[1] && index < d[1]+d[2]);
    const contentX = Math.round((128-tw)/2), contentY = def[6]==='bottom'?116-th:Math.round((128-th)/2);
    const resized = await sharp(raw,{raw:{width:w,height:h,channels:4}}).extract(bounds)
      .resize(tw,th,{kernel:'lanczos3'}).raw().toBuffer();
    // Four transparent pixels isolate each tile at mip level zero.
    // RGB is kept straight; alpha is never multiplied into it here.
    pieces.push({input:resized, raw:{width:tw,height:th,channels:4}, left:col*128+contentX, top:row*128+contentY});
    const name = `${def[0]}-${String(index-def[1]).padStart(2,'0')}`;
    frames[name] = {
      frame:{x:col*128,y:row*128,w:128,h:128},
      rotated:false, trimmed:false,
      spriteSourceSize:{x:0,y:0,w:128,h:128}, sourceSize:{w:128,h:128},
      content:{x:contentX,y:contentY,w:tw,h:th},
      pivot:{x:0.5,y:def[6]==='bottom'?0.90625:0.5},
      uv:[(col*128+0.5)/1024,(row*128+0.5)/1024,127/1024,127/1024]
    };
  }
  const atlas = path.join(root,'fire-fx.webp');
  await sharp({create:{width:1024,height:1024,channels:4,background:'#00000000'}})
    .composite(pieces).webp({quality:91,alphaQuality:100,effort:6,smartSubsample:true}).toFile(atlas);
  const bytes = fs.statSync(atlas).size;
  if (bytes > 700000) throw new Error(`Atlas exceeds 700000 bytes: ${bytes}`);
  const animations = {};
  for (const [id,start,count,fps,loop,blend,anchor,kind] of definitions) {
    animations[id] = {
      frames:Array.from({length:count},(_,i)=>`${id}-${String(i).padStart(2,'0')}`),
      fps, loop, durationSeconds:count/fps, blend, kind,
      pivot: {x:0.5,y:anchor==='bottom'?0.90625:0.5},
      interpolateFrames:loop,
      ...(id.startsWith('flame-')?{attachments:['wall','window','roof'],quadSizeMetres:[1.6,1.6]}:{}),
      ...(!loop && ['steam','extinguish'].includes(id)?{opacityEnvelope:[[0,1],[0.72,1],[1,0]],onComplete:'remove'}:{}),
      ...(id==='extinguish'?{referenceFlame:'flame-medium',scaleByFlame:{'flame-small':0.6,'flame-medium':1,'flame-large':1.35}}:{}),
      ...(id==='soot'?{tint:'#090b0e',sample:'Use texture alpha only; ignore RGB.',placement:'surface decal; offset 0.005 metres along surface normal',fadeInSeconds:0.3}:{}),
      ...(id==='ignition'?{durationSeconds:0.18,opacityEnvelope:[[0,0],[0.16,1],[1,0]],onComplete:'remove'}:{}),
      ...(id==='ember'?{emitter:{rate:12,lifetimeSeconds:[0.55,1.5],velocityMetresPerSecond:{x:[-0.18,0.18],y:[0.55,1.1]},sizeMetres:[0.025,0.065],drag:0.45,fade:'smoothstep(0.55, 1.0, age / lifetime)'}}:{}),
      ...(id==='spark'?{emitter:{rate:7,lifetimeSeconds:[0.18,0.6],velocityMetresPerSecond:{x:[-0.5,0.5],y:[0.8,1.8]},sizeMetres:[0.03,0.08],gravityMetresPerSecondSquared:-1.5,fade:'1 - age / lifetime'}}:{})
    };
  }
  animations.heat.displacement = {
    sample:'alpha only; this is a distortion mask, not a visible smoke overlay or encoded vector map',
    strengthPixels:2.5,maxStrengthPixels:4,
    flow:'dx = sin(localUV.y * 28.0 - timeSeconds * 7.0) * maskAlpha * strengthPixels; dy = cos(localUV.x * 19.0 + timeSeconds * 5.0) * maskAlpha * strengthPixels * 0.35',
    compositing:'Read a background render target before drawing fire, offset its UV by (dx,dy)/viewportPixels, then draw fire, smoke and particles. Never sample the current output attachment.',
    textureColorSpace:'alpha is linear; ignore RGB',fallback:'Skip displacement when no background render target is available.'
  };
  const manifest = {
    schemaVersion:1, package:'fire-fx-v2',created:'2026-11-17',
    atlas:{image:'fire-fx.webp',width:1024,height:1024,format:'webp',bytes,maxBytes:700000,sha256:crypto.createHash('sha256').update(fs.readFileSync(atlas)).digest('hex'),grid:{columns:8,rows:8,tileWidth:128,tileHeight:128,gutterPixels:4},colorSpace:'sRGB',alphaMode:'straight',filter:'linear',generateMipmaps:false,wrap:'clamp-to-edge',uvOrigin:'top-left',decodedBytes:4194304},
    coordinates:{frameUnits:'pixels',origin:'top-left',up:'negative screen Y',attachment:'Place the pivot at the source. Keep the sprite vertical in world +Y; wall, window and roof anchors must not rotate the flame sideways.'},
    blending:{'source-over':{srcRGB:'SRC_ALPHA',dstRGB:'ONE_MINUS_SRC_ALPHA',depthWrite:false},lighter:{srcRGB:'SRC_ALPHA',dstRGB:'ONE',depthWrite:false},opacity:'Multiply alpha only for straight-alpha inputs. Configure alpha-channel blending independently when rendering to a transparent target.'},
    rendering:{frameSelection:'Loop: p = elapsedSeconds * fps; i = floor(p) % frameCount; interpolate i and (i+1)%frameCount with p%1. One-shot: min(floor(elapsedSeconds*fps), frameCount-1), then remove at durationSeconds.',interpolation:'Interpolate premultiplied RGBA in a shader or isolated offscreen buffer; do not source-over the two raw frames directly.',threeJS:'UVs above use top-left origin. With Texture.flipY=true, offset.y=1-v-h; repeat=(w,h). Do not mutate UV offset on a texture shared by independently animated sprites; use per-instance UV rectangles.',sorting:'background → soot → heat displacement → flame/extinguish → smoke/steam → embers/sparks → ignition',timing:'Loop rows include 8 different illustrated frames. Premultiplied interpolation smooths the 7→0 transition.',textInArtwork:false},
    integration:{status:'Standalone design assets; not connected to the game.',preview:'preview.html',previewViewport:{width:844,height:390},previewScript:'preview.js',previewStyle:'preview.css',dependencies:[],network:'local files only',license:'LICENSE.txt',report:'REPORT.md'},
    animations,frames
  };
  fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  // A classic script keeps the preview usable from file:// without fetch/CORS.
  fs.writeFileSync(path.join(root,'atlas-data.js'),'/* Generated from manifest.json by source/pack.cjs. */\nglobalThis.FIRE_FX_MANIFEST = '+JSON.stringify(manifest)+';\n');
  console.log(JSON.stringify({atlas,bytes,frames:Object.keys(frames).length,animations:Object.keys(animations).length}));
})();
