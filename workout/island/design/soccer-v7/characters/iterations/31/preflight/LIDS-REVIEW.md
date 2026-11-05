# בדיקת תוספת סגירת עפעף 31

העדפה חזותית חלשה ל־extra=.05 בשתי הזהויות שנבדקו. תוספת הסגירה מצמצמת מעט את מפתח העין ואת הלובן העליון, במיוחד ב־P02, בלי להסתיר את הקשתית. ב־P04 השינוי מתון יותר. לא ראיתי ב־16 התמונות עפעף שנמס לתוך העין, פינה שנקרעת או הבעה עייפה מובהקת. זהו רווח קטן, ללא ציון8 אוטומטי וללא קידום נכסים.

המועמד משווה CC0 eye-closure extra=.05 מול0, על Face27+crown29, פה.40, מקדם צבע Eyes/EyesCornea=.88, Skin normalScale=.5, Cloth18/Eye19/HairTexture20/Sock23, front-straight ו־projected normals. Crown flyaways=0. אין שינוי תמונות/טקסטורות/תאורה או מתאם חומרים ב־RAM.

| דמות | aperture בסיס, מ״מ | aperture .05, מ״מ | שינוי | הסטת optical center Y, מ״מ | קוטר קשתית, מ״מ |
|---|---|---|---|---|---|
| player-02 | 7.684 | 7.090 | -7.73% | -0.202 | 12.936 |
| player-04 | 7.629 | 7.035 | -7.79% | -0.296 | 12.936 |

מדידות שתי העיניים מפורטות ב־[LIDS-CONTROLS.json](LIDS-CONTROLS.json). ‏apertureAlignmentPass נשארtrue בשני המסלולים ובכל ארבע העיניים; קוטר הקשתית נשאר12.936מ״מ. מרכז האופטיקה מתאים עצמו מעט למפתח החדש, ללא שינוי ברדיוס הגלובוס או הקשתית.

| דמות/מבט/גודל | extra0 | extra.05 |
|---|---|---|
| player-02/face-front/390x844 | [בסיס](lids-baseline/player-02-pbr-face-front-390x844.png) | [.05](lids05/player-02-pbr-face-front-390x844.png) |
| player-02/face-front/844x390 | [בסיס](lids-baseline/player-02-pbr-face-front-844x390.png) | [.05](lids05/player-02-pbr-face-front-844x390.png) |
| player-02/face-three-quarter/390x844 | [בסיס](lids-baseline/player-02-pbr-face-three-quarter-390x844.png) | [.05](lids05/player-02-pbr-face-three-quarter-390x844.png) |
| player-02/face-three-quarter/844x390 | [בסיס](lids-baseline/player-02-pbr-face-three-quarter-844x390.png) | [.05](lids05/player-02-pbr-face-three-quarter-844x390.png) |
| player-04/face-front/390x844 | [בסיס](lids-baseline/player-04-pbr-face-front-390x844.png) | [.05](lids05/player-04-pbr-face-front-390x844.png) |
| player-04/face-front/844x390 | [בסיס](lids-baseline/player-04-pbr-face-front-844x390.png) | [.05](lids05/player-04-pbr-face-front-844x390.png) |
| player-04/face-three-quarter/390x844 | [בסיס](lids-baseline/player-04-pbr-face-three-quarter-390x844.png) | [.05](lids05/player-04-pbr-face-three-quarter-390x844.png) |
| player-04/face-three-quarter/844x390 | [בסיס](lids-baseline/player-04-pbr-face-three-quarter-844x390.png) | [.05](lids05/player-04-pbr-face-three-quarter-844x390.png) |

16 צילומי PBR מלאי־טלפון: frozen86, ‏front orbit=.13, ‏three-quarter=-.7, ‏zoom1, ‏DPR1.5, screenshot CSS, ‏idle seek(.15)=.27שניות. שמונה זוגות המצלמות זהים בדיוק לאחר המתנה ל־RAF/resize; נבדק גם שהמצלמה לא זזה בזמן screenshot. אין כאן חריגת sidecar כמו בפריים היחיד של mouth30.

ששת קובצי הטקסטורה זהים בייט־לבייט לבסיס31. ארבעת GLB המועמד נמצאים ב־source/character-candidates31-lids/; near ‏P02=939,340B ו־P04=1,001,828B, far ‏501,188B ו־561,020B, כולם מתחת1.5MB. שמות קבצים, SHA ומשולשים ב־LIDS-CONTROLS.json וב־capture.json של כל תיקייה.

41/41 קובצי live24 נשמרו. errors=[] ו־remoteRequests=[] בשתי הריצות, וכל Chromium נסגר. זו בדיקה סטטית של שתי זהויות בלבד; היא אינה מאמתת מצמוץ/מבט קיצוני/כל הסגל או ביצועי טלפון. הבחירה הסופית ושילוב32 נשארים אצל Root.
