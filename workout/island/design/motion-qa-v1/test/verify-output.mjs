// SPDX-License-Identifier: CC0-1.0
// Load every generated artifact and every recorded immutable source byte stream.
import assert from 'node:assert/strict';
import {readFile,readdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseGLB} from '../glb.mjs';

const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
async function walk(directory) {
  const files=[];
  for(const entry of await readdir(directory,{withFileTypes:true})) {
    if(entry.name==='.cache')continue;
    const target=path.join(directory,entry.name);
    if(entry.isDirectory())files.push(...await walk(target));else files.push(target);
  }
  return files;
}
function assertFinite(value,context) {
  if(typeof value==='number')assert.ok(Number.isFinite(value),`${context}: nonfinite number`);
  else if(value&&typeof value==='object')for(const [key,item]of Object.entries(value))assertFinite(item,`${context}.${key}`);
}
export async function verifyOutput(out=path.join(base,'output')) {
  out=path.resolve(out);
  const report=JSON.parse(await readFile(path.join(out,'report.json'),'utf8'));
  assert.ok(report.libraries.length>0,'No libraries were reported');
  const allClips=report.libraries.flatMap(library=>library.clips);
  assert.ok(allClips.length>0,'No clips were reported');
  let loaded=0,links=0,sources=0;
  const artifactSet=new Set();
  for(const library of report.libraries) {
    assert.equal(new Set(library.clips.map(c=>c.id)).size,library.clips.length,`${library.id}: duplicate clip ids`);
    assert.equal(library.summary.count,library.clips.length,`${library.id}: summary count mismatch`);
    for(const clip of library.clips) {
      assert.ok(clip.score>=0&&clip.score<=100,`${clip.id}: score outside 0..100`);
      assert.ok(clip.coverage>=0&&clip.coverage<=1,`${clip.id}: coverage outside 0..1`);
      for(const key of ['htmlPath','jsonPath','sheetPath']) {
        assert.ok(clip[key],`${clip.id}: missing ${key}`);
        const target=path.resolve(out,clip[key]);
        assert.ok(target.startsWith(out+path.sep),'Artifact path escapes output directory');
        assert.ok(!artifactSet.has(target),'Duplicate artifact filename');artifactSet.add(target);
        assert.ok((await stat(target)).size>0,`${clip.id}: empty ${key}`);
      }
      const detail=JSON.parse(await readFile(path.join(out,clip.jsonPath),'utf8'));
      assert.equal(detail.id,clip.id);
      assert.equal(detail.score,clip.score);
      assert.equal(detail.frames.length,8,`${clip.id}: expected eight viewer frames`);
      assertFinite(detail,clip.id);
      for(const [id,definition]of Object.entries(report.metricDefinitions)) {
        const metric=detail.metrics[id];assert.ok(metric,`${clip.id}: missing ${id}`);
        assert.ok(['green','yellow','red','not-applicable','insufficient-data'].includes(metric.status));
        if(metric.value===null)assert.ok(['not-applicable','insufficient-data'].includes(metric.status));
        else assert.ok(Number.isFinite(metric.value)&&definition.description);
      }
    }
    for(const source of library.sources??[]) {
      const bytes=await readFile(path.join(base,'.cache',source.commit,source.path));
      assert.equal(bytes.length,source.bytes,`${source.path}: byte count changed`);
      assert.equal(createHash('sha256').update(bytes).digest('hex'),source.sha256,`${source.path}: source hash changed`);
      if(source.path.endsWith('.glb'))parseGLB(bytes);
      if(/\.json(?:\.gz)?$/.test(source.path))JSON.parse((source.path.endsWith('.gz')?gunzipSync(bytes):bytes).toString('utf8'));
      sources++;
    }
  }
  for(const file of await walk(out)) {
    const content=await readFile(file,'utf8');loaded++;
    if(file.endsWith('.json'))assertFinite(JSON.parse(content),file);
    else if(file.endsWith('.svg')) {
      assert.match(content,/^<svg\b/);assert.match(content,/<\/svg>\s*$/);
      assert.equal((content.match(/\/ 8 ·/g)??[]).length,8,`${file}: sheet frame count`);
      assert.doesNotMatch(content,/<script\b|(?:NaN|Infinity)/);
    }else if(file.endsWith('.html')) {
      assert.match(content,/<!doctype html>/i);
      for(const match of content.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
        const href=match[1].replaceAll('&amp;','&');
        if(/^(?:#|data:|https?:|mailto:)/.test(href))continue;
        const pathname=decodeURIComponent(href.split(/[?#]/)[0]);
        if(!pathname)continue;
        const target=path.resolve(path.dirname(file),pathname);
        assert.ok((await stat(target)).isFile(),`${file}: broken local link ${href}`);links++;
      }
    }else throw new Error(`Unexpected generated artifact ${file}`);
  }
  const license=await readFile(path.join(base,'LICENSES.md'),'utf8');let loadedPackageFiles=0;
  for(const file of await walk(base)){const rel=path.relative(base,file);await readFile(file);assert.ok(license.includes(`| ${rel} |`),`Missing per-file license: ${rel}`);loadedPackageFiles++;}
  return {loadedPackageFiles,libraries:report.libraries.length,clips:allClips.length,loadedArtifacts:loaded,localLinks:links,verifiedSources:sources};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  verifyOutput(process.argv[2]).then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(error.stack);process.exitCode=1;});
}
