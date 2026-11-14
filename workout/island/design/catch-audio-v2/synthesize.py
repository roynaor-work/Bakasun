#!/usr/bin/env python3
"""Original CC0 procedural sound design. Requires Python, numpy, scipy and FFmpeg.

Run from any directory: python synthesize.py
Only this new asset directory is written; temporary PCM stays outside the repo.
No recordings, pretrained models, downloaded sounds, or runtime dependencies.
"""
import hashlib
import json
import math
from pathlib import Path
import re
import subprocess
import tempfile

import numpy as np
from scipy import signal
from scipy.io import wavfile

ROOT = Path(__file__).resolve().parent
SR = 48000
BANDS = [(0, 200), (200, 500), (500, 2000), (2000, 5000), (5000, 12000), (12000, 24001)]
BAND_NAMES = ['0–200', '200–500', '500–2000', '2000–5000', '5000–12000', '12000–24000']
ASSETS = []
RNG = np.random.default_rng(20261114)


def run(*args):
    return subprocess.run(args, check=True, capture_output=True).stdout


def timebase(seconds):
    return np.arange(round(SR * seconds)) / SR


def soften(x, release=.04):
    """Raised cosine: exactly 10 ms attack, zero endpoints, soft release."""
    x = x.copy()
    a, b = round(.010 * SR), round(release * SR)
    x[:a] *= np.sin(np.linspace(0, np.pi / 2, a)) ** 2
    x[-b:] *= np.cos(np.linspace(0, np.pi / 2, b)) ** 2
    x[0] = x[-1] = 0
    return x


def loop_edges(x):
    # 5ms codec guard + 10ms raised-cosine ramp at each edge.
    g = round(.005 * SR)
    y = np.zeros_like(x)
    y[g:-g] = soften(x[g:-g], .010)
    return y


def noise(n, low, high):
    """FFT-shaped noise, periodic on the requested interval."""
    f = np.fft.rfftfreq(n, 1 / SR)
    shape = (1 - np.exp(-(f / low) ** 4)) * np.exp(-(f / high) ** 6)
    z = np.fft.rfft(RNG.normal(size=n)) * shape
    x = np.fft.irfft(z, n=n)
    return x / max(np.std(x), 1e-10)


def polish(x):
    # Remove DC/subsonics and aggressively avoid sharpness above 2 kHz.
    sos = signal.butter(3, [38, 1550], btype='bandpass', fs=SR, output='sos')
    return signal.sosfiltfilt(sos, x)


def engine(seconds, rpm, color):
    t = timebase(seconds)
    firing = rpm / 20  # Four-stroke V6: three combustion pulses per revolution.
    phase = 2 * np.pi * firing * t + .055 * np.sin(2 * np.pi * 2 * t)
    # Rounded combustion pulses; bank asymmetry and intake/exhaust body.
    x = np.zeros_like(t)
    for k in range(1, 15):
        x += math.exp(-k / (2.1 + color * .6)) / k ** .45 * np.sin(k * phase + .08 * k)
    x += .43 * np.sin(phase / 2) + .16 * np.sin(phase / 3)
    x += noise(len(t), 90, 850 + color * 180) * (.095 + .035 * np.sin(phase / 3))
    x *= 1 + .035 * np.sin(2 * np.pi * 1.5 * t)
    # Ten millisecond raised-cosine edges give a click-free full-file loop.
    return loop_edges(polish(x))


def siren(seconds, distant=False, single=False):
    t = timebase(seconds)
    # One low, breathy rise/fall in three seconds, no square-wave alarm/buzzer.
    sweep = .5 - .5 * np.cos(2 * np.pi * t / (seconds if single else 3))
    f = (290 if distant else 330) + (100 if distant else 135) * sweep
    phase = 2 * np.pi * np.cumsum(f) / SR
    x = .66 * np.sin(phase) + .18 * np.sin(phase * 2 + .3)
    x += .13 * noise(len(t), 180, 650) * (.7 + .3 * sweep)
    x *= .64 + .36 * sweep
    if distant:
        x = signal.sosfiltfilt(signal.butter(3, 650, fs=SR, output='sos'), x)
    return soften(polish(x), .12) if single else loop_edges(polish(x))


