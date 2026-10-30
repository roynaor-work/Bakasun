# שחזור נכסי המודלים

כלים שנבדקו: Blender 5.2.2 LTS (כולל יצואן Draco), glTF Transform 4.5.1, Draco 1.5.9, glTF Validator 2.0.0-dev.3.10 ו־sharp 0.35.5. ספריות Node מוצמדות ב־`package.json`; הן כלי הפקה בלבד ואינן תלויות משחק.

1. מתקינים את תלויות `source/package.json` בתיקיית כלים נפרדת באמצעות מנהל חבילות Node. אין להוסיף `node_modules` למסירה.
2. משורש המאגר מריצים:

```sh
blender --background --factory-startup --python workout/island/design/models/source/build.py -- --out workout/island/design/models
blender --background --factory-startup --threads 6 --python workout/island/design/models/source/render.py -- --models workout/island/design/models
node workout/island/design/models/source/optimize-previews.mjs --models workout/island/design/models --modules /absolute/path/to/tooling
node workout/island/design/models/source/validate.mjs --models workout/island/design/models --modules /absolute/path/to/tooling
```

3. בודקים שהשורה האחרונה מציגה `PASS`, ש־`validation.json` מכיל `allPassed: true` ושכל 16 התמונות נראות תקינות. `--modules` מצביע על תיקייה המכילה `package.json` ו־`node_modules` של הכלים; יש להחליף את הנתיב בדוגמה בנתיב האמיתי.

נתוני היצירה ב־Python הם מטרים, Z מעלה. הייצוא ממיר ל־glTF עם Y מעלה, Z קדימה; העוגנים ב־`authoring.json` כבר הומרו. `asset_root` נשאר בראשית ובקנה מידה 1. הרכיבים נאפים במערכת המטרים של השורש; כדי לסובב רכיב סביב מרכז פיזי משתמשים בעוגן המתאים.

UV נוצרים באמצעות Smart Project ו־Pack Islands משותף לכל הרכיבים. המגרש באצטדיון משתמש בחומר נפרד וב־UV מלא 0–1. דחיסת Draco: רמה 7, מיקום 16 bits, נורמל 10, צבע 8; UV ברזולוציה 16 bits, ובאצטדיון 20 bits כדי לשמור על איים של קורות ותאורה דקות. חיתוכי קצה מוגבלים ל־22% מהעובי הדק ביותר כדי למנוע פאות מנוונות.

הרינדור מייבא את ה־GLB הדחוס מחדש. מצלמה אורתוגרפית, תאורת סטודיו, Cycles CPU, 24 דגימות, הסרת רעש ורינדור ביניים 512×512. תמונות PNG נמסרות ב־384×384 ובפלטה של 128 צבעים; גיליון הסקירה בגודל 768×924, באותה פלטה. אריח הדשא הקיים משמש לרינדור האצטדיון בלבד; קובצי ה־GLB עצמם נטולי טקסטורות. מקור ורישיון: [../LICENSES.md](../LICENSES.md).

בדיקות נוספות מודדות משולשים מנוונים בגאומטריה וב־UV, חפיפת פנים של איי UV לכל חומר, עוגנים, שמות, מידות פיזיות, הבדל גבולות לפני/אחרי Draco, היעדר קבצים חיצוניים, PNG ותקרות נפח. קבצים מפוענחים משמשים בזיכרון לבדיקה ואינם נמסרים ככפילות לא דחוסה. רינדור עשוי להשתנות מעט בין מערכות; טביעות הקבצים שנמסרו מתועדות ב־`validation.json`.
