// Generated from the audited catalog.json. No asset I/O happens during import.
import { createAdapter } from './runtime.mjs';

export const metadata = Object.freeze({
  "id": "alien-enemies-v2",
  "game": "alien",
  "flag": "?assetAlienEnemiesV2=1",
  "available": true,
  "source": {
    "branch": "codex/alien-enemies-v2",
    "commit": "edfdb66e3710146375471d6c8b9cad388a5d0651",
    "root": "workout/island/design/alien-enemies-v2"
  },
  "license": {
    "spdx": "CC0-1.0",
    "note": "LICENSE.txt: הקדשת נכסי החבילה CC0-1.0; רישיונות ספריות תצוגה אינם מועתקים משום שאינן נכללות.",
    "files": [
      "LICENSE.txt"
    ]
  },
  "bytes": 2923264,
  "runtimeBytes": 2922071,
  "dependencies": [
    "Canvas/WebGL עם תמיכת PNG; patterns.json מגדיר מסלולים ותקיפות לצריכת מנוע המשחק."
  ],
  "missing": [
    "חיבור hitbox, שריון, פיצול והתחמקות לקוד הפגיעות; אטלסי המסגרות ומסלולי JSON אינם סימולציית המשחק."
  ],
  "assets": [
    {
      "name": "manifest.json",
      "path": "manifest.json",
      "type": "json",
      "bytes": 33052,
      "sha256": "ba18d135ba66d7445c4c3b99eac657e12d33b44fd337b0fdc053a48b781d354b"
    },
    {
      "name": "patterns.json",
      "path": "patterns.json",
      "type": "json",
      "bytes": 23168,
      "sha256": "d8d5f1f8a943aa3473592cd70c089380e5c9a1f05388cd9155b97f3ed43ade36"
    },
    {
      "name": "sprites/cloud/atlas.png",
      "path": "sprites/cloud/atlas.png",
      "type": "binary",
      "bytes": 178537,
      "sha256": "ff346e862c35d4fb9cf28b6a6d2b74fb223c1d51599054e82f1af7f8c1a2559c"
    },
    {
      "name": "sprites/cloud/damage-1.png",
      "path": "sprites/cloud/damage-1.png",
      "type": "binary",
      "bytes": 9449,
      "sha256": "8a8e7f3e531ecb2977b39e31345f9a68f4b0ecf729379dda935df477e916641f"
    },
    {
      "name": "sprites/cloud/damage-2.png",
      "path": "sprites/cloud/damage-2.png",
      "type": "binary",
      "bytes": 10160,
      "sha256": "d7204a09c02f0e470d1a844c41a2d522fce1c164674467952d85ac2e93e620a5"
    },
    {
      "name": "sprites/cloud/sprite.png",
      "path": "sprites/cloud/sprite.png",
      "type": "binary",
      "bytes": 9254,
      "sha256": "f8600a14b6daf77ccbd8f3d3acacbf3e06906deb6f516d77977ad747597ae775"
    },
    {
      "name": "sprites/diver/atlas.png",
      "path": "sprites/diver/atlas.png",
      "type": "binary",
      "bytes": 232778,
      "sha256": "fa5f6cdc9d3ea3b7093e067eccab34eed0c04001edcb24af88bca040a21955bd"
    },
    {
      "name": "sprites/diver/damage-1.png",
      "path": "sprites/diver/damage-1.png",
      "type": "binary",
      "bytes": 13336,
      "sha256": "b13817c0c919d7f422ff18cb29698a40aa7cd50e14595070b2a00859cc9fa35a"
    },
    {
      "name": "sprites/diver/damage-2.png",
      "path": "sprites/diver/damage-2.png",
      "type": "binary",
      "bytes": 13627,
      "sha256": "3e2977ee040c0283078af58d94197098413a7483d512b6ffb8478bd98606557f"
    },
    {
      "name": "sprites/diver/sprite.png",
      "path": "sprites/diver/sprite.png",
      "type": "binary",
      "bytes": 13167,
      "sha256": "ec003d24220d7a21b3b2adaa2d16c03e43249eddc6d9b2aa6eae871f158d0724"
    },
    {
      "name": "sprites/dodger/atlas.png",
      "path": "sprites/dodger/atlas.png",
      "type": "binary",
      "bytes": 197201,
      "sha256": "50a07a69476031426770884cdfa8a761d6aa78c736f9410e889fb9db4169bf43"
    },
    {
      "name": "sprites/dodger/damage-1.png",
      "path": "sprites/dodger/damage-1.png",
      "type": "binary",
      "bytes": 9969,
      "sha256": "807c2726caf958288cf98c3ff220e54a6e5e0a8006f789233dca9e2fdadb5a90"
    },
    {
      "name": "sprites/dodger/damage-2.png",
      "path": "sprites/dodger/damage-2.png",
      "type": "binary",
      "bytes": 10815,
      "sha256": "8603db6d85e8400b6b187618e9673c6c86b76e3a4b2412c13c0be8d0f6e86e5c"
    },
    {
      "name": "sprites/dodger/sprite.png",
      "path": "sprites/dodger/sprite.png",
      "type": "binary",
      "bytes": 9812,
      "sha256": "b2a6cd9c8ec45282ca79b79077181a6ec693c92769c113ea2cf801e8cd4c36c4"
    },
    {
      "name": "sprites/flying-eye/atlas.png",
      "path": "sprites/flying-eye/atlas.png",
      "type": "binary",
      "bytes": 178346,
      "sha256": "d9e9f97e900dc3f692ea1f733c56875701863f803b5b9c0525f26ed5f320e2db"
    },
    {
      "name": "sprites/flying-eye/damage-1.png",
      "path": "sprites/flying-eye/damage-1.png",
      "type": "binary",
      "bytes": 9620,
      "sha256": "76804c8acc0dfbd62020f4455b3637ea46571c8e577904043a7a0e18ae7633af"
    },
    {
      "name": "sprites/flying-eye/damage-2.png",
      "path": "sprites/flying-eye/damage-2.png",
      "type": "binary",
      "bytes": 10489,
      "sha256": "27143962343f7959f11757493084c782f43e403d4001391d0ce88dd73ae62f60"
    },
    {
      "name": "sprites/flying-eye/sprite.png",
      "path": "sprites/flying-eye/sprite.png",
      "type": "binary",
      "bytes": 9358,
      "sha256": "c056be397630e3ddf41f8a0ff7bb523909b7509aef9dcd3ee3819e85f783cf99"
    },
    {
      "name": "sprites/laser/atlas.png",
      "path": "sprites/laser/atlas.png",
      "type": "binary",
      "bytes": 182175,
      "sha256": "0363bf944e47d8d2157abcc14206d9a499659a88e2a07703eaa95c09776f5a19"
    },
    {
      "name": "sprites/laser/damage-1.png",
      "path": "sprites/laser/damage-1.png",
      "type": "binary",
      "bytes": 10772,
      "sha256": "fb9e4b0714f284d3ec9797687fdc355246762ec9488611e001b7f5008be1d350"
    },
    {
      "name": "sprites/laser/damage-2.png",
      "path": "sprites/laser/damage-2.png",
      "type": "binary",
      "bytes": 10753,
      "sha256": "db18af375929068babb063555110128ca49abd208eff13afdf645272c2aa4669"
    },
    {
      "name": "sprites/laser/sprite.png",
      "path": "sprites/laser/sprite.png",
      "type": "binary",
      "bytes": 10461,
      "sha256": "6d1f9cf9b32f2ceccfa562d9d27f42e45cd91a0f0144c32ca2d71355560c6a2d"
    },
    {
      "name": "sprites/missile/atlas.png",
      "path": "sprites/missile/atlas.png",
      "type": "binary",
      "bytes": 205706,
      "sha256": "8a32002005cc470d8d2363d34b8a49a33a4770b740708ee7d949a255dc4aefb3"
    },
    {
      "name": "sprites/missile/damage-1.png",
      "path": "sprites/missile/damage-1.png",
      "type": "binary",
      "bytes": 11338,
      "sha256": "a074c555df8e7409fb599e6d26fe7f8db90fa2082e71c17d52e413f3b61e6270"
    },
    {
      "name": "sprites/missile/damage-2.png",
      "path": "sprites/missile/damage-2.png",
      "type": "binary",
      "bytes": 11794,
      "sha256": "a6bfbedf3c853cbf94b0cf1ce408d52440e78a2077804be4c38cc96ba69ae501"
    },
    {
      "name": "sprites/missile/sprite.png",
      "path": "sprites/missile/sprite.png",
      "type": "binary",
      "bytes": 11456,
      "sha256": "0ec585f49dc22e2c4e229331b5316eaaeaaa3964717c66736be494f1cf90b827"
    },
    {
      "name": "sprites/reinforced/atlas.png",
      "path": "sprites/reinforced/atlas.png",
      "type": "binary",
      "bytes": 231775,
      "sha256": "000738cd159dc758df446c1d39967520203ac00ff12939dba79e3bea0634f10b"
    },
    {
      "name": "sprites/reinforced/damage-1.png",
      "path": "sprites/reinforced/damage-1.png",
      "type": "binary",
      "bytes": 12957,
      "sha256": "6aeb1493bf741a2fb8039a55390d41b07cbb809668b606ccf473abc21e26a83d"
    },
    {
      "name": "sprites/reinforced/damage-2.png",
      "path": "sprites/reinforced/damage-2.png",
      "type": "binary",
      "bytes": 13421,
      "sha256": "5898170894ac81c0341b787f103e0b7d2774844a332b33670da34d02ee21db4e"
    },
    {
      "name": "sprites/reinforced/sprite.png",
      "path": "sprites/reinforced/sprite.png",
      "type": "binary",
      "bytes": 12901,
      "sha256": "23fea5dd7fea051f5ea301ccdd90e4caaba73c6c43b9633076edd83c328644db"
    },
    {
      "name": "sprites/ribbon-conveyor/atlas.png",
      "path": "sprites/ribbon-conveyor/atlas.png",
      "type": "binary",
      "bytes": 217666,
      "sha256": "728dc26509770dda7b8981686097a771aaddc21dbda4a23048b5c24f1370550b"
    },
    {
      "name": "sprites/ribbon-conveyor/damage-1.png",
      "path": "sprites/ribbon-conveyor/damage-1.png",
      "type": "binary",
      "bytes": 12001,
      "sha256": "ff499da5408cf568c51ccbbd5d54610416e304e6e0cd95430a00040a92860ae1"
    },
    {
      "name": "sprites/ribbon-conveyor/damage-2.png",
      "path": "sprites/ribbon-conveyor/damage-2.png",
      "type": "binary",
      "bytes": 12819,
      "sha256": "8c21528a5604c58aab4ed892c9436697a8aad5e00646a8c72b38c5999cb8d2cd"
    },
    {
      "name": "sprites/ribbon-conveyor/sprite.png",
      "path": "sprites/ribbon-conveyor/sprite.png",
      "type": "binary",
      "bytes": 11652,
      "sha256": "87f2a9e7a0391ef6f3b4769901fb900e1e2d01d8fe1b10070f0f024f54ee2434"
    },
    {
      "name": "sprites/shield/atlas.png",
      "path": "sprites/shield/atlas.png",
      "type": "binary",
      "bytes": 238932,
      "sha256": "25fe8ea718b9810def3fc4f50cf4a3e4108bc249c3f6768f2fcdf91b5593003f"
    },
    {
      "name": "sprites/shield/damage-1.png",
      "path": "sprites/shield/damage-1.png",
      "type": "binary",
      "bytes": 13146,
      "sha256": "251507ec644e243823809f64c7d6efcabf3155e78adfb9e3cff9759f46f13a59"
    },
    {
      "name": "sprites/shield/damage-2.png",
      "path": "sprites/shield/damage-2.png",
      "type": "binary",
      "bytes": 13522,
      "sha256": "0bb24255c58e03215d245b80bf53f09ce368ca4ef16b856b459dcf5ce2dd2935"
    },
    {
      "name": "sprites/shield/sprite.png",
      "path": "sprites/shield/sprite.png",
      "type": "binary",
      "bytes": 12725,
      "sha256": "ca8c325daa0267e472ba348fe2e3f83f236cad0aa715bb6c4fedbdcae21c40e6"
    },
    {
      "name": "sprites/small-saucer/atlas.png",
      "path": "sprites/small-saucer/atlas.png",
      "type": "binary",
      "bytes": 157536,
      "sha256": "5a5d02cdbc04627be800bd8134eb8b3edc13dc529d6ed3c7d65af1a74fd78bc2"
    },
    {
      "name": "sprites/small-saucer/damage-1.png",
      "path": "sprites/small-saucer/damage-1.png",
      "type": "binary",
      "bytes": 8610,
      "sha256": "338504acb6604515ca17a18a10698c5419a2b383710359245e53c13b7441ce47"
    },
    {
      "name": "sprites/small-saucer/damage-2.png",
      "path": "sprites/small-saucer/damage-2.png",
      "type": "binary",
      "bytes": 8783,
      "sha256": "39f175f05d5b0c100c198b601028f244d47fef0cf80e697b154adf258877aa11"
    },
    {
      "name": "sprites/small-saucer/sprite.png",
      "path": "sprites/small-saucer/sprite.png",
      "type": "binary",
      "bytes": 8423,
      "sha256": "d543a8d96da7fbfc3255a3fe3e7ec096d68eb563dab0251ed15d1de38279fd4d"
    },
    {
      "name": "sprites/spiral/atlas.png",
      "path": "sprites/spiral/atlas.png",
      "type": "binary",
      "bytes": 231250,
      "sha256": "ff94231974fa0dbca69fa50e2c323a386626878848332c3439632b0f764e9873"
    },
    {
      "name": "sprites/spiral/damage-1.png",
      "path": "sprites/spiral/damage-1.png",
      "type": "binary",
      "bytes": 13157,
      "sha256": "ec364ad2c08f69deb0d6cd564a41fb540e42b7b3e4485cf686b6216c7f16df75"
    },
    {
      "name": "sprites/spiral/damage-2.png",
      "path": "sprites/spiral/damage-2.png",
      "type": "binary",
      "bytes": 13764,
      "sha256": "8198b899d8573dcfc7c320e0fbb8392ba5e1c2ce5436a2534a929d1ce007a1fb"
    },
    {
      "name": "sprites/spiral/sprite.png",
      "path": "sprites/spiral/sprite.png",
      "type": "binary",
      "bytes": 12096,
      "sha256": "69482f21d5be6d2c778fa12cf61e34a3f1ec14ce9a604ad7857fabc3d8947856"
    },
    {
      "name": "sprites/split-blob/atlas.png",
      "path": "sprites/split-blob/atlas.png",
      "type": "binary",
      "bytes": 203929,
      "sha256": "623851a22ded9243d1c0659ad255bb6b510ff510f6e31ca35025d03a3ad0f196"
    },
    {
      "name": "sprites/split-blob/damage-1.png",
      "path": "sprites/split-blob/damage-1.png",
      "type": "binary",
      "bytes": 11409,
      "sha256": "4e2bf4559ff2de1fbab344d48ccb8ea73c4c49e88f7d0115a48a1016eba2fedf"
    },
    {
      "name": "sprites/split-blob/damage-2.png",
      "path": "sprites/split-blob/damage-2.png",
      "type": "binary",
      "bytes": 12010,
      "sha256": "cc25f4c99ca073a303516a5dd306b13851dd9ca5d561c1d11b453e42377c8d45"
    },
    {
      "name": "sprites/split-blob/sprite.png",
      "path": "sprites/split-blob/sprite.png",
      "type": "binary",
      "bytes": 10994,
      "sha256": "4bf5cddcbd3f360484fd4b46c0a579542c8848509d3f105601a15ab40b48467a"
    }
  ]
});

export function create(options = {}) {
  return createAdapter(metadata, {
    baseURL: new URL('../../../assets/alien-enemies-v2/', import.meta.url),
    ...options,
  });
}

const adapter = create();
export const { load, ready, get, dispose } = adapter;
export default adapter;
