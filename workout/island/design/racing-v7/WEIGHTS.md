# משקלי נכסים ובדיקת קבצים

נוצר אוטומטית מנתוני glTF מפוענחים; MB = 1,000,000 bytes. ״ברשתות״ סופר כל mesh שנשמר בקובץ פעם אחת. ״במופע GLB״ סופר את כל צומתי הסצנה, כולל ארבעה גלגלים כשהגאומטריה שלהם משותפת. בתפאורה זו סצנת ספריית האביזרים; מספר המופעים וקריאות הציור בעולם נמדד בנפרד ב-PERFORMANCE.md.

| קובץ | משולשים ברשתות | משולשים במופע GLB | bytes | MB | primitives בקובץ | טקסטורות |
|---|---:|---:|---:|---:|---:|---|
| assets/cars/apex-lod0.glb | 16,563 | 21,171 | 93,520 | 0.0935 | 10 | ללא — חומרי PBR |
| assets/cars/apex-lod1.glb | 7,902 | 11,214 | 57,700 | 0.0577 | 10 | ללא — חומרי PBR |
| assets/cars/apex-lod2.glb | 2,864 | 4,064 | 28,900 | 0.0289 | 9 | ללא — חומרי PBR |
| assets/cars/prism-lod0.glb | 16,642 | 20,962 | 94,568 | 0.0946 | 10 | ללא — חומרי PBR |
| assets/cars/prism-lod1.glb | 7,980 | 11,004 | 58,052 | 0.0581 | 10 | ללא — חומרי PBR |
| assets/cars/prism-lod2.glb | 3,062 | 4,334 | 29,612 | 0.0296 | 9 | ללא — חומרי PBR |
| assets/cars/solis-lod0.glb | 14,170 | 18,418 | 80,544 | 0.0805 | 11 | ללא — חומרי PBR |
| assets/cars/solis-lod1.glb | 7,446 | 10,398 | 52,172 | 0.0522 | 11 | ללא — חומרי PBR |
| assets/cars/solis-lod2.glb | 3,396 | 4,596 | 29,372 | 0.0294 | 10 | ללא — חומרי PBR |
| assets/cars/vector-lod0.glb | 17,601 | 22,209 | 97,428 | 0.0974 | 10 | ללא — חומרי PBR |
| assets/cars/vector-lod1.glb | 8,939 | 12,251 | 61,132 | 0.0611 | 10 | ללא — חומרי PBR |
| assets/cars/vector-lod2.glb | 3,470 | 4,670 | 30,824 | 0.0308 | 9 | ללא — חומרי PBR |
| assets/cars/velour-lod0.glb | 16,581 | 20,973 | 93,540 | 0.0935 | 10 | ללא — חומרי PBR |
| assets/cars/velour-lod1.glb | 7,920 | 11,016 | 57,568 | 0.0576 | 10 | ללא — חומרי PBR |
| assets/cars/velour-lod2.glb | 3,001 | 4,345 | 29,572 | 0.0296 | 9 | ללא — חומרי PBR |
| assets/crowd/spectator.glb | 462 | 462 | 7,544 | 0.0075 | 1 | 256×256 |
| assets/tracks/coast.glb | 15,648 | 15,648 | 28,472 | 0.0285 | 3 | ללא — חומרי PBR |
| assets/tracks/neon.glb | 15,648 | 15,648 | 30,568 | 0.0306 | 3 | ללא — חומרי PBR |
| assets/tracks/props.glb | 2,686 | 2,686 | 30,432 | 0.0304 | 26 | ללא — חומרי PBR |
| assets/tracks/ridge.glb | 15,648 | 15,648 | 42,580 | 0.0426 | 3 | ללא — חומרי PBR |

| טקסטורה | מידות | bytes | MB | זיכרון RGBA + mipmaps, בקירוב |
|---|---|---:|---:|---:|
| textures/asphalt-color.webp | 1024×1024 | 245,406 | 0.2454 | 5.59 MB |
| textures/asphalt-normal.png | 512×512 | 236,472 | 0.2365 | 1.40 MB |
| textures/asphalt-orm.webp | 1024×1024 | 13,478 | 0.0135 | 5.59 MB |
| textures/spectator-atlas.png | 256×256 | 621 | 0.0006 | 0.35 MB |
| textures/tire-smoke.png | 64×64 | 2,691 | 0.0027 | 0.02 MB |

מפות שנוצרות בזיכרון: השתקפויות 1024×512 משותפות, שלטים 512×128, כתמי תאורה 128×128. לכל דמות קהל אטלס אחד 256×256. אין טקסטורות נפרדות לכל מופע קהל.

בדיקות: 489; נכשלו: 0. פירוט, SHA-256 ותוצאות מאמת Khronos ב-verification/assets.json.

## קובצי תצוגה, תלויות וראיות

הטבלה לעיל היא הגאומטריה והמרקמים. המלאי המלא, כולל כל צילום, נמצא ב-verification/files.csv.

| קובץ | bytes | MB |
|---|---:|---:|
| offline.html | 2,624,402 | 2.6244 |
| index.html | 9,700 | 0.0097 |
| style.css | 15,294 | 0.0153 |
| app.mjs | 21,290 | 0.0213 |
| world.mjs | 24,636 | 0.0246 |
| loader.mjs | 5,363 | 0.0054 |
| effects.mjs | 8,903 | 0.0089 |
| vendor/three.module.js | 670,681 | 0.6707 |
| vendor/GLTFLoader.js | 108,527 | 0.1085 |
| vendor/draco/draco_decoder.wasm | 192,420 | 0.1924 |
| verification/framing.json | 1,482,143 | 1.4821 |
| verification/soak.json | 607,537 | 0.6075 |
| verification/performance-final.json | 1,249,015 | 1.2490 |
| verification/stability.png | 278,675 | 0.2787 |
| REPORT.md | 13,359 | 0.0134 |
| review.html | 6,296 | 0.0063 |

מפות נוספות שנוצרות בזיכרון: אור פנס 128×256 וצל מגע 64×64. נתוני משולשים אינם חלים על HTML, קוד, JSON או תמונת מסך. גרסת HTML העצמית משכפלת את נכסי הריצה לצורך פתיחה כקובץ יחיד; אין לסכום אותה עם הנכסים המופרדים כמשקל טעינה יחיד.
