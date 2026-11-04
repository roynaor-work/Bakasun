# שחקני כדורגל v5 (עותקי ריצה)

מקור: `design/soccer-v5/models/` (GPT, CC0). לא נערך. כאן עותקים קלים שהמשחק טוען:

| קובץ | מקור | bytes מקור | bytes כאן | משולשים |
|---|---|---:|---:|---:|
| teal-quiff.glb | teal-quiff | 453,528 | 45,060 | 12,564 |
| teal-curls.glb | teal-curls | 493,248 | 49,332 | 14,297 |
| teal-knot.glb | teal-knot | 457,692 | 45,740 | 12,757 |
| goalkeeper.glb | goalkeeper | 454,500 | 45,412 | 12,616 |

מה הוסר: חמשת הקליפים המוטמעים ושתי מטרות ה-morph (המשחק מניע את השלד מספריית התנועה שלו). גאומטריה, skin, צבעי קודקודים ושלד 18 עצמות נשארו. בנייה חוזרת: `node tools/soccer-v5-build.mjs` (דורש `@gltf-transform/*` ו-`draco3dgltf` מחוץ לריפו).

חיבור: `minigames/soccer-v5.mjs` (בחירת סט, מפת רטרגט בלי כתפיים, אזורי צבע). בדיקה בדפדפן: `?soccerChars=v4` או `?soccerChars=v5`. כשל בטעינה של v5 = נפילה שקטה לשחקנים הקודמים (`design/characters2`).
