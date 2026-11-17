// Generated from the audited catalog.json. No asset I/O happens during import.
import { createAdapter } from './runtime.mjs';

export const metadata = Object.freeze({
  "id": "catch-city-v1",
  "game": "catch",
  "flag": "?assetCatchCityV1=1",
  "available": true,
  "source": {
    "branch": "codex/catch-city-v1",
    "commit": "afcbc3f627f4cc5b6807f0d9a647c4e738d0b485",
    "root": "workout/island/design/catch-city-v1"
  },
  "license": {
    "spdx": "LicenseRef-Repository-Original AND CC0-1.0",
    "note": "LICENSES.md: נכסים מקוריים לפי תנאי המאגר ללא SPDX מפורש; skeleton מועתק ממקור CC0-1.0.",
    "files": [
      "LICENSES.md"
    ]
  },
  "bytes": 681633,
  "runtimeBytes": 677233,
  "dependencies": [
    "GLTFLoader ו־AnimationMixer במארח; walk בקובצי הולכי הרגל ב־30Hz, תנועת עולם 0.90 מ׳/ש׳ לאורך +Z."
  ],
  "missing": [
    "LICENSES.md מגדיר את רוב הנכסים repository-original ותנאי בעל המאגר ללא רישיון SPDX מפורש; נדרשת הבהרת הרשאת הפצה.",
    "יש ליצור colliders מורכבים לגשר ולמנהרה כדי לשמר פתחים ולחבר מסלולי הולכי רגל ותנועה."
  ],
  "assets": [
    {
      "name": "manifest.json",
      "path": "manifest.json",
      "type": "json",
      "bytes": 25446,
      "sha256": "ac174c461cfb0e862ac0ba1248427828f0e105f8dcf8a99a6e0a9608ed0c068b"
    },
    {
      "name": "models/apartment-sun.glb",
      "path": "models/apartment-sun.glb",
      "type": "glb",
      "bytes": 19812,
      "sha256": "e76e442059f6b28ded690cd7ddbf9e663c05dff6892579e540e2b307c86a8178"
    },
    {
      "name": "models/bridge-span.glb",
      "path": "models/bridge-span.glb",
      "type": "glb",
      "bytes": 20116,
      "sha256": "b473e13053eb17ece156fa62d997e48b95d933325e09a853cbfe6bb632014cf7"
    },
    {
      "name": "models/car-compact.glb",
      "path": "models/car-compact.glb",
      "type": "glb",
      "bytes": 25216,
      "sha256": "e100b887445326ae7854a02240030ce7365eb840ea458a44e1d98e443c9c3fb6"
    },
    {
      "name": "models/car-pickup.glb",
      "path": "models/car-pickup.glb",
      "type": "glb",
      "bytes": 28968,
      "sha256": "4b611da1261cab139a96c19541f57700f6e34c1c2c7964cc01c4a9714221e5cf"
    },
    {
      "name": "models/car-sedan.glb",
      "path": "models/car-sedan.glb",
      "type": "glb",
      "bytes": 25208,
      "sha256": "16f4ddd179c22c70e73bb0a04b3de5525034592d79f8212f0854902257d6d3e5"
    },
    {
      "name": "models/car-van.glb",
      "path": "models/car-van.glb",
      "type": "glb",
      "bytes": 26156,
      "sha256": "47d8fd0d92531d46a75ab1f59ded995cfac9f293dc66c8a65b30b0fccee16148"
    },
    {
      "name": "models/car-wagon.glb",
      "path": "models/car-wagon.glb",
      "type": "glb",
      "bytes": 25232,
      "sha256": "ce5de070404fcc5682e9860af17e926356a92c5899fc2a9d643d3a52be677b4a"
    },
    {
      "name": "models/civic-cream.glb",
      "path": "models/civic-cream.glb",
      "type": "glb",
      "bytes": 14504,
      "sha256": "3c781dc686fbf3308cdd155d102ecd52e3dc4863ab6b2fbb5947724b8601a0dd"
    },
    {
      "name": "models/cone-small.glb",
      "path": "models/cone-small.glb",
      "type": "glb",
      "bytes": 8996,
      "sha256": "c9a2b5a8c28c6b622d9a5a782103ae0ded8ac35b4cb69151b1b0ad79897490e3"
    },
    {
      "name": "models/cone-tall.glb",
      "path": "models/cone-tall.glb",
      "type": "glb",
      "bytes": 8980,
      "sha256": "e72e5e6f280f02590c69bc807246d3e28c95af54dd20f21d0dbbfa200c5bfc43"
    },
    {
      "name": "models/fence-metal.glb",
      "path": "models/fence-metal.glb",
      "type": "glb",
      "bytes": 11700,
      "sha256": "b810713d172eb5b35772c8f508fedda0e8476c58a0f52a13fdfc2e4068c76eaf"
    },
    {
      "name": "models/fence-picket.glb",
      "path": "models/fence-picket.glb",
      "type": "glb",
      "bytes": 11692,
      "sha256": "78ec2a83d85b0d8f838a1f983b0c6ea2a18c570bbe25d58dfa3064bf0131c948"
    },
    {
      "name": "models/house-coral.glb",
      "path": "models/house-coral.glb",
      "type": "glb",
      "bytes": 11448,
      "sha256": "267aab94705c2b23d495ea458e146eededa89aca5345360a2a4011e972f087d4"
    },
    {
      "name": "models/market-peach.glb",
      "path": "models/market-peach.glb",
      "type": "glb",
      "bytes": 16548,
      "sha256": "7089cafb4ea730f2de5a623a07af7a5fa2f315ae43816fb0ab4300eb7ee0d42d"
    },
    {
      "name": "models/office-blue.glb",
      "path": "models/office-blue.glb",
      "type": "glb",
      "bytes": 17624,
      "sha256": "14f85e5e5265a7b01892a72ecaa2c62a8a5c0f5e3a1fa0afa6eda02f31980f41"
    },
    {
      "name": "models/pedestrian-coral.glb",
      "path": "models/pedestrian-coral.glb",
      "type": "glb",
      "bytes": 86940,
      "sha256": "4573d193d93a11a437c38a3ab94efa2fb5185388ff45fc8619088018381b76df"
    },
    {
      "name": "models/pedestrian-mint.glb",
      "path": "models/pedestrian-mint.glb",
      "type": "glb",
      "bytes": 89424,
      "sha256": "6d423da8fcdf88a019dea885a6fa05f6a62006d3e9f1e65017bf0ea4d1bdba51"
    },
    {
      "name": "models/pedestrian-sun.glb",
      "path": "models/pedestrian-sun.glb",
      "type": "glb",
      "bytes": 89780,
      "sha256": "9b44ca87e6ce57f80ab474bfc02ce866e0ec951bd49ae16fb1f1706b798be176"
    },
    {
      "name": "models/road-crossing.glb",
      "path": "models/road-crossing.glb",
      "type": "glb",
      "bytes": 9820,
      "sha256": "10999afa40488fe2f385c03900533e0fd364c01988f127856a6217a28c21902b"
    },
    {
      "name": "models/road-straight.glb",
      "path": "models/road-straight.glb",
      "type": "glb",
      "bytes": 7012,
      "sha256": "e8d6e1dea9d181b11561e0d69587ca1ef82e65be7ef6560b5d46da2315c3369d"
    },
    {
      "name": "models/shop-mint.glb",
      "path": "models/shop-mint.glb",
      "type": "glb",
      "bytes": 16540,
      "sha256": "bb58eff6f3d3be92288aeec92b08d939bc75c03e03be617c843ff0da91045b02"
    },
    {
      "name": "models/street-lamp.glb",
      "path": "models/street-lamp.glb",
      "type": "glb",
      "bytes": 8956,
      "sha256": "110f520bbdfa5969940f984ba1925ce5f23318725892d16c51eda483f146e419"
    },
    {
      "name": "models/traffic-light.glb",
      "path": "models/traffic-light.glb",
      "type": "glb",
      "bytes": 10368,
      "sha256": "d8764b296229341521e5a9804057927bc04242da61345332840998168744c114"
    },
    {
      "name": "models/tree-column.glb",
      "path": "models/tree-column.glb",
      "type": "glb",
      "bytes": 6240,
      "sha256": "4883c5a7bf4e41e39de0d4e6b9fd176983de7a6d4d7497b8bb090a617c43a2c9"
    },
    {
      "name": "models/tree-pine.glb",
      "path": "models/tree-pine.glb",
      "type": "glb",
      "bytes": 7880,
      "sha256": "e179b5370844b11e1c2bd75c2eeaf07ca66bb7e5283001c1f3e316d7a2eac573"
    },
    {
      "name": "models/tree-round.glb",
      "path": "models/tree-round.glb",
      "type": "glb",
      "bytes": 7876,
      "sha256": "9f027978cce56df7b2dfce0baa9aea7aa13ce55a4435251d193b99b7a681967a"
    },
    {
      "name": "models/tunnel-segment.glb",
      "path": "models/tunnel-segment.glb",
      "type": "glb",
      "bytes": 15472,
      "sha256": "799897c7e44cf270d19440352874e72fa8790babbfc3e38f2ab0201f2aa76033"
    },
    {
      "name": "models/villa-lilac.glb",
      "path": "models/villa-lilac.glb",
      "type": "glb",
      "bytes": 11624,
      "sha256": "c2e582688a87ae52a5091ebdac7affe40577b4e207497a8de9244e1ec2cd98fd"
    },
    {
      "name": "models/workshop-teal.glb",
      "path": "models/workshop-teal.glb",
      "type": "glb",
      "bytes": 8332,
      "sha256": "ad0fb7fc2b682741e2cdb37a89f3f5de4f23ac86f0bb7ddf59507eb87415c95f"
    },
    {
      "name": "skeleton.json",
      "path": "skeleton.json",
      "type": "json",
      "bytes": 3323,
      "sha256": "252605cae9e7305f84c3c8b2fe42ab1af29ca103030f26b9ed7d2193dd2ed4c0"
    }
  ]
});

export function create(options = {}) {
  return createAdapter(metadata, {
    baseURL: new URL('../../../assets/catch-city-v1/', import.meta.url),
    ...options,
  });
}

const adapter = create();
export const { load, ready, get, dispose } = adapter;
export default adapter;
