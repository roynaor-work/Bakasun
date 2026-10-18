# G4d · מחקר טניס לפני הבנייה

בסיס: PR 139, ‏main `28eaec4`. המחקר בוצע ב־17.10.2026. אין העתקת שמות, נכסים או עיצוב מהמשחקים.

| משחק ומקור | מה נבדק | מה נכנס לאי ולמה |
| --- | --- | --- |
| [Mario Tennis Aces — Nintendo](https://www.nintendo.com/en-gb/games/oms/mario-tennis-aces/gameplay/?a=gameplay) | מדריך היצרן מבחין בין flat, slice, lob; מצב פשוט משאיר מכות בסיסיות | שני כפתורי מכה עם מסלולים ותנועות שונים; אין צורך בכוחות מיוחדים |
| [Tennis Clash — מדריך היצרן](https://tennisclash.zendesk.com/hc/en-gb/articles/12709842502929-How-do-I-hit-the-ball-with-different-intensities-and-styles) | מכה מהירה מול lob גבוה ועמוק; מחוות משפיעות על המכה | גרירה מכפתור המכה מכוונת בנפרד מהג׳ויסטיק, גם בהגבהה |
| [Virtua Tennis Challenge — ביקורת Pocket Gamer](https://www.pocketgamer.com/virtua-tennis-challenge/review-3305/) | הביקורת מעדיפה ג׳ויסטיק וירטואלי על מחוות לא ברורות ומתארת עלייה לרשת | ג׳ויסטיק גלוי במנוחה, צף בזמן מגע; תנועה ידנית רציפה קדימה, אחורה ולצדדים |
| [Virtua Tennis Challenge — תיאור SEGA בחנות](https://apps.apple.com/us/app/virtua-tennis-challenge/id517271093) | הפרדת lob/slice/topspin ותנועה טקטית | שני סוגי המכות המבוקשים; הכפתור השלישי נשאר הגשה בלבד |
| [TopSpin 2K25 — דיווח מפתחים 2K](https://newsroom.2k.com/news/topspin-2k25-game-mode-details-revealed) | מיקום, תזמון ובחירת מכה; תרגול הגשות והגבהות | זריקה ולחיצה שנייה עם מד צבעוני, ומחזור הכנה–מגע–המשך בעצמות הדמות |
| [TopSpin 2K25 — סרטון המפתחים](https://www.youtube.com/watch?v=9qGfNczHWPQ) / [Mario Tennis Aces — סרטון הגשות](https://www.youtube.com/watch?v=d8k61sUxryY) | חיפוש ופתיחת סרטוני משחק; כלי הקריאה החזיר מעטפת YouTube בלבד או שגיאה | אין טענה לצפייה בפריימים. החלטות האנימציה הן מימוש מקורי הנשען על המדריכים, ותיבדקנה בפריימים של האי |
| [ITF — קווים, חבטות וניקוד](https://www.itftennis.com/en/about-us/organisation/tennis-glossary/) | סעיפים Baseline, Deuce court, Serve, Forehand, Backhand, Deuce, Advantage | עמידה מאחורי קו הבסיס, הגשה באלכסון והחלפת צד לפי זוגיות הנקודות; שוויון דורש שתי נקודות הפרש |
| [Wimbledon — SlamTracker](https://www.wimbledon.com/en_GB/scores/slamtracker/1502) / [ATP — Learn the Game](https://www.atptour.com/en/news/tennis-explained-learn-the-game) | תוצאת החיפוש של Wimbledon מציגה 40–AD; העמוד הדינמי לא חשף את לוח השידור, ATP נחסם ב־403. אין מקור מאומת ללוח טלוויזיה בעברית | הבחירה לאי: שתי שורות בצבעי השחקנים; ב־deuce ‏40 לכל שחקן, וב־advantage ‏AD רק ליד המוביל ותא ריק ליריב. זו התאמת UI לבקשה, ולא טענה שכל שידור מציג תא ריק |

העמידה, התנועה וההגשה כבר קיימות חלקית ב־G4c. הצילום `verification/g4d/before-baseline.webp` מאמת עמידה נכונה אך גם ג׳ויסטיק מוסתר, תוויות כפתורים, קהל דמוי יתדות ועצים גאומטריים. דגמי Meshy הקיימים נבדקו לפי נתוני GLB לפני בחירתם: כל אדם/עץ מכיל כ־5,000 משולשים. שכפול מלא לעשרות צופים חורג מהתקציב; נדרש LOD בזיכרון ללא שינוי קובצי המקור.
