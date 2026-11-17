// Generated from the audited catalog.json. No asset I/O happens during import.
import { createAdapter } from './runtime.mjs';

export const metadata = Object.freeze({
  "id": "soccer-celebrations-v1",
  "game": "soccer",
  "flag": "?assetSoccerCelebrationsV1=1",
  "available": true,
  "source": {
    "branch": "codex/soccer-celebrations-v1",
    "commit": "ea1cc8199185ad40c58ba77eb7d58c105d368f02",
    "root": "workout/island/design/soccer-celebrations-v1"
  },
  "license": {
    "spdx": "CC0-1.0",
    "note": "LICENSES.md מתעד הקדשת CC0-1.0 לתרומות המקוריות ולשרשרת נכסי הדמויות; ספריות תצוגה וכלי פיתוח שאינם מועתקים שומרים על רישיונם.",
    "files": [
      "LICENSES.md"
    ]
  },
  "bytes": 12055471,
  "runtimeBytes": 12046401,
  "dependencies": [
    "GLTFLoader ו־AnimationMixer; שעון משותף לכל משתתפי הכוריאוגרפיה."
  ],
  "missing": [
    "תנועת העולם אפויה ב־Root: יש להציב מקור קבוצה פעם אחת ולשמור סנכרון משתתפים ומגעים בזמן קטיעה."
  ],
  "assets": [
    {
      "name": "catalog.json",
      "path": "catalog.json",
      "type": "json",
      "bytes": 45601,
      "sha256": "ef8cbf675411ab23f76bd593a7dd09a20d06c051e0d5cda2e9d56e686f20abc6"
    },
    {
      "name": "models/backflip.glb",
      "path": "models/backflip.glb",
      "type": "glb",
      "bytes": 823284,
      "sha256": "00da33df2a0b5d45fdbf46aff0293d19f043e96cf740a16d7781e7f8865098f7"
    },
    {
      "name": "models/chest_bump.glb",
      "path": "models/chest_bump.glb",
      "type": "glb",
      "bytes": 857172,
      "sha256": "cbd099e552d46be6b7a0b16f967065a5dcabb00f8553ffdd7bd3da53ae34ea64"
    },
    {
      "name": "models/circle_five.glb",
      "path": "models/circle_five.glb",
      "type": "glb",
      "bytes": 1044884,
      "sha256": "0419809faf6880f33efa895e19df951f9862c2b0f17b0c1b3f9289710a0f55e5"
    },
    {
      "name": "models/coach_hug.glb",
      "path": "models/coach_hug.glb",
      "type": "glb",
      "bytes": 860976,
      "sha256": "779edd51da04ede774a743e54962a58c91aa5f8fc354ed4876a0678dcc12a3ad"
    },
    {
      "name": "models/crowd_salute.glb",
      "path": "models/crowd_salute.glb",
      "type": "glb",
      "bytes": 811672,
      "sha256": "28701b24810b39a20cb4f28cda18f9a6dda514f62aee64aa2fdcc49a3f71a87c"
    },
    {
      "name": "models/dance.glb",
      "path": "models/dance.glb",
      "type": "glb",
      "bytes": 819292,
      "sha256": "7a787450c4ee9e7479e1c79aed4879775004e4fa0016e4659f38870a29f23df2"
    },
    {
      "name": "models/dance_shuffle.glb",
      "path": "models/dance_shuffle.glb",
      "type": "glb",
      "bytes": 819324,
      "sha256": "16da9f80f9a8cfaa3aabe3e570bd5689984b1c23dc9d1976c451e85e53500570"
    },
    {
      "name": "models/goalkeeper_hang.glb",
      "path": "models/goalkeeper_hang.glb",
      "type": "glb",
      "bytes": 875928,
      "sha256": "3833d89682eb06efa9405bd56fab6cfb7ed90914fee76f469a3c0ee1f610ff87"
    },
    {
      "name": "models/honor_lap.glb",
      "path": "models/honor_lap.glb",
      "type": "glb",
      "bytes": 804968,
      "sha256": "47748a9d8b586dd28cf33b7a1cadbf1294c16ebea53ff4e4a3342e455011d08c"
    },
    {
      "name": "models/knee_slide.glb",
      "path": "models/knee_slide.glb",
      "type": "glb",
      "bytes": 817724,
      "sha256": "37ec56bb87830b44d89be78b17a080897d90aee7dbad132db0e93e712ff5d34d"
    },
    {
      "name": "models/pair_hug.glb",
      "path": "models/pair_hug.glb",
      "type": "glb",
      "bytes": 860976,
      "sha256": "1507bb7f67875789eb76af32014f4107c9e6b19272db786cf5e38b107b6b7f90"
    },
    {
      "name": "models/player_lift.glb",
      "path": "models/player_lift.glb",
      "type": "glb",
      "bytes": 943680,
      "sha256": "d8c9bb517c0a418cc905f2a861595eb944fc614e7f0c335670051a398d9e4c91"
    },
    {
      "name": "models/run_to_stands.glb",
      "path": "models/run_to_stands.glb",
      "type": "glb",
      "bytes": 804968,
      "sha256": "320e54bd8a633cc661c1948aca586711e28999d6c969f6ea90cba3275ddd3d0c"
    },
    {
      "name": "models/trophy_lift.glb",
      "path": "models/trophy_lift.glb",
      "type": "glb",
      "bytes": 855952,
      "sha256": "fc256a927e19740ec96328e1873989ba1e19b9a8c1804a5bdf66e2a944e52f81"
    }
  ]
});

export function create(options = {}) {
  return createAdapter(metadata, {
    baseURL: new URL('../../../assets/soccer-celebrations-v1/', import.meta.url),
    ...options,
  });
}

const adapter = create();
export const { load, ready, get, dispose } = adapter;
export default adapter;
