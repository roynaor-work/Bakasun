// Inventory all LOD buffers and estimate RGBA8 texture storage, not total GPU memory.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE||'/opt/codex/cua_node/lib/node_modules/playwright/index.mjs'));
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),base=process.argv[2]||'http://127.0.0.1:8766';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
  await page.goto(base+'/preview.html?capture=1',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
  const report=await page.evaluate(()=>{
    const r=window.stadiumReview;r.stop();
    for(let i=0;i<3;i++){r.setView('main',{lod:i});r.render(0);}r.renderer.getContext().finish();
    const arrays=new Set(),geometries=new Set();let instances=0;
    r.stadium.root.traverse(object=>{
      if(!object.isMesh)return;
      geometries.add(object.geometry);
      if(object.isInstancedMesh){instances+=object.count;arrays.add(object.instanceMatrix.array.buffer);}
    });
    for(const geometry of geometries){
      if(geometry.index)arrays.add(geometry.index.array.buffer);
      for(const attribute of Object.values(geometry.attributes))arrays.add((attribute.isInterleavedBufferAttribute?attribute.data.array:attribute.array).buffer);
    }
    const bytes=[...arrays].reduce((sum,buffer)=>sum+buffer.byteLength,0);
    const textures=r.stadium.textures.map(texture=>({width:texture.image.width,height:texture.image.height,mipmaps:texture.generateMipmaps}));
    let rgbaEstimate=0;
    for(const texture of textures){
      let width=texture.width,height=texture.height;
      while(true){rgbaEstimate+=width*height*4;if(!texture.mipmaps||(width===1&&height===1))break;width=Math.max(1,Math.floor(width/2));height=Math.max(1,Math.floor(height/2));}
    }
    return {bytes,geometryCount:geometries.size,instances,textures,rgbaEstimate,gpu:r.metrics().memory};
  });
  const text=[
    'Resource inventory after rendering each of the three LODs.',
    `Stadium-owned geometry objects (including hidden LODs): ${report.geometryCount}`,
    `All resident instance records, including four halos: ${report.instances}`,
    `Unique decoded geometry/instance ArrayBuffer bytes: ${report.bytes}`,
    `Texture images: ${report.textures.length}`,
    `RGBA8 plus full mip-chain estimate: ${report.rgbaEstimate} bytes`,
    `Renderer geometry / texture objects: ${report.gpu.geometries} / ${report.gpu.textures}`,
    'ArrayBuffer bytes measure CPU-side typed storage only. Texture estimate assumes RGBA8.',
    'These values exclude framebuffer/MSAA/depth, program storage and driver overhead; they are not a measurement of total GPU memory.',
    'Software Chromium, not a physical handset.'
  ].join('\n')+'\n';
  await fs.writeFile(path.join(root,'verification','residency.txt'),text);console.log(text);
}finally{await browser.close();}
