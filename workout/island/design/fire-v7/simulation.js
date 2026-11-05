/* Deterministic presentation simulation. No game scoring or customer data. */
(function(global){
  'use strict';
  const TYPES=['row-house','corner-store','warehouse','apartment','workshop'];
  class FireSimulation{
    constructor(seed=7105){this.seed=seed;this.step=1/30;this.reset();}
    reset(){
      this.time=0;this.accumulator=0;this.water=false;this.target=2;this.enabled=true;this.events=[];
      this.buildings=TYPES.map((type,i)=>({id:i,type,heat:[.15,.36,.90,.40,.12][i],fuel:1,wet:0,
        damage:[0,.10,.28,.11,0][i],burning:i===2,ignitedAt:i===2?0:null}));
      return this;
    }
    tick(){
      const dt=this.step,next=this.buildings.map(b=>({...b}));
      for(let i=0;i<next.length;i++){
        const prev=this.buildings[i],b=next[i];
        const spray=this.water&&this.target===i;
        const neighbours=[i-1,i+1].filter(k=>k>=0&&k<next.length);
        const exposure=this.enabled?neighbours.reduce((s,k)=>s+(this.buildings[k].burning?this.buildings[k].heat*.033:0),0):0;
        const growth=this.enabled&&prev.burning?.014*prev.fuel:0;
        b.heat=Math.max(0,Math.min(1,prev.heat+(growth+exposure-(spray?.23:0)-.0025)*dt));
        b.wet=Math.max(0,Math.min(1,prev.wet+(spray?.27:-.018)*dt));
        if(b.burning){
          b.fuel=Math.max(0,b.fuel-(.006+b.heat*.007)*dt);
          b.damage=Math.min(1,b.damage+(.003+b.heat*.009)*dt);
          if(b.heat<.24||b.fuel<=0){if(b.fuel<=0)b.damage=Math.max(.90,b.damage);b.burning=false;this.events.push({time:this.time,type:'extinguished',building:i});}
        }else if(this.enabled&&b.heat>.64&&b.fuel>.05&&b.wet<.65){
          b.burning=true;b.ignitedAt=this.time;this.events.push({time:this.time,type:'ignited',building:i});
        }
      }
      this.buildings=next;this.time+=dt;
      if(this.events.length>64)this.events.shift();
    }
    advance(seconds){
      if(!Number.isFinite(seconds)||seconds<=0)return;
      // Fixed steps retain all wall time passed by the caller; renderer bounds it.
      this.accumulator+=seconds;
      while(this.accumulator+1e-10>=this.step){this.tick();this.accumulator-=this.step;}
    }
    seek(seconds){
      const water=this.water,target=this.target,enabled=this.enabled;
      this.reset();this.water=water;this.target=target;this.enabled=enabled;
      this.advance(Math.max(0,Math.min(240,seconds)));return this.snapshot();
    }
    snapshot(){return {time:this.time,water:this.water,target:this.target,enabled:this.enabled,
      buildings:this.buildings.map(b=>({...b})),events:this.events.map(e=>({...e}))};}
  }
  global.FireSimulation=FireSimulation;
})(typeof window==='undefined'?globalThis:window);
