/** CC0-1.0. esbuild is installed outside this package, never shipped. */
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const cwd=fileURLToPath(new URL('../',import.meta.url));
execFileSync(process.env.AVATAR_ESBUILD||'esbuild',[
  'preview.mjs','--bundle','--minify','--format=iife',
  '--alias:three=./vendor/three.module.js','--outfile=preview.bundle.js',
],{cwd,stdio:'inherit'});
// Three.js embeds GLSL template literals. Remove insignificant trailing shader
// whitespace so the generated deliverable also passes git diff --check.
const target=new URL('../preview.bundle.js',import.meta.url);
writeFileSync(target,readFileSync(target,'utf8').replace(/[\t ]+(?=\r?\n)/g,''));
