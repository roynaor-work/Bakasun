// Generated from the audited catalog.json. No asset I/O happens during import.
import { createAdapter } from './runtime.mjs';

export const metadata = Object.freeze({
  "id": "hoops-realism-v2",
  "game": "hoops",
  "flag": "?assetHoopsRealismV2=1",
  "available": true,
  "source": {
    "branch": "codex/hoops-realism-v2",
    "commit": "823cf024a577e7eedd92b5dc6245702cc8921267",
    "root": "workout/island/design/hoops-realism-v2"
  },
  "license": {
    "spdx": "LicenseRef-Mixed-Provenance",
    "note": "LICENSES.md: התרומות המקוריות, הקהל והצלילים CC0-1.0; שחקני MakeHuman/MPFB שומרים את תנאי המקור ואת ההסתייגות שאין אישור נפרד לכל חבילת שיער ונעליים. אין הצהרת CC0 גורפת לשחקנים הנגזרים.",
    "files": [
      "LICENSES.md"
    ]
  },
  "bytes": 3722297,
  "runtimeBytes": 3717662,
  "dependencies": [
    "GLTFLoader ו־AnimationMixer של המארח; שלד Canonical18 לשחקנים; בורר LOD לקהל; OGG או MP3 לניגון הצלילים."
  ],
  "missing": [
    "השלמת שרשרת רישוי לשיער ולנעליים של שחקני הבסיס, כפי שמוצהר ברישיון החבילה."
  ],
  "assets": [
    {
      "name": "audio/backboard-thud.mp3",
      "path": "audio/backboard-thud.mp3",
      "type": "binary",
      "bytes": 3781,
      "sha256": "dc7b4da0db1e8d4452738242cb4f78dc60c0bbe58671e8b263ca154e5aa0ab52"
    },
    {
      "name": "audio/backboard-thud.ogg",
      "path": "audio/backboard-thud.ogg",
      "type": "binary",
      "bytes": 4115,
      "sha256": "18e411d43e9d130fcf80a949bc1756d1ae256321ce4f73ee8c077915484a16f9"
    },
    {
      "name": "audio/catalog.json",
      "path": "audio/catalog.json",
      "type": "json",
      "bytes": 12557,
      "sha256": "ff17c5c2d748e4b92e5858c862a5a1b115d069f13d9f5a8f251cb97b3e39c34b"
    },
    {
      "name": "audio/net-swish.mp3",
      "path": "audio/net-swish.mp3",
      "type": "binary",
      "bytes": 5349,
      "sha256": "bf054e9e2c137674b1d1fcbec1a20951a0967acc6da494f4e31583f7e9d0a105"
    },
    {
      "name": "audio/net-swish.ogg",
      "path": "audio/net-swish.ogg",
      "type": "binary",
      "bytes": 6614,
      "sha256": "bfab3201337aaeb58980ca04105bba684b87e2cd6c3ce91048320f1b8034fcda"
    },
    {
      "name": "audio/parquet-bounce.mp3",
      "path": "audio/parquet-bounce.mp3",
      "type": "binary",
      "bytes": 4408,
      "sha256": "8377e5e92b4194afcc9321cc3d7eda0752c7b76cdc7edacd536f3474a1f5c0a2"
    },
    {
      "name": "audio/parquet-bounce.ogg",
      "path": "audio/parquet-bounce.ogg",
      "type": "binary",
      "bytes": 4119,
      "sha256": "bd41d1a234095462b3281b267a8369e144ac760c541a9d68bdabbc26d4a081f2"
    },
    {
      "name": "audio/rim-hit-01.mp3",
      "path": "audio/rim-hit-01.mp3",
      "type": "binary",
      "bytes": 3468,
      "sha256": "c90e26e933b12f2eef91d6e871c2539619c8d546e7abd493508c2aaf07fffd9c"
    },
    {
      "name": "audio/rim-hit-01.ogg",
      "path": "audio/rim-hit-01.ogg",
      "type": "binary",
      "bytes": 4269,
      "sha256": "36f96c1049becd3da6f5d8c2dc3e032e418c7bf328a9345ec1266c24a7123e94"
    },
    {
      "name": "audio/rim-hit-02.mp3",
      "path": "audio/rim-hit-02.mp3",
      "type": "binary",
      "bytes": 3781,
      "sha256": "220ac20f2b52a3ce65ec3bcb38f2a0f51d79d03c4e1f1465f2c4820850a72bc5"
    },
    {
      "name": "audio/rim-hit-02.ogg",
      "path": "audio/rim-hit-02.ogg",
      "type": "binary",
      "bytes": 4253,
      "sha256": "a0c72a0aec12ca921b840a9024b8fc919cce4fef9bc9b7ee17d63283e39ad866"
    },
    {
      "name": "audio/rim-hit-03.mp3",
      "path": "audio/rim-hit-03.mp3",
      "type": "binary",
      "bytes": 3468,
      "sha256": "ad2844479b37f6239d1db23c941dda92b9de8ec414f5ad8764f3a8dadefb1beb"
    },
    {
      "name": "audio/rim-hit-03.ogg",
      "path": "audio/rim-hit-03.ogg",
      "type": "binary",
      "bytes": 4167,
      "sha256": "cd129392c4abc8aeef1bd1f695908b194f2fc3c3e26ae607dadb33eb2b870fbe"
    },
    {
      "name": "audio/shoe-squeak.mp3",
      "path": "audio/shoe-squeak.mp3",
      "type": "binary",
      "bytes": 5349,
      "sha256": "dc1d92118b78f09021273fc5218e7d1c2cf5eafbf5dbf48657ef49c67a80b2b5"
    },
    {
      "name": "audio/shoe-squeak.ogg",
      "path": "audio/shoe-squeak.ogg",
      "type": "binary",
      "bytes": 6213,
      "sha256": "499cc42d3fab2282c67a5dbaf04a785dc7c99b9c89cf971c88fed18c8ee422fd"
    },
    {
      "name": "crowd/catalog.json",
      "path": "crowd/catalog.json",
      "type": "json",
      "bytes": 14918,
      "sha256": "f7ac7031b8b74576436b5c8c2bce1594e7b354d420759b0766ac1a5265279efb"
    },
    {
      "name": "crowd/fan-01-lod0.glb",
      "path": "crowd/fan-01-lod0.glb",
      "type": "glb",
      "bytes": 36920,
      "sha256": "68d1f45c0cb881e846ac34cd28167aba18c3df6e6ed711d5690093d9e91b3fbe"
    },
    {
      "name": "crowd/fan-01-lod1.glb",
      "path": "crowd/fan-01-lod1.glb",
      "type": "glb",
      "bytes": 31220,
      "sha256": "facd906d20ccda6da6ce1f21ad18bd58be1c22d7412f3e5baa25bed9b6d658d9"
    },
    {
      "name": "crowd/fan-01-lod2.glb",
      "path": "crowd/fan-01-lod2.glb",
      "type": "glb",
      "bytes": 27720,
      "sha256": "ad18a8cd81af0fc0b8f83c0363357aeb169d40ec1d5f2dd78e18946f5208ef50"
    },
    {
      "name": "crowd/fan-02-lod0.glb",
      "path": "crowd/fan-02-lod0.glb",
      "type": "glb",
      "bytes": 35656,
      "sha256": "7a56684fd23032e13faf60d50c9da73f1be101984014ab8037299091f8b14177"
    },
    {
      "name": "crowd/fan-02-lod1.glb",
      "path": "crowd/fan-02-lod1.glb",
      "type": "glb",
      "bytes": 30224,
      "sha256": "af22cb4ded62f7e54b2992acff5cd6c1baa6a9fa9f04452d9173caa39c5a2d72"
    },
    {
      "name": "crowd/fan-02-lod2.glb",
      "path": "crowd/fan-02-lod2.glb",
      "type": "glb",
      "bytes": 26720,
      "sha256": "34046ab96e8fc119e3f70f698536bfc99f64a63825b041b34b3ecf780a05b988"
    },
    {
      "name": "crowd/fan-03-lod0.glb",
      "path": "crowd/fan-03-lod0.glb",
      "type": "glb",
      "bytes": 37092,
      "sha256": "cb231e6d98bea35fd236dbf315eb222857ec6bb8bd1e915814b28201e7248a7b"
    },
    {
      "name": "crowd/fan-03-lod1.glb",
      "path": "crowd/fan-03-lod1.glb",
      "type": "glb",
      "bytes": 31396,
      "sha256": "445abb9a18c8bb46b5cbd4cf6b9a403a10dc96568642b4c1a45b4263255d24fe"
    },
    {
      "name": "crowd/fan-03-lod2.glb",
      "path": "crowd/fan-03-lod2.glb",
      "type": "glb",
      "bytes": 27892,
      "sha256": "d71b1f3fed7f00748fa045962f947d91d58970ac871442086ae10f071ab09d9b"
    },
    {
      "name": "crowd/fan-04-lod0.glb",
      "path": "crowd/fan-04-lod0.glb",
      "type": "glb",
      "bytes": 35968,
      "sha256": "817e58855065dd31b57ac2c30dcbabab1e3b9b7d47399c81cd8f2238f7836e6d"
    },
    {
      "name": "crowd/fan-04-lod1.glb",
      "path": "crowd/fan-04-lod1.glb",
      "type": "glb",
      "bytes": 30264,
      "sha256": "ed42b798943f77c95dbb5abc6e84298fb2fc67e51505577fcf4ac6cd356389ce"
    },
    {
      "name": "crowd/fan-04-lod2.glb",
      "path": "crowd/fan-04-lod2.glb",
      "type": "glb",
      "bytes": 26756,
      "sha256": "e2083f818878179a574b6fd03421dd7879e85398eda30ed58719041e4c3a972f"
    },
    {
      "name": "crowd/fan-05-lod0.glb",
      "path": "crowd/fan-05-lod0.glb",
      "type": "glb",
      "bytes": 36944,
      "sha256": "66030bf2ddc6ef598ca3a9e4d9d0855174d3bb874bffcb5e0e7b2aff52091404"
    },
    {
      "name": "crowd/fan-05-lod1.glb",
      "path": "crowd/fan-05-lod1.glb",
      "type": "glb",
      "bytes": 31248,
      "sha256": "b059075527adaec390d329802a4a8bf693dcd6f2ecf6154798ecb26282c6e4df"
    },
    {
      "name": "crowd/fan-05-lod2.glb",
      "path": "crowd/fan-05-lod2.glb",
      "type": "glb",
      "bytes": 27744,
      "sha256": "e644e5b81b33b64f31e6e000f3e980186d1c9ebfb4b07e9821ec56db82ad9eff"
    },
    {
      "name": "crowd/fan-06-lod0.glb",
      "path": "crowd/fan-06-lod0.glb",
      "type": "glb",
      "bytes": 35648,
      "sha256": "4018bdd7c98652a92bd22de70d576a8e19eea4adefc11a03ff6e9c40ecaa510c"
    },
    {
      "name": "crowd/fan-06-lod1.glb",
      "path": "crowd/fan-06-lod1.glb",
      "type": "glb",
      "bytes": 30220,
      "sha256": "ebdc3f4582a400da1840c181fa132e4c0bbb02f5c6d9f55189d6d263ec2f730c"
    },
    {
      "name": "crowd/fan-06-lod2.glb",
      "path": "crowd/fan-06-lod2.glb",
      "type": "glb",
      "bytes": 26708,
      "sha256": "a9c044a860af6e384cd742ad7f3113cc244835fdd616ad88f6ef33547d794bbb"
    },
    {
      "name": "crowd/fan-07-lod0.glb",
      "path": "crowd/fan-07-lod0.glb",
      "type": "glb",
      "bytes": 36000,
      "sha256": "26acdcb8ea84887ab7ec7df463e8deaf329ef5cd08fcd8a60764c5cb169601d5"
    },
    {
      "name": "crowd/fan-07-lod1.glb",
      "path": "crowd/fan-07-lod1.glb",
      "type": "glb",
      "bytes": 30300,
      "sha256": "0e73520a969acc140ff7b9e8ad7b3a4257d3fdb1a810dd057c051dd63aab1be4"
    },
    {
      "name": "crowd/fan-07-lod2.glb",
      "path": "crowd/fan-07-lod2.glb",
      "type": "glb",
      "bytes": 26792,
      "sha256": "dee8ee89efcba31ebaaac2990941e35af3c0d4a40d9e518e7bcda79e5a186c26"
    },
    {
      "name": "crowd/fan-08-lod0.glb",
      "path": "crowd/fan-08-lod0.glb",
      "type": "glb",
      "bytes": 36896,
      "sha256": "0b72a98c6618c874e40e9111b4652419167e5a0c79abe868830cc88a6bc713c2"
    },
    {
      "name": "crowd/fan-08-lod1.glb",
      "path": "crowd/fan-08-lod1.glb",
      "type": "glb",
      "bytes": 31196,
      "sha256": "f09401a552c223a11c41d123cd0c6a9810853a258ef2c774d32a970d44ecf1f9"
    },
    {
      "name": "crowd/fan-08-lod2.glb",
      "path": "crowd/fan-08-lod2.glb",
      "type": "glb",
      "bytes": 27692,
      "sha256": "e98d66a830c9ca6a8fae7988c07914bf50aaa90f07e6351d7a9271223b9f482c"
    },
    {
      "name": "crowd/fan-09-lod0.glb",
      "path": "crowd/fan-09-lod0.glb",
      "type": "glb",
      "bytes": 35892,
      "sha256": "3717fd81dbc74171931bbd1f17e93063a1f3d364af0185f03f6cc742354a5cef"
    },
    {
      "name": "crowd/fan-09-lod1.glb",
      "path": "crowd/fan-09-lod1.glb",
      "type": "glb",
      "bytes": 30188,
      "sha256": "828a6fe863fa9d8e66d9cd8ce90ab9429741c9261791f1146d0819bf1213dbdb"
    },
    {
      "name": "crowd/fan-09-lod2.glb",
      "path": "crowd/fan-09-lod2.glb",
      "type": "glb",
      "bytes": 26680,
      "sha256": "5097dee77265ef14b39de32673422add32c39c15b6bc573652bb199aa7d155e0"
    },
    {
      "name": "crowd/fan-10-lod0.glb",
      "path": "crowd/fan-10-lod0.glb",
      "type": "glb",
      "bytes": 35624,
      "sha256": "3ba3c7968968e9fb90747be6fbe1499325d5c0d583ffab10e9b271b654e6329d"
    },
    {
      "name": "crowd/fan-10-lod1.glb",
      "path": "crowd/fan-10-lod1.glb",
      "type": "glb",
      "bytes": 30192,
      "sha256": "a14631bd370b972396ff9ffd95ccd32ab9689389dfc6c25e696f060ffe087ae5"
    },
    {
      "name": "crowd/fan-10-lod2.glb",
      "path": "crowd/fan-10-lod2.glb",
      "type": "glb",
      "bytes": 26684,
      "sha256": "8f1e4f3862c696d832b19f6d80bba99bf3074f717ea32d29ea05d6bac913b95c"
    },
    {
      "name": "crowd/fan-11-lod0.glb",
      "path": "crowd/fan-11-lod0.glb",
      "type": "glb",
      "bytes": 37024,
      "sha256": "61a63088e15ac1815a985647a4463a0e9957b56abc675509de33b779d0433acc"
    },
    {
      "name": "crowd/fan-11-lod1.glb",
      "path": "crowd/fan-11-lod1.glb",
      "type": "glb",
      "bytes": 31324,
      "sha256": "b39bb5e292fa20ffca919ddca0838f350e5c559a52fb0eb2861c3db6d5a8f8b5"
    },
    {
      "name": "crowd/fan-11-lod2.glb",
      "path": "crowd/fan-11-lod2.glb",
      "type": "glb",
      "bytes": 27824,
      "sha256": "84e7b8f63925ca0383433400e6e9e4da42408a2dade242d3ac21f531b3b6f6f2"
    },
    {
      "name": "crowd/fan-12-lod0.glb",
      "path": "crowd/fan-12-lod0.glb",
      "type": "glb",
      "bytes": 35992,
      "sha256": "d02950c18f0e2bb84ee7c153de197db13b34eb9502370d3dd0ced2984e6d2c77"
    },
    {
      "name": "crowd/fan-12-lod1.glb",
      "path": "crowd/fan-12-lod1.glb",
      "type": "glb",
      "bytes": 30288,
      "sha256": "60c796d631f243d59d43a00d8790209a628c89be607192ca02c50fe7794439f9"
    },
    {
      "name": "crowd/fan-12-lod2.glb",
      "path": "crowd/fan-12-lod2.glb",
      "type": "glb",
      "bytes": 26784,
      "sha256": "47380573154481f1a4eb4cca56eb096d9061c64d25b35b27476429a3c4e3024f"
    },
    {
      "name": "crowd/fan-13-lod0.glb",
      "path": "crowd/fan-13-lod0.glb",
      "type": "glb",
      "bytes": 36012,
      "sha256": "7bfcdda451fb2a9f5300e88ef044c31f74ae1b616c832dca90c28fb044f34190"
    },
    {
      "name": "crowd/fan-13-lod1.glb",
      "path": "crowd/fan-13-lod1.glb",
      "type": "glb",
      "bytes": 30312,
      "sha256": "20b8787fd54f20e0d5d4c6b94e042f2cc22d29fb982a0c0cecf8f895715c8794"
    },
    {
      "name": "crowd/fan-13-lod2.glb",
      "path": "crowd/fan-13-lod2.glb",
      "type": "glb",
      "bytes": 26804,
      "sha256": "c3a29a36668084c3e181f26097de9414b98e7d513e0e72335aa11724dae8b612"
    },
    {
      "name": "crowd/fan-14-lod0.glb",
      "path": "crowd/fan-14-lod0.glb",
      "type": "glb",
      "bytes": 35796,
      "sha256": "de265bb428f950f52afe84dec4577797d2579a00c44bd0fef02327741e907e6e"
    },
    {
      "name": "crowd/fan-14-lod1.glb",
      "path": "crowd/fan-14-lod1.glb",
      "type": "glb",
      "bytes": 30364,
      "sha256": "30106727ec812d7233b1d9224ff38cb73122d5f217b2e303f52c7cf135cc7118"
    },
    {
      "name": "crowd/fan-14-lod2.glb",
      "path": "crowd/fan-14-lod2.glb",
      "type": "glb",
      "bytes": 26856,
      "sha256": "b016a0a40827ad38c47075217afb0803bf9f07bc6d0cc4f545a5af0320f3dcbf"
    },
    {
      "name": "crowd/fan-15-lod0.glb",
      "path": "crowd/fan-15-lod0.glb",
      "type": "glb",
      "bytes": 36628,
      "sha256": "4ddd1797fca745c0584600ed4088ceac14c3310925a7b848421cb1bb90e017b0"
    },
    {
      "name": "crowd/fan-15-lod1.glb",
      "path": "crowd/fan-15-lod1.glb",
      "type": "glb",
      "bytes": 30932,
      "sha256": "d4e07e2802a84866be4db98f056b9ea5b38ccb960991c70e561b41fd1e17c8ae"
    },
    {
      "name": "crowd/fan-15-lod2.glb",
      "path": "crowd/fan-15-lod2.glb",
      "type": "glb",
      "bytes": 27428,
      "sha256": "b528a57284f3769cd1c197583a30d5f0a2589b73a8848480169cce7a9855197f"
    },
    {
      "name": "crowd/fan-16-lod0.glb",
      "path": "crowd/fan-16-lod0.glb",
      "type": "glb",
      "bytes": 35952,
      "sha256": "e9dfc1e1a0b001cd9954ecd4e912f9126ea7188de3510f69dd2112757256827b"
    },
    {
      "name": "crowd/fan-16-lod1.glb",
      "path": "crowd/fan-16-lod1.glb",
      "type": "glb",
      "bytes": 30244,
      "sha256": "b51eff2e9b128928b567c760f88b946bed23f87b8638ba0bbe8f94049d70e91a"
    },
    {
      "name": "crowd/fan-16-lod2.glb",
      "path": "crowd/fan-16-lod2.glb",
      "type": "glb",
      "bytes": 26740,
      "sha256": "c4b511033971d4bf0904bb36d561c79eae62df1b8434c5e10963f6780dd2da37"
    },
    {
      "name": "manifest.json",
      "path": "manifest.json",
      "type": "json",
      "bytes": 68645,
      "sha256": "850b2764e2c9139adb2cae309c06f67f4fa679e6966f58c28244cdf7344e3777"
    },
    {
      "name": "players/catalog.json",
      "path": "players/catalog.json",
      "type": "json",
      "bytes": 5771,
      "sha256": "8917b2713e5bd8630d9125f738bd83b22530cdce37deb9ea350d9ae19247c1ef"
    },
    {
      "name": "players/guard.glb",
      "path": "players/guard.glb",
      "type": "glb",
      "bytes": 493996,
      "sha256": "36dbc1d381ad111c245a2b72f11489811bdcd3ad240c22d4b6533b891eb9f20f"
    },
    {
      "name": "players/masks/guard-team.png",
      "path": "players/masks/guard-team.png",
      "type": "binary",
      "bytes": 1306,
      "sha256": "69a529448594251ba1368ae683a23464e6c7d3b584e0d279f9644eff23da3dbf"
    },
    {
      "name": "players/masks/power-team.png",
      "path": "players/masks/power-team.png",
      "type": "binary",
      "bytes": 1288,
      "sha256": "e41782e04b949469edf87884ae0da087fd3bb916e15f98b854cecacbda7383de"
    },
    {
      "name": "players/masks/shooter-team.png",
      "path": "players/masks/shooter-team.png",
      "type": "binary",
      "bytes": 1243,
      "sha256": "7b2494587ff5e404e5e40bc93b63f086935d60077ac476d8cf12f7c1a10670d3"
    },
    {
      "name": "players/masks/wing-team.png",
      "path": "players/masks/wing-team.png",
      "type": "binary",
      "bytes": 1268,
      "sha256": "75e858d65ec4f5ee247ebfb3c6a7733a901f63d5ab7713478c6ede6aca5a0e57"
    },
    {
      "name": "players/power.glb",
      "path": "players/power.glb",
      "type": "glb",
      "bytes": 497424,
      "sha256": "c5dc2e9cc8637d6ec2af89343852e2b49c69450ad62fee4da4335c121325dbce"
    },
    {
      "name": "players/rig.json",
      "path": "players/rig.json",
      "type": "json",
      "bytes": 7392,
      "sha256": "3294c6f878e9a368c552890bca59783aedcf0da7ff262d168347139aa5d6b934"
    },
    {
      "name": "players/shooter.glb",
      "path": "players/shooter.glb",
      "type": "glb",
      "bytes": 498228,
      "sha256": "4839a24516a8683b532b669f554cb6ce63d7aee1b49afd5f90f460acc3e49633"
    },
    {
      "name": "players/wing.glb",
      "path": "players/wing.glb",
      "type": "glb",
      "bytes": 546492,
      "sha256": "40b758264f68a9201ae1cac9a9cf521625cf4a6a30eb90263da4b179351ecbc7"
    }
  ]
});

export function create(options = {}) {
  return createAdapter(metadata, {
    baseURL: new URL('../../../assets/hoops-realism-v2/', import.meta.url),
    ...options,
  });
}

const adapter = create();
export const { load, ready, get, dispose } = adapter;
export default adapter;
