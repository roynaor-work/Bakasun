// v24 racing liveries: the Codex team liveries (design/racing-liveries-v1) on the cars of the race, and the team colour of every driver on the grid card, the timing
// tower, the classification and the podium. ?racingLiveries=0 returns the previous behaviour exactly (each driver's own colour, the twelve driver crests, the canvas
// decals); the runtime files in assets/ are byte-identical to the Codex originals and the offline list carries them.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,stat} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import * as T from '../workout/island/vendor/three.module.js';
import {TEAMS,GRID_DRIVERS,gridDriver,driverById,paintOf,liveriesEnabled,LIVERIES} from '../workout/island/minigames/racing-league-core.mjs';
import {LIVERY_FILES,PART,PLATE_UV,plateFile,loadLiveries,partOf,tagParts,liveryMaterial,addRearPlate,standInColors,liveryUrl} from '../workout/island/minigames/racing-liveries.mjs';
import {createStandIn,dressCar} from '../workout/island/minigames/racing-car-look.mjs';
import {towerRows,classification,raceIntro} from '../workout/island/minigames/racing-broadcast.mjs';
import {crestUrl,teamCrestUrl,carCrest} from '../workout/island/minigames/racing-broadcast-art.mjs';
import {createRacing} from '../workout/island/minigames/racing-physics.mjs';

const island=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../workout/island');
const read=file=>readFile(path.join(island,file));
const json=async file=>JSON.parse(await read(file));
const exists=async file=>{try{return (await stat(path.join(island,file))).size>0;}catch{return false;}};
const offline=await json('offline-manifest.json');
const readAsset=file=>json('assets/racing-liveries-v1/'+file);
const realLoad=(over={})=>loadLiveries({readJson:readAsset,loadTexture:async file=>({file}),...over});

// ---------- 1. flag and colours ----------
test('flag: on by default, ?racingLiveries=0 turns the team liveries off',()=>{
 assert.equal(liveriesEnabled(''),true);assert.equal(liveriesEnabled('?racingLiveries=1'),true);assert.equal(liveriesEnabled('?racingLiveries=0'),false);
 assert.equal(LIVERIES,true,'node has no location: the default');
});
test('every driver wears the team colour: both team-mates alike, six colours on twelve cars; the own colour stays as data',()=>{
 for(const t of TEAMS){const [a,b]=t.drivers.map(driverById);assert.equal(a.paint,t.color,a.id);assert.equal(b.paint,t.color,b.id);assert.equal(paintOf(a),t.color);assert.equal(paintOf(b),t.color);}
 assert.equal(new Set(GRID_DRIVERS.map(d=>d.paint)).size,6);
 assert.equal(new Set(GRID_DRIVERS.map(d=>d.color)).size,12,'the own colours are untouched');
 // off: the own colour, exactly the colour racing-deep-m4 painted
 for(const d of GRID_DRIVERS)assert.equal(paintOf(d,false),d.color);
 assert.equal(paintOf(null),'#8a98a6');assert.equal(gridDriver(14).paint,'#8a98a6','a car outside the grid stays neutral');
});

// ---------- 2. files ----------
test('assets/racing-liveries-v1: every runtime file exists, is byte-identical to the Codex original, and nothing but the runtime files was copied',async()=>{
 assert.equal(LIVERY_FILES.length,1+6+12);
 for(const file of [...LIVERY_FILES,'LICENSES.md']){assert.ok(await exists('assets/racing-liveries-v1/'+file),file);
  assert.ok((await read('assets/racing-liveries-v1/'+file)).equals(await read('design/racing-liveries-v1/'+file)),file+' differs from the design original');}
 const list=async dir=>(await readdir(path.join(island,dir),{recursive:true,withFileTypes:true})).filter(e=>e.isFile()).map(e=>path.relative(path.join(island,dir),path.join(e.parentPath||e.path,e.name)).split(path.sep).join('/')).sort();
 assert.deepEqual(await list('assets/racing-liveries-v1'),[...LIVERY_FILES,'LICENSES.md'].sort(),'no preview, evidence, report or source in the runtime copy');
 assert.equal((await list('design/racing-liveries-v1')).length,32,'the Codex package itself is complete and unchanged');
});
test('offline: the racing download carries every livery file, and the loader asks for nothing else',async()=>{
 for(const file of LIVERY_FILES)assert.ok(offline.games.racing.includes('assets/racing-liveries-v1/'+file),file);
 assert.ok(offline.shell.includes('minigames/racing-liveries.mjs'),'the module is in the shell list');
 const asked=new Set();await realLoad({readJson:async f=>{asked.add(f);return readAsset(f);},drivers:GRID_DRIVERS.map(d=>d.id),loadTexture:async f=>{asked.add(f);return {};}});
 for(const f of asked)assert.ok(LIVERY_FILES.includes(f),f+' is not in LIVERY_FILES');
 assert.match(liveryUrl('manifest.json'),/\/assets\/racing-liveries-v1\/manifest\.json\?v=island-v2-/);
});

