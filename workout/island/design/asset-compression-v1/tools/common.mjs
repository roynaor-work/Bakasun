import {readFile, writeFile, mkdir, readdir, realpath, lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const ISLAND = path.resolve(ROOT, '../..');
export const REPO = path.resolve(ISLAND, '../..');
export const TARGETS = new Set(['.glb', '.png', '.jpg', '.jpeg', '.webp', '.ogg', '.mp3', '.json']);
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const mb = bytes => (bytes / 1e6).toFixed(3);
export const slash = p => p.split(path.sep).join('/');
export const unique = values => [...new Set(values)];
export async function save(file, bytes) {
  await mkdir(path.dirname(file), {recursive:true});
  await writeFile(file, bytes);
}
export const saveJSON = (file, data) => save(file, JSON.stringify(data, null, 2) + '\n');

// All destinations stay inside this new package, including through symlinks.
export async function safeOutput(name = 'compressed') {
  const result = path.resolve(ROOT, name);
  if (!result.startsWith(ROOT) || result === ROOT.slice(0,-1)) throw Error('Output must be inside asset-compression-v1');
  let cursor = result;
  while (cursor.startsWith(ROOT)) {
    try { if ((await lstat(cursor)).isSymbolicLink()) throw Error(`Symlink output refused: ${cursor}`); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    cursor = path.dirname(cursor);
  }
  await mkdir(result, {recursive:true});
  if (!(await realpath(result)).startsWith(await realpath(ROOT))) throw Error('Output escaped package');
  return result;
}
export async function sourcePath(relative) {
  if (path.isAbsolute(relative) || relative.includes('\\')) throw Error(`Unsafe asset: ${relative}`);
  const result = path.resolve(ISLAND, relative || 'index.html');
  if (!result.startsWith(ISLAND + path.sep)) throw Error(`Asset escaped island: ${relative}`);
  const resolved = await realpath(result);
  if (!resolved.startsWith(ISLAND + path.sep)) throw Error(`Asset symlink escaped island: ${relative}`);
  if (!(await lstat(result)).isFile()) throw Error(`Not a file: ${relative}`);
  return result;
}
export async function walk(directory) {
  const result = [];
  for (const entry of (await readdir(directory, {withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name,'en'))) {
    const file = path.join(directory, entry.name);
    if (file === ROOT.slice(0,-1) || ['node_modules','.git','.work'].includes(entry.name)) continue;
    if (entry.isSymbolicLink()) throw Error(`Source symlink refused: ${file}`);
    if (entry.isDirectory()) result.push(...await walk(file));
    else if (entry.isFile()) result.push(file);
  }
  return result;
}
export function parseGLB(bytes) {
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw Error('Invalid GLB header');
  let json, bin = Buffer.alloc(0);
  for (let offset=12; offset<bytes.length;) {
    const length=bytes.readUInt32LE(offset), type=bytes.readUInt32LE(offset+4);
    if (offset+8+length>bytes.length) throw Error('Truncated GLB chunk');
    const chunk=bytes.subarray(offset+8,offset+8+length);
    if (type===0x4e4f534a) json=JSON.parse(chunk.toString());
    else if (type===0x004e4942) bin=chunk;
    else throw Error('Unknown GLB chunk; preserve original');
    offset+=8+length;
  }
  if (!json) throw Error('GLB has no JSON');
  return {json,bin};
}
export function buildGLB(json,binary) {
  const j=Buffer.from(JSON.stringify(json)),jp=(4-j.length%4)%4,bp=(4-binary.length%4)%4,out=Buffer.alloc(28+j.length+jp+binary.length+bp);
  out.writeUInt32LE(0x46546c67);out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(j.length+jp,12);out.writeUInt32LE(0x4e4f534a,16);j.copy(out,20);out.fill(32,20+j.length,20+j.length+jp);
  const offset=20+j.length+jp;out.writeUInt32LE(binary.length+bp,offset);out.writeUInt32LE(0x004e4942,offset+4);binary.copy(out,offset+8);return out;
}
export function resolveDependency(source,uri) {
  // Match the production LoadingManager remaps in athlete-body-v2.mjs:114-116
  // and hoops-body-v2.mjs:17-20. These four models intentionally share v22.
  if (/^assets\/(soccer-v24|hoops-v241)\/body\/models\//.test(source)&&uri==='../textures/athlete-atlas.png') return 'assets/athlete-body-v22/textures/athlete-atlas.png';
  return slash(path.normalize(path.join(path.dirname(source),decodeURIComponent(uri))));
}
export async function readOffline() {
  const bytes=await readFile(path.join(ISLAND,'offline-manifest.json'));
  const manifest=JSON.parse(bytes);
  const groups={core:manifest.core.map(p=>p||'index.html'),shell:manifest.shell.map(p=>p||'index.html'),...manifest.games};
  const direct=unique(Object.values(groups).flat()).sort();
  const dependencies={};
  for (const p of direct) {
    const file=await sourcePath(p);
    if (!p.endsWith('.glb')) continue;
    const {json}=parseGLB(await readFile(file));
    dependencies[p]=[];
    for (const item of [...json.images||[],...json.buffers||[]]) {
      if (!item.uri || item.uri.startsWith('data:')) continue;
      if (/^[a-z]+:/i.test(item.uri) || /[?#]/.test(item.uri)) throw Error(`Nonlocal GLB dependency: ${p}: ${item.uri}`);
      const dep=resolveDependency(p,item.uri);
      await sourcePath(dep);
      dependencies[p].push(dep);
    }
  }
  const close=list=>unique(list.flatMap(p=>[p,...dependencies[p]||[]])).sort();
  return {manifest,groups,direct,dependencies,close,paths:close(direct),sha256:sha256(bytes)};
}
