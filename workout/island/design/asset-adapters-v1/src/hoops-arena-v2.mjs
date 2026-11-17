// Generated from the audited catalog.json. No asset I/O happens during import.
import { createAdapter } from './runtime.mjs';

export const metadata = Object.freeze({
  "id": "hoops-arena-v2",
  "game": "hoops",
  "flag": "?assetHoopsArenaV2=1",
  "available": true,
  "source": {
    "branch": "codex/hoops-arena-v2",
    "commit": "ad2291ae0ebaca2fbe1b7487af5fa7513a67ff4c",
    "root": "workout/island/design/hoops-arena-v2"
  },
  "license": {
    "spdx": "LicenseRef-Repository-Terms",
    "note": "LICENSES.md: האולם, הסלים וטקסטורות המייפל מקוריים; נאמר שתנאי המאגר חלים ושאין הענקת רישיון גורפת נוספת. Three.js MIT הוא תלות תצוגה שאינה מועתקת.",
    "files": [
      "LICENSES.md"
    ]
  },
  "bytes": 2184032,
  "runtimeBytes": 2181151,
  "dependencies": [
    "GLTFLoader עם KHR_mesh_quantization רגיל; אין צורך במפענח או WASM.",
    "תאורה, מיפוי גוון ו־LOD/איחוד ציור באחריות המארח. arena.mjs המקורי דורש bare import של three ושני נתיבי vendor מקומיים שאינם מועתקים."
  ],
  "missing": [
    "בירור תנאי הרישוי של המאגר לפני הפצה מחוץ למאגר; החבילה אינה מעניקה CC0 לנכסים.",
    "לשימוש ב־arena.mjs יש לנתב imports לתלויות Three.js של המארח; במתאם הוא נמסר כטקסט בלבד."
  ],
  "assets": [
    {
      "name": "arena.mjs",
      "path": "arena.mjs",
      "type": "text",
      "bytes": 5394,
      "sha256": "362f22c62e21fab41f657086fb2a198c549ab71c49bfbbb95549cf6e43e16574"
    },
    {
      "name": "assets/arena.glb",
      "path": "assets/arena.glb",
      "type": "glb",
      "bytes": 1907308,
      "sha256": "2862e202332bb37327d258048315b439141f5e294307ff0bcca8c835ca8c0c71"
    },
    {
      "name": "assets/hoop.glb",
      "path": "assets/hoop.glb",
      "type": "glb",
      "bytes": 102284,
      "sha256": "2cf9c65f298f19209139be46142f0a9c69ab22ff80a788311311a1a0b169e41e"
    },
    {
      "name": "manifest.json",
      "path": "manifest.json",
      "type": "json",
      "bytes": 11159,
      "sha256": "d5712fc9af683318d51ee5afc3bc154dd63c12009e80f60de6b960586e4aa7b5"
    },
    {
      "name": "textures/maple-albedo.jpg",
      "path": "textures/maple-albedo.jpg",
      "type": "binary",
      "bytes": 79259,
      "sha256": "e03ebb531d438c60770aa148e34121b198486acbd5d420f62731f1ceb29b7956"
    },
    {
      "name": "textures/maple-normal.png",
      "path": "textures/maple-normal.png",
      "type": "binary",
      "bytes": 51134,
      "sha256": "2df90e55dfc3edaa6013783ef7590c1c6a91f81966e4acf73c1ac82627ef2412"
    },
    {
      "name": "textures/maple-orm.png",
      "path": "textures/maple-orm.png",
      "type": "binary",
      "bytes": 24613,
      "sha256": "ed30585276a1d50c4cb6c9f4118afef0169db378300fd1887808d37c9fb0efec"
    }
  ]
});

export function create(options = {}) {
  return createAdapter(metadata, {
    baseURL: new URL('../../../assets/hoops-arena-v2/', import.meta.url),
    ...options,
  });
}

const adapter = create();
export const { load, ready, get, dispose } = adapter;
export default adapter;
