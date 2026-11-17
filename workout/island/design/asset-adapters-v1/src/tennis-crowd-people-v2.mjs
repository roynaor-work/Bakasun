// Generated from the audited catalog.json. No asset I/O happens during import.
import { createAdapter } from './runtime.mjs';

export const metadata = Object.freeze({
  "id": "tennis-crowd-people-v2",
  "game": "tennis",
  "flag": "?assetTennisCrowdPeopleV2=1",
  "available": true,
  "source": {
    "branch": "codex/tennis-crowd-people-v2",
    "commit": "2e3ef931771e6a4d06fd3c99907ba2ee8faf9eb6",
    "root": "workout/island/design/tennis-crowd-people-v2"
  },
  "license": {
    "spdx": "CC0-1.0",
    "note": "LICENSES.md מתעד הקדשת CC0-1.0 לתרומות המקוריות ולשרשרת נכסי הדמויות; ספריות תצוגה וכלי פיתוח שאינם מועתקים שומרים על רישיונם.",
    "files": [
      "LICENSES.md"
    ]
  },
  "bytes": 3210358,
  "runtimeBytes": 3207363,
  "dependencies": [
    "GLTFLoader ו־AnimationMixer; כל GLB כולל טקסטורה ומודלים ל־LOD0/1/2 כסצנות נפרדות."
  ],
  "missing": [
    "על המארח לבחור סצנת LOD אחת לכל אוהד ולשמר זמן אנימציה בזמן החלפה; אלה אינם MSFT_lod אוטומטיים."
  ],
  "assets": [
    {
      "name": "manifest.json",
      "path": "manifest.json",
      "type": "json",
      "bytes": 35971,
      "sha256": "6df7a0e2bae5b5e12837fb0850a79e1d11f9244a6d2d3e1dcf68fa198d95943b"
    },
    {
      "name": "models/fan-01.glb",
      "path": "models/fan-01.glb",
      "type": "glb",
      "bytes": 227388,
      "sha256": "ddc8b47af825a05b0cd51fa0fa72572c972140984d0289189be2d7ecc96848a2"
    },
    {
      "name": "models/fan-02.glb",
      "path": "models/fan-02.glb",
      "type": "glb",
      "bytes": 225252,
      "sha256": "56992266161964427aa8ad63ff259f8ad880f693377841f2264587afbd9b8c07"
    },
    {
      "name": "models/fan-03.glb",
      "path": "models/fan-03.glb",
      "type": "glb",
      "bytes": 225348,
      "sha256": "34ddfc5cd1cf9fa05d3bd468592c7a5d865df7ce14a1e733f56d62ff19a30d37"
    },
    {
      "name": "models/fan-04.glb",
      "path": "models/fan-04.glb",
      "type": "glb",
      "bytes": 227908,
      "sha256": "533cf48dd55d1e82bb8c241268dc7f1e2b8493a46db2d88edef56690825f9708"
    },
    {
      "name": "models/fan-05.glb",
      "path": "models/fan-05.glb",
      "type": "glb",
      "bytes": 221940,
      "sha256": "38b003ca3b76255d5e62eb55e3dc7188e79a5b85e87afd002db283648ec6022b"
    },
    {
      "name": "models/fan-06.glb",
      "path": "models/fan-06.glb",
      "type": "glb",
      "bytes": 228344,
      "sha256": "a1960d9d3a2bc361c98cb9842e8ab9d5c5bfee91de6b70c24bad92bef3d870a2"
    },
    {
      "name": "models/fan-07.glb",
      "path": "models/fan-07.glb",
      "type": "glb",
      "bytes": 226064,
      "sha256": "f37395b9a2092cc0ab4eb53e074ead6a340b5521b2cc4ec792f68e56c5a8541b"
    },
    {
      "name": "models/fan-08.glb",
      "path": "models/fan-08.glb",
      "type": "glb",
      "bytes": 228180,
      "sha256": "308df38e2ecf84ff51dc2d59d87af75803a98663299dcc5b56f0b49b186c55be"
    },
    {
      "name": "models/fan-09.glb",
      "path": "models/fan-09.glb",
      "type": "glb",
      "bytes": 227140,
      "sha256": "60d873259643113fd09346d2b5faf52c498085ed3c1a46db7593c3942552251a"
    },
    {
      "name": "models/fan-10.glb",
      "path": "models/fan-10.glb",
      "type": "glb",
      "bytes": 225256,
      "sha256": "b47d415e1239b9ceb929fd3f8312b1614a0afc159da611e0e9878405d5f057fa"
    },
    {
      "name": "models/fan-11.glb",
      "path": "models/fan-11.glb",
      "type": "glb",
      "bytes": 228220,
      "sha256": "6acc8d0837448fa25b1061292d272cb9aeed67c08f5c087ea05041371479461e"
    },
    {
      "name": "models/fan-12.glb",
      "path": "models/fan-12.glb",
      "type": "glb",
      "bytes": 226484,
      "sha256": "46b720589f9f2f9a1f61338b2ac1c9341cfb1926dde4a1f2e67c29d3c57d8795"
    },
    {
      "name": "models/fan-13.glb",
      "path": "models/fan-13.glb",
      "type": "glb",
      "bytes": 226560,
      "sha256": "3ff2d8c0817d005a5918b3c3ca83dc8e34df15cbea6aef40198f0b3767aa06be"
    },
    {
      "name": "models/fan-14.glb",
      "path": "models/fan-14.glb",
      "type": "glb",
      "bytes": 227308,
      "sha256": "b124831d60fac79e51b21b5e9e01319cd910b1c7178bbf69dfa6178c6e7d8a6d"
    }
  ]
});

export function create(options = {}) {
  return createAdapter(metadata, {
    baseURL: new URL('../../../assets/tennis-crowd-people-v2/', import.meta.url),
    ...options,
  });
}

const adapter = create();
export const { load, ready, get, dispose } = adapter;
export default adapter;
