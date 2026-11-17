// Generated from the audited catalog.json. No asset I/O happens during import.
import { createAdapter } from './runtime.mjs';

export const metadata = Object.freeze({
  "id": "fire-multifloor-v2",
  "game": "fire",
  "flag": "?assetFireMultifloorV2=1",
  "available": true,
  "source": {
    "branch": "codex/fire-multifloor-v2",
    "commit": "8979e5557380bd9944b631f6844fe056a26de8cc",
    "root": "workout/island/design/fire-multifloor-v2"
  },
  "license": {
    "spdx": "CC0-1.0",
    "note": "LICENSES.md: הקדשת נכסי החבילה CC0-1.0; רישיונות ספריות תצוגה אינם מועתקים משום שאינן נכללות.",
    "files": [
      "LICENSES.md"
    ]
  },
  "bytes": 4293883,
  "runtimeBytes": 4290361,
  "dependencies": [
    "המארח מפענח GLB רגיל באמצעות GLTFLoader ו־AnimationMixer של Three.js; runtime.mjs עצמאי ומוחזר כטקסט."
  ],
  "missing": [
    "חיבור קומות בהיסט 3.2 מ׳, מצבי burn_/intact_/burnt_, סולם ועוגני מים למנוע האש; האטלסים אינם מערכת חלקיקים מוטבעת."
  ],
  "assets": [
    {
      "name": "effects/atmosphere.json",
      "path": "effects/atmosphere.json",
      "type": "json",
      "bytes": 1581,
      "sha256": "67313c9adddd0af5a4f2d818227d98ee8c3b8905ffb8c83170a7ed5be5cf963a"
    },
    {
      "name": "effects/blanket.json",
      "path": "effects/blanket.json",
      "type": "json",
      "bytes": 1080,
      "sha256": "20ebb2bd542b9da66e636a12881b3e5047a0e70956817799283d1f849336f0fe"
    },
    {
      "name": "effects/blanket.png",
      "path": "effects/blanket.png",
      "type": "binary",
      "bytes": 101962,
      "sha256": "1f92e8709b19f43a2ea3ce161cef489ed1feb6ea02bc0d36f7725e2e973b78e3"
    },
    {
      "name": "effects/fire.png",
      "path": "effects/fire.png",
      "type": "binary",
      "bytes": 58910,
      "sha256": "a776e7a755a7d69db254c189a258333c5bf020b8a71c17b6f53a9ce2441a1adc"
    },
    {
      "name": "effects/foam.json",
      "path": "effects/foam.json",
      "type": "json",
      "bytes": 1090,
      "sha256": "3048b1f85e957e1db2079a7f27e5e5dfe6c52d56e37a669c03d739a329195cab"
    },
    {
      "name": "effects/foam.png",
      "path": "effects/foam.png",
      "type": "binary",
      "bytes": 78622,
      "sha256": "5ecc84ffeb2526eb10574bbc5ceeb46472629045a94d4fbe6e25675798282d6b"
    },
    {
      "name": "effects/powder.json",
      "path": "effects/powder.json",
      "type": "json",
      "bytes": 1099,
      "sha256": "8daf07ea47aaeb29bfcf5e9617bd46a73fc4d26fb51bbcd63a964fd0524ce389"
    },
    {
      "name": "effects/powder.png",
      "path": "effects/powder.png",
      "type": "binary",
      "bytes": 228894,
      "sha256": "27d5061de1976e14d7545f6272687b2829448d02110d910cf10a920a1bbc7fd1"
    },
    {
      "name": "effects/smoke.png",
      "path": "effects/smoke.png",
      "type": "binary",
      "bytes": 123814,
      "sha256": "29480d96d2eed23a047bf7286d9bf26e6b045669a48f8c91ef1fbc05cec22a52"
    },
    {
      "name": "effects/water.json",
      "path": "effects/water.json",
      "type": "json",
      "bytes": 1100,
      "sha256": "f2928dd2dd127838436529281a75aca31c306a432c61b5bb960cd8d061f07db4"
    },
    {
      "name": "effects/water.png",
      "path": "effects/water.png",
      "type": "binary",
      "bytes": 37707,
      "sha256": "06099ef7a645a52db3b0947b4f31d14c4c5c0ea216ecd95c3dd8aef492969a7e"
    },
    {
      "name": "icons/extinguisher-foam.svg",
      "path": "icons/extinguisher-foam.svg",
      "type": "text",
      "bytes": 1509,
      "sha256": "1919126d6a15e95e337d66edf7bb5d4ac3c9ffb8ff2a0457b9f61469bf052561"
    },
    {
      "name": "icons/extinguisher-powder.svg",
      "path": "icons/extinguisher-powder.svg",
      "type": "text",
      "bytes": 1511,
      "sha256": "e6c2617e01083565ff22391990a1f6154780920aad0f1bd8d221f07b7a318007"
    },
    {
      "name": "icons/fire-blanket.svg",
      "path": "icons/fire-blanket.svg",
      "type": "text",
      "bytes": 1200,
      "sha256": "01d1ae46d5333143c49d9a9531ac25c19e661d7cf8159120942743a12c210646"
    },
    {
      "name": "icons/hydrant.svg",
      "path": "icons/hydrant.svg",
      "type": "text",
      "bytes": 1384,
      "sha256": "0590ffbfdd3d3df3a4f325989ae3d1656ce4e93959f0f1f916628d299288bf08"
    },
    {
      "name": "icons/wall-hose.svg",
      "path": "icons/wall-hose.svg",
      "type": "text",
      "bytes": 1202,
      "sha256": "75423d572ae6ffcc30743ecfac3ef27ac89aab259c4b7e8901e08deeadbd61dc"
    },
    {
      "name": "manifest.json",
      "path": "manifest.json",
      "type": "json",
      "bytes": 85366,
      "sha256": "dda9b9eb54b2166920fa99638629a1267df844f68611652255c20dcd57ea65c2"
    },
    {
      "name": "models/building-floor-1.glb",
      "path": "models/building-floor-1.glb",
      "type": "glb",
      "bytes": 851608,
      "sha256": "d72f9b663e53cd978119c63c9b80ed00190cfda63e647c97bf4b6dc5cb1ff4b3"
    },
    {
      "name": "models/building-floor-2.glb",
      "path": "models/building-floor-2.glb",
      "type": "glb",
      "bytes": 851608,
      "sha256": "458c85d36497c062efe2c4494b5a313b39a1f9418d6d0d36f4ae8ec507fd44ab"
    },
    {
      "name": "models/building-floor-3.glb",
      "path": "models/building-floor-3.glb",
      "type": "glb",
      "bytes": 851608,
      "sha256": "071cb005fa01dd63521cc8ce03d0447004558d86ba9f583e2df081a516e7366b"
    },
    {
      "name": "models/building-shell.glb",
      "path": "models/building-shell.glb",
      "type": "glb",
      "bytes": 352224,
      "sha256": "ee2831d67407c2e50c97f312ddc67e17ca358415b9876934fc7d431f3b4927d0"
    },
    {
      "name": "models/extinguisher-foam.glb",
      "path": "models/extinguisher-foam.glb",
      "type": "glb",
      "bytes": 67760,
      "sha256": "2330b124a83c9a62453fd0353bdf62004aae99bfaecf90127bc9e7489f00711d"
    },
    {
      "name": "models/extinguisher-powder.glb",
      "path": "models/extinguisher-powder.glb",
      "type": "glb",
      "bytes": 73288,
      "sha256": "bbdf7c6dd2f77cba9f407aeb0c87ddbaffee0d8e251b60624137023893f78cdb"
    },
    {
      "name": "models/fire-blanket.glb",
      "path": "models/fire-blanket.glb",
      "type": "glb",
      "bytes": 55244,
      "sha256": "470d39879e8bb54b36c9e1c6ec4c1e75ede6c6502caf2fac581a7f7fa08cb280"
    },
    {
      "name": "models/fire-truck.glb",
      "path": "models/fire-truck.glb",
      "type": "glb",
      "bytes": 249940,
      "sha256": "877d7c9bdd4e31afe40adee696ffac7af5cccc75a030ba306158ccbe02528183"
    },
    {
      "name": "models/hydrant.glb",
      "path": "models/hydrant.glb",
      "type": "glb",
      "bytes": 66120,
      "sha256": "640838026cadc6c2cec04521e2cf75073b28604255d398a1d96549ff96892857"
    },
    {
      "name": "models/wall-hose.glb",
      "path": "models/wall-hose.glb",
      "type": "glb",
      "bytes": 141336,
      "sha256": "6817cb7499cff79740dde0c89e6e29b983a1de27ccb985ed2d0d53ff17c653fd"
    },
    {
      "name": "runtime.mjs",
      "path": "runtime.mjs",
      "type": "text",
      "bytes": 1594,
      "sha256": "c4e37a9d892df5c97008618ca66358977d8708cec116bcaef451253e50c13e04"
    }
  ]
});

export function create(options = {}) {
  return createAdapter(metadata, {
    baseURL: new URL('../../../assets/fire-multifloor-v2/', import.meta.url),
    ...options,
  });
}

const adapter = create();
export const { load, ready, get, dispose } = adapter;
export default adapter;
