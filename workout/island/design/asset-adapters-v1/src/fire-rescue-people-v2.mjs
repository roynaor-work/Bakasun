// Generated from the audited catalog.json. No asset I/O happens during import.
import { createAdapter } from './runtime.mjs';

export const metadata = Object.freeze({
  "id": "fire-rescue-people-v2",
  "game": "fire",
  "flag": "?assetFireRescuePeopleV2=1",
  "available": true,
  "source": {
    "branch": "codex/fire-rescue-people-v2",
    "commit": "b9d55deb01efa52bac616b8a9566c85d73468835",
    "root": "workout/island/design/fire-rescue-people-v2"
  },
  "license": {
    "spdx": "CC0-1.0",
    "note": "LICENSES.md: הקדשת נכסי החבילה CC0-1.0; רישיונות ספריות תצוגה אינם מועתקים משום שאינן נכללות.",
    "files": [
      "LICENSES.md"
    ]
  },
  "bytes": 5236481,
  "runtimeBytes": 5234107,
  "dependencies": [
    "GLTFLoader, AnimationMixer ושכפול שלד עצמאי במארח; 18 עצמות קנוניות והקליפים מוטבעים."
  ],
  "missing": [
    "חיבור בחירת ציוד לפי clip.equipment, נשיאה בזוג ועוגני פיות; scale כבר נאפה ל־GLB ואין להכפילו שוב."
  ],
  "assets": [
    {
      "name": "manifest.json",
      "path": "manifest.json",
      "type": "json",
      "bytes": 26080,
      "sha256": "cf346a535357811b75039bb936fdff269c397eba6844096b6b8f3954055c00db"
    },
    {
      "name": "models/baby-stroller.glb",
      "path": "models/baby-stroller.glb",
      "type": "glb",
      "bytes": 509524,
      "sha256": "e759e7a12598b45b7c12b8334613e8c93db36a27cb53cf8dcc662a7c22b13998"
    },
    {
      "name": "models/boy.glb",
      "path": "models/boy.glb",
      "type": "glb",
      "bytes": 481040,
      "sha256": "faa67a98dfe641a65fbb1df00ab2debd553a975933751561aef95bff2f35ddf6"
    },
    {
      "name": "models/captain.glb",
      "path": "models/captain.glb",
      "type": "glb",
      "bytes": 416548,
      "sha256": "9effb5f075ad56028d35a7e6270df920de65bcfd015f931743b07643e8e34fb3"
    },
    {
      "name": "models/father.glb",
      "path": "models/father.glb",
      "type": "glb",
      "bytes": 486044,
      "sha256": "ec2d9a2b1bea64bcda6ad703181cda6744a8fdef38172400ef3e1e9a8f8dfe38"
    },
    {
      "name": "models/female-firefighter.glb",
      "path": "models/female-firefighter.glb",
      "type": "glb",
      "bytes": 418824,
      "sha256": "862c68ac52215324ee1dd8a054f7d3846b78a3f1d15ba8eb7fc84b7d6cbd627b"
    },
    {
      "name": "models/girl.glb",
      "path": "models/girl.glb",
      "type": "glb",
      "bytes": 498080,
      "sha256": "81380ee8c0016a920d1e052ef19ba143e1e6de5f9e2105906ec9b5119d97949c"
    },
    {
      "name": "models/grandfather.glb",
      "path": "models/grandfather.glb",
      "type": "glb",
      "bytes": 495920,
      "sha256": "3fd9c2e5e09692f39db663ae0688113e507b7b31d686d53c00e1a75c56c257ca"
    },
    {
      "name": "models/grandmother.glb",
      "path": "models/grandmother.glb",
      "type": "glb",
      "bytes": 504036,
      "sha256": "d0d24e0718f937ba801d7755991403e5e8cffa9f2edecd4148d7e4cced0196b2"
    },
    {
      "name": "models/mother.glb",
      "path": "models/mother.glb",
      "type": "glb",
      "bytes": 493520,
      "sha256": "a5a192cb4fbadaf0c5ff57428f6d1a588974821bb45a50fcf25914d5bd1b30c8"
    },
    {
      "name": "models/panicked-man.glb",
      "path": "models/panicked-man.glb",
      "type": "glb",
      "bytes": 486072,
      "sha256": "2f38f937b2eb9eae153b2ab57d035cd8b474f8ced56e1c9f2289dfa251d230cc"
    },
    {
      "name": "models/young-firefighter.glb",
      "path": "models/young-firefighter.glb",
      "type": "glb",
      "bytes": 415096,
      "sha256": "bf7b587f05d796b9e2310097b28bd82d41d6b4955cd8300a0a024b1e405c5e9b"
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
    baseURL: new URL('../../../assets/fire-rescue-people-v2/', import.meta.url),
    ...options,
  });
}

const adapter = create();
export const { load, ready, get, dispose } = adapter;
export default adapter;
