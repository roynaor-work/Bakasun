# מקורות ורישיונות — נכסי כיבוי אש v23

SPDX-License-Identifier: CC0-1.0

כל הספרייטים כאן נוצרו ב-13/11/2026 על ידי רינדור/עיבוד של נכסי תלת-ממד ואפקטים אל תמונות דו-ממד
(המחולל: `workout/island/verification/fire-v23/sprites/make-sprites.mjs`). קובצי המקור עצמם (GLB, גיליונות אפקט)
אינם בתיקייה זו — זמן הריצה דו-ממדי. כל המקורות ברישיון CC0-1.0, בלי מותגים, סמלים, כיתוב או גופנים מוטבעים.

| קובץ בריצה | מקור Codex (CC0-1.0) |
|---|---|
| `street.webp`, `street-burnt-win-*.webp`, `street-door-open.webp` | `fire-building-v1` — `private-2f.glb`, `residential-3f.glb`, `highrise-5f.glb` (גאומטריה, UV ואטלס מקוריים, `build_assets.py`) |
| `target-*.webp` (פחים/ארגזים) | `fire-building-v1` — צמתי `target_*` באותם GLB |
| `room-living.webp`, `room-kitchen.webp`, `room-bedroom.webp`, `room-*-burnt-*.webp` | `fire-rooms-v1` — `living-room.glb`, `kitchen.glb`, `bedroom.glb` (`build_rooms.py`, אטלס `palette-1024.png`) |
| `friend-*-scared/rescued/walkout.webp`, `victory-girl/cat/dog.webp` | `fire-rescue-v1` — `girl.glb`, `cat.glb`, `dog.glb` (דמויות, שלדים וקליפים מקוריים, `build_assets.py`) |
| `fx/flame-*.png`, `fx/smoke-black.png`, `fx/steam-white.png`, `fx/water-*.png`, `fx/foam-bubbles.png`, `fx/sparks.png` | `fire-fx-v1` — איורים וקטוריים ואנימציות מתמטיות מקוריות (`source/build.cjs`) |
| `tool-extinguisher.png`, `tool-blanket.png`, `tool-hose.png` | `fire-tools` (Codex) — `fire-extinguisher.glb`, `fire-blanket.glb`, `foam-hose.glb` |
| `truck.webp` | `assets/models/fire-truck-512.glb` (קיים במאגר) |
| `crew-*.webp`, `victory-crew.webp` | `assets/fire-v7/models/crew-nozzle.glb` (הכבאי של Meshy, קיים במאגר) |

כל הקבצים שלעיל מוקדשים לנחלת הכלל לפי [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/):
מותר להעתיק, לשנות, להפיץ ולהשתמש מסחרית ללא ייחוס. אין אחריות.
[הנוסח המשפטי המלא](https://creativecommons.org/publicdomain/zero/1.0/legalcode).

כלי הרינדור (three.js r160, רישיון MIT, `../../vendor/LICENSE.three`; Chromium; Playwright) אינם מועתקים לכאן
ואינם מקבלים רישיון CC0. קובצי המקור המלאים עם ה-REPORT וה-LICENSES שלהם נמצאים בענפי Codex
(`codex/fire-building-v1`, `codex/fire-rooms-v1`, `codex/fire-rescue-v1`, `codex/fire-fx-v1`, `codex/fire-tools-v1`) תחת `workout/island/design/`.
