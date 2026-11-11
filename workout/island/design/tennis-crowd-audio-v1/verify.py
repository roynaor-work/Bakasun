#!/usr/bin/env python3
"""Decode and measure EVERY delivered file; no existing repository tests used.

python verify.py            # read-only assertions, exit nonzero on any failure
python verify.py --report   # also refresh measurements.json and REPORT.md
Dependencies: Python 3.11+, NumPy, SciPy, ffmpeg and ffprobe.
SPDX-License-Identifier: CC0-1.0
"""
from pathlib import Path
import argparse
import hashlib
import json
import math
import subprocess

import numpy as np
from scipy import signal

ROOT = Path(__file__).resolve().parent
EXPECTED = {"stadium-bed": 24, "applause-short": 1.5, "applause-medium": 3,
            "applause-large": 5, "near-point-oh": 2.4, "mistake-aw": 2.8,
            "pre-serve-hush": 4, "match-cheer": 6.5}


def run(args):
    return subprocess.run(args, check=True, capture_output=True)


def db(x):
    return 20*math.log10(max(float(x), 1e-12))


def rms(x):
    return np.sqrt(np.mean(x*x))


def measure(path):
    info = json.loads(run(["ffprobe", "-v", "error", "-show_streams", "-of", "json",
                           str(path)]).stdout)["streams"]
    assert len(info) == 1 and info[0]["codec_type"] == "audio", f"{path.name}: audio only"
    stream = info[0]
    assert stream["sample_rate"] == "44100" and stream["channels"] == 2, path.name
    assert stream["codec_name"] == ("mp3" if path.suffix == ".mp3" else "vorbis"), path.name
    decoded = run(["ffmpeg", "-v", "error", "-xerror", "-i", str(path),
                   "-f", "f32le", "-acodec", "pcm_f32le", "-"]).stdout
    x = np.frombuffer(decoded, dtype="<f4").astype(np.float64).reshape(-1, 2)
    assert len(x) and np.isfinite(x).all(), path.name
    stats = run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path),
                 "-af", "loudnorm=I=-18:TP=-3:LRA=7:print_format=json", "-f", "null", "-"])
    log = stats.stderr.decode()
    loud = json.JSONDecoder().raw_decode(log[log.rfind("{"):])[0]
    peak = np.max(np.abs(x))
    # Independent 4x reconstruction alongside FFmpeg's true-peak meter.
    tp4 = np.max(np.abs(signal.resample_poly(x, 4, 1, axis=0)))
    block = 4410  # 100 ms; reject isolated spikes even inside a quiet envelope.
    windows = x[:len(x)//block*block].reshape(-1, block, 2)
    levels = np.sqrt(np.mean(windows**2, axis=(1, 2)))
    active = levels > max(np.max(levels)*.1, 10**(-45/20))
    local_crests = np.max(np.abs(windows), axis=(1, 2))[active]/levels[active]
    frequencies, psd = signal.welch(x, 44100, nperseg=4096, axis=0)
    high = psd[frequencies >= 6000].sum()/psd.sum()*100
    result = {"file": path.name, "bytes": path.stat().st_size,
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "duration_s": round(len(x)/44100, 6), "sample_rate": 44100, "channels": 2,
        "integrated_lufs": float(loud["input_i"]), "true_peak_dbtp": float(loud["input_tp"]),
        "true_peak_4x_dbfs": round(db(tp4), 3), "sample_peak_dbfs": round(db(peak), 3),
        "rms_dbfs": round(db(rms(x)), 3), "crest_db": round(db(peak/rms(x)), 3),
        "max_active_100ms_crest_db": round(db(np.max(local_crests)), 3),
        "max_sample_step": round(float(np.max(np.abs(np.diff(x, axis=0)))), 6),
        "energy_above_6khz_percent": round(float(high), 6),
        "stereo_difference_rms_dbfs": round(db(rms(x[:, 0]-x[:, 1])), 3)}
    if path.stem == "stadium-bed":
        join = np.abs(x[0]-x[-1]).max()
        edge_rms = rms(np.concatenate([x[-4410:], x[:4410]]))
        nearby_rms = rms(np.concatenate([x[-8820:-4410], x[4410:8820]]))
        result.update(loop_join_step=round(float(join), 6),
                      loop_join_step_dbfs=round(db(join), 3),
                      loop_edge_level_change_db=round(db(edge_rms/nearby_rms), 3),
                      loop_100ms_level_range_db=round(db(levels.max()/levels.min()), 3))
    else:
        result["edge_10ms_rms_dbfs"] = round(db(rms(np.concatenate([x[:441], x[-441:]]))), 3)
    if path.stem == "pre-serve-hush":
        result["tail_vs_opening_db"] = round(db(rms(x[-22050:])/rms(x[:66150])), 3)
    return result


def validate(m):
    name = m["file"]
    def check(ok, rule):
        assert ok, f"{name}: {rule} — {m}"
    check(m["bytes"] <= 200000, "file <= 200,000 bytes")
    check(abs(m["duration_s"]-EXPECTED[Path(name).stem]) <= .04, "decoded duration")
    check(-18.6 <= m["integrated_lufs"] <= -17.4, "-18 LUFS ±0.6")
    check(m["true_peak_dbtp"] <= -3 and m["true_peak_4x_dbfs"] <= -3, "true peak <= -3 dBFS")
    check(m["sample_peak_dbfs"] <= -3, "sample headroom / no clipping")
    check(m["crest_db"] <= 16, "whole-file peak/RMS <= 16 dB (6.31:1)")
    check(m["max_active_100ms_crest_db"] <= 15, "active 100 ms peak/RMS <= 15 dB")
    check(m["max_sample_step"] <= .09, "sample step <= .09 full scale")
    check(m["energy_above_6khz_percent"] <= 1, "energy above 6 kHz <= 1%")
    check(m["stereo_difference_rms_dbfs"] > -45, "non-identical stereo channels")
    if "loop_join_step" in m:
        check(m["loop_join_step"] <= .02, "decoded loop join <= .02 full scale")
        check(abs(m["loop_edge_level_change_db"]) <= 2, "no level hole at loop join")
        check(m["loop_100ms_level_range_db"] <= 7, "steady quiet loop")
    else:
        check(m["edge_10ms_rms_dbfs"] <= -48, "soft one-shot boundaries")
    if "tail_vs_opening_db" in m:
        check(m["tail_vs_opening_db"] <= -35, "hush decays into quiet")


def report(rows):
    total_audio = sum(r["bytes"] for r in rows)
    versions = {name: run([name, "-version"]).stdout.decode().splitlines()[0]
                for name in ["ffmpeg", "ffprobe"]}
    data = {"schema": 1, "tools": versions, "audio_bytes": total_audio, "files": rows}
    (ROOT/"measurements.json").write_text(json.dumps(data, indent=2)+"\n")
    table = "\n".join(f'| {r["file"]} | {r["duration_s"]:.3f} | {r["bytes"]:,} | '
                       f'{r["integrated_lufs"]:.2f} | {r["true_peak_dbtp"]:.2f} | '
                       f'{r["crest_db"]:.2f} | {r["max_active_100ms_crest_db"]:.2f} |'
                       for r in rows)
    loops = [r for r in rows if "loop_join_step" in r]
    looptext = "\n".join(f'- {r["file"]}: קפיצת חיבור {r["loop_join_step_dbfs"]:.2f} dBFS; '
                          f'שינוי עוצמה סביב החיבור {r["loop_edge_level_change_db"]:.2f} dB.'
                          for r in loops)
    text = f'''# קהל טניס רך — דוח מדידות v1

8 צלילים מקוריים, 16 קובצי אודיו: Vorbis/OGG ו־MP3, סטריאו אמיתי, 44,100 Hz.
סך האודיו: **{total_audio:,} בתים**; הקובץ הגדול: **{max(r["bytes"] for r in rows):,} בתים**.
כל הקבצים והמקורות בתיקייה זו בלבד. אין חיבור למשחק בשינוי זה.

## הצלילים

- `stadium-bed`: לולאת 24 שניות, רחש קהל רחוק ושיחות מסונתזות חופפות ללא מילים או צעקה מובילה.
- `applause-short/medium/large`: ‏1.5 / 3 / 5 שניות; 15 / 26 / 42 מוחאים מדומים עם קצב עצמאי,
  פיזור סטריאו, כניסה רכה, מקטע מחיאות יציב ודעיכה. אין קליקים או סנכרון של כל הקהל.
- `near-point-oh`: ‏2.4 שניות, תנועת גובה עולה ו״אוו״ מעוגל.
- `mistake-aw`: ‏2.8 שניות, ״אאוו״ עם תנועה יורדת ודעיכה ארוכה יותר.
- `pre-serve-hush`: ‏4 שניות, רחש לחישות שנחלש עד שקט בסוף.
- `match-cheer`: ‏6.5 שניות, שכבות קהל ומחיאות עם שני גלים מפוזרים.

## יצירה ורישוי

`generate.py` הוא מקור השחזור, seed ‏20261107 ועוד מזהה הצליל. סינתזה מקורית של רעש ורוד,
פרצי רעש מסונן למחיאות, מקורות הרמוניים עם פורמנטים ותנועות גובה אקראיות לקהל, והחזרים מפוזרים.
אין הקלטות, דגימות חיצוניות, מילים, מותגים, אנשים אמיתיים או מודל של דובר.
סינון תחום 140–3900 Hz, רוויה רכה וסינון נמוכים נוסף ב־2600 Hz לאחר הרוויה מפחיתים חדות.
gain ליניארי שומר על המעטפת; ברקע בלבד איזון עוצמה מחזורי ואיטי מייצב את רחש הקהל.
במחיאות נוסף ריכוך פסגות ביחס למעטפת RMS מקומית של 100ms, עם אותה מעטפת לשני הערוצים.
המקור והקבצים מיועדים לשימוש CC0-1.0; פירוט לכל קובץ ב־`LICENSES.md`.

## מדידות של הקבצים שנמסרים

כל שורה נמדדה **לאחר פענוח הקובץ הדחוס עצמו**, ללא הסתמכות על WAV המקור.
LUFS ו־true peak נמדדים באמצעות FFmpeg loudnorm (מדידת input, ‏EBU R128 / BS.1770).
נמדדת גם פסגה עצמאית בשחזור polyphase פי 4. אין נרמול דינמי של מעטפת הלחישה.
היעד לכל הקבצים הוא ‎-18 LUFS ±0.6; טווח החבילה בפועל
**{min(r["integrated_lufs"] for r in rows):.2f} עד {max(r["integrated_lufs"] for r in rows):.2f} LUFS**.

| קובץ | שניות מפוענחות | בתים | LUFS-I | dBTP | Crest dB | Crest מקומי dB |
|---|---:|---:|---:|---:|---:|---:|
{table}

## ספי הבדיקה ותוצאה

`python verify.py` מפענח את כל 16 הקבצים, בודק פורמט/סטריאו/קצב/משך/גודל, וטוען את
המניפסט, המדידות, הדף, הרישיונות וקובצי המקור. כישלון אחד מחזיר exit code שאינו אפס.

- עד 200,000 בתים לכל קובץ ועד 2,000,000 בתים לכל התיקייה, כולל קוד ותיעוד.
- true peak וגם sample peak לכל היותר ‎-3 dBFS; אין דגימות קצוצות.
- יחס פסגה ל־RMS של כל קובץ עד 16 dB (פי 6.31), וגם עד 15 dB בחלונות פעילים של 100ms.
  חלון פעיל: RMS מעל ‎-45 dBFS ומעל עשירית מעוצמת החלון החזק ביותר.
- הפרש בין דגימות סמוכות עד 0.09 full scale; עד 1% מהאנרגיה מעל 6 kHz.
- תחילת וסוף one-shot: ‏RMS של 10ms הראשונים והאחרונים יחד מתחת ל־‎-48 dBFS.
- לחישה: חצי השנייה האחרונה חלשה ב־35 dB לפחות מה־1.5 שניות הראשונות.
- לופ: קפיצת חיבור עד 0.02 full scale, שינוי RMS סביב החיבור עד 2 dB,
  וטווח עוצמה של חלונות 100ms עד 7 dB. המקור משתמש בחפיפה של שנייה בהספק שווה,
  בנקודת התחלה סמוכה לאפס ובכתפי קוסינוס של 8ms להגנה מרעש דחיסה בתפר; אין הוספת דממה.

{looptext}

**תוצאה: PASS לכל 16 קובצי האודיו.** ערכים מלאים, כלי המדידה ו־SHA-256 ב־`measurements.json`.
אלה בדיקות אות אובייקטיביות; הן אינן תחליף לשיפוט האזנה של רועי ברמקול ובאוזניות.
לא נטען שבוצעה האזנה אנושית או בדיקה במכשיר פיזי.

## אימות דפדפן בעת מסירת v1

בדיקה אוטומטית נפרדת ב־Chromium ‏156.0.8078.79 עברה: פענוח וניגון/עצירה של כל
16 הקבצים, בקרת עוצמה כללית ואישית, ביטול רצף, והשלמת רצף אמיתי של 49.2 שניות.
נבדקו גם טעינה שנכשלת (404) ללא שגיאת JavaScript, ותצוגה ב־1280px וב־390px ללא גלילה אופקית.
זו בדיקת ניגון דרך API האודיו של הדפדפן; היא אינה עדות להאזנה אנושית.

## תצוגה מקדימה ושימוש

פתחו את `preview.html` דרך שרת מקומי. כל צליל ניתן לניגון ב־OGG או MP3,
עם עצירה, בקרת עוצמה כללית ואישית, והשמעת כל שמונת הצלילים ברצף.
לופ הרקע מפוענח ל־Web Audio ומנוגן כ־AudioBuffer מחזורי כדי למנוע פערי HTML audio.
הרקע שווה לאחרים במדידת הקובץ, אך מוצע לו gain של 0.22 במשחק כדי שיישאר שקט.
הערכים `suggestedGameGain` במניפסט הם המלצות שילוב ואינם משנים את המדידות.
הבקרות בדף מתחילות ב־30% לשמיעה נוחה; הן אינן מבצעות נרמול בזמן הניגון.

```sh
cd workout/island/design/tennis-crowd-audio-v1
python3 -m http.server 8765 --bind 127.0.0.1
# http://127.0.0.1:8765/preview.html
```

```sh
python3 verify.py
# לשחזור: Python + numpy + scipy ו־FFmpeg עם libvorbis/libmp3lame
python3 generate.py
python3 verify.py --report
```

הערת שילוב: ב־`workout/island/minigames/g4e-audio.mjs` הקיים, מחיאות עוברות highpass ב־720 Hz.
יש להעריך מחדש את הסינון בעת שילוב החבילה כי הוא מסיר את גוף המחיאה הרך.
כל קובצי המשחק, הבדיקות הקיימות, ops, ‏CLAUDE.md וקובצי release נשארו ללא שינוי.
'''
    (ROOT/"REPORT.md").write_text(text)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--report", action="store_true")
    args = parser.parse_args()
    manifest = json.loads((ROOT/"manifest.json").read_text())
    assert manifest["sampleRate"] == 44100 and manifest["channels"] == 2
    assert {s["id"]: s["duration"] for s in manifest["sounds"]} == EXPECTED
    expected_files = {f"{key}.{ext}" for key in EXPECTED for ext in ["ogg", "mp3"]}
    actual_files = {p.name for p in ROOT.iterdir() if p.suffix in [".ogg", ".mp3"]}
    assert actual_files == expected_files, "missing or unexpected audio files"
    assert {f for s in manifest["sounds"] for f in s["files"].values()} == expected_files
    rows = []
    for name in sorted(expected_files):
        m = measure(ROOT/name)
        validate(m)
        rows.append(m)
        print(f'PASS {name}: {m["integrated_lufs"]:.2f} LUFS, {m["true_peak_dbtp"]:.2f} dBTP, '
              f'crest {m["crest_db"]:.2f} dB, {m["bytes"]:,} bytes', flush=True)
    assert max(m["integrated_lufs"] for m in rows)-min(m["integrated_lufs"] for m in rows) <= 1
    if args.report:
        report(rows)
    recorded = json.loads((ROOT/"measurements.json").read_text())
    assert recorded["files"] == rows, "measurements.json is stale; rerun --report"
    licenses = (ROOT/"LICENSES.md").read_text()
    preview = (ROOT/"preview.html").read_text()
    # Load every text/source file as UTF-8 and ensure every delivered file has provenance.
    for p in ROOT.iterdir():
        assert p.is_file(), f"unexpected subdirectory: {p.name}"
        assert p.stat().st_size <= 200000, f"oversize: {p.name}"
        assert f'`{p.name}`' in licenses, f"missing license/source: {p.name}"
        if p.name not in expected_files:
            assert p.read_text(encoding="utf-8"), f"empty text file: {p.name}"
    for key in EXPECTED:
        assert key in preview, f"preview missing {key}"
    total = sum(p.stat().st_size for p in ROOT.iterdir())
    assert total <= 2000000, f"package exceeds 2 MB: {total}"
    print(f"PASS all files loaded, licensed and measured; whole folder {total:,} / 2,000,000 bytes")


if __name__ == "__main__":
    main()
