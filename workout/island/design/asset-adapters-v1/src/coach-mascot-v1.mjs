// Generated from the audited catalog.json. No asset I/O happens during import.
import { createAdapter } from './runtime.mjs';

export const metadata = Object.freeze({
  "id": "coach-mascot-v1",
  "game": "core",
  "flag": "?assetCoachMascotV1=1",
  "available": true,
  "source": {
    "branch": "codex/coach-mascot-v1",
    "commit": "8b5b9e42a271829572a84486f8b18e77a826db31",
    "root": "workout/island/design/coach-mascot-v1"
  },
  "license": {
    "spdx": "CC0-1.0",
    "note": "LICENSES.md explicitly dedicates new coach geometry, expressions and clips CC0; canonical18 names/rest translations follow repository contract.",
    "files": [
      "LICENSES.md"
    ]
  },
  "bytes": 1020471,
  "runtimeBytes": 1017301,
  "dependencies": [
    "Host local Three.js/GLTFLoader/AnimationMixer for the self-contained skinned coach, 18 canonical bones, morph expressions and embedded clips."
  ],
  "missing": [],
  "assets": [
    {
      "name": "coach.glb",
      "path": "coach.glb",
      "type": "glb",
      "bytes": 1006856,
      "sha256": "1d813b789407767da37951fe80b5f0df8fba0f43be90f03a0df741c511a5f220"
    },
    {
      "name": "manifest.json",
      "path": "manifest.json",
      "type": "json",
      "bytes": 7122,
      "sha256": "06cc9e473aa6e12155deb66bdaec268b8ee4d9ab246ae14e80ba37195f4501ba"
    },
    {
      "name": "rig.json",
      "path": "rig.json",
      "type": "json",
      "bytes": 3323,
      "sha256": "252605cae9e7305f84c3c8b2fe42ab1af29ca103030f26b9ed7d2193dd2ed4c0"
    }
  ]
});

export function create(options = {}) {
  return createAdapter(metadata, {
    baseURL: new URL('../../../assets/coach-mascot-v1/', import.meta.url),
    ...options,
  });
}

const adapter = create();
export const { load, ready, get, dispose } = adapter;
export default adapter;