def opening():
    t = timebase(1.5)
    phase = 2 * np.pi * (34 * t + 30 * t ** 2)
    motor = sum(np.sin(k * phase + .1 * k) * np.exp(-k / 2.3) for k in range(1, 9))
    motor *= .8 * (1 - np.exp(-t * 8)) * np.exp(-t * .7)
    starter = .16 * noise(len(t), 100, 700) * np.exp(-t * 14)
    cue = np.zeros_like(t)
    s = siren(.9, single=True)
    cue[round(.38 * SR):round(.38 * SR) + len(s)] = s * .18
    return soften(polish(motor + starter + cue), .20)


def shift():
    t = timebase(.4)
    f = 165 - 65 * (1 - np.exp(-t * 14))
    phase = 2 * np.pi * np.cumsum(f) / SR
    x = (.8 * np.sin(phase) + .21 * np.sin(2 * phase)) * np.exp(-t * 8)
    x += .12 * noise(len(t), 180, 900) * np.exp(-((t - .06) / .025) ** 2)
    return soften(polish(x), .08)


def shot_times(seconds):
    if seconds == .5:
        return [.010 + i / 14 for i in range(6)]
    if seconds == .8:
        return [.010 + i / 14 for i in range(10)]
    # 10 shots cannot fill 1.2 seconds continuously at 12–16 Hz.
    # Two five-shot volleys at 12 Hz preserve both the shot cap and duration.
    return [.010 + i / 12 for i in range(5)] + [.720 + i / 12 for i in range(5)]


def burst(seconds, tool='automatic', variant=0):
    t = timebase(seconds)
    x = np.zeros_like(t)
    colors = {'automatic': (185, 1050), 'puncture': (205, 1200), 'net': (145, 780),
              'spikes': (175, 920), 'emp': (115, 640), 'mark': (245, 1100)}
    body, air = colors[tool]
    body *= 1 + (variant - .5) * .035
    for i, start in enumerate(shot_times(seconds)):
        s = timebase(min(.16, seconds - start))
        p = 2 * np.pi * body * (s + .018 * (1 - np.exp(-s * 65)))
        # Rounded transient + short mechanical body; no crack, scream or explosion.
        attack = np.sin(np.minimum(s / .010, 1) * np.pi / 2) ** 2
        hit = (noise(len(s), 150, air) * .7 + .5 * np.sin(p)) * np.exp(-s * 42) * attack
        hit += .13 * np.sin(2 * np.pi * body * .52 * s) * np.exp(-s * 28) * attack
        hit *= 1 + .035 * np.sin(i * 2.1 + variant)
        j = round(start * SR)
        x[j:j + len(hit)] += hit
    # Two very quiet, short room reflections; tail is included in the duration.
    for delay, gain in [(.027, .11), (.053, .045)]:
        d = round(delay * SR)
        x[d:] += gain * x[:-d].copy()
    return soften(polish(x), .035)


def loudness(path):
    result = subprocess.run(['ffmpeg', '-hide_banner', '-i', str(path), '-af',
                             'loudnorm=I=-18:TP=-1:LRA=11:print_format=json', '-f', 'null', '-'],
                            check=True, capture_output=True)
    obj = json.loads(re.findall(r'\{[^{}]+\}', result.stderr.decode())[-1])
    return float(obj['input_i']), float(obj['input_tp'])


def decode(path):
    return np.frombuffer(run('ffmpeg', '-v', 'error', '-i', str(path), '-ar', str(SR),
                             '-ac', '1', '-f', 'f32le', '-'), dtype='<f4').astype(float)


