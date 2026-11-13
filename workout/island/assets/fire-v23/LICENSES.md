# מקורות ותנאי שימוש · כיבוי אש v23 (מטרות מים, בתוך הבניין)

13/11/2026. כל התמונות בתיקייה הן **רינדור** של נכסים שכבר נמצאים במאגר, או צורות פשוטות בקוד. לא הורד שום נכס חדש מהרשת.
המחולל: `workout/island/verification/fire-v23/sprites/make-sprites.mjs` (מצלמה, תאורה ומיקומים ב-`specs.mjs`). העוגנים (מיקומי חלונות, דלת, מוקדי אש, דמויות) נכתבים ל-`minigames/fire-v23-anchors.mjs` (מה שהמשחק קורא) ול-`verification/fire-v23/sprites/anchors.json` (כל המדידות).

| קבצים | מקור | תנאי שימוש |
|---|---|---|
| `street.webp` | רחוב מבניני `assets/fire-v7/models/*-burning.glb`, ברז `fire-v7/models/hydrant.glb`, פנסים ועץ מ-`assets/models/city/` (Meshy), כביש, מדרכה וקו רקיע בקופסאות | fire-v7: CC0-1.0 לפי `assets/fire-v7/LICENSES.md`; דגמי העיר: Meshy של בעל המאגר לפי `ASSETS.md` |
| `truck.webp` | `assets/models/fire-truck-512.glb` | Meshy של בעל המאגר, לפי `ASSETS.md` |
| `crew-0..4.webp`, `victory-crew.webp` | `assets/fire-v7/models/crew-nozzle.glb` (קליפים `hose`, `command`) | CC0-1.0, לפי `assets/fire-v7/LICENSES.md` |
| `kid-*.webp`, `kidrun-*.webp`, `victory-kid.webp` | `assets/kid-full.glb` (קליפים `lunges`, `run`, `stand`) | יצירה קיימת במאגר, לפי `ASSETS.md` |
| `room-living.webp`, `room-kitchen.webp`, `room-bedroom.webp` | חדרים מקופסאות וגלילים בקוד (`specs.mjs`), מצב ביניים עד חבילת חדרי הפנים של Codex | יצירה מקורית עבור המאגר |
| `tool-extinguisher.png`, `tool-blanket.png`, `tool-hose.png` | `fire-extinguisher.glb`, `fire-blanket.glb`, `foam-hose.glb` מחבילת Codex `design/fire-tools` (ענף `codex/fire-tools-v1`) | יצירה מקורית עבור המאגר, לפי `LICENSES.md` של החבילה |
| `pet-rabbit.png` | העתק של `workout/img/kit/misc/rabbit.png` (Kenney Animal Pack) | CC0-1.0 (kenney.nl) |

ספרייטי האש, העשן, האדים, המים והגצים הם `assets/fire-v7/particles/*-256.png` הקיימים (CC0-1.0), בלי עותק.
