#!/usr/bin/env python3
"""Original procedural synthesis, CC0-1.0. Run from any directory; no network inputs.

Requires Python, numpy, scipy and ffmpeg with libopus/libmp3lame.
Only writes this new asset directory. Temporary PCM is never committed.
"""
import hashlib
import json
import math
import platform
import re
import subprocess
import tempfile
from pathlib import Path

import numpy as np
import scipy
from scipy.io import wavfile

ROOT = Path(__file__).resolve().parent
SR = 48000
BANDS = [(0, 200), (200, 500), (500, 1000), (1000, 2000),
         (2000, 5000), (5000, 10000), (10000, 24000)]
SPECS = [
    ('police-soft', 'סירנת משטרה עדינה', 2.0, True, .025, -22),
    ('siren-far-helicopter', 'סירנה רחוקה · מסוק', 2.0, True, .02, -26),
    ('siren-near', 'סירנה קרובה', 2.0, True, .03, -22),
    ('shot-beep', 'צפצוף ירי', .18, False, .025, -24),
    ('nitro', 'ניטרו עולה', .8, False, .035, -24),
    ('puncture', 'פנצ׳ר', .4, False, .03, -24),
    ('brake-loop', 'חריקת בלימה', 1.0, True, .025, -24),
    ('net-drop', 'רשת נופלת', .6, False, .03, -24),
    ('barrier-break', 'מחסום נשבר', .65, False, .04, -24),
]


def ffmpeg(*args, data=None):
    return subprocess.run(['ffmpeg', '-hide_banner', '-nostdin', *args],
                          input=data, capture_output=True, check=True)


def loudness(x):
    # Short events lack a 400 ms BS.1770 block: measure a >=4 s repeating train.
    train = np.tile(x, max(1, math.ceil(4 * SR / len(x))))
    r = ffmpeg('-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', 'pipe:0',
               '-af', 'loudnorm=I=-22:TP=-3:LRA=7:print_format=json',
               '-f', 'null', '-', data=train.astype('<f4').tobytes())
    obj = json.loads(re.search(r'\{[^{}]+\}', r.stderr.decode()).group())
    return float(obj['input_i']), float(obj['input_tp'])


def shaped_noise(rng, n, low, high):
    f = np.fft.rfftfreq(n, 1 / SR)
    spectrum = np.fft.rfft(rng.standard_normal(n))
    weight = (1 - np.exp(-(f / low) ** 4)) / (1 + (f / high) ** 8)
    y = np.fft.irfft(spectrum * weight, n)
    return y / np.sqrt(np.mean(y * y))