// ---------- 3. palettes ----------
test('the six palettes match TEAMS and the grid: body colour, two cars with the drivers of the team, their numbers and plates, stripe A 7 cm and B 10 cm',async()=>{
 const data=await realLoad();
 assert.deepEqual([...data.byTeam.keys()].sort(),TEAMS.map(t=>t.id).sort());assert.equal(data.byDriver.size,12);
 for(const t of TEAMS){const p=data.byTeam.get(t.id);assert.equal(p.primary.toLowerCase(),t.color);assert.match(p.secondary,/^#[0-9a-f]{6}$/i);assert.notEqual(p.secondary.toLowerCase(),p.primary.toLowerCase());
  assert.deepEqual(p.cars.map(c=>c.driverId).sort(),[...t.drivers].sort());
  for(const c of p.cars){const d=driverById(c.driverId);assert.equal(c.number,d.number);assert.equal(c.numberPlate,plateFile(d));assert.equal(data.of(d.id).palette,p);}
  assert.deepEqual(p.cars.map(c=>c.stripeWidth).sort(),[.07,.1]);}
});
test('a damaged pack is refused as a whole (the cars keep the plain team colour): wrong body colour, wrong number, missing team, bad manifest',async()=>{
 const tamper=(file,edit)=>async f=>{const v=await readAsset(f);if(f===file)edit(v);return v;};
 await assert.rejects(realLoad({readJson:tamper('palettes/ocean.json',p=>{p.primary='#ff00ff';})}),/palette ocean/);
 await assert.rejects(realLoad({readJson:tamper('palettes/gold.json',p=>{p.cars[0].number=99;})}),/car turkiz/);
 await assert.rejects(realLoad({readJson:tamper('manifest.json',m=>{m.teams.pop();})}),/incomplete/);
 await assert.rejects(realLoad({readJson:tamper('manifest.json',m=>{m.mapping.material='Paint 2';})}),/manifest/);
 await assert.rejects(realLoad({readJson:tamper('manifest.json',m=>{m.mapping.secondaryNodes=['FrontWing'];})}),/no part RearWing/);
 await assert.rejects(realLoad({readJson:async f=>{if(f.includes('night'))throw Error('404');return readAsset(f);}}),/404/);
});
test('plates load only for the formula cars that ask for them, as sRGB textures',async()=>{
 const data=await loadLiveries({T,readJson:readAsset,drivers:['player','almog','turkiz','player'],loadTexture:async file=>new T.Texture()});
 assert.deepEqual([...data.plates.keys()],['player','almog','turkiz']);for(const t of data.plates.values())assert.equal(t.colorSpace,T.SRGBColorSpace);
 assert.equal((await realLoad()).plates.size,0,'no drivers, no plates');
});

// ---------- 4. paint on the model ----------
function paintScene(){
 const scene=new T.Group(),paint=new T.MeshStandardMaterial({name:'Paint 1'}),graphite=new T.MeshStandardMaterial({name:'Graphite'});
 const box=()=>new T.BoxGeometry(1,1,1),add=(name,m,parent=scene)=>{const o=new T.Mesh(box(),m);o.name=name;parent.add(o);return o;};
 add('Body',paint);add('EngineFin',paint);add('Cockpit',graphite);
 for(const name of ['FrontWing','RearWing']){const g=new T.Group();g.name=name;scene.add(g);add(name+'_1',paint,g);add(name+'_2',graphite,g);}
 return scene;
}
test('tagParts marks body, rear wing, front wing and fin per vertex (the multi-material wings by their group) and leaves every other mesh alone',()=>{
 const scene=paintScene();assert.equal(tagParts(T,scene),4);
 const by=name=>scene.getObjectByName(name).geometry.attributes.livPart;
 assert.equal(by('Body').getX(0),PART.Body);assert.equal(by('RearWing_1').getX(5),PART.RearWing);assert.equal(by('FrontWing_1').getX(3),PART.FrontWing);assert.equal(by('EngineFin').getX(7),PART.EngineFin);
 for(const n of ['Cockpit','FrontWing_2','RearWing_2'])assert.equal(by(n),undefined,n);
 assert.equal(by('Body').count,scene.getObjectByName('Body').geometry.attributes.position.count);
 assert.equal(partOf({name:'Helmet',parent:null}),-1);
 assert.throws(()=>tagParts(T,new T.Group()),/no paint parts/);
});
function fakeShader(){return {uniforms:{},vertexShader:'void main(){\n#include <begin_vertex>\n}',fragmentShader:'void main(){vec4 diffuseColor=vec4(1.);\n#include <color_fragment>\n}'};}
test('liveryMaterial: the palette finish, one shared program for all cars, the per-car uniforms (colours, stripe width, plates) and the object-space shader',async()=>{
 const data=await realLoad(),plate=new T.Texture();
 const a=liveryMaterial(T,{palette:data.of('player').palette,car:data.of('player').car,mapping:data.mapping,plate,envMapIntensity:1.6});
 const b=liveryMaterial(T,{palette:data.of('noa').palette,car:data.of('noa').car,mapping:data.mapping,plate:null});
 assert.ok(a.isMeshPhysicalMaterial);assert.equal(a.name,'Paint 1');assert.equal(a.envMapIntensity,1.6);assert.equal(a.clearcoat,data.byTeam.get('flame').finish.clearcoat);
 assert.equal(a.customProgramCacheKey(),b.customProgramCacheKey(),'one program for every car');
 const sa=fakeShader(),sb=fakeShader();a.onBeforeCompile(sa);b.onBeforeCompile(sb);
 assert.match(sa.vertexShader,/attribute float livPart;/);assert.match(sa.vertexShader,/livPartV = livPart;/);assert.match(sa.fragmentShader,/diffuseColor\.rgb = mix\(paint, plate\.rgb, plate\.a\);/);
 assert.ok(sa.fragmentShader.indexOf('#include <color_fragment>')<sa.fragmentShader.indexOf('diffuseColor.rgb = mix'),'the livery runs after the colour chunk');
 assert.ok(sa.uniforms.livPrimary.value.equals(new T.Color('#d93228')));assert.ok(sa.uniforms.livSecondary.value.equals(new T.Color(data.byTeam.get('flame').secondary)));
 assert.equal(sa.uniforms.livHalfWidth.value,.035);assert.equal(sb.uniforms.livHalfWidth.value,.05,'car B: the wider stripe');
 assert.equal(sa.uniforms.livPlate.value,plate);assert.equal(sa.uniforms.livHasPlate.value,1);assert.equal(sb.uniforms.livHasPlate.value,0,'no plate texture: no plate sampling');
 const nose=data.mapping.numberProjections.find(p=>p.face==='top');assert.deepEqual(sa.uniforms.livNose.value.toArray(),[...nose.center,...nose.size]);
 assert.deepEqual(a.userData.livery,{team:'flame',driverId:'player',number:1,variant:'A'});
});
test('the rear plate: one quad on the rear face of the rear wing, cropped to the plate inside the PNG, facing the chase camera',()=>{
 const car=new T.Group(),res=new Set(),keep=v=>(res.add(v),v),tex=new T.Texture(),m=addRearPlate(T,car,tex,keep);
 assert.equal(car.children.length,1);assert.equal(m.material.map,tex);assert.equal(m.rotation.y,Math.PI);assert.ok(m.position.z<-2.3);
 const uv=m.geometry.attributes.uv,us=new Set(),vs=new Set();for(let i=0;i<uv.count;i++){us.add(+uv.getX(i).toFixed(6));vs.add(+uv.getY(i).toFixed(6));}
 assert.deepEqual([...us].sort(),[PLATE_UV[0],PLATE_UV[2]].map(v=>+v.toFixed(6)).sort());assert.deepEqual([...vs].sort(),[PLATE_UV[1],PLATE_UV[3]].map(v=>+v.toFixed(6)).sort());
 const p=m.geometry.parameters,ratio=(PLATE_UV[2]-PLATE_UV[0])/(PLATE_UV[3]-PLATE_UV[1]);assert.ok(Math.abs(p.width/p.height-ratio)<1e-9,'the plate keeps its proportions');
 assert.ok(res.has(m.geometry)&&res.has(m.material),'owned by the view (disposed with it)');
});
test('the far silhouette: team body, wings in the secondary colour and the centre stripe (60 more triangles); without a livery it is the same silhouette as before',async()=>{
 const data=await realLoad(),keep=v=>v,lv=data.of('or'),c=standInColors(lv);
 assert.deepEqual(c,{paint:lv.palette.primary,accent:lv.palette.secondary,stripe:lv.palette.stripe,stripeWidth:lv.car.stripeWidth});assert.equal(standInColors(null),null);
 const plain=createStandIn(T,'#7ac05a',keep,'#123456'),dressed=createStandIn(T,c.paint,keep,c.accent,{color:c.stripe,width:c.stripeWidth});
 const tris=g=>g.children[0].geometry.attributes.position.count/3;assert.equal(tris(dressed)-tris(plain),60);
 const colours=g=>{const a=g.children[0].geometry.attributes.color,set=new Set();for(let i=0;i<a.count;i++)set.add(new T.Color(a.getX(i),a.getY(i),a.getZ(i)).getHexString());return set;};
 for(const hex of [c.paint,c.accent,c.stripe])assert.ok(colours(dressed).has(hex.slice(1).toLowerCase()),hex);
 assert.ok(!colours(plain).has(c.stripe.slice(1).toLowerCase()));
});
test('dressCar with decals:false keeps the brake lights and leaves the four canvas decals out (the livery paints numbers and stripe)',()=>{
 const car=new T.Group(),d=dressCar(T,car,{index:0,color:'#d93228',keep:v=>v,decals:false});
 assert.equal(car.getObjectByName('decals').children.length,0);assert.equal(d.lamps.length,2);d.brake(true);assert.equal(d.lampMaterial.emissiveIntensity,2.6);
});

// ---------- 5. the broadcast: grid card, tower, classification, podium, crests ----------
test('grid card, tower and classification rows carry the team colour (paint) next to the own colour, for every car of a twelve-car race',()=>{
 const race=createRacing({stage:1,seed:5,config:{countdown:0,extraRivals:7}}),s=race.state;assert.equal(s.cars.length,12);
 for(let n=0;n<240;n++)race.step(1/60,{steer:0,throttle:1,autoAccelerate:true});
 const check=(rows,label)=>{assert.equal(rows.length,12,label);for(const r of rows){const d=driverById(r.id==='player'?'player':s.cars.find(c=>c.id===r.id)?GRID_DRIVERS[s.cars.findIndex(c=>c.id===r.id)].id:'');assert.equal(r.paint,d.paint,label+' '+r.name);assert.equal(r.color,d.color,label+' own colour kept');}};
 check(towerRows(s,{limit:12}),'tower');check(classification(s),'classification');
 const intro=raceIntro(s,{timeOfDay:'day'},race.track);assert.equal(intro.grid.length,12);
 for(const g of intro.grid){const d=GRID_DRIVERS.find(x=>x.number===g.number);assert.equal(g.paint,d.paint,'grid '+g.name);}
 const byTeam=new Map();for(const r of towerRows(s,{limit:12})){const d=GRID_DRIVERS.find(x=>x.number===r.number);(byTeam.get(d.teamId)||byTeam.set(d.teamId,[]).get(d.teamId)).push(r.paint);}
 for(const [team,paints] of byTeam){assert.equal(paints.length,2,team);assert.equal(paints[0],paints[1],team+': the two cars share the colour');}
});
test('crests: with the liveries the tower and the chips show the team crest (both team-mates alike); off = the twelve driver crests as before',async()=>{
 for(const d of GRID_DRIVERS){const u=teamCrestUrl(d.number);assert.ok(u.endsWith(`/assets/racing-league-v1/teams/${d.teamId}.svg`),d.id);assert.ok(await exists(`assets/racing-league-v1/teams/${d.teamId}.svg`));
  assert.equal(carCrest(d.number),u);assert.equal(carCrest(d.number,false),crestUrl(d.number));assert.notEqual(crestUrl(d.number),u);}
 assert.equal(teamCrestUrl(99),'');assert.equal(carCrest(99),'');
 for(const t of TEAMS){const [a,b]=t.drivers.map(driverById);assert.equal(carCrest(a.number),carCrest(b.number));}
});
test('wiring: the view, the tower, the chips, both podiums and the league screens read the paint, each behind the flag',async()=>{
 const view=(await read('minigames/racing-view.mjs')).toString();
 for(const must of ["const paintColors=LIVERIES?CAR_COLORS.map((c,i)=>GRID_DRIVERS[i]?.paint||c):CAR_COLORS;","carColors:paintColors","const carColors=paintColors","decals:!lv","failures.push('liveries')","loaded.mod.tagParts(T,source,loaded.data.mapping.material)","if(livPart)merged.setAttribute('livPart'","livery.mod.addRearPlate(T,car,plate,keep)","if(LIVERIES)rig.setColor?.(carColors[i])","liveries:{enabled:LIVERIES,active:!!livery"])assert.ok(view.includes(must),must);
 assert.ok(view.includes("import('./racing-liveries.mjs?v=island-v2-"),'the livery code loads lazily, only with the flag on');
 const tower=(await read('minigames/racing-tower.mjs')).toString();assert.ok(tower.includes('if(LIVERIES&&!art)r.bar.style.background=car.paint;else if(art){const crest=carCrest(car.number);'));assert.ok(tower.includes('LIVERIES?gridDriver(idx).paint:COLORS[idx%COLORS.length]'));
 const bc=(await read('minigames/racing-broadcast.mjs')).toString();assert.ok(bc.includes("c.style.setProperty('--team',row.paint||row.color)"));assert.ok(bc.includes('sw.style.background=row.paint||row.color'));
 const session=(await read('minigames/racing-session.mjs')).toString();assert.ok(session.includes('LIVERIES?gridDriver(Math.max(0,s.cars.indexOf(car))).paint:PODIUM_COLORS['));
 const league=(await read('ui/racing-league.mjs')).toString();assert.ok(league.includes("c.style.setProperty('--team',d?.paint||d?.color||'#8a98a6')"));
});

// ---------- 6. ?racingLiveries=0 in a fresh process: the previous colours and crests exactly ----------
test('?racingLiveries=0 in a fresh process: the own colour on every row and chip and the twelve driver crests, exactly as before',async()=>{
 const url=f=>pathToFileURL(path.join(island,f)).href+'?v=island-v2-20261107-11';   // the same module instances the app imports
 const code=`globalThis.location={search:'?racingLiveries=0'};
 const core=await import(${JSON.stringify(url('minigames/racing-league-core.mjs'))});
 const art=await import(${JSON.stringify(url('minigames/racing-broadcast-art.mjs'))});
 const bc=await import(${JSON.stringify(url('minigames/racing-broadcast.mjs'))});
 const phys=await import(${JSON.stringify(url('minigames/racing-physics.mjs'))});
 const race=phys.createRacing({stage:1,seed:5,config:{countdown:0,extraRivals:7}});
 console.log(JSON.stringify({on:core.LIVERIES,paint:core.GRID_DRIVERS.map(d=>d.paint),color:core.GRID_DRIVERS.map(d=>d.color),crest:core.GRID_DRIVERS.map(d=>art.carCrest(d.number)===art.crestUrl(d.number)),rows:bc.towerRows(race.state,{limit:12}).map(r=>r.paint===r.color)}));`;
 const {stdout}=await promisify(execFile)(process.execPath,['--input-type=module','-e',code],{cwd:island});
 const out=JSON.parse(stdout.trim().split('\n').pop());
 assert.equal(out.on,false);assert.deepEqual(out.paint,out.color,'every driver in the own colour');assert.equal(new Set(out.paint).size,12);
 assert.ok(out.crest.every(Boolean),'the driver crests');assert.equal(out.rows.length,12);assert.ok(out.rows.every(Boolean),'the tower shows the own colour');
});
