# דגלי URL בבנייה לחנות

נוצר אוטומטית על ידי `store/scripts/build-web.mjs` לפי `store/flag-policy.json`. לא לערוך ידנית.

## איך זה עובד

בעותק הבנייה (`store/www`) כל קריאה ל-`location.search` מוחלפת בקבוע `''` (263 קריאות ב-128 קבצים). לכן כל דגל מקבל את ברירת המחדל שכבר כתובה בקוד. האתר החי והקוד במקור לא משתנים. הקוד של נתיבי החזרה לא נמחק: הוא נשאר כנתיב מת, כי מחיקה היא שינוי בקוד המשחק.

| שינוי נוסף בעותק | קובץ | למה |
|---|---|---|
| offline-worker-off | `ui/offline.mjs` | בחנות כל הנכסים בתוך החבילה. עובד השירות וההורדה לפי משחק היו מעתיקים שוב כ-100MB למטמון. offlineSupported() מחזיר false, לכן העובד לא נרשם ובדיקת הגרסה לא פונה לרשת. |
| boar-bench-hash | `minigames/boar-island/game.js` | כתובת #bench מפעילה מצב מדידה של משחק החזירים. אין דרך להזין כתובת באפליקציה, והמצב לא משתתף בהגשה. |
| offline-panel-hidden | `ui/offline-panel.mjs` | חלונית "הורדת המשחקים למכשיר" (הורדה, בדיקת עדכון, איך מתקינים את האפליקציה) מיותרת בחנות: הכול כבר בחבילה. החלונית מוחלפת באלמנט מוסתר, והפונקציות המקוריות נשארות בקובץ. |

סה"כ 235 מפתחות נמצאו בקוד הריצה (בלי בדיקות, כלים ועמודי תצוגה של design/).

| קבוצה | כמות |
|---|---:|
| פרוטוקול פנימי של חלון המשחק (נשאר) | 4 |
| שומרי בטיחות והתאוששות: נשארים כברירת מחדל קבועה | 13 |
| פרטיות | 1 |
| ממשק ילדים | 1 |
| חזרה לגרסה קודמת (ברירת מחדל דלוקה): הוסרו | 141 |
| מתגי התנהגות ישנה או הצטרפות (ברירת מחדל כבויה): הוסרו | 7 |
| תכונות הצטרפות שהן החלטת מוצר: הוסרו, נשארות כבויות | 17 |
| פיתוח ובדיקות: הוסרו | 8 |
| כוונון ומדידה: הוסרו | 33 |
| נקראו ביד לפי הקוד: הוסרו | 10 |

## פרוטוקול פנימי של חלון המשחק (נשאר)

החלטה: נשאר. חלון המשחק (iframe) מקבל את הפרמטרים מהכתובת שהמשחק ההורה בונה (island, v, kidUx ועוד). זה פרוטוקול פנימי, לא דגל שמשתמש מזין. ההורה כבר בנוי על ברירות המחדל, ולכן אין דגל ניסוי שמגיע לשם.

| דגל | ברירת מחדל בקוד | קבצים |
|---|---|---:|
| `island` | ערך או דלוק | 1 |
| `phoneFixF` | דלוק | 1 |
| `qa` | ערך או דלוק | 1 |
| `touch` | כבוי | 1 |

## שומרי בטיחות והתאוששות: נשארים כברירת מחדל קבועה

החלטה: נשאר כברירת מחדל קבועה מגינה. שומר התאוששות או בטיחות. הנתיב בקוד נשאר, ברירת המחדל היא המגינה, רק מתג הכתובת הוסר.

| דגל | ברירת מחדל בקוד | קבצים |
|---|---|---:|
| `adapt` | כבוי | 2 |
| `alpineModel` | דלוק | 1 |
| `autodownload` | דלוק | 1 |
| `fireContextRecovery` | דלוק | 1 |
| `fireLoadRecovery` | דלוק | 1 |
| `fireRoomBarrier` | דלוק | 2 |
| `hoopsCrowd3d` | ערך או דלוק | 1 |
| `hoopsRollbackOffline` | דלוק | 1 |
| `kidUxOff` | ערך או דלוק | 1 |
| `loadStuckMs` | ערך או דלוק | 1 |
| `quality` | כבוי | 6 |
| `soccerCrowd3d` | ערך או דלוק | 1 |
| `soccerKitLines` | דלוק | 1 |

## פרטיות

החלטה: הוסר, נשאר המצב המגן. privacy=v246 מחזיר קולות רשת (הטקסט יוצא מהמכשיר). בלי הדגל מקריאים רק קולות שמותקנים במכשיר.