def fade(x, seconds=.015):
    m = min(round(seconds * SR), len(x) // 2)
    ramp = np.sin(np.linspace(0, np.pi / 2, m)) ** 2
    x[:m] *= ramp
    x[-m:] *= ramp[::-1]
    return x


def synth(name, duration, loop, seed):
    n = round(duration * SR)
    t = np.arange(n) / SR
    rng = np.random.default_rng(seed)
    if name in ('police-soft', 'siren-near', 'siren-far-helicopter'):
        far = name == 'siren-far-helicopter'
        f0, depth = (420, 80) if far else (560, 140)
        # Analytic FM: exactly integer carrier/modulation cycles in two seconds.
        p = np.pi / 2 + 2 * np.pi * f0 * t + depth / .5 * (1 - np.cos(2 * np.pi * .5 * t))
        x = np.sin(p) + (.018 if far else .035) * np.sin(2 * p)
        if far:
            rotor = shaped_noise(rng, n, 65, 380)
            x = .76 * x + .1 * rotor * (.5 + .5 * np.cos(2 * np.pi * 24 * t))
        elif name == 'siren-near':
            x = x * (.92 + .08 * np.cos(2 * np.pi * 2 * t)) + .06 * np.sin(3 * p)
    elif name == 'shot-beep':
        x = np.sin(2 * np.pi * (920 * t - 1050 * t * t)) * np.exp(-12 * t)
    elif name == 'nitro':
        # Rising noise brightness and pitch; no sharp transient.
        dark = shaped_noise(rng, n, 100, 650)
        bright = shaped_noise(rng, n, 300, 1700)
        u = t / duration
        x = (.7 * ((1 - u) * dark + u * bright) +
             .2 * np.sin(2 * np.pi * (220 * t + 480 * t * t))) * np.sin(np.pi * u) ** .8
    elif name == 'puncture':
        x = (.65 * shaped_noise(rng, n, 120, 1250) * np.exp(-9 * t) +
             .28 * np.sin(2 * np.pi * (150 * t - 90 * t * t)) * np.exp(-16 * t))
    elif name == 'brake-loop':
        p = 2 * np.pi * 740 * t + 55 * (1 - np.cos(2 * np.pi * t))
        x = (.38 * np.sin(p) + .6 * shaped_noise(rng, n, 300, 1450))
        x *= .9 + .1 * np.cos(2 * np.pi * 6 * t)
    elif name == 'net-drop':
        u = t / duration
        x = .5 * shaped_noise(rng, n, 180, 1600) * np.sin(np.pi * u) ** 1.5
        d = np.maximum(t - .36, 0)
        x += (t >= .36) * .5 * np.sin(2 * np.pi * 160 * d) * np.exp(-22 * d) * (1 - np.exp(-200 * d))
    else:  # Rounded wooden clacks and soft debris; no recorded impact samples.
        x = np.zeros(n)
        for start, hz, amp in [(0, 210, 1), (.07, 330, .7), (.16, 460, .4), (.29, 290, .25)]:
            d = np.maximum(t - start, 0)
            x += (t >= start) * amp * np.sin(2 * np.pi * hz * d) * np.exp(-22 * d) * (1 - np.exp(-240 * d))
        x += .25 * shaped_noise(rng, n, 200, 1700) * np.exp(-7 * t)
    # Circular spectral shaping preserves the periodic seam of loop signals.
    f = np.fft.rfftfreq(n, 1 / SR)
    x = np.fft.irfft(np.fft.rfft(x) / (1 + (f / 1800) ** 10), n)
    x -= np.mean(x)
    # A 5 ms cosine shoulder protects lossy encoder boundary blocks. Total
    # transition occupies 0.5% of a siren cycle; no appended silence/padding.
    return fade(x, .005 if loop else .015)


def decode(path):
    r = ffmpeg('-v', 'error', '-i', str(path), '-f', 'f32le', '-ac', '1',
               '-ar', str(SR), 'pipe:1')
    return np.frombuffer(r.stdout, dtype='<f4').astype(float)


def metrics(x, loop):
    f = np.fft.rfftfreq(len(x), 1 / SR)
    # Whole-buffer, unweighted, one-sided FFT energy. No window for periodic loops.
    z = np.abs(np.fft.rfft(x)) ** 2
    z[1:-1] *= 2
    total = float(z.sum())
    bands = {f'{a}-{b}': round(float(z[(f >= a) & (f < b)].sum()) / total * 100, 5)
             for a, b in BANDS}
    lufs, tp = loudness(x)
    result = dict(decodedSamples=len(x), decodedDurationSeconds=round(len(x) / SR, 7),
                  integratedLufs=lufs, truePeakDbtp=tp, spectrumEnergyPct=bands)
    if loop:
        result['seamStepDbfs'] = round(20 * np.log10(max(abs(x[0] - x[-1]), 1e-12)), 2)
        m = round(.02 * SR)
        seam = np.r_[x[-m:], x[:m]]
        result['seamRmsVsBodyDb'] = round(10 * np.log10(np.mean(seam ** 2) / np.mean(x ** 2)), 2)
    return result


def main():
    assets = []
    for i, (name, label, duration, loop, volume, target) in enumerate(SPECS):
        seed = 20261113 + i
        x = synth(name, duration, loop, seed)
        x *= 10 ** ((target - loudness(x)[0]) / 20)
        files = {}
        with tempfile.TemporaryDirectory(prefix='catch-audio-') as tmp:
            wav = Path(tmp) / 'source.wav'
            for ext, codec in [('ogg', ['-c:a', 'libopus', '-b:a', '48k', '-vbr', 'constrained', '-application', 'audio']),
                               ('mp3', ['-c:a', 'libmp3lame', '-b:a', '64k', '-write_xing', '1'])]:
                path = ROOT / f'{name}.{ext}'
                source = x.copy()
                # Correct codec loudness drift with a second linear encode when needed.
                for attempt in range(3):
                    wavfile.write(wav, SR, source.astype(np.float32))
                    ffmpeg('-v', 'error', '-y', '-i', str(wav), '-map_metadata', '-1',
                           *codec, '-ar', str(SR), '-ac', '1', str(path))
                    decoded = decode(path)
                    measured = metrics(decoded, loop)
                    delta = target - measured['integratedLufs']
                    if abs(delta) <= .1:
                        break
                    source *= 10 ** (delta / 20)
                assert abs(delta) <= .2, (name, ext, delta)
                assert measured['truePeakDbtp'] <= -3
                assert measured['spectrumEnergyPct']['2000-5000'] <= 10
                assert len(decoded) == len(x), (name, ext, len(decoded), len(x))
                if loop:
                    assert measured['seamStepDbfs'] <= -45, (name, ext, measured)
                    assert abs(measured['seamRmsVsBodyDb']) < 3
                files[ext] = dict(path=path.name, bytes=path.stat().st_size,
                                  sha256=hashlib.sha256(path.read_bytes()).hexdigest(), **measured)
        assets.append(dict(id=name, label=label, durationSeconds=duration,
                           loop=loop, loopStartSeconds=0, loopEndSeconds=duration if loop else None,
                           recommendedVolume=volume, targetLufs=target, seed=seed,
                           source=f'generate.py:synth({name!r})', license='CC0-1.0', files=files))
        print(name, {k: (v['bytes'], v['integratedLufs'], v.get('seamStepDbfs')) for k, v in files.items()}, flush=True)
    manifest = dict(schemaVersion=1, sampleRateHz=SR, channels=1,
                    license='CC0-1.0', provenance='Original mathematical synthesis only; no external samples.',
                    volumeRange=[.02, .04], maxSimultaneousVoices=3,
                    sirenPolicy='Use one siren variant at a time; crossfade 80 ms when switching.',
                    loopPolicy='Decode once; AudioBufferSourceNode loop=true with exact loop bounds. Ramp start/stop 40 ms.',
                    loudnessMethod='BS.1770 via ffmpeg loudnorm input_i; repeat to at least 4 s (including short events).',
                    assets=assets)
    (ROOT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    report(assets)
    size = sum(p.stat().st_size for p in ROOT.rglob('*') if p.is_file())
    assert size <= 400000, size
    print('Complete directory bytes:', size)


def report(assets):
    audio_bytes = sum(f['bytes'] for a in assets for f in a['files'].values())
    lines = ['# חבילת אודיו למרדף · v1', '',
             'תשעה צלילים מקוריים, 18 קובצי OGG Opus / MP3, מונו 48 kHz. סינתזה מתמטית בלבד, CC0-1.0; מיפוי מלא ב־LICENSES.md.', '',
             '## שימוש והאזנה', '',
             '1. הגישו את שורש המאגר בשרת HTTP מקומי ופתחו את `listen.html` בתיקייה זו.',
             '2. בחרו OGG או MP3 ולחצו על הצליל הרצוי. אין ניגון אוטומטי; כפתור עצירה תמיד זמין.',
             '3. בסירנות ובבלימה השאירו ניגון לכמה מחזורים. התוצאה הצפויה: חזרה ללא נקישה, שלוש סירנות מובחנות ואפקטים קצרים ורכים.', '',
             'דף ההאזנה משתמש ב־manifest.json ובעוצמותיו (gain לינארי 0.02–0.04). הוא משמיע צליל אחד בכל פעם. בהטמעה עתידית: סירנה אחת, עד שלושה קולות בסך הכול; מעבר סירנות ב־crossfade של 80 ms ו־ramp התחלה/עצירה של 40 ms. המקור נשמר בעוצמת LUFS המתועדת; אין לנרמל שוב אחרי הכפלה ב־gain.', '',
             '## מדידות הקבצים שנמסרו', '',
             'כל המדידות נעשו לאחר פענוח כל אחד מקובצי ההפצה, לפני gain של המשחק. סירנת הבסיס והקרובה מכוונות ל־‎-22 LUFS, הרחוקה ל־‎-26 והאירועים ל־‎-24. סבילות הקבלה 0.2 LU; true peak לכל היותר ‎-3 dBTP. אנרגיית 2–5 kHz לכל צליל לכל היותר 10%.', '',
             '| צליל | פורמט | שניות מפוענחות | LUFS-I | dBTP | gain | בתים |',
             '| --- | --- | ---: | ---: | ---: | ---: | ---: |']
    for a in assets:
        for ext, f in a['files'].items():
            lines.append(f"| {a['label']} | {ext} | {f['decodedDurationSeconds']:.3f} | {f['integratedLufs']:.2f} | {f['truePeakDbtp']:.2f} | {a['recommendedVolume']:.3f} | {f['bytes']} |")
    lines += ['', '## ספקטרום לפי תחום', '',
              'אחוז מאנרגיית האות הכוללת, FFT חד־צדדי של כל הדגימות המפוענחות, ללא שקלול A/K וללא חלון. תחומים משמאל כלולים ומימין לא כלולים; העיגול עשוי לשנות את הסכום מעט מ־100%. מדובר באנרגיית אות חשמלית, לא בעוצמת קול בחדר.', '',
              '| צליל / פורמט | 0–200 Hz | 200–500 | 500–1k | 1–2k | **2–5k** | 5–10k | 10–24k |',
              '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |']
    for a in assets:
        for ext, f in a['files'].items():
            vals = ' | '.join(f'{v:.3f}%' for v in f['spectrumEnergyPct'].values())
            lines.append(f"| {a['id']} / {ext} | {vals} |")
    lines += ['', '## לולאות, אורכים ושחזור', '',
              'שלוש הסירנות באורך 2.000 שניות (96,000 דגימות); בלימה 1.000 שנייה. FM אנליטי עם מספר מחזורים שלם ורעש מחזורי מסונן ב־FFT; כתפי cosine של 5 ms בכל קצה מגנות על בלוקי הגבול בקידוד ללא הוספת שקט או padding. ל־MP3 יש כותרת Xing/LAME למידע delay/padding: נדרש מפענח שמכבד אותה. אין להפעיל מחדש HTMLAudio בכל מחזור; יש להשתמש ב־Web Audio ובגבולות המדויקים מהמניפסט.', '',
              '| לולאה / פורמט | צעד בתפר dBFS | RMS סביב התפר לעומת הגוף dB |',
              '| --- | ---: | ---: |']
    for a in assets:
        if a['loop']:
            for ext, f in a['files'].items():
                lines.append(f"| {a['id']} / {ext} | {f['seamStepDbfs']:.2f} | {f['seamRmsVsBodyDb']:.2f} |")
    lines += ['', 'צעד בתפר נמדד כהפרש הדגימה האחרונה והראשונה; סף ‎-45 dBFS. אנרגיית התפר נמדדת ב־20 ms מכל צד לעומת RMS הקובץ כולו; סף ±3 dB נועד לזהות חור או קפיצה. כל קובץ מפוענח נדרש למספר דגימות מדויק וללא clipping.', '',
              'LUFS נמדד ב־BS.1770 דרך ffmpeg loudnorm. כדי למדוד גם אירועים קצרים מבלוק המדידה 400 ms, האות חוזר ברצף עד לפחות ארבע שניות. נתוני LUFS לאירועים הם לפיכך של רצף חוזר ולא של אירוע בודד עם שקט סביבו. לסירנות נמדדים מחזורים מלאים. True peak מאותו מסלול מדידה.', '',
              f'סך 18 קובצי האודיו: **{audio_bytes:,} בתים**. מגבלת 400KB נאכפת על כל התיקייה (400,000 בתים, כולל מקור, דף, מניפסט ודוחות); נתון גודל סופי ואימות דפדפן מופיעים ב־REVIEW.md.', '',
              'שחזור: `python workout/island/design/catch-audio-v1/generate.py` משורש המאגר. הסקריפט מחליף רק את תוצרי החבילה. seeds קבועים; נתוני hash, גודל, משך, ספקטרום ועוצמה במניפסט. יציבות בתים בקודקים דורשת אותן גרסאות; OGG עשוי לקבל serial אקראי.', '',
              f'כלים: Python {platform.python_version()}, NumPy {np.__version__}, SciPy {scipy.__version__}; ' + subprocess.run(['ffmpeg', '-version'], capture_output=True, text=True).stdout.splitlines()[0] + '.', '',
              'הטון המעוגל, סינון התדרים והעוצמות הנמוכות נועדו למתן את החדות שעליה דווח. נוחות סובייקטיבית דורשת האזנה במכשיר היעד; המדדים אינם קביעה של עוצמה אקוסטית או אישור מהילד.', '',
              'השינוי מוגבל לקבצים חדשים בתיקייה זו; ללא חיבור למשחק וללא שינוי קוד קיים, release.json, תגי גרסה, CLAUDE.md, ops או בדיקות קיימות.']
    (ROOT / 'REPORT.md').write_text('\n'.join(lines) + '\n')


if __name__ == '__main__':
    main()
