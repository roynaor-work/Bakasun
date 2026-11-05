/** Isolated physical environment reflection probes; never paints eye glints. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {openPreview,root} from './browser-session.mjs';
const number=process.argv[2]||'09';if(!/^\d{2}$/.test(number))throw Error('Expected iteration number');
const out=path.join(root,'iterations',number,'corneal-probes');await fs.mkdir(out,{recursive:true});
const s=await openPreview(),captures=[];
try{
  await s.page.evaluate(async()=>{await soccerV7.setView('face');soccerV7.setOrbit(.13);soccerV7.seek(.15);});
  await s.page.screenshot({path:path.join(out,'baseline.png')});
  for(const spec of [{strength:8,height:.15,eyeIntensity:1},{strength:16,height:.15,eyeIntensity:1},{strength:16,height:.15,eyeIntensity:2}]){
    await s.page.evaluate(async spec=>{
      // Tool-only import of the same local r160 module to construct a probe.
      // The delivered runtime continues using its single bundled instance.
      const T=await import('/vendor/three.module.js');
      const {scene,renderer,actors}=soccerV7.inspect();
      const reflection=new T.Scene();reflection.background=new T.Color(.15,.17,.20);
      const geometry=new T.PlaneGeometry(1,1),materials=[];
      for(const p of [
        {p:[-3.6,3.1,3.5],s:[3.3,4.6],rgb:[5.2,4.6,3.9]},
        {p:[4.2,2.7,1.8],s:[2.2,3.8],rgb:[1.8,2.2,2.9]},
        {p:[2.5,4,-3.7],s:[2.3,4.2],rgb:[3.7,4.3,5.3]},
        {p:[0,7,0],s:[5,5],rgb:[1.5,1.7,2]},
        {p:[.7,spec.height,4],s:[.8,.8],rgb:[spec.strength,spec.strength*.98,spec.strength*.95]}
      ]){
        const material=new T.MeshBasicMaterial({color:new T.Color(...p.rgb),side:T.DoubleSide,toneMapped:false});materials.push(material);
        const panel=new T.Mesh(geometry,material);panel.position.fromArray(p.p);panel.scale.set(...p.s,1);panel.lookAt(0,0,0);reflection.add(panel);
      }
      globalThis.__cornealProbeTarget?.dispose();
      const pmrem=new T.PMREMGenerator(renderer);globalThis.__cornealProbeTarget=pmrem.fromScene(reflection,0,.1,35);scene.environment=globalThis.__cornealProbeTarget.texture;
      pmrem.dispose();geometry.dispose();materials.forEach(m=>m.dispose());
      for(const a of actors)a.model.traverse(o=>{if(o.isMesh&&o.material?.name==='Eyes')o.material.envMapIntensity=spec.eyeIntensity;});
      soccerV7.seek(.15);
    },spec);
    const file='front-'+spec.strength+'-eye-'+spec.eyeIntensity+'.png';await s.page.screenshot({path:path.join(out,file)});captures.push({spec,file});
  }
  await fs.writeFile(path.join(out,'probe.json'),JSON.stringify({generatedAt:new Date().toISOString(),captures,loadedHashes:await s.page.evaluate(()=>soccerV7.inspect().data.hashes),errors:s.errors,remoteRequests:s.remoteRequests,purpose:'Controlled HDR corneal reflection comparison using a local review-only r160 module; no painted catchlights.'},null,2)+'\n');
  console.log(JSON.stringify({captures:captures.length+1,errors:s.errors,out}));
}finally{await s.close();}
