// Check the documented 48x30 adapter using the existing game's 28° / 40°
// tracking elevations and 42° FOV. Magenta test spheres stand for feet, torso
// and head; they are diagnostic probes, never runtime assets or player models.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE||'/opt/codex/cua_node/lib/node_modules/playwright/index.mjs'));
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),iteration=process.argv[2]||'13',base=process.argv[3]||'http://127.0.0.1:8765';
if(!/^\d{2}$/.test(iteration))throw new Error('Iteration must have two digits');
const out=path.join(root,'iterations',iteration);await fs.access(out);
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,
  args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const rows=['width,height,lod,direction,focus_x,focus_z,probe_height,visible_probe_pixels'],failures=[];
try{
  for(const [width,height]of [[390,844],[844,390]]){
    const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
    await page.goto(`${base}/preview.html?capture=1`,{waitUntil:'networkidle'});await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
    const results=await page.evaluate(async()=>{
      const {THREE,loadStadium}=await import('/runtime/stadium.mjs'),r=window.stadiumReview;r.stop();
      const scene=new THREE.Scene(),stadium=await loadStadium({scene,omitParts:['Markings','Goals','Nets','ContactShadows']});stadium.root.scale.set(48/105,48/105,30/68);
      const camera=new THREE.PerspectiveCamera(42,innerWidth/innerHeight,.1,240),target=new THREE.WebGLRenderTarget(innerWidth,innerHeight),pixels=new Uint8Array(7*7*4);
      const geometry=new THREE.SphereGeometry(.16,8,6),material=new THREE.MeshBasicMaterial({color:'#ff00ff',toneMapped:false,fog:false}),marker=new THREE.Mesh(geometry,material);scene.add(marker);
      const portrait=innerWidth<innerHeight,angle=(portrait?40:28)*Math.PI/180,distance=portrait?21:15,result=[];
      try{
        for(let lod=0;lod<3;lod++)for(const direction of [-1,1])for(const x of [-21,0,21])for(const z of [-13,0,13])for(const y of [.2,1.25,2.5]){
          camera.position.set(x,distance*Math.sin(angle),z+direction*distance*Math.cos(angle));camera.lookAt(x,0,z);camera.updateMatrixWorld();stadium.setLOD(lod);stadium.update(camera,0,{autoLOD:false,reducedMotion:true});marker.position.set(x,y,z);
          r.renderer.setRenderTarget(target);r.renderer.render(scene,camera);
          const projected=marker.position.clone().project(camera),px=Math.round((projected.x*.5+.5)*innerWidth),py=Math.round((projected.y*.5+.5)*innerHeight);
          r.renderer.readRenderTargetPixels(target,px-3,py-3,7,7,pixels);r.renderer.setRenderTarget(null);
          let visible=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]>190&&pixels[i+1]<50&&pixels[i+2]>190)visible++;
          result.push({lod,direction,x,z,y,visible});
        }
      }finally{r.renderer.setRenderTarget(null);stadium.dispose();geometry.dispose();material.dispose();target.dispose();r.render(0);}
      return result;
    });
    for(const result of results){
      rows.push([width,height,result.lod,result.direction,result.x,result.z,result.y,result.visible].join(','));
      if(!result.visible)failures.push(`${width}x${height} LOD${result.lod} dir${result.direction} (${result.x},${result.z}) height${result.y}: probe hidden`);
    }
    console.log(`${width}x${height}: ${results.length} game-camera visibility probes; ${results.filter(r=>!r.visible).length} hidden`);await page.close();
  }
}finally{await browser.close();}
await fs.writeFile(path.join(out,'game-fit.csv'),rows.join('\n')+'\n');
await fs.writeFile(path.join(out,'game-fit.txt'),`48x30 integration camera probes: ${rows.length-1}\n`+(failures.length?failures.join('\n'):'PASS: every feet/torso/head probe remains visible through the stadium geometry.')+'\n');
if(failures.length)throw new Error(`${failures.length} game integration sightline failures`);
