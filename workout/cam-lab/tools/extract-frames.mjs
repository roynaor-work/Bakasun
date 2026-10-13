import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';

const [input, destination] = process.argv.slice(2);
if (!input) { console.error('Usage: node extract-frames.mjs frames.json [output-directory]'); process.exit(1); }
const data = JSON.parse(await readFile(input, 'utf8'));
if (data.version !== 1 || !Array.isArray(data.frames)) throw new Error('Invalid frames.json');
const output = resolve(destination || resolve(dirname(input), `${basename(input, '.json')}-images`));
await mkdir(output, { recursive: true });
const names = new Set(), rows = [];
for (const frame of data.frames) {
  if (!/^f\d+-rep\d+-(bottom|rejected|interval)\.jpg$/.test(frame.name) || names.has(frame.name)) throw new Error('Invalid or duplicate JPEG name');
  if (typeof frame.jpegBase64 !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(frame.jpegBase64)) throw new Error('Invalid JPEG Base64');
  const jpeg = Buffer.from(frame.jpegBase64, 'base64');
  if (jpeg.length < 4 || jpeg[0] !== 255 || jpeg[1] !== 216 || jpeg.at(-2) !== 255 || jpeg.at(-1) !== 217) throw new Error('Invalid JPEG');
  names.add(frame.name);
  await writeFile(resolve(output, frame.name), jpeg);
  rows.push({ name: frame.name, tMs: frame.tMs, reason: frame.reason, rep: frame.rep,
    ...(frame.participant == null ? {} : { participant: frame.participant }), rejectReason: frame.rejectReason || '' });
}
console.table(rows);
console.log(`${rows.length} JPEGs saved to ${output}`);
