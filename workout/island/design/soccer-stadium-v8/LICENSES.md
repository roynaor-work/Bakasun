# מקורות ורישיונות

המודלים, מרקמי הדשא, איורי הקהל, השמיים, תאורת הפרוז'קטורים, שלטי ההיקף וממשק השידור נוצרו למשימה הזאת. קובצי ההפקה נמצאים ב־`source/`. לא נעשה שימוש בתצלומי אנשים, במותגים, בסמלי קבוצות, באצטדיון מזוהה או בנכס תלת־ממד חיצוני.

| רכיב צד שלישי | מקור | רישיון שנשמר |
|---|---|---|
| three.js r160, ‏GLTFLoader, ‏DRACOLoader, ‏BufferGeometryUtils וה־Worker הסטטי הנגזר ממנו | העותק המקומי ב־`workout/island/vendor/`, וה־Worker ב־`workout/island/minigames/soccer-draco-worker.mjs`, שמקורם בפרויקט three.js | `LICENSES/three.txt` — MIT |
| מפענח Draco WebAssembly ו־wrapper | העותק המקומי התואם ל־three r160 ב־`workout/island/vendor/draco/` | `LICENSES/draco.txt` — Apache 2.0 |

שמרו את שני קובצי הרישיון בהפצה. כלי ההפקה החיצוניים — Pillow, glTF Transform ו־draco3dgltf — נדרשים רק לשחזור המקור ואינם נטענים במשחק. הגופן בשלטי ההיקף נאפה באמצעות DejaVu Sans מותקן; טקסט ה־HUD משתמש בגופן מערכת, ללא בקשת רשת או קובץ גופן מצורף.
