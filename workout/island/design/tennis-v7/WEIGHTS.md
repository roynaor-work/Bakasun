# משקלי מסירה

| קובץ | bytes | MB | משולשים בכל ה־LOD | טקסטורות |
|---|---:|---:|---:|---|
| [man-01.glb](models/man-01.glb) | 333,984 | 0.333984 | 19,329 | 512×512 |
| [man-02.glb](models/man-02.glb) | 356,504 | 0.356504 | 23,439 | 512×512 |
| [woman-01.glb](models/woman-01.glb) | 338,428 | 0.338428 | 19,390 | 512×512 |
| [woman-02.glb](models/woman-02.glb) | 338,396 | 0.338396 | 19,435 | 512×512 |
| [court-hard.glb](models/court-hard.glb) | 132,120 | 0.132120 | 1,168 | 1024×1024, 512×512 |
| [court-clay.glb](models/court-clay.glb) | 235,788 | 0.235788 | 1,168 | 1024×1024, 512×512 |
| [court-grass.glb](models/court-grass.glb) | 207,540 | 0.207540 | 1,168 | 1024×1024, 512×512 |
| [venue.glb](models/venue.glb) | 20,740 | 0.020740 | 6,316 | ללא תמונות |
| [crowd-prototypes.glb](models/crowd-prototypes.glb) | 6,380 | 0.006380 | 566 | ללא תמונות |
| [crew.glb](models/crew.glb) | 22,616 | 0.022616 | 5,336 | ללא תמונות |
| [net.glb](models/net.glb) | 9,320 | 0.009320 | 2,406 | ללא תמונות |
| [ball.glb](models/ball.glb) | 7,260 | 0.007260 | 1,160 | ללא תמונות |

סך GLB: 2,009,076 bytes. ספירת משולשי הקובץ כוללת רמות פירוט חלופיות; רק רמה אחת מוצגת בכל רגע. פירוט הרמות הפעילות ב־REPORT.md.

| קובץ תצוגה | bytes | MB |
|---|---:|---:|
| [standalone.html](standalone.html) | 4,030,268 | 4.030268 |
| [phone-check.html](phone-check.html) | 4,033,692 | 4.033692 |
| [vendor/three-r160-loaders.js](vendor/three-r160-loaders.js) | 715,067 | 0.715067 |
| [vendor/draco-source.js](vendor/draco-source.js) | 514,890 | 0.514890 |

ה־HTML העצמאי כולל עותקי base64 של כל הנכסים, המנוע והמפענח. בטעינת משחק משתמשים בקובצי GLB הנבחרים; עותקי התצוגה אינם טעינה נוספת שנדרשת למשחק.
