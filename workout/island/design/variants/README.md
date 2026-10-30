# האי שלי · וריאציות דמות

חבילת נכסים מ־30.10.2026: **8 מדי כדורגל, 4 מדי שוער, 6 מדי כדורסל ו־4 חליפות סקי**, עם 6 גווני עור ו־6 צבעי שיער נפרדים. כל דמות משתמשת ב־GLB הקיים שלה ב־[characters/](../characters/README.md); אין GLB נוסף לכל תלבושת. אין שינוי בקובצי המקור, בלוגיקת המשחקים או בתגי גרסה.

1. הפעילו שרת קבצים משורש המאגר, למשל `python -m http.server 8765`.
2. פתחו `http://localhost:8765/workout/island/design/variants/preview.html` ובחרו דמות, תלבושת, עור ושיער. בדקו גם את הגב.
3. התוצאה הצפויה: הדפוס והצבעים מתחלפים על אותה דמות, הפנים נשארות תקינות, וכל בחירה משפיעה רק על הדמות שלה. [overview.webp](overview.webp) מציג את כל 22 התלבושות.

זוהי מסירת נכסים ודוגמת החלה, לא חיבור למשחק. הדפוסים והפלטות של הכדורגל והכדורסל נגזרו מקובצי ה־SVG ב־[screens/](../screens/README.md), עם אותם מזהים. אלו מפות ייעודיות לתלת־ממד; קובצי תצוגת הבגד הדו־ממדיים אינם משמשים ישירות כטקסטורות.

| קובץ | תפקיד |
| --- | --- |
| `manifest.json` | רשימת 22 הגדרות התלבושות ונתיבי המודלים המשותפים |
| `outfits/*.json` | הגדרה מלאה לכל וריאציה: דמות, צבעי אזורים, דפוס, מפה ומקור |
| `maps/*.png` | 22 מפות אטומות, כל אחת 256×256, ללא שמות, סמלים או טקסט |
| `regions.json` | התאמת צבע המקור ותחום המשולש לאזור, hash ומידות לכל GLB, וחוזה UV |
| `palettes.json` | שש אפשרויות עור ושש אפשרויות שיער; המזהים אינם שמות אנשים |
| `apply-variant.js` | שיטת ההחלה היחידה, באמצעות החומר הרגיל של three.js |
| `validation.json`, `VALIDATION.md` | תוצאות אימות glTF, בדיקות החלה ומגבלות |
| `inventory.json` | גדלים ו־SHA-256; תקציב כל ארבעת ה־GLB יחד עם כל תיקיית variants |

## החלה ב־three.js

הנוסחה היא **`baseColor = white material × linear COLOR_0 × sRGB map`**. בהכנה, צבעי הבגד המקוריים מנוטרלים ללבן, ונוסף UV בזיכרון. לכן המדים אינם מוכפלים בצבע המדים הקודם ואינם מתכהים בהחלפות חוזרות. עור ושיער מקבלים צבע קודקוד במרחב לינארי ודוגמים לבן במפה; צבעי הפנים והמשקף נשמרים מהמקור. אין shader מותאם או חומר נפרד לכל אזור.

1. טענו GLB אחד עם `GLTFLoader` וה־Draco המקומי שכבר נמצא ב־`design/viewer/draco/`. ליצירת כמה דמויות מאותו מקור, שכפלו את הסצנה באמצעות `SkeletonUtils.clone`, כדי שלכל דמות יהיה שלד עצמאי.
2. קראו `prepareVariant` פעם אחת לכל mesh לפני הנפשה. היא מכינה גאומטריה וחומר פרטיים לדמות. הגאומטריה המשותפת, צבעי המקור, השלד והקובץ בדיסק אינם משתנים.
3. טענו JSON ומפה, וקראו `actor.apply` בכל החלפה. טענו JSON חדש רק כשהתלבושת משתנה; אפשר לשמור מפות במטמון. החזרת צבעי הקודקודים היא תמיד ממקור שמור, לא מצבע שכבר הוחל.

```js
// Example placed in design/variants/, as in preview.js.
import * as THREE from '../../vendor/three.module.js';
import { prepareVariant } from './apply-variant.js';

const getJSON = async url => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
};
const regionsURL = new URL('./regions.json', import.meta.url);
const regions = await getJSON(regionsURL);
const outfitURL = new URL('./outfits/soccer-01.json', import.meta.url);
const outfit = await getJSON(outfitURL);
const texture = await new THREE.TextureLoader().loadAsync(new URL(outfit.map, outfitURL).href);
// `mesh` is the single SkinnedMesh in the already loaded soccer-player GLB.
const actor = prepareVariant(mesh, 'soccer-player', regions);
actor.apply(outfit, texture, { skin: '#BF8054', hair: '#222B38' });
// At actor teardown: actor.dispose();
// Dispose cached textures only after their final user has released them.
```

