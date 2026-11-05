// Project the complete district bounds through the exact recorded camera and
// view offset. Close views intentionally inspect a sector; overview must fit.
import fs from'node:fs/promises';import path from'node:path';import{fileURLToPath}from'node:url';import{createRequire}from'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire('/tmp/fire-v7-tools/package.json'),THREE=require('three');
const round=process.argv[2]||'11',captures=JSON.parse(await fs.readFile(path.join(root,'iterations',round,'capture.json'),'utf8'));
const report={generatedAt:new Date().toISOString(),round,bounds:{min:[-21,-.775,-11],max:[21,9.2,11]},views:[]};
for(const shot of captures.captures.filter(s=>s.camera==='far')){
 const{width:w,height:h}=shot.viewport,narrow=w/h<.8,landscape=w>h&&h<540;
 const camera=new THREE.PerspectiveCamera(42,w/h,.08,420);camera.position.fromArray(shot.cameraPosition);camera.lookAt(new THREE.Vector3(...shot.target));
 camera.setViewOffset(w,h,landscape?Math.round(w*.18):0,Math.round(h*(narrow?.095:landscape?.015:.11)),w,h);camera.updateMatrixWorld(true);
 const points=[];for(const x of[-21,21])for(const y of[-.775,9.2])for(const z of[-11,11])points.push(new THREE.Vector3(x,y,z).project(camera));
 const view={viewport:shot.viewport,cameraPosition:shot.cameraPosition,minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),minY:Math.min(...points.map(p=>p.y)),maxY:Math.max(...points.map(p=>p.y))};
 view.passed=view.minX>=-.95&&view.maxX<=.95&&view.minY>=-.95&&view.maxY<=.95;report.views.push(view);
}
report.passed=report.views.length===2&&report.views.every(v=>v.passed);await fs.writeFile(path.join(root,'verification/framing.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
