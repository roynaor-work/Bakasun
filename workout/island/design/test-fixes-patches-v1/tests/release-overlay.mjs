import fs from 'node:fs';
import {registerHooks, syncBuiltinESMExports} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const island = path.resolve('workout/island') + path.sep;
const readFile = fs.promises.readFile.bind(fs.promises);
const current = JSON.parse(await readFile(path.join(island, 'release.json'), 'utf8')).version;
const future = process.env.PATCH_TEST_VERSION;
const staleFiles = new Set(['minigames/racing-pit.mjs', 'minigames/tennis-v12-stadium.mjs']);

function overlay(file, text) {
  if (!file.startsWith(island) || !/\.(mjs|js|html|css|json)$/.test(file)) return text;
  const rewritten = text.replaceAll(current, future);
  if (process.env.PATCH_TEST_STALE === '1' && staleFiles.has(file.slice(island.length))) {
    return rewritten.replace('?v=' + future, '?v=' + current);
  }
  return rewritten;
}

// Cover filesystem assertions and separately the release module imported by the runtime.
fs.promises.readFile = async (input, ...args) => {
  const value = await readFile(input, ...args);
  const file = input instanceof URL ? fileURLToPath(input) : typeof input === 'string' ? path.resolve(input) : '';
  return typeof value === 'string' ? overlay(file, value) : value;
};
syncBuiltinESMExports();
registerHooks({
  load(url, context, next) {
    const result = next(url, context);
    if (!url.startsWith('file:') || result.format !== 'module' || result.source == null) return result;
    return {...result, source:overlay(fileURLToPath(url), result.source.toString())};
  },
});
