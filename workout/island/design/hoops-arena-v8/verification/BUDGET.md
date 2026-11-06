# תקציב משולשים — אחרי פענוח Draco

נוצר מתוך הקבצים שנמסרו, ומ־factories אמיתיות של הגאומטריה הדינמית. אין הסתמכות על מספרי תקציב במניפסט. ספירת מעטפת כוללת את מספר מופעי nodes, ולא רק גאומטריה ייחודית. כל 3 רמות נבחנות נגד תקרה קשיחה של 35,000 בשתי הגשות מלאות.

| LOD | GLB בתים | מעטפת | קהל+מושבים | כדור | מסכים | חי | ריפליי + חלונית | צופים |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | 82964 | 6594 | 8336 | 224 | 16 | **15170** | **30340** | 2084 |
| 1 | 73860 | 4958 | 7744 | 224 | 16 | **12942** | **25884** | 1936 |
| 2 | 62188 | 3078 | 4000 | 224 | 16 | **7318** | **14636** | 1000 |

| חלק GLB | LOD0 | LOD1 | LOD2 |
|---|---:|---:|---:|
| court__parquet | 2 | 2 | 2 |
| court__structure | 12 | 12 | 12 |
| bowl__black | 228 | 228 | 12 |
| bowl__concrete | 1536 | 1536 | 912 |
| bowl__structure | 48 | 48 | 48 |
| ribbon__teal-led | 24 | 24 | 24 |
| ribbon__amber-led | 24 | 24 | 24 |
| wall-north__structure | 12 | 12 | 12 |
| wall-west__structure | 12 | 12 | 12 |
| bowl__steel | 312 | 312 | 0 |
| railings__steel | 480 | 32 | 32 |
| wall-south__structure | 12 | 12 | 12 |
| wall-east__structure | 12 | 12 | 12 |
| aisles__warm-led | 84 | 84 | 84 |
| roof__steel | 400 | 384 | 208 |
| roof__structure | 388 | 24 | 24 |
| lighting__black | 144 | 144 | 144 |
| lighting__warm-led | 24 | 24 | 24 |
| scoreboard__black | 12 | 12 | 12 |
| scoreboard__teal-led | 12 | 12 | 12 |
| scoreboard__structure | 12 | 12 | 12 |
| scoreboard__steel | 16 | 16 | 16 |
| basket-home__teal | 12 | 12 | 12 |
| basket-home__black | 36 | 36 | 36 |
| basket-home__steel | 48 | 24 | 24 |
| basket-home__glass | 12 | 12 | 12 |
| basket-home__white | 96 | 96 | 96 |
| basket-home__rim | 492 | 300 | 204 |
| basket-home__net | 360 | 300 | 192 |
| basket-away__amber | 12 | 12 | 12 |
| basket-away__black | 36 | 36 | 36 |
| basket-away__steel | 48 | 24 | 24 |
| basket-away__glass | 12 | 12 | 12 |
| basket-away__white | 96 | 96 | 96 |
| basket-away__rim | 492 | 300 | 204 |
| basket-away__net | 360 | 300 | 192 |
| courtside__teal | 192 | 192 | 120 |
| courtside__steel | 268 | 12 | 12 |
| courtside__amber | 192 | 192 | 120 |
| courtside__black | 12 | 12 | 12 |
| courtside__teal-led | 12 | 12 | 12 |

קהל ומושבים: שני InstancedMesh בכל LOD. כל צופה 2 משולשים וכל מושב 2; משטחי alpha נצבעים במעבר יחיד. שמונת המסכים הם 16 משולשים. הכדור האופציונלי 224. מספרי רינדור בפועל יכולים להיות נמוכים יותר בגלל frustum culling וחיתוך אדריכלי של הגג/קיר קרוב. אין צללים דינמיים, PMREM בזמן טעינה או מעבר השתקפות סצנה נוסף. קובץ הבדיקה מפענח את כל ה־primitives, מאמת מספרי פנים/אינדקסים, UV וערכי attributes סופיים, וסופר את אותן factories שהמשחק טוען.

הרצה ללא התקנת תלויות: `node --test` מתוך תיקיית החבילה.
