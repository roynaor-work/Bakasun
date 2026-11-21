import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

export const {version: releaseVersion} = JSON.parse(await readFile(new URL('../../workout/island/release.json',import.meta.url),'utf8'));
assert.ok(typeof releaseVersion==='string' && releaseVersion.trim(), 'release.json has a version');

export function assertReleaseReference(source, resource, file = resource) {
  const escaped = resource.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const versions = [...source.matchAll(new RegExp(escaped + '\\?v=([\\w.-]+)', 'g'))];
  assert.ok(versions.length > 0, `${file} must reference ${resource} with a version`);
  for (const [,tag] of versions) assert.equal(tag,releaseVersion,`${file} → ${resource}`);
}

export function assertReleaseTags(source, file, {required = true} = {}) {
  const tags = [...source.matchAll(/[?&]v=([\w.-]+)/g)];
  if (required) assert.ok(tags.length > 0, `${file} must contain a versioned URL`);
  for (const [,tag] of tags) assert.equal(tag,releaseVersion,file);
}
