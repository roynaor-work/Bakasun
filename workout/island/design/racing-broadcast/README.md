# ערכת שידור מרוצים

16 נכסים מקוריים: גשר זינוק, שלושה רקעי ממשק ו־12 סמלי קבוצות. כל הקבצים החדשים נמצאים בתיקייה זו. אין חיבור למשחק, שינוי בקוד קיים, שינוי גרסה או שינוי בבדיקות.

## צפייה

1. משורש המאגר הריצו:

   ```sh
   python3 -m http.server 8765
   ```

2. פתחו את [דף התצוגה המקומי](http://localhost:8765/workout/island/design/racing-broadcast/).
3. לחצו על נורה בודדת או על ״רצף זינוק״. מתחת לסקירה מופיעים לוח דירוג ושתי מידות של כרטיסייה עם אותה מסגרת.

התוצאה הרצויה: הודעת הצלחה עבור 16 נכסים, חמש נורות עצמאיות, 12 סמלים וכל שלושת הפאנלים. [צילום הסקירה](preview-844x390.png) הוא בגודל 844×390. יש לגלול באותו דף לצפייה בהדגמות הפאנלים. הדף משתמש בקבצי Three.js הקיימים ב־`../../vendor/`, ללא CDN או התקנה. פתיחה באמצעות `file://` אינה נתמכת עקב טעינת מודולים ו־GLB.

## גשר הזינוק

`assets/start-gantry.glb`: ‏132,540 בתים, 2,672 משולשים, 9 mesh primitives, ‏9 חומרים, ללא טקסטורות, אנימציות, הרחבות glTF או Draco. הגאומטריה מפורשת ואינה דורשת מפענח דחיסה.

- יחידות: מטרים. ‎+Y למעלה, חזית הנורות ‎+Z, רוחב הגשר לאורך X.
- עוגן: מרכז המפתח על הקרקע, `[0, 0, 0]`. להצבה מעל קו הזינוק: מרכזו את העוגן על הקו וסובבו את הגשר סביב Y לכיוון המסלול.
- ממדים כוללים: כ־14.15 × 5.775 × 1.368 מטרים. מפתח פנוי בין העמודים כ־12.35 מ׳; תחתית לוח הנורות כ־4.21 מ׳ מעל הקרקע. למסלול רחב יותר יש לשנות קנה מידה בהתאם.
- `lamp1` עד `lamp5` הם גם שמות האובייקטים וגם שמות החומרים, משמאל לימין במבט מ־‎+Z. כל נורה משתמשת בחומר נפרד.
- לכל חומר נורה `emissiveFactor` אדום שאינו אפס. בקובץ ה־GLB הנורות דולקות בעוצמת ברירת המחדל; כבו אותן אחרי הטעינה. דף התצוגה מציג תחילה שלוש דולקות כדי להראות את ההבדל.

דוגמת שימוש לאחר טעינה ב־GLTFLoader של Three.js:

```js
const lampMaterials = new Map();
gltf.scene.traverse(object => {
  if (!object.isMesh) return;
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  for (const material of materials) {
    if (/^lamp[1-5]$/.test(material.name)) {
      material.emissiveIntensity = 0;
      lampMaterials.set(material.name, material);
    }
  }
});
// יש לרנדר פריים לאחר שינוי החומר.
lampMaterials.get('lamp1').emissiveIntensity = 1;
// כיבוי:
lampMaterials.get('lamp1').emissiveIntensity = 0;
```

Emission מאיר את מראה העדשה; הוא אינו מפזר אור על עצמים סמוכים במנוע רגיל. Bloom או PointLight אינם נדרשים כדי לראות הדלקה. הכביש וקו המשבצות בדף הם אביזרי תצוגה ואינם כלולים ב־GLB.

מקור הגאומטריה הוא [source/build-gantry.py](source/build-gantry.py). לבנייה מחדש, משורש תיקייה זו:

```sh
blender --background --python source/build-gantry.py
```

היצוא נבדק עם Blender ‏4.3.2. הסקריפט מוודא תקציב של עד 3,000 משולשים לפני היצוא. Blender עשוי להדפיס הודעה על ספריית Draco שאינה מותקנת בעת אתחול היצואן; בקובץ שנוצר אין Draco ואין הרחבות נדרשות.

## פאנלים

| קובץ | מידות | שימוש |
|---|---|---|
| `assets/leaderboard-strip.svg` | 150×12 | אריח רקע חוזר. שורת דירוג בגובה 36px מדגימה שלוש חזרות אנכיות; הרוחב ניתן להרחבה באמצעות חזרה אופקית. |
| `assets/card-frame.svg` | 48×48 | 9-slice בחיתוך 12px. הפינות נשארות בגודל קבוע; שולי הכרטיס נמתחים והמרכז מתמלא. |
| `assets/podium.webp` | 844×390 | קהל, קונפטי ופודיום ריק עבור שכבות דמויות וטקסט בזמן ריצה. 67,404 בתים, מתחת למגבלה של 300,000 בתים. |

```css
.ranking-row {
  background: url('assets/leaderboard-strip.svg') repeat;
  background-size: 150px 12px;
}
.broadcast-card {
  border: 12px solid transparent;
  border-image: url('assets/card-frame.svg') 12 fill / 12px / 0 stretch;
}
```

אין טקסט, מספרים, גופנים, תמונות חיצוניות או לוגואים בתוך נכסי ה־SVG וה־WebP. הכותרות, הדירוגים ושמות הקבוצות בתצוגה הם שכבות HTML נפרדות. כל SVG הוא גם קובץ המקור הניתן לעריכה. תהליך יצירת ה־WebP מתועד ב־[source/art-direction.md](source/art-direction.md).

## סמלי קבוצות ומיפוי הצבעים

כל 12 הסמלים הם SVG שקופים בגודל 64×64. מגן משותף ומוטיב נפרד לכל קבוצה מאפשרים להבחין ביניהן גם בלי להסתמך על צבע בלבד.

**מקור הצבעים:** `GRID_DRIVERS` לא נמצא ב־`main` בקומיט הבסיס `51f4faab518c695672efaf6323a8b72f239a2b84`. רועי אישר בצ׳אט ב־12/11/2026 לבחור צבעים תואמים לשמות הקבוצות. חמשת הצבעים הראשונים וצבעי שקיעה/יער/סגול נלקחו מ־`baseColors` ב־`workout/island/minigames/racing-view.mjs`; ארבעת הצבעים הנותרים נבחרו לפי השמות. זהו המיפוי המאושר לחבילה, והוא מתועד ב־`manifest.json`.

| קבוצה | קובץ | צבע |
|---|---|---|
| להבה | `teams/flame.svg` | `#d93228` |
| גל | `teams/wave.svg` | `#18b6bd` |
| שמש | `teams/sun.svg` | `#d6aa3b` |
| ים | `teams/sea.svg` | `#566bd1` |
| כסף | `teams/silver.svg` | `#b7c2ca` |
| שקיעה | `teams/sunset.svg` | `#e07b2a` |
| יער | `teams/forest.svg` | `#2f9e5b` |
| סגול | `teams/purple.svg` | `#7a3fb0` |
| חול | `teams/sand.svg` | `#e8d7ad` |
| סלע | `teams/rock.svg` | `#8a9298` |
| לילה | `teams/night.svg` | `#2b2f46` |
| ענן | `teams/cloud.svg` | `#b9dfe9` |

כל המדידות ותוצאות האימות מופיעות ב־[REPORT.md](REPORT.md), ומקור ורישיון לכל קובץ ב־[LICENSES.md](LICENSES.md).
