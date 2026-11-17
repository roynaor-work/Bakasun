// Generated from the audited catalog.json. No asset I/O happens during import.
import { createAdapter } from './runtime.mjs';

export const metadata = Object.freeze({
  "id": "soccer-run-cycles-v3",
  "game": "soccer",
  "flag": "?assetSoccerRunCyclesV3=1",
  "available": true,
  "source": {
    "branch": "codex/soccer-run-cycles-v3",
    "commit": "88f60952c60b495033be14fb9983861e9d74b9c5",
    "root": "workout/island/design/soccer-run-cycles-v3"
  },
  "license": {
    "spdx": "CC0-1.0",
    "note": "LICENSES.md מתעד הקדשת CC0-1.0 לתרומות המקוריות ולשרשרת נכסי הדמויות; ספריות תצוגה וכלי פיתוח שאינם מועתקים שומרים על רישיונם.",
    "files": [
      "LICENSES.md"
    ]
  },
  "bytes": 21883878,
  "runtimeBytes": 21880762,
  "dependencies": [
    "GLTFLoader/AnimationMixer או sampler מבוסס runtime/motions.json; שלד Canonical18. runtime/player.mjs הוא מודול עצמאי ללא imports."
  ],
  "missing": [
    "תרגום עולם, כיוון, אירועי כדור ועוגני תמיכה/IK במעברים שרירותיים באחריות המארח, לפי מהירויות הקטלוג."
  ],
  "assets": [
    {
      "name": "catalog.json",
      "path": "catalog.json",
      "type": "json",
      "bytes": 650934,
      "sha256": "81ec1153a70c21e4998a5de28ff2bf4341c26f52f23a317bb5e3281465be6145"
    },
    {
      "name": "clips/idle_relaxed.glb",
      "path": "clips/idle_relaxed.glb",
      "type": "glb",
      "bytes": 914984,
      "sha256": "1e4151595e43f38762eddcc17c9630441ba8aad10f4b7b2a7159b5ab74e5be86"
    },
    {
      "name": "clips/idle_to_jog.glb",
      "path": "clips/idle_to_jog.glb",
      "type": "glb",
      "bytes": 851144,
      "sha256": "85411229ec0ca242d42a37d672581680d184ff2e270223159f6b0f85b76cde77"
    },
    {
      "name": "clips/idle_to_referee_run.glb",
      "path": "clips/idle_to_referee_run.glb",
      "type": "glb",
      "bytes": 842036,
      "sha256": "9d9a4a74004ef8eeb303e41476c3c0b2e2626898fc20806091fbc9c1f9232b40"
    },
    {
      "name": "clips/idle_to_run.glb",
      "path": "clips/idle_to_run.glb",
      "type": "glb",
      "bytes": 842020,
      "sha256": "b6fa36066077e3f7032be7e04f95ee9ca5afecb7e08531fcf652388cce49031a"
    },
    {
      "name": "clips/idle_to_sprint.glb",
      "path": "clips/idle_to_sprint.glb",
      "type": "glb",
      "bytes": 829264,
      "sha256": "cbe470e8b987e15d435884a9b72addda37722cf9ef3bf3678dccf0af52c89326"
    },
    {
      "name": "clips/jog.glb",
      "path": "clips/jog.glb",
      "type": "glb",
      "bytes": 796388,
      "sha256": "75864543305109937f40710536b02e8ae277d6086abcb7b35c85c2d4f75aa6c7"
    },
    {
      "name": "clips/jog_to_idle.glb",
      "path": "clips/jog_to_idle.glb",
      "type": "glb",
      "bytes": 851144,
      "sha256": "d86933172fd0b1af7412135160ca9c6a318beef671b9f207ddbd401870dfa3ca"
    },
    {
      "name": "clips/keeper_catch_chest.glb",
      "path": "clips/keeper_catch_chest.glb",
      "type": "glb",
      "bytes": 856632,
      "sha256": "6b4c28931134412bede0a08c0088921dad3fbcf52cdd889acdf6e8c4d22d5925"
    },
    {
      "name": "clips/keeper_catch_head.glb",
      "path": "clips/keeper_catch_head.glb",
      "type": "glb",
      "bytes": 856628,
      "sha256": "78259eb7eeace590d0ecbb622e6678b070651207234641f75b337aae90f530c2"
    },
    {
      "name": "clips/keeper_ready_side_steps.glb",
      "path": "clips/keeper_ready_side_steps.glb",
      "type": "glb",
      "bytes": 885824,
      "sha256": "5820475849c73e132c78d1c07f7398dc551bb3654cd9179305e74003a1e3b419"
    },
    {
      "name": "clips/referee_idle.glb",
      "path": "clips/referee_idle.glb",
      "type": "glb",
      "bytes": 914984,
      "sha256": "75271cd100f519eab8cf955056f31cbd4f2b0d2401373857562ab01f1ab154d8"
    },
    {
      "name": "clips/referee_run.glb",
      "path": "clips/referee_run.glb",
      "type": "glb",
      "bytes": 793376,
      "sha256": "3e46685a9695be8d261a55c9c884bbbf4da32f181ad8406fc237006a2ac4311b"
    },
    {
      "name": "clips/referee_run_to_idle.glb",
      "path": "clips/referee_run_to_idle.glb",
      "type": "glb",
      "bytes": 842036,
      "sha256": "168e7c93f5b258afbe3174ed2955b6cd0aed746d77bd638a957668057ad53717"
    },
    {
      "name": "clips/run.glb",
      "path": "clips/run.glb",
      "type": "glb",
      "bytes": 793360,
      "sha256": "78d81e40ca2b52e4c6183aafc7a79ff08a6655f114db1d52a344221dd2df72f1"
    },
    {
      "name": "clips/run_to_idle.glb",
      "path": "clips/run_to_idle.glb",
      "type": "glb",
      "bytes": 842020,
      "sha256": "557b21d4f937901139a5a6b638ad579f47186c8c1fe813b259a59ed0f03e871b"
    },
    {
      "name": "clips/sprint.glb",
      "path": "clips/sprint.glb",
      "type": "glb",
      "bytes": 789096,
      "sha256": "21f6e6bc0af28a87bac03ff147234665144c1b3de8af5a3081f7a7db70cfa1dc"
    },
    {
      "name": "clips/sprint_to_idle.glb",
      "path": "clips/sprint_to_idle.glb",
      "type": "glb",
      "bytes": 829264,
      "sha256": "a24d992f59dc33b2669a36cd7c72be0555f169ff481146b8e33aa39b9ff0175c"
    },
    {
      "name": "reference/mesh-template.glb",
      "path": "reference/mesh-template.glb",
      "type": "glb",
      "bytes": 791120,
      "sha256": "7a8421e3d81cb472435f523a2e99f6d75daa16afe14a423bd25d80d5df6f6b41"
    },
    {
      "name": "runtime/motions.json",
      "path": "runtime/motions.json",
      "type": "json",
      "bytes": 6100251,
      "sha256": "f010d7a0a8e1cba711f587c5d5e989af6140624b015db2eec19d2fbe89e5885e"
    },
    {
      "name": "runtime/player.mjs",
      "path": "runtime/player.mjs",
      "type": "text",
      "bytes": 8257,
      "sha256": "46574043c9db9b55b0ac1a337246fb86b1ac0d0ada342441a97e2063c937836e"
    }
  ]
});

export function create(options = {}) {
  return createAdapter(metadata, {
    baseURL: new URL('../../../assets/soccer-run-cycles-v3/', import.meta.url),
    ...options,
  });
}

const adapter = create();
export const { load, ready, get, dispose } = adapter;
export default adapter;
