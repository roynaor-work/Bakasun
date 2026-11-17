// Generated from the audited catalog.json. No asset I/O happens during import.
import { createAdapter } from './runtime.mjs';

export const metadata = Object.freeze({
  "id": "naval-sea-v2",
  "game": "naval",
  "flag": "?assetNavalSeaV2=1",
  "available": true,
  "source": {
    "branch": "codex/naval-sea-v2",
    "commit": "ea925b1f244b092c6e324c3f470234ae346f2fb7",
    "root": "workout/island/design/naval-sea-v2"
  },
  "license": {
    "spdx": "CC0-1.0",
    "note": "LICENSES.md and full LICENSE.assets explicitly license original sea textures and nine uncompressed scenery GLBs CC0; preview-only Three.js MIT copies excluded.",
    "files": [
      "LICENSE.assets",
      "LICENSES.md"
    ]
  },
  "bytes": 4779445,
  "runtimeBytes": 4770120,
  "dependencies": [
    "Host local Three.js/GLTFLoader for models; sRGB textures, straight alpha foam, manifest water sampling/normal parameters."
  ],
  "missing": [],
  "assets": [
    {
      "name": "manifest.json",
      "path": "manifest.json",
      "type": "json",
      "bytes": 61993,
      "sha256": "94198abbcf54b54345d83c6cf503445709718d903b182f08676d793daed4f3f9"
    },
    {
      "name": "models/float-can-buoy.glb",
      "path": "models/float-can-buoy.glb",
      "type": "glb",
      "bytes": 126196,
      "sha256": "4cb993a5838a586bba094759f64dccf632d53afd943b15d43163ac9ad4caedbe"
    },
    {
      "name": "models/float-cone-buoy.glb",
      "path": "models/float-cone-buoy.glb",
      "type": "glb",
      "bytes": 124868,
      "sha256": "bf8ec9045fc5655458920cb6009a6930d1d4aab897157b1059388d592bb39008"
    },
    {
      "name": "models/float-driftwood.glb",
      "path": "models/float-driftwood.glb",
      "type": "glb",
      "bytes": 127700,
      "sha256": "700c657d8d52e98432ec28661147a7836e1b24d9bfde5a5422479fba3cbe5bc6"
    },
    {
      "name": "models/float-supply-crate.glb",
      "path": "models/float-supply-crate.glb",
      "type": "glb",
      "bytes": 133220,
      "sha256": "bbe417a35de2a15700e442e754618dd4b5dd419afc20405b79e75fd6b435d003"
    },
    {
      "name": "models/lighthouse.glb",
      "path": "models/lighthouse.glb",
      "type": "glb",
      "bytes": 470888,
      "sha256": "0b7a354ad43617301cc2c33f1e98efa90ddeb0855e549a8c636faa0c454d48c2"
    },
    {
      "name": "models/rock-reef.glb",
      "path": "models/rock-reef.glb",
      "type": "glb",
      "bytes": 98816,
      "sha256": "5c8a6d92a4585bb6cfa517314fad7551f45d355a9f13a7ff65c56cb5050786da"
    },
    {
      "name": "models/rock-skerry.glb",
      "path": "models/rock-skerry.glb",
      "type": "glb",
      "bytes": 50024,
      "sha256": "7ee8b842787d02a2a98bee214edcfb1408d0d0e0d834fd87ea14dc5e37f0e13c"
    },
    {
      "name": "models/rock-split.glb",
      "path": "models/rock-split.glb",
      "type": "glb",
      "bytes": 98816,
      "sha256": "871713545b909f70f0a657b5d97fd7b4b8082df0bf2c13e4bc0b3732a10529b4"
    },
    {
      "name": "models/rock-stack.glb",
      "path": "models/rock-stack.glb",
      "type": "glb",
      "bytes": 50024,
      "sha256": "fe8f02dd3b45b5a647a6ec3416388089bf5f32088af85d857d35d572d257d090"
    },
    {
      "name": "textures/foam-patch.png",
      "path": "textures/foam-patch.png",
      "type": "binary",
      "bytes": 22855,
      "sha256": "0c82767ebe7541832731c76e360b50039e432e55b819914d2411be54eeebd372"
    },
    {
      "name": "textures/foam-ring.png",
      "path": "textures/foam-ring.png",
      "type": "binary",
      "bytes": 21452,
      "sha256": "44dc99c84496bc9853edf18e7690bbbbca9f247ed940c0002a918e8e7e52cc61"
    },
    {
      "name": "textures/foam-strip.png",
      "path": "textures/foam-strip.png",
      "type": "binary",
      "bytes": 29380,
      "sha256": "0e79faded2039cb4c3e071ae889286b734507062d59313e63599ca73d8a9d205"
    },
    {
      "name": "textures/horizon-fog.png",
      "path": "textures/horizon-fog.png",
      "type": "binary",
      "bytes": 618,
      "sha256": "0ed1a82d349a22bb622733153d7b3d7219b3ad414595a6ca148d764e9c378d52"
    },
    {
      "name": "textures/impact-4x8.png",
      "path": "textures/impact-4x8.png",
      "type": "binary",
      "bytes": 88257,
      "sha256": "4f26a5a71bd2e7180e570cd50170e2f3e2683c5da867053630e1e5187e6d901c"
    },
    {
      "name": "textures/near-miss-column-12.png",
      "path": "textures/near-miss-column-12.png",
      "type": "binary",
      "bytes": 86964,
      "sha256": "9d39d5c92f6cac2b38845aef812e491c3e3352af4d4fe3cff3666a53e5e17e3b"
    },
    {
      "name": "textures/sky-day.png",
      "path": "textures/sky-day.png",
      "type": "binary",
      "bytes": 1156,
      "sha256": "e9ca631a54d710c88081bac88140b968012bb31e7f598d1d42950d4ec7498096"
    },
    {
      "name": "textures/sky-night.png",
      "path": "textures/sky-night.png",
      "type": "binary",
      "bytes": 1115,
      "sha256": "af2b4a7d356c06d9cd759918bb123168a5ada02052f8962a12517a3090e45f0a"
    },
    {
      "name": "textures/sky-sunset.png",
      "path": "textures/sky-sunset.png",
      "type": "binary",
      "bytes": 1253,
      "sha256": "5e970e36b422936128e1b0c6a084d2b3797d131a9174f87412f53505e9fbacbe"
    },
    {
      "name": "textures/sun-disc.png",
      "path": "textures/sun-disc.png",
      "type": "binary",
      "bytes": 1729,
      "sha256": "24d3d5d30c2ff017f2dfad25c6c1622407626800f8951b9be7320e7fbb27f859"
    },
    {
      "name": "textures/wake-8.png",
      "path": "textures/wake-8.png",
      "type": "binary",
      "bytes": 417267,
      "sha256": "1104fd417a3f9e12469a704bd16564664ea610e22c931b59660d1c68c196e482"
    },
    {
      "name": "textures/wake.png",
      "path": "textures/wake.png",
      "type": "binary",
      "bytes": 52057,
      "sha256": "bc80ac6d1627a561842df53da6c5c119d19df8705057983dd6d36500d329a765"
    },
    {
      "name": "textures/water-breeze-normal.png",
      "path": "textures/water-breeze-normal.png",
      "type": "binary",
      "bytes": 531679,
      "sha256": "6ac526f5a42380c3388494b39e3d70b8781327c791ff797e9a4e02e32f109118"
    },
    {
      "name": "textures/water-breeze-tile.png",
      "path": "textures/water-breeze-tile.png",
      "type": "binary",
      "bytes": 23300,
      "sha256": "29e7993509d82903024b0e2b171707ae09dc9028570732b946b1c006ace03cb1"
    },
    {
      "name": "textures/water-breeze.png",
      "path": "textures/water-breeze.png",
      "type": "binary",
      "bytes": 348823,
      "sha256": "c025f6142a66258bbc33397f1f47f8b3a7a87e0ccdf2f6c2f9ae5d5b34c09d8c"
    },
    {
      "name": "textures/water-calm-normal.png",
      "path": "textures/water-calm-normal.png",
      "type": "binary",
      "bytes": 523764,
      "sha256": "9bd7b62819867460f56d784e61f62e1f115ca68c0b294d58cff85828569888f3"
    },
    {
      "name": "textures/water-calm-tile.png",
      "path": "textures/water-calm-tile.png",
      "type": "binary",
      "bytes": 21259,
      "sha256": "0644abf238ba234232d187cab745ffea1043ac4cce4692db593884a127aee904"
    },
    {
      "name": "textures/water-calm.png",
      "path": "textures/water-calm.png",
      "type": "binary",
      "bytes": 316689,
      "sha256": "d813b1f64f23b9b2f19613372f6a804d774029e108ad273ee7d672459ce6af50"
    },
    {
      "name": "textures/water-rough-normal.png",
      "path": "textures/water-rough-normal.png",
      "type": "binary",
      "bytes": 529311,
      "sha256": "aa1ca3fc81cd23b2329496da09346ee1704f73a4d169a1e30759c2b47cec191a"
    },
    {
      "name": "textures/water-rough-tile.png",
      "path": "textures/water-rough-tile.png",
      "type": "binary",
      "bytes": 25747,
      "sha256": "2889b50bcc5b1bf5d9b6319663a50da4c06b246dd6716f4e3326d956e3400c14"
    },
    {
      "name": "textures/water-rough.png",
      "path": "textures/water-rough.png",
      "type": "binary",
      "bytes": 382900,
      "sha256": "d0e27a7eb7e804df81b6ded58a31a62fa22fec18a9e895a68bba0cfee9976810"
    }
  ]
});

export function create(options = {}) {
  return createAdapter(metadata, {
    baseURL: new URL('../../../assets/naval-sea-v2/', import.meta.url),
    ...options,
  });
}

const adapter = create();
export const { load, ready, get, dispose } = adapter;
export default adapter;
