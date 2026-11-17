// Generated from the audited catalog.json. No asset I/O happens during import.
import { createAdapter } from './runtime.mjs';

export const metadata = Object.freeze({
  "id": "catch-vehicles-v2",
  "game": "catch",
  "flag": "?assetCatchVehiclesV2=1",
  "available": true,
  "source": {
    "branch": "codex/catch-vehicles-v2",
    "commit": "1e18fbe32309ab149c13bd2cc69efba7d8be012f",
    "root": "workout/island/design/catch-vehicles-v2"
  },
  "license": {
    "spdx": "CC0-1.0",
    "note": "LICENSES.md: הקדשת נכסי החבילה CC0-1.0; רישיונות ספריות תצוגה אינם מועתקים משום שאינן נכללות.",
    "files": [
      "LICENSES.md"
    ]
  },
  "bytes": 3769619,
  "runtimeBytes": 3765746,
  "dependencies": [
    "GLTFLoader/AnimationMixer במארח; בקר הרכב כטקסט משתמש ב־./vendor/engine.mjs המיועד לתצוגה ואינו מועתק."
  ],
  "missing": [
    "לפני ייבוא vehicle-controller.mjs יש להתאים את ייבוא המנוע ל־Three.js המקומי של המארח או לספק loadAsset מותאם; הפונקציות אינן מופעלות אוטומטית.",
    "נדרשת בחירת סצנה intact/damaged/crushed והפעלת בקר אחד לכל גלגל; אין להריץ בקר ו־AnimationMixer על אותו גלגל."
  ],
  "assets": [
    {
      "name": "manifest.json",
      "path": "manifest.json",
      "type": "json",
      "bytes": 31787,
      "sha256": "0b9064b828c851e54f66da52a18770d23b50f02622637994da42fc57becb827a"
    },
    {
      "name": "models/fugitive-classic.glb",
      "path": "models/fugitive-classic.glb",
      "type": "glb",
      "bytes": 275260,
      "sha256": "2a03df40433e0215408d2f62583cb500984287f94adad6be4415a3dd00d7f223"
    },
    {
      "name": "models/fugitive-motorcycle.glb",
      "path": "models/fugitive-motorcycle.glb",
      "type": "glb",
      "bytes": 177172,
      "sha256": "d8df5822a0595aa75c5de15a4a4fd2d1546710c248a97740727e1cf1fcd77643"
    },
    {
      "name": "models/fugitive-scooter.glb",
      "path": "models/fugitive-scooter.glb",
      "type": "glb",
      "bytes": 167028,
      "sha256": "959eb9d3ba2849999990e69d3219b225d15570f6771ab65dafbdca5bfbe2a654"
    },
    {
      "name": "models/fugitive-sport.glb",
      "path": "models/fugitive-sport.glb",
      "type": "glb",
      "bytes": 287992,
      "sha256": "76593efcb20c132f57b2f4a63ff7c52c93323a43d603ab2d7747f152c9cd9f8e"
    },
    {
      "name": "models/fugitive-suv.glb",
      "path": "models/fugitive-suv.glb",
      "type": "glb",
      "bytes": 297636,
      "sha256": "dd95d4e1e3f454d9e08804ecc36c081b4500cc4896aa4d9de7b7f338d7ebe7ed"
    },
    {
      "name": "models/fugitive-taxi.glb",
      "path": "models/fugitive-taxi.glb",
      "type": "glb",
      "bytes": 295380,
      "sha256": "1ac39590e8951c6e226427267dc73fb44754670f606ab59c1bada0a49c7562db"
    },
    {
      "name": "models/fugitive-truck.glb",
      "path": "models/fugitive-truck.glb",
      "type": "glb",
      "bytes": 282248,
      "sha256": "fcbd06ffb91569c328b398e04d5cfa60620dd277f084788b59e28c33c51ebb28"
    },
    {
      "name": "models/fugitive-van.glb",
      "path": "models/fugitive-van.glb",
      "type": "glb",
      "bytes": 282248,
      "sha256": "cec4b4f62089bb6cc4ff92a8b46becbb07b09112a01c2806b4a654ebd3d9b471"
    },
    {
      "name": "models/police-dirt-bike.glb",
      "path": "models/police-dirt-bike.glb",
      "type": "glb",
      "bytes": 211780,
      "sha256": "299c77a66e3947f79832d6368fdb0f7d6e7a28723cc8f862c5be6608c92891af"
    },
    {
      "name": "models/police-luxury.glb",
      "path": "models/police-luxury.glb",
      "type": "glb",
      "bytes": 298348,
      "sha256": "e9317b72d6708a5af72556cf476eba958a6e36df40659896ceeaf612095696ed"
    },
    {
      "name": "models/police-sedan.glb",
      "path": "models/police-sedan.glb",
      "type": "glb",
      "bytes": 296372,
      "sha256": "209856c848281f7f16dd453c90db7fee6da83d8c7669d17e5b5e982a61ceef95"
    },
    {
      "name": "models/police-suv.glb",
      "path": "models/police-suv.glb",
      "type": "glb",
      "bytes": 321508,
      "sha256": "27f0d0830a4f092c4c38794ae2d163e12731f59023c360226601726ae8b987fa"
    },
    {
      "name": "models/police-touring-bike.glb",
      "path": "models/police-touring-bike.glb",
      "type": "glb",
      "bytes": 221516,
      "sha256": "8df52821b26cb250751632caaabec09c9aa5393013407c6cde979d56b4e27fcc"
    },
    {
      "name": "models/police-van.glb",
      "path": "models/police-van.glb",
      "type": "glb",
      "bytes": 308392,
      "sha256": "2541fdb9cc63b1417ee16fc9ef4ba838900877f42f88e4edbbf7236a24df898f"
    },
    {
      "name": "vehicle-controller.mjs",
      "path": "vehicle-controller.mjs",
      "type": "text",
      "bytes": 11079,
      "sha256": "990e017aa480e492841b291be88297033c078931dd9850257aab23c8bdf4ec56"
    }
  ]
});

export function create(options = {}) {
  return createAdapter(metadata, {
    baseURL: new URL('../../../assets/catch-vehicles-v2/', import.meta.url),
    ...options,
  });
}

const adapter = create();
export const { load, ready, get, dispose } = adapter;
export default adapter;
