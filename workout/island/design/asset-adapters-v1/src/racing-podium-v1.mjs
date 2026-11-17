// Generated from the audited catalog.json. No asset I/O happens during import.
import { createAdapter } from './runtime.mjs';

export const metadata = Object.freeze({
  "id": "racing-podium-v1",
  "game": "racing",
  "flag": "?assetRacingPodiumV1=1",
  "available": true,
  "source": {
    "branch": "codex/racing-podium-v1",
    "commit": "1f9503dcaef681d52ca3b6dce77709f5873b9772",
    "root": "workout/island/design/racing-podium-v1"
  },
  "license": {
    "spdx": "CC0-1.0",
    "note": "LICENSES.md explicitly CC0 for original/reused CC0 geometry and motions; preview refers to host local Three.js MIT without copying it.",
    "files": [
      "LICENSES.md"
    ]
  },
  "bytes": 2154016,
  "runtimeBytes": 2151001,
  "dependencies": [
    "Host local Three.js/GLTFLoader/SkeletonUtils for per-actor skinned clones and animation mixing; canonical18 rig and motions/props metadata."
  ],
  "missing": [],
  "assets": [
    {
      "name": "assets/bronze-medal.glb",
      "path": "assets/bronze-medal.glb",
      "type": "glb",
      "bytes": 36040,
      "sha256": "5ddecb9876184e05007875415892b64704bfe3c7949c840daf5631d70475ddb2"
    },
    {
      "name": "assets/champagne-spray.png",
      "path": "assets/champagne-spray.png",
      "type": "binary",
      "bytes": 46267,
      "sha256": "227fab97f4fd29f0a42f2587a4fc7a45175c5304e54e258b277b0ca8b887222b"
    },
    {
      "name": "assets/champagne.glb",
      "path": "assets/champagne.glb",
      "type": "glb",
      "bytes": 31668,
      "sha256": "3bcbdf6b89d706e0226c4efb3e61a6cd2eaf6fa9ef14460a847b623528d1b7bd"
    },
    {
      "name": "assets/checkered-flag.glb",
      "path": "assets/checkered-flag.glb",
      "type": "glb",
      "bytes": 53972,
      "sha256": "3d72da25ee91336033dc97a3fbb494d75d5298788e4f3dbbaf97cda1c7ad0760"
    },
    {
      "name": "assets/confetti.png",
      "path": "assets/confetti.png",
      "type": "binary",
      "bytes": 636,
      "sha256": "30bd570b8599830242c35591a284d855b22610850bd6f9b1759a5d13585c6995"
    },
    {
      "name": "assets/driver-female.glb",
      "path": "assets/driver-female.glb",
      "type": "glb",
      "bytes": 842456,
      "sha256": "06e0365083bef2986c3ff6269eb279fe638c2bd6aa233c8d77c20163a914f328"
    },
    {
      "name": "assets/driver-male.glb",
      "path": "assets/driver-male.glb",
      "type": "glb",
      "bytes": 845340,
      "sha256": "6168c7aa82cbbb72f5d48b0be33b7adfa8532f6fd82bf51961db233eaac37bf0"
    },
    {
      "name": "assets/effects.json",
      "path": "assets/effects.json",
      "type": "json",
      "bytes": 2588,
      "sha256": "c5e4002020cc160f5f92831cd26f5ba74af6a68b5d9c47ecc79cfbcc45000254"
    },
    {
      "name": "assets/gold-medal.glb",
      "path": "assets/gold-medal.glb",
      "type": "glb",
      "bytes": 26800,
      "sha256": "e5ac62a24596ea1aa1d5543f77c835079b67b52f5e24244532684533ff3f9e19"
    },
    {
      "name": "assets/helmet.glb",
      "path": "assets/helmet.glb",
      "type": "glb",
      "bytes": 50452,
      "sha256": "5d7714d75290730726cf5bdd7109a2e316779c42007c41bcf8af84c4092395a5"
    },
    {
      "name": "assets/podium.glb",
      "path": "assets/podium.glb",
      "type": "glb",
      "bytes": 96448,
      "sha256": "8dc82b60b98686d8115ae4a091b9c9febc4e6389cd5d00b1cc5bae9a295351aa"
    },
    {
      "name": "assets/silver-medal.glb",
      "path": "assets/silver-medal.glb",
      "type": "glb",
      "bytes": 32620,
      "sha256": "cad065f9473c9001c5e5daf90d32f756d2d11d303c8a388d4ff6343d0b53db60"
    },
    {
      "name": "assets/trophy.glb",
      "path": "assets/trophy.glb",
      "type": "glb",
      "bytes": 51816,
      "sha256": "a999f99ec4bb6165344ea7e78463aa9d95140cad1d7683de225717108c010a27"
    },
    {
      "name": "manifest.json",
      "path": "manifest.json",
      "type": "json",
      "bytes": 15243,
      "sha256": "b92b4a442d6cb3dd2f7e516ff319eb57041d22fad3836692d229efcfba06fa53"
    },
    {
      "name": "motions.json",
      "path": "motions.json",
      "type": "json",
      "bytes": 10369,
      "sha256": "70ac38506d4f938608b4d6ab3386cd16a8903fe24e8e81d268749b1a984b6435"
    },
    {
      "name": "props.json",
      "path": "props.json",
      "type": "json",
      "bytes": 2075,
      "sha256": "c0608cb580dca410a1e09742382e04e4047f9c3518d6bfe593170073515ff63a"
    },
    {
      "name": "rig.json",
      "path": "rig.json",
      "type": "json",
      "bytes": 6211,
      "sha256": "8d534b0d30defa5515d279eb6eaf70c8fdd242303227aa023280de0ec2737caf"
    }
  ]
});

export function create(options = {}) {
  return createAdapter(metadata, {
    baseURL: new URL('../../../assets/racing-podium-v1/', import.meta.url),
    ...options,
  });
}

const adapter = create();
export const { load, ready, get, dispose } = adapter;
export default adapter;
