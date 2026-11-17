#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export function calibratePolicy(manifest,config) {
  config.projection={referenceViewportHeightPx:390,verticalFovDegrees:38,maxSurfaceErrorPixels:[0,3,1.5],bound:'D >= 2R + focalPixels * measuredHausdorffUpper / allowedPixels',compensatedForHysteresis:true,scope:'Camera centred on the bounding sphere; original GLB scale; rest/default-morph surfaces in all scenes. Animated intervals are separate. Recompute for off-centre views, instance scale, viewport height or FOV changes; this is not an animation-wide or shading-error bound.'};
  const focal=config.projection.referenceViewportHeightPx/(2*Math.tan(config.projection.verticalFovDegrees*Math.PI/360));
  config.assets={};
  for(const asset of manifest.assets) {
    const measurements=asset.variants.map(v=>v.scenes.map(s=>s.hausdorff));
    const errors=measurements.map(list=>Math.max(...list.map(h=>h.upperMetres)));
    const radius=Math.max(...measurements.flatMap(list=>list.map(h=>h.diagonalMetres/2+h.upperMetres)));
    const minimum=config.profiles[asset.profile].enterMetres;
    const retention=1-config.hysteresisFraction;
    const near=Math.ceil(Math.max(minimum[1],(2*radius+focal*errors[0]/config.projection.maxSurfaceErrorPixels[1])/retention));
    const far=Math.ceil(Math.max(minimum[2],near*1.5,(2*radius+focal*errors[1]/config.projection.maxSurfaceErrorPixels[2])/retention));
    const policy={profile:asset.profile,enterMetres:[0,near,far],measuredErrorUpperMetres:errors,boundingRadiusMetres:radius,referencePixelLimits:[3,1.5]};
    config.assets[asset.id]=policy;asset.distancePolicy=policy;
  }
  return {manifest,config};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const root=fileURLToPath(new URL('../',import.meta.url));
  const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8')),config=JSON.parse(await fs.readFile(path.join(root,'lod-config.json'),'utf8'));
  calibratePolicy(manifest,config);
  await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest)+'\n');
  await fs.writeFile(path.join(root,'lod-config.json'),JSON.stringify(config,null,2)+'\n');
  console.log('Calibrated '+manifest.assets.length+' per-asset distance policies');
}
