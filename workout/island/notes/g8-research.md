# G8 — מחקר מעטפת

נבדק ב־17.10.2026. המחקר עוסק במעטפת המשותפת לכדורגל, טניס, קרב ימי, חייזרים וכיבוי. אין העתקת נכסים, שמות או עיצוב ממשחק אחר.

| משחק ומקור | מה נבדק | מה נכנס לאי ולמה |
|---|---|---|
| כל החמישה — [MDN requestFullscreen](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen) | בקשה אסינכרונית, transient activation, סירוב, fullscreenchange | הבקשה מתוך click מהימן של כפתור הכניסה, על documentElement לפני יצירת המשחק; לא מתוך פקד או שינוי כיוון. סירוב/היעדר API משאירים את שכבת המשחק הקיימת. |
| כל החמישה — [MDN User activation](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/User_activation) | במגע activation מתקבל בשחרור, לא בנגיעה הראשונית | כפתורי כניסה והתקנה שומרים click מקורי. יתר פעולות הממשק שומרות משוב pointerdown והגנת התאימות של G7. |
| כל החמישה — [MDN ScreenOrientation.lock](https://developer.mozilla.org/en-US/docs/Web/API/ScreenOrientation/lock) | תמיכה מוגבלת, תלות בסביבת מסך מלא ואפשרות סירוב | ניסיון נעילה יחיד אחרי כניסה למסך מלא; אין ניסיון חוזר בסיבוב או בהמשך. הנעילה אינה תנאי להתחלת המשחק. |
| כל החמישה — [web.dev Fullscreen experiences](https://web.dev/articles/fullscreen) | כניסה במחווה, מסך בית, documentElement ומשחקים לרוחב | שומרים מסך מלא ברמת הדף בין משחקים. שני סמלי הכנה במשך שתי שניות, עם סימולציה ופקדים מושהים. הודעת היציאה של הדפדפן אינה בשליטת הדף; משך היעלמותה בפועל דורש מכשיר פיזי. המאמר ותיק, ולכן פרטי iOS נבדקו גם במקורות העדכניים להלן. |
| כל החמישה — [MDN manifest display](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/display), [web.dev manifest](https://web.dev/articles/add-manifest) | fullscreen ב־manifest שונה מ־Fullscreen API; יש fallback למצב תצוגה נתמך | display=fullscreen, orientation=landscape; מזהים גם standalone ו־navigator.standalone ומדלגים על API במצב מותקן. משתמשים באייקוני SVG/PNG המקומיים הקיימים. אין תלות חדשה. |
| Android Chrome, כל החמישה — [web.dev installation prompt](https://web.dev/learn/pwa/installation-prompt) | beforeinstallprompt אינו מובטח; prompt מתוך פעולת משתמש, אירוע לשימוש יחיד | כפתור אייקון לפני המשחק ובהגדרות שומר אירוע זמין ומציג אותו בלחיצה. כשאינו זמין מוצג הסבר תפריט; אין הבטחה שהדפדפן יציג התקנה אוטומטית. |
| iOS Safari, כל החמישה — [Apple: Turn a website into an app](https://support.apple.com/en-in/guide/iphone/iphea86e5236/ios), [WebKit Safari 26](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/) | שתף → הוספה למסך הבית ופתיחה כיישום רשת; אין beforeinstallprompt מקביל | איור מקומי קטן והנחיה בעברית במסך שלפני המשחק ובהגדרות. מטא־תגים ומצב מותקן; בלי להניח תמיכה ב־requestFullscreen או בנעילת הכיוון באייפון. |

הדמיית iPhone בענן בודקת בחירת ההסבר ו־API חסר בלבד; היא אינה Safari, התקנת iOS או צילום ממכשיר. פתיחה ממסך הבית מדלגת על קריאת ה־Fullscreen API ולכן אינה יוצרת את הודעת ה־API של Chrome; מראה מערכת ההפעלה בפועל לא נבדק.
