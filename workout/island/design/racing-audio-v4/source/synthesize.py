#!/usr/bin/env python3
"""Original racing SFX, CC0-1.0. Python + NumPy + SciPy + FFmpeg.

Run from any directory: python source/synthesize.py
Only writes this new asset package; intermediate WAV files live in /tmp.
No recordings, sample libraries, network calls, or model-generated audio.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile

import numpy as np
from scipy.signal import resample_poly

ROOT = Path(__file__).resolve().parents[1]
SR = 48000
SEED = 20261114
TARGET = -16.0
BANDS = [0, 250, 1000, 2000, 4000, 8000, SR / 2]
SPECS = [
    ('brake-loop-light', 'בלימה קלה', 2.0, -13, True),
    ('brake-loop-medium', 'בלימה בינונית', 2.0, -9, True),
    ('brake-loop-hard', 'בלימה חזקה', 2.0, -6, True),
    ('tyre-squeal-corner', 'חריקת צמיגים בפנייה', .9, -8, False),
    ('car-bump-hard', 'התנגשות חזקה וריקושט', .4, -5, False),
    ('car-bump-soft', 'התנגשות קלה וריקושט', .4, -10, False),
    ('side-scrape', 'שפשוף צד ברכב', .6, -10, False),
    ('rubber-skid', 'החלקת גומי על דשא', .8, -11, False),
]


def ff(args, data=None):
    return subprocess.run(['ffmpeg', '-hide_banner', '-nostdin', *args],
                          input=data, capture_output=True, check=True)


def band_noise(n, rng, low, high, slope=0):
    f = np.fft.rfftfreq(n, 1 / SR)
    shape = (1 - np.exp(-(f / low) ** 4)) * np.exp(-(f / high) ** 8)
    shape *= np.maximum(f, low) ** -slope
    z = np.fft.irfft(np.fft.rfft(rng.standard_normal(n)) * shape, n)
    return z / max(np.std(z), 1e-12)


def shoulders(x, release=.03):
    """10 ms raised-cosine start, and a zero-valued end to avoid clicks."""
    x = x.copy()
    for seconds, reverse in [(.010, False), (release, True)]:
        count = round(seconds * SR)
        ramp = np.sin(np.linspace(0, np.pi / 2, count)) ** 2
        if reverse:
            x[-count:] *= ramp[::-1]
        else:
            x[:count] *= ramp
    return x


def rubber(t, rng, strength, corner=False):
    n, dur = len(t), len(t) / SR
    # Broad friction is dominant. Several short-coherence FM components suggest
    # rubber stick-slip without a narrow, sustained metallic resonance.
    cycles = 5 + 2 * strength
    center = 540 + 210 * strength + (170 if corner else 0)
    f0 = center + 85 * np.sin(2 * np.pi * 3 * t / dur)
    f0 += 28 * np.sin(2 * np.pi * 27 * t / dur)
    phase = 2 * np.pi * np.cumsum(f0) / SR
    squeal = np.sin(phase + .5 * np.sin(phase * .41))
    squeal += .26 * np.sin(phase * 1.93 + .4 * np.sin(phase * .23))
    friction = band_noise(n, rng, 240, 2600 + strength * 220, .12)
    grain = band_noise(n, rng, 70, 950, .25)
    flutter = .77 + .13 * np.sin(2 * np.pi * cycles * t / dur)
    flutter += .10 * np.sin(2 * np.pi * 47 * t / dur)
    x = (.78 * friction + (.19 + strength * .13) * squeal + .23 * grain) * flutter
    if corner:
        x *= np.sin(np.pi * t / dur) ** .65
    return x


def bump(t, rng, hard):
    x = np.zeros(len(t))
    # A main body thud, two distinct receding contacts, and short damped
    # reflections. The ricochet is a rebound, without a gunshot/laser whistle.
    for at, gain in [(0, 1), (.082, .50 if hard else .32), (.148, .24 if hard else .14)]:
        i = round(at * SR)
        q = t[:len(t) - i]
        phase = 2 * np.pi * (76 * q + 90 * .025 * (1 - np.exp(-q / .025)))
        body = np.sin(phase) * np.exp(-q / (.050 if hard else .040))
        crunch = band_noise(len(q), rng, 230, 3800 if hard else 2200)
        hit = 1.15 * body + (.65 if hard else .30) * crunch * np.exp(-q / .027)
        hit = shoulders(hit, .025)
        x[i:] += gain * hit
    dry = x.copy()
    for delay, gain in [(.023, .18), (.041, .11), (.067, .06)]:
        i = round(delay * SR)
        x[i:] += gain * dry[:-i]
    return x


def synth(name, dur, seed):
    rng = np.random.default_rng(seed)
    t = np.arange(round(dur * SR)) / SR
    if name.startswith('brake-loop'):
        level = {'light': 0, 'medium': 1, 'hard': 2}[name.rsplit('-', 1)[1]]
        x = rubber(t, rng, level)
    elif name == 'tyre-squeal-corner':
        x = rubber(t, rng, 2, True)
    elif name.startswith('car-bump'):
        x = bump(t, rng, name.endswith('hard'))
    elif name == 'side-scrape':
        flutter = .55 + .28 * np.sin(2 * np.pi * 29 * t) ** 2
        flutter += .17 * np.sin(2 * np.pi * 73 * t) ** 2
        x = band_noise(len(t), rng, 380, 3700) * flutter
        x += .23 * band_noise(len(t), rng, 110, 850)
        x *= np.sin(np.pi * t / dur) ** .45
    else:
        # Soft earth/grass rustle, low rolling friction and irregular clumps.
        x = .75 * band_noise(len(t), rng, 90, 1250, .23)
        x += .24 * band_noise(len(t), rng, 700, 2700)
        x *= .55 + .20 * np.sin(2 * np.pi * 13 * t) + .16 * np.sin(2 * np.pi * 31 * t)
        for at in [.12, .27, .39, .58]:
            x += .17 * band_noise(len(t), rng, 100, 600) * np.exp(-((t - at) / .018) ** 2)
        x *= np.sin(np.pi * t / dur) ** .5
    x -= x.mean()
    x = np.tanh(x / (2.8 * np.std(x)))
    # Reapply the spectral envelope after saturation: saturation must not
    # regenerate harsh upper harmonics. Phase-neutral FFT filtering.
    f = np.fft.rfftfreq(len(x), 1 / SR)
    x = np.fft.irfft(np.fft.rfft(x) * np.exp(-(f / 3500) ** 10), len(x))
    return shoulders(x, .010 if name.startswith('brake-loop') else .035)


def loudness(path):
    # FFmpeg implements gated BS.1770 / EBU R128. The two impact files are
    # exactly 400 ms: one full 400 ms gate, with no silence added for measurement.
    r = ff(['-i', str(path), '-af', 'loudnorm=I=-16:TP=-1:LRA=7:print_format=json',
            '-f', 'null', '-'])
    s = r.stderr.decode()
    m = json.loads(s[s.rfind('{'):s.rfind('}') + 1])
    return float(m['input_i']), float(m['input_tp'])


def decode(path):
    return np.frombuffer(ff(['-i', str(path), '-ar', str(SR), '-ac', '1',
                             '-f', 'f32le', '-']).stdout, dtype='<f4').astype(float)


def spectrum(x):
    # Whole-clip one-sided periodogram, including the onset and tail.
    # No A/K weighting; double interior bins to account for negative frequencies.
    f = np.fft.rfftfreq(len(x), 1 / SR)
    power = np.abs(np.fft.rfft(x)) ** 2
    power[1:-1] *= 2
    return [float(100 * power[(f >= lo) & (f < hi)].sum() / power.sum())
            for lo, hi in zip(BANDS[:-1], BANDS[1:])]


def render(name, x, temp):
    raw = temp / 'input.wav'
    ff(['-y', '-f', 'f64le', '-ar', str(SR), '-ac', '1', '-i', '-',
        '-c:a', 'pcm_f32le', str(raw)], x.astype('<f8').tobytes())
    source_lufs, _ = loudness(raw)
    files = {}
    for ext, codec in [('ogg', ['-c:a', 'libopus', '-b:a', '64k', '-vbr', 'on']),
                       ('mp3', ['-c:a', 'libmp3lame', '-b:a', '96k', '-write_xing', '1'])]:
        out = ROOT / f'{name}.{ext}'
        gain = TARGET - source_lufs
        for _ in range(5):
            ff(['-y', '-i', str(raw), '-af', f'volume={gain:.6f}dB',
                '-map_metadata', '-1', *codec, '-metadata', 'license=CC0-1.0',
                '-metadata', f'title={name}', str(out)])
            lufs, true_peak = loudness(out)
            if abs(lufs - TARGET) <= .10:
                break
            gain += TARGET - lufs
        if abs(lufs - TARGET) > .15 or true_peak > -1:
            raise ValueError(f'{out.name}: {lufs} LUFS, {true_peak} dBTP')
        decoded = decode(out)
        bands = spectrum(decoded)
        if name.startswith('brake-loop') and bands[4] > 10:
            raise ValueError('Braking 4–8 kHz energy exceeds 10%')
        # Also calculate an independent four-times oversampled peak.
        oversampled_peak = 20 * np.log10(max(abs(resample_poly(decoded, 4, 1))))
        files[ext] = dict(path=out.name, mime='audio/ogg' if ext == 'ogg' else 'audio/mpeg',
                          codec='opus' if ext == 'ogg' else 'mp3',
                          bytes=out.stat().st_size, sha256=hashlib.sha256(out.read_bytes()).hexdigest(),
                          decoded_samples=len(decoded), decoded_duration_seconds=round(len(decoded) / SR, 6),
                          integrated_lufs=lufs, true_peak_dbtp=true_peak,
                          oversampled_peak_dbfs=round(float(oversampled_peak), 3),
                          spectrum_energy_percent=bands,
                          boundary_step_dbfs=round(float(20 * np.log10(max(abs(decoded[0] - decoded[-1]), 1e-12))), 2))
    return files


def main():
    assets = []
    with tempfile.TemporaryDirectory(prefix='racing-audio-v4-') as tmp:
        for index, (name, label, dur, gain, loop) in enumerate(SPECS):
            files = render(name, synth(name, dur, SEED + index), Path(tmp))
            item = dict(id=name, label_he=label, duration_seconds=dur,
                        sample_rate_hz=SR, channels=1, attack_ms=10,
                        release_ms=10 if loop else 35, loop=loop,
                        loop_start_seconds=0 if loop else None,
                        loop_end_seconds=dur if loop else None,
                        recommended_gain_db=gain, recommended_gain_linear=round(10 ** (gain / 20), 6),
                        exclusive_group='brake' if loop else None,
                        max_voices=1 if loop else 2, cooldown_ms=0 if loop else 120,
                        seed=SEED + index, files=files)
            assets.append(item)
            print(name, {e: (f['bytes'], f['integrated_lufs'], f['true_peak_dbtp'], f['spectrum_energy_percent'][4])
                         for e, f in files.items()}, flush=True)
    manifest = dict(schema_version=1, package='racing-audio-v4', license='CC0-1.0',
                    license_file='LICENSE.txt', dedication_file='DEDICATION.txt', origin='Original deterministic procedural synthesis; no external samples',
                    generator='source/synthesize.py', seed=SEED, base_commit='d759582c171600dd7c7df7906c2fb38ae7f8b88a',
                    normalization=dict(integrated_target_lufs=TARGET, tolerance_lu=.15, true_peak_ceiling_dbtp=-1),
                    spectrum=dict(band_edges_hz=BANDS, method='Unweighted one-sided whole-clip periodogram; percent total energy',
                                  brake_4000_8000_hz_max_percent=10),
                    budget=dict(max_package_bytes=300000,
                                audio_bytes=sum(f['bytes'] for a in assets for f in a['files'].values())),
                    playback=dict(preferred_format='ogg', fallback_format='mp3', master_gain_db=-3,
                                  brake_layers='Select one level, never sum all three; crossfade changes over 50 ms',
                                  loop_player='AudioBufferSourceNode; loopStart=0; loopEnd=2; playbackRate=1',
                                  loop_note='10 ms shoulders meet at silence; a brief 20 ms amplitude dip remains at each join',
                                  codec_note='Use intended duration, not MP3 container duration; decode may expose encoder padding',
                                  onset_stop_fade_ms=10, limiter_ceiling_dbtp=-1), assets=assets)
    (ROOT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    write_report(manifest)


def write_report(m):
    lines = ['# Racing audio v4 — דוח נכסים', '',
             'חבילת צלילים מקוריים בסינתזה דטרמיניסטית, CC0-1.0; ללא הקלטות או דגימות חיצוניות. '
             'הרישיון המלא ב־LICENSE.txt, ומקור הסינתזה ב־source/synthesize.py.', '',
             '## היקף ומקור', '',
             f"ענף `codex/racing-audio-v4` מ־main, בסיס `{m['base_commit']}`. "
             'כל התוצרים בתיקייה זו ובקבצים חדשים בלבד. אין חיבור למשחק או שינוי בקוד קיים, '
             'release.json, תגי גרסה, CLAUDE.md, ops או בדיקות.', '',
             'שלוש בלימות של 2 שניות: חיכוך אספלט רחב עם stick-slip של גומי, '
             'גוון ורטט מתחזקים לפי הדרגה. אין בנק תהודות מתכתי גבוה. '
             'הפנייה: חריקה עם קשת גובה ועוצמה. החבטות: גוף נמוך, קראנץ׳, '
             'מכות חוזרות ב־82 וב־148 מ״ש והחזרים דועכים ב־23/41/67 מ״ש, בתוך 0.4 שניות. '
             'שפשוף צד: חיכוך מחוספס של 0.6 שניות. דשא: חיכוך כהה, רשרוש וגרגירים לא סדירים.', '',
             '## נרמול ותזמון', '',
             '48,000 Hz, מונו; OGG/Opus 64 kbps VBR ו־MP3 96 kbps עם Xing/LAME gapless metadata. '
             'יעד ‎−16 LUFS-I ±0.15 LU בכל פורמט בנפרד, true peak לכל היותר ‎−1 dBTP. '
             'ההגבר תוקן אחרי קידוד, בלי נרמול דינמי שמשנה את צורת החבטה. '
             'לכל מקור onset raised-cosine של 10 מ״ש, מתחיל באפס; דחיסה הפסדית עשויה לייצר pre-ringing חלש. '
             'סיומת רכה של 10 מ״ש בלופים ו־35 מ״ש באירועים.', '',
             'מדידה: FFmpeg 7.1.5 loudnorm, נתוני input_i/input_tp (BS.1770 / EBU R128, gated). '
             'החבטות באורך 400 מ״ש — חלון המדידה המינימלי; המדידה על הקובץ עצמו ללא הוספת שקט. '
             'לכן הערך שלהן פחות יציב מבחינה תפיסתית מצליל ארוך. מדידות LUFS אינן מחליפות האזנה. '
             'שיא נוסף חושב בדגימת־יתר ×4 עם scipy.signal.resample_poly.', '',
             '| קובץ | משך מפוענח (שנ׳) | בתים | LUFS-I | dBTP | הגבר מומלץ dB |',
             '|---|---:|---:|---:|---:|---:|']
    for a in m['assets']:
        for f in a['files'].values():
            lines.append(f"| {f['path']} | {f['decoded_duration_seconds']:.6f} | {f['bytes']} | "
                         f"{f['integrated_lufs']:.2f} | {f['true_peak_dbtp']:.2f} | {a['recommended_gain_db']} |")
    lines += ['', '## ספקטרום לפי תחום', '',
              'אחוז מאנרגיית כל הקובץ המפוענח, כולל attack ו־tail; FFT חד־צדדי עם הכפלת '
              'התדרים הפנימיים, ללא שקלול K או A. תחומים זרים וחצי־פתוחים; '
              'מכנה: האנרגיה מ־0 עד Nyquist. סכום כל שורה כ־100% (עיגול). '
              'מגבלת 4–8 kHz נבדקת בכל אחת משש גרסאות הבלימה המקודדות.', '',
              '| קובץ | 0–250 Hz | 250–1000 | 1–2 kHz | 2–4 kHz | 4–8 kHz | 8–24 kHz |',
              '|---|---:|---:|---:|---:|---:|---:|']
    for a in m['assets']:
        for f in a['files'].values():
            lines.append('| ' + f['path'] + ' | ' + ' | '.join(f'{v:.6f}%' for v in f['spectrum_energy_percent']) + ' |')
    maximum = max(f['spectrum_energy_percent'][4] for a in m['assets'] if a['loop'] for f in a['files'].values())
    lines += ['', f'המקסימום שנמדד בבלימות בתחום 4–8 kHz: **{maximum:.6f}%**, מתחת לתקרה 10%.', '',
              '## האזנה ושילוב עתידי', '',
              'פתחו listen.html ובחרו OGG או MP3. כפתורי הלופ משתמשים ב־Web Audio עם '
              'loopStart=0 ו־loopEnd=2; נגני האודיו הרגילים מיועדים להשוואת אירועים ופורמטים. '
              'הגישו את התיקייה בשרת HTTP מקומי כדי שכפתורי הלופ יוכלו לפענח את הקבצים.', '',
              'הלופים עולים ויורדים במשך 10 מ״ש ונפגשים סביב אפס: ללא קפיצת גל חדה, '
              'עם ירידת עוצמה קצרה של כ־20 מ״ש בכל 2 שניות. לא לולאת HTML audio לייצור. '
              'קבעו loopEnd=2 לפי המניפסט; מעטפת MP3 יכולה לכלול padding מעבר למשך המיועד. '
              'התחלה ועצירה חיצוניות: ramp של 10 מ״ש. החלפת דרגת בלימה: crossfade של 50 מ״ש, '
              'דרגה אחת יציבה בכל רגע. כל הדרגות מנורמלות לאותו LUFS; '
              'ההבדל בעוצמה במשחק מגיע גם מההגברים המומלצים ‎−13/−9/−6 dB.', '',
              'ההגברים ב־manifest.json הם לינאריים וגם ב־dB, לפני master מומלץ של ‎−3 dB. '
              'לצלילי אירוע עד שני קולות ובין הפעלות לפחות 120 מ״ש; מומלץ להגביל את bus ל־‎−1 dBTP. '
              'ערכי ההגבר הם נקודת התחלה לשילוב לצד המנוע הקיים, ולא שינוי במשחק.', '',
              '## שחזור', '',
              'Python 3, NumPy, SciPy, FFmpeg עם libopus/libmp3lame. '
              'הריצו מתוך תיקייה זו: `python source/synthesize.py`. '
              'seed בסיס 20261114 ותוספת לפי סדר הנכסים. הקוד מייצר מחדש אודיו, מניפסט ודוח; '
              'listen.html ו־LICENSE.txt נשארים קבצים סטטיים. השחזורים עשויים להשתנות מעט בין גרסאות codecs ומזהי מעטפת. '
              'סכומי SHA-256 לקבצים הנמסרים נמצאים במניפסט.', '',
              f"נפח 16 קובצי האודיו: {m['budget']['audio_bytes']:,} בתים. "
              'תקציב החבילה כולה: 300,000 בתים; ספירה סופית ותוצאות בדיקת הדפדפן להלן.', '']
    (ROOT / 'REPORT.md').write_text('\n'.join(lines))


if __name__ == '__main__':
    main()
