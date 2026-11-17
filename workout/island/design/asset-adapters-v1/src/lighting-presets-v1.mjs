// Generated from the audited catalog.json. No asset I/O happens during import.
import { createAdapter } from './runtime.mjs';

export const metadata = Object.freeze({
  "id": "lighting-presets-v1",
  "game": "core",
  "flag": "?assetLightingPresetsV1=1",
  "available": true,
  "source": {
    "branch": "codex/lighting-presets-v1",
    "commit": "9b988d95df033312314cc4236fd069422b8a45d9",
    "root": "workout/island/design/lighting-presets-v1"
  },
  "license": {
    "spdx": "MIT",
    "note": "LICENSES.md contains full MIT and explicitly covers presets, original lighting logic and procedural texture outputs; preview vendor Three.js excluded.",
    "files": [
      "LICENSES.md"
    ]
  },
  "bytes": 72700,
  "runtimeBytes": 69316,
  "dependencies": [
    "Host local Three.js r160-compatible renderer/scene, lighting/material configuration and per-frame update(seconds,camera).",
    "lighting.js is an original classic IIFE exposing a global factory, fetched as text only; presets.json and PNGs load directly through the ES module adapter."
  ],
  "missing": [
    "Port lighting.js factory to an ES module accepting existing Three.js before executing its behavior; no classic-script injection is used by this adapter."
  ],
  "assets": [
    {
      "name": "lighting.js",
      "path": "lighting.js",
      "type": "text",
      "bytes": 14260,
      "sha256": "7d4766766581d9fd301825f78ce00d617bc3345ed0132e1c88623203b1bccd75"
    },
    {
      "name": "manifest.json",
      "path": "manifest.json",
      "type": "json",
      "bytes": 2325,
      "sha256": "4e214a3abc54b8d4ddad90e77788bedc3beab4542781359a448c7073ecc7aea3"
    },
    {
      "name": "presets.json",
      "path": "presets.json",
      "type": "json",
      "bytes": 20661,
      "sha256": "54d83488b3ffc200cef4060aef0b392221f0c21e9767e6c9ad6f1e260fa00421"
    },
    {
      "name": "textures/clouds.png",
      "path": "textures/clouds.png",
      "type": "binary",
      "bytes": 6032,
      "sha256": "9feaa04a3f09184df3bd7f57147da3d9d6a585d6d6b73c38693be96a31aaad3e"
    },
    {
      "name": "textures/halo.png",
      "path": "textures/halo.png",
      "type": "binary",
      "bytes": 2524,
      "sha256": "80010a0b7d8e57bf655261ef1749ffa07dc0cfefe6db26206cba14dc43a65d32"
    },
    {
      "name": "textures/sky-tile.png",
      "path": "textures/sky-tile.png",
      "type": "binary",
      "bytes": 23514,
      "sha256": "0fbae9b3a1a8f210142f61d2580aff40b24f22098b637a946dbb654a90c94e83"
    }
  ]
});

export function create(options = {}) {
  return createAdapter(metadata, {
    baseURL: new URL('../../../assets/lighting-presets-v1/', import.meta.url),
    ...options,
  });
}

const adapter = create();
export const { load, ready, get, dispose } = adapter;
export default adapter;