def metrics(path, duration, is_loop):
    x = decode(path)
    lu, tp = loudness(path)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    power = abs(np.fft.rfft(x)) ** 2
    power[1:-1] *= 2
    bands = [round(float(power[(f >= lo) & (f < hi)].sum() / power.sum() * 100), 4)
             for lo, hi in BANDS]
    result = {'bytes': path.stat().st_size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
              'lufs': lu, 'true_peak_dbtp': tp, 'decoded_samples': len(x), 'band_energy_pct': bands}
    if is_loop:
        result['seam_jump_dbfs'] = round(20 * np.log10(max(abs(x[0] - x[-1]), 1e-12)), 2)
        interior = max(np.sqrt(np.mean(x ** 2)), 1e-12)
        edge = max(np.sqrt(np.mean(np.r_[x[:480], x[-480:]] ** 2)), 1e-12)
        result['edge_rms_vs_full_db'] = round(20 * np.log10(edge / interior), 2)
    assert abs(lu + 18) <= .2, (path, lu)
    assert tp <= -1, (path, tp)
    assert bands[3] <= 8, (path, bands)
    assert len(x) == round(duration * SR), (path, len(x), duration)
    if is_loop:
        assert result['seam_jump_dbfs'] <= -45, (path, result)
    return result


def save(asset_id, label, x, category, gain, **extra):
    duration = len(x) / SR
    entry = {'id': asset_id, 'label_he': label, 'category': category,
             'duration_s': duration, 'recommended_gain': gain, 'playback_attack_ms': 10,
             **extra, 'files': {}}
    loop = category in ('engine', 'siren')
    if loop:
        entry['loop'] = {'start_sample': 0, 'end_sample_exclusive': len(x),
                         'sample_rate_hz': SR, 'start_s': 0, 'end_s': duration}
    with tempfile.TemporaryDirectory(prefix='catch-audio-') as tmp:
        wav = Path(tmp) / 'master.wav'
        master = x.copy()
        for _ in range(8):
            wavfile.write(wav, SR, master.astype(np.float32))
            measured, peak = loudness(wav)
            master *= 10 ** ((-18 - measured) / 20)
            if np.max(np.abs(master)) <= .62:
                break
            # Soft saturation reduces crest factor without a hard clipping edge.
            master = polish(.62 * np.tanh(master / .62))
            master = loop_edges(master) if loop else soften(master)
        # Each codec then gets an independent scalar loudness correction.
        for fmt in ('ogg', 'mp3'):
            path = ROOT / f'{asset_id}.{fmt}'
            configurations = ([('audio', '20'), ('lowdelay', '5'), ('lowdelay', '10'), ('lowdelay', '2.5')]
                              if fmt == 'ogg' and loop else [('audio', '20')])
            for app, frame in configurations:
                gain_correction = 1.
                for attempt in range(4):
                    wavfile.write(wav, SR, (master * gain_correction).astype(np.float32))
                    codec = (['-c:a', 'libopus', '-b:a', '20k', '-vbr', 'constrained',
                              '-application', app, '-frame_duration', frame]
                             if fmt == 'ogg' else ['-c:a', 'libmp3lame', '-b:a', '32k', '-write_xing', '1'])
                    run('ffmpeg', '-v', 'error', '-y', '-i', str(wav), '-map_metadata', '-1',
                        *codec, str(path))
                    lu, tp = loudness(path)
                    if abs(lu + 18) <= .1:
                        break
                    gain_correction *= 10 ** ((-18 - lu) / 20)
                decoded = decode(path)
                seam = 20 * np.log10(max(abs(decoded[0] - decoded[-1]), 1e-12))
                if not loop or seam <= -45:
                    break
            entry['files'][fmt] = {'path': path.name, 'codec': 'opus' if fmt == 'ogg' else 'mp3',
                                   'encoder_mode': f'{app}/{frame}ms' if fmt == 'ogg' else 'CBR32',
                                   **metrics(path, duration, loop)}
    ASSETS.append(entry)
    print(asset_id, ' '.join(f'{k}:{v["lufs"]}LUFS/{v["bytes"]}B' for k, v in entry['files'].items()), flush=True)


