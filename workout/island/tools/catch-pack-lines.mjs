// "תפוס את הפושע" v8: which sounds of the Codex pack (design/catch-audio-v2) carry a whistle-like line, frame by frame as
// minigames/audio-guard.mjs reads the game: per 50 ms frame of a 4096-point FFT (44.1 kHz), the strongest bin in 0.9-5 kHz, its
// prominence over the median of its +-200 Hz and how far it sits under the frame's loudest bin; 'tonal' by the guard's rule
// (10 dB proud within 12 dB of the peak, or 18 dB proud within 22 dB). Each file also at 1.25x (a layer pitched up for the rpm,
// or the Doppler). Needs ffmpeg.  node workout/island/tools/catch-pack-lines.mjs [out.json]
import {execFileSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../design/catch-audio-v2'), out = process.argv[2] || '';
const FILES = ['engine-police-low', 'engine-police-mid', 'engine-police-high', 'engine-v6-low', 'engine-v6-mid', 'engine-v6-high', 'gear-shift', 'chase-start', 'siren-near', 'siren-far', 'burst-automatic-080', 'burst-puncture-080-1'];
function fft(re, im) { const n = re.length; for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } } for (let len = 2; len <= n; len <<= 1) { const a = -2 * Math.PI / len; for (let i = 0; i < n; i += len) for (let k = 0; k < len / 2; k++) { const c = Math.cos(a * k), s = Math.sin(a * k), ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * c - im[i + k + len / 2] * s, vi = re[i + k + len / 2] * s + im[i + k + len / 2] * c; re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi; } } }
const med = a => { const c = a.slice().sort((p, q) => p - q); return c[c.length >> 1]; };
function scan(file, rate) {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', '44100', '-f', 'f32le', '-'], {maxBuffer: 1 << 28}), N = 4096;
  let x = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
  if (x.length < N * 3) { const y = new Float32Array(N * 4); for (let i = 0; i < y.length; i++) y[i] = x[i % x.length]; x = y; } // a short file loops
  const hz = 44100 * rate / N, lo = Math.ceil(900 / hz), hi = Math.floor(5000 / hz), nb = Math.round(200 / hz), floor = Math.ceil(60 / hz), hop = Math.round(44100 * .05);
  let frames = 0, tonal = 0; const all = [];
  for (let off = 0; off + N <= x.length; off += hop) {
    const re = new Float64Array(N), im = new Float64Array(N); for (let i = 0; i < N; i++) re[i] = x[off + i] * (.5 - .5 * Math.cos(2 * Math.PI * i / (N - 1)));
    fft(re, im); const db = new Float64Array(N / 2); let kmax = floor;
    for (let k = 1; k < N / 2; k++) { db[k] = 10 * Math.log10(re[k] * re[k] + im[k] * im[k] + 1e-20); if (k >= floor && db[k] > db[kmax]) kmax = k; }
    let k = lo; for (let i = lo; i <= hi; i++) if (db[i] > db[k]) k = i;
    const prom = db[k] - med([...db.slice(Math.max(floor, k - nb), Math.max(floor, k - 2)), ...db.slice(k + 3, Math.min(N / 2, k + nb))]), rel = db[k] - db[kmax];
    const t = (prom >= 10 && rel >= -12) || (prom >= 18 && rel >= -22); frames++; if (t) tonal++;
    all.push({hz: Math.round(k * hz), prom: +prom.toFixed(1), rel: +rel.toFixed(1)});
  }
  all.sort((a, b) => (b.rel + b.prom * .5) - (a.rel + a.prom * .5));
  return {file: path.basename(file), rate, frames, tonal, worst: all[0]};
}
const rows = [];
for (const f of FILES) for (const rate of [1, 1.25]) { const r = scan(path.join(dir, f + '.ogg'), rate); rows.push(r); console.log(JSON.stringify(r)); }
if (out) await writeFile(out, JSON.stringify(rows, null, 1) + '\n');
