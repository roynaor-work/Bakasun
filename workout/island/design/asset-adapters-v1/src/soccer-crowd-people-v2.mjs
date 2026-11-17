// Generated from the audited catalog.json. No asset I/O happens during import.
import { createAdapter } from './runtime.mjs';

export const metadata = Object.freeze({
  "id": "soccer-crowd-people-v2",
  "game": "soccer",
  "flag": "?assetSoccerCrowdPeopleV2=1",
  "available": true,
  "source": {
    "branch": "codex/soccer-crowd-people-v2",
    "commit": "faba2bf9a4696320da7503198072d787ea51c3da",
    "root": "workout/island/design/soccer-crowd-people-v2"
  },
  "license": {
    "spdx": "CC0-1.0",
    "note": "LICENSES.md מתעד הקדשת CC0-1.0 לתרומות המקוריות ולשרשרת נכסי הדמויות; ספריות תצוגה וכלי פיתוח שאינם מועתקים שומרים על רישיונם.",
    "files": [
      "LICENSES.md"
    ]
  },
  "bytes": 2563087,
  "runtimeBytes": 2560016,
  "dependencies": [
    "GLTFLoader ו־AnimationMixer; 16 דמויות כפול 3 קובצי LOD עם טקסטורות מוטמעות."
  ],
  "missing": [
    "יש לבחור GLB אחד לכל אוהד לפי גובהו במסך ולשמר זמן קליפ במעבר בין רמות הפירוט."
  ],
  "assets": [
    {
      "name": "manifest.json",
      "path": "manifest.json",
      "type": "json",
      "bytes": 112704,
      "sha256": "326db32b2a11de568ca919f9047056a1972cbcee993094bd90db18320f46a6d4"
    },
    {
      "name": "models/fan-01-lod0.glb",
      "path": "models/fan-01-lod0.glb",
      "type": "glb",
      "bytes": 55888,
      "sha256": "7fb0514c7e1eb7801e5f9d912f6570a0f300d4c6cc4e8a524a3a0df1751557c6"
    },
    {
      "name": "models/fan-01-lod1.glb",
      "path": "models/fan-01-lod1.glb",
      "type": "glb",
      "bytes": 49736,
      "sha256": "fb6a1f431b2e39948ce8216b99715b86e5cbd0646a557960a5256974811b6b7e"
    },
    {
      "name": "models/fan-01-lod2.glb",
      "path": "models/fan-01-lod2.glb",
      "type": "glb",
      "bytes": 46252,
      "sha256": "e44ab2fda175aabc29cb7232dc2e7f3234fd01079c26d4e677ca4aa455752173"
    },
    {
      "name": "models/fan-02-lod0.glb",
      "path": "models/fan-02-lod0.glb",
      "type": "glb",
      "bytes": 56372,
      "sha256": "7555e0ed77c19a6df4f4abb8a0b839fb98df0884d5b15be42f77920276a5ddf8"
    },
    {
      "name": "models/fan-02-lod1.glb",
      "path": "models/fan-02-lod1.glb",
      "type": "glb",
      "bytes": 49908,
      "sha256": "fad54bdfdd5cec51e6010e518269b946b89e962ac97a8db8217561aee3e321e5"
    },
    {
      "name": "models/fan-02-lod2.glb",
      "path": "models/fan-02-lod2.glb",
      "type": "glb",
      "bytes": 46428,
      "sha256": "12c28a2a0cf1511b671a83335fef7836606c6983352d30cfbeb1d19777b1bdfe"
    },
    {
      "name": "models/fan-03-lod0.glb",
      "path": "models/fan-03-lod0.glb",
      "type": "glb",
      "bytes": 56308,
      "sha256": "8c565c8f3b0eb78d67c56a2b9c883940921e65da2cef7fb7c0bc60c6199a51d6"
    },
    {
      "name": "models/fan-03-lod1.glb",
      "path": "models/fan-03-lod1.glb",
      "type": "glb",
      "bytes": 50052,
      "sha256": "729243d2674e834ef7da174fd35d180eafc2845b87da4c6fff7d7714ffc8a332"
    },
    {
      "name": "models/fan-03-lod2.glb",
      "path": "models/fan-03-lod2.glb",
      "type": "glb",
      "bytes": 46572,
      "sha256": "ed10782722b56ae7ad0d51db09a0eac758edfe5d0f3bc699ae2bb80b0dc91ada"
    },
    {
      "name": "models/fan-04-lod0.glb",
      "path": "models/fan-04-lod0.glb",
      "type": "glb",
      "bytes": 56188,
      "sha256": "842f88d4d2bcce3ed5bb2e16071ce16d33e81b98e4b5d52082b90138b95a5749"
    },
    {
      "name": "models/fan-04-lod1.glb",
      "path": "models/fan-04-lod1.glb",
      "type": "glb",
      "bytes": 50140,
      "sha256": "de1acebf0d10dac483c6e6d038d429a3f0c826ae32d273a1287b7965adaff5e2"
    },
    {
      "name": "models/fan-04-lod2.glb",
      "path": "models/fan-04-lod2.glb",
      "type": "glb",
      "bytes": 46660,
      "sha256": "1f938f6964b2ccce3542290055e0c55a87d40d97bfc7ea89f26d5e1278902da8"
    },
    {
      "name": "models/fan-05-lod0.glb",
      "path": "models/fan-05-lod0.glb",
      "type": "glb",
      "bytes": 56296,
      "sha256": "57e3ec12dec00bdacdf1f06e84d50cdddadf4d5a6a0362e81163d406673b4466"
    },
    {
      "name": "models/fan-05-lod1.glb",
      "path": "models/fan-05-lod1.glb",
      "type": "glb",
      "bytes": 50040,
      "sha256": "8b4ade70976ea7243709963178d5a9b73f3f2bc495478fda901266cadfde88cd"
    },
    {
      "name": "models/fan-05-lod2.glb",
      "path": "models/fan-05-lod2.glb",
      "type": "glb",
      "bytes": 46560,
      "sha256": "7111b5ddfa670cbb5e0ae81d52149f80f809170d9d2323769fd6ebc1f99bc977"
    },
    {
      "name": "models/fan-06-lod0.glb",
      "path": "models/fan-06-lod0.glb",
      "type": "glb",
      "bytes": 56016,
      "sha256": "d4008140406b4b2128ae0e989d8f8e6c707ec96758cccf19f7e7e17ab7488c9d"
    },
    {
      "name": "models/fan-06-lod1.glb",
      "path": "models/fan-06-lod1.glb",
      "type": "glb",
      "bytes": 49972,
      "sha256": "fbe00cef68ab1fee9d65d43065acd4a933cb356149ce8d9873019de356afaee9"
    },
    {
      "name": "models/fan-06-lod2.glb",
      "path": "models/fan-06-lod2.glb",
      "type": "glb",
      "bytes": 46492,
      "sha256": "db7352a27579e86d1f8a493e4a08c32bd672e29d807b0c011de185153e851c33"
    },
    {
      "name": "models/fan-07-lod0.glb",
      "path": "models/fan-07-lod0.glb",
      "type": "glb",
      "bytes": 55992,
      "sha256": "2057fe090bcf7536d68f178702411395bc7d6cf88bc6f0be8724528c4f61f63a"
    },
    {
      "name": "models/fan-07-lod1.glb",
      "path": "models/fan-07-lod1.glb",
      "type": "glb",
      "bytes": 49840,
      "sha256": "7cfbb0f2e8b8ce865447c551011f2528a3c3e1cd64bfef70650cd122a9af73a5"
    },
    {
      "name": "models/fan-07-lod2.glb",
      "path": "models/fan-07-lod2.glb",
      "type": "glb",
      "bytes": 46360,
      "sha256": "ac89dfe7df3596a579036c8f1000d3202a7825982d37b2cd791b493f7b6e7271"
    },
    {
      "name": "models/fan-08-lod0.glb",
      "path": "models/fan-08-lod0.glb",
      "type": "glb",
      "bytes": 56476,
      "sha256": "6a19cee60cc8eb06d6336268f7db7d775b908873bc5947fee3989adf5d96a195"
    },
    {
      "name": "models/fan-08-lod1.glb",
      "path": "models/fan-08-lod1.glb",
      "type": "glb",
      "bytes": 50224,
      "sha256": "9d08fb2b21cf3a703a9f32dab68401f7afca9bc19bbaaed2dd6416fad57ff419"
    },
    {
      "name": "models/fan-08-lod2.glb",
      "path": "models/fan-08-lod2.glb",
      "type": "glb",
      "bytes": 46740,
      "sha256": "8972a777a30931448dd368da282853e93e0df31a02cd61f98c2b00a52e2cf3b7"
    },
    {
      "name": "models/fan-09-lod0.glb",
      "path": "models/fan-09-lod0.glb",
      "type": "glb",
      "bytes": 55836,
      "sha256": "eb4c8021520fd3263e49b0ee79e6e3e6ce95b0c3f8eba3e798571840176ce994"
    },
    {
      "name": "models/fan-09-lod1.glb",
      "path": "models/fan-09-lod1.glb",
      "type": "glb",
      "bytes": 49996,
      "sha256": "55d192302f7fdc4a3d68bb21b9500b956697d42d40788d17482e30c216d3b93b"
    },
    {
      "name": "models/fan-09-lod2.glb",
      "path": "models/fan-09-lod2.glb",
      "type": "glb",
      "bytes": 46516,
      "sha256": "69d24dedcde4d686f379db12e2fc865bab02f691d54b524f79ebe6791a882d67"
    },
    {
      "name": "models/fan-10-lod0.glb",
      "path": "models/fan-10-lod0.glb",
      "type": "glb",
      "bytes": 56412,
      "sha256": "b40e956d7b2cfdae616c4e689e0141c4824623b35b3ce5b00a5a1548bcbe7681"
    },
    {
      "name": "models/fan-10-lod1.glb",
      "path": "models/fan-10-lod1.glb",
      "type": "glb",
      "bytes": 49948,
      "sha256": "297bce5ef0bcba288f23bc2daa5ddf6a5336298c1ddfcf9ff22efa52654a831f"
    },
    {
      "name": "models/fan-10-lod2.glb",
      "path": "models/fan-10-lod2.glb",
      "type": "glb",
      "bytes": 46468,
      "sha256": "37a0df758b69bd2ea36866059279d413eb0f3ec1e7c507a2c761a1930eb6da62"
    },
    {
      "name": "models/fan-11-lod0.glb",
      "path": "models/fan-11-lod0.glb",
      "type": "glb",
      "bytes": 56496,
      "sha256": "c630bd6039e494830eedfe33849fc7ffb21c159dcc24466fe203e6a019237044"
    },
    {
      "name": "models/fan-11-lod1.glb",
      "path": "models/fan-11-lod1.glb",
      "type": "glb",
      "bytes": 49924,
      "sha256": "5c07c3b61b0c6f4ec6649ace78964ae4a7ac9fbae8852f945de26aa55d4531b8"
    },
    {
      "name": "models/fan-11-lod2.glb",
      "path": "models/fan-11-lod2.glb",
      "type": "glb",
      "bytes": 46444,
      "sha256": "524b145edd9a833116ca416882838d60297a506d9b67c11dac0a05e23db5acb3"
    },
    {
      "name": "models/fan-12-lod0.glb",
      "path": "models/fan-12-lod0.glb",
      "type": "glb",
      "bytes": 55984,
      "sha256": "7edd274c78eed0b358cf6fd5bf3965144430ad83121455ae353048d42f7e4337"
    },
    {
      "name": "models/fan-12-lod1.glb",
      "path": "models/fan-12-lod1.glb",
      "type": "glb",
      "bytes": 50144,
      "sha256": "6404de2d040260bcf2ee16dcccff09e83ba76b3d2ce705344e941a8fee8fe13f"
    },
    {
      "name": "models/fan-12-lod2.glb",
      "path": "models/fan-12-lod2.glb",
      "type": "glb",
      "bytes": 46660,
      "sha256": "8159c18b47581732a25dd45038c6a539c77d33785928e8b01357ebf3b7b80241"
    },
    {
      "name": "models/fan-13-lod0.glb",
      "path": "models/fan-13-lod0.glb",
      "type": "glb",
      "bytes": 56608,
      "sha256": "efc64a091f7bb22e4795120f8be7d6390daaadd553a18d479fe2c5ea66c6a4a1"
    },
    {
      "name": "models/fan-13-lod1.glb",
      "path": "models/fan-13-lod1.glb",
      "type": "glb",
      "bytes": 50352,
      "sha256": "baf10e504f01b22c7d6e23c272467eb06a62eb9b3681534ba71d0ab12934b8eb"
    },
    {
      "name": "models/fan-13-lod2.glb",
      "path": "models/fan-13-lod2.glb",
      "type": "glb",
      "bytes": 46872,
      "sha256": "6c4ff408ad8dad66913c5415d47a98215976f75efcbc818038a15dad913408a6"
    },
    {
      "name": "models/fan-14-lod0.glb",
      "path": "models/fan-14-lod0.glb",
      "type": "glb",
      "bytes": 56416,
      "sha256": "531fe4a11cad78a824e1347d38264f8811f703f20039e7abf1bf936c3436c034"
    },
    {
      "name": "models/fan-14-lod1.glb",
      "path": "models/fan-14-lod1.glb",
      "type": "glb",
      "bytes": 50368,
      "sha256": "5da22da13612c88a68aa3485139d497e6bd3eca9d8b13ece04b8d1bbdafd4798"
    },
    {
      "name": "models/fan-14-lod2.glb",
      "path": "models/fan-14-lod2.glb",
      "type": "glb",
      "bytes": 46888,
      "sha256": "34aae394b9fc0462ebc6212b850a0fc11abdf966471d835ca7f18cefc36880cd"
    },
    {
      "name": "models/fan-15-lod0.glb",
      "path": "models/fan-15-lod0.glb",
      "type": "glb",
      "bytes": 56328,
      "sha256": "f65944175ab791e4db19aac6de6760b23785eebd0a0c25f80749c6d97707de97"
    },
    {
      "name": "models/fan-15-lod1.glb",
      "path": "models/fan-15-lod1.glb",
      "type": "glb",
      "bytes": 50180,
      "sha256": "b8e476611d0e7ad0922b484e6f3101b332513f4434b1bb1bb8f6d7c9d9b3c6db"
    },
    {
      "name": "models/fan-15-lod2.glb",
      "path": "models/fan-15-lod2.glb",
      "type": "glb",
      "bytes": 46696,
      "sha256": "901153fb93b383f8ea798b8c5094f0ef5d8e6de509146eaff79306bc569dbe7b"
    },
    {
      "name": "models/fan-16-lod0.glb",
      "path": "models/fan-16-lod0.glb",
      "type": "glb",
      "bytes": 56752,
      "sha256": "8194fd447f2c2e611a0853d9bd75d9bd57912d5058d6662d6a1ad9cadc9bbc3f"
    },
    {
      "name": "models/fan-16-lod1.glb",
      "path": "models/fan-16-lod1.glb",
      "type": "glb",
      "bytes": 50496,
      "sha256": "b80f22a069f7ad5f4d1b632f07fcff4b0d06c4a1c8b0b289266b80a69840dbc8"
    },
    {
      "name": "models/fan-16-lod2.glb",
      "path": "models/fan-16-lod2.glb",
      "type": "glb",
      "bytes": 47016,
      "sha256": "c7700d801558f5cb3b4185c6d6f58829a56699c3dc7bdd40cbaaf46310e37b1f"
    }
  ]
});

export function create(options = {}) {
  return createAdapter(metadata, {
    baseURL: new URL('../../../assets/soccer-crowd-people-v2/', import.meta.url),
    ...options,
  });
}

const adapter = create();
export const { load, ready, get, dispose } = adapter;
export default adapter;
