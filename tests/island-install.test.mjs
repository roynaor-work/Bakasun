import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../workout/island/', import.meta.url);
test('island install metadata and every icon stay relative to the published island', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.webmanifest', root), 'utf8'));
  for (const key of ['name','short_name']) assert.equal(manifest[key], 'האי שלי');
  for (const key of ['id','start_url','scope']) assert.equal(manifest[key], './');
  for (const [key,value] of Object.entries({ display:'fullscreen',dir:'rtl',lang:'he',orientation:'landscape',theme_color:'#edf7f5',background_color:'#edf7f5' })) assert.equal(manifest[key],value);
  assert.deepEqual(manifest.icons.map(i=>[i.sizes,i.purpose]), [['any','any'],['192x192','any'],['512x512','any'],['512x512','maskable']]);
  assert.deepEqual(manifest.icons[0],{src:'./assets/icons/island.svg',sizes:'any',type:'image/svg+xml',purpose:'any'});
  for (const icon of [...manifest.icons.filter(i=>i.type==='image/png'),{src:'./assets/icons/apple-touch-icon.png',sizes:'180x180',type:'image/png'}]) {
    assert.match(icon.src,/^\.\/assets\/icons\/[\w-]+\.png$/);
    const target = new URL(icon.src,root);
    assert.ok(target.href.startsWith(root.href));
    const png = await readFile(target);
    assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    assert.equal(png.subarray(12,16).toString(),'IHDR');
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`,icon.sizes);
    assert.equal(icon.type,'image/png');
  }
  const html = await readFile(new URL('index.html',root),'utf8');
  assert.match(html, /rel="manifest" href="\.\/manifest.webmanifest"/);
  assert.match(html, /rel="apple-touch-icon" sizes="180x180" href="\.\/assets\/icons\/apple-touch-icon.png"/);
  assert.match(html, /rel="icon" type="image\/svg\+xml" href="\.\/assets\/icons\/island.svg"/);
  const svg = await readFile(new URL('assets/icons/island.svg',root),'utf8');
  assert.doesNotMatch(svg, /<text\b|(?:href|src)\s*=\s*["'](?:https?:|\/)/i);
});