השיטה מכוונת ל־WebGLRenderer ולמודלים המדויקים בחבילה. מפות צבע הן sRGB; `new THREE.Color('#RRGGBB')` ממיר עור ושיער ללינארי. ההגדרות `vertexColors=true`, חומר לבן, `texture.colorSpace=SRGBColorSpace`, `flipY=true`, סינון לינארי וללא mipmaps מוחלות בדוגמה. השתמשו ב־TextureLoader כפי שמודגם; התמיכה ב־Draco היא תלות משותפת קיימת ואינה מוכפלת בחבילה.

## מפת האזורים והמגבלות

הזיהוי משתמש בצבעי RGB לינאריים מקוריים, בסבילות של ‎0.000002, ובמרכז המשולש **בתנוחת המנוחה ובמטרים**. לכל צבע מקור רשימת כללים; ההתאמה הראשונה קובעת את האזור. `yMin` כולל, `yMax` לא כולל, ו־`absXMin` כולל. אין הסתמכות על סדר קודקודים אחרי Draco. כל משולש מתפצל לשלושה קודקודים בזיכרון כדי שלא יתערבבו UV בין אזורים; מספר המשולשים והעצמות אינו משתנה. ה־hash ב־regions וב־inventory קושר את המיפוי לקובץ המקורי; נכס חדש דורש בנייה ואימות חוזרים.

החצי העליון של המפה מכיל חולצה 128×128 ומכנסיים 128×128. החצי התחתון מכיל שמונה עמודות צבע ברוחב 32px: גרביים, נעליים, סוליות, כפפות, קסדה, ציוד, לבן ופסי אביזר. מקור המפה הוא בפינה העליונה השמאלית; `v = 1 − imageY/256`. projection ב־regions ממפה X/Y של תנוחת המנוחה לקואורדינטות איור 256px, מהדק אותן לטווח 2–253, מחלק בשתיים ומוסיף 128 ל־U של מכנסיים. צבעי העור והשיער עצמאיים מהמפה.

- אלו **שישה צבעי שיער**, עם גאומטריית השיער הקיימת. לא נוספו שש תסרוקות. בסקי אין גאומטריית שיער גלויה והבחירה מכוסה בקסדה; בכדורסל אין אזור גרביים. צבע גרביים עדיין מוגדר באותו חוזה תלבושת.
- דפוס הבגד מוקרן ב־X/Y מלפנים ומאחור, ונמתח עם השלד. זו אינה פרישת תפירה סביב הגוף: בצדי הגוף ובשרוולים הדפוס עשוי להימתח. צורות הבגדים נשארות אלה של הדמויות המקוריות.
- אין mipmaps כדי למנוע ערבוב בין אריחים. במרחק קטן מאוד על המסך פסים דקים עלולים להבהב; לא נמדדו ביצועים בטלפון פיזי.
- דוגמת ההחלה יוצרת עותק גאומטריה פרטי בזיכרון, כ־5,760–5,844 קודקודים לדמות. אין עותק GLB נוסף בדיסק או בהורדה.

## יצירה ובדיקות חוזרות

התקינו את התלויות המפורטות ב־`tools/package.json` בתיקיית כלים **מחוץ לחבילה**. לא להוסיף `node_modules` לתיקיית variants. הריצו משורש המאגר, כשנתיב package.json של הכלים מותקן במקום `/path/to/tools/package.json`:

```sh
node workout/island/design/variants/tools/build.mjs --modules /path/to/tools/package.json
node workout/island/design/variants/tools/validate.mjs --modules /path/to/tools/package.json
node workout/island/design/variants/tools/check-preview.mjs --out /path/to/temporary-shots
node workout/island/design/variants/tools/audit-package.mjs
node --test tests/*.mjs
```

`build` מייצר רק מפות, JSON ומניפסט; הוא אינו כותב GLB. `validate` בודק את הקבצים הדחוסים, פענוח עצמאי, 22 GLB זמניים עם הצבעים/UV/PNG המוכנים ואת כל 792 הצירופים. ה־GLB הזמניים נשארים בזיכרון בלבד. `check-preview` דורש Playwright ו־Chrome, או `PLAYWRIGHT_MODULE` ו־`--channel` מתאימים; הצילומים נשמרים בנתיב שבחרתם. `audit-package` אוכף תקרה של 400,000 bytes, עם ארבעת קובצי ה־GLB המשותפים וכל קובצי variants, לרבות כלים, תיעוד ותצוגת הסקירה. צילומי הדמויות הישנים בתיקיית characters, ספריית three.js ומפענח Draco אינם נכסי וריאציות ואינם נטענים מחדש לכל תלבושת.

מקורות טכניים: [חומר ומפת צבע ב־three.js](https://threejs.org/docs/pages/MeshStandardMaterial.html), [מרחב צבע וסינון טקסטורה](https://threejs.org/docs/pages/Texture.html), [Khronos glTF Validator](https://github.com/KhronosGroup/glTF-Validator).
