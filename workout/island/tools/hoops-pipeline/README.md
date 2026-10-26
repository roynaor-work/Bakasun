# צינור הדמויות של הכדורסל

הקבצים כאן בונים מחדש את `assets/models/hoops-*.glb` ואת `assets/textures/hoops-crowd.webp`. הם לא נטענים במשחק.

## דרישות

- Blender 4.2 (נבדק עם 4.2.9 בלי ממשק, `--background`).
- ההרחבה MPFB2 של MakeHuman, עם נכסי הליבה (עור, עיניים, שיער, גבות, ריסים, נעליים, בגדים). קובצי ‎`.npz`‎ מומרים ל־‎`.obj`‎ עם `npz2obj.py`.
- קובצי BVH של CMU Motion Capture (המרת Shriinivas/cmubvh) בתיקייה שמוגדרת ב־`BVH_DIR`.

## סדר הבנייה

1. `build_player.py` בונה גוף לפי `specs.json` (גובה, מבנה, עור, שיער), עם שלד mixamo של 52 עצמות.
2. `export_glb.py` אופה את צורות הגוף, מנרמל משקלים (עד 4 לכל קודקוד), בונה מדים (`uniform.py`) ומייצא GLB.
3. `retarget.py` ממפה קליפים מ־CMU לשלד לפי `clips_lib.json` (מסגרות, אירועי שחרור/שיא, שיקוף).
4. `pack_glb.py` מכווץ: KHR_mesh_quantization, טקסטורות JPEG/PNG מוגבלות, ערוצי אנימציה מיותרים מוסרים.
5. `crowd.py` מרנדר את אטלס הקהל.

## רישיונות

ראו `ASSETS.md`, סעיף "כדורסל מקצועי באי".
