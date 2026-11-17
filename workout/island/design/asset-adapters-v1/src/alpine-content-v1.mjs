// Generated from the audited catalog.json. No asset I/O happens during import.
import { createAdapter } from './runtime.mjs';

export const metadata = Object.freeze({
  "id": "alpine-content-v1",
  "game": "alpine",
  "flag": "?assetAlpineContentV1=1",
  "available": true,
  "source": {
    "branch": "codex/alpine-content-v1",
    "commit": "ea65fbe9517737c0f2edf64ecd324af621703d6d",
    "root": "workout/island/design/alpine-content-v1"
  },
  "license": {
    "spdx": "CC0-1.0",
    "note": "LICENSES.md: הקדשת נכסי החבילה CC0-1.0; רישיונות ספריות תצוגה אינם מועתקים משום שאינן נכללות.",
    "files": [
      "LICENSES.md"
    ]
  },
  "bytes": 1112009,
  "runtimeBytes": 1108249,
  "dependencies": [
    "GLTFLoader/AnimationMixer במארח עבור GLB; effects/runtime.mjs מקבל את THREE, הסצנה והטקסטורות של המארח ומוחזר כטקסט."
  ],
  "missing": [
    "חיבור תנועה לרוחב ותזמון הופעת מפריעים; נדרש collider מסונכרן לעץ הנופל ברדיוס 4.5 מ׳; בוחרים חלופת GLB או חלקיקים רציפים לאותה פליטה."
  ],
  "assets": [
    {
      "name": "effects/powder-particle.png",
      "path": "effects/powder-particle.png",
      "type": "binary",
      "bytes": 1370,
      "sha256": "8d5589686854a47ad73dc68b9938283907c3cb02e26e72313c9ed941c3d894d4"
    },
    {
      "name": "effects/runtime.mjs",
      "path": "effects/runtime.mjs",
      "type": "text",
      "bytes": 4586,
      "sha256": "1563fd6f104ceb0e5445c5916741c41a17fe79210f607acdb6851e3eb0934618"
    },
    {
      "name": "effects/trail-strip.png",
      "path": "effects/trail-strip.png",
      "type": "binary",
      "bytes": 1306,
      "sha256": "debbb98aa1b25e804dd120d36ada39f9b3a43b53e41d96a93e9909f4b40a5184"
    },
    {
      "name": "manifest.json",
      "path": "manifest.json",
      "type": "json",
      "bytes": 34710,
      "sha256": "a61299f890d8b0c4f5d9e4de402af641ecb4825d92ac4b1718f5ba1d794771cd"
    },
    {
      "name": "models/bear.glb",
      "path": "models/bear.glb",
      "type": "glb",
      "bytes": 31248,
      "sha256": "f3989d9c2bb4de6d5a6d9bc797f56ebb5ed1e8da9acc87044b69fe45eb05f0ea"
    },
    {
      "name": "models/boost.glb",
      "path": "models/boost.glb",
      "type": "glb",
      "bytes": 10428,
      "sha256": "551eb77a97f06fddcb0cfc0e75db8468f3d86d44a14c2342ed228354bb8db80a"
    },
    {
      "name": "models/boulder.glb",
      "path": "models/boulder.glb",
      "type": "glb",
      "bytes": 11044,
      "sha256": "8c2c901b921ac9360c52ff25347d3eecc46c6d0d35dba8bc5f47c1125805ce88"
    },
    {
      "name": "models/bridge.glb",
      "path": "models/bridge.glb",
      "type": "glb",
      "bytes": 41540,
      "sha256": "9c54a3fa3eff3605815e7f9cd36f375643855b83ddd8dd3e6fbd529661480fad"
    },
    {
      "name": "models/clock.glb",
      "path": "models/clock.glb",
      "type": "glb",
      "bytes": 20144,
      "sha256": "1dd9693d5302d64ae432117f1eb169f772c047a83c24ee1771fff2dd2981cd8e"
    },
    {
      "name": "models/deep-snow.glb",
      "path": "models/deep-snow.glb",
      "type": "glb",
      "bytes": 17972,
      "sha256": "979478f42b8d121d2f06ad56e73c9c2f0054a6d2b4cbf16084a58e439a57acf9"
    },
    {
      "name": "models/deer.glb",
      "path": "models/deer.glb",
      "type": "glb",
      "bytes": 34964,
      "sha256": "e90bcc11652c68263887c40048413a89b3a2c3e564918678105662d87531bcae"
    },
    {
      "name": "models/double-coin.glb",
      "path": "models/double-coin.glb",
      "type": "glb",
      "bytes": 24756,
      "sha256": "08485d15c147d13ca45effd8aadc55ae3e5b8432213df6343b5c49137007d462"
    },
    {
      "name": "models/falling-tree.glb",
      "path": "models/falling-tree.glb",
      "type": "glb",
      "bytes": 23176,
      "sha256": "5c2b8f7fae07a6f07ba6edaf838a57e9315f218825d0164dbd461cc1fe516f85"
    },
    {
      "name": "models/fence.glb",
      "path": "models/fence.glb",
      "type": "glb",
      "bytes": 23060,
      "sha256": "938b22c0d5fecafcab57d235c047bd9a84e0b6a44d6d2d7b78838a1d0ad9fdc3"
    },
    {
      "name": "models/heart.glb",
      "path": "models/heart.glb",
      "type": "glb",
      "bytes": 10480,
      "sha256": "3803acbe26e9e8e34506a3e5281393bb2b4853756cb60b6cd2790299739deaa8"
    },
    {
      "name": "models/high-ramp.glb",
      "path": "models/high-ramp.glb",
      "type": "glb",
      "bytes": 25576,
      "sha256": "ef23b20ae26fcc68e9fd36e82c653cd51797250c1e617fdea0bcc68eb50476e5"
    },
    {
      "name": "models/ice-patch.glb",
      "path": "models/ice-patch.glb",
      "type": "glb",
      "bytes": 21024,
      "sha256": "056128d918529b8dab0fa3e48ae8660c4f626a86f5e8ca6d9e51740d992d9c92"
    },
    {
      "name": "models/magic-wand.glb",
      "path": "models/magic-wand.glb",
      "type": "glb",
      "bytes": 11420,
      "sha256": "64c8ccb803535898b58b788382371db682e1b173f728cecf5c72d8983d93421c"
    },
    {
      "name": "models/magnet.glb",
      "path": "models/magnet.glb",
      "type": "glb",
      "bytes": 15932,
      "sha256": "bf358f9d34a8e0d6479671465c1785048c691de254db2803e3144d2c0c1b86db"
    },
    {
      "name": "models/narrow-passage.glb",
      "path": "models/narrow-passage.glb",
      "type": "glb",
      "bytes": 20036,
      "sha256": "5592370a6281805baeac6dea2c7913b64cbe295eb64a5f58a4bea6c60b8816f7"
    },
    {
      "name": "models/rival-skier.glb",
      "path": "models/rival-skier.glb",
      "type": "glb",
      "bytes": 45552,
      "sha256": "14e2b2d9e78d19a3d237f3e53de4063c00753c6fbf8938aec77b489289f06250"
    },
    {
      "name": "models/shield.glb",
      "path": "models/shield.glb",
      "type": "glb",
      "bytes": 10760,
      "sha256": "c54fa8f88714968c442b23f99bf2a96e44f0094ed5c8f8482580ff148c32dd26"
    },
    {
      "name": "models/skier-trail.glb",
      "path": "models/skier-trail.glb",
      "type": "glb",
      "bytes": 17792,
      "sha256": "2aa42deedbeae67bc230593b75dc3e5b82e386fded5cb512198adbf6aded4116"
    },
    {
      "name": "models/snow-hole.glb",
      "path": "models/snow-hole.glb",
      "type": "glb",
      "bytes": 22424,
      "sha256": "44c178da14fd3d9889aa5e9748581e9cb4a32f785fb7b360fd37babc7a673dbd"
    },
    {
      "name": "models/snow-spray-heavy.glb",
      "path": "models/snow-spray-heavy.glb",
      "type": "glb",
      "bytes": 111916,
      "sha256": "b8fe3ff0baf327d96a15d1f55ed3bf1077c1acb6292079a3235e10e3828ced70"
    },
    {
      "name": "models/snow-spray-light.glb",
      "path": "models/snow-spray-light.glb",
      "type": "glb",
      "bytes": 32868,
      "sha256": "6762b4f6e92e0355417ed62fcc871192aef4afa1b59489167acdb793ed7b0c49"
    },
    {
      "name": "models/snow-spray-medium.glb",
      "path": "models/snow-spray-medium.glb",
      "type": "glb",
      "bytes": 65416,
      "sha256": "9fd41fb97f49e9fe445497201af6833e29b82957c72e4e0067eb7fc3b2e3921c"
    },
    {
      "name": "models/snowman.glb",
      "path": "models/snowman.glb",
      "type": "glb",
      "bytes": 34908,
      "sha256": "28b918e299ac01ecebf80fcc1a85dd30abd68db2b94eb757a94aee6333196b6a"
    },
    {
      "name": "models/spring-pad.glb",
      "path": "models/spring-pad.glb",
      "type": "glb",
      "bytes": 35804,
      "sha256": "5c9f343e795f1e1e9bc9ff5f5bc35e8f6d30cddbbeeffef5ed6d7a9782242bbb"
    },
    {
      "name": "models/star.glb",
      "path": "models/star.glb",
      "type": "glb",
      "bytes": 10912,
      "sha256": "0e970626de38b8eb7175ab35dabefb0831eb20faf1c537eb3f3a29900618c14b"
    },
    {
      "name": "models/trick-ramp.glb",
      "path": "models/trick-ramp.glb",
      "type": "glb",
      "bytes": 25624,
      "sha256": "74dcc398e970ac5c334156fcdde0bebb5cc4faf0adc806a8a1c61359161120aa"
    },
    {
      "name": "models/warning-sign.glb",
      "path": "models/warning-sign.glb",
      "type": "glb",
      "bytes": 12532,
      "sha256": "dee7fa6e8aaea848e84227e7e03fde0afa679b5ea648ac236c70b2ce9bd01edd"
    },
    {
      "name": "png/bear.png",
      "path": "png/bear.png",
      "type": "binary",
      "bytes": 13078,
      "sha256": "6af8d33f7958166f6939d1a0f9539e25deb3c1e9d3763f6f15fa8aee9a46731b"
    },
    {
      "name": "png/boost.png",
      "path": "png/boost.png",
      "type": "binary",
      "bytes": 9652,
      "sha256": "39395fefa50ec22e77e8f6adc908474d1f31cba2720257f2b2cb7002f271f54d"
    },
    {
      "name": "png/boulder.png",
      "path": "png/boulder.png",
      "type": "binary",
      "bytes": 10469,
      "sha256": "8abe73bdcbeee5ebe550f3e24cfb9ce7a717f308d1ad71def389b89278a6f615"
    },
    {
      "name": "png/bridge.png",
      "path": "png/bridge.png",
      "type": "binary",
      "bytes": 14363,
      "sha256": "d070dff212e642311dd1cf468aebb83948c50f5b9d9c3de872186f451a0ae33f"
    },
    {
      "name": "png/clock.png",
      "path": "png/clock.png",
      "type": "binary",
      "bytes": 10091,
      "sha256": "73af61d02cae941501f0368bd04585e9390da356f51f3686597cd9932a75ec71"
    },
    {
      "name": "png/deep-snow.png",
      "path": "png/deep-snow.png",
      "type": "binary",
      "bytes": 8561,
      "sha256": "b14ea4e1edc4298b642a2a283d2c2afee488bf9ede6d22599bc828bc61755de5"
    },
    {
      "name": "png/deer.png",
      "path": "png/deer.png",
      "type": "binary",
      "bytes": 11917,
      "sha256": "ae703a4e76797e98135d5f754b24ebeba2b94c6a32cf953b22840359e4a9b96e"
    },
    {
      "name": "png/double-coin.png",
      "path": "png/double-coin.png",
      "type": "binary",
      "bytes": 10452,
      "sha256": "28e1db3dc572701ad0b8ecbdb109debcf560b7b2e31ff19355c940b150c12a07"
    },
    {
      "name": "png/falling-tree.png",
      "path": "png/falling-tree.png",
      "type": "binary",
      "bytes": 9197,
      "sha256": "5c6282d79231e42f6d96afc7165d49ef8d9d99d2f01f6474ae1c4cc39ba37bda"
    },
    {
      "name": "png/fence.png",
      "path": "png/fence.png",
      "type": "binary",
      "bytes": 9388,
      "sha256": "4872dc5ebadc8f296fe7e47cbb21e37a742eff51538a20e2d1e30b19efc2b121"
    },
    {
      "name": "png/heart.png",
      "path": "png/heart.png",
      "type": "binary",
      "bytes": 9683,
      "sha256": "ce6d37a6f28bcf55651ed24685996f49e04b01867e506922894c0fded7699ead"
    },
    {
      "name": "png/high-ramp.png",
      "path": "png/high-ramp.png",
      "type": "binary",
      "bytes": 9419,
      "sha256": "8872e0dfc89c0a24566616813abbea4625f9d19a352945d06ead24fb108afe80"
    },
    {
      "name": "png/ice-patch.png",
      "path": "png/ice-patch.png",
      "type": "binary",
      "bytes": 7876,
      "sha256": "94f78b4ae67d16f200ca1f454f763519e4bba1f5f7c66b81fdb2340c325e9518"
    },
    {
      "name": "png/magic-wand.png",
      "path": "png/magic-wand.png",
      "type": "binary",
      "bytes": 7658,
      "sha256": "279d62425b10c9c71d67ada0a4d9926a87f2448edaf2c09ca9064f10226174fb"
    },
    {
      "name": "png/magnet.png",
      "path": "png/magnet.png",
      "type": "binary",
      "bytes": 10765,
      "sha256": "7386067f78d1a77b9d613ffa4dd6756ba4263e384cbeffcb88e9f4298233e8c2"
    },
    {
      "name": "png/narrow-passage.png",
      "path": "png/narrow-passage.png",
      "type": "binary",
      "bytes": 8897,
      "sha256": "e94cb82134be1d38fbb28c7571026030bc82ec0535a0bc418ecd6ae5349f54b6"
    },
    {
      "name": "png/rival-skier.png",
      "path": "png/rival-skier.png",
      "type": "binary",
      "bytes": 15502,
      "sha256": "91099b5273de7c9440eb999ffe5f20f450b9e94b95e85d10473807059a10109c"
    },
    {
      "name": "png/shield.png",
      "path": "png/shield.png",
      "type": "binary",
      "bytes": 8950,
      "sha256": "9b041fe4834ad81953f82b3d07f2a61d375ad70e08a826633ac8f75b25485bcd"
    },
    {
      "name": "png/skier-trail.png",
      "path": "png/skier-trail.png",
      "type": "binary",
      "bytes": 5942,
      "sha256": "05f8b03c93b1080fcc34b3dab5fb0c6472dbd96e45e380daa6a83a1e2a3183e3"
    },
    {
      "name": "png/snow-hole.png",
      "path": "png/snow-hole.png",
      "type": "binary",
      "bytes": 10353,
      "sha256": "5cc9919f0ab0cbe755ce142412a7f895971cd10d0cea7328e72fc8e67833cb35"
    },
    {
      "name": "png/snow-spray-heavy.png",
      "path": "png/snow-spray-heavy.png",
      "type": "binary",
      "bytes": 18516,
      "sha256": "9999d32e931b2570cd1d16d03810e488aa09ff26ca707174c80438949b6b3481"
    },
    {
      "name": "png/snow-spray-light.png",
      "path": "png/snow-spray-light.png",
      "type": "binary",
      "bytes": 9499,
      "sha256": "8f5793d82c8df52c1f77e54473c08422ff2543d540b799d590639476a13880b5"
    },
    {
      "name": "png/snow-spray-medium.png",
      "path": "png/snow-spray-medium.png",
      "type": "binary",
      "bytes": 13426,
      "sha256": "41d9333ccd38328ec2f2af6ef21396cae46bf4f4582acd987df425c48bb82758"
    },
    {
      "name": "png/snowman.png",
      "path": "png/snowman.png",
      "type": "binary",
      "bytes": 12118,
      "sha256": "979883838629a563f8c17af5c2ef22e78d6d046201dfd1c42536b91c27c4deab"
    },
    {
      "name": "png/spring-pad.png",
      "path": "png/spring-pad.png",
      "type": "binary",
      "bytes": 14332,
      "sha256": "08270a92778756fc3f829e281fa6f716480544152042f3460dfbd7bbee787f1d"
    },
    {
      "name": "png/star.png",
      "path": "png/star.png",
      "type": "binary",
      "bytes": 9411,
      "sha256": "3ac61c510dd7d80d58b6df4b5977cfdeccfde995cbf0a7e00a6ccc7751c7142d"
    },
    {
      "name": "png/trick-ramp.png",
      "path": "png/trick-ramp.png",
      "type": "binary",
      "bytes": 10478,
      "sha256": "c646719d8712847e1fc4b0caa1eb98acca02b58e96c5529866753689857328b1"
    },
    {
      "name": "png/warning-sign.png",
      "path": "png/warning-sign.png",
      "type": "binary",
      "bytes": 6976,
      "sha256": "a39366f167675d00f98fba98f05821faa532f4de5ca66c7273a8e2333cc18d9f"
    }
  ]
});

export function create(options = {}) {
  return createAdapter(metadata, {
    baseURL: new URL('../../../assets/alpine-content-v1/', import.meta.url),
    ...options,
  });
}

const adapter = create();
export const { load, ready, get, dispose } = adapter;
export default adapter;
