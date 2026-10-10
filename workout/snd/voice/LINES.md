# משפטים להקלטה

231 משפטים וחלקים קבועים. מקור הקטלוג: workout/js/voice-lines.js.

מקליטים בטלפון ב־https://roynaor-work.github.io/Bakasun/workout/voice-rec/ (אחרי מיזוג). Chrome באנדרואיד או Safari באייפון, דרך HTTPS. אין קישור מהאפליקציה.

1. מאשרים מיקרופון, לוחצים הקלטה וקוראים רק את הטקסט. לוחצים עצירה.
2. מאזינים, מקליטים שוב אם צריך, ועוברים למשפט הבא. אפשר לדלג ולהוריד גם אוסף חלקי.
3. בסיום מורידים ZIP. מחלצים את קובצי WAV אל workout/snd/voice/ ושומרים את השמות. שינוי ההקלטות מחייב עדכון VOICE_VERSION ותגי המטמון של workout/index.html וייבוא speech.js ב־app.js.

ההקלטות נשמרות ב־IndexedDB במכשיר בלבד, גם אחרי רענון; אין העלאה. כדאי להוריד ZIP לפני ניקוי נתוני הדפדפן. ההורדה כוללת רק הקלטות שנעשו.

דברו בחום ובקצב טבעי, בלי לקרוא את המזהה. לחלקים קצרים: בלי שתיקה לפני/אחרי. השקט בקצוות נחתך אוטומטית. כ־12–16 דקות דיבור נטו, וכ־25–40 דקות כולל כפתורים, האזנה ותיקונים.

פירוק: עוד + מספר + שניות; מספר + כל הכבוד; משוב + שם תוכנית/תרגיל או רמה + סיומת; האימון + מספר סודר/מספר + שלך השבוע; מספר + ימים ברצף. מספרי 21–99 משתמשים בעשרות ובאחדות עם ו׳ (23 = number-20 + number-and-3). 100 מוקלט פעם אחת. מספרים גדולים יותר ושמות חדשים משתמשים בקול הקיים, בלי לשמור מידע אישי בקטלוג. מספרים בתוך הסבר קבוע הם חלק מההסבר.

הנגן טוען ומפענח מראש, ומתזמן חלקי WAV רצופים בשעון Web Audio ללא רווח נוסף. כל חלקי המשפט מוכנים לפני תחילת הניגון, גם אם נאמר לפני סיום הטעינה הראשונית. חלק חסר או פגום חוזר לקול הקיים. האפקטים הקיימים ללא מילים (צחוק, צפצוף, קהל) אינם דורשים הקלטת משפט. ההקלטות הישנות של חגיגות נשארות גיבוי.

