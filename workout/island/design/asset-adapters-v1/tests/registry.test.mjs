import test from 'node:test';
import assert from 'node:assert/strict';
import {createRegistry,loadAdapter} from '../src/index.mjs';

test('registry imports only the selected adapter and forwards host options', async () => {
  let imported = 0;
  const options = {marker: true};
  const adapter = {load:async()=>true, ready:()=>true, get:()=>42, dispose(){}};
  const load = createRegistry({chosen:async()=>{imported++;return {create(received){assert.equal(received,options);return adapter;}};}, other:()=>{throw new Error('unrequested');}});
  assert.equal(imported,0);
  assert.equal(await load('chosen',options),adapter);
  assert.equal(imported,1);
});

test('missing/broken module, factory and asset failures all return legacy API', async () => {
  for (const loaders of [{}, {broken:async()=>{throw new Error('missing module');}}, {broken:async()=>({create(){throw new Error('factory failure');}})}, {broken:async()=>({create:()=>({})})}, {broken:async()=>({create:()=>({load:async()=>false,ready:()=>false,get(){},dispose(){}})})}]) {
    const adapter = await createRegistry(loaders)('broken');
    assert.equal(await adapter.load(),false);
    assert.equal(adapter.ready(),false);
    const legacy={existing:true};
    assert.equal(adapter.get('model',legacy),legacy);
    assert.doesNotThrow(()=>adapter.dispose());
  }
  assert.equal((await loadAdapter('__proto__')).ready(),false);
});

test('failed adapter cleanup rejection also remains silent', async () => {
  const adapter=await createRegistry({broken:async()=>({create:()=>({load:async()=>{throw new Error('failure');},ready:()=>false,get(){},async dispose(){throw new Error('cleanup failure');}})})})('broken');
  assert.equal(adapter.ready(),false);
});