def build():
    for vehicle, label, rpms, color in [('v6', 'V6 טבעי', [1400, 2600, 4200], 0),
                                       ('police', 'ניידת עמוקה', [1200, 2200, 3600], -.35),
                                       ('fugitive', 'נמלט חד', [1600, 3000, 4800], .65)]:
        for speed, he, rpm in zip(['low', 'mid', 'high'], ['נמוך', 'בינוני', 'גבוה'], rpms):
            save(f'engine-{vehicle}-{speed}', f'{label} — סל״ד {he}', engine(2, rpm, color),
                 'engine', .28 if vehicle != 'fugitive' else .22, vehicle=vehicle, rpm=rpm, layer=speed)
    save('gear-shift', 'החלפת הילוך עדינה', shift(), 'shift', .24)
    save('chase-start', 'מתחיל מרדף — התנעה וסירנה רכה אחת', opening(), 'opening', .38)
    for seconds, key in [(.5, '050'), (.8, '080'), (1.2, '120')]:
        timing = {'burst_pattern': key}
        save(f'burst-automatic-{key}', f'צרור אוטומטי {seconds} שנ׳', burst(seconds), 'burst', .34, **timing)
        for tool, he in [('puncture', 'פנצ׳ר'), ('net', 'רשת'), ('spikes', 'קוצים'), ('emp', 'EMP'), ('mark', 'סימון')]:
            for variant in (1, 2):
                save(f'burst-{tool}-{key}-{variant}', f'{he} — {seconds} שנ׳ — וריאציה {variant}',
                     burst(seconds, tool, variant), 'burst', .28, tool=tool, variant=variant, **timing)
    for distant, key, he, gain in [(False, 'near', 'קרוב', .10), (True, 'far', 'רחוק', .035)]:
        save(f'siren-{key}', f'סירנת רקע רכה — {he}', siren(3, distant), 'siren', gain,
             distance=key, recommended_gain_db=round(20 * math.log10(gain), 2))
    manifest = {'schema_version': 2, 'name': 'catch-audio-v2', 'license': 'CC0-1.0',
                'license_file': 'LICENSE.txt', 'source': 'synthesize.py', 'seed': 20261114,
                'sample_rate_hz': SR, 'channels': 1, 'target_lufs': -18,
                'lufs_tolerance': .2, 'max_true_peak_dbtp': -1, 'attack_ms': 10,
                'max_2_to_5khz_energy_pct': 8, 'package_budget_bytes': 500000,
                'band_order_hz': BAND_NAMES, 'energy_method': 'one-sided full-decoded-file FFT power / total, no weighting',
                'format_order': ['ogg', 'mp3'],
                'encoding': {'ogg': {'codec': 'opus', 'bitrate_bps': 20000, 'mode': 'constrained-vbr'},
                             'mp3': {'codec': 'mp3', 'bitrate_bps': 32000, 'mode': 'cbr'}},
                'playback': {'master_gain': .7, 'max_simultaneous_bursts': 1, 'stop_fade_ms': 30,
                             'engine_crossfade_ms': 180, 'engine_crossfade': 'equal-power adjacent layers; keep each phase running',
                             'loop_edge_guard_ms': 5, 'loop_edge_ramp_ms': 10,
                             'loop_playback': 'decodeAudioData + AudioBufferSourceNode; apply sample loop points; HTMLAudio loop is preview only',
                             'distance_note': 'Both siren files are -18 LUFS. Apply their different recommended gains for near/far levels.'},
                'burst_patterns': {key: {'shot_count': len(shot_times(seconds)),
                    'shot_times_s': [round(s, 6) for s in shot_times(seconds)],
                    'cadence_hz': 12 if seconds == 1.2 else 14,
                    'pattern': 'two-five-shot-volleys' if seconds == 1.2 else 'continuous'}
                    for seconds, key in [(.5, '050'), (.8, '080'), (1.2, '120')]},
                'timing_note': '1.2s: two five-shot volleys at 12Hz; 6–10 shots and uninterrupted 12–16Hz for 1.2s are incompatible.',
                'assets': ASSETS}
    (ROOT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, separators=(',', ':')) + '\n')
    write_report(manifest)
    total = sum(p.stat().st_size for p in ROOT.rglob('*') if p.is_file())
    assert total <= 500000, total
    print(f'COMPLETE: {len(ASSETS)} assets, {len(ASSETS)*2} encodes; entire directory {total:,} bytes')


