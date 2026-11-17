// Generated from the audited catalog.json. No asset I/O happens during import.
import { createAdapter } from './runtime.mjs';

export const metadata = Object.freeze({
  "id": "soccer-kits-venues-v1",
  "game": "soccer",
  "flag": "?assetSoccerKitsVenuesV1=1",
  "available": false,
  "source": {
    "branch": "codex/soccer-kits-venues-v1",
    "commit": "1baae01d299b312a21aaec180d1c04fd335e05d2",
    "root": "workout/island/design/soccer-kits-venues-v1"
  },
  "license": {
    "spdx": "CC0-1.0",
    "note": "LICENSES.md מתעד הקדשת CC0-1.0 לתרומות המקוריות ולשרשרת נכסי הדמויות; ספריות תצוגה וכלי פיתוח שאינם מועתקים שומרים על רישיונם.",
    "files": [
      "LICENSES.md"
    ]
  },
  "bytes": 42012,
  "runtimeBytes": 38399,
  "dependencies": [
    "כל 12 קובצי ה־GLB המקוריים דורשים KHR_draco_mesh_compression; המפענח היחיד בענף הוא WASM ולכן אינו מועתק.",
    "apply.mjs דורש ./vendor/three.module.js של המארח; הוא נמסר כטקסט בלבד."
  ],
  "missing": [
    "חסומות שמונה ערכות, ספריית הספרות ושלוש הזירות: אין חלופה בלתי דחוסה בענף; נדרשת מסירת GLB ללא Draco כדי לטעון תחת איסור WASM."
  ],
  "assets": [
    {
      "name": "apply.mjs",
      "path": "apply.mjs",
      "type": "text",
      "bytes": 2160,
      "sha256": "edd9e7b20274e23e0497ec9648ef5ea999759284d5d5db5d9f67039cb369e06f"
    },
    {
      "name": "kits.json",
      "path": "kits.json",
      "type": "json",
      "bytes": 6804,
      "sha256": "e5b5e6205bf8030b527c2c181b15740faa32d15026053e842f097859be06c6ef"
    },
    {
      "name": "manifest.json",
      "path": "manifest.json",
      "type": "json",
      "bytes": 10067,
      "sha256": "b5a046655b1a5d3c7daba955b25e9ed86630ac8dcbe6f1a895d311ddfbd0e134"
    },
    {
      "name": "rig.json",
      "path": "rig.json",
      "type": "json",
      "bytes": 16218,
      "sha256": "657394da28b78c130b9a33d4cb48fa6f4620f1bdde08a970eeac30e49e26ef04"
    },
    {
      "name": "venues.json",
      "path": "venues.json",
      "type": "json",
      "bytes": 3150,
      "sha256": "ae028984ec065e0a84f77dfc9e3a572a42ebf9a9877141b33c41cc8cb8d37597"
    }
  ]
});

export function create(options = {}) {
  return createAdapter(metadata, {
    baseURL: new URL('../../../assets/soccer-kits-venues-v1/', import.meta.url),
    ...options,
  });
}

const adapter = create();
export const { load, ready, get, dispose } = adapter;
export default adapter;
