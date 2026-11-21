import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import test from 'node:test';

const root=process.env.ISLAND_PATCH_CHECKOUT;
const island='workout/island/';
const {parse}=createRequire(import.meta.url)('internal/deps/acorn/acorn/dist/acorn');
const catalog=JSON.parse(readFileSync(join(root,island,'data/strings.he.json'),'utf8'));
const excluded=new Set(['assets','design','lib','notes','tests','tools','vendor','verification']);
const files=execFileSync('git',['-C',root,'ls-files','-z',':(glob)workout/island/**/*.js',':(glob)workout/island/**/*.mjs'],{encoding:'utf8'}).split('\0')
  .filter(file=>/\.(?:mjs|js)$/.test(file)&&!file.slice(island.length).split('/').slice(0,-1).some(part=>excluded.has(part)));

function visit(node,callback){
  if(!node||typeof node.type!=='string')return;
  callback(node);
  for(const child of Object.values(node)){
    if(Array.isArray(child))child.forEach(item=>visit(item,callback));
    else if(child?.type)visit(child,callback);
  }
}

const readText=node=>node.type==='Literal'&&typeof node.value==='string'?node.value:
  node.type==='TemplateElement'?(node.value.cooked??node.value.raw):null;

test('own Island scripts preserve lookup keys and contain no Arabic script or exclamation in text',()=>{
  const missing=new Set(), violations=[];
  for(const file of files){
    const source=readFileSync(join(root,file),'utf8');
    const ast=parse(source,{ecmaVersion:'latest',sourceType:'module',locations:true});
    visit(ast,node=>{
      const text=readText(node);
      if(text!==null){
        // Ignore CSS priority declarations and the GLSL comparison operator.
        let display=text.replace(/!\s*important\b/gi,'');
        if(/^\s*#ifdef\b/.test(display))display=display.replaceAll('!=','');
        if(/[!！﹗❗❕‼⁉]|\p{Script_Extensions=Arabic}/u.test(display)){
          violations.push(`${file}:${node.loc.start.line} ${JSON.stringify(display)}`);
        }
      }
      if(node.type!=='CallExpression')return;
      const callee=node.callee;
      if(callee.name!=='t'&&callee.property?.name!=='t')return;
      const key=node.arguments[0]?.value;
      if(typeof key==='string'&&/^[A-Za-z][\w-]*(?:\.[\w-]+)+$/.test(key)&&!Object.hasOwn(catalog,key)){
        missing.add(`${file}: ${key}`);
      }
    });
  }
  assert.deepEqual(violations,[]);
  assert.deepEqual([...missing],[]);
  console.log(`Checked ${files.length} JavaScript modules.`);
});
