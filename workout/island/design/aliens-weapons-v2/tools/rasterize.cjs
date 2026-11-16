// Build-only dependency: sharp. No packages or network are needed in the preview.
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
(async () => {
  for (const folder of ['src', 'icons']) {
    for (const file of (await fs.readdir(path.join(root, folder))).filter(f => f.endsWith('.svg')).sort()) {
      const output = folder === 'src'
        ? path.join(root, 'atlases', file.replace('-atlas.svg', '.png'))
        : path.join(root, 'icons', file.replace('.svg', '.png'));
      const { data, info } = await sharp(path.join(root, folder, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      // Clear hidden RGB so subsequent atlas filtering cannot reveal matte colors.
      for (let i = 0; i < data.length; i += 4) if (!data[i + 3]) data.fill(0, i, i + 3);
      await sharp(data, { raw: info }).png({ compressionLevel: 9 }).toFile(output);
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
