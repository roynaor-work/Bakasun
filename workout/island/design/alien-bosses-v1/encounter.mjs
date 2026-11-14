/** Reference encounter logic for this asset package only. No game imports or globals.
 * Coordinates: glTF metres; +Z is toward the player. update(dt) uses seconds.
 * The consumer owns collisions/rendering/audio. drainEvents() transfers events once.
 */
export class BossEncounter {
  constructor(spec){this.spec=spec;this.reset();}
  reset(){
    this.targets=Object.fromEntries(this.spec.targets.map(t=>[t.node,{...t,hp:t.maxHp}]));
    this.time=0;this.cycle=0;this.status='entering';this.events=[];this.next=0;
    this.timeline=this.spec.attack.timeline;
    this.events.push({type:'entrance',boss:this.spec.id,time:0});
    return this;
  }
  get shieldActive(){return this.spec.id==='cosmic-guardian'&&this.targets.generator.hp>0;}
  get hp(){return Object.values(this.targets).filter(t=>t.required).reduce((s,t)=>s+t.hp,0);}
  get maxHp(){return Object.values(this.targets).filter(t=>t.required).reduce((s,t)=>s+t.maxHp,0);}
  state(node){const t=this.targets[node];return !t||t.hp===t.maxHp?'intact':t.hp/t.maxHp>.34?'damaged':'critical';}
  hit(node,damage=1){
    const t=this.targets[node];
    if(this.status!=='active'||!t||t.hp<=0||!Number.isFinite(damage)||damage<=0)return false;
    if(this.shieldActive&&node!=='generator'){this.events.push({type:'blocked',node,time:this.time});return false;}
    t.hp=Math.max(0,t.hp-damage);this.events.push({type:'hit',node,state:this.state(node),time:this.time});
    if(t.hp===0){
      this.events.push({type:'explosion',node,time:this.time});
      if(node==='generator')this.events.push({type:'shield-down',node,time:this.time});
    }
    if(this.hp===0)this.retreat(true);
    return true;
  }
  retreat(defeated=false){
    if(this.status==='retreating'||this.status==='gone')return;
    this.status='retreating';this.retreatAt=this.time;
    this.events.push({type:defeated?'death':'retreat',time:this.time});
  }
  update(dt){
    if(!Number.isFinite(dt)||dt<0)throw new RangeError('dt must be finite, non-negative seconds');
    this.time+=dt;
    if(this.status==='entering'&&this.time>=this.spec.entranceSeconds)this.status='active';
    if(this.status==='retreating'&&this.time-this.retreatAt>=this.spec.retreatSeconds)this.status='gone';
    if(this.status!=='active')return;
    // Deterministic event scheduling, including a frame that crosses cycle boundaries.
    let at=this.spec.entranceSeconds+this.cycle*this.spec.attack.cycleSeconds;
    while(this.time>=at+this.timeline[this.next].at){
      const step=this.timeline[this.next],target=this.targets[step.node];
      if(target?.hp>0){
        const angles=step.type==='shot'?step.angles:[0];
        for(const angle of angles)this.events.push({...step,angle,boss:this.spec.id,time:at+step.at,shieldActive:this.shieldActive});
      }
      this.next++;
      if(this.next===this.timeline.length){this.next=0;this.cycle++;at=this.spec.entranceSeconds+this.cycle*this.spec.attack.cycleSeconds;}
    }
  }
  drainEvents(){const result=this.events;this.events=[];return result;}
  /** Preview-only control: set all targets to a state without producing combat events. */
  previewState(state){
    const fraction={intact:1,damaged:.6,critical:.25}[state];
    if(fraction===undefined)throw new RangeError('Unknown damage state');
    for(const t of Object.values(this.targets))t.hp=Math.max(1,Math.round(t.maxHp*fraction));
  }
}
