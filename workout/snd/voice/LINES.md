# משפטים להקלטה

202 משפטים וחלקים קבועים. מקור הקטלוג: workout/js/voice-lines.js.

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
| `exercise-plank-jacks` | פְּתַח סְגֹר בִּסְמִיכָה. עֲמִידַת סְמִיכָה, יָדַיִם מִתַּחַת לַכְּתֵפַיִם, הַגּוּף יָשָׁר. קוֹפְצִים עִם הָרַגְלַיִם לִפְתֹּחַ, וְקוֹפְצִים חֲזָרָה לִסְגֹּר. שִׂימוּ לֵב: הַיַּשְׁבָן לֹא עוֹלֶה, הַגּוּף נִשְׁאָר קֶרֶשׁ. | workout/js/say.js: SAY[plank-jacks]; workout/js/app.js: wireHelp / sayText | `exercise-plank-jacks.wav` |
| `exercise-crab-kicks` | סַרְטָן מִתְאַמֵּן. יוֹשְׁבִים, יָדַיִם מֵאָחוֹר עַל הָרִצְפָּה. מְרִימִים אֶת הַיַּשְׁבָן, עֲמִידַת סַרְטָן. בּוֹעֲטִים רֶגֶל יְשָׁרָה קָדִימָה וּלְמַעְלָה, וּמַחְלִיפִים רֶגֶל. שִׂימוּ לֵב: הַיְּרֵכַיִם נִשְׁאָרוֹת גָּבוֹהַּ כָּל הַזְּמַן. | workout/js/say.js: SAY[crab-kicks]; workout/js/app.js: wireHelp / sayText | `exercise-crab-kicks.wav` |
| `exercise-chair-dips` | יָד אֲחוֹרִית עַל כִּסֵּא. יוֹשְׁבִים עַל קְצֵה כִּסֵּא יַצִּיב, הַיָּדַיִם אוֹחֲזוֹת בַּקָּצֶה. מַחְלִיקִים אֶת הַיַּשְׁבָן קָדִימָה הַחוּצָה. מְכוֹפְפִים מַרְפְּקִים אָחוֹרָה וְיוֹרְדִים, וְדוֹחֲפִים חֲזָרָה לְמַעְלָה. שִׂימוּ לֵב: הַמַּרְפְּקִים אָחוֹרָה, לֹא לַצְּדָדִים. | workout/js/say.js: SAY[chair-dips]; workout/js/app.js: wireHelp / sayText | `exercise-chair-dips.wav` |
| `exercise-jog` | רִיצָה קַלָּה בַּמָּקוֹם. רָצִים בַּמָּקוֹם בְּקֶצֶב נָעִים. הַיָּדַיִם זָזוֹת כְּמוֹ בְּרִיצָה. נוֹשְׁמִים רָגוּעַ. שִׂימוּ לֵב: זֶה חִמּוּם, לֹא תַּחֲרוּת. אֶפְשָׁר גַּם הָלוֹךְ וָשׁוֹב בַּמִּסְדְּרוֹן. | workout/js/say.js: SAY[jog]; workout/js/app.js: wireHelp / sayText | `exercise-jog.wav` |
| `exercise-arm-circles` | סִבּוּבֵי יָדַיִם. יָדַיִם יְשָׁרוֹת לַצְּדָדִים. מְסוֹבְבִים עִגּוּלִים גְּדוֹלִים קָדִימָה. בְּאֶמְצַע הַזְּמַן מַחְלִיפִים כִּוּוּן. שִׂימוּ לֵב: הַכְּתֵפַיִם רְפוּיוֹת, לֹא מְרִימִים אוֹתָן לָאָזְנַיִם. | workout/js/say.js: SAY[arm-circles]; workout/js/app.js: wireHelp / sayText | `exercise-arm-circles.wav` |
| `exercise-ankle-hops` | קְפִיצוֹת קַרְסֹל. רַגְלַיִם צְמוּדוֹת, בִּרְכַּיִם כִּמְעַט יְשָׁרוֹת. קוֹפְצִים קָטָן וּמַהֵר מֵהַקַּרְסֻלַּיִם. נוֹחֲתִים עַל קְצוֹת הָאֶצְבָּעוֹת. שִׂימוּ לֵב: הַקְּפִיצָה נְמוּכָה, כְּמוֹ קְפִיץ. זֶה מְחַמֵּם אֶת הַשּׁוֹקַיִם לִפְנֵי הַנִּתּוּר. | workout/js/say.js: SAY[ankle-hops]; workout/js/app.js: wireHelp / sayText | `exercise-ankle-hops.wav` |
| `exercise-jumping-jacks` | קְפִיצוֹת פִּישׂוּק. עוֹמְדִים יָשָׁר, יָדַיִם בַּצְּדָדִים. קוֹפְצִים: רַגְלַיִם פְּתוּחוֹת וְיָדַיִם לְמַעְלָה. קוֹפְצִים חֲזָרָה לַעֲמִידָה. שִׂימוּ לֵב: לִנְחֹת רַךְ עַל קְצוֹת הָאֶצְבָּעוֹת, לֹא עַל הָעֲקֵבִים. בַּסָּלוֹן: מֶרְחָק יָד מֵהַשֻּׁלְחָן וּמֵהַטֶּלֶוִיזְיָה. | workout/js/say.js: SAY[jumping-jacks]; workout/js/app.js: wireHelp / sayText | `exercise-jumping-jacks.wav` |
| `exercise-squat-jumps` | קְפִיצוֹת סְקְווֹאט. יוֹרְדִים לִסְקְווֹאט, יָדַיִם קָדִימָה. מִתְפּוֹצְצִים לְמַעְלָה, הַיָּדַיִם עָפוֹת לְאָחוֹר. נוֹחֲתִים בְּשֶׁקֶט יָשָׁר לַסְּקְווֹאט הַבָּא. שִׂימוּ לֵב: הַבִּרְכַּיִם לֹא נוֹפְלוֹת פְּנִימָה בַּנְּחִיתָה. שֶׁקֶט בַּנְּחִיתָה שָׁוֶה בִּרְכַּיִם בְּרִיאוֹת. | workout/js/say.js: SAY[squat-jumps]; workout/js/app.js: wireHelp / sayText | `exercise-squat-jumps.wav` |
| `exercise-high-knees` | בִּרְכַּיִם גְּבוֹהוֹת. רָצִים בַּמָּקוֹם. הַבִּרְכַּיִם עוֹלוֹת לְגֹבַהּ הַמֹּתֶן. הַיָּדַיִם דוֹחֲפוֹת חָזָק כְּמוֹ בְּרִיצָה. שִׂימוּ לֵב: הַגּוּף יָשָׁר, לֹא נִשְׁעָנִים אֲחוֹרָה. | workout/js/say.js: SAY[high-knees]; workout/js/app.js: wireHelp / sayText | `exercise-high-knees.wav` |
| `exercise-tuck-jumps` | קְפִיצוֹת בִּרְכַּיִם לֶחָזֶה. עוֹמְדִים, יָדַיִם מוּכָנוֹת. קוֹפְצִים גָּבוֹהַּ וּמְקָרְבִים בִּרְכַּיִם לֶחָזֶה. נוֹחֲתִים רַךְ עִם בִּרְכַּיִם מְעַט כְּפוּפוֹת. שִׂימוּ לֵב: בֵּין קְפִיצָה לִקְפִיצָה מֻתָּר לַעֲצֹר שְׁנִיָּה וְלֶאֱסֹף כּוֹחַ. | workout/js/say.js: SAY[tuck-jumps]; workout/js/app.js: wireHelp / sayText | `exercise-tuck-jumps.wav` |
| `exercise-side-hops` | קְפִיצוֹת לַצְּדָדִים. מְדַמְיְנִים קַו עַל הָרִצְפָּה. קוֹפְצִים מִשְׁתֵּי הָרַגְלַיִם מִצַּד לְצַד מֵעָלָיו. מַהֵר וְקַל, הַיָּדַיִם עוֹזְרוֹת. שִׂימוּ לֵב: הַקַּו יָכוֹל לִהְיוֹת קְצֵה הַשָּׁטִיחַ. הַבִּרְכַּיִם תָּמִיד קְצָת כְּפוּפוֹת, גַּם בַּנְּחִיתָה. | workout/js/say.js: SAY[side-hops]; workout/js/app.js: wireHelp / sayText | `exercise-side-hops.wav` |
| `exercise-jump-rope` | קְפִיצָה בְּחֶבֶל דִּמְיוֹנִי. מַרְפְּקִים צְמוּדִים לַגּוּף. קְפִיצוֹת קְטַנּוֹת וּמְהִירוֹת. הַחֶבֶל מִסְתּוֹבֵב מִפִּרְקֵי כַּף הַיָּד. שִׂימוּ לֵב: בַּסָּלוֹן עוֹשִׂים אֶת זֶה בְּלִי חֶבֶל, מְסוֹבְבִים אֶת הַיָּדַיִם כְּאִלּוּ יֵשׁ. עוֹבֵד אוֹתוֹ דָּבָר, וְלֹא שׁוֹבְרִים כְּלוּם. | workout/js/say.js: SAY[jump-rope]; workout/js/app.js: wireHelp / sayText | `exercise-jump-rope.wav` |
| `exercise-burpees` | בֶּרְפִּי. סְקְווֹאט וְיָדַיִם לָרִצְפָּה. רַגְלַיִם אֲחוֹרָה לִפְלַאנְק. רַגְלַיִם חֲזָרָה, וּקְפִיצָה לְמַעְלָה עִם יָדַיִם. שִׂימוּ לֵב: זֶה תַּרְגִּיל קָשֶׁה. עָדִיף שֵׁשׁ טוֹבִים מֵעֶשֶׂר עֲקֻמִּים. | workout/js/say.js: SAY[burpees]; workout/js/app.js: wireHelp / sayText | `exercise-burpees.wav` |
| `exercise-star-jumps` | קְפִיצוֹת כּוֹכָב. מִתְכּוֹפְפִים לִסְקְווֹאט קָטָן, יָדַיִם לְיַד הַבִּרְכַּיִם. קוֹפְצִים וּפוֹתְחִים יָדַיִם וְרַגְלַיִם כְּמוֹ כּוֹכָב. חוֹזְרִים לַסְּקְווֹאט וּמִיָּד שׁוּב. שִׂימוּ לֵב: הַקְּפִיצָה לְמַעְלָה, לֹא קָדִימָה. הָרֹאשׁ לְמַעְלָה. | workout/js/say.js: SAY[star-jumps]; workout/js/app.js: wireHelp / sayText | `exercise-star-jumps.wav` |
| `exercise-broad-jump` | קְפִיצָה לָרֹחַק. עוֹמְדִים בִּקְצֵה הַשָּׁטִיחַ, סְקְווֹאט, יָדַיִם אֲחוֹרָה. מִתְפּוֹצְצִים קָדִימָה וּלְמַעְלָה, יָדַיִם מוֹבִילוֹת. נוֹחֲתִים עַל שְׁתֵּי הָרַגְלַיִם לִסְקְווֹאט וְעוֹצְרִים. שִׂימוּ לֵב: צָרִיךְ שְׁנַיִם עַד שְׁלוֹשָׁה מֶטֶר פְּנוּיִים בַּסָּלוֹן, בְּלִי שֻׁלְחָן בַּדֶּרֶךְ. הוֹלְכִים חֲזָרָה בְּרֹגַע וּמַתְחִילִים שׁוּב. | workout/js/say.js: SAY[broad-jump]; workout/js/app.js: wireHelp / sayText | `exercise-broad-jump.wav` |
| `exercise-single-leg-hops` | נִתּוּר עַל רֶגֶל אַחַת, כָּל רֶגֶל. עוֹמְדִים עַל רֶגֶל אַחַת, הַשְּׁנִיָּה כְּפוּפָה מֵאָחוֹר. קוֹפְצִים בַּמָּקוֹם עַל הָרֶגֶל הָאַחַת. מַחְלִיפִים רֶגֶל וְעוֹשִׂים אוֹתוֹ מִסְפָּר. שִׂימוּ לֵב: הַבֶּרֶךְ מֵעַל הָאֶצְבָּעוֹת בְּכָל נְחִיתָה. אִם מִתְנַדְנְדִים, קוֹפְצִים נָמוּךְ יוֹתֵר. | workout/js/say.js: SAY[single-leg-hops]; workout/js/app.js: wireHelp / sayText | `exercise-single-leg-hops.wav` |
| `exercise-step-jumps` | קְפִיצָה עַל מַדְרֵגָה אוֹ הֲדוֹם. עוֹמְדִים מוּל מַדְרֵגָה, הֲדוֹם יַצִּיב אוֹ שְׁרַפְרָף נָמוּךְ שֶׁלֹּא מַחְלִיק. סְקְווֹאט קָטָן וְקוֹפְצִים לְמַעְלָה עִם שְׁתֵּי הָרַגְלַיִם. נוֹחֲתִים רַךְ עַל הַמַּדְרֵגָה, וְיוֹרְדִים בַּהֲלִיכָה. שִׂימוּ לֵב: לֹא עַל הַסַּפָּה וְלֹא עַל כִּסֵּא עִם גַּלְגַּלִּים. יוֹרְדִים תָּמִיד בַּהֲלִיכָה, לֹא בִּקְפִיצָה. | workout/js/say.js: SAY[step-jumps]; workout/js/app.js: wireHelp / sayText | `exercise-step-jumps.wav` |
| `exercise-hall-sprint` | סְפְּרִינְט בַּמִּסְדְּרוֹן. עוֹמְדִים בִּקְצֵה הַמִּסְדְּרוֹן. רָצִים הֲכִי מַהֵר שֶׁאֶפְשָׁר עַד הַקָּצֶה הַשֵּׁנִי. הוֹלְכִים חֲזָרָה בְּרֹגַע, וְזוֹ חֲזָרָה אַחַת. שִׂימוּ לֵב: לְהָאֵט לִפְנֵי הַקִּיר, לֹא לַעֲצֹר עָלָיו. גַּרְבַּיִם מַחְלִיקוֹת? עָדִיף יְחֵפִים אוֹ נַעֲלַיִם. | workout/js/say.js: SAY[hall-sprint]; workout/js/app.js: wireHelp / sayText | `exercise-hall-sprint.wav` |
| `exercise-run-jump` | רִיצָה וּקְפִיצָה לָרֹחַק. מַתְחִילִים בִּקְצֵה הַמִּסְדְּרוֹן, שָׁלוֹשׁ אוֹ אַרְבַּע צְעָדֵי רִיצָה. קוֹפְצִים מֵרֶגֶל אַחַת קָדִימָה וּלְמַעְלָה, הַיָּדַיִם מוֹבִילוֹת. נוֹחֲתִים עַל שְׁתֵּי הָרַגְלַיִם לִסְקְווֹאט וְעוֹצְרִים בְּשֶׁקֶט. שִׂימוּ לֵב: קוֹפְצִים לְתוֹךְ הַסָּלוֹן, לֹא לְכִוּוּן קִיר. נְחִיתָה רַכָּה וִיצִיבָה שָׁוָה יוֹתֵר מִקְּפִיצָה אֲרֻכָּה. | workout/js/say.js: SAY[run-jump]; workout/js/app.js: wireHelp / sayText | `exercise-run-jump.wav` |
| `exercise-run-vertical` | רִיצָה וּקְפִיצָה לַגֹּבַהּ. שָׁלוֹשׁ צְעָדֵי רִיצָה בַּמִּסְדְּרוֹן. קוֹפְצִים גָּבוֹהַּ וּמוֹתְחִים יָד אַחַת לְמַעְלָה, כְּמוֹ לִנְגֹּעַ בַּתִּקְרָה. נוֹחֲתִים רַךְ עַל שְׁתֵּי הָרַגְלַיִם. שִׂימוּ לֵב: בּוֹחֲרִים נְקֻדָּה עַל הַקִּיר וּמְנַסִּים לִנְגֹּעַ גָּבוֹהַּ יוֹתֵר בְּכָל פַּעַם. זֶה הַנִּתּוּר שֶׁל כַּדּוּרְסַל וְכַדּוּרְעָף. | workout/js/say.js: SAY[run-vertical]; workout/js/app.js: wireHelp / sayText | `exercise-run-vertical.wav` |
| `exercise-bounding` | נִתּוּרֵי צַעַד בַּמִּסְדְּרוֹן. רָצִים לְאֹרֶךְ הַמִּסְדְּרוֹן בִּצְעָדִים עֲנָקִיִּים. כָּל צַעַד הוּא קְפִיצָה: נִשְׁאָרִים בָּאֲוִיר כַּמָּה שֶׁיּוֹתֵר. הַיָּדַיִם גְּדוֹלוֹת כְּמוֹ בְּרִיצָה. שִׂימוּ לֵב: פָּחוֹת צְעָדִים לְאֹרֶךְ הַמִּסְדְּרוֹן שָׁוֶה נִתּוּר טוֹב יוֹתֵר. סוֹפְרִים כַּמָּה צְעָדִים לָקַח. | workout/js/say.js: SAY[bounding]; workout/js/app.js: wireHelp / sayText | `exercise-bounding.wav` |
| `exercise-shuttle-run` | רִיצַת מַעְבֹּרֶת, קִיר לְקִיר. מַתְחִילִים עִם יָד עַל הַקִּיר לְיַד הַשֵּׁרוּתִים. רָצִים מַהֵר, נוֹגְעִים בַּקִּיר לְיַד הַמִּרְפֶּסֶת וּמִסְתּוֹבְבִים. רָצִים חֲזָרָה וְנוֹגְעִים. כָּל קִיר שֶׁנָּגַעְתָּ בּוֹ זוֹ חֲזָרָה אַחַת. שִׂימוּ לֵב: מְאִטִּים שְׁנֵי צְעָדִים לִפְנֵי הַקִּיר וְנוֹגְעִים בַּיָּד, לֹא בְּכָל הַגּוּף. הַסִּבּוּב הוּא הַסּוֹד: נָמוּךְ וּמַהֵר. | workout/js/say.js: SAY[shuttle-run]; workout/js/app.js: wireHelp / sayText | `exercise-shuttle-run.wav` |
| `exercise-reaction-sprint` | רִיצַת תְּגוּבָה, אוֹת יְצִיאָה. עוֹמְדִים מוּכָנִים לְיַד קִיר אֶחָד, בִּרְכַּיִם כְּפוּפוֹת. לוֹחֲצִים עַל אוֹת יְצִיאָה וּמְחַכִּים. לֹא יוֹדְעִים מָתַי! בַּצִּפְצוּף רָצִים הֲכִי מַהֵר לַקִּיר הַשֵּׁנִי וְנוֹגְעִים. חוֹזְרִים בַּהֲלִיכָה. שִׂימוּ לֵב: הַמַּטָּרָה לָזוּז בָּרֶגַע שֶׁל הַצִּפְצוּף, לֹא לְפָנָיו. | workout/js/say.js: SAY[reaction-sprint]; workout/js/app.js: wireHelp / sayText | `exercise-reaction-sprint.wav` |
| `exercise-side-shuffle` | צַעֲדֵי צַד, קִיר לְקִיר. עוֹמְדִים עִם הַפָּנִים לַקִּיר הָאָרֹךְ, בִּרְכַּיִם כְּפוּפוֹת, נָמוּךְ. צַעֲדֵי צַד מְהִירִים לְאֹרֶךְ הַמִּסְדְּרוֹן, הָרַגְלַיִם לֹא מִצְטַלְּבוֹת. נוֹגְעִים בַּקִּיר וְחוֹזְרִים צַעֲדֵי צַד לַצַּד הַשֵּׁנִי. הָלוֹךְ וָשׁוֹב זוֹ חֲזָרָה. שִׂימוּ לֵב: נִשְׁאָרִים נְמוּכִים כְּמוֹ שׁוֹמֵר בְּכַדּוּרְסַל. הַיָּדַיִם פְּתוּחוֹת לַצְּדָדִים. | workout/js/say.js: SAY[side-shuffle]; workout/js/app.js: wireHelp / sayText | `exercise-side-shuffle.wav` |
| `exercise-carioca` | הַצְלָבוֹת רַגְלַיִם, קַרְיוֹקָה. זָזִים הַצִּדָּה לְאֹרֶךְ הַמִּסְדְּרוֹן. רֶגֶל אַחַת עוֹבֶרֶת קָדִימָה מוּל הַשְּׁנִיָּה, וְאָז מֵאָחוֹר. הַיָּדַיִם פְּתוּחוֹת לְשִׁוּוּי מִשְׁקָל. הָלוֹךְ וָשׁוֹב זוֹ חֲזָרָה. שִׂימוּ לֵב: קֹדֶם לְאַט עַד שֶׁהָרַגְלַיִם מְבִינוֹת, וְאָז מַהֵר. הַמֹּתֶן מִסְתּוֹבֵב, הָרֹאשׁ יָשָׁר קָדִימָה. | workout/js/say.js: SAY[carioca]; workout/js/app.js: wireHelp / sayText | `exercise-carioca.wav` |
| `exercise-skipping` | סְקִיפִּינְג, בֶּרֶךְ גְּבוֹהָה עִם נִתּוּר. רָצִים לְאַט לְאֹרֶךְ הַמִּסְדְּרוֹן. בְּכָל צַעַד: בֶּרֶךְ גָּבוֹהַּ וְיָד נֶגְדִּית לְמַעְלָה, עִם נִתּוּר קָטָן. קֶצֶב קָבוּעַ. הָלוֹךְ וָשׁוֹב זוֹ חֲזָרָה. שִׂימוּ לֵב: זֶה תַּרְגִּיל שֶׁל קוֹאוֹרְדִינַצְיָה, לֹא מְהִירוּת. יָד יָמִין עוֹלָה עִם בֶּרֶךְ שְׂמֹאל. | workout/js/say.js: SAY[skipping]; workout/js/app.js: wireHelp / sayText | `exercise-skipping.wav` |
| `exercise-floor-wall-run` | רִיצַת נְגִיעוֹת, רִצְפָּה וְקִיר. לְיַד קִיר אֶחָד: יוֹרְדִים וְנוֹגְעִים בָּרִצְפָּה. סְפְּרִינְט לַקִּיר הַשֵּׁנִי וְנוֹגְעִים בּוֹ גָּבוֹהַּ, כַּמָּה שֶׁאֶפְשָׁר. חֲזָרָה: רִצְפָּה, סְפְּרִינְט, גָּבוֹהַּ. הָלוֹךְ וָשׁוֹב זוֹ חֲזָרָה. שִׂימוּ לֵב: לְמַטָּה מְהִירִים, לְמַעְלָה קוֹפְצִים. כָּל נְגִיעָה בַּקִּיר גָּבוֹהַּ יוֹתֵר. | workout/js/say.js: SAY[floor-wall-run]; workout/js/app.js: wireHelp / sayText | `exercise-floor-wall-run.wav` |
| `exercise-back-run` | רִיצָה לְאָחוֹר. הַגַּב לְכִוּוּן הַהֲלִיכָה, מִסְתַּכְּלִים אֲחוֹרָה מֵעַל הַכָּתֵף. צְעָדִים קְצָרִים וּמְהִירִים עַל קְצוֹת הָאֶצְבָּעוֹת. עַד הַקִּיר וּבַחֲזָרָה בְּרִיצָה רְגִילָה. זוֹ חֲזָרָה אַחַת. שִׂימוּ לֵב: לְאַט בַּהַתְחָלָה. יָד אַחַת נִשְׁלַחַת אֲחוֹרָה כְּדֵי לְהַרְגִּישׁ אֶת הַקִּיר. | workout/js/say.js: SAY[back-run]; workout/js/app.js: wireHelp / sayText | `exercise-back-run.wav` |
| `exercise-crunches` | כְּפִיפוֹת בֶּטֶן. שׁוֹכְבִים עַל הַגַּב עַל הַשָּׁטִיחַ אוֹ עַל מַגֶּבֶת גְּדוֹלָה, בִּרְכַּיִם כְּפוּפוֹת. יָדַיִם לְיַד הָרֹאשׁ, לֹא מוֹשְׁכִים אֶת הַצַּוָּאר. מְרִימִים כְּתֵפַיִם מֵהָרִצְפָּה וְנוֹשְׁפִים, וְיוֹרְדִים לְאַט. שִׂימוּ לֵב: הַסַּנְטֵר לֹא נִדְבָּק לֶחָזֶה. מִסְתַּכְּלִים לַתִּקְרָה. | workout/js/say.js: SAY[crunches]; workout/js/app.js: wireHelp / sayText | `exercise-crunches.wav` |
| `exercise-bicycle` | אוֹפַנַּיִם. שׁוֹכְבִים, כְּתֵפַיִם מְעַט לְמַעְלָה. בֶּרֶךְ אַחַת לֶחָזֶה וְהַשְּׁנִיָּה יְשָׁרָה. מַחְלִיפִים כְּמוֹ עַל אוֹפַנַּיִם, מַרְפֵּק לַבֶּרֶךְ הַנֶּגְדִּית. שִׂימוּ לֵב: לְאַט וּמְדֻיָּק עָדִיף עַל מַהֵר וּמְרֻשָּׁל. | workout/js/say.js: SAY[bicycle]; workout/js/app.js: wireHelp / sayText | `exercise-bicycle.wav` |
| `exercise-leg-raises` | הֲרָמוֹת רַגְלַיִם. שׁוֹכְבִים יָשָׁר, יָדַיִם לְצַד הַגּוּף. מְרִימִים רַגְלַיִם יְשָׁרוֹת עַד לַתִּקְרָה. מוֹרִידִים לְאַט, בְּלִי לָגַעַת בָּרִצְפָּה. שִׂימוּ לֵב: הַגַּב הַתַּחְתּוֹן נִשְׁאָר לָחוּץ לָרִצְפָּה. אֵין מִזְרָן? מַגֶּבֶת מְקֻפֶּלֶת מִתַּחַת לַגַּב. | workout/js/say.js: SAY[leg-raises]; workout/js/app.js: wireHelp / sayText | `exercise-leg-raises.wav` |
| `exercise-v-ups` | קִפּוּלֵי וִי. שׁוֹכְבִים יָשָׁר, יָדַיִם מֵעַל הָרֹאשׁ. מְרִימִים יָדַיִם וְרַגְלַיִם בְּיַחַד וְנוֹגְעִים בִּקְצוֹת הָאֶצְבָּעוֹת. חוֹזְרִים לְאַט לִשְׁכִיבָה. שִׂימוּ לֵב: אִם קָשֶׁה, כּוֹפְפִים קְצָת אֶת הַבִּרְכַּיִם. | workout/js/say.js: SAY[v-ups]; workout/js/app.js: wireHelp / sayText | `exercise-v-ups.wav` |
| `exercise-plank` | פְּלַאנְק. יָדַיִם מִתַּחַת לַכְּתֵפַיִם, רַגְלַיִם יְשָׁרוֹת. הַגּוּף בְּקַו יָשָׁר כְּמוֹ קֶרֶשׁ. הַבֶּטֶן מְכֻוֶּצֶת, נוֹשְׁמִים. שִׂימוּ לֵב: לֹא לְהָרִים אֶת הַיַּשְׁבָן וְלֹא לִשְׁמֹט אוֹתוֹ. מִסְתַּכְּלִים לָרִצְפָּה. | workout/js/say.js: SAY[plank]; workout/js/app.js: wireHelp / sayText | `exercise-plank.wav` |
| `exercise-side-plank` | פְּלַאנְק צַד, כָּל צַד. שׁוֹכְבִים עַל הַצַּד, מַרְפֵּק מִתַּחַת לַכָּתֵף. מְרִימִים אֶת הַמֹּתֶן, הַגּוּף בְּקַו יָשָׁר. הַיָּד הַשְּׁנִיָּה לְמַעְלָה. אַחֲרֵי הַזְּמַן מַחְלִיפִים צַד. שִׂימוּ לֵב: הַמֹּתֶן לֹא נוֹפֵל לְמַטָּה. אִם קָשֶׁה, הַבֶּרֶךְ הַתַּחְתּוֹנָה עַל הָרִצְפָּה. | workout/js/say.js: SAY[side-plank]; workout/js/app.js: wireHelp / sayText | `exercise-side-plank.wav` |
| `exercise-hollow-hold` | סִירָה. שׁוֹכְבִים עַל הַגַּב, יָדַיִם מֵעַל הָרֹאשׁ. מְרִימִים כְּתֵפַיִם וְרַגְלַיִם מְעַט מֵהָרִצְפָּה. הַגּוּף כְּמוֹ סִירָה. מַחְזִיקִים. שִׂימוּ לֵב: הַגַּב הַתַּחְתּוֹן לָחוּץ לָרִצְפָּה כָּל הַזְּמַן. | workout/js/say.js: SAY[hollow-hold]; workout/js/app.js: wireHelp / sayText | `exercise-hollow-hold.wav` |
| `exercise-flutter-kicks` | מִסְפָּרַיִם. שׁוֹכְבִים עַל הַגַּב, רַגְלַיִם בָּאֲוִיר. מְנַפְנְפִים לְמַעְלָה וּלְמַטָּה בִּתְנוּעוֹת קְטַנּוֹת. הָרֹאשׁ וְהַכְּתֵפַיִם מְעַט לְמַעְלָה. שִׂימוּ לֵב: הָרַגְלַיִם לֹא נוֹגְעוֹת בָּרִצְפָּה עַד הַסּוֹף. | workout/js/say.js: SAY[flutter-kicks]; workout/js/app.js: wireHelp / sayText | `exercise-flutter-kicks.wav` |
| `exercise-russian-twists` | סִבּוּבֵי גֵּו. יוֹשְׁבִים, רַגְלַיִם בָּאֲוִיר, גַּב מְעַט לְאָחוֹר. יָדַיִם צְמוּדוֹת. מְסוֹבְבִים אֶת הַגּוּף יָמִינָה וּשְׂמֹאלָה. שִׂימוּ לֵב: הַסִּבּוּב מֵהַבֶּטֶן, לֹא רַק מֵהַיָּדַיִם. | workout/js/say.js: SAY[russian-twists]; workout/js/app.js: wireHelp / sayText | `exercise-russian-twists.wav` |
| `exercise-superman` | סוּפֶּרְמֶן. שׁוֹכְבִים עַל הַבֶּטֶן, יָדַיִם קָדִימָה. מְרִימִים יָדַיִם וְרַגְלַיִם בְּיַחַד. מַחְזִיקִים שְׁנִיָּה וְיוֹרְדִים. שִׂימוּ לֵב: מִסְתַּכְּלִים לָרִצְפָּה, לֹא לְמַעְלָה. עַל שָׁטִיחַ, אוֹ מַגֶּבֶת מִתַּחַת לַבֶּטֶן. | workout/js/say.js: SAY[superman]; workout/js/app.js: wireHelp / sayText | `exercise-superman.wav` |
| `exercise-mountain-climbers` | מְטַפְּסֵי הָרִים. פְּלַאנְק עַל הַיָּדַיִם. מְקָרְבִים בֶּרֶךְ לֶחָזֶה. מַחְלִיפִים מַהֵר, כְּמוֹ רִיצָה עַל הָרִצְפָּה. שִׂימוּ לֵב: הַיַּשְׁבָן נִשְׁאָר לְמַטָּה, הַיָּדַיִם לֹא זָזוֹת. | workout/js/say.js: SAY[mountain-climbers]; workout/js/app.js: wireHelp / sayText | `exercise-mountain-climbers.wav` |
| `exercise-squats` | סְקְווֹאט. רַגְלַיִם בְּרֹחַב הַכְּתֵפַיִם. יוֹרְדִים כְּמוֹ לָשֶׁבֶת עַל כִּסֵּא, יָדַיִם קָדִימָה. עוֹלִים חָזָק דֶּרֶךְ הָעֲקֵבִים. שִׂימוּ לֵב: הַבִּרְכַּיִם לֹא עוֹבְרוֹת אֶת קְצוֹת הָאֶצְבָּעוֹת. הַגַּב יָשָׁר. | workout/js/say.js: SAY[squats]; workout/js/app.js: wireHelp / sayText | `exercise-squats.wav` |
| `exercise-lunges` | מַכְרֵעִים, כָּל רֶגֶל. צַעַד גָּדוֹל קָדִימָה. יוֹרְדִים עַד שֶׁהַבֶּרֶךְ הָאֲחוֹרִית כִּמְעַט נוֹגַעַת בָּרִצְפָּה. עוֹלִים וּמַחְלִיפִים רֶגֶל. שִׂימוּ לֵב: הַבֶּרֶךְ הַקִּדְמִית מֵעַל הַקַּרְסֹל, לֹא לְפָנָיו. | workout/js/say.js: SAY[lunges]; workout/js/app.js: wireHelp / sayText | `exercise-lunges.wav` |
| `exercise-calf-raises` | הֲרָמוֹת עֲקֵבִים. עוֹמְדִים יָשָׁר, אֶפְשָׁר לְהַחֲזִיק בַּקִּיר אוֹ בְּגַב הַסַּפָּה. עוֹלִים עַל קְצוֹת הָאֶצְבָּעוֹת הֲכִי גָּבוֹהַּ שֶׁאֶפְשָׁר. יוֹרְדִים לְאַט. שִׂימוּ לֵב: הַשּׁוֹקַיִם הֵן הַקְּפִיץ שֶׁל הַנִּתּוּר. לַעֲלוֹת עַד הַסּוֹף, לָרֶדֶת לְאַט. | workout/js/say.js: SAY[calf-raises]; workout/js/app.js: wireHelp / sayText | `exercise-calf-raises.wav` |
| `exercise-glute-bridge` | גֶּשֶׁר יַשְׁבָן. שׁוֹכְבִים עַל הַגַּב, בִּרְכַּיִם כְּפוּפוֹת. דוֹחֲפִים אֶת הַמֹּתֶן לְמַעְלָה עַד קַו יָשָׁר. מְכַוְּצִים אֶת הַיַּשְׁבָן לְמַעְלָה וְיוֹרְדִים לְאַט. שִׂימוּ לֵב: הַדְּחִיפָה מֵהָעֲקֵבִים. לֹא לְקַמֵּר אֶת הַגַּב. | workout/js/say.js: SAY[glute-bridge]; workout/js/app.js: wireHelp / sayText | `exercise-glute-bridge.wav` |
| `exercise-wall-sit` | יְשִׁיבָה עַל קִיר. גַּב לַקִּיר, מַחְלִיקִים לְמַטָּה. הַבִּרְכַּיִם בְּזָוִית יְשָׁרָה כְּמוֹ עַל כִּסֵּא. מַחְזִיקִים. הַיָּדַיִם לֹא עַל הָרַגְלַיִם. שִׂימוּ לֵב: הַגַּב כֻּלּוֹ צָמוּד לַקִּיר. שׂוֹרֵף? זֶה בְּסֵדֶר, זֶה הַשְּׁרִיר. | workout/js/say.js: SAY[wall-sit]; workout/js/app.js: wireHelp / sayText | `exercise-wall-sit.wav` |
| `exercise-push-ups` | שְׁכִיבוֹת סְמִיכָה. יָדַיִם בְּרֹחַב הַכְּתֵפַיִם, גּוּף יָשָׁר. יוֹרְדִים עַד שֶׁהֶחָזֶה קָרוֹב לָרִצְפָּה. דוֹחֲפִים חָזָק לְמַעְלָה. שִׂימוּ לֵב: הַמַּרְפְּקִים קְצָת אֲחוֹרָה, לֹא לַצְּדָדִים. הַגּוּף יָשָׁר כְּמוֹ קֶרֶשׁ כָּל הַדֶּרֶךְ. | workout/js/say.js: SAY[push-ups]; workout/js/app.js: wireHelp / sayText | `exercise-push-ups.wav` |
| `exercise-knee-push-ups` | שְׁכִיבוֹת סְמִיכָה עַל הַבִּרְכַּיִם. בִּרְכַּיִם עַל הָרִצְפָּה, יָדַיִם מִתַּחַת לַכְּתֵפַיִם. הַגּוּף יָשָׁר מֵהַבִּרְכַּיִם עַד הָרֹאשׁ. יוֹרְדִים וְדוֹחֲפִים. שִׂימוּ לֵב: זוֹ הַגִּרְסָה הַקַּלָּה שֶׁל שְׁכִיבוֹת סְמִיכָה. כְּשֶׁקַּל, עוֹבְרִים לָרְגִילוֹת. | workout/js/say.js: SAY[knee-push-ups]; workout/js/app.js: wireHelp / sayText | `exercise-knee-push-ups.wav` |
| `exercise-pike-push-ups` | שְׁכִיבוֹת סְמִיכָה בְּפִיקָה. הַיַּשְׁבָן לְמַעְלָה, הַגּוּף בְּצוּרַת וִי הָפוּךְ. מְכוֹפְפִים מַרְפְּקִים וְהָרֹאשׁ יוֹרֵד לָרִצְפָּה. דוֹחֲפִים חֲזָרָה. שִׂימוּ לֵב: מְחַזֵּק כְּתֵפַיִם. מִסְתַּכְּלִים עַל הָרַגְלַיִם, לֹא קָדִימָה. | workout/js/say.js: SAY[pike-push-ups]; workout/js/app.js: wireHelp / sayText | `exercise-pike-push-ups.wav` |
| `exercise-quad-stretch` | מְתִיחַת יָרֵךְ קִדְמִית, כָּל רֶגֶל. עוֹמְדִים עַל רֶגֶל אַחַת. תּוֹפְסִים אֶת הָרֶגֶל הַשְּׁנִיָּה וּמְקָרְבִים אֶת הָעָקֵב לַיַּשְׁבָן. מַחְזִיקִים וּמַחְלִיפִים רֶגֶל. שִׂימוּ לֵב: הַבִּרְכַּיִם צְמוּדוֹת, הַגּוּף יָשָׁר. אֶפְשָׁר לְהַחֲזִיק בַּקִּיר. | workout/js/say.js: SAY[quad-stretch]; workout/js/app.js: wireHelp / sayText | `exercise-quad-stretch.wav` |
| `exercise-hamstring-stretch` | מְתִיחַת יָרֵךְ אֲחוֹרִית. רַגְלַיִם יְשָׁרוֹת וּצְמוּדוֹת. מִתְכּוֹפְפִים קָדִימָה לְאַט וּמוֹרִידִים יָדַיִם לָרִצְפָּה. נוֹשְׁמִים וּמַשְׁאִירִים אֶת הָרֹאשׁ רָפוּי. שִׂימוּ לֵב: לֹא לִקְפֹּץ בַּמְּתִיחָה. יוֹרְדִים עַד שֶׁמַּרְגִּישִׁים וְנִשְׁאָרִים. | workout/js/say.js: SAY[hamstring-stretch]; workout/js/app.js: wireHelp / sayText | `exercise-hamstring-stretch.wav` |
| `exercise-calf-stretch` | מְתִיחַת שׁוֹק, כָּל רֶגֶל. יָדַיִם עַל הַקִּיר אוֹ עַל גַּב הַסַּפָּה. רֶגֶל אַחַת אֲחוֹרָה, יְשָׁרָה, הָעָקֵב עַל הָרִצְפָּה. נִשְׁעָנִים קָדִימָה וּמַחְזִיקִים. מַחְלִיפִים רֶגֶל. שִׂימוּ לֵב: הָעָקֵב הָאֲחוֹרִי לֹא עוֹלֶה מֵהָרִצְפָּה. | workout/js/say.js: SAY[calf-stretch]; workout/js/app.js: wireHelp / sayText | `exercise-calf-stretch.wav` |
| `name-jog` | ריצה קלה במקום | workout/js/exercises.js: jog.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-jog.wav` |
| `name-arm-circles` | סיבובי ידיים | workout/js/exercises.js: arm-circles.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-arm-circles.wav` |
| `name-ankle-hops` | קפיצות קרסול | workout/js/exercises.js: ankle-hops.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-ankle-hops.wav` |
| `name-jumping-jacks` | קפיצות פישוק | workout/js/exercises.js: jumping-jacks.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-jumping-jacks.wav` |
| `name-squat-jumps` | קפיצות סקוואט | workout/js/exercises.js: squat-jumps.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-squat-jumps.wav` |
| `name-high-knees` | ברכיים גבוהות | workout/js/exercises.js: high-knees.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-high-knees.wav` |
| `name-tuck-jumps` | קפיצות ברכיים לחזה | workout/js/exercises.js: tuck-jumps.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-tuck-jumps.wav` |
| `name-side-hops` | קפיצות לצדדים | workout/js/exercises.js: side-hops.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-side-hops.wav` |
| `name-jump-rope` | קפיצה בחבל דמיוני | workout/js/exercises.js: jump-rope.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-jump-rope.wav` |
| `name-burpees` | ברפי | workout/js/exercises.js: burpees.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-burpees.wav` |
| `name-star-jumps` | קפיצות כוכב | workout/js/exercises.js: star-jumps.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-star-jumps.wav` |
| `name-broad-jump` | קפיצה לרוחק | workout/js/exercises.js: broad-jump.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-broad-jump.wav` |
| `name-single-leg-hops` | ניתור על רגל אחת (כל רגל) | workout/js/exercises.js: single-leg-hops.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-single-leg-hops.wav` |
| `name-step-jumps` | קפיצה על מדרגה או הדום | workout/js/exercises.js: step-jumps.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-step-jumps.wav` |
| `name-hall-sprint` | ספרינט במסדרון | workout/js/exercises.js: hall-sprint.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-hall-sprint.wav` |
| `name-run-jump` | ריצה וקפיצה לרוחק | workout/js/exercises.js: run-jump.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-run-jump.wav` |
| `name-run-vertical` | ריצה וקפיצה לגובה | workout/js/exercises.js: run-vertical.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-run-vertical.wav` |
| `name-bounding` | ניתורי צעד במסדרון | workout/js/exercises.js: bounding.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-bounding.wav` |
| `name-shuttle-run` | ריצת מעבורת: קיר לקיר | workout/js/exercises.js: shuttle-run.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-shuttle-run.wav` |
| `name-reaction-sprint` | ריצת תגובה: אות יציאה | workout/js/exercises.js: reaction-sprint.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-reaction-sprint.wav` |
| `name-side-shuffle` | צעדי צד: קיר לקיר | workout/js/exercises.js: side-shuffle.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-side-shuffle.wav` |
| `name-carioca` | הצלבות רגליים (קריוקה) | workout/js/exercises.js: carioca.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-carioca.wav` |
| `name-skipping` | סקיפינג: ברך גבוהה עם ניתור | workout/js/exercises.js: skipping.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-skipping.wav` |
| `name-floor-wall-run` | ריצת נגיעות: רצפה וקיר | workout/js/exercises.js: floor-wall-run.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-floor-wall-run.wav` |
| `name-back-run` | ריצה לאחור | workout/js/exercises.js: back-run.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-back-run.wav` |
| `name-crunches` | כפיפות בטן | workout/js/exercises.js: crunches.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-crunches.wav` |
| `name-bicycle` | אופניים | workout/js/exercises.js: bicycle.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-bicycle.wav` |
| `name-leg-raises` | הרמות רגליים | workout/js/exercises.js: leg-raises.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-leg-raises.wav` |
| `name-v-ups` | קיפולי V | workout/js/exercises.js: v-ups.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-v-ups.wav` |
| `name-plank` | פלאנק | workout/js/exercises.js: plank.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-plank.wav` |
| `name-side-plank` | פלאנק צד (כל צד) | workout/js/exercises.js: side-plank.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-side-plank.wav` |
| `name-hollow-hold` | סירה | workout/js/exercises.js: hollow-hold.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-hollow-hold.wav` |
| `name-flutter-kicks` | מספריים | workout/js/exercises.js: flutter-kicks.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-flutter-kicks.wav` |
| `name-russian-twists` | סיבובי גו | workout/js/exercises.js: russian-twists.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-russian-twists.wav` |
| `name-superman` | סופרמן | workout/js/exercises.js: superman.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-superman.wav` |
| `name-plank-jacks` | פתח-סגור בסמיכה | workout/js/exercises.js: plank-jacks.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-plank-jacks.wav` |
| `name-crab-kicks` | סרטן מתאמן | workout/js/exercises.js: crab-kicks.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-crab-kicks.wav` |
| `name-mountain-climbers` | מטפסי הרים | workout/js/exercises.js: mountain-climbers.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-mountain-climbers.wav` |
| `name-squats` | סקוואט | workout/js/exercises.js: squats.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-squats.wav` |
| `name-lunges` | מכרעים (כל רגל) | workout/js/exercises.js: lunges.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-lunges.wav` |
| `name-calf-raises` | הרמות עקבים | workout/js/exercises.js: calf-raises.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-calf-raises.wav` |
| `name-glute-bridge` | גשר ישבן | workout/js/exercises.js: glute-bridge.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-glute-bridge.wav` |
| `name-wall-sit` | ישיבה על קיר | workout/js/exercises.js: wall-sit.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-wall-sit.wav` |
| `name-push-ups` | שכיבות סמיכה | workout/js/exercises.js: push-ups.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-push-ups.wav` |
| `name-knee-push-ups` | שכיבות סמיכה על הברכיים | workout/js/exercises.js: knee-push-ups.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-knee-push-ups.wav` |
| `name-chair-dips` | יד אחורית על כיסא | workout/js/exercises.js: chair-dips.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-chair-dips.wav` |
| `name-pike-push-ups` | שכיבות סמיכה בפיקה | workout/js/exercises.js: pike-push-ups.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-pike-push-ups.wav` |
| `name-quad-stretch` | מתיחת ירך קדמית (כל רגל) | workout/js/exercises.js: quad-stretch.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-quad-stretch.wav` |
| `name-hamstring-stretch` | מתיחת ירך אחורית | workout/js/exercises.js: hamstring-stretch.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-hamstring-stretch.wav` |
| `name-calf-stretch` | מתיחת שוק (כל רגל) | workout/js/exercises.js: calf-stretch.name; workout/js/app.js: adjustDifficulty (אימון יחיד) | `name-calf-stretch.wav` |
| `ui-costTwo` | שִׂים לֵב, הַמִּשְׂחָק הַזֶּה עוֹלֶה שְׁתֵּי מַתָּנוֹת, כִּי הוּא אָרֹךְ יוֹתֵר. | workout/js/say-ui.js: SAY_UI.costTwo; workout/js/app.js | `ui-costTwo.wav` |
| `ui-howWas` | סִיַּמְתָּ! אֵיךְ הָיָה הָאִמּוּן? קַל, בְּדִיּוּק, אוֹ קָשֶׁה? | workout/js/say-ui.js: SAY_UI.howWas; workout/js/app.js | `ui-howWas.wav` |
| `ui-test` | הַיי! אֲנִי אַסְבִּיר לְךָ אֵיךְ עוֹשִׂים כָּל תַּרְגִּיל. לוֹחֲצִים עַל הַכַּפְתּוֹר "אֵיךְ עוֹשִׂים אֶת זֶה?". | workout/js/say-ui.js: SAY_UI.test; workout/js/app.js | `ui-test.wav` |
| `intro-race` | הַיּוֹם אַתָּה רִאשׁוֹן! | workout/js/say-ui.js: SAY_UI.intro.race; workout/js/app.js: introPhase | `intro-race.wav` |
| `intro-hurdles` | עוֹבֵר כָּל מִכְשׁוֹל! | workout/js/say-ui.js: SAY_UI.intro.hurdles; workout/js/app.js: introPhase | `intro-hurdles.wav` |
| `intro-dunk` | סְלֶאם דַּאנְק! | workout/js/say-ui.js: SAY_UI.intro.dunk; workout/js/app.js: introPhase | `intro-dunk.wav` |
| `intro-dribble` | כַּדְרוּר, עוֹבְרִים אֶת הַשּׁוֹמֵר, וּקְלִיעָה! | workout/js/say-ui.js: SAY_UI.intro.dribble; workout/js/app.js: introPhase | `intro-dribble.wav` |
| `intro-podium` | מָקוֹם רִאשׁוֹן! | workout/js/say-ui.js: SAY_UI.intro.podium; workout/js/app.js: introPhase | `intro-podium.wav` |
| `adjust-top` | אַתָּה כְּבָר בָּרָמָה הַגְּבוֹהָה בְּיוֹתֵר. אַלּוּף אֲמִתִּי! | workout/js/say-ui.js: SAY_UI.adjust.top; workout/js/app.js: adjustDifficulty | `adjust-top.wav` |
| `adjust-downSwaps` | הָיָה קָשֶׁה? בַּפַּעַם הַבָּאָה חוֹזְרִים לַתַּרְגִּילִים הָרְגִילִים. | workout/js/say-ui.js: SAY_UI.adjust.downSwaps; workout/js/app.js: adjustDifficulty | `adjust-downSwaps.wav` |
| `adjust-downBoost` | הָיָה קָשֶׁה? הוֹרַדְתִּי קְצָת. בַּפַּעַם הַבָּאָה יִהְיֶה נוֹחַ יוֹתֵר. | workout/js/say-ui.js: SAY_UI.adjust.downBoost; workout/js/app.js: adjustDifficulty | `adjust-downBoost.wav` |
| `adjust-bottom` | כָּל הַכָּבוֹד שֶׁסִּיַּמְתָּ! זוֹ הָרָמָה הַקַּלָּה בְּיוֹתֵר, וְבַפַּעַם הַבָּאָה יִהְיֶה קַל יוֹתֵר כִּי אַתָּה מִתְחַזֵּק. | workout/js/say-ui.js: SAY_UI.adjust.bottom; workout/js/app.js: adjustDifficulty | `adjust-bottom.wav` |
| `adjust-ok` | מְעֻלֶּה, בְּדִיּוּק בָּרָמָה שֶׁלְּךָ. | workout/js/say-ui.js: SAY_UI.adjust.ok; workout/js/app.js: adjustDifficulty | `adjust-ok.wav` |
| `level-easy` | קַל | workout/js/say-ui.js: SAY_UI.levels.easy; SAY_UI.adjust.level / downLevel | `level-easy.wav` |
| `level-normal` | רָגִיל | workout/js/say-ui.js: SAY_UI.levels.normal; SAY_UI.adjust.level / downLevel | `level-normal.wav` |
| `level-hard` | חָזָק | workout/js/say-ui.js: SAY_UI.levels.hard; SAY_UI.adjust.level / downLevel | `level-hard.wav` |
| `level-pro` | אַלּוּף | workout/js/say-ui.js: SAY_UI.levels.pro; SAY_UI.adjust.level / downLevel | `level-pro.wav` |
| `program-jump-a` | נִתּוּר אָלֶף | workout/js/say-ui.js: SAY_UI.programs[jump-a]; workout/js/app.js: adjustDifficulty | `program-jump-a.wav` |
| `program-jump-b` | נִתּוּר בֵּית | workout/js/say-ui.js: SAY_UI.programs[jump-b]; workout/js/app.js: adjustDifficulty | `program-jump-b.wav` |
| `program-jump-c` | נִתּוּר גִּימֶל | workout/js/say-ui.js: SAY_UI.programs[jump-c]; workout/js/app.js: adjustDifficulty | `program-jump-c.wav` |
| `program-speed` | מְהִירוּת וְקוֹאוֹרְדִינַצְיָה | workout/js/say-ui.js: SAY_UI.programs[speed]; workout/js/app.js: adjustDifficulty | `program-speed.wav` |
| `program-hall` | נִתּוּר בַּמִּסְדְּרוֹן | workout/js/say-ui.js: SAY_UI.programs[hall]; workout/js/app.js: adjustDifficulty | `program-hall.wav` |
| `program-legs` | כּוֹחַ רַגְלַיִם | workout/js/say-ui.js: SAY_UI.programs[legs]; workout/js/app.js: adjustDifficulty | `program-legs.wav` |
| `program-upper` | כּוֹחַ עֶלְיוֹן וּבֶטֶן | workout/js/say-ui.js: SAY_UI.programs[upper]; workout/js/app.js: adjustDifficulty | `program-upper.wav` |
| `program-core` | אִמּוּן בֶּטֶן | workout/js/say-ui.js: SAY_UI.programs[core]; workout/js/app.js: adjustDifficulty | `program-core.wav` |
| `program-full` | גּוּף מָלֵא | workout/js/say-ui.js: SAY_UI.programs[full]; workout/js/app.js: adjustDifficulty | `program-full.wav` |
| `program-quick` | אִמּוּן שֶׁבַע דַּקּוֹת | workout/js/say-ui.js: SAY_UI.programs[quick]; workout/js/app.js: adjustDifficulty | `program-quick.wav` |
| `ordinal-1` | הָרִאשׁוֹן | workout/js/say-ui.js: SAY_UI.ordinals / perseverance | `ordinal-1.wav` |
| `ordinal-2` | הַשֵּׁנִי | workout/js/say-ui.js: SAY_UI.ordinals / perseverance | `ordinal-2.wav` |
| `ordinal-3` | הַשְּׁלִישִׁי | workout/js/say-ui.js: SAY_UI.ordinals / perseverance | `ordinal-3.wav` |
| `ordinal-4` | הָרְבִיעִי | workout/js/say-ui.js: SAY_UI.ordinals / perseverance | `ordinal-4.wav` |
| `ordinal-5` | הַחֲמִישִׁי | workout/js/say-ui.js: SAY_UI.ordinals / perseverance | `ordinal-5.wav` |
| `ordinal-6` | הַשִּׁשִּׁי | workout/js/say-ui.js: SAY_UI.ordinals / perseverance | `ordinal-6.wav` |
| `ordinal-7` | הַשְּׁבִיעִי | workout/js/say-ui.js: SAY_UI.ordinals / perseverance | `ordinal-7.wav` |
| `number-0` | אֶפֶס | workout/js/count.js: numWord / timeCue; workout/js/app.js: wireReps / minuteScreen; SAY_UI.perseverance | `number-0.wav` |
| `number-1` | אַחַת | workout/js/count.js: numWord / timeCue; workout/js/app.js: wireReps / minuteScreen; SAY_UI.perseverance | `number-1.wav` |
| `number-2` | שְׁתַּיִם | workout/js/count.js: numWord / timeCue; workout/js/app.js: wireReps / minuteScreen; SAY_UI.perseverance | `number-2.wav` |
| `number-3` | שָׁלוֹשׁ | workout/js/count.js: numWord / timeCue; workout/js/app.js: wireReps / minuteScreen; SAY_UI.perseverance | `number-3.wav` |
| `number-4` | אַרְבַּע | workout/js/count.js: numWord / timeCue; workout/js/app.js: wireReps / minuteScreen; SAY_UI.perseverance | `number-4.wav` |
| `number-5` | חָמֵשׁ | workout/js/count.js: numWord / timeCue; workout/js/app.js: wireReps / minuteScreen; SAY_UI.perseverance | `number-5.wav` |
| `number-6` | שֵׁשׁ | workout/js/count.js: numWord / timeCue; workout/js/app.js: wireReps / minuteScreen; SAY_UI.perseverance | `number-6.wav` |
| `number-7` | שֶׁבַע | workout/js/count.js: numWord / timeCue; workout/js/app.js: wireReps / minuteScreen; SAY_UI.perseverance | `number-7.wav` |
| `number-8` | שְׁמוֹנֶה | workout/js/count.js: numWord / timeCue; workout/js/app.js: wireReps / minuteScreen; SAY_UI.perseverance | `number-8.wav` |
| `number-9` | תֵּשַׁע | workout/js/count.js: numWord / timeCue; workout/js/app.js: wireReps / minuteScreen; SAY_UI.perseverance | `number-9.wav` |
| `number-10` | עֶשֶׂר | workout/js/count.js: numWord / timeCue; workout/js/app.js: wireReps / minuteScreen; SAY_UI.perseverance | `number-10.wav` |
| `number-11` | אַחַת עֶשְׂרֵה | workout/js/count.js: numWord / timeCue; workout/js/app.js: wireReps / minuteScreen; SAY_UI.perseverance | `number-11.wav` |
| `number-12` | שְׁתֵּים עֶשְׂרֵה | workout/js/count.js: numWord / timeCue; workout/js/app.js: wireReps / minuteScreen; SAY_UI.perseverance | `number-12.wav` |
| `number-13` | שְׁלוֹשׁ עֶשְׂרֵה | workout/js/count.js: numWord / timeCue; workout/js/app.js: wireReps / minuteScreen; SAY_UI.perseverance | `number-13.wav` |
| `number-14` | אַרְבַּע עֶשְׂרֵה | workout/js/count.js: numWord / timeCue; workout/js/app.js: wireReps / minuteScreen; SAY_UI.perseverance | `number-14.wav` |
| `number-15` | חֲמֵשׁ עֶשְׂרֵה | workout/js/count.js: numWord / timeCue; workout/js/app.js: wireReps / minuteScreen; SAY_UI.perseverance | `number-15.wav` |
| `number-16` | שֵׁשׁ עֶשְׂרֵה | workout/js/count.js: numWord / timeCue; workout/js/app.js: wireReps / minuteScreen; SAY_UI.perseverance | `number-16.wav` |
| `number-17` | שְׁבַע עֶשְׂרֵה | workout/js/count.js: numWord / timeCue; workout/js/app.js: wireReps / minuteScreen; SAY_UI.perseverance | `number-17.wav` |
| `number-18` | שְׁמוֹנֶה עֶשְׂרֵה | workout/js/count.js: numWord / timeCue; workout/js/app.js: wireReps / minuteScreen; SAY_UI.perseverance | `number-18.wav` |
| `number-19` | תְּשַׁע עֶשְׂרֵה | workout/js/count.js: numWord / timeCue; workout/js/app.js: wireReps / minuteScreen; SAY_UI.perseverance | `number-19.wav` |
| `number-20` | עֶשְׂרִים | workout/js/count.js: numWord / timeCue; workout/js/app.js: wireReps / minuteScreen; SAY_UI.perseverance | `number-20.wav` |
| `number-30` | שְׁלוֹשִׁים | workout/js/count.js: numWord / timeCue; workout/js/app.js: wireReps / minuteScreen; SAY_UI.perseverance | `number-30.wav` |
| `number-40` | אַרְבָּעִים | workout/js/count.js: numWord / timeCue; workout/js/app.js: wireReps / minuteScreen; SAY_UI.perseverance | `number-40.wav` |
| `number-50` | חֲמִשִּׁים | workout/js/count.js: numWord / timeCue; workout/js/app.js: wireReps / minuteScreen; SAY_UI.perseverance | `number-50.wav` |
| `number-60` | שִׁשִּׁים | workout/js/count.js: numWord / timeCue; workout/js/app.js: wireReps / minuteScreen; SAY_UI.perseverance | `number-60.wav` |
| `number-70` | שִׁבְעִים | workout/js/count.js: numWord / timeCue; workout/js/app.js: wireReps / minuteScreen; SAY_UI.perseverance | `number-70.wav` |
| `number-80` | שְׁמוֹנִים | workout/js/count.js: numWord / timeCue; workout/js/app.js: wireReps / minuteScreen; SAY_UI.perseverance | `number-80.wav` |
| `number-90` | תִּשְׁעִים | workout/js/count.js: numWord / timeCue; workout/js/app.js: wireReps / minuteScreen; SAY_UI.perseverance | `number-90.wav` |
| `number-and-1` | וְאַחַת | workout/js/count.js: numWord (אחדות אחרי עשרות) | `number-and-1.wav` |
| `number-and-2` | וְשְׁתַּיִם | workout/js/count.js: numWord (אחדות אחרי עשרות) | `number-and-2.wav` |
| `number-and-3` | וְשָׁלוֹשׁ | workout/js/count.js: numWord (אחדות אחרי עשרות) | `number-and-3.wav` |
| `number-and-4` | וְאַרְבַּע | workout/js/count.js: numWord (אחדות אחרי עשרות) | `number-and-4.wav` |
| `number-and-5` | וְחָמֵשׁ | workout/js/count.js: numWord (אחדות אחרי עשרות) | `number-and-5.wav` |
| `number-and-6` | וְשֵׁשׁ | workout/js/count.js: numWord (אחדות אחרי עשרות) | `number-and-6.wav` |
| `number-and-7` | וְשֶׁבַע | workout/js/count.js: numWord (אחדות אחרי עשרות) | `number-and-7.wav` |
| `number-and-8` | וְשְׁמוֹנֶה | workout/js/count.js: numWord (אחדות אחרי עשרות) | `number-and-8.wav` |
| `number-and-9` | וְתֵּשַׁע | workout/js/count.js: numWord (אחדות אחרי עשרות) | `number-and-9.wav` |
| `number-100` | מֵאָה | workout/js/say-ui.js: SAY_UI.perseverance (100 אימונים) | `number-100.wav` |
| `time-more` | עוֹד | workout/js/count.js: timeCue; workout/js/app.js: wireTimer | `time-more.wav` |
| `time-seconds` | שְׁנִיּוֹת | workout/js/count.js: timeCue; workout/js/app.js: wireTimer | `time-seconds.wav` |
| `start` | מַתְחִילִים! | workout/js/count.js: timeCue; workout/js/app.js: wireTimer | `start.wav` |
| `finished` | סִיַּמְתָּ! | workout/js/count.js: timeCue; workout/js/app.js: wireTimer | `finished.wav` |
| `encourage` | כָּל הַכָּבוֹד! | workout/js/app.js: wireReps / wireTimer | `encourage.wav` |
| `minute-end` | הַדַּקָּה הִסְתַּיְּמָה. כָּל תְּנוּעָה נֶחְשֶׁבֶת. | workout/js/app.js: minuteScreen | `minute-end.wav` |
| `minute-start` | מַתְחִילִים. בַּקֶּצֶב שֶׁלְּךָ. | workout/js/app.js: minuteScreen | `minute-start.wav` |
| `companion-upgraded` | הַדְּמוּת שֶׁלְּךָ הִשְׁתַּפְּרָה! גְּדֵלִים יַחַד, בַּקֶּצֶב שֶׁלְּךָ. | workout/js/app.js: donePhase; workout/js/companion.js: companionCard | `companion-upgraded.wav` |
| `thanks` | תּוֹדָה, רָשַׁמְתִּי. | workout/js/app.js: askFeedback (משוב ללא תוכנית) | `thanks.wav` |
| `program-free` | אימון חופשי | workout/js/app.js: free / adjustDifficulty | `program-free.wav` |
| `boost-before` | הָיָה קַל? מֵעַכְשָׁו | workout/js/say-ui.js: SAY_UI.adjust.boost; workout/js/app.js: adjustDifficulty | `boost-before.wav` |
| `boost-after` | עִם עוֹד קְצָת חֲזָרוֹת וּזְמַן. | workout/js/say-ui.js: SAY_UI.adjust.boost; workout/js/app.js: adjustDifficulty | `boost-after.wav` |
| `swaps-before` | הָיָה קַל? בְּ | workout/js/say-ui.js: SAY_UI.adjust.swaps; workout/js/app.js: adjustDifficulty | `swaps-before.wav` |
| `swaps-after` | נִכְנָסִים תַּרְגִּילִים קָשִׁים יוֹתֵר. | workout/js/say-ui.js: SAY_UI.adjust.swaps; workout/js/app.js: adjustDifficulty | `swaps-after.wav` |
| `level-before` | וָאוּ. עָלִיתָ לְרָמָה | workout/js/say-ui.js: SAY_UI.adjust.level; workout/js/app.js: adjustDifficulty | `level-before.wav` |
| `level-after` | בְּכָל הָאִמּוּנִים! | workout/js/say-ui.js: SAY_UI.adjust.level; workout/js/app.js: adjustDifficulty | `level-after.wav` |
| `down-before` | הוֹרַדְתִּי לְרָמָה | workout/js/say-ui.js: SAY_UI.adjust.downLevel; workout/js/app.js: adjustDifficulty | `down-before.wav` |
| `down-after` | לְאַט לְאַט בּוֹנִים כּוֹחַ. | workout/js/say-ui.js: SAY_UI.adjust.downLevel; workout/js/app.js: adjustDifficulty | `down-after.wav` |
| `week-before` | כָּל הַכָּבוֹד! זֶה הָאִמּוּן | workout/js/say-ui.js: SAY_UI.perseverance; workout/js/app.js: askFeedback | `week-before.wav` |
| `week-after` | שֶׁלְּךָ הַשָּׁבוּעַ. | workout/js/say-ui.js: SAY_UI.perseverance; workout/js/app.js: askFeedback | `week-after.wav` |
| `number-label` | מִסְפָּר | workout/js/say-ui.js: SAY_UI.perseverance; workout/js/app.js: askFeedback | `number-label.wav` |
| `streak-after` | יָמִים בְּרֶצֶף! | workout/js/say-ui.js: SAY_UI.perseverance; workout/js/app.js: askFeedback | `streak-after.wav` |
| `first-workout` | הָאִמּוּן הָרִאשׁוֹן בִּכְלָל. הַתְחָלָה מְעֻלָּה! | workout/js/say-ui.js: SAY_UI.perseverance; workout/js/app.js: askFeedback | `first-workout.wav` |
| `milestone-before` | וְזֶה הָאִמּוּן מִסְפָּר | workout/js/say-ui.js: SAY_UI.perseverance; workout/js/app.js: askFeedback | `milestone-before.wav` |
| `milestone-after` | שֶׁלְּךָ. וָאוּ! | workout/js/say-ui.js: SAY_UI.perseverance; workout/js/app.js: askFeedback | `milestone-after.wav` |
| `cost-two-short` | שִׂים לֵב, הַמִּשְׂחָק הַזֶּה עוֹלֶה שְׁתֵּי מַתָּנוֹת. | workout/js/app.js: arcade (גיבוי ל-SAY_UI.costTwo) | `cost-two-short.wav` |
| `celebration-goal` | Gooooooooooool! | workout/js/games/celebrate.js / celebrate3d.js: say; הקלטה קיימת workout/snd/goal.mp4 | `celebration-goal.wav` |
| `celebration-dunk` | בּוּם! | workout/js/games/celebrate.js / celebrate3d.js: say; הקלטה קיימת workout/snd/dunk.mp4 | `celebration-dunk.wav` |
| `celebration-three` | סַל! | workout/js/games/celebrate.js / celebrate3d.js: say; הקלטה קיימת workout/snd/three.mp4 | `celebration-three.wav` |
| `celebration-sprint` | מָקוֹם רִאשׁוֹן! | workout/js/games/celebrate.js / celebrate3d.js: say; הקלטה קיימת workout/snd/sprint.mp4 | `celebration-sprint.wav` |