def write_report(m):
    rows = []
    for a in ASSETS:
        for fmt, f in a['files'].items():
            bands = ' | '.join(f'{v:.3f}%' for v in f['band_energy_pct'])
            rows.append(f'| {a["id"]} · {fmt} | {f["lufs"]:.2f} | {f["true_peak_dbtp"]:.2f} | {bands} | {f["bytes"]} |')
    loops = [(a, fmt, f) for a in ASSETS if 'loop' in a for fmt, f in a['files'].items()]
    worst = max((f['band_energy_pct'][3] for a in ASSETS for f in a['files'].values()))
    audio_bytes = sum(f['bytes'] for a in ASSETS for f in a['files'].values())
    text = f'''# Catch Audio v2 — דוח מסירה

חבילת סינתזה מקורית למשחק המרדף; CC0-1.0. כל הקבצים כאן חדשים, ללא חיבור למשחק.
מטרת המסירה: מנוע V6 נעים, פתיחה ברורה וקצרה, ופעולה שנשמעת כצרור גם בהפעלה אחת.

## התכולה

- 9 לולאות מנוע באורך 2 שניות: V6 בסיסי, ניידת עמוקה ונמלט חד, כל אחד בסל״ד נמוך/בינוני/גבוה.
- החלפת הילוך עדינה (0.4 שנ׳) ופתיחה (1.5 שנ׳): התנעה וסירנה רכה אחת בלבד.
- 3 צרורות בסיס + 30 וריאציות כלים: פנצ׳ר, רשת, קוצים, EMP וסימון; שתי וריאציות לכל משך ולכל כלי.
- 2 לולאות סירנה רכה של 3 שניות: קרוב ורחוק. 46 צלילים, 92 קבצי אודיו.
- OGG מכיל Opus ב־20kbps constrained VBR, MP3 ב־32kbps; מונו, פענוח ב־48kHz.
- גודל האודיו: **{audio_bytes:,} בתים**. תקרת כל התיקייה, כולל תיעוד וקוד המקור: 500,000 בתים.

## החלטות צליל ותזמון

מודל המנוע משתמש בשלוש פעימות בעירה לסיבוב (V6 ארבע פעימות), הרמוניות מעוגלות,
אי־אחידות עדינה ורעש יניקה/פליטה מסונן. זהו עיצוב צליל מסונתז, לא הקלטת רכב.
הנמלט בהיר מעט יותר והניידת נמוכה יותר; אין שכבת צפצוף או זמזם אזעקה.
הסירנה היא גלישה נמוכה ונושפת, ללא גל מרובע וללא חיתוך חד בין תווים.
הכלים נבדלים בגוף ובמרקם: פנצ׳ר יבש, רשת אוורירית וכהה, קוצים מכניים,
EMP עמוק, סימון קל ובהיר. אותו דפוס צרור נשמר בכל הווריאציות.
אין קולות פגיעה באדם, צרחות או פיצוץ; האפקטים מעוגלים וקצרים ומתוכננים למשחק לילדים.

**הדרישות של 1.2 שנ׳ סותרות מתמטית:** צרור רציף ב־12–16 הרץ דורש כ־14–19 יריות.
כדי לשמור על 6–10 יריות, בגרסת 1.2 שנ׳ יש שני מקטעים של 5 יריות ב־12 הרץ,
בהתחלה 0.010 ו־0.720 שנ׳. ב־0.5 שנ׳ יש 6 יריות וב־0.8 שנ׳ 10, ב־14 הרץ.
זמני כל היריות מפורטים במניפסט. הד קצר של 27 ו־53 מ״ש כלול בתוך אורך הקובץ.

## עוצמות, ריכוך ולולאות

כל פורמט נמדד **אחרי קידוד ופענוח**, ולא רק קובץ המקור: ‎−18 LUFS בסטייה עד 0.2,
true peak עד ‎−1 dBTP. רוויה רכה ב־tanh ומסנן נוסף מיושמים רק כשנדרש ריסון פסגות. מדידת LUFS לפי FFmpeg loudnorm / EBU R128.
רמפת raised-cosine של 10 מ״ש בתחילת כל קובץ; שחרור רך בסוף.
בלולאות: guard שקט של 5 מ״ש בכל קצה ורמפות 10 מ״ש פנימה, כדי לצמצם שאריות קידוד בתפר.
הריכוך וה־guard גורמים להנמכה מחזורית קצרה של 30 מ״ש סביב התפר; אין טענה לרמת RMS קבועה בתפר.
פער תפר מרבי שנמדד בפענוח: **{max(f['seam_jump_dbfs'] for _, _, f in loops):.2f} dBFS**.
נקודות הלולאה הן 0–96,000 דגימות למנוע ו־0–144,000 לסירנה, קצה סוף בלעדי.
MP3 מכיל Xing/LAME ו־OGG/Opus מכיל pre-skip/granule כדי להסיר השהיית קודק בפענוח.
ללולאה במשחק להשתמש ב־Web Audio ובנקודות מהמניפסט; `audio.loop` תלוי בדפדפן.

עוצמות מומלצות הן gain ליניארי נוסף, לא נרמול: master ‏0.7, מנוע ‏0.28,
נמלט ‏0.22, פתיחה ‏0.38, צרור בסיס ‏0.34, כלים ‏0.28, הילוך ‏0.24,
סירנה קרובה ‏0.10 ורחוקה ‏0.035. שתי הסירנות ב־‎−18 LUFS בקובץ;
הפער בעוצמת הרקע נוצר ב־gain המומלץ, והרחוקה גם כהה יותר.
להכלאת מנועים: שכבות רצות באותו זמן ומעבר equal-power בין שתי שכבות סמוכות במשך 180 מ״ש.
מקסימום צרור פעיל אחד; אין צורך לטעון את שני הפורמטים יחד.

## מדידה לפי תחום

FFT חד־צדדי על **כל הדגימות המפוענחות**, ללא חלון או שקלול; מכפילים כוח בבינים הפנימיים,
סוכמים בכל תחום ומחלקים בכוח הכולל (Parseval). התחומים ללא חפיפה, קצה עליון בלעדי.
המגבלה של 8% נבדקה לכל אחד מ־92 הקבצים. המרבי ב־2–5kHz: **{worst:.4f}%**.
התוצאות מייצגות את הקבצים; אינן מדידת עוצמה פיזית ברמקול או אישור לבטיחות שמיעה.

| קובץ | LUFS | dBTP | 0–200 Hz | 200–500 Hz | 500–2000 Hz | 2–5 kHz | 5–12 kHz | 12–24 kHz | בתים |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
''' + '\n'.join(rows) + '''

## מקור, שחזור וגבולות המסירה

כל הגלים, הרעש וההדים נוצרו ב־`synthesize.py` עם seed קבוע 20261114.
אין דגימות, הקלטות, מודלי AI או נכסים חיצוניים. LICENSE.txt כולל את נוסח CC0 המלא.
לשחזור: Python עם NumPy ו־SciPy, ו־FFmpeg עם libopus/libmp3lame; להריץ `python synthesize.py`.
הקוד מוודא משך מפוענח מדויק, LUFS, true peak, מגבלת הספקטרום, תפר וגודל חבילה.
מניפסט כולל SHA-256 ונתוני מדידה לכל פורמט. זהו קוד יצירת נכסים, לא שינוי בתשתית בדיקות.
שחזור בתים זהים דורש גם אותן גרסאות ספריות וקודקים.

`listen.html` הוא דף ביקורת עצמאי בעברית, עם שני הפורמטים, gain מומלץ/נרמול,
עצירה, לולאות Web Audio והכלאת סל״ד. יש לפתוח דרך שרת HTTP מקומי לצד הקבצים.
אימות דפדפן ותוצאות החבילה המלאות מתועדים ב־VALIDATION.md.
לא נערכה כאן האזנה אנושית; תחושת טבעיות ונעימות דורשת האזנה, במיוחד ברמקול טלפון.
אין שינוי בקוד קיים, release.json, תגי גרסה, CLAUDE.md, ops או קובצי בדיקות.
'''
    (ROOT / 'REPORT.md').write_text(text)


if __name__ == '__main__':
    build()
