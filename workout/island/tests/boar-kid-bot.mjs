// A child-like thumb on the boar game's left stick (14/11/2026), shared by the offline aim model (tests/island-boars-v24.test.mjs)
// and the real-touch browser run (boar-aim-v24-browser.mjs), so both measure the same "child".
// The child looks at the crosshair and the boar (with a delay), knows roughly how far to push the stick for a given speed (the ring is drawn
// on the screen), wants the crosshair to close the gap, brakes a little ahead of time from how fast the crosshair moves, and follows a boar
// that walks. Every correction has a direction error with standard deviation `sigmaDeg` (8 to 12 degrees, "human aim noise"), a size error
// and a little tremor; the thumb itself needs a moment to get where it is sent. It holds the fire button when it believes the crosshair is on
// the boar. Deterministic for a given seed.

export function rng(seed=1){let s=(seed>>>0)||1;return ()=>{s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return s/4294967296;};}
export function gauss(r){let u=0,v=0;while(u===0)u=r();while(v===0)v=r();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}

export const KID=Object.freeze({
  sigmaDeg:10,      // direction error of each correction (deg)
  sizeSigma:.22,    // size error of each correction (log-normal)
  tremor:.7,        // px of thumb tremor per step
  perceive:.1,      // s: what the child acts on is this old
  react:[.24,.36],  // s: reaction time to a new boar
  plan:[.18,.3],    // s: a correction lasts this long before a new one (new errors)
  step:.12,         // s: the child looks and moves the thumb about this often
  thumbTau:.06,     // s: the thumb's own lag
  close:.3,         // s: the child wants to close the gap in about this time
  predict:.15,      // s: the child brakes this far ahead from the crosshair's speed
  pursuit:.5,       // a child follows half of a walking boar's speed (it lags behind a moving boar)
  speedCap:.85,     // fraction of the stick's top speed the child asks for (more = a push past the ring)
  push:[1.1,1.8],   // a push "as far as it goes" lands this far out, in ring radii (children push past the ring)
  onPx:3,onFrac:.5, // the child calls it "on the boar" within max(3 px, half the boar's visible radius) of the aim point
  fireIn:4,fireOut:12, // holds fire within visible radius + 4 px, lets go past visible radius + 12 px
  liftBetween:.5,   // chance to lift the thumb between boars
  home:{x:79,y:311},homeJitter:14, // where the thumb lands (the resting ring) and how much the landing varies
  bounds:{x0:4,x1:400,y0:90,y1:386} // where a thumb can be on a 844 x 390 phone held sideways
});

/** speedOf(ux,uy): the stick's top speed (px/s) in a screen direction; curve(m): its response (0..1) for a thumb offset of m ring radii.
 *  anchor(): where the child sees the ring's centre (null when the thumb is up); R: the ring radius. */
