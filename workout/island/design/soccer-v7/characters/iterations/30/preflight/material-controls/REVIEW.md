בקרת החומרים נשארה בזיכרון בלבד, על גאומטריית mouth30 הקפואה עם mouthCompression=.25 ו־Face27. נוצרו 16 צילומי PBR בפורטרט 390×844, ללא שינוי מקור, GLB, מרקם, תאורה או roughness. לא בוצע קידום לחבילה.

העדפתי החזותית החלשה היא eyes088 לבדו: הוא מרסן מעט את לובן העין, במיוחד ב־P02, בלי להעלים את הקשתית או ההחזר הפיזיקלי בקרנית. השינוי ב־P04 עדין יותר. הוא גם מכהה מעט את צבע הקשתית; לא נוספו צביעה או נצנוץ לתמונה.

Skin normalScale=1.25 מוסיף מעט מאוד פירוט שניתן להבחין בו בגודל הטלפון הזה. לא ראיתי ב־16 הפריימים רעש חדש או שבירה בולטת, אך גם לא רווח ברור שמצדיק בחירה בו. המצב המשולב מקבל את עיקר הרווח מהעיניים. כתמי האלבדו, גוון העור והצללות האף/השפתיים נשארים; בקרת חומרים זו אינה פותרת צורה או חלל פה ואינה מבססת ציון 8.

| מצב | P02 חזית | P02 שלושה רבעים | P04 חזית | P04 שלושה רבעים |
|---|---|---|---|---|
| baseline | [390×844](player-02-baseline-face-front-390x844.png) | [390×844](player-02-baseline-face-three-quarter-390x844.png) | [390×844](player-04-baseline-face-front-390x844.png) | [390×844](player-04-baseline-face-three-quarter-390x844.png) |
| eyes088 | [390×844](player-02-eyes088-face-front-390x844.png) | [390×844](player-02-eyes088-face-three-quarter-390x844.png) | [390×844](player-04-eyes088-face-front-390x844.png) | [390×844](player-04-eyes088-face-three-quarter-390x844.png) |
| skin125 | [390×844](player-02-skin125-face-front-390x844.png) | [390×844](player-02-skin125-face-three-quarter-390x844.png) | [390×844](player-04-skin125-face-front-390x844.png) | [390×844](player-04-skin125-face-three-quarter-390x844.png) |
| combined | [390×844](player-02-combined-face-front-390x844.png) | [390×844](player-02-combined-face-three-quarter-390x844.png) | [390×844](player-04-combined-face-front-390x844.png) | [390×844](player-04-combined-face-three-quarter-390x844.png) |

baseline: Eyes/EyesCornea color=[1,1,1], Skin normalScale=[.5,-.5]. eyes088: color=[.88,.88,.88]. skin125: Skin normalScale=[1.25,-1.25]. combined מפעיל את שתי הפעולות. הסימן השלילי ב־Y נשמר מכללי glTF.

כל ארבעת המצבים חולקים מצלמה זהה בדיוק בכל זוג דמות/מבט: front orbit=.13, three-quarter orbit=-.7, zoom=1, FOV25, אותו frozen86 ואותו seek(.15), שהוא .27 שניות ב־idle. DPR1.5 וצילום CSS. תמונות/מפות, roughness, metalness, clearcoat, specular ותאורת הסצנה נבדקו ולא השתנו בין המצבים.

41/41 קובצי live24 נותרו זהים ל־/tmp/soccer-v7-live24-before-face25.json; ארבעת המודלים הקפואים נבדקו מול המניפסט ו־SHA שלהם נשמר. errors=[] ו־remoteRequests=[]. Chromium נסגר. זו אינה מדידת ביצועים בטלפון.

Runtime SHA256: `86f55eca7b39311011174c7aefd9ee76bc27d573945ffac3de9c7ad58aa128d0`.
Capture script SHA256: `36dc79545d0839abb275f4aec2a2a38d52ec9ba0ad73ab3672f48da77be87bec` (`/tmp/soccer-v7-capture30-materials.mjs`).

ערכי החומרים, hash לכל PNG ולכל GLB, מצלמות, תאורה, פריים וראיות live24 נמצאים ב־[capture.json](capture.json). השוואת סקלר הפה והסייג למטא־דאטת מצלמה אחת נמצאים ב־[MOUTH-REVIEW.md](../MOUTH-REVIEW.md) וב־[MOUTH-CONTROLS.json](../MOUTH-CONTROLS.json). הסייג מהשוואת הסקלר אינו מופיע בבקרת החומרים: כל מצלמות המצבים כאן נרשמו אחרי שה־viewport התייצב ונמצאו שוות בדיוק.

לא נלכד נוף לבקרת החומרים. בקשת Root הייתה לבדוק קודם את הפורטרט ולהרחיב רק אם השינוי שימושי. לא הושווה קצב פריימים, מצמוץ או תנועה בפריימים אלה.
