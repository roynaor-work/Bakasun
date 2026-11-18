import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const flow = path.resolve('workout/island/minigames/fire-v24-flow.mjs');
const guard = 'if(flow.inside)return;';
registerHooks({
  load(url, context, next) {
    const result = next(url, context);
    if (!url.startsWith('file:') || fileURLToPath(url) !== flow) return result;
    const source = result.source.toString();
    assert.equal(source.split(guard).length,2,'the test mutation targets the street clock guard');
    return {...result, source:source.replace(guard,'')};
  },
});
