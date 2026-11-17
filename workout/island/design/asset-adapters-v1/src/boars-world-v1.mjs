// Generated from the audited catalog.json. No asset I/O happens during import.
import { createAdapter } from './runtime.mjs';

export const metadata = Object.freeze({
  "id": "boars-world-v1",
  "game": "boars",
  "flag": "?assetBoarsWorldV1=1",
  "available": true,
  "source": {
    "branch": "codex/boars-world-v1",
    "commit": "c54127e2a00b34d0c08a16db167c56b6301dd48c",
    "root": "workout/island/design/boars-world-v1"
  },
  "license": {
    "spdx": "CC0-1.0",
    "note": "LICENSES.md: הקדשת נכסי החבילה CC0-1.0; רישיונות ספריות תצוגה אינם מועתקים משום שאינן נכללות.",
    "files": [
      "LICENSES.md"
    ]
  },
  "bytes": 1585048,
  "runtimeBytes": 1582654,
  "dependencies": [
    "GLTFLoader ו־AnimationMixer במארח; SkeletonUtils.clone לשכפול חזיר עם שלד עצמאי; אין תלות בטקסטורות."
  ],
  "missing": [
    "מניפסט האופליין ב־main אינו כולל דלי boars; יש לחבר games.boars או לבחור שיוך במועד האינטגרציה.",
    "חיבור תנועת העולם לקבוצה חיצונית: ארבעת הקליפים מונפשים במקום; החלפת שלושת מצבי היום לפי scene.json."
  ],
  "assets": [
    {
      "name": "manifest.json",
      "path": "manifest.json",
      "type": "json",
      "bytes": 17127,
      "sha256": "a9f776d89a08f25a575186eeaedc2ec61d7e5386a3f81a640ff4fea8cb2a2e9e"
    },
    {
      "name": "models/boar-caramel.glb",
      "path": "models/boar-caramel.glb",
      "type": "glb",
      "bytes": 143868,
      "sha256": "230d33d2f63909fe39b2241033cc90c0a8e549467152690d4330c4231ba7005d"
    },
    {
      "name": "models/boar-cocoa.glb",
      "path": "models/boar-cocoa.glb",
      "type": "glb",
      "bytes": 145160,
      "sha256": "82712429e3264ee605eb4566c82fda985b09401f4f93deb9eea1b641e0769517"
    },
    {
      "name": "models/boar-cream.glb",
      "path": "models/boar-cream.glb",
      "type": "glb",
      "bytes": 140396,
      "sha256": "b300784cd17c11e71bdc7062e2f019c6c043a73ce31bc7bd3cbbbd6589fac1d0"
    },
    {
      "name": "models/boar-lilac.glb",
      "path": "models/boar-lilac.glb",
      "type": "glb",
      "bytes": 139316,
      "sha256": "a92a783ced49baa001666b4062bb96e871f3fbacea7dd363fc4f030aa01d99c9"
    },
    {
      "name": "models/boar-peach.glb",
      "path": "models/boar-peach.glb",
      "type": "glb",
      "bytes": 139096,
      "sha256": "99743c5746cfcfc8822e8bc365c162ffb2788e09a066c7ade9ce48b1160282e9"
    },
    {
      "name": "models/bush-berry.glb",
      "path": "models/bush-berry.glb",
      "type": "glb",
      "bytes": 35136,
      "sha256": "e6a26c832a8c3aef9352cdeff1ae28f61dd9513cdc192c9ba8cb6e68b0fc4d52"
    },
    {
      "name": "models/bush-fern.glb",
      "path": "models/bush-fern.glb",
      "type": "glb",
      "bytes": 38828,
      "sha256": "7a9155f96591dd0a3d9b60ea0c9c66395dc03268e975040fb06006d21d3261d0"
    },
    {
      "name": "models/bush-round.glb",
      "path": "models/bush-round.glb",
      "type": "glb",
      "bytes": 13292,
      "sha256": "bb6170c1c598d665a1ff5f157e70a3de4672a97a6706f8288b4d571d540f1749"
    },
    {
      "name": "models/cabin.glb",
      "path": "models/cabin.glb",
      "type": "glb",
      "bytes": 38308,
      "sha256": "2afba482344a51af7019a88e785e02170efd741d371e1dc26c6cbc6240f1e880"
    },
    {
      "name": "models/fence.glb",
      "path": "models/fence.glb",
      "type": "glb",
      "bytes": 9916,
      "sha256": "b56528aaf8c625b7e6b50c25abb873745249520383e219bfa8f91bccba382395"
    },
    {
      "name": "models/meadow.glb",
      "path": "models/meadow.glb",
      "type": "glb",
      "bytes": 198252,
      "sha256": "8d63277933acf5f943106a9a2866e50bbda66c9123030fbd9d49e79946c5722e"
    },
    {
      "name": "models/mud-puddle.glb",
      "path": "models/mud-puddle.glb",
      "type": "glb",
      "bytes": 35472,
      "sha256": "1b061e0052114a9595bd26d6f27180d947c5b9ec7b4a7d1ea4d8aa9b4de57208"
    },
    {
      "name": "models/rock-cluster.glb",
      "path": "models/rock-cluster.glb",
      "type": "glb",
      "bytes": 11448,
      "sha256": "e71e26086a5d473e993eaedd8d3a1731fdc20d90854d8ac940f63aa66c6fad41"
    },
    {
      "name": "models/rock-pair.glb",
      "path": "models/rock-pair.glb",
      "type": "glb",
      "bytes": 8412,
      "sha256": "5f59edc2ac77d58eb368ac1c4e30786a23885822d700a23caa0bc4d177ab7c5f"
    },
    {
      "name": "models/rock-round.glb",
      "path": "models/rock-round.glb",
      "type": "glb",
      "bytes": 5392,
      "sha256": "f7b31f7a3a9c4a526eed4a4e500ec12a826674d6afda2250c84fe3dd85f69dca"
    },
    {
      "name": "models/sky-morning.glb",
      "path": "models/sky-morning.glb",
      "type": "glb",
      "bytes": 128876,
      "sha256": "a19f2822a908b505c8f63f10fae9fc76e97cee5d27dbd74722d1ea5b74f5a6b7"
    },
    {
      "name": "models/sky-noon.glb",
      "path": "models/sky-noon.glb",
      "type": "glb",
      "bytes": 128868,
      "sha256": "d0af4179a10256a742b603566f47da34e12f49eedd2d692f3a86dddde59f09ed"
    },
    {
      "name": "models/sky-sunset.glb",
      "path": "models/sky-sunset.glb",
      "type": "glb",
      "bytes": 128872,
      "sha256": "2ead2e92b065f25936354c4aca7feac7b81dbdacce8a81c51618c0b6f19f1768"
    },
    {
      "name": "models/tree-birch.glb",
      "path": "models/tree-birch.glb",
      "type": "glb",
      "bytes": 28080,
      "sha256": "f94f8da653623de60cbb2a1071782f6ccd166f45de4f13013dba769bcfd36e81"
    },
    {
      "name": "models/tree-oak.glb",
      "path": "models/tree-oak.glb",
      "type": "glb",
      "bytes": 27720,
      "sha256": "ecc7ace043243b4d8632d46622dac354e2ad477f95aac8514c25a0673b664701"
    },
    {
      "name": "models/tree-pine.glb",
      "path": "models/tree-pine.glb",
      "type": "glb",
      "bytes": 11272,
      "sha256": "386aa03fac1b42cbe06c665412463cc34dffaa4b485b04948c009a96e718a7c0"
    },
    {
      "name": "scene.json",
      "path": "scene.json",
      "type": "json",
      "bytes": 6458,
      "sha256": "cb26469b14c1f4d7a7ffc558005dca8a83d6c12729e7646327f414856994bdb7"
    },
    {
      "name": "skeleton.json",
      "path": "skeleton.json",
      "type": "json",
      "bytes": 3089,
      "sha256": "deafa0e71e6937978e176352310f518b1a80f70c24d7c5a79e11212acc8d655f"
    }
  ]
});

export function create(options = {}) {
  return createAdapter(metadata, {
    baseURL: new URL('../../../assets/boars-world-v1/', import.meta.url),
    ...options,
  });
}

const adapter = create();
export const { load, ready, get, dispose } = adapter;
export default adapter;
