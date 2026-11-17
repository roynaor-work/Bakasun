// Build a single, offline HTML document. Requires three and esbuild available to Node.
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);
const require = createRequire(import.meta.url);
const toolchain = process.env.COACH_NODE_MODULES || '/tmp/coach-tools/node_modules';
let esbuild;
try { esbuild = require('esbuild'); }
catch { esbuild = require(join(toolchain,'esbuild')); }
const result = await esbuild.build({entryPoints:[join(here,'preview.mjs')], bundle:true, minify:true, write:false, format:'iife', platform:'browser', target:['es2020'], nodePaths:[toolchain]});
const template = await readFile(join(here,'preview-template.html'),'utf8');
const glb = await readFile(join(root,'coach.glb'));
const script = result.outputFiles[0].text.replaceAll('</script','<\\/script');
const html = template.replace('__GLB_BASE64__',glb.toString('base64')).replace('__BUNDLED_SCRIPT__',() => script).replace(/[ \t]+$/gm,'');
await writeFile(join(root,'preview.html'),html);
console.log(`Built preview.html (${Buffer.byteLength(html)} bytes)`);
