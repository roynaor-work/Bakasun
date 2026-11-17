// Generated from the audited catalog.json. No asset I/O happens during import.
import { createAdapter } from './runtime.mjs';

export const metadata = Object.freeze({
  "id": "racing-customize-v1",
  "game": "racing",
  "flag": "?assetRacingCustomizeV1=1",
  "available": true,
  "source": {
    "branch": "codex/racing-customize-v1",
    "commit": "cc5b7bd9adc35de32dfbfdbd73c9a0d465c37902",
    "root": "workout/island/design/racing-customize-v1"
  },
  "license": {
    "spdx": "CC0-1.0 AND MIT",
    "note": "LICENSES.md: original upgrades/icons/runtime CC0; Formula source CC0; runtime/decal.mjs derives Three.js DecalGeometry under MIT (full text retained).",
    "files": [
      "LICENSES.md"
    ]
  },
  "bytes": 1351057,
  "runtimeBytes": 1347447,
  "dependencies": [
    "Host local Three.js and GLTFLoader, compatible original Formula scene with preserved Body/FrontWing/RearWing/Helmet/Wheel names.",
    "Customization must run on an unmerged per-vehicle original Formula clone; skip mergeFormula for replaceable/hidden parts afterwards.",
    "runtime/*.mjs supplied as text; host may import copied native ES modules explicitly when wiring and must own externally loaded geometry/textures."
  ],
  "missing": [
    "Economy, purchase decisions and save persistence remain an explicit game integration step; source pack has cosmetic selection only."
  ],
  "assets": [
    {
      "name": "assets/base/formula-mounted.glb",
      "path": "assets/base/formula-mounted.glb",
      "type": "glb",
      "bytes": 337184,
      "sha256": "fb1f59aa17bd362182511608c9a2c0d886d5c8dcf4bccc1def2ab2f00bc97621"
    },
    {
      "name": "assets/decals/flames-classic.svg",
      "path": "assets/decals/flames-classic.svg",
      "type": "text",
      "bytes": 225,
      "sha256": "83b05c4b47e326bbe9481add17c40d1b50742478d7b20cbb58de7af50a780de8"
    },
    {
      "name": "assets/decals/flames-curl.svg",
      "path": "assets/decals/flames-curl.svg",
      "type": "text",
      "bytes": 242,
      "sha256": "41ea26f2240d81c08b7ae9be862071520d98f8a63eb78207a6750fe9b1b1e4da"
    },
    {
      "name": "assets/decals/flames-sharp.svg",
      "path": "assets/decals/flames-sharp.svg",
      "type": "text",
      "bytes": 204,
      "sha256": "7fcc7502daff275b0e8e797cf6d04da4d880d8005e4ead11a72c07d93789e3ef"
    },
    {
      "name": "assets/decals/flames-twin.svg",
      "path": "assets/decals/flames-twin.svg",
      "type": "text",
      "bytes": 248,
      "sha256": "c8d00575ee7b4641ae7da19a5a1200768e8d7eebdc030033ed5d09e7d06d632d"
    },
    {
      "name": "assets/decals/stars-burst.svg",
      "path": "assets/decals/stars-burst.svg",
      "type": "text",
      "bytes": 331,
      "sha256": "7cb3496bcb65174318ffca7622f94b0f2c742e9d05ec9c70d11ee1d1ce014281"
    },
    {
      "name": "assets/decals/stars-one.svg",
      "path": "assets/decals/stars-one.svg",
      "type": "text",
      "bytes": 260,
      "sha256": "a3895eadac3603bae198330282e15dc37186393c6ef93b610d1889134ddad78c"
    },
    {
      "name": "assets/decals/stars-orbit.svg",
      "path": "assets/decals/stars-orbit.svg",
      "type": "text",
      "bytes": 357,
      "sha256": "c751452d8b78a3f83bea4a2824ef8f187eee32635b0343edd66e7b1b8939865c"
    },
    {
      "name": "assets/decals/stars-trio.svg",
      "path": "assets/decals/stars-trio.svg",
      "type": "text",
      "bytes": 537,
      "sha256": "141b5a9e7be230178837616238da5432bd0eba1f4f9fcdf2936b0d25cf4eed66"
    },
    {
      "name": "assets/decals/stripes-chevron.svg",
      "path": "assets/decals/stripes-chevron.svg",
      "type": "text",
      "bytes": 201,
      "sha256": "344d9fbaa8206a885e01b1d1f6ce6335fe70f9545bc8c2c0b250d5a8f9b86779"
    },
    {
      "name": "assets/decals/stripes-offset.svg",
      "path": "assets/decals/stripes-offset.svg",
      "type": "text",
      "bytes": 195,
      "sha256": "aa12d0f7faf3d4d0d3d826eb9ce9540c201e2a28808f26c9bc49b96b89293fae"
    },
    {
      "name": "assets/decals/stripes-speed.svg",
      "path": "assets/decals/stripes-speed.svg",
      "type": "text",
      "bytes": 191,
      "sha256": "04c732363cf31695e3a7cfd5a132c934e111ba366a7074e256f6117748ad70c9"
    },
    {
      "name": "assets/decals/stripes-twin.svg",
      "path": "assets/decals/stripes-twin.svg",
      "type": "text",
      "bytes": 164,
      "sha256": "bba0461ab322e657d90e95ed4ab1bb2180d6ec364ffcaf15989945623ca2a285"
    },
    {
      "name": "assets/effects/amber.glb",
      "path": "assets/effects/amber.glb",
      "type": "glb",
      "bytes": 15428,
      "sha256": "8ba83ae5bf5a863383ad8df062a5edda256c1de68750cc261752cc636195a26c"
    },
    {
      "name": "assets/effects/electric.glb",
      "path": "assets/effects/electric.glb",
      "type": "glb",
      "bytes": 15400,
      "sha256": "ec22637f0de01584865b12cac6a4420a544b5255e823c1f365fe621c0726bce3"
    },
    {
      "name": "assets/effects/gold.glb",
      "path": "assets/effects/gold.glb",
      "type": "glb",
      "bytes": 15404,
      "sha256": "98ac162ab55658c777ca45f0656cb9fdeb74bcb882e0363abf4a48f75d3e2fa0"
    },
    {
      "name": "assets/effects/ion.glb",
      "path": "assets/effects/ion.glb",
      "type": "glb",
      "bytes": 15428,
      "sha256": "08b839089d7850abd64c6de9a9418dbfd91fd32f7f9fcfd9de5c4625abbe78c9"
    },
    {
      "name": "assets/effects/teal.glb",
      "path": "assets/effects/teal.glb",
      "type": "glb",
      "bytes": 16732,
      "sha256": "14e403c89a7e1f217ec6a88c9865daf52c068e7ca36bdbb5b92a29a9d252dab2"
    },
    {
      "name": "assets/effects/violet.glb",
      "path": "assets/effects/violet.glb",
      "type": "glb",
      "bytes": 16728,
      "sha256": "cf9d100c58b63a0b6ceb8e48d23533a00f0eff40a96e9a0067d17066dc1f8005"
    },
    {
      "name": "assets/front-wings/arrow.glb",
      "path": "assets/front-wings/arrow.glb",
      "type": "glb",
      "bytes": 19316,
      "sha256": "d374691c5a500f94304154a572ecfc8d2022a4597da052646e2dacc0468d88b1"
    },
    {
      "name": "assets/front-wings/blade.glb",
      "path": "assets/front-wings/blade.glb",
      "type": "glb",
      "bytes": 11672,
      "sha256": "ac3a9bda9f8bf188d0e7bb148eca8a5f2f163ef74862bca87d6510a0f2b8073b"
    },
    {
      "name": "assets/front-wings/cascade.glb",
      "path": "assets/front-wings/cascade.glb",
      "type": "glb",
      "bytes": 23780,
      "sha256": "89af0ce816c20499f02a943d2a5af83371171b09094cb6fa9395f42ef2199a73"
    },
    {
      "name": "assets/front-wings/delta.glb",
      "path": "assets/front-wings/delta.glb",
      "type": "glb",
      "bytes": 19316,
      "sha256": "98c2ce4adbad63aed69fcac962349683afa5578558657331b263769d8b101138"
    },
    {
      "name": "assets/front-wings/manta.glb",
      "path": "assets/front-wings/manta.glb",
      "type": "glb",
      "bytes": 17276,
      "sha256": "005d19e293258a8e534409e913c7d104d05ad7311b0053804ad0f869019c1c03"
    },
    {
      "name": "assets/front-wings/split.glb",
      "path": "assets/front-wings/split.glb",
      "type": "glb",
      "bytes": 17348,
      "sha256": "32eb329cfb096fe2e9160a7204488d59af6755008988d80da7b4e1f56798a647"
    },
    {
      "name": "assets/front-wings/sweep.glb",
      "path": "assets/front-wings/sweep.glb",
      "type": "glb",
      "bytes": 17288,
      "sha256": "50c03b86a30f76b23c183f8182d0f6df7a3c7a7ba7101161674e8b88c91d1b0e"
    },
    {
      "name": "assets/front-wings/wave.glb",
      "path": "assets/front-wings/wave.glb",
      "type": "glb",
      "bytes": 24952,
      "sha256": "9303cd2e5104bd3bccb014f7bb0a066fc517afe601fadadc8a84f28cf6bd8a54"
    },
    {
      "name": "assets/helmets/aero.glb",
      "path": "assets/helmets/aero.glb",
      "type": "glb",
      "bytes": 19052,
      "sha256": "38927e0c59c23b9fd650065054293592d96377de3c2fa5a2d1010787184ee68a"
    },
    {
      "name": "assets/helmets/classic.glb",
      "path": "assets/helmets/classic.glb",
      "type": "glb",
      "bytes": 18476,
      "sha256": "0a017fd7eecc6be881b78eb221042c46a818103fad46fc497851232daf844c80"
    },
    {
      "name": "assets/helmets/comet.glb",
      "path": "assets/helmets/comet.glb",
      "type": "glb",
      "bytes": 19716,
      "sha256": "5327ab7215e232f08d1752169b3bf1c25dd946e54cdbfbdedca6824655410e5d"
    },
    {
      "name": "assets/helmets/halo.glb",
      "path": "assets/helmets/halo.glb",
      "type": "glb",
      "bytes": 22312,
      "sha256": "ef2803a3d7383b7f36791bb5eff08ef004723415b395b4fcd172861be9c44c6f"
    },
    {
      "name": "assets/helmets/prism.glb",
      "path": "assets/helmets/prism.glb",
      "type": "glb",
      "bytes": 15892,
      "sha256": "4f4433cb724d5982bfaa0b32b6aad5736e9d36cefa4cf1bc5ad6393959bcd4d2"
    },
    {
      "name": "assets/helmets/ridge.glb",
      "path": "assets/helmets/ridge.glb",
      "type": "glb",
      "bytes": 19064,
      "sha256": "006cf9a73fa8b1e9c681a30e923bb7291c596236fac44cfbfbe7204a36d4c90b"
    },
    {
      "name": "assets/helmets/tail.glb",
      "path": "assets/helmets/tail.glb",
      "type": "glb",
      "bytes": 19052,
      "sha256": "8cbaff35d600564f7d4b0202f8d2bd86d6f6207a173018cbb7af8a3946a29be5"
    },
    {
      "name": "assets/helmets/vent.glb",
      "path": "assets/helmets/vent.glb",
      "type": "glb",
      "bytes": 22308,
      "sha256": "2b8ce4774f41ab7df3c1d704621091e56ae3323910e038a6bf78109eabd468b1"
    },
    {
      "name": "assets/paints/stripes.svg",
      "path": "assets/paints/stripes.svg",
      "type": "text",
      "bytes": 164,
      "sha256": "1c96e5156bf9382c83265d649f03a26f71c140fda95d42f27dc9642174453497"
    },
    {
      "name": "assets/rear-wings/arc.glb",
      "path": "assets/rear-wings/arc.glb",
      "type": "glb",
      "bytes": 17256,
      "sha256": "ac591c0d3797730b048f932d19ed50088bf369bcfa815304ff43029123a0847c"
    },
    {
      "name": "assets/rear-wings/box.glb",
      "path": "assets/rear-wings/box.glb",
      "type": "glb",
      "bytes": 23640,
      "sha256": "a682dd916dee4e2c675f80bc72d0651fb4d7440ad21008acadb2a202da968ba6"
    },
    {
      "name": "assets/rear-wings/highline.glb",
      "path": "assets/rear-wings/highline.glb",
      "type": "glb",
      "bytes": 22868,
      "sha256": "67523473425ac4aa38f1901a709e9325b47aa01f3c040a8bed67c2acf3b124df"
    },
    {
      "name": "assets/rear-wings/lowdrag.glb",
      "path": "assets/rear-wings/lowdrag.glb",
      "type": "glb",
      "bytes": 11648,
      "sha256": "f2cc53ef41715eae1db53714be2044fd7c88a82d29b19f23927ba89c12d64a83"
    },
    {
      "name": "assets/rear-wings/split.glb",
      "path": "assets/rear-wings/split.glb",
      "type": "glb",
      "bytes": 17252,
      "sha256": "4262aa6736e2dd605cffe6edc86e3d86e27b5d84a0ca7c55fdddfc0733ffaf38"
    },
    {
      "name": "assets/rear-wings/stepped.glb",
      "path": "assets/rear-wings/stepped.glb",
      "type": "glb",
      "bytes": 19288,
      "sha256": "0b586e85674513a2d18dd84ea417a5edbc170fd305a0614418fc791eddc28225"
    },
    {
      "name": "assets/rear-wings/swan.glb",
      "path": "assets/rear-wings/swan.glb",
      "type": "glb",
      "bytes": 19912,
      "sha256": "d69bd9356b87c1bf7fd428a34f7c9a4e3992dc66bcc4a9a0d8a806450c8727bf"
    },
    {
      "name": "assets/rear-wings/vortex.glb",
      "path": "assets/rear-wings/vortex.glb",
      "type": "glb",
      "bytes": 24948,
      "sha256": "71cda871ba0224861e9231979022308d2a50918111ae6cf52e41ab1e1f6f64a3"
    },
    {
      "name": "assets/wheels/aero.glb",
      "path": "assets/wheels/aero.glb",
      "type": "glb",
      "bytes": 67524,
      "sha256": "4dca4aab6326ceb49ec40c7742618172bb6f9994e384b25f60f078b559bbbe53"
    },
    {
      "name": "assets/wheels/five.glb",
      "path": "assets/wheels/five.glb",
      "type": "glb",
      "bytes": 42204,
      "sha256": "5542fd9de2309d905da2c7b2ea46f5b457df7c8c85baa59ffaf475c59f2d2a5f"
    },
    {
      "name": "assets/wheels/mesh.glb",
      "path": "assets/wheels/mesh.glb",
      "type": "glb",
      "bytes": 66832,
      "sha256": "631bea035f58a8493c844f67392da672190001e821e4d4c018a858e4b8c03d75"
    },
    {
      "name": "assets/wheels/rally.glb",
      "path": "assets/wheels/rally.glb",
      "type": "glb",
      "bytes": 74608,
      "sha256": "13e7c05a656d614f02e83dad378e7d39f1d5e151fb622d99a1316a104eb4d468"
    },
    {
      "name": "assets/wheels/split.glb",
      "path": "assets/wheels/split.glb",
      "type": "glb",
      "bytes": 53872,
      "sha256": "c423cc279a9711dea6a23245427e084e48ac005a230db9769a3824f2f1d6eb17"
    },
    {
      "name": "assets/wheels/turbine.glb",
      "path": "assets/wheels/turbine.glb",
      "type": "glb",
      "bytes": 48684,
      "sha256": "8578a67cd902d6b49a19b6b835f0272930127580367de07236d6b1ce32b5935d"
    },
    {
      "name": "icons/categories/decals.svg",
      "path": "icons/categories/decals.svg",
      "type": "text",
      "bytes": 289,
      "sha256": "b5529e8317d3a74f5b76dac89c3bd13a68634d78b0a41a55e2f5562ab910e7de"
    },
    {
      "name": "icons/categories/effects.svg",
      "path": "icons/categories/effects.svg",
      "type": "text",
      "bytes": 379,
      "sha256": "99d4d32af3a3f29df7fcb80e73e12041211bd6612d127dde3d96556f015d835c"
    },
    {
      "name": "icons/categories/front-wings.svg",
      "path": "icons/categories/front-wings.svg",
      "type": "text",
      "bytes": 350,
      "sha256": "ce24c1838ee2e69e15a686006efb0a14fdbefce475c038bd5241a5f2924124d1"
    },
    {
      "name": "icons/categories/helmets.svg",
      "path": "icons/categories/helmets.svg",
      "type": "text",
      "bytes": 392,
      "sha256": "dd3f3ecfdbd9f0676b4ba3c83beb217cb854f1ddaa7192e0abaecdc8c89cfa34"
    },
    {
      "name": "icons/categories/paints.svg",
      "path": "icons/categories/paints.svg",
      "type": "text",
      "bytes": 309,
      "sha256": "1a586a69d762f72234e16235ce56cdda74d2ec5adef574ce1498f9149dfe81b5"
    },
    {
      "name": "icons/categories/rear-wings.svg",
      "path": "icons/categories/rear-wings.svg",
      "type": "text",
      "bytes": 328,
      "sha256": "4e3f303fc38a3d1d9f78aa46e9288249b8322ca4c654c00a05d41c96d53f0638"
    },
    {
      "name": "icons/categories/wheels.svg",
      "path": "icons/categories/wheels.svg",
      "type": "text",
      "bytes": 785,
      "sha256": "0a9bf9b1ad0a182462dfc717add31361ad24c1143711c853063fe611f828368c"
    },
    {
      "name": "icons/decals/decal-flames-classic.svg",
      "path": "icons/decals/decal-flames-classic.svg",
      "type": "text",
      "bytes": 350,
      "sha256": "c058896ee992189d440d2543aed6d4678d70778727abe20a9fbf7144eee4b623"
    },
    {
      "name": "icons/decals/decal-flames-curl.svg",
      "path": "icons/decals/decal-flames-curl.svg",
      "type": "text",
      "bytes": 367,
      "sha256": "0d6b9b85c1ea527db8dbd3f907646cf4b99156810b3f7e630f38ba3dd356f191"
    },
    {
      "name": "icons/decals/decal-flames-sharp.svg",
      "path": "icons/decals/decal-flames-sharp.svg",
      "type": "text",
      "bytes": 329,
      "sha256": "8f5a07b785776e5f814b7dabd2c3cee6aa3678df5e7aaf0750d1b100817ac904"
    },
    {
      "name": "icons/decals/decal-flames-twin.svg",
      "path": "icons/decals/decal-flames-twin.svg",
      "type": "text",
      "bytes": 373,
      "sha256": "8a91efe6cb8f1751411d9d2264eaab3d8c0798265f9ba95dfd0d14ca09e41ce8"
    },
    {
      "name": "icons/decals/decal-stars-burst.svg",
      "path": "icons/decals/decal-stars-burst.svg",
      "type": "text",
      "bytes": 456,
      "sha256": "febffe78f53dadeeedf75b452c2ac676e17bfeed3ebef97002ed6c8828d90ca8"
    },
    {
      "name": "icons/decals/decal-stars-one.svg",
      "path": "icons/decals/decal-stars-one.svg",
      "type": "text",
      "bytes": 385,
      "sha256": "9834f767c69ea0c0c42fecfd22c0cd24e4f08718007246d801f465e438616ec1"
    },
    {
      "name": "icons/decals/decal-stars-orbit.svg",
      "path": "icons/decals/decal-stars-orbit.svg",
      "type": "text",
      "bytes": 482,
      "sha256": "eb68c8c9beeba67aeacbd48ad5b074c36a430ae45a3e13ac483245e37d716eb2"
    },
    {
      "name": "icons/decals/decal-stars-trio.svg",
      "path": "icons/decals/decal-stars-trio.svg",
      "type": "text",
      "bytes": 662,
      "sha256": "a56ff4a148fe441e6df2c716628a7a3fe4e9017d10bf892273f0ecb41dfcb09f"
    },
    {
      "name": "icons/decals/decal-stripes-chevron.svg",
      "path": "icons/decals/decal-stripes-chevron.svg",
      "type": "text",
      "bytes": 326,
      "sha256": "d74ab6417a59175b38eef82c9cddb07ff6b97f629085f7433ddde2d07526dca0"
    },
    {
      "name": "icons/decals/decal-stripes-offset.svg",
      "path": "icons/decals/decal-stripes-offset.svg",
      "type": "text",
      "bytes": 320,
      "sha256": "62e68cf067a145ffce980320ecba87aa922c09925175860b0587ea9853894417"
    },
    {
      "name": "icons/decals/decal-stripes-speed.svg",
      "path": "icons/decals/decal-stripes-speed.svg",
      "type": "text",
      "bytes": 316,
      "sha256": "d9cf7ba6db3d1041b8952a7eb4786d07b329d36ef169c5e100dfa344858d3254"
    },
    {
      "name": "icons/decals/decal-stripes-twin.svg",
      "path": "icons/decals/decal-stripes-twin.svg",
      "type": "text",
      "bytes": 289,
      "sha256": "b5529e8317d3a74f5b76dac89c3bd13a68634d78b0a41a55e2f5562ab910e7de"
    },
    {
      "name": "icons/effects/effect-amber.svg",
      "path": "icons/effects/effect-amber.svg",
      "type": "text",
      "bytes": 379,
      "sha256": "99d4d32af3a3f29df7fcb80e73e12041211bd6612d127dde3d96556f015d835c"
    },
    {
      "name": "icons/effects/effect-electric.svg",
      "path": "icons/effects/effect-electric.svg",
      "type": "text",
      "bytes": 279,
      "sha256": "4d8951d1899935684b9899ec742ed8a92d45f8814a7ee9d6a52100e8831ba352"
    },
    {
      "name": "icons/effects/effect-gold.svg",
      "path": "icons/effects/effect-gold.svg",
      "type": "text",
      "bytes": 279,
      "sha256": "c1388edf3ddd737e013833a10faa43d29c4e4c1f1d45966e862a0d18db28a231"
    },
    {
      "name": "icons/effects/effect-ion.svg",
      "path": "icons/effects/effect-ion.svg",
      "type": "text",
      "bytes": 379,
      "sha256": "68d7bd77ee654934db046f160e2b81ee82dad559413f908651fa3f6b00731f2f"
    },
    {
      "name": "icons/effects/effect-teal.svg",
      "path": "icons/effects/effect-teal.svg",
      "type": "text",
      "bytes": 430,
      "sha256": "14d94da92219e62969e932db73af664b9318db5eb3d9db7e0bad42540602744f"
    },
    {
      "name": "icons/effects/effect-violet.svg",
      "path": "icons/effects/effect-violet.svg",
      "type": "text",
      "bytes": 430,
      "sha256": "0e86e2b172583ef809acabe7b1cf07b699ee015ae445140762818bdac269e93c"
    },
    {
      "name": "icons/front-wings/front-arrow.svg",
      "path": "icons/front-wings/front-arrow.svg",
      "type": "text",
      "bytes": 350,
      "sha256": "21c5e5fe14debdb0f07b6154fe9b27978d8d1425c33de71dd706e20eab7aa468"
    },
    {
      "name": "icons/front-wings/front-blade.svg",
      "path": "icons/front-wings/front-blade.svg",
      "type": "text",
      "bytes": 350,
      "sha256": "fbff9f89651679656ca58cf3426d8e8093a6f633c91b8432431b1f2022b8a23c"
    },
    {
      "name": "icons/front-wings/front-cascade.svg",
      "path": "icons/front-wings/front-cascade.svg",
      "type": "text",
      "bytes": 392,
      "sha256": "3e6fd344bbbad7eab575b8e958647bebc7b7d99adc708e8f06fc06c5e76c7488"
    },
    {
      "name": "icons/front-wings/front-delta.svg",
      "path": "icons/front-wings/front-delta.svg",
      "type": "text",
      "bytes": 350,
      "sha256": "fbff9f89651679656ca58cf3426d8e8093a6f633c91b8432431b1f2022b8a23c"
    },
    {
      "name": "icons/front-wings/front-manta.svg",
      "path": "icons/front-wings/front-manta.svg",
      "type": "text",
      "bytes": 435,
      "sha256": "8372b75f37bbd4eece5bde259a871998ecf0a995893a8f92549a0480a09bce7a"
    },
    {
      "name": "icons/front-wings/front-split.svg",
      "path": "icons/front-wings/front-split.svg",
      "type": "text",
      "bytes": 435,
      "sha256": "0a8ce2e73207f83c1ba3d1c4de07441ab97e9059922482ec4deedadbe0089a53"
    },
    {
      "name": "icons/front-wings/front-sweep.svg",
      "path": "icons/front-wings/front-sweep.svg",
      "type": "text",
      "bytes": 350,
      "sha256": "ce24c1838ee2e69e15a686006efb0a14fdbefce475c038bd5241a5f2924124d1"
    },
    {
      "name": "icons/front-wings/front-wave.svg",
      "path": "icons/front-wings/front-wave.svg",
      "type": "text",
      "bytes": 477,
      "sha256": "e041e418fc59261612662f8d9c78180b1fb2f8000564b8272c6bfe5ac6a4b886"
    },
    {
      "name": "icons/helmets/helmet-aero.svg",
      "path": "icons/helmets/helmet-aero.svg",
      "type": "text",
      "bytes": 440,
      "sha256": "88b3be7a52190f9abec03b34bc69ce873dd2b2d02ce1a52d8be46a365a276705"
    },
    {
      "name": "icons/helmets/helmet-classic.svg",
      "path": "icons/helmets/helmet-classic.svg",
      "type": "text",
      "bytes": 392,
      "sha256": "dd3f3ecfdbd9f0676b4ba3c83beb217cb854f1ddaa7192e0abaecdc8c89cfa34"
    },
    {
      "name": "icons/helmets/helmet-comet.svg",
      "path": "icons/helmets/helmet-comet.svg",
      "type": "text",
      "bytes": 434,
      "sha256": "0648f6ba9b2065da44bf1f6f89af9e212111937a00a6fda75bb0b2f16bab5f43"
    },
    {
      "name": "icons/helmets/helmet-halo.svg",
      "path": "icons/helmets/helmet-halo.svg",
      "type": "text",
      "bytes": 467,
      "sha256": "f28ca9e994fe6da5ec70723b035127e11a400a6d56342abd1aaa4e93e8b27c5a"
    },
    {
      "name": "icons/helmets/helmet-prism.svg",
      "path": "icons/helmets/helmet-prism.svg",
      "type": "text",
      "bytes": 443,
      "sha256": "f88327084735bda63d850b560b19fcd3b9c4227f519f5c91c266d7890ef0fcfe"
    },
    {
      "name": "icons/helmets/helmet-ridge.svg",
      "path": "icons/helmets/helmet-ridge.svg",
      "type": "text",
      "bytes": 434,
      "sha256": "0648f6ba9b2065da44bf1f6f89af9e212111937a00a6fda75bb0b2f16bab5f43"
    },
    {
      "name": "icons/helmets/helmet-tail.svg",
      "path": "icons/helmets/helmet-tail.svg",
      "type": "text",
      "bytes": 483,
      "sha256": "09f755e428c9706a1dcc4be1aecaa8a2e3eff2993fe70959e4423c8c96cce75b"
    },
    {
      "name": "icons/helmets/helmet-vent.svg",
      "path": "icons/helmets/helmet-vent.svg",
      "type": "text",
      "bytes": 449,
      "sha256": "eb58171bdfd20795852af99d1720101dc3d1698e78f6b954634ef49a202934e3"
    },
    {
      "name": "icons/paints/paint-cherry.svg",
      "path": "icons/paints/paint-cherry.svg",
      "type": "text",
      "bytes": 309,
      "sha256": "0ce435b5690a418de9d789cbbbce79d99dfaaec79ee5adbf7f2176322a4519b5"
    },
    {
      "name": "icons/paints/paint-cobalt.svg",
      "path": "icons/paints/paint-cobalt.svg",
      "type": "text",
      "bytes": 309,
      "sha256": "53276242bc1b260bc2e69bfe8394331ba422f9a4664f477f61a0c7b8faede197"
    },
    {
      "name": "icons/paints/paint-ember.svg",
      "path": "icons/paints/paint-ember.svg",
      "type": "text",
      "bytes": 309,
      "sha256": "e2c6d1d13b5488693ffde9410b0b091d4eab1bf718821c09e23dffe768d40001"
    },
    {
      "name": "icons/paints/paint-forest.svg",
      "path": "icons/paints/paint-forest.svg",
      "type": "text",
      "bytes": 309,
      "sha256": "5fc6de545c3ca1373050b81998ae301dd54b1494e9663804f389eacf17162a6c"
    },
    {
      "name": "icons/paints/paint-graphite.svg",
      "path": "icons/paints/paint-graphite.svg",
      "type": "text",
      "bytes": 309,
      "sha256": "5bc085d53a2f11b0b9ecd0450c256874255f07cc1a8ad40a5bace1a3cfb15be1"
    },
    {
      "name": "icons/paints/paint-ice.svg",
      "path": "icons/paints/paint-ice.svg",
      "type": "text",
      "bytes": 309,
      "sha256": "7f3556d3c9434a2ad73719a69eb6bfca6ffa8df513a27aecdb263da4f5705657"
    },
    {
      "name": "icons/paints/paint-lagoon.svg",
      "path": "icons/paints/paint-lagoon.svg",
      "type": "text",
      "bytes": 309,
      "sha256": "1a586a69d762f72234e16235ce56cdda74d2ec5adef574ce1498f9149dfe81b5"
    },
    {
      "name": "icons/paints/paint-orchid.svg",
      "path": "icons/paints/paint-orchid.svg",
      "type": "text",
      "bytes": 309,
      "sha256": "2e0892f8e704cfe4c3d08cf473e83dbe0b80f18a67a8b3eeb111853b7265616e"
    },
    {
      "name": "icons/paints/paint-pearl.svg",
      "path": "icons/paints/paint-pearl.svg",
      "type": "text",
      "bytes": 309,
      "sha256": "9cb01b9497e5b7aad9de01b9613f2f54b49375300f54d106877b07a5a9e92dfb"
    },
    {
      "name": "icons/paints/paint-sun.svg",
      "path": "icons/paints/paint-sun.svg",
      "type": "text",
      "bytes": 309,
      "sha256": "4aaed0c06677afd4f75df64c5aea903d6acbaef181264e5ba57f946874a4d857"
    },
    {
      "name": "icons/rear-wings/rear-arc.svg",
      "path": "icons/rear-wings/rear-arc.svg",
      "type": "text",
      "bytes": 328,
      "sha256": "4e3f303fc38a3d1d9f78aa46e9288249b8322ca4c654c00a05d41c96d53f0638"
    },
    {
      "name": "icons/rear-wings/rear-box.svg",
      "path": "icons/rear-wings/rear-box.svg",
      "type": "text",
      "bytes": 370,
      "sha256": "a4856a1314c499f6bb3b1f159fb149dd008138c6a04e16cf724112dcb4a0827c"
    },
    {
      "name": "icons/rear-wings/rear-highline.svg",
      "path": "icons/rear-wings/rear-highline.svg",
      "type": "text",
      "bytes": 370,
      "sha256": "41130bae2720b382a527147c85fe24ecc2b9e35bf864f1aa6c990674d3aa5ade"
    },
    {
      "name": "icons/rear-wings/rear-lowdrag.svg",
      "path": "icons/rear-wings/rear-lowdrag.svg",
      "type": "text",
      "bytes": 371,
      "sha256": "fdb5c2181c362a9a8dc2ba5d8f0f7ee796bd4cc052c11d625a650e0df8454f7f"
    },
    {
      "name": "icons/rear-wings/rear-split.svg",
      "path": "icons/rear-wings/rear-split.svg",
      "type": "text",
      "bytes": 328,
      "sha256": "d4ba276cb570e1b6d963e233d327b26734436a9382bf450d542a0ac30ace60e6"
    },
    {
      "name": "icons/rear-wings/rear-stepped.svg",
      "path": "icons/rear-wings/rear-stepped.svg",
      "type": "text",
      "bytes": 328,
      "sha256": "d4ba276cb570e1b6d963e233d327b26734436a9382bf450d542a0ac30ace60e6"
    },
    {
      "name": "icons/rear-wings/rear-swan.svg",
      "path": "icons/rear-wings/rear-swan.svg",
      "type": "text",
      "bytes": 328,
      "sha256": "edca45c9b97adf249d753def694c65ef12e047e4e7c521d95ea99d8cfaad948c"
    },
    {
      "name": "icons/rear-wings/rear-vortex.svg",
      "path": "icons/rear-wings/rear-vortex.svg",
      "type": "text",
      "bytes": 370,
      "sha256": "fe9370c85345e3eee834ec4501c71ffea73921abef9de80626fb226daf59d94c"
    },
    {
      "name": "icons/wheels/wheel-aero.svg",
      "path": "icons/wheels/wheel-aero.svg",
      "type": "text",
      "bytes": 487,
      "sha256": "77e8738571f2735186245ed08c19b7b7360766431f182818175fd09bcf83f8a2"
    },
    {
      "name": "icons/wheels/wheel-five.svg",
      "path": "icons/wheels/wheel-five.svg",
      "type": "text",
      "bytes": 785,
      "sha256": "0a9bf9b1ad0a182462dfc717add31361ad24c1143711c853063fe611f828368c"
    },
    {
      "name": "icons/wheels/wheel-mesh.svg",
      "path": "icons/wheels/wheel-mesh.svg",
      "type": "text",
      "bytes": 1336,
      "sha256": "05712b8c47d9f8a36a551fceca73e17127eb0a805c060850d1145e9e304cb7d9"
    },
    {
      "name": "icons/wheels/wheel-rally.svg",
      "path": "icons/wheels/wheel-rally.svg",
      "type": "text",
      "bytes": 960,
      "sha256": "c447e2fce159e99b08e457a6d87b3c563aed2a3451dcc05ae65bf0c2b4fcaccb"
    },
    {
      "name": "icons/wheels/wheel-split.svg",
      "path": "icons/wheels/wheel-split.svg",
      "type": "text",
      "bytes": 1021,
      "sha256": "5e0fd1a0753d6420eb1a3f40e42c557d184116cddbb5f1b715ed2842e557467b"
    },
    {
      "name": "icons/wheels/wheel-turbine.svg",
      "path": "icons/wheels/wheel-turbine.svg",
      "type": "text",
      "bytes": 1179,
      "sha256": "924c057e00dea51195820359bfa31498366415f69dc7ce6cc1d517d347dcb8e2"
    },
    {
      "name": "manifest.json",
      "path": "manifest.json",
      "type": "json",
      "bytes": 40776,
      "sha256": "b969b76b42fd3a09f3542683514a9fce73d24e9830e83671e690baaf179e298e"
    },
    {
      "name": "runtime/customize.mjs",
      "path": "runtime/customize.mjs",
      "type": "text",
      "bytes": 7900,
      "sha256": "12995c612733cfd4e3f549bb5fb2141c466fdf6864281dfecf80438bcfd7acbc"
    },
    {
      "name": "runtime/decal.mjs",
      "path": "runtime/decal.mjs",
      "type": "text",
      "bytes": 8753,
      "sha256": "e3f99c0649d47a93c3e7686dcf296e4f6815b6b44bb277c92e0462685c3e59ed"
    },
    {
      "name": "runtime/effects.mjs",
      "path": "runtime/effects.mjs",
      "type": "text",
      "bytes": 5079,
      "sha256": "d3d3a68a5f8826c1d558a5baec5bb60b112bbf6dcc337f5306cc58c61e72b5d0"
    },
    {
      "name": "runtime/glb.mjs",
      "path": "runtime/glb.mjs",
      "type": "text",
      "bytes": 3965,
      "sha256": "1381c3bc6b96cede8be180bb90911782a4a87f9f8972b61ea40b950bb1f5e7df"
    }
  ]
});

export function create(options = {}) {
  return createAdapter(metadata, {
    baseURL: new URL('../../../assets/racing-customize-v1/', import.meta.url),
    ...options,
  });
}

const adapter = create();
export const { load, ready, get, dispose } = adapter;
export default adapter;
