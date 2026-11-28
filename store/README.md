# עוטף חנויות: העיר שלי

עוטף Capacitor (אנדרואיד ו-iOS) למשחק `workout/island`. נפרד לגמרי מהאתר החי: שום קובץ מחוץ ל-`store/` לא משתנה. אופליין ראשון: אין `server.url`, האפליקציה לא טוענת דבר מהרשת, וכל הנכסים בתוך החבילה.

## מה בתיקייה

| נתיב | תפקיד |
|---|---|
| `scripts/build-web.mjs` | מרכיב את `www/`: מריץ `.github/scripts/stage-pages.py`, לוקח ממנו רק את `workout/island`, מקבע דגלי URL, מכבה את ההורדה לפי משחק, הופך קישורים חיצוניים לטקסט |
| `flag-policy.json` | ההחלטות לכל דגל והשינויים בעותק. עורכים כאן |
| `FLAGS.md` | טבלת הדגלים שהוסרו ומה נשאר ולמה (נוצר אוטומטית) |
| `scripts/license-scan.mjs` | סריקת רישוי של `www/`: `LICENSES-REPORT.md`, `credits/` |
| `scripts/screenshots.mjs`, `scripts/make-graphics.mjs` | צילומי מסך אמיתיים, אייקונים וגרפיקת פיצ'ר ל-`listing/` |
| `privacy/` | טיוטות מדיניות פרטיות, עברית ואנגלית |
| `STORE-ASSETS.md` | חומרי חנות, גדלים נדרשים, מצב |
| `android/`, `ios/` | פרויקטי המקור (Capacitor 8.6.3). אין בהם מפתחות, חתימה, `google-services` או מזהי חשבון |
| `capacitor.config.json` | `appId` זמני `com.example.mycity`: להחליף לפני הגשה (ראו להלן) |

`www/`, `node_modules/` וקבצי חתימה לא נכנסים ל-git (`store/.gitignore`).

## בנייה מקומית

```
cd store
npm install
npm run build:web          # אפשר --slim: רק מה שרשימת האופליין של האי מונה (כ-111MB)
node scripts/license-scan.mjs
npx cap sync
cd android && ./gradlew assembleDebug
```

פלט: `android/app/build/outputs/apk/debug/app-debug.apk`. נדרשים Node 22, JDK 21 ו-Android SDK (`ANDROID_HOME`, פלטפורמה 36).

## משימות לרועי (שדות שנשארו ריקים בכוונה)

### 1. החלטת שם חבילה

1. קישור: `store/capacitor.config.json`
2. צעדים: 1) להחליט מזהה בסגנון `il.co.<שם>.mycity` (לא ניתן לשנות אחרי פרסום). 2) להחליף את `appId` בקובץ. 3) להחליף `applicationId` ו-`namespace` ב-`store/android/app/build.gradle` ושם החבילה בתיקיית `store/android/app/src/main/java/`. 4) להחליף `PRODUCT_BUNDLE_IDENTIFIER` ב-`store/ios/App/App.xcodeproj/project.pbxproj`.
3. תוצאה רצויה: `npx cap sync` עובר, והבנייה מפיקה APK עם השם החדש.

### 2. חשבון Google Play

1. קישור: https://play.google.com/console/signup
2. צעדים: 1) לפתוח חשבון (25 דולר חד פעמי). 2) ליצור אפליקציה חדשה, קטגוריה משחקים, קהל יעד ילדים. 3) למלא Data safety: "לא נאסף מידע". 4) להזין כתובת מדיניות הפרטיות. 5) חשבון אישי חדש: להפעיל בדיקה סגורה עם 12 בודקים ל-14 ימים (בדוק את הכלל העדכני בקונסולה).
3. תוצאה רצויה: אפליקציה בטיוטה עם כל הטפסים ירוקים.

### 3. מפתח חתימה לאנדרואיד

1. קישור: https://developer.android.com/studio/publish/app-signing
2. צעדים: 1) ליצור מאגר מפתחות במחשב של רועי (`keytool -genkeypair -v -keystore mycity.jks -alias mycity -keyalg RSA -keysize 2048 -validity 10000`). 2) לשמור גיבוי בדרייב הפרטי, לא בריפו. 3) לכתוב `store/android/keystore.properties` מקומי (ב-gitignore) עם `storeFile`, `storePassword`, `keyAlias`, `keyPassword`. 4) להפעיל Play App Signing בקונסולה. 5) לבקש מ-Claude לחבר את `signingConfigs` ל-`build.gradle`.
3. תוצאה רצויה: `./gradlew bundleRelease` מפיק `app-release.aab` חתום.

### 4. חשבון Apple ומחשב Mac

1. קישור: https://developer.apple.com/programs/enroll/
2. צעדים: 1) להירשם (99 דולר לשנה). 2) על Mac: `npm install`, `npm run build:web`, `npx cap sync ios`, `npx cap open ios`. 3) ב-Xcode: Signing and Capabilities, לבחור Team ולהזין Bundle Identifier. 4) Product, Archive, Distribute App.
3. תוצאה רצויה: בנייה ב-TestFlight.

### 5. מדיניות פרטיות ציבורית

1. קישור: `store/privacy/privacy-he.md` ו-`privacy-en.md`
2. צעדים: 1) לקרוא ולמלא את השדות עם `___`. 2) לתת לעורך דין לעבור. 3) לפרסם בכתובת קבועה (למשל עמוד ב-Pages). 4) להדביק את הכתובת בשני החנויות.
3. תוצאה רצויה: כתובת שנפתחת בלי התחברות.

### 6. מבחן על מכשיר אמיתי (לפני הגשה)

1. צעדים: 1) להתקין את ה-APK על טלפון (`adb install app-debug.apk`). 2) לשחק בכל 13 המשחקים, לסובב מסך, לנתק רשת ולפתוח שוב. 3) לבדוק קול עברי להקראה.
2. תוצאה רצויה: הכול עובד בלי רשת. לדווח על כל משחק שנכשל.
