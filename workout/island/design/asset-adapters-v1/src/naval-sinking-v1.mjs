// Generated from the audited catalog.json. No asset I/O happens during import.
import { createAdapter } from './runtime.mjs';

export const metadata = Object.freeze({
  "id": "naval-sinking-v1",
  "game": "naval",
  "flag": "?assetNavalSinkingV1=1",
  "available": true,
  "source": {
    "branch": "codex/naval-sinking-v1",
    "commit": "2f2e6463969c81cc38d0e72cc114aefaa6f56c02",
    "root": "workout/island/design/naval-sinking-v1"
  },
  "license": {
    "spdx": "CC0-1.0 AND LicenseRef-Existing-Repository-Rights",
    "note": "LICENSE.txt: original effects/audio and naval-v7 ship renders CC0; four fallback Meshy ship composites have unverified inherited source rights, submarine inherits repository code rights.",
    "files": [
      "LICENSE.txt"
    ]
  },
  "bytes": 11189199,
  "runtimeBytes": 11179025,
  "dependencies": [
    "Canvas 2D sprite-atlas player with manifest frame/anchor metadata; fixed oblique viewpoint, not free-camera 3D damage geometry.",
    "Browser Ogg or MP3 decoding and a user audio gesture; no source GLBs are needed for delivered raster atlases."
  ],
  "missing": [
    "Independent upstream license evidence for atlases/{patrol,gunboat,legacy-enemy,legacy-boss}.png and affected hulls.png cells is absent in the source pack.",
    "For moving 3D cameras, map effects to billboards and implement 3D hull damage/sinking separately; these hull frames are fixed-view 2D renders."
  ],
  "assets": [
    {
      "name": "atlases/ambient.png",
      "path": "atlases/ambient.png",
      "type": "binary",
      "bytes": 567741,
      "sha256": "1611b4ef41eb7720bed3db1d10b0a5bb68880b740452305dd9d6c4bb42f1f552"
    },
    {
      "name": "atlases/carrier-ember.png",
      "path": "atlases/carrier-ember.png",
      "type": "binary",
      "bytes": 768843,
      "sha256": "f420ee5dcef7298800aa89f2a756d58cb652354da3bc58a6ffd89883018b2a32"
    },
    {
      "name": "atlases/carrier-tide.png",
      "path": "atlases/carrier-tide.png",
      "type": "binary",
      "bytes": 769348,
      "sha256": "61911f85f544cd54eb5a1f9f7511b5473cd0f79a81d15636638fb4168b613329"
    },
    {
      "name": "atlases/combat.png",
      "path": "atlases/combat.png",
      "type": "binary",
      "bytes": 349812,
      "sha256": "a5977babaa4f8c6dd9d7764386da93b074100579d7ed63ed188bc66c9b20005f"
    },
    {
      "name": "atlases/corvette-ember.png",
      "path": "atlases/corvette-ember.png",
      "type": "binary",
      "bytes": 785148,
      "sha256": "eed86d54f5dbda58b179ea52b1ee9a4410616293d88a46f0591813c70b083756"
    },
    {
      "name": "atlases/corvette-tide.png",
      "path": "atlases/corvette-tide.png",
      "type": "binary",
      "bytes": 788229,
      "sha256": "b98b92aa34fa7722c584f39f5c191771a3709d082cef3c81e504b7a39d678cdd"
    },
    {
      "name": "atlases/cruiser-ember.png",
      "path": "atlases/cruiser-ember.png",
      "type": "binary",
      "bytes": 767993,
      "sha256": "310c6858f70b4c22a4e1621fe992bbe1a639e289ad508536967882e57f133cb5"
    },
    {
      "name": "atlases/cruiser-tide.png",
      "path": "atlases/cruiser-tide.png",
      "type": "binary",
      "bytes": 770038,
      "sha256": "abd0a5439e103ca01964b91cbbd473f5c0e18ad4278571845479046306932c4e"
    },
    {
      "name": "atlases/destroyer-ember.png",
      "path": "atlases/destroyer-ember.png",
      "type": "binary",
      "bytes": 796264,
      "sha256": "f28eec42422be998c1f1c015975f1d384513f67d0e8a8e7472fd056c5729906f"
    },
    {
      "name": "atlases/destroyer-tide.png",
      "path": "atlases/destroyer-tide.png",
      "type": "binary",
      "bytes": 799210,
      "sha256": "e5c5777c8b857a05d61966fed6d20f9040045295c3986a26de23a1999f1e5be0"
    },
    {
      "name": "atlases/gunboat.png",
      "path": "atlases/gunboat.png",
      "type": "binary",
      "bytes": 588670,
      "sha256": "e6023352c08e99447282b6d557fa842d63d961f0e73a8c8f97929cc55b7296d1"
    },
    {
      "name": "atlases/legacy-boss.png",
      "path": "atlases/legacy-boss.png",
      "type": "binary",
      "bytes": 726476,
      "sha256": "cded021eb40c773fe3fc63615b2704f1a51636d0c58a58f413225ab654e7649a"
    },
    {
      "name": "atlases/legacy-enemy.png",
      "path": "atlases/legacy-enemy.png",
      "type": "binary",
      "bytes": 733319,
      "sha256": "0521cde97a6c4aba8a62d3e52bbd1f653402800a9251a35df75ca284068ea159"
    },
    {
      "name": "atlases/patrol.png",
      "path": "atlases/patrol.png",
      "type": "binary",
      "bytes": 777000,
      "sha256": "1df0058f470c92b15530b91b0e88642a8c46d7419681cb52a093f15b162059e7"
    },
    {
      "name": "atlases/submarine.png",
      "path": "atlases/submarine.png",
      "type": "binary",
      "bytes": 483779,
      "sha256": "3595c4e254f18d0311263d8994ad6f48fbccf95f7613679443735c75c9c9fcc7"
    },
    {
      "name": "audio/explosion.mp3",
      "path": "audio/explosion.mp3",
      "type": "binary",
      "bytes": 13374,
      "sha256": "95cb188e16ad1f5ceec49a17df5a620ad1fdcb4fb784b5aff9d1042e375a72d4"
    },
    {
      "name": "audio/explosion.ogg",
      "path": "audio/explosion.ogg",
      "type": "binary",
      "bytes": 8729,
      "sha256": "e4c399d25daf2ff404a218cfebef2f718ac3e9de68641b8db1a0539677fc5791"
    },
    {
      "name": "audio/hit.mp3",
      "path": "audio/hit.mp3",
      "type": "binary",
      "bytes": 6060,
      "sha256": "e65b46f150b49eff8f4900f57105082f16506778b624ef03b83fea4d299a5cd9"
    },
    {
      "name": "audio/hit.ogg",
      "path": "audio/hit.ogg",
      "type": "binary",
      "bytes": 5718,
      "sha256": "d57fbb643e03e4c8fcaee918d41cf703e46cd4fb998f58942ec09a6e3feceb67"
    },
    {
      "name": "audio/sinking.mp3",
      "path": "audio/sinking.mp3",
      "type": "binary",
      "bytes": 30093,
      "sha256": "b1c3524bf940c773146e96e2ef706d276ac767612db3121382243bfdaa77c138"
    },
    {
      "name": "audio/sinking.ogg",
      "path": "audio/sinking.ogg",
      "type": "binary",
      "bytes": 15628,
      "sha256": "8510d8bbc110f3be9a763b604b72de861ee9d985649fca682a22ba7e4d4b23c8"
    },
    {
      "name": "hulls.png",
      "path": "hulls.png",
      "type": "binary",
      "bytes": 383912,
      "sha256": "37fd0521c3c9bcdd58edc9d5c6097cccf8ac51128f87932b408c3fe17fe3da68"
    },
    {
      "name": "manifest.json",
      "path": "manifest.json",
      "type": "json",
      "bytes": 243641,
      "sha256": "a8721b03378aa3062cb60c5b1a567d398af443bce3f86819cb2945840b4d9c83"
    }
  ]
});

export function create(options = {}) {
  return createAdapter(metadata, {
    baseURL: new URL('../../../assets/naval-sinking-v1/', import.meta.url),
    ...options,
  });
}

const adapter = create();
export const { load, ready, get, dispose } = adapter;
export default adapter;
