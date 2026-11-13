#!/usr/bin/env python3
"""Write the exact per-file provenance ledger and payload SHA-256 inventory.

Original source, CC0-1.0. Run after build_assets.py and capture_previews.py.
"""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RECURSIVE_DOCUMENTS = {"LICENSES.md", "REPORT.md", "asset-inventory.json"}


def source_for(name):
    if name.startswith(("themes/", "shared/")) or name in {"manifest.json", "levels.json"}:
        return "source/build_assets.py"
    if name.startswith("previews/"):
        return "source/capture_previews.py + preview.mjs + original models/textures"
    if name in {"LICENSES.md", "asset-inventory.json"}:
        return "source/catalogue.py"
    return "original authored source; this file"


def main():
    files = {p.relative_to(ROOT).as_posix(): p for p in ROOT.rglob("*") if p.is_file() and "__pycache__" not in p.parts}
    names = sorted(set(files) | RECURSIVE_DOCUMENTS)
    records = []
    for name in names:
        if name in RECURSIVE_DOCUMENTS:
            continue
        data = files[name].read_bytes()
        records.append(dict(path=name, bytes=len(data), sha256=hashlib.sha256(data).hexdigest(), source=source_for(name), license="CC0-1.0"))
    inventory = dict(schemaVersion=1, license="CC0-1.0", originalArtwork=True, note="Digests exclude this inventory, REPORT.md and LICENSES.md to avoid recursive document hashes. The license ledger enumerates every file.", files=records)
    (ROOT / "asset-inventory.json").write_text(json.dumps(inventory, ensure_ascii=False, indent=2) + "\n")
    introduction = """# מקורות ורישיונות — alpine-themes-v1

כל הקבצים החדשים בתיקייה זו הם יצירה מקורית שנוצרה למשימה זו ב־13 בנובמבר 2026: גאומטריה, טקסטורות, שמיים, חלקיקים, פריסות שלבים, תצוגה, קוד מקור ותיעוד. לא הועתקו נכסי צד שלישי, מותגים, פונטים, תמונות או מודלים.

כל התרומות המקוריות בתיקייה זו מוקדשות לנחלת הכלל לפי **CC0 1.0 Universal (SPDX: CC0-1.0)**. ככל שוויתור על הזכויות אינו אפשרי, חלה הרשאת הגיבוי של CC0. מותר שימוש מסחרי, שינוי, שילוב והפצה ללא דרישת ייחוס. [נוסח הרישיון המלא](https://creativecommons.org/publicdomain/zero/1.0/legalcode).

## מקור היצירות

- `source/build_assets.py`: גאומטריה מקורית מתוך קוד, PNG מתוך נוסחאות וצורות גאומטריות מקוריות, צבעים ומיפוי 30 המסלולים. ללא הורדת מדיה וללא חומרי גלם חיצוניים.
- `source/capture_previews.py`: ייצוא ישיר של קנבס התצוגה אל PNG; התוכן החזותי הוא המודלים והטקסטורות המקוריים של החבילה. ללא עיבוד תמונה נוסף.
- `preview.html`, `preview.css`, `preview.mjs`: קוד מקור ועיצוב מקוריים. קורא ה־GLB המצומצם נכתב לחבילה זו; הוא אינו העתק של GLTFLoader.
- `source/catalogue.py`: יצירת הרשימה המדויקת שלהלן ושל `asset-inventory.json` עם גיבובי SHA-256.
- שאר קובצי המקור והתיעוד נכתבו במיוחד למשימה זו; הקובץ עצמו הוא המקור.

## תלות קיימת במאגר, מחוץ לחבילה

התצוגה משתמשת ב־`workout/3d/lib/three.module.min.js` הקיים במאגר, Three.js r160, ברישיון **MIT**, Copyright 2010–2023 Three.js Authors. [מקור ורישיון רשמיים](https://github.com/mrdoob/three.js/blob/r160/LICENSE). הוא אינו מועתק לתיקייה זו ואינו מקבל רישיון CC0. פונטים הם פונטי מערכת. Python, NumPy, Pillow, Playwright ו־Chromium הם כלי בנייה בלבד ואינם נכללים בחבילה. לא נכללים Draco, קוד מפענח או נכסים דחוסים באמצעותו.

## רישום מדויק לכל קובץ חדש

כל שורה להלן היא יצירה מקורית; `source` מציין את המחולל, או את קובץ המקור עצמו. הנתיבים יחסיים לתיקייה זו.

| קובץ | מקור | רישיון |
|---|---|---|
"""
    rows = [f"| `{name}` | `{source_for(name)}` | CC0-1.0 |" for name in names]
    (ROOT / "LICENSES.md").write_text(introduction + "\n".join(rows) + "\n")
    print(json.dumps(dict(licensedFiles=len(names), payloadDigests=len(records), payloadBytes=sum(r["bytes"] for r in records)), indent=2))


if __name__ == "__main__":
    main()