| דגל | ברירת מחדל בקוד | קבצים |
|---|---|---:|
| `privacy` | כבוי | 2 |

## ממשק ילדים

החלטה: הוסר, מוגש הממשק המשופר. kidUx=0 מחזיר את הממשק הקודם ו-kidUx=005,012 בוחר תיקונים. בדף התיקונים דלוקים כברירת מחדל.

| דגל | ברירת מחדל בקוד | קבצים |
|---|---|---:|
| `kidUx` | ערך או דלוק | 2 |

## חזרה לגרסה קודמת (ברירת מחדל דלוקה): הוסרו

החלטה: הוסר, מוגש הנתיב החדש (ברירת מחדל דלוקה). מתג שמחזיר גרסה קודמת (=0, =old, =v24). הגרסה הקודמת לא מוגשת.

| דגל | ברירת מחדל בקוד | קבצים |
|---|---|---:|
| `alienArsenal` | דלוק | 1 |
| `alienEnemyFire` | דלוק | 1 |
| `alienFire` | דלוק | 1 |
| `alienHud` | דלוק | 2 |
| `alienHull` | דלוק | 1 |
| `alienLaserBurst` | דלוק | 1 |
| `alienLaserSeen` | דלוק | 1 |
| `alienMove` | דלוק | 1 |
| `alienPierceFix` | דלוק | 1 |
| `alienRefill` | דלוק | 1 |
| `alienText` | דלוק | 1 |
| `alienV10` | דלוק | 1 |
| `alienV11` | דלוק | 1 |
| `alienV12` | דלוק | 1 |
| `alienV13` | דלוק | 1 |
| `alienV14` | דלוק | 1 |
| `alienV15` | דלוק | 1 |
| `alienV9` | דלוק | 1 |
| `alienVulcan` | דלוק | 1 |
| `alpineAir` | דלוק | 1 |
| `alpineFall` | דלוק | 1 |
| `alpineHistoryFix` | דלוק | 2 |
| `alpineLeague` | דלוק | 1 |
| `alpineObs` | דלוק | 1 |
| `alpineRunner` | דלוק | 1 |
| `alpineRunnerPatch` | דלוק | 1 |
| `alpineStartLights` | דלוק | 1 |
| `alpineYawFix` | דלוק | 1 |
| `athleteBody` | דלוק | 3 |
| `athleteBodyV22` | דלוק | 1 |
| `catch` | דלוק | 1 |
| `catchAssets` | דלוק | 1 |
| `catchAssist` | דלוק | 1 |
| `catchBurst` | דלוק | 1 |
| `catchElements` | דלוק | 1 |
| `catchEngine` | דלוק | 1 |
| `catchIntro` | דלוק | 1 |
| `catchSound8` | דלוק | 1 |
| `catchV2` | דלוק | 1 |
| `catchV4` | דלוק | 1 |
| `catchV5` | דלוק | 1 |
| `catchV6` | דלוק | 1 |
| `catchWeapons` | דלוק | 1 |
| `catchWeaponsFix` | דלוק | 1 |
| `cityMissions` | דלוק | 1 |
| `defenseV7` | דלוק | 1 |
| `fireControls` | דלוק | 1 |
| `fireKeyboard` | דלוק | 1 |
| `fireV7` | דלוק | 1 |
| `hoopsLook` | דלוק | 1 |
| `hoopsMotion249` | דלוק | 1 |
| `hoopsPlay` | דלוק | 1 |
| `hoopsPolish` | דלוק | 1 |
| `hoopsV249` | דלוק | 2 |
| `keeperKick` | דלוק | 1 |
| `learningV2` | דלוק | 1 |
| `loadClip` | דלוק | 1 |
| `navalBattle` | דלוק | 1 |
| `navalV7` | דלוק | 1 |
| `phoneFixA` | דלוק | 2 |
| `phoneFixC` | דלוק | 1 |
| `phoneFixD` | דלוק | 2 |
| `phoneFixE` | דלוק | 1 |
| `phoneFixes` | דלוק | 8 |
| `progressBoard` | דלוק | 2 |
| `racingAi` | דלוק | 1 |
| `racingAudioHold` | דלוק | 1 |
| `racingAudioV3` | דלוק | 1 |
| `racingAudioV5` | דלוק | 1 |
| `racingAudioV6` | דלוק | 1 |
| `racingBroadcast` | דלוק | 2 |
| `racingBroadcastArt` | דלוק | 1 |
| `racingCam` | דלוק | 1 |
| `racingCrash` | דלוק | 1 |
| `racingCrashAssets` | דלוק | 1 |
| `racingCrashFx` | דלוק | 2 |
| `racingDrift` | דלוק | 1 |
| `racingEngine` | דלוק | 1 |
| `racingEnv` | דלוק | 1 |
| `racingErs` | דלוק | 1 |
| `racingF1Field` | דלוק | 1 |
| `racingFeel` | דלוק | 1 |
| `racingFormulaAll` | דלוק | 1 |
| `racingGrid` | דלוק | 2 |
| `racingGrind` | דלוק | 1 |
| `racingIdle` | דלוק | 1 |
| `racingLeague` | דלוק | 1 |
| `racingLeagueArt` | דלוק | 1 |
| `racingLevels` | דלוק | 1 |
| `racingLongLeague` | דלוק | 1 |
| `racingLook` | דלוק | 4 |
| `racingPitCrew` | דלוק | 1 |
| `racingPitSeq` | דלוק | 2 |
| `racingPodium` | דלוק | 1 |
| `racingRec` | דלוק | 1 |
| `racingRevShift` | דלוק | 1 |
| `racingSamples` | דלוק | 2 |
| `racingShiftMap` | דלוק | 1 |
| `racingShortKink` | דלוק | 1 |
| `racingSoundStart` | דלוק | 1 |
| `racingText` | דלוק | 1 |
| `racingTight` | דלוק | 1 |
| `racingTopCap` | דלוק | 1 |
| `racingTopSound` | דלוק | 1 |
| `racingTower` | דלוק | 1 |
| `racingTracksV3` | דלוק | 1 |
| `racingTyreHud` | דלוק | 1 |
| `soccerHeaders` | דלוק | 1 |
| `soccerKeeperCrowd` | דלוק | 1 |
| `soccerMotion` | דלוק | 1 |
| `soccerMotionV10` | דלוק | 1 |
| `soccerMotionV12` | דלוק | 1 |
| `soccerMotionV9` | דלוק | 1 |
| `soccerRunV9` | דלוק | 1 |
| `soccerSlideSlow` | דלוק | 1 |
| `soccerV6` | דלוק | 1 |
| `soccerV8` | דלוק | 1 |
| `tennisAudioV246` | דלוק | 1 |
| `tennisBar` | דלוק | 1 |
| `tennisCalloutPack` | דלוק | 1 |
| `tennisCalloutRec` | דלוק | 1 |
| `tennisCallouts` | דלוק | 1 |
| `tennisCalloutWords` | דלוק | 1 |
| `tennisCrowdAudio` | דלוק | 1 |
| `tennisCrowdRec` | דלוק | 1 |
| `tennisDeep` | דלוק | 1 |
| `tennisDrop` | דלוק | 1 |
| `tennisGrip` | דלוק | 1 |
| `tennisHold` | דלוק | 1 |
| `tennisLoad` | דלוק | 1 |
| `tennisMotionV1` | דלוק | 1 |
| `tennisMotionV3` | דלוק | 2 |
| `tennisPlayOut` | דלוק | 1 |
| `tennisPose` | דלוק | 1 |
| `tennisReady` | דלוק | 1 |
| `tennisReceive` | דלוק | 1 |
| `tennisSoftDrop` | דלוק | 1 |
| `tennisUi` | דלוק | 1 |
| `tennisV9` | דלוק | 1 |
| `uiIcons` | דלוק | 1 |
| `upgradeOffer` | דלוק | 1 |

