// Generated from the audited catalog.json. No asset I/O happens during import.
import { createAdapter } from './runtime.mjs';

export const metadata = Object.freeze({
  "id": "tennis-ui-v2",
  "game": "tennis",
  "flag": "?assetTennisUiV2=1",
  "available": true,
  "source": {
    "branch": "codex/tennis-ui-v2",
    "commit": "e4f5ac8501daef9a637bc5ffcb0387e3fd35dd21",
    "root": "workout/island/design/tennis-ui-v2"
  },
  "license": {
    "spdx": "CC0-1.0",
    "note": "LICENSE.txt מצהיר SPDX-License-Identifier: CC0-1.0 לכל הגאומטריה המקורית, הייצואים, הקוד והתיעוד; אין ספריות, גופנים או תמונות צד שלישי מצורפים.",
    "files": [
      "LICENSE.txt"
    ]
  },
  "bytes": 293891,
  "runtimeBytes": 293115,
  "dependencies": [
    "נכסי PNG/SVG ו־CSS מקומיים; נדרש מארח DOM המייצר את מבנה data-* שבחוזה הממשק.",
    "tennis-config.js ו־tennis-ui.js הם סקריפטים קלאסיים המגדירים window.TENNIS_UI_V2_CONFIG/window.TennisUIV2; המתאם חושף אותם כטקסט ואינו מריץ אותם."
  ],
  "missing": [
    "חיבור סמנטיקת ההגשה, השליטה ומיקום האפקטים לאירועי המשחק; שימוש חוזר בבקר המקורי מצריך עטיפת ES module או מימוש מארח."
  ],
  "assets": [
    {
      "name": "manifest.json",
      "path": "manifest.json",
      "type": "json",
      "bytes": 27258,
      "sha256": "bee733212648fcc6072a5a466e149dd4b0b69dbd49b3ed409f015cdf138685c2"
    },
    {
      "name": "png/buttons/button-brake-disabled.png",
      "path": "png/buttons/button-brake-disabled.png",
      "type": "binary",
      "bytes": 7240,
      "sha256": "e9295249ad79f5a11a1c263e1a175bf088f7c0fd0013fcfaeb23291894af0266"
    },
    {
      "name": "png/buttons/button-brake-idle.png",
      "path": "png/buttons/button-brake-idle.png",
      "type": "binary",
      "bytes": 7101,
      "sha256": "407c7e47e347be4742596d81cd70af25182c1a25e66b823f1cff1da8324eee80"
    },
    {
      "name": "png/buttons/button-brake-pressed.png",
      "path": "png/buttons/button-brake-pressed.png",
      "type": "binary",
      "bytes": 7157,
      "sha256": "ed465b4e8f4f2d93bd616599e360fcf5715ed92eaca3ed42c68c79afda9a7ba0"
    },
    {
      "name": "png/buttons/button-drop-disabled.png",
      "path": "png/buttons/button-drop-disabled.png",
      "type": "binary",
      "bytes": 6883,
      "sha256": "b98e57f803f92cb0e4a9e72fe1d3e624c9752044d54e620a5736a9dd6824b68e"
    },
    {
      "name": "png/buttons/button-drop-idle.png",
      "path": "png/buttons/button-drop-idle.png",
      "type": "binary",
      "bytes": 6890,
      "sha256": "a3359179e9321932949a7507e5f929b66a5f7a08303259b6b8dc5746619cc084"
    },
    {
      "name": "png/buttons/button-drop-pressed.png",
      "path": "png/buttons/button-drop-pressed.png",
      "type": "binary",
      "bytes": 6839,
      "sha256": "8582b77a5fb1ff5f56d375c00d47202ec0c101d73badb3acc2035c84ee1ccd34"
    },
    {
      "name": "png/buttons/button-placement-disabled.png",
      "path": "png/buttons/button-placement-disabled.png",
      "type": "binary",
      "bytes": 7182,
      "sha256": "fb5ba525b6346b680248e51b21c469b31579cc15e62bb604451249453b274da6"
    },
    {
      "name": "png/buttons/button-placement-idle.png",
      "path": "png/buttons/button-placement-idle.png",
      "type": "binary",
      "bytes": 7107,
      "sha256": "56db18c6781b32a1c120e9a77370aba60cd8a8609873ec273be530aec52a1c33"
    },
    {
      "name": "png/buttons/button-placement-pressed.png",
      "path": "png/buttons/button-placement-pressed.png",
      "type": "binary",
      "bytes": 7148,
      "sha256": "f5161dde2b0f208fd180365b21116afc34964ac077f4de00ef9e762d3178f5b4"
    },
    {
      "name": "png/buttons/button-serve-disabled.png",
      "path": "png/buttons/button-serve-disabled.png",
      "type": "binary",
      "bytes": 8337,
      "sha256": "d965e22dce6b8677255bf4f41995cd132d04a365630eb87d70ca74b9e98ee28e"
    },
    {
      "name": "png/buttons/button-serve-idle.png",
      "path": "png/buttons/button-serve-idle.png",
      "type": "binary",
      "bytes": 8854,
      "sha256": "3f40d9b061a5443a65a904c596c14dd23c1156d2e1592f5a098006e3f1b23190"
    },
    {
      "name": "png/buttons/button-serve-pressed.png",
      "path": "png/buttons/button-serve-pressed.png",
      "type": "binary",
      "bytes": 8650,
      "sha256": "7a74c2a0ad7700ddac94ab33b6571c5639d04c604c970e5723588b5343714b6a"
    },
    {
      "name": "png/buttons/button-slice-disabled.png",
      "path": "png/buttons/button-slice-disabled.png",
      "type": "binary",
      "bytes": 8200,
      "sha256": "82d0d4400f8e96cf9b8549ec928c2b4b25c72f12d0f6afe02fe8541b4f47929f"
    },
    {
      "name": "png/buttons/button-slice-idle.png",
      "path": "png/buttons/button-slice-idle.png",
      "type": "binary",
      "bytes": 8052,
      "sha256": "d26fd8e75eb4f5545ac816b039794d155340afb0fd26f7bce2d3c8ed647b7eac"
    },
    {
      "name": "png/buttons/button-slice-pressed.png",
      "path": "png/buttons/button-slice-pressed.png",
      "type": "binary",
      "bytes": 8056,
      "sha256": "cde95ac093847e0b136cd18904335935d2053a988f140059d8199adc44a37fbb"
    },
    {
      "name": "png/buttons/button-smash-disabled.png",
      "path": "png/buttons/button-smash-disabled.png",
      "type": "binary",
      "bytes": 7177,
      "sha256": "efa926c11d5cb0bbacff736b18671f025bf3a28d8dd310b469ea19f1e35cff62"
    },
    {
      "name": "png/buttons/button-smash-idle.png",
      "path": "png/buttons/button-smash-idle.png",
      "type": "binary",
      "bytes": 6855,
      "sha256": "fd5635464135a18d34072a3d8fb1d01b466ff0419d716683e601f0f912e247ff"
    },
    {
      "name": "png/buttons/button-smash-pressed.png",
      "path": "png/buttons/button-smash-pressed.png",
      "type": "binary",
      "bytes": 7100,
      "sha256": "359e5c39a727cafe22b904c01531ad147b930f507f9df5691d2670a004b3a7ef"
    },
    {
      "name": "png/fx/fx-net.png",
      "path": "png/fx/fx-net.png",
      "type": "binary",
      "bytes": 7415,
      "sha256": "c72b9fb4db9702063ae64de1b940ef554d3effb98aaa8c9b601fc6fceba3d9ea"
    },
    {
      "name": "png/fx/fx-out.png",
      "path": "png/fx/fx-out.png",
      "type": "binary",
      "bytes": 8148,
      "sha256": "65b40cae22a04eb37ccb88a109c420ef89d3831f7047b280a4368e23c9953b90"
    },
    {
      "name": "png/fx/fx-perfect-green.png",
      "path": "png/fx/fx-perfect-green.png",
      "type": "binary",
      "bytes": 18483,
      "sha256": "e8e383d86f2851841810a2e888a9d9a2644df83fac1ba7a7aa8afd783f3321ba"
    },
    {
      "name": "png/fx/fx-power-serve.png",
      "path": "png/fx/fx-power-serve.png",
      "type": "binary",
      "bytes": 14320,
      "sha256": "7acd896eba5a8b78cb09892a80288b34359bc0e6b7bf7935bfaec87b4ec19959"
    },
    {
      "name": "png/fx/fx-spin.png",
      "path": "png/fx/fx-spin.png",
      "type": "binary",
      "bytes": 16369,
      "sha256": "436bc0382f9a240a5b65c1e7b663e5943db613c4f23ac5a1c99219ab74250a36"
    },
    {
      "name": "png/meter/meter-hidden.png",
      "path": "png/meter/meter-hidden.png",
      "type": "binary",
      "bytes": 231,
      "sha256": "de73bb9d8a6a20b61b6d4550bb11ffbea8afacd5c7edfc672e1bc406b4c34e3a"
    },
    {
      "name": "png/meter/meter-locked.png",
      "path": "png/meter/meter-locked.png",
      "type": "binary",
      "bytes": 4424,
      "sha256": "9523fc5dde6c7580f1c413cf525503474744c6f7e7acc7bcf3577af52c0092f7"
    },
    {
      "name": "png/meter/meter-moving.png",
      "path": "png/meter/meter-moving.png",
      "type": "binary",
      "bytes": 3920,
      "sha256": "0849707eb54998a2d29cc8c7c92f2806afee28f6d73312243be06d792d5edcfd"
    },
    {
      "name": "png/meter/meter-needle.png",
      "path": "png/meter/meter-needle.png",
      "type": "binary",
      "bytes": 448,
      "sha256": "4ec257fb028702e980bf255ebc6ceac6799b97380af5ad1036ff2c1f4d9cbb1f"
    },
    {
      "name": "png/meter/meter-track.png",
      "path": "png/meter/meter-track.png",
      "type": "binary",
      "bytes": 3514,
      "sha256": "a7851979b73450c09dfce04d7e6d86ab9ceff7cc226ab5519ddbe29cf21d9d92"
    },
    {
      "name": "svg/buttons/button-brake-disabled.svg",
      "path": "svg/buttons/button-brake-disabled.svg",
      "type": "text",
      "bytes": 853,
      "sha256": "3418c8edbdea3c9c6fdbd295b83f81bf405d563945c82acf2bc19fafb0c00c51"
    },
    {
      "name": "svg/buttons/button-brake-idle.svg",
      "path": "svg/buttons/button-brake-idle.svg",
      "type": "text",
      "bytes": 830,
      "sha256": "a7422219ccd308bd815943c41ea4d5f54997dbf4eb96cfd5cf0e460a14275859"
    },
    {
      "name": "svg/buttons/button-brake-pressed.svg",
      "path": "svg/buttons/button-brake-pressed.svg",
      "type": "text",
      "bytes": 877,
      "sha256": "2436d728298382508bc93ce3c668e05407937e0623c0905b92616bcb3cc4cfff"
    },
    {
      "name": "svg/buttons/button-drop-disabled.svg",
      "path": "svg/buttons/button-drop-disabled.svg",
      "type": "text",
      "bytes": 870,
      "sha256": "9708ae5fe5613d6c5e19c5bf78796c9a8b1ce5e3574eed2219b1d687ca289cee"
    },
    {
      "name": "svg/buttons/button-drop-idle.svg",
      "path": "svg/buttons/button-drop-idle.svg",
      "type": "text",
      "bytes": 847,
      "sha256": "4a13049d23b28ece9d71d2902c8c2ec8c17a95fc112a519ffaa84b66d9842c86"
    },
    {
      "name": "svg/buttons/button-drop-pressed.svg",
      "path": "svg/buttons/button-drop-pressed.svg",
      "type": "text",
      "bytes": 894,
      "sha256": "7531498f1b49326bab08cffa542ee9cfbd0f0ec15c555a92aff2f62a08a10194"
    },
    {
      "name": "svg/buttons/button-placement-disabled.svg",
      "path": "svg/buttons/button-placement-disabled.svg",
      "type": "text",
      "bytes": 689,
      "sha256": "6006c3c69f8a50af2cfd6e01f3528d3e2833b0ca8488bc0a7f481a042fec21c8"
    },
    {
      "name": "svg/buttons/button-placement-idle.svg",
      "path": "svg/buttons/button-placement-idle.svg",
      "type": "text",
      "bytes": 666,
      "sha256": "2cdba7d511112c9b5de581fcb208eb1e9cc6eb0b9f6930e5596abfa5177eafb6"
    },
    {
      "name": "svg/buttons/button-placement-pressed.svg",
      "path": "svg/buttons/button-placement-pressed.svg",
      "type": "text",
      "bytes": 713,
      "sha256": "25998e647507dc5a1df537ca4c1bd82395b6733bb223246aed451a763df42fca"
    },
    {
      "name": "svg/buttons/button-serve-disabled.svg",
      "path": "svg/buttons/button-serve-disabled.svg",
      "type": "text",
      "bytes": 921,
      "sha256": "0ed38bd9f1643accb295001e8b4c68b35a4155b0a62431254a93ab6ee6635cdb"
    },
    {
      "name": "svg/buttons/button-serve-idle.svg",
      "path": "svg/buttons/button-serve-idle.svg",
      "type": "text",
      "bytes": 971,
      "sha256": "e86c6f6ad523ebf3512c037eb87fa55f989e5b9cab01e082551cd4c755fbb3f6"
    },
    {
      "name": "svg/buttons/button-serve-pressed.svg",
      "path": "svg/buttons/button-serve-pressed.svg",
      "type": "text",
      "bytes": 1018,
      "sha256": "846e8589345a39e60e5ab28ac4dbea455e9e9d81c542eb7fe2fd6fa90b7d9051"
    },
    {
      "name": "svg/buttons/button-slice-disabled.svg",
      "path": "svg/buttons/button-slice-disabled.svg",
      "type": "text",
      "bytes": 863,
      "sha256": "9c1e7cef1a23794684423d319b82f224a589d9709a82782750fbdb051b8a7e71"
    },
    {
      "name": "svg/buttons/button-slice-idle.svg",
      "path": "svg/buttons/button-slice-idle.svg",
      "type": "text",
      "bytes": 840,
      "sha256": "500d0e6ef342218db251585a682ad0d61edb4b317092770a32d71a77b829de9a"
    },
    {
      "name": "svg/buttons/button-slice-pressed.svg",
      "path": "svg/buttons/button-slice-pressed.svg",
      "type": "text",
      "bytes": 887,
      "sha256": "c12724089f9fdb361bdd32677b5731d9c478a46313aa5980c1ec864a2ac40bec"
    },
    {
      "name": "svg/buttons/button-smash-disabled.svg",
      "path": "svg/buttons/button-smash-disabled.svg",
      "type": "text",
      "bytes": 666,
      "sha256": "d6bc6934bd896126ef514333cc8f6490adabce718564f05b45d1b4c7c0cafbcf"
    },
    {
      "name": "svg/buttons/button-smash-idle.svg",
      "path": "svg/buttons/button-smash-idle.svg",
      "type": "text",
      "bytes": 643,
      "sha256": "ddba6c2275fb7b4c268975c23a18aa15161da8da873f865d59d90d38e9aad481"
    },
    {
      "name": "svg/buttons/button-smash-pressed.svg",
      "path": "svg/buttons/button-smash-pressed.svg",
      "type": "text",
      "bytes": 690,
      "sha256": "92e9fee010f8dbd26c22aef4c8d24f4c4fed4ef44f87a088e25a1638160d14a6"
    },
    {
      "name": "svg/fx/fx-net.svg",
      "path": "svg/fx/fx-net.svg",
      "type": "text",
      "bytes": 789,
      "sha256": "b775711acb5d83784a6fb374dbd281121def2f3eba08d8d3790e6ad89d424678"
    },
    {
      "name": "svg/fx/fx-out.svg",
      "path": "svg/fx/fx-out.svg",
      "type": "text",
      "bytes": 437,
      "sha256": "e5b9ba4345515b0f2c2a056cbc245f2bb2e7dda91217b36ef4d390f753955fbc"
    },
    {
      "name": "svg/fx/fx-perfect-green.svg",
      "path": "svg/fx/fx-perfect-green.svg",
      "type": "text",
      "bytes": 556,
      "sha256": "33545602c337009992ecc691fc72804d61e5e1860a1deae0a14e2b1d39bcfe1a"
    },
    {
      "name": "svg/fx/fx-power-serve.svg",
      "path": "svg/fx/fx-power-serve.svg",
      "type": "text",
      "bytes": 747,
      "sha256": "87ca94c0717bd0c87a08df1582a5df7740fe089a255320bfc57e4e34d1bc278b"
    },
    {
      "name": "svg/fx/fx-spin.svg",
      "path": "svg/fx/fx-spin.svg",
      "type": "text",
      "bytes": 710,
      "sha256": "f156ae7a668efaf24447a889185b8445dcd69b3e54452d6a1d0618950962de18"
    },
    {
      "name": "svg/meter/meter-hidden.svg",
      "path": "svg/meter/meter-hidden.svg",
      "type": "text",
      "bytes": 151,
      "sha256": "5e92645fa87cc021505b738c1f90ab65960a449c9c425dae4d3ab375d035e85d"
    },
    {
      "name": "svg/meter/meter-locked.svg",
      "path": "svg/meter/meter-locked.svg",
      "type": "text",
      "bytes": 1481,
      "sha256": "23e3f3d9eeceb820915b77e06c8ce41d49b353848121b8a25689a2c2990723a9"
    },
    {
      "name": "svg/meter/meter-moving.svg",
      "path": "svg/meter/meter-moving.svg",
      "type": "text",
      "bytes": 1399,
      "sha256": "37c6986229dc802035d31849bafab0c5a253a76712a78411171a182a633ffaa4"
    },
    {
      "name": "svg/meter/meter-needle.svg",
      "path": "svg/meter/meter-needle.svg",
      "type": "text",
      "bytes": 331,
      "sha256": "b7b313892c38cdfc112047d0b84833f6890b28aa39030f385da7125c9b371f33"
    },
    {
      "name": "svg/meter/meter-track.svg",
      "path": "svg/meter/meter-track.svg",
      "type": "text",
      "bytes": 1179,
      "sha256": "cd154a0d289fc28f1fccaebb4098df28164cc999e72fa8d6d71327c5047293c0"
    },
    {
      "name": "tennis-config.js",
      "path": "tennis-config.js",
      "type": "text",
      "bytes": 8047,
      "sha256": "289e3389a0623e5989273536c1e8ea07c66d8b8b7fd60c2c1a8e06c83cdd0a46"
    },
    {
      "name": "tennis-ui.css",
      "path": "tennis-ui.css",
      "type": "text",
      "bytes": 7784,
      "sha256": "ab6b21b0e8b2edf185a245d8785aeeb4345606952436a9cf5b849dadb4a16b79"
    },
    {
      "name": "tennis-ui.js",
      "path": "tennis-ui.js",
      "type": "text",
      "bytes": 15408,
      "sha256": "274219f2d4454e5b0c77f5f0f1b865844126ca387c344fe49eabb6f53a8233c7"
    }
  ]
});

export function create(options = {}) {
  return createAdapter(metadata, {
    baseURL: new URL('../../../assets/tennis-ui-v2/', import.meta.url),
    ...options,
  });
}

const adapter = create();
export const { load, ready, get, dispose } = adapter;
export default adapter;
