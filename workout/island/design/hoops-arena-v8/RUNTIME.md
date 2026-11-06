# קובצי ריצה מדויקים

כל הנתיבים יחסיים ל־`runtime/`. הקבצים כאן הם תלות הריצה המקומית של דף התצוגה והאולם. LICENSE files מלווים את הספריות; כלי הפקה, בדיקות וצילומים נמצאים מחוץ ל־runtime. אין npm install ואין build בזמן ריצה.

| קובץ | בתים | SHA-256 |
|---|---:|---|
| [arena-lod0.glb](runtime/arena-lod0.glb) | 82,964 | `10413730ec0fb1a0adf7c7b62a53fc24517907f6c22d592355dd6c0e93a9910b` |
| [arena-lod1.glb](runtime/arena-lod1.glb) | 73,860 | `ac1be0a12e49f36ae1372004f1900fbae7fbd0b5e463213de3ac6db57676d400` |
| [arena-lod2.glb](runtime/arena-lod2.glb) | 62,188 | `dbdcb9c7d3d9b39020316d3541693fd9a97e8485c61953f86ce0a33df0e8188d` |
| [arena.mjs](runtime/arena.mjs) | 8,081 | `5ae39a459d2420601c8ba66bdc5793b6b4d504418a0a01a8bf40cd1d0530a922` |
| [broadcast.mjs](runtime/broadcast.mjs) | 2,175 | `1ee241fd1fad9f902a051a0142c8851206211e8b591171b1a16ca601abe49702` |
| [ceiling.webp](runtime/ceiling.webp) | 21,554 | `4e2ffa38245af18703908c4f4c7d01279cbf8f5ce9ddb487d839db940787a583` |
| [crowd.webp](runtime/crowd.webp) | 84,508 | `56dff006303abef308f13956bbf3fefc4d02a748bef22373360231e589fab731` |
| [draco-worker.js](runtime/draco-worker.js) | 5,710 | `8e337739e6d344fed5b52b54d27b8d6240572086f1ce06c156ae0c8947450aa1` |
| [draco.mjs](runtime/draco.mjs) | 1,902 | `11b201ffeb58ad43b9953e08b5dbea27d33fdaaf19c92801ac335b651d7f1724` |
| [hud.css](runtime/hud.css) | 5,738 | `603e83c2d856a1f1f37a2df09623c564f0135277db6a03e469d80e0eaba8c793` |
| [hud.mjs](runtime/hud.mjs) | 5,033 | `60683fb35c605ed6bf9f934baab2a308c26b406ee351128e615bbf32d33e65d4` |
| [layout.mjs](runtime/layout.mjs) | 2,095 | `68970396b1a86a25803d83a8ae20082c95a993109785a012acbc89a2cff903b0` |
| [parquet-normal.webp](runtime/parquet-normal.webp) | 100,448 | `fdf1d7c0dcebbcb74973279a2b9dcf4fc8cd345a56e94c1fec964fbb20ee5174` |
| [parquet-orm.webp](runtime/parquet-orm.webp) | 397,678 | `1ec3bf86279982e0398a8459fbb11f5d52f8f918a34d81b8b1985e780131bafb` |
| [parquet.webp](runtime/parquet.webp) | 53,596 | `3bf87aecc6ed1a2c476aa8fc2a239c9bcd588e585d6776dacd92bfe63938971b` |
| [population.mjs](runtime/population.mjs) | 3,634 | `4cc144b27e286f16fb4c630a040eb354b9e5a73cb2ade5b912a519f29e9a7df2` |
| [props.mjs](runtime/props.mjs) | 1,092 | `6e1c303095e90cc6bf0dc0884adaf049e379422186f343dc6322323a461d0834` |
| [replay.mjs](runtime/replay.mjs) | 3,423 | `793a5932159629b2b5877cce9ed8b21bcf66404c2e2f04ee7dcfbb83b6e4a181` |
| [surfaces.mjs](runtime/surfaces.mjs) | 836 | `ca73cae738c55bb836d10072d9b1091ed928318e36a4f16d1bf61a30e2602d5a` |
| [vendor/BufferGeometryUtils.js](runtime/vendor/BufferGeometryUtils.js) | 31,918 | `3a6701d824adfe05dc28c09b6c1d64aeab9a183bc3b944d85f15f596e5c6c2b3` |
| [vendor/DRACOLoader.js](runtime/vendor/DRACOLoader.js) | 13,640 | `e4348b2c255e7d851df790cafb93bcdd7ac0d2a1a6916038b43580b1e6d6c3fb` |
| [vendor/GLTFLoader.js](runtime/vendor/GLTFLoader.js) | 108,527 | `1f9b02acfbf219a6ebb77f09e355500449a3ba9e6a77d87e0de72c0b9315ea4e` |
| [vendor/LICENSE.three](runtime/vendor/LICENSE.three) | 1,081 | `852e0e8699169bf9f6fdc6bda3e682d078dcbc738b5d33e74df594721bff271d` |
| [vendor/draco/LICENSE.draco](runtime/vendor/draco/LICENSE.draco) | 13,898 | `d3709b0fb4b8a94bbb1d02b8a2e484f258b0d9c5c5a01f940391f3fe662cd1a4` |
| [vendor/draco/draco_decoder.wasm](runtime/vendor/draco/draco_decoder.wasm) | 192,420 | `a680d927bed9cb864ddbd63521868891af2bfbe755092761b4837487618df8ac` |
| [vendor/draco/draco_wasm_wrapper.js](runtime/vendor/draco/draco_wasm_wrapper.js) | 58,456 | `8bb2952d2ba7d67e1414f8df819410cb0434a666be53f671fff75f68843d76f6` |
| [vendor/three.module.js](runtime/vendor/three.module.js) | 670,681 | `3e690ac7d180b0aadf0891bea39eec643e29e2d3e75c99b18689518665f69ba6` |

סה״כ runtime: **2,007,136 בתים**.

כל שלושת ה־GLB דחוסים ב־Draco; חמש מפות WebP נפרדות משותפות לרמות. props.mjs והכדור מדגימים את חוזה הריפליי; המשחק יכול להשתמש בכדור הקיים שלו. הקובץ surfaces.mjs הוא מקור הגאומטריה הדינמית שהבדיקה סופרת.
