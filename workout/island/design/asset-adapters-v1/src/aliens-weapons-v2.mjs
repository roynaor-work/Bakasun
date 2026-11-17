// Generated from the audited catalog.json. No asset I/O happens during import.
import { createAdapter } from './runtime.mjs';

export const metadata = Object.freeze({
  "id": "aliens-weapons-v2",
  "game": "alien",
  "flag": "?assetAliensWeaponsV2=1",
  "available": true,
  "source": {
    "branch": "codex/aliens-weapons-v2",
    "commit": "0109f186bdbfb22662ea1b89e8ff134e29318464",
    "root": "workout/island/design/aliens-weapons-v2"
  },
  "license": {
    "spdx": "CC0-1.0 AND MIT",
    "note": "LICENSE.txt: נכסי אמנות CC0-1.0, קוד ונתוני מסירה MIT.",
    "files": [
      "LICENSE.txt"
    ]
  },
  "bytes": 945195,
  "runtimeBytes": 943140,
  "dependencies": [
    "Canvas/WebGL לאטלסי PNG ו־SVG; Web Audio או HTMLAudio לפענוח OGG/MP3 ולפתיחת שמע במחוות משתמש."
  ],
  "missing": [
    "חיבור מיפוי כלי הנשק הקיימים להנחיית טיל, חדירה, מטען, זוג טילים ומלאי; המניפסט מתאר נכסים ואינו מממש נזק."
  ],
  "assets": [
    {
      "name": "atlases/charge-bomb.png",
      "path": "atlases/charge-bomb.png",
      "type": "binary",
      "bytes": 86304,
      "sha256": "5b743e7fb59763c1afbce7ab4c29d9bef28b6862d8c733daa22da6cc691da3f2"
    },
    {
      "name": "atlases/double-missile.png",
      "path": "atlases/double-missile.png",
      "type": "binary",
      "bytes": 64217,
      "sha256": "74d57c45c66cf4fb14e17d495c910a555b2a6a5020206140816a8eb0afe863fe"
    },
    {
      "name": "atlases/electric-pulse.png",
      "path": "atlases/electric-pulse.png",
      "type": "binary",
      "bytes": 99270,
      "sha256": "dcdda61955e8e4f82db52545cdce36d9ead827b99788d476746319fde580b021"
    },
    {
      "name": "atlases/guided-missile.png",
      "path": "atlases/guided-missile.png",
      "type": "binary",
      "bytes": 63267,
      "sha256": "2dea4e7500a1d58525d7f6e6e3461bd30a7c27bebe78320ffb1a4dc69a85a2e1"
    },
    {
      "name": "atlases/piercing-laser.png",
      "path": "atlases/piercing-laser.png",
      "type": "binary",
      "bytes": 149491,
      "sha256": "6949bfb976fac60bea121e47615ab850ca08bb5ac55cbd708646a09c797fc15b"
    },
    {
      "name": "atlases/shield.png",
      "path": "atlases/shield.png",
      "type": "binary",
      "bytes": 122385,
      "sha256": "56c9b5e4a7479db9822f966e11cb8459c8e40426a6df047661a5bb33c166235b"
    },
    {
      "name": "audio/charge-bomb-fire.mp3",
      "path": "audio/charge-bomb-fire.mp3",
      "type": "binary",
      "bytes": 6079,
      "sha256": "689d70472e1b2266d1670bce885aef49963c2e98c3bd7de091eb3ca0f12040bc"
    },
    {
      "name": "audio/charge-bomb-fire.ogg",
      "path": "audio/charge-bomb-fire.ogg",
      "type": "binary",
      "bytes": 7121,
      "sha256": "c4c9ae7d1a53c425bbbcf48f8f03c35821a730eeec9a43c3a8109280758f3a59"
    },
    {
      "name": "audio/charge-bomb-impact.mp3",
      "path": "audio/charge-bomb-impact.mp3",
      "type": "binary",
      "bytes": 8587,
      "sha256": "6ec7706ce8db7db3ce966b15218512dd2e94d02e70e0acac80e054e4e3b9697d"
    },
    {
      "name": "audio/charge-bomb-impact.ogg",
      "path": "audio/charge-bomb-impact.ogg",
      "type": "binary",
      "bytes": 9538,
      "sha256": "9ff9df7fa5b6a83c0134352761e3583e026e516ebaf24e9a250412e463b578e3"
    },
    {
      "name": "audio/double-missile-fire.mp3",
      "path": "audio/double-missile-fire.mp3",
      "type": "binary",
      "bytes": 5243,
      "sha256": "86b2a42e6e1ad1cae0728a51a7b3495cc77c40f89d75949488cadbe4a26e1a04"
    },
    {
      "name": "audio/double-missile-fire.ogg",
      "path": "audio/double-missile-fire.ogg",
      "type": "binary",
      "bytes": 7216,
      "sha256": "0002c34dda9c0773757d66f871ece3f2f4688e0e130265fe78372006b0fe5710"
    },
    {
      "name": "audio/double-missile-impact.mp3",
      "path": "audio/double-missile-impact.mp3",
      "type": "binary",
      "bytes": 6288,
      "sha256": "0d6ec6c0acda3e979eba573ef50f8e7b90c760d00d355a228ac6aba0508aab9d"
    },
    {
      "name": "audio/double-missile-impact.ogg",
      "path": "audio/double-missile-impact.ogg",
      "type": "binary",
      "bytes": 8061,
      "sha256": "1138b67633358028bf7642314ac9c892fa5307f83907b1f36c23ac8eedf66fbd"
    },
    {
      "name": "audio/electric-pulse-fire.mp3",
      "path": "audio/electric-pulse-fire.mp3",
      "type": "binary",
      "bytes": 4198,
      "sha256": "7c6df632239d57151ea30c0746f0fdfcb1087dd0d1ff9844ab8b4a783fbfa8b8"
    },
    {
      "name": "audio/electric-pulse-fire.ogg",
      "path": "audio/electric-pulse-fire.ogg",
      "type": "binary",
      "bytes": 7024,
      "sha256": "8e272258907c4381731f0e3e02bc31b90c42ac86d8cbb1d07ee383f590edd6f0"
    },
    {
      "name": "audio/electric-pulse-impact.mp3",
      "path": "audio/electric-pulse-impact.mp3",
      "type": "binary",
      "bytes": 4825,
      "sha256": "f8236214aab0c9dad60a8cacf8e8376e3f1d62598eb42b55b97c7cd57f24eb24"
    },
    {
      "name": "audio/electric-pulse-impact.ogg",
      "path": "audio/electric-pulse-impact.ogg",
      "type": "binary",
      "bytes": 7041,
      "sha256": "c24b8d5a16013615714db4dc531b7768c6b01ef089031d4782e46132e74e2c35"
    },
    {
      "name": "audio/guided-missile-fire.mp3",
      "path": "audio/guided-missile-fire.mp3",
      "type": "binary",
      "bytes": 5034,
      "sha256": "7ff62d5410346b86ac80d25a3ee01c7390ed4767d1f3c2b3f5e5074021f9df58"
    },
    {
      "name": "audio/guided-missile-fire.ogg",
      "path": "audio/guided-missile-fire.ogg",
      "type": "binary",
      "bytes": 6913,
      "sha256": "4e008088b7383ebaef098e1507a786cf779b82006471e08492af6fa751e0e8f9"
    },
    {
      "name": "audio/guided-missile-impact.mp3",
      "path": "audio/guided-missile-impact.mp3",
      "type": "binary",
      "bytes": 5452,
      "sha256": "193220d474abb68c1a65523fae7d8b45f0834361186d0bfbb6f2b659d748d474"
    },
    {
      "name": "audio/guided-missile-impact.ogg",
      "path": "audio/guided-missile-impact.ogg",
      "type": "binary",
      "bytes": 7340,
      "sha256": "4775775ad733a65a7cb9aa3d3f3666fa8f7d78c2dd46b7b49adacfac8e1c3246"
    },
    {
      "name": "audio/piercing-laser-fire.mp3",
      "path": "audio/piercing-laser-fire.mp3",
      "type": "binary",
      "bytes": 3362,
      "sha256": "5f14883b6782f2b9e681eff650ca9ee28ea9056f616828086f582ab985b8595b"
    },
    {
      "name": "audio/piercing-laser-fire.ogg",
      "path": "audio/piercing-laser-fire.ogg",
      "type": "binary",
      "bytes": 5426,
      "sha256": "2e2678a729f9df1a76104e31d7d7e2c4650e4851eaddbe18455c292bb7e74e52"
    },
    {
      "name": "audio/piercing-laser-impact.mp3",
      "path": "audio/piercing-laser-impact.mp3",
      "type": "binary",
      "bytes": 2944,
      "sha256": "917add78b71b4952d0026c4aeeae7066c61f4d0e64f97cc381e54f0df2ee81a1"
    },
    {
      "name": "audio/piercing-laser-impact.ogg",
      "path": "audio/piercing-laser-impact.ogg",
      "type": "binary",
      "bytes": 5536,
      "sha256": "d3748f2d3d526759dc56dbb6e22002c1422421bc8f80dfbb5d8c3fd650f7757b"
    },
    {
      "name": "audio/shield-fire.mp3",
      "path": "audio/shield-fire.mp3",
      "type": "binary",
      "bytes": 5243,
      "sha256": "00980ebd643e1e5d8632fc740495535125903b73ca369fe083162569fc9739c0"
    },
    {
      "name": "audio/shield-fire.ogg",
      "path": "audio/shield-fire.ogg",
      "type": "binary",
      "bytes": 5030,
      "sha256": "c2df445765d7f61cd355abb27e1719b472d2f615ac9a8985245fb200205281d0"
    },
    {
      "name": "audio/shield-impact.mp3",
      "path": "audio/shield-impact.mp3",
      "type": "binary",
      "bytes": 3989,
      "sha256": "6d4591167a411337d33cb6989a94ba035637d1f96b3669b38a3e9654e4b34783"
    },
    {
      "name": "audio/shield-impact.ogg",
      "path": "audio/shield-impact.ogg",
      "type": "binary",
      "bytes": 5973,
      "sha256": "beeeb718e5548598882a8a01bd231d6e3e4569919866518af9cc54f77e2726d9"
    },
    {
      "name": "icons/charge-bomb-disabled.png",
      "path": "icons/charge-bomb-disabled.png",
      "type": "binary",
      "bytes": 3680,
      "sha256": "2e975f95496cc799c37d10e67dc3005b21ef079c17bfb14e783e327c5cee8073"
    },
    {
      "name": "icons/charge-bomb-disabled.svg",
      "path": "icons/charge-bomb-disabled.svg",
      "type": "text",
      "bytes": 2238,
      "sha256": "e8b3ae6c504141c567d55387c2643d5e41a4767b5b1e2d5ff615e5e217404c4c"
    },
    {
      "name": "icons/charge-bomb-pressed.png",
      "path": "icons/charge-bomb-pressed.png",
      "type": "binary",
      "bytes": 5987,
      "sha256": "cef5c8992da42a774f590492fc39619ff501bfcfce564fa1dcb7033b2490f572"
    },
    {
      "name": "icons/charge-bomb-pressed.svg",
      "path": "icons/charge-bomb-pressed.svg",
      "type": "text",
      "bytes": 2219,
      "sha256": "9e08cedf385ed27c52139968abaed9379b74646de3a195aeecbb71922da06d20"
    },
    {
      "name": "icons/charge-bomb-ready.png",
      "path": "icons/charge-bomb-ready.png",
      "type": "binary",
      "bytes": 3741,
      "sha256": "e097ba73db40a7e1c984c928367c7526cfb6435b7ad0a85f89a01d6c8adcd466"
    },
    {
      "name": "icons/charge-bomb-ready.svg",
      "path": "icons/charge-bomb-ready.svg",
      "type": "text",
      "bytes": 2089,
      "sha256": "424a8356d2eaba1027a1a74af11919265f6beb5dc9bc57ab2ee86a95de2fafa1"
    },
    {
      "name": "icons/charge-bomb-refill.png",
      "path": "icons/charge-bomb-refill.png",
      "type": "binary",
      "bytes": 4308,
      "sha256": "1fd9ae56623b86f69c08bb300fd49bcf2cc7c65afa416c334feca6e5328ffd30"
    },
    {
      "name": "icons/charge-bomb-refill.svg",
      "path": "icons/charge-bomb-refill.svg",
      "type": "text",
      "bytes": 2063,
      "sha256": "4d54f44222c94a82349d7907b3718491fdc1e267d28cb1cec5bf5ec305630ebc"
    },
    {
      "name": "icons/double-missile-disabled.png",
      "path": "icons/double-missile-disabled.png",
      "type": "binary",
      "bytes": 4058,
      "sha256": "f09bcd139f1e7ef9875bebd0a3db904bfa81a1d64faf5b0472831ca069009da7"
    },
    {
      "name": "icons/double-missile-disabled.svg",
      "path": "icons/double-missile-disabled.svg",
      "type": "text",
      "bytes": 2995,
      "sha256": "02bb5ab878fcb9da05915201b1d498b2ad4e0457b097879b02ffc058156b8c3d"
    },
    {
      "name": "icons/double-missile-pressed.png",
      "path": "icons/double-missile-pressed.png",
      "type": "binary",
      "bytes": 7535,
      "sha256": "7769982fb7d2e7974877aa4ccca54a2d05e882fbab43c96ae2052a025e30dde6"
    },
    {
      "name": "icons/double-missile-pressed.svg",
      "path": "icons/double-missile-pressed.svg",
      "type": "text",
      "bytes": 2979,
      "sha256": "4f6ec6aabf6f44666a54cd2a0041d20104ff6588ebb5517cb12d656ea57fa73b"
    },
    {
      "name": "icons/double-missile-ready.png",
      "path": "icons/double-missile-ready.png",
      "type": "binary",
      "bytes": 3889,
      "sha256": "66b422d3f83bdce5a38f5aa5de50f7bf9a8d06abc5bddb8caf41ab5bf08c1367"
    },
    {
      "name": "icons/double-missile-ready.svg",
      "path": "icons/double-missile-ready.svg",
      "type": "text",
      "bytes": 2846,
      "sha256": "234caaaafe25b63acf894393b89baa5fc9bb5eced64579a7a0012c4aa70c964b"
    },
    {
      "name": "icons/double-missile-refill.png",
      "path": "icons/double-missile-refill.png",
      "type": "binary",
      "bytes": 4555,
      "sha256": "2590bac242f0fa1fc3bcebf7cb0c7febcdfcd90e53d3d2b4c636f38051ab594e"
    },
    {
      "name": "icons/double-missile-refill.svg",
      "path": "icons/double-missile-refill.svg",
      "type": "text",
      "bytes": 2820,
      "sha256": "28eff48874f0e92a1bfcce3d8c030c48dd0a63f09caf2480eef3ce9d4790e7e3"
    },
    {
      "name": "icons/electric-pulse-disabled.png",
      "path": "icons/electric-pulse-disabled.png",
      "type": "binary",
      "bytes": 4658,
      "sha256": "ddb73a068a0938926be9db117a579236c8d5b4abcc5d79bfbacc5d32f85e778a"
    },
    {
      "name": "icons/electric-pulse-disabled.svg",
      "path": "icons/electric-pulse-disabled.svg",
      "type": "text",
      "bytes": 2192,
      "sha256": "6d9e7cb258c2b08525d95ad797a5d4264871d28dacd48f51695a62b88433ffd7"
    },
    {
      "name": "icons/electric-pulse-pressed.png",
      "path": "icons/electric-pulse-pressed.png",
      "type": "binary",
      "bytes": 7199,
      "sha256": "d8d59f1c71c8645b35719dbd54d1e82e5cc1e2c52be33dac309375e1fa56a6cb"
    },
    {
      "name": "icons/electric-pulse-pressed.svg",
      "path": "icons/electric-pulse-pressed.svg",
      "type": "text",
      "bytes": 2176,
      "sha256": "effae6e9da19b3f3a64c5952e990ccba455bb55193beb16da80be0b865a015b0"
    },
    {
      "name": "icons/electric-pulse-ready.png",
      "path": "icons/electric-pulse-ready.png",
      "type": "binary",
      "bytes": 4957,
      "sha256": "10c8c0b3ac2ba588b5a387473b85140869ba57470c3666214410b8afbcaeb506"
    },
    {
      "name": "icons/electric-pulse-ready.svg",
      "path": "icons/electric-pulse-ready.svg",
      "type": "text",
      "bytes": 2043,
      "sha256": "a7df42bd8d7838bf2124b0d239e3d6a495128d46c24b71609919500f2a7fba3a"
    },
    {
      "name": "icons/electric-pulse-refill.png",
      "path": "icons/electric-pulse-refill.png",
      "type": "binary",
      "bytes": 4812,
      "sha256": "4a5895bb69c56375befc4b552a2fad2b85cb79be69ec0eb9b194bd57ea04e33a"
    },
    {
      "name": "icons/electric-pulse-refill.svg",
      "path": "icons/electric-pulse-refill.svg",
      "type": "text",
      "bytes": 2017,
      "sha256": "d0de784a605b6779442e4cedd3a281de0ff746ebd6dcf838be49cb38ff9ae5c3"
    },
    {
      "name": "icons/guided-missile-disabled.png",
      "path": "icons/guided-missile-disabled.png",
      "type": "binary",
      "bytes": 3636,
      "sha256": "b6e189265d426d7e753fa4da7d23c42ed3c45e5e16b35efcabf08ff1b31b4e04"
    },
    {
      "name": "icons/guided-missile-disabled.svg",
      "path": "icons/guided-missile-disabled.svg",
      "type": "text",
      "bytes": 2592,
      "sha256": "c3c098fe3370ebcfd3ab4a7998689529581d08e46f3548967e2e6350c0be3545"
    },
    {
      "name": "icons/guided-missile-pressed.png",
      "path": "icons/guided-missile-pressed.png",
      "type": "binary",
      "bytes": 6770,
      "sha256": "2a2144cb0070701ef3389a7a92db6723dfa24e51a89a9733910220c69928904c"
    },
    {
      "name": "icons/guided-missile-pressed.svg",
      "path": "icons/guided-missile-pressed.svg",
      "type": "text",
      "bytes": 2576,
      "sha256": "bb22c75eab8cb6a239ec1ed6cdb7a7ade6d23128077d0df114737f62ac9e535c"
    },
    {
      "name": "icons/guided-missile-ready.png",
      "path": "icons/guided-missile-ready.png",
      "type": "binary",
      "bytes": 3546,
      "sha256": "fd3320a782c7c5f0a42bf76fc5fdcc4ab1fc239211e722c9ac28daee63cb31f1"
    },
    {
      "name": "icons/guided-missile-ready.svg",
      "path": "icons/guided-missile-ready.svg",
      "type": "text",
      "bytes": 2443,
      "sha256": "266da87b1e1dc60981f074bdef3e7ed6a4e4e8a929698cc00de972cbcf4f7c2d"
    },
    {
      "name": "icons/guided-missile-refill.png",
      "path": "icons/guided-missile-refill.png",
      "type": "binary",
      "bytes": 4140,
      "sha256": "2e89d8194b5f234ed6655aff38e3d8a4313965d0c58312a97fcc1b82edc81ab7"
    },
    {
      "name": "icons/guided-missile-refill.svg",
      "path": "icons/guided-missile-refill.svg",
      "type": "text",
      "bytes": 2417,
      "sha256": "77bfc8f5f07d1158aac9e7ff1ec86f279d80d0977cb791c838d5b95887c593fc"
    },
    {
      "name": "icons/piercing-laser-disabled.png",
      "path": "icons/piercing-laser-disabled.png",
      "type": "binary",
      "bytes": 3199,
      "sha256": "8268cc5e56fc0f6cb58e2402dd9e4596ae9479809f3b0f02264d287520e9d980"
    },
    {
      "name": "icons/piercing-laser-disabled.svg",
      "path": "icons/piercing-laser-disabled.svg",
      "type": "text",
      "bytes": 2274,
      "sha256": "d64fb00b6ac67a446478d2bd3cf43a813804521c8722e770c7ced819f95f6698"
    },
    {
      "name": "icons/piercing-laser-pressed.png",
      "path": "icons/piercing-laser-pressed.png",
      "type": "binary",
      "bytes": 6632,
      "sha256": "12ce365715870a3c831392e6ac05f15450cad320d2a3cfa2137e42c667c3c028"
    },
    {
      "name": "icons/piercing-laser-pressed.svg",
      "path": "icons/piercing-laser-pressed.svg",
      "type": "text",
      "bytes": 2258,
      "sha256": "7b2f4176bc2fd6808e0fd1ee9103c97132e9750e673dab0104c0e2b1604a8365"
    },
    {
      "name": "icons/piercing-laser-ready.png",
      "path": "icons/piercing-laser-ready.png",
      "type": "binary",
      "bytes": 3004,
      "sha256": "dd3aa09b608914fda4a65df9b3b591f3628b3c3980074ee867d8cb8940809aa9"
    },
    {
      "name": "icons/piercing-laser-ready.svg",
      "path": "icons/piercing-laser-ready.svg",
      "type": "text",
      "bytes": 2125,
      "sha256": "2327a0146c8e6ad090ba1b89c7eb5266a41bdceb46ca04c841fa8c32712f7a2e"
    },
    {
      "name": "icons/piercing-laser-refill.png",
      "path": "icons/piercing-laser-refill.png",
      "type": "binary",
      "bytes": 3537,
      "sha256": "f23a3dc46e42efe8d7e575a0b29494563fbd9b18fe896ced3e1a37e2156c8759"
    },
    {
      "name": "icons/piercing-laser-refill.svg",
      "path": "icons/piercing-laser-refill.svg",
      "type": "text",
      "bytes": 2099,
      "sha256": "8959ebaa5f3bd79f167f2b4851312c76c1a7cf38d237a086adcbfe7085ff381a"
    },
    {
      "name": "icons/shield-disabled.png",
      "path": "icons/shield-disabled.png",
      "type": "binary",
      "bytes": 3595,
      "sha256": "586cb9e411b0e0580fc5887db53ef79cca862363f73966c3e8463791cd3717eb"
    },
    {
      "name": "icons/shield-disabled.svg",
      "path": "icons/shield-disabled.svg",
      "type": "text",
      "bytes": 2132,
      "sha256": "77ff1a1c0d110747084ed173d96f47891be5ec1f793df403c608dcb13224bc12"
    },
    {
      "name": "icons/shield-pressed.png",
      "path": "icons/shield-pressed.png",
      "type": "binary",
      "bytes": 5838,
      "sha256": "b1669d14874f69ef519051e35bc517211f3ac8ca1073557ab8b2ad7182c5f970"
    },
    {
      "name": "icons/shield-pressed.svg",
      "path": "icons/shield-pressed.svg",
      "type": "text",
      "bytes": 2108,
      "sha256": "5091e27be605bb1b19f2bb21776a40b451a41590678394f76ad09918778f2bad"
    },
    {
      "name": "icons/shield-ready.png",
      "path": "icons/shield-ready.png",
      "type": "binary",
      "bytes": 3603,
      "sha256": "448c09d426804431179545ddd60e308c02f17dd2735be3c9ea2af1ebe1ed14d1"
    },
    {
      "name": "icons/shield-ready.svg",
      "path": "icons/shield-ready.svg",
      "type": "text",
      "bytes": 1983,
      "sha256": "9ecf026ea949d6d9306c7911bc55acb14c5e6628e3d383694f3a9c04dd2b2edf"
    },
    {
      "name": "icons/shield-refill.png",
      "path": "icons/shield-refill.png",
      "type": "binary",
      "bytes": 4161,
      "sha256": "d47bf5c28a638f259ba58c15df2fa97d113f9aafff794d9f3f255f011951613e"
    },
    {
      "name": "icons/shield-refill.svg",
      "path": "icons/shield-refill.svg",
      "type": "text",
      "bytes": 1957,
      "sha256": "0960ed61c3e0563758808cd98360e07f25fffd07534d422e618feeee9914872e"
    },
    {
      "name": "manifest.json",
      "path": "manifest.json",
      "type": "json",
      "bytes": 48062,
      "sha256": "c3413acef4486d7592fcbd773a79fed6c34ca129e48f74472e866f357b10576f"
    }
  ]
});

export function create(options = {}) {
  return createAdapter(metadata, {
    baseURL: new URL('../../../assets/aliens-weapons-v2/', import.meta.url),
    ...options,
  });
}

const adapter = create();
export const { load, ready, get, dispose } = adapter;
export default adapter;
