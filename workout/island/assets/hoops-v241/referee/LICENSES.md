# מקורות ורישיונות

## השופט

הבסיס האנטומי, הפנים, השיער, הידיים, הנעליים וחלק מהמכנסיים נגזרו מהנכס הקיים במאגר:

`workout/island/design/hoops-v7/characters/models/referee-lod1.glb`

SHA-256 המקור נמצא ב־[model-metadata.json](model-metadata.json). חבילת המקור מייחסת את האנטומיה ל־MakeHuman/MPFB ואת נכסי הליבה ל־CC0, לפי [רישום נכסי האי](../../ASSETS.md) ו־[רישיון חבילת המקור](../hoops-v7/characters/LICENSES.md). ברישום המקור אין אישור נפרד לכל חבילת שיער ונעליים; חבילה זו משמרת את הסתייגות המקור ואינה מעניקה לחלקים אלה רישיון חדש.

ההתאמה לשלד, ההקלה והלבוש המותאם נוצרו לחבילה זו. השריקה המתכתית, הפייה ולולאת הצוואר הן גאומטריה מקורית. הדמות בדויה וללא מותגים. מיפוי צבע המבוסס על אטלס המקור מוטבע ב־GLB; עותק לעריכה נמצא ב־`textures/referee-atlas.png`.

## תנועה ולוח תוצאות

ששת הקליפים הם כוריאוגרפיה מקורית המחושבת באמצעות IK ונאפית ב־30Hz. אין בחבילה נתוני לכידת תנועה או אנימציות שהועתקו ממשחק מסחרי. האנימציות, קוד הבקרה, מודל הלוח, אטלס ספרות שבעת המקטעים, קוד התצוגה וקוד הבדיקה החדשים נמסרים תחת CC0-1.0, ככל שהדין מאפשר. רישיונות חלקי המקור המפורטים במסמך זה ממשיכים לחול.

חוזה השלד בן 18 העצמות נגזר מ־`workout/island/design/motion2/hoops.json` ומעותק החוזה שב־`design/naval-v7/assets/crew/canonical-skeleton.json`. נתוני המקור וקובצי הגיבוב מתועדים במטא־דאטה. לולאת הריצה כוללת תנועת Root אמיתית; התצוגה מסירה את ההתקדמות האופקית לצורך צפייה במקום.

## רכיבי צד שלישי

| רכיב | מקור ורישיון | הודעה מקומית |
|---|---|---|
| Three.js r160, GLTFLoader, BufferGeometryUtils | עותקים מקומיים מ־`workout/island/vendor`; MIT | [vendor/LICENSE.three](vendor/LICENSE.three) |
| תוויות הלוח המרוסטרות | Open Sans Semibold המותקן בסביבה; Apache-2.0. הגופן אינו נכלל כקובץ | [vendor/LICENSE.OpenSans](vendor/LICENSE.OpenSans), [vendor/LICENSE.Apache-2.0](vendor/LICENSE.Apache-2.0) |
| דפי דוח motion-qa-v1: סגנון ותצוגה | כלים מקוריים במאגר, גרסה `5eb4f093bc22523ee417a7f2345c3b813bffba24`; CC0-1.0 | קובצי המקור והגיבובים ב־[סיכום QA](verification/motion-qa/summary.json) |

כלי בנייה ובדיקה כגון glTF Transform, meshoptimizer, Draco, Sharp, Pillow, Khronos glTF Validator ו־Playwright מותקנים מחוץ לחבילה. המודל הסופי אינו דורש מפענחי Draco או Meshopt, התקנת npm או שירות רשת. הצילומים כפופים לרישיונות הנכסים הנראים בהם.

טקסט CC0-1.0: https://creativecommons.org/publicdomain/zero/1.0/legalcode
