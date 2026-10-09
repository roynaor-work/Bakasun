import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { replayRecording } from '../workout/cam-lab/recording.mjs';

// Optional real-motion corpus kept on the user's device, never in this public
// repository. A manifest records the observer's counts, separately from poses.
const directory = process.env.CAM_LAB_RECORDINGS_DIR;
if (directory) {
  const manifest = JSON.parse(await readFile(resolve(directory, 'manifest.json'), 'utf8'));
  assert.ok(Array.isArray(manifest) && manifest.length > 0, 'נדרשת רשימת הקלטות וציפיות');
  for (const entry of manifest) {
    assert.equal(entry.file, basename(entry.file), 'שם קובץ ללא נתיב');
    test(`real skeleton recording: ${entry.file}`, async () => {
      const recording = JSON.parse(await readFile(resolve(directory, entry.file), 'utf8'));
      const results = replayRecording(recording);
      assert.deepEqual(results.map(r => r.counted), entry.counted);
      if (entry.rejected) assert.deepEqual(results.map(r => r.rejected), entry.rejected);
    });
  }
}
