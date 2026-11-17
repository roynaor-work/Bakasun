// Generated from the audited catalog.json. No asset I/O happens during import.
import { createAdapter } from './runtime.mjs';

export const metadata = Object.freeze({
  "id": "fire-fx-v2",
  "game": "fire",
  "flag": "?assetFireFxV2=1",
  "available": true,
  "source": {
    "branch": "codex/fire-fx-v2",
    "commit": "8409abf775d2ccba2915312ca92cb0d94f20bb39",
    "root": "workout/island/design/fire-fx-v2"
  },
  "license": {
    "spdx": "CC0-1.0 AND MIT",
    "note": "LICENSE.txt: נכסי אמנות CC0-1.0, קוד ונתוני מסירה MIT.",
    "files": [
      "LICENSE.txt"
    ]
  },
  "bytes": 433572,
  "runtimeBytes": 431508,
  "dependencies": [
    "מנוע ציור Canvas או WebGL התומך WebP ובמלבני אטלס; קודקודי UV ופיבוט במניפסט."
  ],
  "missing": [
    "חיבור מצבי האש וכיבוי לאנימציות האטלס; נדרשת אינטרפולציית RGBA מוכפלת־אלפא ומיון השכבות המוגדר במניפסט."
  ],
  "assets": [
    {
      "name": "fire-fx.webp",
      "path": "fire-fx.webp",
      "type": "binary",
      "bytes": 381748,
      "sha256": "41db41e0a0bf287e1fab7f72d30a4e60cddc4a1b99147fe5c6b18e7c4c8f449f"
    },
    {
      "name": "manifest.json",
      "path": "manifest.json",
      "type": "json",
      "bytes": 49760,
      "sha256": "9924c406cdf45c2bd4c58bce99aea9ea521b135966da605ab98de768a4ab4a35"
    }
  ]
});

export function create(options = {}) {
  return createAdapter(metadata, {
    baseURL: new URL('../../../assets/fire-fx-v2/', import.meta.url),
    ...options,
  });
}

const adapter = create();
export const { load, ready, get, dispose } = adapter;
export default adapter;
