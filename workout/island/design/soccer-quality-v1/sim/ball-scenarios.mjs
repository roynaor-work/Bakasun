// Browser-safe calibration fixtures for the production soccer helpers.
// Metrics distinguish helper geometry/physics from full match completion rates.
const rad=n=>n*Math.PI/180;
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const pct=(n,d)=>Math.round(10000*n/Math.max(1,d))/100;
const player=(id,x,z,extra={})=>({id,x,z,team:0,role:'support',fx:1,fz:0,vx:0,vz:0,recover:0,slideTime:0,...extra});
const at=(id,r,degrees,extra)=>player(id,r*Math.cos(rad(degrees)),r*Math.sin(rad(degrees)),extra);
const state=(c,players,aim=0,extra={})=>({attackDir:1,controlled:0,aim:{x:Math.cos(rad(aim)),z:Math.sin(rad(aim))},ball:{x:0,z:0,y:c.physics.ballRadius,vx:0,vz:0,vy:0,curve:0,owner:0},players:[player(0,0,0),...players],...extra});

export function measureBallQuality(api,c){
  let loftHits=0,loftCount=0,maxLandingError=0,rollGood=0,rollCount=0,rollOut=0,groundHits=0,groundCount=0,throughHits=0,throughCount=0,throughEligible=0,throughUnsafe=0,throughUnsafeRejected=0;
  const rolls=[],loftRows=[],throughRows=[];
  for(const range of [10,14,18,21])for(const error of [-24,-12,0,12,24])for(const chargeError of [-.3,-.15,0,.15,.3]){
    const distractorBearing=error+Math.sign(error||1)*(Math.abs(error)+12);
    const s=state(c,[at(1,range,0),at(2,Math.max(5,range*.5),distractorBearing)],error);
    const power=Math.max(0,Math.min(1,(range-c.passing.minDistance)/(c.passing.maxDistance-c.passing.minDistance)+chargeError));
    const result=api.loftDestination(s,c,power,{snap:true});
    loftCount++;if(result.target===1)loftHits++;
    loftRows.push({range,error,chargeError,target:result.target});
  }
  for(const range of [5,8,12,16,20])for(const degrees of [-120,-60,0,60,120,180])for(const power of [.4,.7,1]){
    const b=state(c,[]).ball,target={x:range*Math.cos(rad(degrees)),z:range*Math.sin(rad(degrees))};
    Object.assign(b,api.createLoftFlight(b,target,c,power));
    const planned={x:b.flight.x,z:b.flight.z};let ticks=0;
    while(b.flight&&ticks++<600)api.stepLoftBall(b,c.match.fixedStep,c);
    maxLandingError=Math.max(maxLandingError,dist(b,planned));
    const landed={x:b.x,z:b.z};
    for(let i=0;i<Math.round(6/c.match.fixedStep);i++){
      api.rollBall(b,c.match.fixedStep,c);
      if(Math.abs(b.x)>c.pitch.length/2-c.physics.ballRadius||Math.abs(b.z)>c.pitch.width/2-c.physics.ballRadius)rollOut++;
    }
    const roll=dist(b,landed);rollCount++;if(roll>=.5&&roll<=3)rollGood++;rolls.push(roll);
  }
  for(const range of [4,8,12,16,19,21])for(const error of [-42,-36,-24,-12,0,12,24,36,42]){
    const result=api.assistedPassDestination(state(c,[at(1,range,0)],error),c,0);
    groundCount++;if(result.target===1)groundHits++;
  }
  for(const range of [8,12,16])for(const bearing of [15,22,28])for(const attackDir of [-1,1]){
    const runner=at(2,range,bearing,{vx:4.2,vz:0}),outlet=player(1,5,0),s=state(c,[outlet,runner],0,{throughPass:true});
    if(attackDir<0){s.attackDir=-1;s.aim.x=-1;for(const p of s.players){p.x=-p.x;p.vx=-p.vx;p.fx=-1;}}
    const result=api.assistedPassDestination(s,c,0),mate=s.players.find(p=>p.id===result.target);
    // Reproduce the pre-existing engine automatic through conversion for fair baseline comparison.
    const auto=!result.through&&mate?api.throughBallPoint(s.ball,mate,s.players,c,attackDir):null;
    const final=auto?{...result,...auto,through:true}:result;
    // Eligibility is established by the unchanged production rules, including
    // the short outlet's body blocking the passing lane. Unsafe requests must
    // fall back to a short pass, and remain in the raw results.
    const safePoint=api.throughBallPoint(s.ball,runner,s.players,c,attackDir);
    const dx=safePoint?.x??0,dz=safePoint?.z??0,l2=dx*dx+dz*dz||1,u=Math.max(0,Math.min(1,(outlet.x*dx+outlet.z*dz)/l2));
    const eligible=!!safePoint&&Math.hypot(outlet.x-u*dx,outlet.z-u*dz)>=1.1;
    throughCount++;if(eligible){throughEligible++;if(final.target===2&&final.through&&dist(final,runner)>=2)throughHits++;}
    else{throughUnsafe++;if(!(final.target===2&&final.through))throughUnsafeRejected++;}
    throughRows.push({range,bearing,attackDir,eligible,target:final.target,through:!!final.through,lead:dist(final,mate||final)});
  }
  rolls.sort((a,b)=>a-b);
  return {loftIntentPercent:pct(loftHits,loftCount),landingRollPercent:pct(rollGood,rollCount),groundReceiverPercent:pct(groundHits,groundCount),throughIntentPercent:pct(throughHits,throughEligible),throughOverallPercent:pct(throughHits,throughCount),throughUnsafeRejectPercent:pct(throughUnsafeRejected,throughUnsafe),loftLandingErrorMaxMetres:maxLandingError,counts:{loft:loftCount,roll:rollCount,ground:groundCount,through:throughCount,throughEligible,throughUnsafe},roll:{min:rolls[0],median:rolls[Math.floor(rolls.length/2)],max:rolls.at(-1),outOfPitchSamples:rollOut},rows:{loft:loftRows,through:throughRows}};
}
