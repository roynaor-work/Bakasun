export const island = 'workout/island';
export const offlinePath = `${island}/offline-manifest.json`;
export const creditsPath = `${island}/ASSETS.md`;

export function offlineWithPacks(baseline, packs) {
  const manifest = structuredClone(baseline);
  if (manifest.schema !== 2) throw new Error('Expected offline manifest schema 2');

  for (const { id, bucket, files } of packs) {
    const list = bucket === 'core' ? manifest.core : (manifest.games[bucket] ??= []);
    for (const [name, [sha256, bytes]] of Object.entries(files)) {
      const path = `assets/${id}/${name}`;
      if (Object.hasOwn(manifest.files, path)) throw new Error(`Already registered: ${path}`);
      list.push(path);
      manifest.files[path] = [sha256.slice(0, 16), bytes];
    }
  }

  for (const list of [manifest.core, manifest.shell, ...Object.values(manifest.games)]) list.sort();
  manifest.files = Object.fromEntries(Object.keys(manifest.files).sort().map(path => [path, manifest.files[path]]));
  return JSON.stringify(manifest, null, 1) + '\n';
}

export function creditsWithPacks(baseline, packs) {
  const blocks = packs.map(({ id, sourceCommit, sourceRoot, licenses, attribution }) => {
    const notices = licenses.map(name => `[${name}](assets/${id}/${name})`).join(' · ');
    const source = `https://github.com/roynaor-work/Bakasun/tree/${sourceCommit}/${sourceRoot}`;
    return `\n## ${id}\n\n${attribution} ${notices} · [מקור](${source})\n`;
  });
  return baseline + blocks.join('');
}
