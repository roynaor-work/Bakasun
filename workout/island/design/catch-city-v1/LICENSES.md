# מקורות ורישיונות · Catch City v1

כל דגמי העיר, הצבעים, דמויות הולכי הרגל ולולאת ההליכה נוצרו במיוחד עבור Bakasun באמצעות [כלי היצירה](source/build.py). הגאומטריה מקורית: לא נכללו רשתות, מרקמים, תמונות, גופנים, סמלים מסחריים או כיתוב ממקור חיצוני. תנאי השימוש ביצירה המקורית הם תנאי המאגר והרשאות בעליו; הסימון `repository-original` במניפסט מציין מקור זה, ואינו מזהה SPDX של רישיון צד שלישי.

| קבצים | מקור | רישיון / תנאי שימוש |
|---|---|---|
| `models/house-coral.glb`, `shop-mint.glb`, `apartment-sun.glb`, `office-blue.glb`, `villa-lilac.glb`, `market-peach.glb`, `workshop-teal.glb`, `civic-cream.glb` | שמונה בניינים מקוריים: גאומטריה, חזיתות וצבעי קודקודים | יצירה מקורית עבור המאגר |
| `models/traffic-light.glb`, `street-lamp.glb`, `bridge-span.glb`, `tunnel-segment.glb` | תשתיות מקוריות, לרבות חלל המנהרה ומפתח הגשר | יצירה מקורית עבור המאגר |
| `models/car-compact.glb`, `car-sedan.glb`, `car-wagon.glb`, `car-van.glb`, `car-pickup.glb` | חמישה גופי רכב אזרחיים מקוריים; גאומטריה וצבעים גנריים | יצירה מקורית עבור המאגר |
| `models/pedestrian-coral.glb`, `pedestrian-mint.glb`, `pedestrian-sun.glb` | רשתות, שיוך לעור, שיער, בגדים, פנים ולולאת הליכה מקוריים. חוזה העצמות מתואר בשורה הבאה | יצירה מקורית עבור המאגר; חוזה שלד קיים לפי מקורו |
| `skeleton.json` וחוזה העצמות המוטבע בשלושת הולכי הרגל | העתק מדויק של `skeleton` מתוך [`../motion2/soccer.json`](../motion2/soccer.json), בבסיס `43b27dc235387e3cb737aee9558cdf9d5fd5a262`. שמות, היררכיה והזזות מנוחה נשמרו; ההליכה נוצרה מחדש | מקור motion2 מצהיר `authorship.license: CC0-1.0`; [נוסח CC0](https://creativecommons.org/publicdomain/zero/1.0/legalcode). עקבת SHA-256 במניפסט |
| `models/tree-round.glb`, `tree-column.glb`, `tree-pine.glb`, `fence-picket.glb`, `fence-metal.glb`, `cone-small.glb`, `cone-tall.glb`, `road-straight.glb`, `road-crossing.glb` | צמחייה, אביזרים ואריחי כביש מקוריים | יצירה מקורית עבור המאגר |
| `preview.html`, `preview.css`, `preview.js`, `source/*`, `manifest.json`, `REPORT.md`, `LICENSES.md` | קוד ותיעוד שנכתבו עבור החבילה | יצירה מקורית עבור המאגר |
| `verification/*.png`, `verification/*.json` | צילומי מסך של ה־GLB שנמסרו, ופלטי הבדיקות | תוצרים מקוריים של החבילה; הרינדור משתמש ב־Three.js לפי MIT |

## Three.js · MIT

התצוגה כוללת עותקים מקומיים ללא שינוי של Three.js r160 והעוזרים שלו, מתוך `workout/island/vendor/` באותו קומיט בסיס. כל היבואים יחסיים ומקומיים. הודעת הרישיון המלאה צורפה ב־[`vendor/LICENSE.three`](vendor/LICENSE.three), לרבות `Copyright © 2010-2023 three.js authors` והיתר MIT. [מקור הפרויקט](https://github.com/mrdoob/three.js/tree/r160).

| קובץ | bytes | SHA-256 |
|---|---:|---|
| `vendor/three.module.js` | 670681 | `3e690ac7d180b0aadf0891bea39eec643e29e2d3e75c99b18689518665f69ba6` |
| `vendor/GLTFLoader.js` | 108527 | `1f9b02acfbf219a6ebb77f09e355500449a3ba9e6a77d87e0de72c0b9315ea4e` |
| `vendor/SkeletonUtils.js` | 8019 | `0732d130a9366dd7803e5f9b38f60cc8b54e488e1c991d99711fb1d01be3124d` |
| `vendor/BufferGeometryUtils.js` | 31918 | `3a6701d824adfe05dc28c09b6c1d64aeab9a183bc3b944d85f15f596e5c6c2b3` |
| `vendor/LICENSE.three` | 1081 | `852e0e8699169bf9f6fdc6bda3e682d078dcbc738b5d33e74df594721bff271d` |

Khronos glTF Validator, Chromium ו־Playwright משמשים לבדיקות בלבד; חבילות הכלים והדפדפן אינן כלולות במסירה. אין תלות בזמן הצפייה בשירות מקוון או בהורדת קוד מ־CDN.
