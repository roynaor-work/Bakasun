// Geometric speed profile (bot-independent): corner limit v=sqrt(aLat*R) smoothed over 24 m, forward pass with engine pull, backward pass with braking.
// Reports the share of lap TIME at >=95% / >=90% of top speed, the number of braking zones (drop of 12+ m/s) and the minimum speed.
// Usage: node tools/racing-speedprofile.mjs [out.json]   (RACING_TRACKS=v1 for the old circuits, RACING_LOOK=... n/a)
import {writeFile} from 'node:fs/promises';import {fileURLToPath} from 'node:url';
if(process.env.RACING_TRACKS)globalThis.location={search:'?racingTracks='+process.env.RACING_TRACKS+(process.env.V2Q||'')};
const {createTrack,TRACKS}=await import('../minigames/racing-tracks.mjs');
const TOP=42.6,A_LAT=Number(process.env.A_LAT||26),ACC=7,BRK=22,step=4;
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
export function profile(id){
 const tr=createTrack(id),n=Math.floor(tr.length/step),k=[];
 for(let i=0;i<n;i++){k.push(Math.abs(wrap(tr.sample((i+1)*step).heading-tr.sample(i*step).heading))/step);}
 const sm=k.map((_,i)=>{let s=0;for(let j=-3;j<=3;j++)s+=k[(i+j+n)%n];return s/7;});
 let v=sm.map(c=>Math.min(TOP,Math.sqrt(A_LAT/Math.max(c,1e-4))));
 for(let pass=0;pass<3;pass++){
  for(let i=0;i<n*2;i++){const a=i%n,b=(i+1)%n;v[b]=Math.min(v[b],Math.sqrt(v[a]*v[a]+2*ACC*step));}
  for(let i=n*2;i>0;i--){const a=i%n,b=(i-1+n)%n;v[b]=Math.min(v[b],Math.sqrt(v[a]*v[a]+2*BRK*step));}
 }
 const dt=v.map(x=>step/x),T=dt.reduce((a,b)=>a+b,0),share=f=>dt.reduce((s,d,i)=>s+(v[i]>=f*TOP?d:0),0)/T;
 let zones=0,inB=false;for(let i=0;i<n;i++){const a=v[i],b=v[(i+5)%n];if(!inB&&a-b>8){zones++;inB=true;}if(b>=a)inB=false;}
 return {id,lengthM:Math.round(tr.length),lapS:+T.toFixed(1),over95:+(share(.95)*100).toFixed(1),over90:+(share(.9)*100).toFixed(1),brakingZones:zones,minKmh:Math.round(Math.min(...v)*3.6),meanKmh:Math.round(n*step/T*3.6)};
}
if(import.meta.url===`file://${process.argv[1]}`){const rows=TRACKS.map(t=>profile(t.id));for(const r of rows)console.log(JSON.stringify(r));if(process.argv[2])await writeFile(fileURLToPath(new URL('../'+process.argv[2],import.meta.url)),JSON.stringify(rows,null,1));}
