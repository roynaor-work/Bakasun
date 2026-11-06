import {performance} from 'node:perf_hooks';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {SOUND_CATALOG, renderSound} from '../runtime/sports-audio.mjs';

export function measure(samples, sampleRate) {
  let peak = 0, squares = 0, sum = 0, first = -1, last = -1, tailPeak = 0, maxJump = 0;
  const tailStart = samples.length - Math.floor(sampleRate * .002);
  for (let i = 0; i < samples.length; i++) {
    const value = samples[i], magnitude = Math.abs(value);
    if (!Number.isFinite(value)) throw new Error(`Non-finite sample at ${i}`);
    peak = Math.max(peak, magnitude); sum += value; squares += value * value;
    if (magnitude > 1e-5) { if (first < 0) first = i; last = i; }
    if (i >= tailStart) tailPeak = Math.max(tailPeak, magnitude);
    if (i) maxJump = Math.max(maxJump, Math.abs(value - samples[i - 1]));
  }
  return {duration: samples.length / sampleRate, peak, rms: Math.sqrt(squares / samples.length),
    dc: sum / samples.length, audibleDuration: last < 0 ? 0 : (last - first + 1) / sampleRate,
    lastAudibleAt: last < 0 ? 0 : (last + 1) / sampleRate, tailPeak, maxJump};
}

export function measureCatalog(options = {}) {
  return Object.entries(SOUND_CATALOG).map(([name, spec]) => {
    const start = performance.now(), rendered = renderSound(name, options);
    const renderMs = performance.now() - start;
    return {name, spec, ...measure(rendered.samples, rendered.sampleRate), renderMs};
  });
}

export function markdownReport(rows, title = 'PCM measurements') {
  return `# ${title}\n\nMeasured from synthesized Float32 PCM, not from metadata. Peak and RMS are linear full scale. Audible threshold: 0.00001 (−100 dBFS). Tail: final 2 ms. Render time is a local CPU observation, not a phone benchmark.\n\n` +
    '| Sound | Buffer (s) | Last audible (s) | Cap (s) | Peak | RMS | Tail peak | Render (ms) |\n' +
    '|---|---:|---:|---:|---:|---:|---:|---:|\n' + rows.map(row =>
      `| ${row.name} | ${row.duration.toFixed(5)} | ${row.lastAudibleAt.toFixed(5)} | ${row.spec.maxDuration.toFixed(2)} | ${row.peak.toFixed(5)} | ${row.rms.toFixed(5)} | ${row.tailPeak.toExponential(1)} | ${row.renderMs.toFixed(2)} |`).join('\n') + '\n';
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = markdownReport(measureCatalog(), `PCM measurements · ${new Date().toISOString()}`);
  if (process.argv[2]) await writeFile(process.argv[2], report);
  else process.stdout.write(report);
}
