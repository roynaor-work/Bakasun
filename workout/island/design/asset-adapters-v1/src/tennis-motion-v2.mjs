// Generated from the audited catalog.json. No asset I/O happens during import.
import { createAdapter } from './runtime.mjs';

export const metadata = Object.freeze({
  "id": "tennis-motion-v2",
  "game": "tennis",
  "flag": "?assetTennisMotionV2=1",
  "available": true,
  "source": {
    "branch": "codex/tennis-motion-v2",
    "commit": "993d242155bac0917e77883416452366abd0ff81",
    "root": "workout/island/design/tennis-motion-v2"
  },
  "license": {
    "spdx": "CC0-1.0",
    "note": "LICENSES.md מתעד הקדשת CC0-1.0 לתרומות המקוריות ולשרשרת נכסי הדמויות; ספריות תצוגה וכלי פיתוח שאינם מועתקים שומרים על רישיונם.",
    "files": [
      "LICENSES.md"
    ]
  },
  "bytes": 7213613,
  "runtimeBytes": 7208380,
  "dependencies": [
    "GLTFLoader/AnimationMixer ו־WebP של המארח; שלד Canonical18 עם racket_mount, grip_hand_L ו־Ball בהתאם לקטלוג.",
    "reference/grip-player.glb הוא מודל זמן ריצה עצמאי, שהועתק ללא שינוי מ־source/reference; הקטלוג המקורי נשמר ללא עריכה."
  ],
  "missing": [
    "יש להשתמש ב־get('reference/grip-player.glb') עבור הדמות: catalog.referenceAsset המקורי מפנה ל־source/reference/grip-player.glb שהועבר אל מחוץ ל־source/.",
    "תנועת העולם בריצה ואירועי פגיעת הכדור נשארים בשליטת הסימולציה; יש למפות את אירועי הקטלוג."
  ],
  "assets": [
    {
      "name": "catalog.json",
      "path": "catalog.json",
      "type": "json",
      "bytes": 81068,
      "sha256": "00ba43d379d68c7446d3a4ba5378a9c44e9d26f4c9c6d16f88af2804a6cb5b1a"
    },
    {
      "name": "height-high.glb",
      "path": "height-high.glb",
      "type": "glb",
      "bytes": 1843668,
      "sha256": "9eefcdc7a8167c7960831077c8f036a15f22cda1d30342f2e48b59bc6f674f0a"
    },
    {
      "name": "height-low.glb",
      "path": "height-low.glb",
      "type": "glb",
      "bytes": 1843640,
      "sha256": "bdb8f21cddd075e13f7dca05bbec3d0aa58d11aedebbecc90f67fbb391c7e4bb"
    },
    {
      "name": "manifest.json",
      "path": "manifest.json",
      "type": "json",
      "bytes": 13217,
      "sha256": "a5c53f1bf20ac6a3c1ab702dd11ed2d5733c10347a979d3b0309c6ae71245cf7"
    },
    {
      "name": "runtime.mjs",
      "path": "runtime.mjs",
      "type": "text",
      "bytes": 6447,
      "sha256": "90924d01b8ca889db8e3ed154b55f6b45a156e8610ff36b344bb3a4806880e96"
    },
    {
      "name": "reference/grip-player.glb",
      "path": "reference/grip-player.glb",
      "type": "glb",
      "bytes": 1576624,
      "sha256": "6f6a95bae86b471f1194b386f5cca3ef25ac01c341d799c624ad10384a357753"
    },
    {
      "name": "tennis-motion-v2.glb",
      "path": "tennis-motion-v2.glb",
      "type": "glb",
      "bytes": 1843716,
      "sha256": "e3a7ed216d28a3135447dbb54f5c8ef9a6d08be49740304fc32663c9bdf37a0a"
    }
  ]
});

export function create(options = {}) {
  return createAdapter(metadata, {
    baseURL: new URL('../../../assets/tennis-motion-v2/', import.meta.url),
    ...options,
  });
}

const adapter = create();
export const { load, ready, get, dispose } = adapter;
export default adapter;
