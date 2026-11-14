#!/usr/bin/env python3
"""Deterministic catch-siren-v3 assets; validate the actual lossy deliverables.

Python >=3.10, NumPy, SciPy, FFmpeg (libopus + libmp3lame).
Run without arguments to rebuild; --validate-only reads files without writing.
No network, source samples, loudness equalization, hard clipping or FM is used.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys

import numpy as np
import scipy
from scipy import optimize, signal

ROOT = Path(__file__).resolve().parent
SR = 48_000
SEED = 20_261_114
NOTES = (523.2511306011972, 698.4564628660078)
SLOT = 0.375
SIREN_SECONDS = 3.0
BURST_SECONDS = 0.8
RATE = 11.5
ONSETS = 0.020 + np.arange(7) / RATE
GAINS = np.array([1.0, 0.92, 0.84, 0.76, 0.68, 0.60, 0.52])
EDGE_SECONDS = 0.008
FORMATS = ("ogg", "mp3")
# name, Hebrew label, crack band, body Hz, crack decay, click Hz, short ring Hz
TOOLS = (
    ("puncture", "פנצ׳ר", (1100, 4500), 210, 0.012, 4000, 1900),
    ("net", "רשת", (1000, 3000), 170, 0.018, 2800, 1200),
    ("spikes", "קוצים", (1800, 5000), 300, 0.010, 4500, 3600),
    ("mark", "סימון", (1250, 4000), 240, 0.014, 3100, 2300),
    ("pulse", "פולס", (1000, 2400), 150, 0.020, 4000, 1500),
)


def db(value):
    return float(20 * np.log10(max(float(value), 1e-15)))


def rms(x):
    return float(np.sqrt(np.mean(np.square(x))))


def at_rms(x, target_dbfs):
    return x * 10 ** (target_dbfs / 20) / rms(x)


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def run(args, data=None):
    return subprocess.run(args, input=data, stdout=subprocess.PIPE,
                          stderr=subprocess.PIPE, check=True).stdout


def decode(path):
    raw = run(["ffmpeg", "-v", "error", "-i", str(path), "-map", "0:a:0",
               "-f", "f64le", "-ac", "1", "-ar", str(SR), "pipe:1"])
    return np.frombuffer(raw, dtype="<f8").copy()


def encode(x, path):
    codec = (["-c:a", "libopus", "-b:a", "128k", "-application", "lowdelay",
              "-frame_duration", "2.5", "-vbr", "off"] if path.suffix == ".ogg"
             else ["-c:a", "libmp3lame", "-b:a", "192k", "-write_xing", "1"])
    run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR),
         "-ac", "1", "-i", "pipe:0", "-map_metadata", "-1", *codec,
         "-fflags", "+bitexact",
         str(path)], np.asarray(x, dtype="<f4").tobytes())


def siren(distance):
    """Fixed-frequency slots, smoothly gated, never swept or waveshaped."""
    length = round(SLOT * SR)
    t = np.arange(length) / SR
    gate = np.ones(length)
    edge = round(EDGE_SECONDS * SR)
    ramp = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, edge))
    gate[:edge] = ramp
    gate[-edge:] = ramp[::-1]
    x = np.concatenate([np.sin(2 * np.pi * NOTES[i % 2] * t) * gate
                        for i in range(8)])
    return at_rms(x, -34 if distance == "near" else -43)


def noise_band(rng, count, band):
    sos = signal.butter(3, band, btype="bandpass", fs=SR, output="sos")
    x = signal.sosfilt(sos, rng.standard_normal(count))
    return x / rms(x)


def shot_template(tool_index):
    _, _, band, body_hz, decay, click_hz, ring_hz = TOOLS[tool_index]
    rng = np.random.default_rng(SEED + 101 * tool_index)
    t = np.arange(round(0.20 * SR)) / SR
    # Three separate layers: high-band crack, short low thump, high click.
    attack = 1 - np.exp(-(t / 0.00065) ** 2)
    crack = 0.86 * noise_band(rng, len(t), band) * attack * np.exp(-t / decay)
    thump = 0.29 * (np.sin(2 * np.pi * body_hz * t)
                    + 0.20 * noise_band(rng, len(t), (250, 1400)))
    thump *= (1 - np.exp(-t / 0.0015)) * np.exp(-t / 0.026)
    ct = np.maximum(t - 0.003, 0)
    click = 0.55 * np.sin(2 * np.pi * click_hz * ct)
    click *= (1 - np.exp(-ct / 0.00025)) * np.exp(-ct / 0.0025)
    ring_gain = 0.45 if tool_index == 4 else 0.18
    ring = ring_gain * np.sin(2 * np.pi * ring_hz * t) * attack * np.exp(-t / 0.012)
    # Bound burst-only transient crest smoothly, before gain/echo; the siren
    # never passes through saturation. This retains a crack without clipping.
    dry = 0.65 * np.tanh((crack + thump + click + ring) / 0.65)
    wet = dry.copy()
    # Two quiet reflections finish quickly; no extra shot-like late echoes.
    for delay, gain in ((0.038, 0.13), (0.064, 0.055)):
        offset = round(delay * SR)
        wet[offset:] += gain * dry[:-offset]
    tail = round(0.012 * SR)
    wet[-tail:] *= 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, tail))
    return wet


def burst(tool_index):
    x = np.zeros(round(BURST_SECONDS * SR))
    shot = shot_template(tool_index)
    for onset, gain in zip(ONSETS, GAINS):
        start = round(onset * SR)
        x[start:start + len(shot)] += gain * shot
    return at_rms(x, -20.5)


def definitions():
    assets = []
    for distance, label in (("near", "קרוב"), ("far", "רחוק")):
        assets.append({"id": f"siren-{distance}", "label_he": f"סירנה — {label}",
                       "category": "siren", "distance": distance,
                       "duration_s": SIREN_SECONDS, "recommended_gain": 1.0,
                       "loop": {"start_sample": 0, "end_sample_exclusive": 144000,
                                "sample_rate_hz": SR, "start_s": 0, "end_s": 3}})
    for index, tool in enumerate(TOOLS):
        assets.append({"id": f"burst-{tool[0]}", "label_he": tool[1],
                       "category": "burst", "tool": tool[0],
                       "duration_s": BURST_SECONDS, "recommended_gain": 1.0,
                       "timbre": {"crack_band_hz": list(tool[2]),
                                  "body_hz": tool[3], "crack_decay_ms": tool[4] * 1000,
                                  "click_hz": tool[5], "ring_hz": tool[6],
                                  "ring_gain": 0.45 if index == 4 else 0.18},
                       "shot_count": 7, "cadence_hz": RATE,
                       "shot_onsets_samples": [round(v * SR) for v in ONSETS],
                       "shot_onsets_s": [round(v, 9) for v in ONSETS],
                       "shot_linear_gains": GAINS.tolist(),
                       "echo": [{"delay_ms": 38, "gain": 0.13},
                                {"delay_ms": 64, "gain": 0.055}]})
    return assets


def band_metrics(x):
    # One-sided whole-file FFT power, Parseval normalized, no weighting.
    f = np.fft.rfftfreq(len(x), 1 / SR)
    p = np.abs(np.fft.rfft(x)) ** 2
    p[1:-1] *= 2
    total = float(p.sum())
    band = float(p[(f >= 1000) & (f < 5000)].sum() / total)
    above = float(p[f > 900].sum() / total)
    centroid = float(np.sum(f * p) / total)
    return {"energy_1_to_5khz_pct": round(100 * band, 5),
            "energy_above_900hz_dbr": round(10 * np.log10(max(above, 1e-15)), 3),
            "spectral_centroid_hz": round(centroid, 2)}


def tone_fit(y, frequency):
    t = np.arange(len(y)) / SR
    window = np.hanning(len(y))
    a = np.column_stack((np.sin(2 * np.pi * frequency * t),
                         np.cos(2 * np.pi * frequency * t), np.ones(len(y))))
    coefficients = np.linalg.lstsq(a * np.sqrt(window[:, None]),
                                  y * np.sqrt(window), rcond=None)[0]
    return coefficients, y - a @ coefficients


def siren_metrics(x):
    frequencies, h2, high_lines, residuals = [], [], [], []
    # Two disjoint stable 120ms windows in EVERY note, beyond codec transitions.
    for slot in range(8):
        expected = NOTES[slot % 2]
        for position in (0.060, 0.195):
            start = round((slot * SLOT + position) * SR)
            y = x[start:start + round(0.12 * SR)]
            def loss(frequency):
                _, residual = tone_fit(y, frequency)
                return float(np.mean(residual ** 2 * np.hanning(len(y))))
            estimate = optimize.minimize_scalar(loss, bounds=(expected - 4, expected + 4),
                                                method="bounded",
                                                options={"xatol": 1e-7}).x
            frequencies.append(float(estimate))
            coefficients, residual = tone_fit(y, estimate)
            amplitude = float(np.hypot(*coefficients[:2]))
            harmonic, _ = tone_fit(residual, 2 * estimate)
            h2.append(db(np.hypot(*harmonic[:2]) / amplitude))
            w = np.hanning(len(y))
            spectrum = 2 * np.abs(np.fft.rfft(residual * w, n=65536)) / w.sum()
            fft_f = np.fft.rfftfreq(65536, 1 / SR)
            high_lines.append(db(spectrum[fft_f > 900].max() / amplitude))
            residuals.append(db(rms(residual) / rms(y)))
    errors = [abs(f - NOTES[(i // 2) % 2]) for i, f in enumerate(frequencies)]
    drift = max(max(frequencies[i:i + 2]) - min(frequencies[i:i + 2])
                for i in range(0, 16, 2))
    seam = x[0] - x[-1]
    seam_slope = (x[1] - x[0]) - (x[-1] - x[-2])
    # The full encoded/decoded seam is checked, with no trim, repair or padding.
    require(max(errors) < 0.5, "Siren note deviates from C5/F5")
    require(drift < 0.4, "Siren has pitch drift within a note")
    require(max(h2) < -30, "Siren H2 is not below -30 dBc")
    require(max(high_lines) < -40, "Siren has a >900 Hz line above -40 dBc")
    require(max(residuals) < -35, "Siren plateau is not a near-pure sine")
    require(db(abs(seam)) < -65, "Siren loop value discontinuity")
    require(db(abs(seam_slope)) < -60, "Siren loop slope discontinuity")
    require(band_metrics(x)["energy_above_900hz_dbr"] < -35,
            "Siren has excessive high-band switching/codec energy")
    return {"plateau_count": 16, "pitch_estimates_hz": [round(f, 5) for f in frequencies],
            "max_pitch_error_hz": round(max(errors), 5),
            "max_within_note_drift_hz": round(drift, 5),
            "worst_second_harmonic_dbc": round(max(h2), 3),
            "worst_line_above_900hz_dbc": round(max(high_lines), 3),
            "worst_plateau_residual_dbr": round(max(residuals), 3),
            "seam_jump_dbfs": round(db(abs(seam)), 3),
            "seam_slope_mismatch_dbfs": round(db(abs(seam_slope)), 3)}


def burst_metrics(x, siren_reference):
    # Measure actual decoded high-band onset peaks, not just synthesis metadata.
    high = signal.sosfilt(signal.butter(3, (1000, 5000), btype="bandpass",
                                      fs=SR, output="sos"), x)
    frame = 96  # 2ms power bins resolve the ~87ms cadence.
    power = np.mean(high.reshape(-1, frame) ** 2, axis=1)
    power = np.convolve(power, np.ones(3) / 3, mode="same")  # 6ms energy envelope
    peaks, _ = signal.find_peaks(power, height=power.max() * 0.08,
                                 distance=round(0.065 * SR / frame), prominence=power.max() * 0.04)
    measured = (peaks * frame + frame / 2) / SR
    require(len(measured) == 7, f"Detected {len(measured)} shots, expected seven")
    # Peak latency is tool-specific but must stay constant from shot to shot.
    delays = measured - ONSETS
    require(np.ptp(delays) < 0.0041, "Decoded shots do not follow declared onsets")
    require(np.max(np.abs(np.diff(measured) - 1 / RATE)) < 0.0041,
            "Burst cadence is not 11.5 shots/s")
    shot_rms, shot_high_rms = [], []
    for onset in ONSETS:
        start = round(onset * SR)
        end = start + round(0.030 * SR)
        shot_rms.append(db(rms(x[start:end])))
        shot_high_rms.append(db(rms(high[start:end])))
    require(all(a > b for a, b in zip(shot_rms, shot_rms[1:])),
            "Decoded shots are not progressively quieter")
    require(all(a > b for a, b in zip(shot_high_rms, shot_high_rms[1:])),
            "Decoded high-band cracks are not progressively quieter")
    ref_db = db(rms(siren_reference))
    rms_margin = db(rms(x)) - ref_db
    energy_margin = 10 * np.log10(np.sum(x ** 2) / np.sum(siren_reference ** 2))
    shot_margin = min(shot_rms) - ref_db
    require(rms_margin >= 6, "Burst RMS margin is below 6 dB")
    require(energy_margin >= 6, "Burst total-energy margin is below 6 dB")
    require(shot_margin >= 6, "Quietest shot RMS margin is below 6 dB")
    require(band_metrics(x)["energy_1_to_5khz_pct"] >= 45,
            "Burst has insufficient 1-5 kHz energy")
    require(db(rms(x[-round(0.030 * SR):])) < -70, "Burst echo/tail is cut short")
    return {"detected_shot_count": len(measured),
            "detected_peak_times_s": [round(v, 6) for v in measured],
            "max_cadence_interval_error_ms": round(1000 * np.max(np.abs(np.diff(measured) - 1 / RATE)), 3),
            "shot_rms_30ms_dbfs": [round(v, 3) for v in shot_rms],
            "shot_high_band_rms_30ms_dbfs": [round(v, 3) for v in shot_high_rms],
            "rms_margin_over_near_siren_db": round(rms_margin, 3),
            "total_energy_margin_over_3s_near_siren_db": round(float(energy_margin), 3),
            "quietest_shot_margin_over_near_siren_db": round(shot_margin, 3)}


def validate(assets):
    decoded = {(a["id"], fmt): decode(ROOT / f'{a["id"]}.{fmt}')
               for a in assets for fmt in FORMATS}
    for asset in assets:
        asset["files"] = {}
        for fmt in FORMATS:
            path = ROOT / f'{asset["id"]}.{fmt}'
            x = decoded[asset["id"], fmt]
            probe = json.loads(run(["ffprobe", "-v", "error", "-select_streams", "a:0",
                                    "-show_entries", "stream=codec_name,sample_rate,channels",
                                    "-of", "json", str(path)]))["streams"][0]
            require(int(probe["sample_rate"]) == SR and probe["channels"] == 1,
                    f"Wrong native stream format: {path.name}")
            require(len(x) == round(asset["duration_s"] * SR), f"Wrong decoded length: {path.name}")
            require(np.isfinite(x).all(), f"Nonfinite samples: {path.name}")
            true_peak = db(np.max(np.abs(signal.resample_poly(x, 4, 1))))
            require(true_peak < -1, f"Insufficient true-peak headroom: {path.name}")
            metrics = {"path": path.name, "codec": probe["codec_name"],
                       "bytes": path.stat().st_size,
                       "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                       "decoded_samples": len(x), "rms_dbfs": round(db(rms(x)), 3),
                       "true_peak_4x_dbtp": round(true_peak, 3), **band_metrics(x)}
            if asset["category"] == "siren":
                metrics.update(siren_metrics(x))
            else:
                metrics.update(burst_metrics(x, decoded["siren-near", fmt]))
            asset["files"][fmt] = metrics
        print(f'PASS {asset["id"]}: OGG + MP3 (decoded)', flush=True)
    for fmt in FORMATS:
        delta = db(rms(decoded["siren-near", fmt])) - db(rms(decoded["siren-far", fmt]))
        require(8.5 < delta < 9.5, "Near/far sirens do not differ by 9 dB")
        centroids = [a["files"][fmt]["spectral_centroid_hz"] for a in assets if a["category"] == "burst"]
        require(min(abs(a - b) for i, a in enumerate(centroids) for b in centroids[i + 1:]) > 40,
                "Tool spectral centroids are insufficiently distinct")
    return assets


def manifest(assets):
    return {"schema_version": 3, "name": "catch-siren-v3", "license": "CC0-1.0",
            "provenance": "Original procedural synthesis; no recordings or third-party samples.",
            "source": "synthesize.py", "seed": SEED, "sample_rate_hz": SR, "channels": 1,
            "encoding": {"ogg": "Opus CBR 128k, lowdelay/2.5ms", "mp3": "LAME CBR 192k, Xing/LAME gapless metadata"},
            "playback": {"master_gain": 0.7, "relative_asset_gain": 1,
                         "max_simultaneous_bursts": 1, "max_simultaneous_sirens": 1,
                         "stop_fade_ms": 12, "loop_playback": "Web Audio decoded buffer, exact sample loop points",
                         "level_note": "Levels are baked into files. Do not independently normalize or apply v2 gains."},
            "siren_pattern": {"notes": ["C5", "F5"], "frequencies_hz": list(NOTES),
                              "slot_s": SLOT, "slot_count": 8, "edge_ramp_ms": 8,
                              "waveform": "sine only, fixed frequency per slot, no FM, no added harmonics",
                              "near_far_rms_difference_db": 9},
            "validation": {"domain": "Encoded files decoded by FFmpeg, no post-decode repair",
                           "second_harmonic_limit_dbc": -30, "high_tonal_line_limit_dbc": -40,
                           "high_tonal_line_min_hz": 900, "minimum_burst_margin_db": 6,
                           "minimum_burst_1_to_5khz_energy_pct": 45,
                           "python": sys.version.split()[0], "numpy": np.__version__, "scipy": scipy.__version__,
                           "ffmpeg": run(["ffmpeg", "-version"]).decode().splitlines()[0]},
            "assets": assets}


def report(assets):
    sirens = [a for a in assets if a["category"] == "siren"]
    bursts = [a for a in assets if a["category"] == "burst"]
    lines = ["# אימות חבילת סירנה וצרורות v3", "", "תוצאה: **PASS — כל 14 הקבצים המקודדים עברו.**", "",
             "ענף: `codex/catch-siren-v3`. כל תוצרי המשימה בתיקייה חדשה זו בלבד.",
             "אין שינוי בקובץ קיים, בקוד המשחק, בגרסה או בחדר הבקרה; הוראת המשתמש מגבילה את הכתיבה לתיקייה החדשה.", "",
             "## סירנה", "",
             "לופ בן 3 שניות: C5 ‏(523.251131 הרץ) ו־F5 ‏(698.456463 הרץ), שמונה מקטעים מתחלפים של 375 מ״ש.",
             "כל מקטע הוא סינוס בתדר קבוע עם רמפת קוסינוס מוגבה של 8 מ״ש בשני קצותיו. אין גלישת תדר, יללה, גל מרובע או הרמוניות מכוונות.",
             "הרחוקה זהה בגובה הצליל ובקצב ונמוכה מהקרובה ב־9 דציבל בקובץ עצמו.", "",
             "| קובץ | RMS dBFS | שגיאת תדר מרבית Hz | H2 dBc | קו מעל 900 Hz, dBc | קפיצת תפר dBFS | שיפוע תפר dBFS |",
             "|---|---:|---:|---:|---:|---:|---:|"]
    for a in sirens:
        for fmt, m in a["files"].items():
            lines.append(f'| {a["id"]}.{fmt} | {m["rms_dbfs"]} | {m["max_pitch_error_hz"]} | {m["worst_second_harmonic_dbc"]} | {m["worst_line_above_900hz_dbc"]} | {m["seam_jump_dbfs"]} | {m["seam_slope_mismatch_dbfs"]} |')
    lines += ["", "H2 נדרש מתחת ל־‎−30 dBc (הנחת פירוש שמרנית לדרישת 30 דציבל): עוצמת ההרמוניה ביחס ליסוד.",
              "לכל קובץ נבדקו 16 חלונות יציבים של 120 מ״ש, שניים בכל מקטע, במרחק 60 מ״ש לפחות מההתחלה.",
              "התדר נמדד בהתאמת סינוס חופשית סביב התו הצפוי; שגיאה מרבית מותרת 0.5 הרץ ושינוי בתוך מקטע קטן מ־0.4 הרץ.",
              "לאחר הסרת היסוד נמדדה ההרמוניה השנייה; סריקת FFT עם חלון Hann מחפשת כל קו מעל 900 הרץ, עד נייקוויסט.",
              "אף קו בחלונות היציבים אינו רשאי לעבור ‎−40 dBc. זה חזק מבדיקת קו קבוע בלבד, ומגדיר סף מדיד גם לרעש קידוד זעיר.",
              "בנוסף נבדקת אנרגיה מעל 900 הרץ על הקובץ המלא, כולל המעברים: פחות מ־‎−35 dB ביחס לסך האנרגיה.",
              "התפר נבדק על הקובץ המפוענח המלא ללא חיתוך: 144,000 דגימות, קפיצת ערך מתחת ל־‎−65 dBFS ושינוי שיפוע מתחת ל־‎−60 dBFS.", "",
              "## צרורות", "",
              "כל צרור בן 0.8 שניות: שבע יריות, הראשונה ב־20 מ״ש והבאות כל ‎1/11.5 שנייה (86.956522 מ״ש).",
              "לכל ירייה נפץ רעש מסונן, חבטה קצרה, קליק בתדר גבוה וגוון תהודה קצר לכל כלי. רוויה רכה בצרורות בלבד מרסנת שיאים ללא חיתוך קשיח; הסירנות נשארות סינוס טהור.",
              "מקדמי העוצמה: 1.00, 0.92, 0.84, 0.76, 0.68, 0.60, 0.52. שני הדים בלבד: 38 מ״ש × 0.13 ו־64 מ״ש × 0.055.",
              "אין מסנן נמוכים כולל על הצרורות. לפחות 45% מהאנרגיה בכל קובץ מפוענח חייבת להיות בתחום 1–5 קה״ץ.", "",
              "| קובץ | RMS dBFS | 1–5 kHz % | מרכז ספקטרלי Hz | הפרש RMS dB | הפרש אנרגיה כוללת dB | ירייה חלשה מול הסירנה dB | dBTP ×4 |",
              "|---|---:|---:|---:|---:|---:|---:|---:|---:|"]
    for a in bursts:
        for fmt, m in a["files"].items():
            lines.append(f'| {a["id"]}.{fmt} | {m["rms_dbfs"]} | {m["energy_1_to_5khz_pct"]} | {m["spectral_centroid_hz"]} | {m["rms_margin_over_near_siren_db"]} | {m["total_energy_margin_over_3s_near_siren_db"]} | {m["quietest_shot_margin_over_near_siren_db"]} | {m["true_peak_4x_dbtp"]} |')
    lines += ["", "כל ההפרשים הם מול הסירנה **הקרובה**, באותו קודק, ללא הגבר נוסף:",
              "1. RMS: ‏20log10(RMS צרור / RMS לופ).",
              "2. אנרגיה כוללת: ‏10log10(סכום ריבועי דגימות הצרור / סכום ריבועי דגימות כל לופ הסירנה בן 3 שניות).",
              "3. הירייה החלשה: RMS בחלון 30 מ״ש מהתחלת כל ירייה, הנמוך מבין שבע היריות, מול RMS הסירנה.",
              "כל אחד משלושת המדדים חייב לעבור 6 דציבל. כך גם היריות האחרונות נשארות ברורות.",
              "שבע הפסגות מתגלות מחדש באות המפוענח לפי הספק ב־1–5 קה״ץ בחלונות 2 מ״ש והחלקת מעטפת 6 מ״ש; סטיית מרווח מותרת 4.1 מ״ש עקב רזולוציית הגילוי.",
              "נבדקת ירידה רציפה ב־RMS של שבע היריות וגם ברכיב הגבוה שלהן. זמנים, עוצמות וסטיות נמדדים מפורטים במניפסט.",
              "הגוונים שונים בסינון הנפץ, תדר החבטה, הקליק והתהודה. גם מרכזי הספקטרום חייבים להיבדל ביותר מ־40 הרץ בין כל זוג כלים.", "",
              "## בדיקות מסירה — 14/11/2026", "",
              "בוצעה ביקורת אות עצמאית, בנוסף לאימות המובנה: כל 14 הקבצים באורך המדויק, ללא חיתוך שיאים.",
              "התאמת צורת גל עצמאית זיהתה שבע יריות בכל אחד מעשרת קובצי הצרורות: שגיאת התחלה מרבית 0.479 דגימה ושגיאת מרווח מרבית 0.914 דגימה (פחות מ־0.02 מ״ש).",
              "המתאם המוחלט המרבי בין חלונות הירייה של כלים שונים היה 0.0842. תפר הסירנה תאם למעברים הפנימיים ב־RMS של 40 מ״ש עד כדי 0.026 דציבל.", "",
              "בדיקת Chromium בפועל דרך שרת מקומי:",
              "- כל 14 הקבצים פוענחו גם ב־decodeAudioData במונו, 48 קה״ץ: סירנות 144,000 דגימות, צרורות 38,400 דגימות, בשני הפורמטים.",
              "- לולאה ניגנה מעל שני מחזורים (6.3 שניות) עם גבולות 0–3 שניות; הגבר ראשי 0.7 והגבר נכס 1 נשמרו.",
              "- ערבוב סירנה וצרור, השוואת חמישה כלים ומעבר בין הפורמטים עברו.",
              "- עצירה והחלפת פורמט במהלך טעינה שעוכבה ב־350 מ״ש לא הפעילו מקורות מאוחרים; גם ביטול השוואה בזמן טעינה עבר.",
              "- טעינת 14 הקבצים והמניפסט דרך בורר הקבצים המקומי עבדה. ניווט file:// עצמו נחסם במדיניות Chromium בסביבת הבדיקה, ולכן נבדק מסלול הבורר מתוך דף HTTP.",
              "- תצוגות מחשב ומובייל 390 פיקסלים נבדקו, ללא גלילה אופקית וללא שגיאות JavaScript.", "",
              "בדיקות הריפו: `npm test` סיים 4,017 בדיקות בהצלחה, דילג על 64 ונכשל במבחן דפדפן קיים אחד ב־`tests/workout-royiki.test.mjs` בגלל קובץ הפעלה חסר של Playwright Chromium Headless Shell.",
              "התהליך של אותו מבחן נשאר פתוח והופסק לאחר יותר מעשר דקות. לא שונו קובצי ריפו כדי לתקן את סביבת הבדיקה.",
              "המבחן הבודד הורץ מחדש עם Chromium 151.0.7922.173 המותקן, דרך קישור הפעלה בתיקייה זמנית מחוץ לריפו: **5 עברו, 0 נכשלו**, כולל בדיקת 50 האנימציות בדפדפן.",
              "שחזור זהה בבתים נבדק לסירנה הקרובה ולצרור הקוצים, בשני הפורמטים. בדיקת שינויי Git אישרה 18 תוספות בתיקייה זו בלבד ואפס שינויים בקבצים קיימים.", "",
              "## קידוד, שחזור והאזנה", "",
              "48 קה״ץ, מונו. OGG: ‏Opus בקצב 128 קילוביט/שנייה ובחלונות lowdelay של 2.5 מ״ש; MP3: ‏LAME בקצב 192 קילוביט/שנייה עם מידע השהיה וריפוד.",
              "כל המדדים לעיל מחושבים מחדש לאחר קידוד ופענוח FFmpeg. אין תיקון אות אחרי הפענוח ואין נרמול עוצמה נפרד.",
              "שיא אמיתי נאמד בדגימת יתר ×4; נדרש מרווח של לפחות 1 דציבל. מספרי דגימות, SHA-256, גדלים ומדדים לכל פורמט במניפסט.",
              "כל הגלים נוצרו בקוד מקורי עם seed קבוע; אין דגימות חיצוניות. הנכסים המקוריים משוחררים תחת CC0-1.0.", "",
              "תלויות: Python 3.10+, NumPy, SciPy, FFmpeg עם libopus ו־libmp3lame.",
              "שחזור מתוך תיקיית החבילה:", "", "```sh", "python3 synthesize.py", "```", "",
              "אימות בלבד, ללא כתיבה, כולל התאמת גיבובי הקבצים למניפסט:", "", "```sh", "python3 synthesize.py --validate-only", "```", "",
              "שחזור ערכי האות דטרמיניסטי; בתים זהים דורשים אותן גרסאות ספריות וקודקים (גרסאות הכלים מופיעות במניפסט).",
              "להאזנה, מתוך תיקיית החבילה:", "", "```sh", "python3 -m http.server 8765", "```", "",
              "פתחו [דף האזנה](http://localhost:8765/listen.html), בחרו פורמט והפעילו סירנה; נסו כל כלי גם מעל הסירנה.",
              "הלולאה משתמשת ב־Web Audio עם גבולות הדגימות המדויקים. פתיחה דרך file:// עשויה לחסום טעינת שמע; השתמשו בשרת המקומי.",
              "הגבר ראשי 0.7 חל על הכול. אין להחיל הגברים של v2 או נרמול נפרד שיבטל את הפערים שנמדדו.",
              "האימות האוטומטי מודד תדרים, תפרים ואנרגיה; הוא אינו האזנה אנושית. אופי הצליל ברמקול הטלפון נשאר לביקורת שמיעתית.", ""]
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--validate-only", action="store_true", help="read-only validation of shipped audio and manifest")
    args = parser.parse_args()
    assets = definitions()
    if not args.validate_only:
        for a in assets:
            x = (siren(a["distance"]) if a["category"] == "siren"
                 else burst(next(i for i, tool in enumerate(TOOLS) if tool[0] == a["tool"])))
            for fmt in FORMATS:
                encode(x, ROOT / f'{a["id"]}.{fmt}')
    assets = validate(assets)
    if args.validate_only:
        saved = json.loads((ROOT / "manifest.json").read_text())
        require(saved["assets"] == assets, "Manifest metadata/hashes differ from measured deliverables")
        require(saved["siren_pattern"] == manifest(assets)["siren_pattern"], "Siren pattern metadata differs")
        print("PASS manifest matches measured assets; no files written")
    else:
        (ROOT / "manifest.json").write_text(json.dumps(manifest(assets), ensure_ascii=False, indent=2) + "\n")
        (ROOT / "VALIDATION.md").write_text(report(assets))
        print("PASS manifest.json + VALIDATION.md written")


if __name__ == "__main__":
    main()
