# Soccer kicks v2

14 קליפי בעיטות ומסירות מקוריים, CC0-1.0, שלד קנוני18, 30Hz, GLB ללא דחיסה.

- [תצוגת תלת־ממד](preview.html): בחירת קליפ, ניגון, האטה, אירועים, מסלול רגל וארבע זוויות מבט.
- [דוח מסירה ו־14 גיליונות פריימים](REPORT.md).
- [קטלוג קליפים ואירועים](runtime/catalog.json), [פוזות מקור מלאות](runtime/motions.json).
- [API דגימה וגשר C1 עם תיקון רצפה](runtime/player.mjs).
- [דוח כלי QA המקורי](verification/qa/report.html), [מעברים](verification/transitions.json).
- [רישיונות ומקורות](LICENSES.md), [מלאי חתום](verification/inventory.json).

לצפייה מקומית, משורש המאגר:

~~~sh
python3 -m http.server 8765
~~~

פתחו [את התצוגה המקומית](http://localhost:8765/workout/island/design/soccer-kicks-v2/preview.html). אין צורך בהתקנת חבילות, רשת חיצונית או Draco. לצילום אוטומטי נדרשים Node24+, Python/Pillow, Playwright ו־Chromium; נתיבי הסביבה ניתנים להחלפה ב־PLAYWRIGHT_MODULE ו־CHROMIUM_PATH.

יחידות: מטרים ושניות, +Y למעלה, +Z קדימה, +X שמאל אנטומי, קווטרניונים xyzw מקומיים להורה. Root קבוע, hips בכל פריים הוא מיקום Hips מקומי ל־Root. back לפני contact; רדיוס הכדור .11מ׳, ball.samples במרחב השחקן המקומי. ב־running_kick יש להוסיף referenceRootMotion פעם אחת בלבד כדי להציג את התנועה בעולם. הגאומטריה הפיקטיבית וייחוסי idle/run הם CC0 קיימים, שהועתקו ללא שינוי מ־soccer-header-v1.

makeBridge({from,to,fromTime,toTime,duration}) מקבל דוגמי פוזה וקושר פוזה ומהירות בשני הקצוות. מחזיקים את זמן היעד קבוע בזמן הגשר ואז ממשיכים מ־resumeTargetTime. ברירת המחדל מפעילה תיקון רצפה מקומי; grounding:false מיועד להשוואה למעבר Hermite הגולמי. אירועים, מסלול הכדור ותרגום השחקן מטופלים בנפרד בידי הצרכן. אין בחבילה שינוי לקוד המשחק הקיים.