## מתגי התנהגות ישנה או הצטרפות (ברירת מחדל כבויה): הוסרו

החלטה: הוסר, נשאר כבוי. מתג הצטרפות או התנהגות ישנה, כבוי כברירת מחדל.

| דגל | ברירת מחדל בקוד | קבצים |
|---|---|---:|
| `alienTaps` | כבוי | 1 |
| `hoopsAI` | כבוי | 1 |
| `racingPass` | כבוי | 1 |
| `soccerCuts` | כבוי | 1 |
| `strings` | כבוי | 1 |
| `tennisOut` | כבוי | 1 |
| `tennisReturn` | כבוי | 1 |

## תכונות הצטרפות שהן החלטת מוצר: הוסרו, נשארות כבויות

החלטה: הוסר, נשאר כבוי (רועי מאשר). תכונה שמצטרפים אליה ומשנה את המשחק. הגרסה המוגשת נשארת בברירת המחדל (כבוי). אם רועי רוצה אותה בגרסת החנות היא נכנסת ל-pin.

| דגל | ברירת מחדל בקוד | קבצים |
|---|---|---:|
| `balanceFireCertificate` | כבוי | 1 |
| `balanceSoccerGoals` | כבוי | 1 |
| `boarsLevels` | לפי ערך | 3 |
| `cityProgress` | לפי ערך | 2 |
| `cityProgression` | לפי ערך | 2 |
| `games` | כבוי | 1 |
| `hoopsSqueak` | כבוי | 1 |
| `navalVoice` | כבוי | 1 |
| `racingAutoLift` | כבוי | 1 |
| `racingEngineLoops` | כבוי | 1 |
| `racingKinkAll` | כבוי | 1 |
| `racingShiftBeep` | כבוי | 1 |
| `soccerAutoSprint` | כבוי | 1 |
| `soccerBed` | כבוי | 1 |
| `soccerCrowdHiss` | כבוי | 1 |
| `soccerKeeperV11` | כבוי | 1 |
| `tennisVoiceRec` | כבוי | 1 |

