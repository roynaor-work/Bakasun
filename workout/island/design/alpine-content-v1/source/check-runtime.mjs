// CC0. Exercises discontinuities and cleanup without a browser or WebGL context.
import * as T from '../../../vendor/three.module.js';
import {createAlpineEffects} from '../effects/runtime.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const scene=new T.Scene(),texture=new T.Texture(),fx=createAlpineEffects(T,{scene,particleTexture:texture,trailTexture:texture});
fx.setIntensity(2);
for(let i=0;i<100;i++)fx.update(1/60,{moving:true,position:{x:0,y:.5,z:-i*.1},leftSki:{x:-.2,y:.5,z:-i*.1},rightSki:{x:.2,y:.5,z:-i*.1}});
assert.equal(scene.children.length,2);assert.ok(fx.stats().particles>0);assert.ok(fx.stats().trailSegments<=56);
for(const child of scene.children){const values=child.geometry.attributes.position.array;assert.ok(values.every(Number.isFinite));}
fx.update(1/60,{moving:true,position:{x:0,y:.5,z:-50},leftSki:{x:-.2,y:.5,z:-50},rightSki:{x:.2,y:.5,z:-50}});assert.equal(fx.stats().trailSegments,0,'teleport must not create a long bridge in the trail');
fx.setIntensity(0);assert.ok(fx.stats().particles<=24);assert.equal(fx.stats().cap,24);
fx.update(1e6,{});assert.ok(fx.stats().particles>0,'long frame must be clamped');
fx.reset();assert.equal(fx.stats().particles,0);assert.equal(fx.stats().trailSegments,0);
fx.update(NaN,{});fx.update(-1,{});assert.equal(fx.stats().particles,0);
let textureDisposed=false;texture.addEventListener('dispose',()=>{textureDisposed=true;});
fx.dispose();fx.dispose();fx.update(.1,{});assert.equal(scene.children.length,0);assert.equal(fx.stats().disposed,true);assert.equal(textureDisposed,false,'caller owns shared textures');
const result={passed:true,checks:['finite positions on raised ground','bounded particles and trails','teleport resets the trail','lower intensity immediately respects cap','large dt is clamped','reset clears all history','NaN and negative dt do not create particles','double disposal is safe','post-disposal update is safe','caller retains shared texture ownership']};
await fs.writeFile(new URL('../verification/runtime-contract.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