export function createKidBot({seed=1,speedOf=(ux,uy)=>Math.hypot(675.2*ux,253.5*uy),curve=m=>{const a=Math.max(0,Math.min(1,(m-.08)/.92));return a*(.3+.7*a);},R=80,anchor=()=>null,...opts}={}){
  const P={...KID,...opts},r=rng(seed),hist=[];
  let thumb=null,last=null,target=null,reactUntil=0,plan=null,fire=false,strokes=0,lastDir=null,moved=false;
  const U=([a,b])=>a+(b-a)*r(),sigma=P.sigmaDeg*Math.PI/180;
  const inv=g=>{if(g<=0)return 0;let lo=0,hi=1;for(let i=0;i<24;i++){const m=(lo+hi)/2;if(curve(m)<g)lo=m;else hi=m;}return hi;};
  function perceived(t){let o=hist[0];for(const h of hist){if(h.t<=t-P.perceive)o=h;else break;}return o;}
  function rates(o){const i=hist.indexOf(o),p=i>1?hist[i-2]:i>0?hist[i-1]:null;if(!p||o.t-p.t<1e-6)return {vx:0,vy:0,tvx:0,tvy:0};
    const dt=o.t-p.t,same=o.target&&p.target&&o.target.id===p.target.id;return {vx:(o.cx-p.cx)/dt,vy:(o.cy-p.cy)/dt,tvx:same?(o.target.x-p.target.x)/dt:0,tvy:same?(o.target.y-p.target.y)/dt:0};}
  const clampThumb=p=>({x:Math.min(P.bounds.x1,Math.max(P.bounds.x0,p.x)),y:Math.min(P.bounds.y1,Math.max(P.bounds.y0,p.y))});
  return {
    get thumb(){return thumb;},get fire(){return fire;},get strokes(){return strokes;},get moved(){return moved;},get step(){return P.step;},
    /** obs: {t, cx, cy, target:{id,x,y,rv}|null} (CSS px, game seconds). Returns {thumb:{x,y}|null, fire}. */
    tick(obs){
      hist.push(obs);while(hist.length>3&&hist[2].t<=obs.t-P.perceive-.3)hist.shift();
      const tickDt=last?obs.t-last.t:P.step;last=obs;
      if(!obs.target){fire=false;if(target!==null&&thumb&&r()<P.liftBetween)thumb=null;target=null;plan=null;return {thumb,fire};}
      if(obs.target.id!==target){target=obs.target.id;reactUntil=obs.t+U(P.react);plan=null;strokes=0;lastDir=null;moved=false;fire=false;}
      const o=perceived(obs.t),seen=o.target;
      if(obs.t<reactUntil||!seen||seen.id!==target)return {thumb,fire};
      if(!thumb){const j=()=>gauss(r)*P.homeJitter;thumb=clampThumb({x:P.home.x+j(),y:P.home.y+j()});return {thumb,fire};}
      const centre=anchor()||thumb,ex=seen.x-o.cx,ey=seen.y-o.cy,D=Math.hypot(ex,ey),{vx,vy,tvx,tvy}=rates(o);
      if(!plan||obs.t>=plan.until)plan={rot:gauss(r)*sigma,size:Math.exp(gauss(r)*P.sizeSigma),push:U(P.push),until:obs.t+U(P.plan)};
      // the speed the child wants: follow the boar, close the gap in `close` seconds, braking ahead from the speed it sees
      const on=D<Math.max(P.onPx,P.onFrac*seen.rv);
      const fx=P.pursuit*tvx,fy=P.pursuit*tvy;let px=ex-P.predict*(vx-fx),py=ey-P.predict*(vy-fy);if(on){px=0;py=0;}
      let wx=fx+px/P.close,wy=fy+py/P.close;const ws=Math.hypot(wx,wy);
      let cmd=centre;
      if(ws>1e-6){const a=Math.atan2(wy,wx)+plan.rot,ux=Math.cos(a),uy=Math.sin(a),top=speedOf(ux,uy),g=Math.min(1,ws/top*plan.size);
        const m=g>=P.speedCap?plan.push:inv(g);cmd={x:centre.x+ux*m*R,y:centre.y+uy*m*R};}
      const k=1-Math.exp(-tickDt/P.thumbTau),nx=thumb.x+(cmd.x-thumb.x)*k,ny=thumb.y+(cmd.y-thumb.y)*k,mx=nx-thumb.x,my=ny-thumb.y;
      if(Math.hypot(mx,my)>3){const dir=Math.atan2(my,mx);if(lastDir===null||Math.abs(Math.atan2(Math.sin(dir-lastDir),Math.cos(dir-lastDir)))>Math.PI/4){strokes++;lastDir=dir;}moved=true;}
      thumb=clampThumb({x:nx+gauss(r)*P.tremor,y:ny+gauss(r)*P.tremor});
      if(D<seen.rv+P.fireIn)fire=true;else if(D>seen.rv+P.fireOut)fire=false;
      return {thumb,fire};
    }
  };
}
