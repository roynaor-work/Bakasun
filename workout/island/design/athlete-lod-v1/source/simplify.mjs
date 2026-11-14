// Offline simplification only. The delivered GLBs contain ordinary glTF buffers.
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
const {MeshoptSimplifier: simplifier} = await import(process.env.MESHOPT_MODULE
  ? pathToFileURL(process.env.MESHOPT_MODULE).href : 'meshoptimizer');
await simplifier.ready;
const input = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const [indices, error] = simplifier.simplifyWithAttributes(
  new Uint32Array(input.indices), new Float32Array(input.positions), 3,
  new Float32Array(input.attributes), 32,
  [...Array(3).fill(.25), .12, .12, ...Array(18).fill(.12), ...Array(9).fill(.2)],
  new Uint8Array(input.lock), input.target * 3, 1,
  ['RegularizeLight'],
);
process.stdout.write(JSON.stringify({indices: Array.from(indices), attributeWeightedError: error}));
