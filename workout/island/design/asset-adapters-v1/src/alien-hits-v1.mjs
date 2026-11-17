// Generated from the audited catalog.json. No asset I/O happens during import.
import { createAdapter } from './runtime.mjs';

export const metadata = Object.freeze({
  "id": "alien-hits-v1",
  "game": "alien",
  "flag": "?assetAlienHitsV1=1",
  "available": true,
  "source": {
    "branch": "codex/alien-hits-v1",
    "commit": "60dea7f96b1f46a7d1217a75738320b5aa1e2d9c",
    "root": "workout/island/design/alien-hits-v1"
  },
  "license": {
    "spdx": "CC0-1.0",
    "note": "LICENSE.txt: הקדשת נכסי החבילה CC0-1.0; רישיונות ספריות תצוגה אינם מועתקים משום שאינן נכללות.",
    "files": [
      "LICENSE.txt"
    ]
  },
  "bytes": 429283,
  "runtimeBytes": 427461,
  "dependencies": [
    "מנוע Canvas/WebGL לאטלסים ושמע OGG/MP3; אין תלות במודלי החלליות או ברינדורי ההדגמה."
  ],
  "missing": [
    "חיבור earliest swept contact ומחיקת הקליע בפגיעה הראשונה; המרת נקודת הפגיעה למערכת החללית והפעלת שכבות לפי ספי HP."
  ],
  "assets": [
    {
      "name": "audio-metadata.json",
      "path": "audio-metadata.json",
      "type": "json",
      "bytes": 1689,
      "sha256": "fcfa83a64aec764ce825ab271035c04380bc5b78c23d58785b042278432a725f"
    },
    {
      "name": "audio/crack.mp3",
      "path": "audio/crack.mp3",
      "type": "binary",
      "bytes": 2550,
      "sha256": "5614d0260423bfc0f9b7cfb5acd22781786d88315de0ff3a368096399f380005"
    },
    {
      "name": "audio/crack.ogg",
      "path": "audio/crack.ogg",
      "type": "binary",
      "bytes": 5528,
      "sha256": "a37ca10d54ef46db00e344955b9e23bf9da3cd40cf755c751c5975694409b2b8"
    },
    {
      "name": "audio/explosion.mp3",
      "path": "audio/explosion.mp3",
      "type": "binary",
      "bytes": 6312,
      "sha256": "a1aea49aee38ec3675908522c781ff8c8e4cee5be03d2ad9eaf9a7d2965b087b"
    },
    {
      "name": "audio/explosion.ogg",
      "path": "audio/explosion.ogg",
      "type": "binary",
      "bytes": 9887,
      "sha256": "6944068f2f9822b9a550ef1f98d8f9a9fff8a667ef8d3d43fcbe6a67532782a3"
    },
    {
      "name": "audio/hit-01.mp3",
      "path": "audio/hit-01.mp3",
      "type": "binary",
      "bytes": 1923,
      "sha256": "f622dd9128113ce7e5b054d80751df108caf3b36730095f5b469a5d2cd4d7d36"
    },
    {
      "name": "audio/hit-01.ogg",
      "path": "audio/hit-01.ogg",
      "type": "binary",
      "bytes": 4964,
      "sha256": "1ab69e6d21bad9588b0f360b640366809eb5d23bfbce02ba43988f8cbe930b9b"
    },
    {
      "name": "audio/hit-02.mp3",
      "path": "audio/hit-02.mp3",
      "type": "binary",
      "bytes": 2341,
      "sha256": "ffd8710ca526a415745f02df17d82e550680723cebdefdf84887bf9c1c379144"
    },
    {
      "name": "audio/hit-02.ogg",
      "path": "audio/hit-02.ogg",
      "type": "binary",
      "bytes": 5192,
      "sha256": "6b6e3e985792f6b5fba79bd16b8d199ea3a29a91bb1890f279e0576be3a25717"
    },
    {
      "name": "audio/hit-03.mp3",
      "path": "audio/hit-03.mp3",
      "type": "binary",
      "bytes": 2550,
      "sha256": "9d9383742f75e78b5b4c5303d4fb70cf2d0a1badcb0cdfd6e03e0fbc368c044b"
    },
    {
      "name": "audio/hit-03.ogg",
      "path": "audio/hit-03.ogg",
      "type": "binary",
      "bytes": 5398,
      "sha256": "11ae60038bec13cb73efc50b66c7b84ccb7598144ef399838a583aae6031e523"
    },
    {
      "name": "damage.png",
      "path": "damage.png",
      "type": "binary",
      "bytes": 128891,
      "sha256": "e048d80f9637d287599802e8e16fcf658284a88634d93b2cdf054079e372e557"
    },
    {
      "name": "explosion.png",
      "path": "explosion.png",
      "type": "binary",
      "bytes": 172857,
      "sha256": "3eab60e66b835b9b711159e4e6d84021891094b7cda7d237cc367189bac2a65f"
    },
    {
      "name": "impacts.png",
      "path": "impacts.png",
      "type": "binary",
      "bytes": 59595,
      "sha256": "203e58077086d775a9e9c573bb9985191a386f00a5bc315cb83450acb9aa66fd"
    },
    {
      "name": "manifest.json",
      "path": "manifest.json",
      "type": "json",
      "bytes": 17784,
      "sha256": "6e49c3630d570d043fd6b3409b6248636dcb7541b16902f8d4d7959f7b1d1d78"
    }
  ]
});

export function create(options = {}) {
  return createAdapter(metadata, {
    baseURL: new URL('../../../assets/alien-hits-v1/', import.meta.url),
    ...options,
  });
}

const adapter = create();
export const { load, ready, get, dispose } = adapter;
export default adapter;
