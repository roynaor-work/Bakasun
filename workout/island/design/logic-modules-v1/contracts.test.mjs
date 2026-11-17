import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('.', import.meta.url));
const modules = ['soccer-motion-statemachine', 'fire-spread-model', 'runner-course-generator'];

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  }));
  return nested.flat();
}

for (const name of modules) {
  test(`${name}: runtime imports stay inside its own src directory`, async () => {
    const src = join(root, name, 'src');
    const sources = await files(src);
    assert(sources.length > 0);
    for (const path of sources) {
      assert.match(path, /\.(?:mjs|js|json)$/u, `Unexpected runtime file: ${path}`);
      if (path.endsWith('.json')) continue;
      const code = await readFile(path, 'utf8');
      // Dependency declarations, including re-exports and literal dynamic imports.
      const declarations = code.matchAll(/^\s*(?:import|export)\s+(?:\*\s*(?:as\s+\w+\s*)?|\{[^}]*\}|[\w$]+(?:\s*,\s*(?:\*\s+as\s+\w+|\{[^}]*\}))?)\s+from\s*["']([^"']+)["']/gmu);
      const directImports = code.matchAll(/^\s*import\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']/gmu);
      const specifiers = [...declarations].map(match => match[1]).concat([...directImports].map(match => match[1] || match[2]));
      for (const specifier of specifiers) {
        assert(specifier.startsWith('./') || specifier.startsWith('../'), `${path}: ${specifier}`);
        const target = resolve(path, '..', specifier);
        const local = relative(src, target);
        assert(local && !local.startsWith('..'), `${path}: import escapes module src`);
        assert(sources.includes(target), `${path}: missing import ${specifier}`);
      }
      assert.doesNotMatch(code, /\b(?:require\s*\(|WebAssembly\s*\.|fetch\s*\()/u, path);
      assert.doesNotMatch(code, /\b(?:Math\s*\.\s*random\s*\(|Date\s*\.\s*now\s*\(|performance\s*\.\s*now\s*\()/u, path);
    }
  });

  test(`${name}: src works outside the repository without package.json or dependencies`, async () => {
    const temporary = await mkdtemp(join(tmpdir(), 'logic-module-v1-'));
    try {
      await cp(join(root, name, 'src'), join(temporary, 'src'), { recursive: true });
      const probe = [
        'Math.random = () => { throw new Error("Unseeded randomness"); };',
        'Date.now = () => { throw new Error("Ambient clock"); };',
        'const api = await import("./src/index.mjs");',
        'if (!("API_VERSION" in api)) throw new Error("Missing API_VERSION");',
        'if (!Object.values(api).some(value => typeof value === "function")) throw new Error("Missing callable API");',
        'process.stdout.write("isolated-import-ok");',
      ].join('\n');
      const result = spawnSync(process.execPath, ['--input-type=module', '-e', probe], {
        cwd: temporary,
        encoding: 'utf8',
        timeout: 30_000,
        env: { ...process.env, NODE_PATH: '', NODE_OPTIONS: '' },
      });
      assert.equal(result.status, 0, result.stderr || String(result.error));
      assert.equal(result.stdout, 'isolated-import-ok');
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });
}
