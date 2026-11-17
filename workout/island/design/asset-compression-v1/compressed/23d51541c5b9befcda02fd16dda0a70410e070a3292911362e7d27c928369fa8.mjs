/** Island Pro Basketball — textures drawn at load time (no image downloads): hardwood
 * parquet, the ball, team jerseys with numbers, the centre logo and LED boards. */
import * as THREE from '../vendor/three.module.js';

function rng(seed){let a=seed>>>0;return ()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
function canvas(w,h){const c=typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(w,h):Object.assign(document.createElement('canvas'),{width:w,height:h});return c;}
function tex(c,{srgb=true,repeat=false,aniso=8}={}){const t=new THREE.CanvasTexture(c);if(srgb)t.colorSpace=THREE.SRGBColorSpace;if(repeat){t.wrapS=t.wrapT=THREE.RepeatWrapping;}t.anisotropy=aniso;t.needsUpdate=true;return t;}

/** Maple strip flooring: long narrow boards with staggered joints and grain. One tile is
 * 1.6 m x 1.6 m of floor; the floor repeats it. Returns colour + roughness maps. */
export function parquetTextures(size=1024,seed=7){
 const c=canvas(size,size),g=c.getContext('2d'),r=rng(seed);
 const boardsAcross=28,bw=size/boardsAcross;
 const rough=canvas(size,size),rg=rough.getContext('2d');rg.fillStyle='#5a5a5a';rg.fillRect(0,0,size,size);
 for(let i=0;i<boardsAcross;i++){
  let y=-r()*size;
  while(y<size){
   const len=size*(0.35+r()*0.55);
   const tone=r(),base=[204+tone*28,152+tone*30,98+tone*26];
   const grad=g.createLinearGradient(i*bw,0,(i+1)*bw,0);
   grad.addColorStop(0,`rgb(${base[0]-10},${base[1]-10},${base[2]-8})`);grad.addColorStop(0.5,`rgb(${base[0]},${base[1]},${base[2]})`);grad.addColorStop(1,`rgb(${base[0]-12},${base[1]-11},${base[2]-9})`);
   g.fillStyle=grad;g.fillRect(i*bw,y,bw,len);
   // grain lines along the board
   g.strokeStyle=`rgba(120,72,30,${0.08+r()*0.1})`;g.lineWidth=0.6;
   for(let k=0;k<5;k++){g.beginPath();const x0=i*bw+r()*bw;g.moveTo(x0,y);for(let s=0;s<=8;s++){g.lineTo(x0+Math.sin(s*0.9+r()*2)*bw*0.12,y+len*s/8);}g.stroke();}
   // a few knots / mineral streaks
   if(r()<0.18){g.fillStyle=`rgba(110,64,28,${0.15+r()*0.15})`;g.beginPath();g.ellipse(i*bw+bw/2,y+r()*len,bw*0.18,bw*0.6,0,0,Math.PI*2);g.fill();}
   // joint
   g.fillStyle='rgba(60,35,15,0.55)';g.fillRect(i*bw,y+len-1,bw,1.4);
   rg.fillStyle=`rgb(${80+r()*30|0},${80+r()*30|0},${80+r()*30|0})`;rg.fillRect(i*bw,y,bw,len);
   y+=len;
  }
  g.fillStyle='rgba(70,40,18,0.5)';g.fillRect(i*bw-0.6,0,1.2,size);
 }
 // varnish wear: soft light patches
 for(let k=0;k<40;k++){const x=r()*size,y=r()*size,rad=40+r()*120,gr=g.createRadialGradient(x,y,0,x,y,rad);gr.addColorStop(0,'rgba(255,240,210,0.06)');gr.addColorStop(1,'rgba(255,240,210,0)');g.fillStyle=gr;g.fillRect(x-rad,y-rad,rad*2,rad*2);}
 return {map:tex(c,{repeat:true}),roughness:tex(rough,{srgb:false,repeat:true})};
}

/** The ball: pebbled orange leather with black channels (equirectangular). */
export function ballTexture(size=512){
 const c=canvas(size,size/2),g=c.getContext('2d'),r=rng(3),W=size,H=size/2;
 g.fillStyle='#c4581f';g.fillRect(0,0,W,H);
 for(let i=0;i<9000;i++){const x=r()*W,y=r()*H,s=r()*1.6+0.4;g.fillStyle=r()<0.5?'rgba(255,170,110,0.18)':'rgba(90,30,8,0.22)';g.fillRect(x,y,s,s);}
 g.strokeStyle='#1a120d';g.lineWidth=W*0.008;
 g.beginPath();g.moveTo(0,H/2);g.lineTo(W,H/2);g.stroke();
 for(const x of [W*0.25,W*0.75]){g.beginPath();g.moveTo(x,0);g.lineTo(x,H);g.stroke();}
 for(const sgn of [1,-1]){g.beginPath();for(let i=0;i<=64;i++){const u=i/64,x=u*W,y=H/2+sgn*H*0.36*Math.cos(u*Math.PI*2);i?g.lineTo(x,y):g.moveTo(x,y);}g.stroke();}
 return tex(c,{aniso:4});
}

/** Jersey sheet: left half = front, right half = back (matches the uniform UVs).
 * Team colour, side panels, chest wordmark (Hebrew), numbers with outline, name on the back. */
export function jerseyTexture({primary,secondary,trim,number,wordmark,name,dark}){
 const W=1024,H=1024,c=canvas(W,H),g=c.getContext('2d');
 g.fillStyle=primary;g.fillRect(0,0,W,H);
 // knit noise
 const r=rng(number*31+7);for(let i=0;i<14000;i++){g.fillStyle=r()<0.5?'rgba(255,255,255,0.025)':'rgba(0,0,0,0.035)';g.fillRect(r()*W,r()*H,2,1);}
 // side panels (both halves meet at the sides)
 g.fillStyle=secondary;for(const x of [0,W/2-38,W/2,W-38]){g.fillRect(x,0,38,H*0.82);}
 g.fillStyle=trim;for(const x of [36,W/2-40,W/2+36,W-40]){g.fillRect(x,0,4,H*0.82);}
 const ink=dark?'#111':'#fff';
 g.textAlign='center';g.textBaseline='middle';
 // glTF UVs start at the top-left: these sheets are uploaded without a vertical flip
 const at=(x,y,fn)=>{g.save();g.translate(x,y);fn();g.restore();};
 at(W*0.25,H*0.27,()=>{g.font=`900 ${wordmark.length>5?66:80}px "Heebo","Arial Hebrew","Noto Sans Hebrew",sans-serif`;g.direction='rtl';g.lineWidth=10;g.strokeStyle=secondary;g.strokeText(wordmark,0,0);g.fillStyle=ink;g.fillText(wordmark,0,0);});
 at(W*0.25,H*0.5,()=>{g.font='900 170px "Oswald","Arial Narrow",Arial,sans-serif';g.direction='ltr';g.lineWidth=16;g.strokeStyle=secondary;g.strokeText(String(number),0,0);g.fillStyle=ink;g.fillText(String(number),0,0);});
 at(W*0.75,H*0.2,()=>{g.font='800 56px "Heebo","Arial Hebrew","Noto Sans Hebrew",sans-serif';g.direction='rtl';g.fillStyle=ink;g.fillText(name,0,0);});
 at(W*0.75,H*0.48,()=>{g.font='900 300px "Oswald","Arial Narrow",Arial,sans-serif';g.direction='ltr';g.lineWidth=20;g.strokeStyle=secondary;g.strokeText(String(number),0,0);g.fillStyle=ink;g.fillText(String(number),0,0);});
 const t=tex(c);t.flipY=false;return t;
}

/** Shorts sheet: team colour with a side stripe and the team mark on the leg. */
export function shortsTexture({primary,secondary,trim,mark}){
 const W=512,H=512,c=canvas(W,H),g=c.getContext('2d');
 g.fillStyle=primary;g.fillRect(0,0,W,H);
 const r=rng(11);for(let i=0;i<6000;i++){g.fillStyle=r()<0.5?'rgba(255,255,255,0.025)':'rgba(0,0,0,0.035)';g.fillRect(r()*W,r()*H,2,1);}
 g.fillStyle=secondary;for(const x of [0,W/2-26,W/2,W-26])g.fillRect(x,0,26,H);
 g.fillStyle=trim;for(const x of [24,W/2-28,W/2+24,W-28])g.fillRect(x,0,4,H);
 const t=tex(c);t.flipY=false;return t;
}

/** Centre-court logo: an original island emblem (palm, wave, ball) - no real brand. */
export function centerLogo(primary,secondary){
 const S=512,c=canvas(S,S),g=c.getContext('2d');
 g.clearRect(0,0,S,S);g.translate(S/2,S/2);
 g.fillStyle=primary;g.beginPath();g.arc(0,0,S*0.46,0,Math.PI*2);g.fill();
 g.lineWidth=14;g.strokeStyle=secondary;g.stroke();
 g.fillStyle=secondary;g.beginPath();for(let i=0;i<=40;i++){const x=-S*0.36+i*S*0.018,y=S*0.12+Math.sin(i*0.55)*S*0.035;i?g.lineTo(x,y):g.moveTo(x,y);}g.lineTo(S*0.36,S*0.32);g.lineTo(-S*0.36,S*0.32);g.fill();
 g.strokeStyle='#f6efe2';g.lineWidth=10;g.beginPath();g.arc(0,-S*0.08,S*0.17,0,Math.PI*2);g.stroke();
 g.beginPath();g.moveTo(-S*0.17,-S*0.08);g.lineTo(S*0.17,-S*0.08);g.moveTo(0,-S*0.25);g.lineTo(0,S*0.09);g.stroke();
 return tex(c);
}

/** A strip for the LED ribbon / scorer's table: animated by shifting the offset. */
export function ledTexture(colors){
 const W=1024,H=64,c=canvas(W,H),g=c.getContext('2d');
 const seg=W/colors.length;
 colors.forEach((col,i)=>{const gr=g.createLinearGradient(i*seg,0,(i+1)*seg,0);gr.addColorStop(0,col);gr.addColorStop(1,'#0b0f18');g.fillStyle=gr;g.fillRect(i*seg,0,seg,H);
  g.fillStyle='rgba(255,255,255,0.75)';for(let k=0;k<6;k++)g.fillRect(i*seg+20+k*26,H*0.3,14,H*0.4);});
 for(let y=0;y<H;y+=3){g.fillStyle='rgba(0,0,0,0.25)';g.fillRect(0,y,W,1);}
 const t=tex(c,{repeat:true});t.wrapT=THREE.ClampToEdgeWrapping;return t;
}

/** A small canvas the view redraws (shot clock / scoreboard digits). */
export function displayCanvas(w,h){const c=canvas(w,h);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return {canvas:c,ctx:c.getContext('2d'),texture:t};}