## פיתוח ובדיקות: הוסרו

החלטה: הוסר, ברירת מחדל קבועה. מתג פיתוח, בדיקות, תצוגה מקדימה או כשל מכוון. לא חלק מההתנהגות שמוגשת.

| דגל | ברירת מחדל בקוד | קבצים |
|---|---|---:|
| `autoIdleMs` | ערך או דלוק | 1 |
| `cityPreview` | ערך או דלוק | 1 |
| `dev` | כבוי | 17 |
| `env` | ערך או דלוק | 1 |
| `hoopsAuto` | כבוי | 1 |
| `hoopsFail` | כבוי | 1 |
| `v` | ערך או דלוק | 1 |
| `v25` | כבוי | 1 |

## כוונון ומדידה: הוסרו

החלטה: הוסר, ברירת מחדל קבועה. מתג מספרי או מדידה לכוונון. ברירת המחדל היא הערך שכוונן.

| דגל | ברירת מחדל בקוד | קבצים |
|---|---|---:|
| `alpineRunnerSeed` | ערך או דלוק | 1 |
| `catchSiren` | ערך או דלוק | 1 |
| `fingerCurl` | ערך או דלוק | 1 |
| `fireLevel` | ערך או דלוק | 1 |
| `hoopsCharacters` | ערך או דלוק | 1 |
| `hoopsLabels` | כבוי | 1 |
| `hoopsProfile` | ערך או דלוק | 1 |
| `hoopsQuality` | ערך או דלוק | 1 |
| `hoopsV241` | דלוק | 1 |
| `racingAiCorner` | ערך או דלוק | 1 |
| `racingField` | ערך או דלוק | 1 |
| `racingFormulaCar` | ערך או דלוק | 1 |
| `racingKink` | ערך או דלוק | 1 |
| `racingKinkAmp` | ערך או דלוק | 1 |
| `racingKinkFade` | ערך או דלוק | 1 |
| `racingRoundSigma` | ערך או דלוק | 1 |
| `racingShift` | ערך או דלוק | 1 |
| `racingShortR` | ערך או דלוק | 1 |
| `racingTightA` | ערך או דלוק | 1 |
| `racingTracks` | ערך או דלוק | 3 |
| `racingWheel` | ערך או דלוק | 1 |
| `soccerAI` | ערך או דלוק | 1 |
| `soccerChars` | ערך או דלוק | 2 |
| `soccerFeel` | ערך או דלוק | 1 |
| `soccerFormation` | ערך או דלוק | 1 |
| `soccerFull` | ערך או דלוק | 1 |
| `soccerRules` | ערך או דלוק | 1 |
| `soccerShow` | ערך או דלוק | 1 |
| `soccerTeams` | ערך או דלוק | 2 |
| `soccerTier` | ערך או דלוק | 1 |
| `v2samples` | ערך או דלוק | 1 |
| `v2scale` | ערך או דלוק | 1 |
| `v2width` | ערך או דלוק | 1 |

## נקראו ביד לפי הקוד: הוסרו

החלטה: הוסר, ברירת מחדל קבועה (נקרא ביד). נקרא דרך פונקציית עזר. ברירת המחדל היא מה שקורה כשהוא חסר.

| דגל | ברירת מחדל בקוד | קבצים |
|---|---|---:|
| `alienLaser` | ערך או דלוק | 1 |
| `alpineThemes` | לפי ערך | 2 |
| `boar` | לפי ערך | 3 |
| `boarAim` | לפי ערך | 2 |
| `boarFire` | לפי ערך | 2 |
| `boarFx` | לפי ערך | 2 |
| `boarHud` | לפי ערך | 2 |
| `boarStick` | לפי ערך | 2 |
| `fireTruck` | ערך או דלוק | 1 |
| `tennisMeter` | לפי ערך | 1 |

## עמודי תצוגה בתוך design/

7 קבצי תצוגה וסקירה בתוך design/ קוראים גם הם דגלים. הם לא נטענים מהמשחק, והקריאה בהם מוחלפת באותו קבוע.
