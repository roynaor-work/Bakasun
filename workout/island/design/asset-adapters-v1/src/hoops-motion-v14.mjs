// Generated from the audited catalog.json. No asset I/O happens during import.
import { createAdapter } from './runtime.mjs';

export const metadata = Object.freeze({
  "id": "hoops-motion-v14",
  "game": "hoops",
  "flag": "?assetHoopsMotionV14=1",
  "available": true,
  "source": {
    "branch": "codex/hoops-motion-v14",
    "commit": "8650faa60ba23ae1f3e12c9d7ed54cc60e239f3f",
    "root": "workout/island/design/hoops-motion-v14"
  },
  "license": {
    "spdx": "CC0-1.0",
    "note": "LICENSES.md מתעד הקדשת CC0-1.0 לתרומות המקוריות ולשרשרת נכסי הדמויות; ספריות תצוגה וכלי פיתוח שאינם מועתקים שומרים על רישיונם.",
    "files": [
      "LICENSES.md",
      "LICENSE"
    ]
  },
  "bytes": 12006563,
  "runtimeBytes": 12003413,
  "dependencies": [
    "שלד Canonical18 ו־GLTFLoader/AnimationMixer של המארח; runtime/reference/athlete.glb כלול.",
    "runtime/player.mjs תלוי ב־../../soccer-header-v1/runtime/player.mjs; ההעתקה שומרת אותו כטקסט בלבד.",
    "קטלוג referenceClips מפנה ל־hoops-motion-v13 עבור idle/run; אלה הפניות למעברים ואינם חלק מ־20 קליפי v14."
  ],
  "missing": [
    "אם משתמשים בגשרי ה־JavaScript המקוריים, יש לנתב את הייבוא המשותף ל־soccer-header-v1 ולמפות את הפניות v13 לנכסים זמינים."
  ],
  "assets": [
    {
      "name": "catalog.json",
      "path": "catalog.json",
      "type": "json",
      "bytes": 2823357,
      "sha256": "60c2db5ac334a097943c7265d7802c517f561d26a22943c048ed1c722e9b0f21"
    },
    {
      "name": "runtime/catalog.json",
      "path": "runtime/catalog.json",
      "type": "json",
      "bytes": 2822988,
      "sha256": "fb0548c853e6d54619b044101bc7bf81bc03c422dae602c05e207325489fc405"
    },
    {
      "name": "runtime/clips/block_jump.glb",
      "path": "runtime/clips/block_jump.glb",
      "type": "glb",
      "bytes": 44568,
      "sha256": "d2bb2754d03f8f16bbdd1b70581f2f6230ea87f3e5a59f496e8714b9fda7f932"
    },
    {
      "name": "runtime/clips/block_reach.glb",
      "path": "runtime/clips/block_reach.glb",
      "type": "glb",
      "bytes": 44568,
      "sha256": "fce10cd497be3ed72de0ea69c5990ae01a7733a4405934406cec2b6cb66efc84"
    },
    {
      "name": "runtime/clips/celebrate_score.glb",
      "path": "runtime/clips/celebrate_score.glb",
      "type": "glb",
      "bytes": 35420,
      "sha256": "27e43f16c57ddfff18a540d9c75ae99c0e57213344bc5d8ed76ba2b10b0ce5df"
    },
    {
      "name": "runtime/clips/disappointed.glb",
      "path": "runtime/clips/disappointed.glb",
      "type": "glb",
      "bytes": 35416,
      "sha256": "eaee0d1cb12ca0e0888e777c34b87f272f95ce068d640bd5ddf7ac560eaba6de"
    },
    {
      "name": "runtime/clips/dribble_behind.glb",
      "path": "runtime/clips/dribble_behind.glb",
      "type": "glb",
      "bytes": 35388,
      "sha256": "9fe0ca84c5141a3ce7d7c1ffd9b1ce6900785d769a87ef4d0754f1c1a74d6056"
    },
    {
      "name": "runtime/clips/dribble_between.glb",
      "path": "runtime/clips/dribble_between.glb",
      "type": "glb",
      "bytes": 35392,
      "sha256": "a24b4ae80cd925a5e7cf583192f3a2a0c7f8e14164c676e38cd36a2e94599767"
    },
    {
      "name": "runtime/clips/dunk_reverse.glb",
      "path": "runtime/clips/dunk_reverse.glb",
      "type": "glb",
      "bytes": 48220,
      "sha256": "6b302c5ac5da683e7e1e3c714d0b00654074f186c7e33b210c9f2ccf5e3e8f29"
    },
    {
      "name": "runtime/clips/dunk_two_hand.glb",
      "path": "runtime/clips/dunk_two_hand.glb",
      "type": "glb",
      "bytes": 48224,
      "sha256": "5baf0c8b4f530f5c1a5eef8430d4be6e11bc0d2bda7e776cc47e06d05afaaa1a"
    },
    {
      "name": "runtime/clips/fadeaway.glb",
      "path": "runtime/clips/fadeaway.glb",
      "type": "glb",
      "bytes": 44564,
      "sha256": "566957282a1a4020a91fe922dfcf60b131a936e758fe4e2f1f2596dc45d939b7"
    },
    {
      "name": "runtime/clips/free_throw_follow.glb",
      "path": "runtime/clips/free_throw_follow.glb",
      "type": "glb",
      "bytes": 26260,
      "sha256": "422d9d66e1e7a81b2893e4f5c0e0b345fe026cf8f9a661d2d4c0ccdae923c361"
    },
    {
      "name": "runtime/clips/free_throw_prepare.glb",
      "path": "runtime/clips/free_throw_prepare.glb",
      "type": "glb",
      "bytes": 22596,
      "sha256": "38595a839b8bf2fffe5fb81cb9c660a90ecb6d93331cf3a7355ea5a1c35b6a8e"
    },
    {
      "name": "runtime/clips/free_throw_release.glb",
      "path": "runtime/clips/free_throw_release.glb",
      "type": "glb",
      "bytes": 17116,
      "sha256": "ef672876dd31b7dcc1db43ed18e5932d260a8d913fc7ccbe626e5eaf5c163dcc"
    },
    {
      "name": "runtime/clips/help_up.glb",
      "path": "runtime/clips/help_up.glb",
      "type": "glb",
      "bytes": 49984,
      "sha256": "9919266d2c4c1f68ca79fefa2b7fc5c1e1430d15e138fdc267ef0a078e17db9b"
    },
    {
      "name": "runtime/clips/layup_left.glb",
      "path": "runtime/clips/layup_left.glb",
      "type": "glb",
      "bytes": 44564,
      "sha256": "e0500d79d3ea575f30f2191f9348d4450e32bd7ce0a9021f713a1e0a2de34667"
    },
    {
      "name": "runtime/clips/layup_right.glb",
      "path": "runtime/clips/layup_right.glb",
      "type": "glb",
      "bytes": 44568,
      "sha256": "03a1db028a2f9a852308ff86f78cb6a2e10bc50806d2ef9d4cc77d5f307f4c2b"
    },
    {
      "name": "runtime/clips/pass_chest.glb",
      "path": "runtime/clips/pass_chest.glb",
      "type": "glb",
      "bytes": 31736,
      "sha256": "0155ca2e2b37334db658954eda4189e18511bfa73d1a962cc1d413787a97efb6"
    },
    {
      "name": "runtime/clips/pass_jump.glb",
      "path": "runtime/clips/pass_jump.glb",
      "type": "glb",
      "bytes": 37228,
      "sha256": "8f97aa0677f0dc6fb313e85505f738fff8ddea4405c13287a0336c14dde8f4ad"
    },
    {
      "name": "runtime/clips/pass_overhead.glb",
      "path": "runtime/clips/pass_overhead.glb",
      "type": "glb",
      "bytes": 38148,
      "sha256": "64b96b7366c66e3c66ce6b4cc06954b9cf21256ce207455daf2fcc31dbdbb2ba"
    },
    {
      "name": "runtime/clips/pivot.glb",
      "path": "runtime/clips/pivot.glb",
      "type": "glb",
      "bytes": 42680,
      "sha256": "8cac57c5040cc977824e7c6a2cc547354bbdc6bee0344b2edf3d90ad4d14f6a4"
    },
    {
      "name": "runtime/clips/steal_sprint.glb",
      "path": "runtime/clips/steal_sprint.glb",
      "type": "glb",
      "bytes": 30532,
      "sha256": "5e693f3048d99f27f6ab0c7ad56a59ae116bcb5dc75fa66c8dbb7088d40f090d"
    },
    {
      "name": "runtime/motion.json",
      "path": "runtime/motion.json",
      "type": "json",
      "bytes": 427069,
      "sha256": "14023cb4f649ce4425afe4de55cd79787a141a27e3e93395413c01aa4d058755"
    },
    {
      "name": "runtime/motions.json",
      "path": "runtime/motions.json",
      "type": "json",
      "bytes": 4046045,
      "sha256": "04120820fbeba172d9ec7c0f4568c2a3936c24722d4fa7659b64f81a4383c75f"
    },
    {
      "name": "runtime/player.mjs",
      "path": "runtime/player.mjs",
      "type": "text",
      "bytes": 2414,
      "sha256": "e01e8280769ccea24d6f288773c5f5750d9d60c9a1e12f48891c887df9b479d4"
    },
    {
      "name": "runtime/reference/athlete.glb",
      "path": "runtime/reference/athlete.glb",
      "type": "glb",
      "bytes": 1124368,
      "sha256": "26135088b73dea8674fba04b87d255a43eb49c44f8cab1697237cec34a8878ca"
    }
  ]
});

export function create(options = {}) {
  return createAdapter(metadata, {
    baseURL: new URL('../../../assets/hoops-motion-v14/', import.meta.url),
    ...options,
  });
}

const adapter = create();
export const { load, ready, get, dispose } = adapter;
export default adapter;
