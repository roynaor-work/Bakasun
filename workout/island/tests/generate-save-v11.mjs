// Reproduce the golden fixture with the actual e225678 engine, never a downgraded current save.
import {execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const repository=fileURLToPath(new URL('../../../',import.meta.url)),base='e225678',scratch=await mkdtemp(join(tmpdir(),'island-v11-'));
const git=(...args)=>execFileSync('git',args,{cwd:repository,maxBuffer:8*1024*1024});
try{
 const files=git('ls-tree','-r','--name-only',base,'workout/island').toString().trim().split('\n').filter(path=>/\.(?:mjs|js|json)$/.test(path)&&!/(?:tests|verification)\//.test(path));
 await writeFile(join(scratch,'package.json'),'{"type":"module"}');
 for(const path of files){const target=join(scratch,path);await mkdir(dirname(target),{recursive:true});await writeFile(target,git('show',`${base}:${path}`));}
 const root=pathToFileURL(join(scratch,'workout/island/')),{loadData}=await import(new URL('engine/load-data.mjs',root)),{createEngine}=await import(new URL('engine/engine.mjs',root));
 const data=await loadData(root,async url=>({ok:true,json:async()=>JSON.parse(await readFile(url,'utf8'))})),engine=createEngine(data,{storage:{getItem:()=>null,setItem(){}},now:()=>1792108800000});
 engine.setAvatar({...data.avatar.defaults,created:true});engine.skipTutorial();for(const args of [['house',1,7],['soccer',4,8]])assert.equal(engine.place(...args).ok,true);
 engine.state.money=321;engine.state.minigameEquipment.navalDuel.damage=2;engine.save();assert.equal(engine.state.version,11);
 const {createSoccer}=await import(new URL('minigames/soccer.mjs',root));
 const game=engine.registry.minigames.get('soccer');let result;
 engine.registry.minigames.set('soccer',{...game,start(ctx){
   const model=createSoccer({config:data.config.minigames.soccer,seed:42,stage:ctx.level,difficulty:ctx.difficulty,card:ctx.soccerCard});
   for(let i=0;i<30000&&!model.result;i++){
     const s=model.getState(),p=s.players[s.controlled],mine=s.ball.owner===p.id,dx=mine?s.attackDir*15-p.x:s.ball.x-p.x,dz=mine?-p.z:s.ball.z-p.z,l=Math.hypot(dx,dz)||1;
     model.update(1/60,{moveX:dx/l,moveZ:dz/l,kickHeld:mine&&p.x*s.attackDir>8&&s.charge<.7});
   }
   result=model.result;assert.ok(result.won);assert.ok(ctx.finish({outcome:'win',score:result.goalsFor,soccer:result}).ok);return {dispose(){}};
 }});
 for(const level of [1,2])assert.ok(engine.startMinigame('soccer',{level,seed:42}).ok);engine.save();
 const {createTennis}=await import(new URL('minigames/tennis.mjs',root));let placed=false;for(let z=0;z<16&&!placed;z++)for(let x=0;x<16&&!placed;x++)placed=engine.place('tennis',x,z).ok;assert.ok(placed);
 const tennis=engine.registry.minigames.get('tennis');engine.registry.minigames.set('tennis',{...tennis,start(ctx){const m=createTennis({config:data.config.minigames.tennis,stage:ctx.level,seed:42,difficulty:ctx.difficulty});let contact=-1,serve=-1;for(let i=0;i<144000&&!m.result;i++){const s=m.getState();let swing=false;if(s.phase==='serve'&&s.server===0&&serve!==s.pointNumber){swing=true;serve=s.pointNumber;}if(s.phase==='rally'&&s.contact?.side===0&&s.contact.eta<=.15&&contact!==s.contact.at){swing=true;contact=s.contact.at;}m.update(1/60,{swing,targetX:s.contact?.side===0?s.contact.x:0});}assert.ok(m.result?.won);assert.ok(ctx.finish({outcome:'win',score:m.result.gamesFor,tennis:m.result}).ok);return {dispose(){}};}});assert.ok(engine.startMinigame('tennis',{seed:42,level:1}).ok);engine.save();
 const output=process.argv[2]?resolve(process.argv[2]):join(repository,'workout/island/tests/fixtures/save-v11.json');await mkdir(dirname(output),{recursive:true});await writeFile(output,engine.exportJSON()+'\n');console.log(`Created v11 fixture from ${base}: ${output}`);
}finally{await rm(scratch,{recursive:true,force:true});}
