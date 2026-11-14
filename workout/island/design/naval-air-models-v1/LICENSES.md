# מקורות ורישיונות

## עבודה מקורית — CC0-1.0

שני הדגמים `plane.glb`,‏ `helicopter.glb`, הגאומטריה, צבעי הקודקודים,
האנימציות, קוד המקור תחת `source/`, תצוגת `preview.*`, התיעוד וצילומי
האימות נוצרו במיוחד עבור Bakasun במשימה זו. אין בהם גאומטריה, טקסטורות,
סמלים או עיצובים שהועתקו מנכס חיצוני. אלה כלי טיס בדיוניים.

העבודה המקורית מוקדשת לנחלת הכלל לפי **CC0 1.0 Universal**:
[הנוסח המחייב](https://creativecommons.org/publicdomain/zero/1.0/legalcode).
מותר להשתמש בה, לשנותה ולהפיצה, לרבות מסחרית, ללא דרישת ייחוס.

אין טקסטורות או תמונות משובצות בדגמים. הזכוכית מיוצגת בצבע תכלת אטום
באמצעות `COLOR_0`, יחד עם צבעי הגוף, בחומר PBR יחיד לכל דגם.

## three.js r160 — MIT

`vendor/three.module.js`,‏ `vendor/GLTFLoader.js`,‏
`vendor/BufferGeometryUtils.js` הועתקו ללא שינוי מהעותקים הקיימים
בתיקיית `workout/island/vendor/` במאגר. מקור upstream:
[three.js r160](https://github.com/mrdoob/three.js/tree/r160).

Copyright © 2010–2023 three.js authors. נוסח MIT המלא כלול
ב־[`vendor/LICENSE.three`](vendor/LICENSE.three), ויש לשמרו בהפצה.
רישיון CC0 לעבודה המקורית אינו משנה את רישיון קובצי הספרייה האלה.

לא צורף מפענח Draco או Meshopt, והדגמים אינם דחוסים. התמיכה האופציונלית
המובנית בטוען GLTFLoader הסטנדרטי אינה מופעלת בתצוגה.
