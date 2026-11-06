/** Bake the PBR environment once; never run PMREM work on the phone. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {packageServer} from './serve.mjs';
const req=createRequire(path.join(process.env.HOOPS_AUTHORING_MODULES||'/tmp/hoops-authoring/node_modules','anchor.cjs'));
const {chromium}=req('playwright');const server=packageServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
  const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port+'/preview.html?capture=1');await page.waitForFunction(()=>window.arenaReady);
  const data=await page.evaluate(async()=>{
    const THREE=await import('./runtime/vendor/three.module.js');const {createCeilingCube}=await import('./source/ceiling.mjs');
    const cube=createCeilingCube();const generator=new THREE.PMREMGenerator(arenaPreview.renderer);const target=generator.fromCubemap(cube);
    const {width,height}=target;const half=new Uint16Array(width*height*4);arenaPreview.renderer.readRenderTargetPixels(target,0,0,width,height,half);
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const x=canvas.getContext('2d');const img=x.createImageData(width,height);
    for(let i=0;i<half.length;i++)img.data[i]=i%4===3?255:Math.round(255*Math.max(0,Math.min(1,THREE.DataUtils.fromHalfFloat(half[i]))));
    x.putImageData(img,0,0);const data=canvas.toDataURL('image/png').split(',')[1];target.dispose();cube.dispose();generator.dispose();return data;
  });
  const output=fileURLToPath(new URL('../runtime/ceiling.webp',import.meta.url));const png=output+'.tmp.png';await fs.writeFile(png,Buffer.from(data,'base64'));
  const conversion=spawnSync('python3',['-c',"from PIL import Image;import sys;Image.open(sys.argv[1]).convert('RGB').save(sys.argv[2],lossless=True,method=6)",png,output],{encoding:'utf8'});if(conversion.status)throw Error(conversion.stderr);await fs.unlink(png);console.log('Baked CubeUV:',(await fs.stat(output)).size,'bytes');
} finally {await browser.close();await new Promise(r=>server.close(r));}
