// Generated from the audited catalog.json. No asset I/O happens during import.
import { createAdapter } from './runtime.mjs';

export const metadata = Object.freeze({
  "id": "soccer-keeper-motion-v3",
  "game": "soccer",
  "flag": "?assetSoccerKeeperMotionV3=1",
  "available": true,
  "source": {
    "branch": "codex/soccer-keeper-motion-v3",
    "commit": "b31011b65144f9c6cc2eefddd0150a6f92707e4b",
    "root": "workout/island/design/soccer-keeper-motion-v3"
  },
  "license": {
    "spdx": "CC0-1.0",
    "note": "LICENSES.md מתעד הקדשת CC0-1.0 לתרומות המקוריות ולשרשרת נכסי הדמויות; ספריות תצוגה וכלי פיתוח שאינם מועתקים שומרים על רישיונם.",
    "files": [
      "LICENSES.md"
    ]
  },
  "bytes": 16789355,
  "runtimeBytes": 16784786,
  "dependencies": [
    "GLTFLoader/AnimationMixer או sampler מבוסס motions.json; שלד Canonical18. runtime/player.mjs עצמאי ללא imports."
  ],
  "missing": [
    "מיפוי possession_transfer, שחרור הכדור ושיקוף הזינוקים לסימולציה; referenceTravel אינו תרגום Root אוטומטי."
  ],
  "assets": [
    {
      "name": "catalog.json",
      "path": "catalog.json",
      "type": "json",
      "bytes": 989519,
      "sha256": "077e063cfba3b3b4ba5a4538c9cb6571b2e44f23e2ceba776fb5b0825fbb93b9"
    },
    {
      "name": "clips/field_clap.glb",
      "path": "clips/field_clap.glb",
      "type": "glb",
      "bytes": 805640,
      "sha256": "e12ff5261d3496d74b7614706e54ec5bf98f7c84a7858eed4092a9c472f9b137"
    },
    {
      "name": "clips/field_enter.glb",
      "path": "clips/field_enter.glb",
      "type": "glb",
      "bytes": 805712,
      "sha256": "6df0a3c20966ce1a202dd7ab7cff2e60bf1b5634f0d24e11148df3f665f23dcc"
    },
    {
      "name": "clips/field_group_celebrate.glb",
      "path": "clips/field_group_celebrate.glb",
      "type": "glb",
      "bytes": 809328,
      "sha256": "f6bff555623447d3752ea7a0e950b91f12ee8efe84c372d967f2fea75af02f72"
    },
    {
      "name": "clips/field_miss.glb",
      "path": "clips/field_miss.glb",
      "type": "glb",
      "bytes": 803772,
      "sha256": "ead477e6cd7ee9536abf9e770a90ccb63ddabca1f2711b8dd18f2b833ae3c418"
    },
    {
      "name": "clips/keeper_catch_two_hands.glb",
      "path": "clips/keeper_catch_two_hands.glb",
      "type": "glb",
      "bytes": 772552,
      "sha256": "e2bb0a3eabf11d2b956a586de9891a2ddcdf94cbfa86b9841bab4e1c69bef823"
    },
    {
      "name": "clips/keeper_celebrate.glb",
      "path": "clips/keeper_celebrate.glb",
      "type": "glb",
      "bytes": 774328,
      "sha256": "fcfb4062aba2fc1a7d050f1fa76e991abdd1e389ed8d44a858ce16f8a753765b"
    },
    {
      "name": "clips/keeper_disappointed.glb",
      "path": "clips/keeper_disappointed.glb",
      "type": "glb",
      "bytes": 772480,
      "sha256": "cfb6a82c3bb75c956b7ca19372b4677cd3cfbd8e53a00effd31eb3730f7d8e45"
    },
    {
      "name": "clips/keeper_dive_high.glb",
      "path": "clips/keeper_dive_high.glb",
      "type": "glb",
      "bytes": 787324,
      "sha256": "1ffd57d5d695750653dfe2757108c5c02b3b5975fcc76bfed9b8c51f73c04285"
    },
    {
      "name": "clips/keeper_dive_low.glb",
      "path": "clips/keeper_dive_low.glb",
      "type": "glb",
      "bytes": 787324,
      "sha256": "d37c93fdaab253b3e1ede0e9e9f509b04849aba54f408698ab55804e267f7152"
    },
    {
      "name": "clips/keeper_punch.glb",
      "path": "clips/keeper_punch.glb",
      "type": "glb",
      "bytes": 768892,
      "sha256": "da2dff9698396ee59d6ec665d32021764c20be9371478b3e0a383315ae34da8a"
    },
    {
      "name": "clips/keeper_punt.glb",
      "path": "clips/keeper_punt.glb",
      "type": "glb",
      "bytes": 778016,
      "sha256": "6e687217e47756d9920925e69ee43a4c0eaba2486ca29fc16d4e3326a0cc537c"
    },
    {
      "name": "clips/keeper_ready.glb",
      "path": "clips/keeper_ready.glb",
      "type": "glb",
      "bytes": 761468,
      "sha256": "adbbecc3d8e19514c34229522fd1e123ef2010562a0a3798de383d66508a5ba0"
    },
    {
      "name": "clips/keeper_shuffle.glb",
      "path": "clips/keeper_shuffle.glb",
      "type": "glb",
      "bytes": 769164,
      "sha256": "d9521d7e5f679977cce520207ff25bf89b61baa422bfd47edc9eaddab3d211fc"
    },
    {
      "name": "clips/keeper_throw.glb",
      "path": "clips/keeper_throw.glb",
      "type": "glb",
      "bytes": 774400,
      "sha256": "c6406df8816708ae6415d0b76a119a784f6db0c32775226c83c4c7026420e139"
    },
    {
      "name": "motions.json",
      "path": "motions.json",
      "type": "json",
      "bytes": 2500664,
      "sha256": "852d1c5b51f5ba2f9be402ecca2badc6ccf90af16477ba5953eaaba325cfc508"
    },
    {
      "name": "reference/idle_relaxed.glb",
      "path": "reference/idle_relaxed.glb",
      "type": "glb",
      "bytes": 805528,
      "sha256": "81c4324076b0a6b1fde1abb3ab184280dd8e2d243e7cbc92ea23fc9b9ce3322c"
    },
    {
      "name": "reference/keeper-template.glb",
      "path": "reference/keeper-template.glb",
      "type": "glb",
      "bytes": 734924,
      "sha256": "a8ac0d9eb864c2eb3c40c25a2480262790391a2defff172bb9d1ebff6976ad05"
    },
    {
      "name": "reference/run.glb",
      "path": "reference/run.glb",
      "type": "glb",
      "bytes": 775696,
      "sha256": "5c3cc67e5627fbd92281388821579625059847d3b2e0f311d7f8a48e41a18bc7"
    },
    {
      "name": "runtime/player.mjs",
      "path": "runtime/player.mjs",
      "type": "text",
      "bytes": 8055,
      "sha256": "991cc1bb91520918471f3e7fc7948e4ae582a1e37cb61c73bb0e3261a21ad19c"
    }
  ]
});

export function create(options = {}) {
  return createAdapter(metadata, {
    baseURL: new URL('../../../assets/soccer-keeper-motion-v3/', import.meta.url),
    ...options,
  });
}

const adapter = create();
export const { load, ready, get, dispose } = adapter;
export default adapter;
