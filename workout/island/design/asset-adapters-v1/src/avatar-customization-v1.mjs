// Generated from the audited catalog.json. No asset I/O happens during import.
import { createAdapter } from './runtime.mjs';

export const metadata = Object.freeze({
  "id": "avatar-customization-v1",
  "game": "core",
  "flag": "?assetAvatarCustomizationV1=1",
  "available": true,
  "source": {
    "branch": "codex/avatar-customization-v1",
    "commit": "4932a0fe823462ecef615cc068d1bd21cb11f75f",
    "root": "workout/island/design/avatar-customization-v1"
  },
  "license": {
    "spdx": "CC0-1.0",
    "note": "LICENSES.md dedicates 46 original items/thumbnails/runtime CC0; compatible body copies derive from existing CC0 athlete-body-v22; preview-only reference bodies and Three.js are excluded.",
    "files": [
      "LICENSES.md"
    ]
  },
  "bytes": 719486,
  "runtimeBytes": 716635,
  "dependencies": [
    "Existing host assets/athlete-body-v22 body with canonical18 bones, _region/color/skin attributes, zero sport morphs and preserved body width/depth metadata.",
    "Host local Three.js/GLTFLoader plus a unique SkeletonUtils clone; runtime/customization.mjs accepts host instances and parsed item sources."
  ],
  "missing": [
    "Preview reference bodies/atlas are intentionally excluded; use the existing compatible athlete-body-v22 body when connecting."
  ],
  "assets": [
    {
      "name": "assets/accessories/backpack.glb",
      "path": "assets/accessories/backpack.glb",
      "type": "glb",
      "bytes": 10016,
      "sha256": "57af656c62f11b24ee9c3f195d41801a10e81fdd9e953e6948c11bf2c67686d8"
    },
    {
      "name": "assets/accessories/bracelet.glb",
      "path": "assets/accessories/bracelet.glb",
      "type": "glb",
      "bytes": 5500,
      "sha256": "ffc2d044adf5c5db80911d082fc88bcdc90ea53cd3c9b4005db39485005795de"
    },
    {
      "name": "assets/accessories/bucket-hat.glb",
      "path": "assets/accessories/bucket-hat.glb",
      "type": "glb",
      "bytes": 8652,
      "sha256": "557807c14fecfe766764a8dac1e169096394bbfdf9ce3520ea0bc6fdb2c6544c"
    },
    {
      "name": "assets/accessories/glasses.glb",
      "path": "assets/accessories/glasses.glb",
      "type": "glb",
      "bytes": 12924,
      "sha256": "0bd221d0ce19d1b5b6c159e6ab79c00bf0d575ef602c6fa8a8b1eb3e697b09d8"
    },
    {
      "name": "assets/accessories/gloves.glb",
      "path": "assets/accessories/gloves.glb",
      "type": "glb",
      "bytes": 12340,
      "sha256": "d42fcef588eabb8d595a899fc5250310861969a36668384ecc2f229dd6a5f7bc"
    },
    {
      "name": "assets/accessories/hair-ties.glb",
      "path": "assets/accessories/hair-ties.glb",
      "type": "glb",
      "bytes": 7516,
      "sha256": "5dfdc3876c01a27f1e53b98a65e22b9ca08e01cfb06497c15df278d944be61a4"
    },
    {
      "name": "assets/accessories/scarf.glb",
      "path": "assets/accessories/scarf.glb",
      "type": "glb",
      "bytes": 6348,
      "sha256": "af40bc8f531e115fdeed38b02551058db9a4e7c67e0e51f9cb6212ba5910d99b"
    },
    {
      "name": "assets/accessories/watch.glb",
      "path": "assets/accessories/watch.glb",
      "type": "glb",
      "bytes": 7912,
      "sha256": "5181f4b15f141d6563feb40fd017dc4e99bc327293d6b5c675500c8e9c5840a2"
    },
    {
      "name": "assets/faces/face-almond.glb",
      "path": "assets/faces/face-almond.glb",
      "type": "glb",
      "bytes": 17720,
      "sha256": "35f5895b4f0a935a77e9377eae502f239b8b99f3a3a548ad189d5d12fbc1325c"
    },
    {
      "name": "assets/faces/face-bold.glb",
      "path": "assets/faces/face-bold.glb",
      "type": "glb",
      "bytes": 17716,
      "sha256": "cec4cf578d641135b3d709e355c236c0460c54560af4c20eaad114b1ac5abfe5"
    },
    {
      "name": "assets/faces/face-bright.glb",
      "path": "assets/faces/face-bright.glb",
      "type": "glb",
      "bytes": 18792,
      "sha256": "382623fd6b7e774cd0796250c6f1c475a42797aa1facb97a3f7c7c14a39f1f3f"
    },
    {
      "name": "assets/faces/face-calm.glb",
      "path": "assets/faces/face-calm.glb",
      "type": "glb",
      "bytes": 17716,
      "sha256": "0f6303dd9a07ac9f7588fb658f092ba7a465f91b003500af2ec1b3a4ad76eb41"
    },
    {
      "name": "assets/faces/face-cheerful.glb",
      "path": "assets/faces/face-cheerful.glb",
      "type": "glb",
      "bytes": 18796,
      "sha256": "0c9057dd14d9b215fd57950e5ede3e0abd1857db57b3974fd494c203cd562639"
    },
    {
      "name": "assets/faces/face-curious.glb",
      "path": "assets/faces/face-curious.glb",
      "type": "glb",
      "bytes": 17720,
      "sha256": "554ffb9f93e76bf7d3d913d1bf5005dadd0720992d74b2357261875152212a17"
    },
    {
      "name": "assets/faces/face-gentle.glb",
      "path": "assets/faces/face-gentle.glb",
      "type": "glb",
      "bytes": 17720,
      "sha256": "c04ef2b3148985b3348c7814937f79ff3d463fa76042470cf978a3c9e263d9a5"
    },
    {
      "name": "assets/faces/face-round.glb",
      "path": "assets/faces/face-round.glb",
      "type": "glb",
      "bytes": 17716,
      "sha256": "85d651c80e1ad18241e19a79c694a2e181c8836e6eed28837460fe98e74f0699"
    },
    {
      "name": "assets/hair/afro.glb",
      "path": "assets/hair/afro.glb",
      "type": "glb",
      "bytes": 7596,
      "sha256": "fdf6b1c9ece621d5d48111af2785b91bf5d72bfc56dc472e69059e1a4060711f"
    },
    {
      "name": "assets/hair/bald.glb",
      "path": "assets/hair/bald.glb",
      "type": "glb",
      "bytes": 196,
      "sha256": "57c99915bfaabe23726d7f4335a728fe7bb5dd06fb9076d9ba56322c8a51016d"
    },
    {
      "name": "assets/hair/bob.glb",
      "path": "assets/hair/bob.glb",
      "type": "glb",
      "bytes": 9516,
      "sha256": "b4bb53f0ff4f3d4dd2e5ca9d75ca95d99f664078f853387663846872267d556b"
    },
    {
      "name": "assets/hair/braid.glb",
      "path": "assets/hair/braid.glb",
      "type": "glb",
      "bytes": 12608,
      "sha256": "b2b423f4e631b899dbdc364fa1868e9f517bdf28fc11a1758f7cb201cdf7b29e"
    },
    {
      "name": "assets/hair/bun.glb",
      "path": "assets/hair/bun.glb",
      "type": "glb",
      "bytes": 10056,
      "sha256": "72160cf21db1922251453e446f3292d141022cb669294a593c3d14ccd3600bc6"
    },
    {
      "name": "assets/hair/crop.glb",
      "path": "assets/hair/crop.glb",
      "type": "glb",
      "bytes": 7592,
      "sha256": "2628f36818f1a9222c3eda69fed0110012482694e2005cdf675e430c672fdbed"
    },
    {
      "name": "assets/hair/curly.glb",
      "path": "assets/hair/curly.glb",
      "type": "glb",
      "bytes": 14892,
      "sha256": "681eee0557c8b647321f25a3cafacefcba2f233a098bb13d1fbf27c0f8a0bd8e"
    },
    {
      "name": "assets/hair/long.glb",
      "path": "assets/hair/long.glb",
      "type": "glb",
      "bytes": 9516,
      "sha256": "acd25e16ba185a1ce08a50c1c210b7e99149c7a50291802a7f395522e4a60dcd"
    },
    {
      "name": "assets/hair/ponytail.glb",
      "path": "assets/hair/ponytail.glb",
      "type": "glb",
      "bytes": 10220,
      "sha256": "5986b99f5e1287193d0eecc7a854a30435ed1e7ad8e817612ceb6a672bd0590b"
    },
    {
      "name": "assets/hair/quiff.glb",
      "path": "assets/hair/quiff.glb",
      "type": "glb",
      "bytes": 8944,
      "sha256": "e4f1dc6028ec8cdddb73a94b9532623a9f8cacf1d2322305a8f9a714d68dbc75"
    },
    {
      "name": "assets/hair/side-part.glb",
      "path": "assets/hair/side-part.glb",
      "type": "glb",
      "bytes": 8952,
      "sha256": "2c47b420d9afd8f40251fea4a1cbb113ce327549718ed4c10ff76765ca11bdbf"
    },
    {
      "name": "assets/hair/sport-cap.glb",
      "path": "assets/hair/sport-cap.glb",
      "type": "glb",
      "bytes": 8140,
      "sha256": "b0a93887c5431ea8838c28f6ca337d8b097e81e66de9ed7ee4f03c7730b5b7e1"
    },
    {
      "name": "assets/outfits/denim.glb",
      "path": "assets/outfits/denim.glb",
      "type": "glb",
      "bytes": 14504,
      "sha256": "bb86ad45e76c296968a346b49f24efe52cc5cd7f9f1a54898ca6ad8da35f3ec3"
    },
    {
      "name": "assets/outfits/holiday.glb",
      "path": "assets/outfits/holiday.glb",
      "type": "glb",
      "bytes": 16528,
      "sha256": "3e7e17edf6357d50f6a5d8d38ba1641c97919ce4ddbb0af673e16e53876d6eae"
    },
    {
      "name": "assets/outfits/hoodie.glb",
      "path": "assets/outfits/hoodie.glb",
      "type": "glb",
      "bytes": 15584,
      "sha256": "fd27ca2b27b21d6b5f3f46684007521da8488ed24cb67124d72a36baad650fb6"
    },
    {
      "name": "assets/outfits/polo.glb",
      "path": "assets/outfits/polo.glb",
      "type": "glb",
      "bytes": 13548,
      "sha256": "68ede47e10e38e5ae9eb84e4d9bdd1bad4dabcee351fa80de0689f29d81594a5"
    },
    {
      "name": "assets/outfits/sport.glb",
      "path": "assets/outfits/sport.glb",
      "type": "glb",
      "bytes": 13284,
      "sha256": "0befd384a26c93f4c07ce3508a80f8daac2105e3d652355560859daf94de9393"
    },
    {
      "name": "assets/outfits/summer.glb",
      "path": "assets/outfits/summer.glb",
      "type": "glb",
      "bytes": 11040,
      "sha256": "2b6f8c8707e591e886f814194614fa1cb458b7377c7f3de2db1c38bd3f284c59"
    },
    {
      "name": "assets/outfits/swim.glb",
      "path": "assets/outfits/swim.glb",
      "type": "glb",
      "bytes": 8088,
      "sha256": "03732081ab412c9c7edcf23f8dd769282ac47aeb83019b2ca5b2e969bd0504c6"
    },
    {
      "name": "assets/outfits/tracksuit.glb",
      "path": "assets/outfits/tracksuit.glb",
      "type": "glb",
      "bytes": 15728,
      "sha256": "0c662d4583114ae82e06ecefd243a1635a42e38e6642e634017f5e2a2649b146"
    },
    {
      "name": "assets/outfits/tunic.glb",
      "path": "assets/outfits/tunic.glb",
      "type": "glb",
      "bytes": 15988,
      "sha256": "1fa50915b487d1076215fe760fe7c557b4facb9e05c63490ff68ba035b0db3e0"
    },
    {
      "name": "assets/outfits/winter.glb",
      "path": "assets/outfits/winter.glb",
      "type": "glb",
      "bytes": 17916,
      "sha256": "725315a31529313795aee0c6e5d1240a6ea1354d5f53ac34f2db3ae596cf46bd"
    },
    {
      "name": "assets/shoes/boots.glb",
      "path": "assets/shoes/boots.glb",
      "type": "glb",
      "bytes": 12296,
      "sha256": "da7c08e2ef16635cc7000b6d1b3cf62401530af7b51bee45f73101933848f9b8"
    },
    {
      "name": "assets/shoes/cleats.glb",
      "path": "assets/shoes/cleats.glb",
      "type": "glb",
      "bytes": 15756,
      "sha256": "0a521f211fa028eab23198fc10667f93935c191e26f88a5a9fd1e007e72d9563"
    },
    {
      "name": "assets/shoes/high-tops.glb",
      "path": "assets/shoes/high-tops.glb",
      "type": "glb",
      "bytes": 12320,
      "sha256": "300887db51ddaf4cb185d829fd02410e0af1b42e784d213d504a7e5dd6e27636"
    },
    {
      "name": "assets/shoes/loafers.glb",
      "path": "assets/shoes/loafers.glb",
      "type": "glb",
      "bytes": 12316,
      "sha256": "e97f789504d9f64e328ada2737bb86702b0bf15c76902042210e9b10d71063b5"
    },
    {
      "name": "assets/shoes/runners.glb",
      "path": "assets/shoes/runners.glb",
      "type": "glb",
      "bytes": 12316,
      "sha256": "8c384265fc90aad6ec785b1e557a70e676dd7322998afbab01ff6349075e1ee4"
    },
    {
      "name": "assets/shoes/sandals.glb",
      "path": "assets/shoes/sandals.glb",
      "type": "glb",
      "bytes": 16452,
      "sha256": "4477b9a852efdb092b6bf517500098298f28c63ed59560e2a84c3def38c7c97b"
    },
    {
      "name": "assets/shoes/snow-boots.glb",
      "path": "assets/shoes/snow-boots.glb",
      "type": "glb",
      "bytes": 14560,
      "sha256": "785c963852e0ddda6319ef9134714e9525cb327064c8b5f547fe7ee864171e29"
    },
    {
      "name": "assets/shoes/water-shoes.glb",
      "path": "assets/shoes/water-shoes.glb",
      "type": "glb",
      "bytes": 12324,
      "sha256": "ce73a826b1a019aa421516afcd4a3bf3d5745f4ba8e53f6a17bd705930820a15"
    },
    {
      "name": "manifest.json",
      "path": "manifest.json",
      "type": "json",
      "bytes": 41793,
      "sha256": "9356681f33850126ca9a1a1619f8ceec43db9c55fcc58752232096c9f6f2b5ef"
    },
    {
      "name": "runtime/customization.mjs",
      "path": "runtime/customization.mjs",
      "type": "text",
      "bytes": 8374,
      "sha256": "fb7cc5a57d0feed8bdcf382bfae2448052d62dc56e89484928996b53683c813a"
    },
    {
      "name": "thumbs/afro.webp",
      "path": "thumbs/afro.webp",
      "type": "binary",
      "bytes": 2084,
      "sha256": "85f0ebc0480dbe555c6981ed75fec4dfcb172afabfc2459ced13a34e0a5473fa"
    },
    {
      "name": "thumbs/backpack.webp",
      "path": "thumbs/backpack.webp",
      "type": "binary",
      "bytes": 2710,
      "sha256": "264dc46514a2e39540dfbe4d9eedb3e18c38c01bbc7c6c14aa69038c18892021"
    },
    {
      "name": "thumbs/bald.webp",
      "path": "thumbs/bald.webp",
      "type": "binary",
      "bytes": 1708,
      "sha256": "ee48c77c1406b626761a11691c17b2a58bcf774bc1f18c49c419e577af2f29f7"
    },
    {
      "name": "thumbs/bob.webp",
      "path": "thumbs/bob.webp",
      "type": "binary",
      "bytes": 2020,
      "sha256": "620716c58657efd695c413f8bb65be1ecdfaf3b96a48467fdf6d41e62d6de8e8"
    },
    {
      "name": "thumbs/boots.webp",
      "path": "thumbs/boots.webp",
      "type": "binary",
      "bytes": 1916,
      "sha256": "2c6dbf948096defe000f4c124fd987aa043ede885072b074c39028ab8fa59cb7"
    },
    {
      "name": "thumbs/bracelet.webp",
      "path": "thumbs/bracelet.webp",
      "type": "binary",
      "bytes": 2804,
      "sha256": "57749a63cc0d8ce8a8150ef357893cbdf3f4d35e317027243af1088044842d35"
    },
    {
      "name": "thumbs/braid.webp",
      "path": "thumbs/braid.webp",
      "type": "binary",
      "bytes": 2228,
      "sha256": "dc0a823c0c8e936602956a6dbaa336f589fb3e9bae26ab2d0f6fc49877f80e92"
    },
    {
      "name": "thumbs/bucket-hat.webp",
      "path": "thumbs/bucket-hat.webp",
      "type": "binary",
      "bytes": 2018,
      "sha256": "5940cc8542846860fe560342f44722c3b5382d131a0b2d4c67791df3227f287b"
    },
    {
      "name": "thumbs/bun.webp",
      "path": "thumbs/bun.webp",
      "type": "binary",
      "bytes": 2056,
      "sha256": "81fa2289581faabf9df132986ab9673dd78179ff9813b1b8adcc9989e4e93b88"
    },
    {
      "name": "thumbs/cleats.webp",
      "path": "thumbs/cleats.webp",
      "type": "binary",
      "bytes": 2106,
      "sha256": "ef8631287c56cc4b7a666e33a66f3f1a711df13b715d5334ab537d54ccb46a64"
    },
    {
      "name": "thumbs/crop.webp",
      "path": "thumbs/crop.webp",
      "type": "binary",
      "bytes": 1938,
      "sha256": "9c3d88a68bd8858c00a20015ecf567f8513b2ba163fbf0fb4fa0dd951a693013"
    },
    {
      "name": "thumbs/curly.webp",
      "path": "thumbs/curly.webp",
      "type": "binary",
      "bytes": 2058,
      "sha256": "2414b44af6884fd54c7210a01ef21e011ca82f3a6f53359359b206d78d586085"
    },
    {
      "name": "thumbs/denim.webp",
      "path": "thumbs/denim.webp",
      "type": "binary",
      "bytes": 1564,
      "sha256": "6b78d6b7ca3d0e52c4e567c00707aa9fa976970b15cdace7782bde76ae00c321"
    },
    {
      "name": "thumbs/face-almond.webp",
      "path": "thumbs/face-almond.webp",
      "type": "binary",
      "bytes": 1936,
      "sha256": "da6d5bcb932d1b50464b3f01719ff09af2e5f30f208e9a85c36799f72d94a1f9"
    },
    {
      "name": "thumbs/face-bold.webp",
      "path": "thumbs/face-bold.webp",
      "type": "binary",
      "bytes": 1958,
      "sha256": "af47167b43c03f797c0a02c0accf9fa58038b48538bee0301c639e46a0c683f9"
    },
    {
      "name": "thumbs/face-bright.webp",
      "path": "thumbs/face-bright.webp",
      "type": "binary",
      "bytes": 1980,
      "sha256": "614f67bf4033e4877f74cd20e01f1f752ead89c27f9b32abda6c68817eedc52a"
    },
    {
      "name": "thumbs/face-calm.webp",
      "path": "thumbs/face-calm.webp",
      "type": "binary",
      "bytes": 1918,
      "sha256": "bfd9d430f7c44c0dd3de9135aac9b7bcb744c0088b520a5711793ba34bcf0fa1"
    },
    {
      "name": "thumbs/face-cheerful.webp",
      "path": "thumbs/face-cheerful.webp",
      "type": "binary",
      "bytes": 1948,
      "sha256": "04428e32a8d504d433336dcab9e90e6ec0a46c83f7470855441081312eb6fcfd"
    },
    {
      "name": "thumbs/face-curious.webp",
      "path": "thumbs/face-curious.webp",
      "type": "binary",
      "bytes": 1988,
      "sha256": "37b5bd6122dd046085913f27394604af44c4dcc87981cbbf89dab7efdd528f11"
    },
    {
      "name": "thumbs/face-gentle.webp",
      "path": "thumbs/face-gentle.webp",
      "type": "binary",
      "bytes": 1956,
      "sha256": "efe2cc038bddd6bc2c7e6813a15fc19032538a26143a2b54691122d45c1a5e2d"
    },
    {
      "name": "thumbs/face-round.webp",
      "path": "thumbs/face-round.webp",
      "type": "binary",
      "bytes": 1966,
      "sha256": "012f0cac8d04d821f9f3565eeadcfb1c347e61fb88034d639bc86bd6cebff90a"
    },
    {
      "name": "thumbs/glasses.webp",
      "path": "thumbs/glasses.webp",
      "type": "binary",
      "bytes": 2076,
      "sha256": "b0c815f84bdb2263332bc56a412712868aba069bd459d95a8a914e087a2e2857"
    },
    {
      "name": "thumbs/gloves.webp",
      "path": "thumbs/gloves.webp",
      "type": "binary",
      "bytes": 2772,
      "sha256": "d729500dfbe955177e0c98da03bda7299ee91ae49e50180e2d483a2b78800dd2"
    },
    {
      "name": "thumbs/hair-ties.webp",
      "path": "thumbs/hair-ties.webp",
      "type": "binary",
      "bytes": 2114,
      "sha256": "ccbccb58ad1ed99f58b2241cea1aea18832ed0890be88da9dea4299c455c4f7d"
    },
    {
      "name": "thumbs/high-tops.webp",
      "path": "thumbs/high-tops.webp",
      "type": "binary",
      "bytes": 1968,
      "sha256": "a9874a1d818700e8fedfddd2bb1b2aa6949faf20a9d426e5cee6a29ddcd3cfff"
    },
    {
      "name": "thumbs/holiday.webp",
      "path": "thumbs/holiday.webp",
      "type": "binary",
      "bytes": 1538,
      "sha256": "dd7199d70529ff856a6522a816bc3b147ffc028b09270b78836014c6cccf724b"
    },
    {
      "name": "thumbs/hoodie.webp",
      "path": "thumbs/hoodie.webp",
      "type": "binary",
      "bytes": 1630,
      "sha256": "33c2a5edcefd717a5290684cc7dd663f2336833224e2e252dbc654caeee908c8"
    },
    {
      "name": "thumbs/loafers.webp",
      "path": "thumbs/loafers.webp",
      "type": "binary",
      "bytes": 2106,
      "sha256": "aafe954bde8dfdf33fa219d206e7a17ebdc99821fc012dabc28bd8a49d59ebb5"
    },
    {
      "name": "thumbs/long.webp",
      "path": "thumbs/long.webp",
      "type": "binary",
      "bytes": 2002,
      "sha256": "5a61aac80ef0a18cce201d4023d21c9319b1122fc7b5e7b7440a413f1b105401"
    },
    {
      "name": "thumbs/polo.webp",
      "path": "thumbs/polo.webp",
      "type": "binary",
      "bytes": 1536,
      "sha256": "971cc9fe57d25f62cf7109613c71b36d7c6427cabbb1a1456fee7b8bba7d31f7"
    },
    {
      "name": "thumbs/ponytail.webp",
      "path": "thumbs/ponytail.webp",
      "type": "binary",
      "bytes": 2170,
      "sha256": "68cb11be8456149a6b63c11b43ce9ee9c869c80babc4fe8464fb7033b6e3e7c3"
    },
    {
      "name": "thumbs/quiff.webp",
      "path": "thumbs/quiff.webp",
      "type": "binary",
      "bytes": 2068,
      "sha256": "e8e5afe899efacc9b447bfeeaf7ddf793908ec46482e356349c4880d5a7f4033"
    },
    {
      "name": "thumbs/runners.webp",
      "path": "thumbs/runners.webp",
      "type": "binary",
      "bytes": 2108,
      "sha256": "23e3bcc8ca02258112ddc528adf2f5aec053733930fdae22c7dcdc6a5768478a"
    },
    {
      "name": "thumbs/sandals.webp",
      "path": "thumbs/sandals.webp",
      "type": "binary",
      "bytes": 2492,
      "sha256": "9bab7f0842f4547731b1135a4d2c6cb3dbfa1d85f26634f539ea54e55de009af"
    },
    {
      "name": "thumbs/scarf.webp",
      "path": "thumbs/scarf.webp",
      "type": "binary",
      "bytes": 2450,
      "sha256": "767a453409cff285419c7cb11a6062cd828b265006a4bda76eec887bf9e52400"
    },
    {
      "name": "thumbs/side-part.webp",
      "path": "thumbs/side-part.webp",
      "type": "binary",
      "bytes": 2036,
      "sha256": "548eb6d15d904476c6399d08f8bb8b1dbbd57424f348a71050553c27c9d06183"
    },
    {
      "name": "thumbs/snow-boots.webp",
      "path": "thumbs/snow-boots.webp",
      "type": "binary",
      "bytes": 1974,
      "sha256": "b0c47de6493469ddac71c7757db62595ef17e24aa1ff55dda0b98698344b1bff"
    },
    {
      "name": "thumbs/sport-cap.webp",
      "path": "thumbs/sport-cap.webp",
      "type": "binary",
      "bytes": 2140,
      "sha256": "c2bfadabd5946dc6b68bfc066ffbcfbc06a652fd392d5a572ed68ff81442eacb"
    },
    {
      "name": "thumbs/sport.webp",
      "path": "thumbs/sport.webp",
      "type": "binary",
      "bytes": 1710,
      "sha256": "1a914c13ae7c77c8e627ad7c72bda898f600beccfd2441b02c557a9a7d41bfe6"
    },
    {
      "name": "thumbs/summer.webp",
      "path": "thumbs/summer.webp",
      "type": "binary",
      "bytes": 1530,
      "sha256": "286019588cfdc3cc2363a051b1c5863fc486f8c4bf00ee52c40bcdf9e6ed2574"
    },
    {
      "name": "thumbs/swim.webp",
      "path": "thumbs/swim.webp",
      "type": "binary",
      "bytes": 1670,
      "sha256": "65d7db9bfe7cbadf8172180cd821b8fb40ca61feddb9b53a211791ea74236324"
    },
    {
      "name": "thumbs/tracksuit.webp",
      "path": "thumbs/tracksuit.webp",
      "type": "binary",
      "bytes": 1656,
      "sha256": "afbcb3b4b5258d39bd6687571188c87274b20c1ccc77f9c0b0646bcad04eb3b4"
    },
    {
      "name": "thumbs/tunic.webp",
      "path": "thumbs/tunic.webp",
      "type": "binary",
      "bytes": 1492,
      "sha256": "54e9b57fb66ca960d54c8d9245a8469a0d21df62a76132b237b8f95d25a1a7d8"
    },
    {
      "name": "thumbs/watch.webp",
      "path": "thumbs/watch.webp",
      "type": "binary",
      "bytes": 2884,
      "sha256": "bfe607fb869758eac1118d4b3a0b4fa1fde179929839d0810fdfa658fb31a0b2"
    },
    {
      "name": "thumbs/water-shoes.webp",
      "path": "thumbs/water-shoes.webp",
      "type": "binary",
      "bytes": 2132,
      "sha256": "b71f3d004d0dd054cd15736fd7fa32c4ae2723ca025ec47ae912fb60a80cbbb9"
    },
    {
      "name": "thumbs/winter.webp",
      "path": "thumbs/winter.webp",
      "type": "binary",
      "bytes": 1474,
      "sha256": "ab1f70090134451ae1ef49a8fa1a1d1b551c78d8190c8f11fa9a0b4512261aa8"
    }
  ]
});

export function create(options = {}) {
  return createAdapter(metadata, {
    baseURL: new URL('../../../assets/avatar-customization-v1/', import.meta.url),
    ...options,
  });
}

const adapter = create();
export const { load, ready, get, dispose } = adapter;
export default adapter;
