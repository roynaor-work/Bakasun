// Generated from the audited catalog.json. No asset I/O happens during import.
import { createAdapter } from './runtime.mjs';

export const metadata = Object.freeze({
  "id": "boars-weapons-v2",
  "game": "boars",
  "flag": "?assetBoarsWeaponsV2=1",
  "available": true,
  "source": {
    "branch": "codex/boars-weapons-v2",
    "commit": "2a37b4d669b7085d21f8a43689b913c6b0c6c6ee",
    "root": "workout/island/design/boars-weapons-v2"
  },
  "license": {
    "spdx": "CC0-1.0 AND MIT",
    "note": "LICENSE.txt: נכסי אמנות CC0-1.0, קוד ונתוני מסירה MIT.",
    "files": [
      "LICENSE.txt"
    ]
  },
  "bytes": 694540,
  "runtimeBytes": 691752,
  "dependencies": [
    "GLTFLoader רגיל ללא Draco; effects.mjs מקבל את THREE של המארח ומוחזר כטקסט; שמע OGG/MP3."
  ],
  "missing": [
    "מניפסט האופליין ב־main אינו כולל דלי boars; יש לחבר games.boars או לבחור שיוך במועד האינטגרציה.",
    "חיבור מסלולי קליעים, פיזור, פגיעות ו־WeaponEffects; ספריות/מודל Draco המוזכרים בסעיף preview אינם חלק מתכנית ההעתקה."
  ],
  "assets": [
    {
      "name": "audio/cannon.mp3",
      "path": "audio/cannon.mp3",
      "type": "binary",
      "bytes": 6783,
      "sha256": "8fed5cd359f61a4937e55a930ce82467be9d13c86cfce2f583ffeda83f69161e"
    },
    {
      "name": "audio/cannon.ogg",
      "path": "audio/cannon.ogg",
      "type": "binary",
      "bytes": 7031,
      "sha256": "680ba892d3ee535ea7f76562ed5e6da73332f3442dd9878fa2d06561b5b66d76"
    },
    {
      "name": "audio/cannon2.mp3",
      "path": "audio/cannon2.mp3",
      "type": "binary",
      "bytes": 8507,
      "sha256": "a74e9c6805c50f5ceb07d974deb38b14d560dbc3e010de6e9186bd3a98fe34cd"
    },
    {
      "name": "audio/cannon2.ogg",
      "path": "audio/cannon2.ogg",
      "type": "binary",
      "bytes": 7501,
      "sha256": "6e88cc3cd49f573ed351cb4795891a0bcf5c5eb6a25c697d842f7844e64d476d"
    },
    {
      "name": "audio/cannon3.mp3",
      "path": "audio/cannon3.mp3",
      "type": "binary",
      "bytes": 4746,
      "sha256": "4db009dbfff14dc4249d104566cb87b4c5a98a0a414fb2792b88bf70eccc04ca"
    },
    {
      "name": "audio/cannon3.ogg",
      "path": "audio/cannon3.ogg",
      "type": "binary",
      "bytes": 5655,
      "sha256": "5d645b0411dba772220ff720167c12deddc2922fbec2f58a871baa2b33fb80b0"
    },
    {
      "name": "audio/impact-cannon.mp3",
      "path": "audio/impact-cannon.mp3",
      "type": "binary",
      "bytes": 5373,
      "sha256": "b616fd69bf1816c397028ab0f609f4019b05058ae0f30f81a096469f52a2502d"
    },
    {
      "name": "audio/impact-cannon.ogg",
      "path": "audio/impact-cannon.ogg",
      "type": "binary",
      "bytes": 6500,
      "sha256": "194436d52d687d81491874aa801ee126696521ac87957e78f36ed53cb9c5c4d1"
    },
    {
      "name": "audio/impact-cannon2.mp3",
      "path": "audio/impact-cannon2.mp3",
      "type": "binary",
      "bytes": 7097,
      "sha256": "7a60362725b2a707d35419d7eec38525e20b89bce0878de56032814be1d5249d"
    },
    {
      "name": "audio/impact-cannon2.ogg",
      "path": "audio/impact-cannon2.ogg",
      "type": "binary",
      "bytes": 7174,
      "sha256": "50a5f480866202bf74c076421e6c970fe727b0fee500012a7f4f7e1ccaaaa015"
    },
    {
      "name": "audio/impact-cannon3.mp3",
      "path": "audio/impact-cannon3.mp3",
      "type": "binary",
      "bytes": 6000,
      "sha256": "3b57bb1a8b08dfdcde846d00a46acb1d1cbb14910e9e76670b644b8a63827672"
    },
    {
      "name": "audio/impact-cannon3.ogg",
      "path": "audio/impact-cannon3.ogg",
      "type": "binary",
      "bytes": 7104,
      "sha256": "bbfc7e3c4ae089b5e3d88a7c40368c894f74e795b58e823291c8f52820cac5ca"
    },
    {
      "name": "audio/impact-shotgun-1.mp3",
      "path": "audio/impact-shotgun-1.mp3",
      "type": "binary",
      "bytes": 1611,
      "sha256": "bb5d139fe2a935c10cf4ba5e6b84b2c8e4ffe5b99e2e786b599808fb15126ab1"
    },
    {
      "name": "audio/impact-shotgun-1.ogg",
      "path": "audio/impact-shotgun-1.ogg",
      "type": "binary",
      "bytes": 4422,
      "sha256": "6907c91a8b69468963b5c951891cf8499b434b3685f17451991cd242555e160e"
    },
    {
      "name": "audio/impact-shotgun-2.mp3",
      "path": "audio/impact-shotgun-2.mp3",
      "type": "binary",
      "bytes": 1768,
      "sha256": "8c8f3423bf0c26c95f0e627daf767e1c917d1638ba67fe09190dd9ad12dc2675"
    },
    {
      "name": "audio/impact-shotgun-2.ogg",
      "path": "audio/impact-shotgun-2.ogg",
      "type": "binary",
      "bytes": 4526,
      "sha256": "6d564c719082f201c38fdc0d49bf9ae5c594f863d2ddca905af1b1e6361f10f7"
    },
    {
      "name": "audio/impact-shotgun-3.mp3",
      "path": "audio/impact-shotgun-3.mp3",
      "type": "binary",
      "bytes": 1925,
      "sha256": "dbea39aba38eba6babe5b7761ceec611f242db7e6e994c978634adbf5a77802f"
    },
    {
      "name": "audio/impact-shotgun-3.ogg",
      "path": "audio/impact-shotgun-3.ogg",
      "type": "binary",
      "bytes": 4658,
      "sha256": "eb319448415ec8a147c88d07b6ef898925fb71314d30ede85dfa4a183c2c5014"
    },
    {
      "name": "audio/impact-shotgun-4.mp3",
      "path": "audio/impact-shotgun-4.mp3",
      "type": "binary",
      "bytes": 2081,
      "sha256": "5eca3e04298d414394531ce36a6b2456f895b25cc566a31924fc9d517544c3ed"
    },
    {
      "name": "audio/impact-shotgun-4.ogg",
      "path": "audio/impact-shotgun-4.ogg",
      "type": "binary",
      "bytes": 4779,
      "sha256": "9d693b61057865f3cf47a59f730f19eaad581764828f742354373286ff1f609d"
    },
    {
      "name": "audio/mortarWhistle.mp3",
      "path": "audio/mortarWhistle.mp3",
      "type": "binary",
      "bytes": 6000,
      "sha256": "f49b0d38dd8a408a2555c50d6cc6f055a4c4d4da90b48d15ffd7dab6e4637f70"
    },
    {
      "name": "audio/mortarWhistle.ogg",
      "path": "audio/mortarWhistle.ogg",
      "type": "binary",
      "bytes": 7117,
      "sha256": "61e60a3ac0a58996253573047cc0f0c421b44fde94389dd18798270815447f71"
    },
    {
      "name": "audio/shellWhistle.mp3",
      "path": "audio/shellWhistle.mp3",
      "type": "binary",
      "bytes": 4276,
      "sha256": "ba02271e214a2370b14981c2fb1efb3b3bc0206cb90e14a16ff64e383e6c6928"
    },
    {
      "name": "audio/shellWhistle.ogg",
      "path": "audio/shellWhistle.ogg",
      "type": "binary",
      "bytes": 6183,
      "sha256": "716ce1dd01dafd32f12a6434b32ccf0762c77460afe63aedde34702683e1387d"
    },
    {
      "name": "audio/shotgun.mp3",
      "path": "audio/shotgun.mp3",
      "type": "binary",
      "bytes": 3805,
      "sha256": "4772bf08c7082ebbae8cd750e61a254adcf36d2111b8550e3dd2dde3e4a91ca5"
    },
    {
      "name": "audio/shotgun.ogg",
      "path": "audio/shotgun.ogg",
      "type": "binary",
      "bytes": 6218,
      "sha256": "6a80efcd151e1eaf2b1d8fc368a37f55c41124570ec879c783f3e53d1f7b2cbc"
    },
    {
      "name": "audio/shotgun2.mp3",
      "path": "audio/shotgun2.mp3",
      "type": "binary",
      "bytes": 4746,
      "sha256": "236db1f9d851492bb34b031973c1133753a176c0b0992bd9ee7c7cc6f18d699f"
    },
    {
      "name": "audio/shotgun2.ogg",
      "path": "audio/shotgun2.ogg",
      "type": "binary",
      "bytes": 6960,
      "sha256": "f4f98bf0bc26dfd07e601748c46cf1d8b503b1a12fbff8763c6d016b2eef97dd"
    },
    {
      "name": "audio/shotgun3.mp3",
      "path": "audio/shotgun3.mp3",
      "type": "binary",
      "bytes": 3022,
      "sha256": "9de1a3d6da5f24d55c99d03d6143126060f8a442921a292cab6a1ee0f33dc17f"
    },
    {
      "name": "audio/shotgun3.ogg",
      "path": "audio/shotgun3.ogg",
      "type": "binary",
      "bytes": 5637,
      "sha256": "35fa08e7b5b41bfd546877b136f668de57b949a3ce4de5c80c9482fef404b05f"
    },
    {
      "name": "effects.mjs",
      "path": "effects.mjs",
      "type": "text",
      "bytes": 4960,
      "sha256": "14c4428226a29888ea4f6475d383cd9ea3dc69cddf50d5a23a986a47318c7402"
    },
    {
      "name": "manifest.json",
      "path": "manifest.json",
      "type": "json",
      "bytes": 27041,
      "sha256": "dd413b0faae9dadf69a8f088b387738cdac6ec10208418fecb822479f12bd355"
    },
    {
      "name": "models/ground-crater.glb",
      "path": "models/ground-crater.glb",
      "type": "glb",
      "bytes": 11544,
      "sha256": "af01396d3eaf9e602f14b46007a90a80e99b7cbbec966b3311f7677b2642f673"
    },
    {
      "name": "models/shell-large.glb",
      "path": "models/shell-large.glb",
      "type": "glb",
      "bytes": 25200,
      "sha256": "5e8537a3eefc55f5275e333d74a59e2c65234661c8244feb5282e91756b91904"
    },
    {
      "name": "models/shell-mortar.glb",
      "path": "models/shell-mortar.glb",
      "type": "glb",
      "bytes": 20024,
      "sha256": "1de76b15de21a441f3c4b0ceedd03c51fa2a9755fd15653575a555664e37d6c3"
    },
    {
      "name": "models/shell-regular.glb",
      "path": "models/shell-regular.glb",
      "type": "glb",
      "bytes": 22848,
      "sha256": "af75fa39b5455df2e33dddad618b34219b18dfdc3317411927ad5b93ea62fe58"
    },
    {
      "name": "textures/weapons-atlas.png",
      "path": "textures/weapons-atlas.png",
      "type": "binary",
      "bytes": 420930,
      "sha256": "b957b919961ee9444ec9009042b7a116e181d4b8c1ee71b0d0a91e90456807ea"
    }
  ]
});

export function create(options = {}) {
  return createAdapter(metadata, {
    baseURL: new URL('../../../assets/boars-weapons-v2/', import.meta.url),
    ...options,
  });
}

const adapter = create();
export const { load, ready, get, dispose } = adapter;
export default adapter;