| מזהה | הטקסט המדויק | איפה נאמר בקוד | שם קובץ צפוי |
|---|---|---|---|
| `exercise-jog` | ריצה קלה במקום. רצים במקום, לאט ונעים. הידיים זזות כמו בריצה. זה חימום, לא מרוץ. | workout/js/say.js: SAY[jog]; workout/js/app.js: wireHelp / sayText | `exercise-jog.wav` |
| `exercise-arm-circles` | סיבובי ידיים. פותחים ידיים לצדדים. עושים עיגולים גדולים קדימה. באמצע מחליפים, ומסובבים אחורה. הכתפיים רגועות. | workout/js/say.js: SAY[arm-circles]; workout/js/app.js: wireHelp / sayText | `exercise-arm-circles.wav` |
| `exercise-ankle-hops` | קפיצות קפיץ. רגליים צמודות. קופצים קטן ומהר, כמו קפיץ. נוחתים על קצות האצבעות. | workout/js/say.js: SAY[ankle-hops]; workout/js/app.js: wireHelp / sayText | `exercise-ankle-hops.wav` |
| `exercise-jumping-jacks` | פתח-סגור. עומדים ישר, ידיים למטה. קופצים ופותחים: רגליים לצדדים, ידיים למעלה. קופצים וסוגרים. נוחתים בשקט על קצות האצבעות. | workout/js/say.js: SAY[jumping-jacks]; workout/js/app.js: wireHelp / sayText | `exercise-jumping-jacks.wav` |
| `exercise-squat-jumps` | קפיצות סקוואט. יורדים כמו לשבת על כיסא. קופצים הכי גבוה שאפשר. נוחתים בשקט, ושוב יורדים. הברכיים מסתכלות קדימה, לא פנימה. | workout/js/say.js: SAY[squat-jumps]; workout/js/app.js: wireHelp / sayText | `exercise-squat-jumps.wav` |
| `exercise-high-knees` | ברכיים גבוהות. רצים במקום. מרימים ברכיים עד הבטן. הידיים עוזרות, כמו בריצה מהירה. | workout/js/say.js: SAY[high-knees]; workout/js/app.js: wireHelp / sayText | `exercise-high-knees.wav` |
| `exercise-tuck-jumps` | קפיצות ברכיים לחזה. קופצים גבוה. באוויר מושכים את הברכיים לחזה. נוחתים רך. מותר לנוח שנייה בין קפיצה לקפיצה. | workout/js/say.js: SAY[tuck-jumps]; workout/js/app.js: wireHelp / sayText | `exercise-tuck-jumps.wav` |
| `exercise-side-hops` | קפיצות לצדדים. מדמיינים קו על הרצפה. קופצים מעליו מצד לצד, עם שתי הרגליים. מהר וקל, הברכיים קצת כפופות. | workout/js/say.js: SAY[side-hops]; workout/js/app.js: wireHelp / sayText | `exercise-side-hops.wav` |
| `exercise-jump-rope` | קפיצה בחבל דמיוני. מעמידים פנים שיש חבל ביד. מסובבים את הידיים וקופצים קטן ומהר. אין חבל, אז שום דבר לא נשבר. | workout/js/say.js: SAY[jump-rope]; workout/js/app.js: wireHelp / sayText | `exercise-jump-rope.wav` |
| `exercise-burpees` | ברפי. יורדים, ידיים לרצפה. רגליים אחורה, הגוף ישר. רגליים חזרה, וקופצים למעלה עם הידיים. זה קשה, אז לאט ויפה. | workout/js/say.js: SAY[burpees]; workout/js/app.js: wireHelp / sayText | `exercise-burpees.wav` |
| `exercise-star-jumps` | קפיצות כוכב. מתכופפים קצת. קופצים ופותחים ידיים ורגליים, כמו כוכב. נוחתים ומיד שוב. קופצים למעלה, לא קדימה. | workout/js/say.js: SAY[star-jumps]; workout/js/app.js: wireHelp / sayText | `exercise-star-jumps.wav` |
| `exercise-broad-jump` | קפיצה לרוחק. עומדים בקצה השטיח. מתכופפים, ידיים אחורה. קופצים קדימה הכי רחוק שאפשר. נוחתים על שתי הרגליים ועוצרים. בודקים שאין שולחן בדרך. | workout/js/say.js: SAY[broad-jump]; workout/js/app.js: wireHelp / sayText | `exercise-broad-jump.wav` |
| `exercise-single-leg-hops` | קפיצות על רגל אחת. עומדים על רגל אחת. קופצים במקום. אחר כך מחליפים רגל. מתנדנדים? קופצים נמוך יותר. | workout/js/say.js: SAY[single-leg-hops]; workout/js/app.js: wireHelp / sayText | `exercise-single-leg-hops.wav` |
| `exercise-step-jumps` | קפיצה על מדרגה. עומדים מול מדרגה או שרפרף נמוך שלא זז. קופצים עליו עם שתי הרגליים. יורדים בהליכה, לא בקפיצה. לא על הספה ולא על כיסא עם גלגלים. | workout/js/say.js: SAY[step-jumps]; workout/js/app.js: wireHelp / sayText | `exercise-step-jumps.wav` |
| `exercise-hall-sprint` | ריצה מהירה במסדרון. עומדים בקצה המסדרון. רצים הכי מהר עד הקצה השני. מאטים לפני הקיר, וחוזרים בהליכה. גרביים מחליקות? רצים יחפים. | workout/js/say.js: SAY[hall-sprint]; workout/js/app.js: wireHelp / sayText | `exercise-hall-sprint.wav` |
| `exercise-run-jump` | ריצה וקפיצה לרוחק. רצים שלושה צעדים. קופצים מרגל אחת קדימה. נוחתים על שתי הרגליים ועוצרים. קופצים לכיוון הסלון, לא לכיוון קיר. | workout/js/say.js: SAY[run-jump]; workout/js/app.js: wireHelp / sayText | `exercise-run-jump.wav` |
| `exercise-run-vertical` | ריצה וקפיצה לגובה. רצים שלושה צעדים. קופצים למעלה ומותחים יד, כאילו נוגעים בתקרה. נוחתים רך. כל פעם מנסים לגעת יותר גבוה. | workout/js/say.js: SAY[run-vertical]; workout/js/app.js: wireHelp / sayText | `exercise-run-vertical.wav` |
| `exercise-bounding` | צעדי ענק במסדרון. רצים לאורך המסדרון בצעדים ענקיים. כל צעד הוא קפיצה. סופרים כמה צעדים היו. פחות צעדים, יותר טוב. | workout/js/say.js: SAY[bounding]; workout/js/app.js: wireHelp / sayText | `exercise-bounding.wav` |
| `exercise-shuttle-run` | ריצה מקיר לקיר. נוגעים ביד בקיר ליד השירותים. רצים מהר לקיר ליד המרפסת ונוגעים. מסתובבים ורצים חזרה. מאטים לפני הקיר, ונוגעים רק ביד. | workout/js/say.js: SAY[shuttle-run]; workout/js/app.js: wireHelp / sayText | `exercise-shuttle-run.wav` |
| `exercise-reaction-sprint` | ריצה בצפצוף. עומדים מוכנים ליד הקיר. לוחצים על הכפתור ומחכים. כשיש צפצוף, רצים מהר לקיר השני. לא רצים לפני הצפצוף. | workout/js/say.js: SAY[reaction-sprint]; workout/js/app.js: wireHelp / sayText | `exercise-reaction-sprint.wav` |
| `exercise-side-shuffle` | צעדי צד מקיר לקיר. מתכופפים קצת, נמוך. זזים הצידה בצעדים קטנים ומהירים. הרגליים לא נוגעות אחת בשנייה. נוגעים בקיר וחוזרים. | workout/js/say.js: SAY[side-shuffle]; workout/js/app.js: wireHelp / sayText | `exercise-side-shuffle.wav` |
| `exercise-carioca` | צעדי צד עם הצלבה. זזים הצידה לאורך המסדרון. רגל אחת עוברת לפני השנייה, ואז מאחוריה. בהתחלה לאט, אחר כך מהר. | workout/js/say.js: SAY[carioca]; workout/js/app.js: wireHelp / sayText | `exercise-carioca.wav` |
| `exercise-skipping` | דילוגים במסדרון. מדלגים לאורך המסדרון. בכל צעד מרימים ברך וקופצים קטן. היד עולה עם הברך של הצד השני. | workout/js/say.js: SAY[skipping]; workout/js/app.js: wireHelp / sayText | `exercise-skipping.wav` |
| `exercise-floor-wall-run` | רצפה וקיר. ליד קיר אחד, יורדים ונוגעים ברצפה. רצים לקיר השני וקופצים לגעת בו גבוה. חוזרים ועושים שוב. | workout/js/say.js: SAY[floor-wall-run]; workout/js/app.js: wireHelp / sayText | `exercise-floor-wall-run.wav` |
| `exercise-back-run` | ריצה לאחור. הגב לכיוון הריצה. מסתכלים מעל הכתף. צעדים קטנים על קצות האצבעות. בהתחלה לאט. | workout/js/say.js: SAY[back-run]; workout/js/app.js: wireHelp / sayText | `exercise-back-run.wav` |
| `exercise-crunches` | כפיפות בטן. שוכבים על הגב, ברכיים כפופות. ידיים ליד הראש, לא מושכים את הראש. מרימים קצת את הכתפיים, ויורדים לאט. מסתכלים לתקרה. | workout/js/say.js: SAY[crunches]; workout/js/app.js: wireHelp / sayText | `exercise-crunches.wav` |
| `exercise-bicycle` | אופניים. שוכבים על הגב, כתפיים קצת למעלה. מרפק נוגע בברך של הצד השני. מחליפים צד, כמו לרכוב על אופניים. לאט ויפה, לא מהר. | workout/js/say.js: SAY[bicycle]; workout/js/app.js: wireHelp / sayText | `exercise-bicycle.wav` |
| `exercise-leg-raises` | הרמות רגליים. שוכבים על הגב, ידיים ליד הגוף. מרימים רגליים ישרות למעלה. מורידים לאט, בלי לגעת ברצפה. הגב נשאר צמוד לרצפה. | workout/js/say.js: SAY[leg-raises]; workout/js/app.js: wireHelp / sayText | `exercise-leg-raises.wav` |
| `exercise-v-ups` | סגירת ספר. שוכבים, ידיים מעל הראש. מרימים ידיים ורגליים ביחד ונוגעים באצבעות הרגליים, כמו לסגור ספר. קשה? מכופפים קצת את הברכיים. | workout/js/say.js: SAY[v-ups]; workout/js/app.js: wireHelp / sayText | `exercise-v-ups.wav` |
| `exercise-plank` | קרש. ידיים על הרצפה, רגליים ישרות. הגוף ישר כמו קרש. מחזיקים ונושמים. הטוסיק לא עולה ולא יורד. | workout/js/say.js: SAY[plank]; workout/js/app.js: wireHelp / sayText | `exercise-plank.wav` |
| `exercise-side-plank` | קרש על הצד. שוכבים על הצד, מרפק על הרצפה. מרימים את הגוף, ישר כמו קרש. אחר כך מחליפים צד. קשה? שמים ברך על הרצפה. | workout/js/say.js: SAY[side-plank]; workout/js/app.js: wireHelp / sayText | `exercise-side-plank.wav` |
| `exercise-hollow-hold` | סירה. שוכבים על הגב, ידיים מעל הראש. מרימים קצת כתפיים ורגליים. הגוף כמו סירה. מחזיקים. הגב נשאר צמוד לרצפה. | workout/js/say.js: SAY[hollow-hold]; workout/js/app.js: wireHelp / sayText | `exercise-hollow-hold.wav` |
| `exercise-flutter-kicks` | מספריים. שוכבים על הגב, רגליים קצת למעלה. מזיזים רגליים למעלה ולמטה, קטן ומהר. הרגליים לא נוגעות ברצפה. | workout/js/say.js: SAY[flutter-kicks]; workout/js/app.js: wireHelp / sayText | `exercise-flutter-kicks.wav` |
| `exercise-russian-twists` | סיבובים בישיבה. יושבים ונשענים קצת אחורה, רגליים באוויר. ידיים ביחד. מסובבים את הגוף לצד אחד ולצד השני. מסובבים את הבטן, לא רק את הידיים. | workout/js/say.js: SAY[russian-twists]; workout/js/app.js: wireHelp / sayText | `exercise-russian-twists.wav` |
| `exercise-superman` | סופרמן. שוכבים על הבטן, ידיים קדימה. מרימים ידיים ורגליים ביחד, כמו סופרמן שעף. מחזיקים שנייה ויורדים. מסתכלים לרצפה. | workout/js/say.js: SAY[superman]; workout/js/app.js: wireHelp / sayText | `exercise-superman.wav` |
| `exercise-plank-jacks` | פתח-סגור על הידיים. ידיים על הרצפה, הגוף ישר כמו קרש. קופצים עם הרגליים: פותחים וסוגרים. הטוסיק לא עולה למעלה. | workout/js/say.js: SAY[plank-jacks]; workout/js/app.js: wireHelp / sayText | `exercise-plank-jacks.wav` |
| `exercise-crab-kicks` | בעיטות סרטן. יושבים, ידיים מאחור על הרצפה. מרימים את הטוסיק, כמו סרטן. בועטים עם רגל אחת, ואז עם השנייה. הטוסיק נשאר למעלה. | workout/js/say.js: SAY[crab-kicks]; workout/js/app.js: wireHelp / sayText | `exercise-crab-kicks.wav` |
| `exercise-mountain-climbers` | מטפסי הרים. ידיים על הרצפה, הגוף ישר. מביאים ברך לחזה, ואז את השנייה. מהר, כמו לרוץ על הרצפה. הטוסיק נשאר למטה. | workout/js/say.js: SAY[mountain-climbers]; workout/js/app.js: wireHelp / sayText | `exercise-mountain-climbers.wav` |
| `exercise-squats` | סקוואט. רגליים קצת פתוחות. יורדים כמו לשבת על כיסא, ידיים קדימה. קמים חזק. הגב ישר. | workout/js/say.js: SAY[squats]; workout/js/app.js: wireHelp / sayText | `exercise-squats.wav` |
| `exercise-lunges` | ירידה לברך. עושים צעד גדול קדימה. יורדים עד שהברך של הרגל האחורית כמעט נוגעת ברצפה. קמים ומחליפים רגל. | workout/js/say.js: SAY[lunges]; workout/js/app.js: wireHelp / sayText | `exercise-lunges.wav` |
| `exercise-calf-raises` | הרמות עקבים. עומדים ישר, אפשר להחזיק בקיר. עולים על קצות האצבעות, הכי גבוה. יורדים לאט. | workout/js/say.js: SAY[calf-raises]; workout/js/app.js: wireHelp / sayText | `exercise-calf-raises.wav` |
| `exercise-glute-bridge` | גשר ישבן. שוכבים על הגב, ברכיים כפופות. מרימים את הטוסיק למעלה, כמו גשר. מחזיקים שנייה ויורדים לאט. | workout/js/say.js: SAY[glute-bridge]; workout/js/app.js: wireHelp / sayText | `exercise-glute-bridge.wav` |
| `exercise-wall-sit` | כיסא נעלם. הגב צמוד לקיר. יורדים כאילו יושבים על כיסא, אבל אין כיסא. מחזיקים. שורף ברגליים? זה השריר מתחזק. | workout/js/say.js: SAY[wall-sit]; workout/js/app.js: wireHelp / sayText | `exercise-wall-sit.wav` |
| `exercise-push-ups` | שכיבות סמיכה. ידיים על הרצפה, הגוף ישר כמו קרש. יורדים עד שהחזה קרוב לרצפה. דוחפים חזק למעלה. | workout/js/say.js: SAY[push-ups]; workout/js/app.js: wireHelp / sayText | `exercise-push-ups.wav` |
| `exercise-knee-push-ups` | שכיבות סמיכה על הברכיים. ברכיים על הרצפה, ידיים מתחת לכתפיים. יורדים לאט ודוחפים למעלה. כשזה כבר קל, עוברים לרגילות. | workout/js/say.js: SAY[knee-push-ups]; workout/js/app.js: wireHelp / sayText | `exercise-knee-push-ups.wav` |
| `exercise-chair-dips` | דחיפות על כיסא. יושבים על קצה כיסא שלא זז, ידיים על הקצה. מורידים את הטוסיק מהכיסא. יורדים לאט, ודוחפים למעלה. המרפקים הולכים אחורה. | workout/js/say.js: SAY[chair-dips]; workout/js/app.js: wireHelp / sayText | `exercise-chair-dips.wav` |
| `exercise-pike-push-ups` | שכיבות סמיכה באוהל. ידיים ורגליים על הרצפה, הטוסיק למעלה, כמו אוהל. מכופפים ידיים, והראש יורד לרצפה. דוחפים חזרה למעלה. | workout/js/say.js: SAY[pike-push-ups]; workout/js/app.js: wireHelp / sayText | `exercise-pike-push-ups.wav` |
| `exercise-quad-stretch` | מתיחה: עקב לטוסיק. עומדים על רגל אחת. תופסים את הרגל השנייה ומקרבים את העקב לטוסיק. מחזיקים, ואז מחליפים. אפשר להחזיק בקיר. | workout/js/say.js: SAY[quad-stretch]; workout/js/app.js: wireHelp / sayText | `exercise-quad-stretch.wav` |
| `exercise-hamstring-stretch` | מתיחה: ידיים לרצפה. רגליים ישרות וצמודות. מתכופפים לאט ומורידים ידיים לרצפה. יורדים עד שמרגישים מתיחה, ונשארים. לא קופצים. | workout/js/say.js: SAY[hamstring-stretch]; workout/js/app.js: wireHelp / sayText | `exercise-hamstring-stretch.wav` |
| `exercise-calf-stretch` | מתיחה: דוחפים את הקיר. ידיים על הקיר. רגל אחת אחורה, ישרה, העקב על הרצפה. נשענים קדימה ומחזיקים. אחר כך מחליפים רגל. | workout/js/say.js: SAY[calf-stretch]; workout/js/app.js: wireHelp / sayText | `exercise-calf-stretch.wav` |
| `name-jog` | ריצה קלה במקום | workout/js/exercises.js: jog.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-jog.wav` |
| `name-arm-circles` | סיבובי ידיים | workout/js/exercises.js: arm-circles.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-arm-circles.wav` |
| `name-ankle-hops` | קפיצות קפיץ | workout/js/exercises.js: ankle-hops.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-ankle-hops.wav` |
| `name-jumping-jacks` | פתח-סגור | workout/js/exercises.js: jumping-jacks.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-jumping-jacks.wav` |
| `name-squat-jumps` | קפיצות סקוואט | workout/js/exercises.js: squat-jumps.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-squat-jumps.wav` |
| `name-high-knees` | ברכיים גבוהות | workout/js/exercises.js: high-knees.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-high-knees.wav` |
| `name-tuck-jumps` | קפיצות ברכיים לחזה | workout/js/exercises.js: tuck-jumps.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-tuck-jumps.wav` |
| `name-side-hops` | קפיצות לצדדים | workout/js/exercises.js: side-hops.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-side-hops.wav` |
| `name-jump-rope` | קפיצה בחבל דמיוני | workout/js/exercises.js: jump-rope.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-jump-rope.wav` |
| `name-burpees` | ברפי | workout/js/exercises.js: burpees.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-burpees.wav` |
| `name-star-jumps` | קפיצות כוכב | workout/js/exercises.js: star-jumps.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-star-jumps.wav` |
| `name-broad-jump` | קפיצה לרוחק | workout/js/exercises.js: broad-jump.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-broad-jump.wav` |
| `name-single-leg-hops` | קפיצות על רגל אחת (כל רגל) | workout/js/exercises.js: single-leg-hops.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-single-leg-hops.wav` |
| `name-step-jumps` | קפיצה על מדרגה | workout/js/exercises.js: step-jumps.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-step-jumps.wav` |
| `name-hall-sprint` | ריצה מהירה במסדרון | workout/js/exercises.js: hall-sprint.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-hall-sprint.wav` |
| `name-run-jump` | ריצה וקפיצה לרוחק | workout/js/exercises.js: run-jump.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-run-jump.wav` |
| `name-run-vertical` | ריצה וקפיצה לגובה | workout/js/exercises.js: run-vertical.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-run-vertical.wav` |
| `name-bounding` | צעדי ענק במסדרון | workout/js/exercises.js: bounding.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-bounding.wav` |
| `name-shuttle-run` | ריצה מקיר לקיר | workout/js/exercises.js: shuttle-run.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-shuttle-run.wav` |
| `name-reaction-sprint` | ריצה בצפצוף | workout/js/exercises.js: reaction-sprint.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-reaction-sprint.wav` |
| `name-side-shuffle` | צעדי צד מקיר לקיר | workout/js/exercises.js: side-shuffle.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-side-shuffle.wav` |
| `name-carioca` | צעדי צד עם הצלבה | workout/js/exercises.js: carioca.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-carioca.wav` |
| `name-skipping` | דילוגים במסדרון | workout/js/exercises.js: skipping.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-skipping.wav` |
| `name-floor-wall-run` | רצפה וקיר | workout/js/exercises.js: floor-wall-run.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-floor-wall-run.wav` |
| `name-back-run` | ריצה לאחור | workout/js/exercises.js: back-run.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-back-run.wav` |
| `name-crunches` | כפיפות בטן | workout/js/exercises.js: crunches.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-crunches.wav` |
| `name-bicycle` | אופניים | workout/js/exercises.js: bicycle.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-bicycle.wav` |
| `name-leg-raises` | הרמות רגליים | workout/js/exercises.js: leg-raises.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-leg-raises.wav` |
| `name-v-ups` | סגירת ספר | workout/js/exercises.js: v-ups.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-v-ups.wav` |
| `name-plank` | קרש | workout/js/exercises.js: plank.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-plank.wav` |
| `name-side-plank` | קרש על הצד (כל צד) | workout/js/exercises.js: side-plank.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-side-plank.wav` |
| `name-hollow-hold` | סירה | workout/js/exercises.js: hollow-hold.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-hollow-hold.wav` |
| `name-flutter-kicks` | מספריים | workout/js/exercises.js: flutter-kicks.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-flutter-kicks.wav` |
| `name-russian-twists` | סיבובים בישיבה | workout/js/exercises.js: russian-twists.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-russian-twists.wav` |
| `name-superman` | סופרמן | workout/js/exercises.js: superman.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-superman.wav` |
| `name-plank-jacks` | פתח-סגור על הידיים | workout/js/exercises.js: plank-jacks.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-plank-jacks.wav` |
| `name-crab-kicks` | בעיטות סרטן | workout/js/exercises.js: crab-kicks.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-crab-kicks.wav` |
| `name-mountain-climbers` | מטפסי הרים | workout/js/exercises.js: mountain-climbers.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-mountain-climbers.wav` |
| `name-squats` | סקוואט | workout/js/exercises.js: squats.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-squats.wav` |
| `name-lunges` | ירידה לברך (כל רגל) | workout/js/exercises.js: lunges.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-lunges.wav` |
| `name-calf-raises` | הרמות עקבים | workout/js/exercises.js: calf-raises.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-calf-raises.wav` |
| `name-glute-bridge` | גשר ישבן | workout/js/exercises.js: glute-bridge.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-glute-bridge.wav` |
| `name-wall-sit` | כיסא נעלם | workout/js/exercises.js: wall-sit.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-wall-sit.wav` |
| `name-push-ups` | שכיבות סמיכה | workout/js/exercises.js: push-ups.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-push-ups.wav` |
| `name-knee-push-ups` | שכיבות סמיכה על הברכיים | workout/js/exercises.js: knee-push-ups.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-knee-push-ups.wav` |
| `name-chair-dips` | דחיפות על כיסא | workout/js/exercises.js: chair-dips.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-chair-dips.wav` |
| `name-pike-push-ups` | שכיבות סמיכה באוהל | workout/js/exercises.js: pike-push-ups.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-pike-push-ups.wav` |
| `name-quad-stretch` | מתיחה: עקב לטוסיק (כל רגל) | workout/js/exercises.js: quad-stretch.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-quad-stretch.wav` |
| `name-hamstring-stretch` | מתיחה: ידיים לרצפה | workout/js/exercises.js: hamstring-stretch.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-hamstring-stretch.wav` |
| `name-calf-stretch` | מתיחה: דוחפים את הקיר (כל רגל) | workout/js/exercises.js: calf-stretch.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-calf-stretch.wav` |
| `ui-costTwo` | המשחק הזה עולה שתי מתנות, כי הוא ארוך יותר. | workout/js/say-ui.js: SAY_UI.costTwo; workout/js/app.js | `ui-costTwo.wav` |
| `ui-howWas` | סיימת! איך היה האימון? קל, בדיוק, או קשה? | workout/js/say-ui.js: SAY_UI.howWas; workout/js/app.js | `ui-howWas.wav` |
| `ui-test` | היי! אני אסביר לך איך עושים כל תרגיל. לוחצים על הכפתור "איך עושים את זה?". | workout/js/say-ui.js: SAY_UI.test; workout/js/app.js | `ui-test.wav` |
| `intro-race` | היום אתה ראשון! | workout/js/say-ui.js: SAY_UI.intro.race; workout/js/app.js: introPhase | `intro-race.wav` |
| `intro-hurdles` | עובר כל מכשול! | workout/js/say-ui.js: SAY_UI.intro.hurdles; workout/js/app.js: introPhase | `intro-hurdles.wav` |
| `intro-dunk` | סלאם דאנק! | workout/js/say-ui.js: SAY_UI.intro.dunk; workout/js/app.js: introPhase | `intro-dunk.wav` |
| `intro-dribble` | כדרור, עוברים את השומר, וקליעה! | workout/js/say-ui.js: SAY_UI.intro.dribble; workout/js/app.js: introPhase | `intro-dribble.wav` |
| `intro-podium` | מקום ראשון! | workout/js/say-ui.js: SAY_UI.intro.podium; workout/js/app.js: introPhase | `intro-podium.wav` |
| `adjust-top` | אתה כבר ברמה הכי גבוהה. אלוף אמיתי! | workout/js/say-ui.js: SAY_UI.adjust.top; workout/js/app.js: adjustDifficulty | `adjust-top.wav` |
| `adjust-downSwaps` | היה קשה? בפעם הבאה חוזרים לתרגילים הרגילים. | workout/js/say-ui.js: SAY_UI.adjust.downSwaps; workout/js/app.js: adjustDifficulty | `adjust-downSwaps.wav` |
| `adjust-downBoost` | היה קשה? הורדתי קצת. בפעם הבאה יהיה נוח יותר. | workout/js/say-ui.js: SAY_UI.adjust.downBoost; workout/js/app.js: adjustDifficulty | `adjust-downBoost.wav` |
| `adjust-bottom` | כל הכבוד שסיימת! זו הרמה הכי קלה, ובפעם הבאה יהיה לך יותר קל כי אתה מתחזק. | workout/js/say-ui.js: SAY_UI.adjust.bottom; workout/js/app.js: adjustDifficulty | `adjust-bottom.wav` |
| `adjust-ok` | מעולה, בדיוק ברמה שלך. | workout/js/say-ui.js: SAY_UI.adjust.ok; workout/js/app.js: adjustDifficulty | `adjust-ok.wav` |
| `level-easy` | קל | workout/js/say-ui.js: SAY_UI.levels.easy; SAY_UI.adjust.level / downLevel | `level-easy.wav` |
| `level-normal` | רגיל | workout/js/say-ui.js: SAY_UI.levels.normal; SAY_UI.adjust.level / downLevel | `level-normal.wav` |
| `level-hard` | חזק | workout/js/say-ui.js: SAY_UI.levels.hard; SAY_UI.adjust.level / downLevel | `level-hard.wav` |
| `level-pro` | אלוף | workout/js/say-ui.js: SAY_UI.levels.pro; SAY_UI.adjust.level / downLevel | `level-pro.wav` |
| `program-jump-a` | קפיצות א׳ | workout/js/say-ui.js: SAY_UI.programs[jump-a]; workout/js/app.js: adjustDifficulty | `program-jump-a.wav` |
| `program-jump-b` | קפיצות ב׳ | workout/js/say-ui.js: SAY_UI.programs[jump-b]; workout/js/app.js: adjustDifficulty | `program-jump-b.wav` |
| `program-jump-c` | קפיצות ג׳ | workout/js/say-ui.js: SAY_UI.programs[jump-c]; workout/js/app.js: adjustDifficulty | `program-jump-c.wav` |
| `program-speed` | מהירות וזריזות | workout/js/say-ui.js: SAY_UI.programs[speed]; workout/js/app.js: adjustDifficulty | `program-speed.wav` |
| `program-hall` | קפיצות במסדרון | workout/js/say-ui.js: SAY_UI.programs[hall]; workout/js/app.js: adjustDifficulty | `program-hall.wav` |
| `program-legs` | כוח רגליים | workout/js/say-ui.js: SAY_UI.programs[legs]; workout/js/app.js: adjustDifficulty | `program-legs.wav` |
| `program-upper` | כוח עליון ובטן | workout/js/say-ui.js: SAY_UI.programs[upper]; workout/js/app.js: adjustDifficulty | `program-upper.wav` |
| `program-core` | אימון בטן | workout/js/say-ui.js: SAY_UI.programs[core]; workout/js/app.js: adjustDifficulty | `program-core.wav` |
| `program-full` | גוף מלא | workout/js/say-ui.js: SAY_UI.programs[full]; workout/js/app.js: adjustDifficulty | `program-full.wav` |
| `program-quick` | אימון שבע דקות | workout/js/say-ui.js: SAY_UI.programs[quick]; workout/js/app.js: adjustDifficulty | `program-quick.wav` |
| `ordinal-1` | הראשון | workout/js/say-ui.js: SAY_UI.ordinals / perseverance | `ordinal-1.wav` |
| `ordinal-2` | השני | workout/js/say-ui.js: SAY_UI.ordinals / perseverance | `ordinal-2.wav` |
| `ordinal-3` | השלישי | workout/js/say-ui.js: SAY_UI.ordinals / perseverance | `ordinal-3.wav` |
| `ordinal-4` | הרביעי | workout/js/say-ui.js: SAY_UI.ordinals / perseverance | `ordinal-4.wav` |
| `ordinal-5` | החמישי | workout/js/say-ui.js: SAY_UI.ordinals / perseverance | `ordinal-5.wav` |
| `ordinal-6` | השישי | workout/js/say-ui.js: SAY_UI.ordinals / perseverance | `ordinal-6.wav` |
| `ordinal-7` | השביעי | workout/js/say-ui.js: SAY_UI.ordinals / perseverance | `ordinal-7.wav` |
| `number-0` | אפס | workout/js/count.js: numWord / timeCue; workout/js/app.js: wireReps / minuteScreen; SAY_UI.perseverance | `number-0.wav` |
| `number-1` | אחת | workout/js/count.js: numWord / timeCue; workout/js/app.js: wireReps / minuteScreen; SAY_UI.perseverance | `number-1.wav` |
| `number-2` | שתיים | workout/js/count.js: numWord / timeCue; workout/js/app.js: wireReps / minuteScreen; SAY_UI.perseverance | `number-2.wav` |
| `number-3` | שלוש | workout/js/count.js: numWord / timeCue; workout/js/app.js: wireReps / minuteScreen; SAY_UI.perseverance | `number-3.wav` |
| `number-4` | ארבע | workout/js/count.js: numWord / timeCue; workout/js/app.js: wireReps / minuteScreen; SAY_UI.perseverance | `number-4.wav` |
| `number-5` | חמש | workout/js/count.js: numWord / timeCue; workout/js/app.js: wireReps / minuteScreen; SAY_UI.perseverance | `number-5.wav` |
| `number-6` | שש | workout/js/count.js: numWord / timeCue; workout/js/app.js: wireReps / minuteScreen; SAY_UI.perseverance | `number-6.wav` |
| `number-7` | שבע | workout/js/count.js: numWord / timeCue; workout/js/app.js: wireReps / minuteScreen; SAY_UI.perseverance | `number-7.wav` |
| `number-8` | שמונה | workout/js/count.js: numWord / timeCue; workout/js/app.js: wireReps / minuteScreen; SAY_UI.perseverance | `number-8.wav` |
| `number-9` | תשע | workout/js/count.js: numWord / timeCue; workout/js/app.js: wireReps / minuteScreen; SAY_UI.perseverance | `number-9.wav` |
| `number-10` | עשר | workout/js/count.js: numWord / timeCue; workout/js/app.js: wireReps / minuteScreen; SAY_UI.perseverance | `number-10.wav` |
| `number-11` | אחת עשרה | workout/js/count.js: numWord / timeCue; workout/js/app.js: wireReps / minuteScreen; SAY_UI.perseverance | `number-11.wav` |
| `number-12` | שתים עשרה | workout/js/count.js: numWord / timeCue; workout/js/app.js: wireReps / minuteScreen; SAY_UI.perseverance | `number-12.wav` |
| `number-13` | שלוש עשרה | workout/js/count.js: numWord / timeCue; workout/js/app.js: wireReps / minuteScreen; SAY_UI.perseverance | `number-13.wav` |
| `number-14` | ארבע עשרה | workout/js/count.js: numWord / timeCue; workout/js/app.js: wireReps / minuteScreen; SAY_UI.perseverance | `number-14.wav` |
| `number-15` | חמש עשרה | workout/js/count.js: numWord / timeCue; workout/js/app.js: wireReps / minuteScreen; SAY_UI.perseverance | `number-15.wav` |
| `number-16` | שש עשרה | workout/js/count.js: numWord / timeCue; workout/js/app.js: wireReps / minuteScreen; SAY_UI.perseverance | `number-16.wav` |
| `number-17` | שבע עשרה | workout/js/count.js: numWord / timeCue; workout/js/app.js: wireReps / minuteScreen; SAY_UI.perseverance | `number-17.wav` |
| `number-18` | שמונה עשרה | workout/js/count.js: numWord / timeCue; workout/js/app.js: wireReps / minuteScreen; SAY_UI.perseverance | `number-18.wav` |
| `number-19` | תשע עשרה | workout/js/count.js: numWord / timeCue; workout/js/app.js: wireReps / minuteScreen; SAY_UI.perseverance | `number-19.wav` |
| `number-20` | עשרים | workout/js/count.js: numWord / timeCue; workout/js/app.js: wireReps / minuteScreen; SAY_UI.perseverance | `number-20.wav` |
| `number-30` | שלושים | workout/js/count.js: numWord / timeCue; workout/js/app.js: wireReps / minuteScreen; SAY_UI.perseverance | `number-30.wav` |
| `number-40` | ארבעים | workout/js/count.js: numWord / timeCue; workout/js/app.js: wireReps / minuteScreen; SAY_UI.perseverance | `number-40.wav` |
| `number-50` | חמישים | workout/js/count.js: numWord / timeCue; workout/js/app.js: wireReps / minuteScreen; SAY_UI.perseverance | `number-50.wav` |
| `number-60` | שישים | workout/js/count.js: numWord / timeCue; workout/js/app.js: wireReps / minuteScreen; SAY_UI.perseverance | `number-60.wav` |
| `number-70` | שבעים | workout/js/count.js: numWord / timeCue; workout/js/app.js: wireReps / minuteScreen; SAY_UI.perseverance | `number-70.wav` |
| `number-80` | שמונים | workout/js/count.js: numWord / timeCue; workout/js/app.js: wireReps / minuteScreen; SAY_UI.perseverance | `number-80.wav` |
| `number-90` | תשעים | workout/js/count.js: numWord / timeCue; workout/js/app.js: wireReps / minuteScreen; SAY_UI.perseverance | `number-90.wav` |
| `number-and-1` | ואחת | workout/js/count.js: numWord (אחדות אחרי עשרות) | `number-and-1.wav` |
| `number-and-2` | ושתיים | workout/js/count.js: numWord (אחדות אחרי עשרות) | `number-and-2.wav` |
| `number-and-3` | ושלוש | workout/js/count.js: numWord (אחדות אחרי עשרות) | `number-and-3.wav` |
| `number-and-4` | וארבע | workout/js/count.js: numWord (אחדות אחרי עשרות) | `number-and-4.wav` |
| `number-and-5` | וחמש | workout/js/count.js: numWord (אחדות אחרי עשרות) | `number-and-5.wav` |
| `number-and-6` | ושש | workout/js/count.js: numWord (אחדות אחרי עשרות) | `number-and-6.wav` |
| `number-and-7` | ושבע | workout/js/count.js: numWord (אחדות אחרי עשרות) | `number-and-7.wav` |
| `number-and-8` | ושמונה | workout/js/count.js: numWord (אחדות אחרי עשרות) | `number-and-8.wav` |
| `number-and-9` | ותשע | workout/js/count.js: numWord (אחדות אחרי עשרות) | `number-and-9.wav` |
| `number-100` | מאה | workout/js/say-ui.js: SAY_UI.perseverance (100 אימונים) | `number-100.wav` |
| `time-more` | עוד | workout/js/count.js: timeCue; workout/js/app.js: wireTimer | `time-more.wav` |
| `time-seconds` | שניות | workout/js/count.js: timeCue; workout/js/app.js: wireTimer | `time-seconds.wav` |
| `start` | מתחילים! | workout/js/count.js: timeCue; workout/js/app.js: wireTimer | `start.wav` |
| `finished` | סיימת! | workout/js/count.js: timeCue; workout/js/app.js: wireTimer | `finished.wav` |
| `encourage` | כל הכבוד! | workout/js/app.js: wireReps / wireTimer | `encourage.wav` |
| `minute-end` | הדקה הסתיימה. כל תנועה נחשבת. | workout/js/app.js: minuteScreen | `minute-end.wav` |
| `minute-start` | מתחילים. בקצב שלך. | workout/js/app.js: minuteScreen | `minute-start.wav` |
| `companion-upgraded` | הדמות שלך השתפרה! גדלים יחד, בקצב שלך. | workout/js/app.js: donePhase; workout/js/companion.js: companionCard | `companion-upgraded.wav` |
| `thanks` | תודה, רשמתי. | workout/js/app.js: askFeedback (משוב ללא תוכנית) | `thanks.wav` |
| `program-free` | אימון חופשי | workout/js/app.js: free / adjustDifficulty | `program-free.wav` |
| `boost-before` | היה קל? מעכשיו | workout/js/say-ui.js: SAY_UI.adjust.boost; workout/js/app.js: adjustDifficulty | `boost-before.wav` |
| `boost-after` | עם עוד קצת חזרות וזמן. | workout/js/say-ui.js: SAY_UI.adjust.boost; workout/js/app.js: adjustDifficulty | `boost-after.wav` |
| `swaps-before` | היה קל? ב | workout/js/say-ui.js: SAY_UI.adjust.swaps; workout/js/app.js: adjustDifficulty | `swaps-before.wav` |
| `swaps-after` | נכנסים תרגילים קשים יותר. | workout/js/say-ui.js: SAY_UI.adjust.swaps; workout/js/app.js: adjustDifficulty | `swaps-after.wav` |
| `level-before` | וואו. עלית לרמה | workout/js/say-ui.js: SAY_UI.adjust.level; workout/js/app.js: adjustDifficulty | `level-before.wav` |
| `level-after` | בכל האימונים! | workout/js/say-ui.js: SAY_UI.adjust.level; workout/js/app.js: adjustDifficulty | `level-after.wav` |
| `down-before` | הורדתי לרמה | workout/js/say-ui.js: SAY_UI.adjust.downLevel; workout/js/app.js: adjustDifficulty | `down-before.wav` |
| `down-after` | לאט לאט בונים כוח. | workout/js/say-ui.js: SAY_UI.adjust.downLevel; workout/js/app.js: adjustDifficulty | `down-after.wav` |
| `week-before` | כל הכבוד! זה האימון | workout/js/say-ui.js: SAY_UI.perseverance; workout/js/app.js: askFeedback | `week-before.wav` |
| `week-after` | שלך השבוע. | workout/js/say-ui.js: SAY_UI.perseverance; workout/js/app.js: askFeedback | `week-after.wav` |
| `number-label` | מספר | workout/js/say-ui.js: SAY_UI.perseverance; workout/js/app.js: askFeedback | `number-label.wav` |
| `streak-after` | ימים ברצף! | workout/js/say-ui.js: SAY_UI.perseverance; workout/js/app.js: askFeedback | `streak-after.wav` |
| `first-workout` | האימון הראשון שלך. התחלה מעולה! | workout/js/say-ui.js: SAY_UI.perseverance; workout/js/app.js: askFeedback | `first-workout.wav` |
| `milestone-before` | וזה האימון מספר | workout/js/say-ui.js: SAY_UI.perseverance; workout/js/app.js: askFeedback | `milestone-before.wav` |
| `milestone-after` | שלך. וואו! | workout/js/say-ui.js: SAY_UI.perseverance; workout/js/app.js: askFeedback | `milestone-after.wav` |
| `cost-two-short` | המשחק הזה עולה שתי מתנות. | workout/js/app.js: arcade (גיבוי ל-SAY_UI.costTwo) | `cost-two-short.wav` |
| `celebration-goal` | Gooooooooooool! | workout/js/games/celebrate.js / celebrate3d.js: say; הקלטה קיימת workout/snd/goal.mp4 | `celebration-goal.wav` |
| `celebration-dunk` | בום! | workout/js/games/celebrate.js / celebrate3d.js: say; הקלטה קיימת workout/snd/dunk.mp4 | `celebration-dunk.wav` |
| `celebration-three` | סל! | workout/js/games/celebrate.js / celebrate3d.js: say; הקלטה קיימת workout/snd/three.mp4 | `celebration-three.wav` |
| `celebration-sprint` | מקום ראשון! | workout/js/games/celebrate.js / celebrate3d.js: say; הקלטה קיימת workout/snd/sprint.mp4 | `celebration-sprint.wav` |
| `camera-1` | אחת | workout/js/camera-screen.mjs: cameraCoach / camera-demo.mjs | `camera-1.wav` |
| `camera-2` | שתיים | workout/js/camera-screen.mjs: cameraCoach / camera-demo.mjs | `camera-2.wav` |
| `camera-3` | שלוש | workout/js/camera-screen.mjs: cameraCoach / camera-demo.mjs | `camera-3.wav` |
| `camera-intro-squats` | יורדים כאילו יושבים, ואז עומדים שוב. | workout/js/camera-screen.mjs: cameraCoach / camera-demo.mjs | `camera-intro-squats.wav` |
| `camera-intro-jumping-jacks` | פותחים רגליים וידיים, ואז סוגרים. | workout/js/camera-screen.mjs: cameraCoach / camera-demo.mjs | `camera-intro-jumping-jacks.wav` |
| `camera-intro-high-knees` | מרימים ברך, מורידים, ומחליפים רגל. | workout/js/camera-screen.mjs: cameraCoach / camera-demo.mjs | `camera-intro-high-knees.wav` |
| `camera-intro-lunges` | יורדים לברך, עולים, ומחליפים רגל. | workout/js/camera-screen.mjs: cameraCoach / camera-demo.mjs | `camera-intro-lunges.wav` |
| `camera-intro-push-ups` | הגוף ישר. מכופפים ידיים ודוחפים למעלה. | workout/js/camera-screen.mjs: cameraCoach / camera-demo.mjs | `camera-intro-push-ups.wav` |
| `camera-intro-knee-push-ups` | ברכיים ברצפה. מכופפים ידיים ודוחפים למעלה. | workout/js/camera-screen.mjs: cameraCoach / camera-demo.mjs | `camera-intro-knee-push-ups.wav` |
| `camera-intro-glute-bridge` | שוכבים ומרימים טוסיק, ואז מורידים לאט. | workout/js/camera-screen.mjs: cameraCoach / camera-demo.mjs | `camera-intro-glute-bridge.wav` |
| `camera-partial` | ננסה תנועה שלמה, כמו הדמות. | workout/js/camera-screen.mjs: cameraCoach / camera-demo.mjs | `camera-partial.wav` |
| `camera-knees` | הברכיים פונות לאן שהאצבעות פונות. | workout/js/camera-screen.mjs: cameraCoach / camera-demo.mjs | `camera-knees.wav` |
| `camera-fast` | נעשה לאט, כמו הדמות. | workout/js/camera-screen.mjs: cameraCoach / camera-demo.mjs | `camera-fast.wav` |
| `camera-tracking` | נחזור למקום שהמצלמה רואה. | workout/js/camera-screen.mjs: cameraCoach / camera-demo.mjs | `camera-tracking.wav` |
| `camera-timeout` | חוזרים להתחלה, ואז מנסים שוב. | workout/js/camera-screen.mjs: cameraCoach / camera-demo.mjs | `camera-timeout.wav` |
| `camera-alternate` | עכשיו עושים עם הרגל השנייה. | workout/js/camera-screen.mjs: cameraCoach / camera-demo.mjs | `camera-alternate.wav` |
| `camera-alignment` | הגוף ישר, כמו הדמות. | workout/js/camera-screen.mjs: cameraCoach / camera-demo.mjs | `camera-alignment.wav` |
| `camera-legs` | לא רואה את הרגליים | workout/js/camera-screen.mjs: cameraCoach / camera-demo.mjs | `camera-legs.wav` |
| `camera-hands` | לא רואה את הידיים | workout/js/camera-screen.mjs: cameraCoach / camera-demo.mjs | `camera-hands.wav` |
| `camera-head` | לא רואה את הראש | workout/js/camera-screen.mjs: cameraCoach / camera-demo.mjs | `camera-head.wav` |
| `camera-far` | תתקרב קצת | workout/js/camera-screen.mjs: cameraCoach / camera-demo.mjs | `camera-far.wav` |
| `camera-close` | תתרחק קצת | workout/js/camera-screen.mjs: cameraCoach / camera-demo.mjs | `camera-close.wav` |
| `camera-side` | תעמוד עם הצד למצלמה | workout/js/camera-screen.mjs: cameraCoach / camera-demo.mjs | `camera-side.wav` |
| `camera-tilt` | אבא, ניישר את הטלפון | workout/js/camera-screen.mjs: cameraCoach / camera-demo.mjs | `camera-tilt.wav` |
| `camera-body` | נחכה שהמצלמה תראה אותך | workout/js/camera-screen.mjs: cameraCoach / camera-demo.mjs | `camera-body.wav` |
| `camera-world` | רגע, המצלמה מחפשת אותך | workout/js/camera-screen.mjs: cameraCoach / camera-demo.mjs | `camera-world.wav` |
| `camera-waiting` | מחכים בתנוחת ההתחלה | workout/js/camera-screen.mjs: cameraCoach / camera-demo.mjs | `camera-waiting.wav` |
| `camera-armed` | מוכן, בקצב שלך | workout/js/camera-screen.mjs: cameraCoach / camera-demo.mjs | `camera-armed.wav` |
| `camera-moving` | יפה, ממשיכים בתנועה | workout/js/camera-screen.mjs: cameraCoach / camera-demo.mjs | `camera-moving.wav` |
