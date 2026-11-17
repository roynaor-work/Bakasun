#!/usr/bin/env python3
"""Original, deterministic UI synthesis. Requires Python 3, NumPy, native FFmpeg.

Build: python3 synthesize.py
Audit existing exports (no writes): python3 synthesize.py --verify
Rebuild elsewhere: python3 synthesize.py --output /tmp/ui-sounds-rebuild
No downloads, samples, WASM, network, or runtime synthesis dependencies.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import re
import shutil
import subprocess

import numpy as np

SR = 48000
TARGET = -18.0
MAX_BYTES = 30000  # decimal KB, stricter than 30 KiB
TOLERANCE = 0.15
HERE = Path(__file__).resolve().parent


def note(start, midi, length=.22, amp=1.0, voice="wood", end=None):
    # 25 ms guard protects against transform-codec pre-echo at the file boundary.
    return dict(start=start+.025, midi=midi, length=length, amp=amp, voice=voice, end=end)


def melody(pitches, step=.13, length=.32, voice="bell"):
    return [note(.03 + i * step, p, length, 1.0, voice) for i, p in enumerate(pitches)]


def catalog():
    cues = []

    def add(key, label, group, description, notes, duration=None, timing=None):
        duration = duration or max(n["start"] + n["length"] for n in notes) + .09
        cues.append(dict(id=key, label_he=label, group=group, description_he=description,
                         duration_seconds=round(duration, 4), events=notes,
                         timing=timing or {}, loop=False))

    for i, p in enumerate((72, 76, 79), 1):
        add(f"button_{i:02}", f"לחיצה {i}", "navigation", "הקשת עץ עגולה וקצרה",
            [note(.02, p, .13, voice="wood", end=p-2)])
    add("confirm", "אישור", "navigation", "זוג תווים עולה", melody([72, 79], .10, .20, "wood"))
    add("cancel", "ביטול", "navigation", "זוג תווים יורד בעדינות", melody([74, 69], .10, .19, "soft"))
    add("panel_open", "פתיחת פאנל", "navigation", "בועה הנפתחת כלפי מעלה",
        [note(.025, 60, .24, voice="bubble", end=76), note(.15, 79, .17, .32, "soft")])
    add("panel_close", "סגירת פאנל", "navigation", "בועה קטנה היורדת למנוחה",
        [note(.025, 74, .23, voice="bubble", end=60)])
    for suffix, label, p in (("low", "נמוך", 79), ("mid", "בינוני", 83), ("high", "גבוה", 86)):
        add(f"coin_{suffix}", f"מטבע — {label}", "rewards", "ניצוץ פעמון בגובה מובחן",
            [note(.025, p, .26, voice="bell"), note(.065, p+12, .20, .20, "bell")])
    for count in (1, 2, 3):
        add(f"star_{count}", f"כוכב {count}", "rewards", f"תגמול בן {count} צלצולים עולים",
            melody([79, 83, 88][:count], .16, .38))
    add("stage_success", "הצלחת שלב", "outcomes", "עלייה שמחה ומז'ורית עם סיום פתוח",
        melody([72, 76, 79, 84], .16, .44) + [note(.51, 76, .43, .35, "soft")])
    add("soft_failure", "כישלון עדין", "outcomes", "נחיתה רכה שמעודדת ניסיון נוסף",
        melody([67, 64, 60], .16, .32, "soft"))
    add("level_up", "עלייה ברמה", "rewards", "סולם פנטטוני קופצני וסיום נוצץ",
        melody([72, 76, 79, 81, 84, 88], .115, .44) + [note(.605, 72, .43, .40, "soft")])
    add("gift_open", "פתיחת מתנה", "rewards", "בועה נפתחת ואחריה שלושה ניצוצות",
        [note(.025, 55, .28, .8, "bubble", end=76)] +
        [note(t, p, .40, a, "bell") for t, p, a in ((.21, 79, .7), (.33, 83, .85), (.45, 88, 1))])
    add("back_to_menu", "חזרה לתפריט", "navigation", "שיבה קצרה ונינוחה לתו הבית",
        melody([79, 76, 72], .095, .20, "wood"))
    add("passed", "עבר בהצלחה", "outcomes", "חותמת הצלחה קצרה, מובחנת מהצלחת שלב",
        melody([76, 84], .19, .34, "soft") + [note(.22, 79, .34, .35, "bell")])
    add("notification", "התראה", "navigation", "צלצול קשב רך ללא אזעקה",
        melody([79, 81], .22, .27, "soft"))
    pulses = []
    for i in range(10):
        p = 55 if i < 7 else 57
        pulses += [note(i+.025, p, .17, 1, "pulse"), note(i+.235, p+7, .13, .52, "pulse")]
    add("timer_last_10", "טיימר — 10 שניות אחרונות", "timing", "עשרה דפקים כפולים, אחד בכל שנייה",
        pulses, duration=10, timing=dict(pulse_starts_seconds=list(range(10)),
        audible_onset_offset_seconds=.050, period_seconds=1, pulse_count=10,
        usage="Play once when 10 seconds remain; cancel on pause/exit. Not a loop."))
    for digit, p in ((3, 72), (2, 76), (1, 79)):
        add(f"countdown_{digit}", f"ספירה — {digit}", "timing", "תו ספירה מוזיקלי ללא דיבור",
            [note(.025, p, .27, voice="soft")])
    add("countdown_321", "ספירה — 3, 2, 1", "timing", "רצף מלא; תחילת המשחק בשנייה 3",
        [note(i+.025, p, .27, voice="soft") for i, p in enumerate((72, 76, 79))],
        duration=3, timing=dict(counts=[3, 2, 1], count_starts_seconds=[0, 1, 2],
        audible_onset_offset_seconds=.050, start_game_at_seconds=3))
    add("start", "התחלה", "timing", "אות יציאה בהיר וקצר",
        melody([72, 79, 84], .07, .28, "wood"))
    add("game_end", "סיום משחק", "outcomes", "סיום שלם וחיובי גם כשאין ניצחון",
        melody([79, 76, 74, 72], .20, .44, "soft") +
        [note(.63, 64, .44, .4, "soft"), note(.63, 67, .44, .3, "bell")])
    return cues


def synthesize(cue):
    result = np.zeros(round(cue["duration_seconds"] * SR), dtype=np.float64)
    for event in cue["events"]:
        count = round(event["length"] * SR)
        t = np.arange(count) / SR
        u = np.linspace(0, 1, count)
        f0 = 440 * 2 ** ((event["midi"] - 69) / 12)
        f1 = 440 * 2 ** (((event["end"] if event["end"] is not None else event["midi"]) - 69) / 12)
        # Smooth pitch travel; continuous phase, never square/saw oscillators.
        freq = f0 + (f1-f0) * (3*u*u - 2*u*u*u)
        phase = 2*np.pi*np.cumsum(freq)/SR
        voice = event["voice"]
        partials = {"wood": [(1, 1), (2, .22), (3, .07)],
                    "soft": [(1, 1), (2, .12)],
                    "bell": [(1, 1), (2, .24), (3, .10), (4.01, .025)],
                    "bubble": [(1, 1), (2, .17)],
                    "pulse": [(1, 1), (2, .20)]}[voice]
        tone = sum(a*np.sin(ratio*phase)*np.exp(-u*(1+j*.7))
                   for j, (ratio, a) in enumerate(partials))
        attack = .012 if voice != "pulse" else .020
        release = min(.065, event["length"]*.4)
        envelope = np.sin(np.pi/2*np.minimum(t/attack, 1))**2
        envelope *= np.sin(np.pi/2*np.minimum((event["length"]-t)/release, 1))**2
        envelope[-1] = 0
        signal = tone*envelope*event["amp"]
        offset = round(event["start"] * SR)
        assert offset+count <= len(result), cue["id"]
        result[offset:offset+count] += signal
    # Do not subtract a global mean: that would inject DC into the silent tails.
    guard = round(.015*SR)
    result[:guard] *= np.sin(np.linspace(0, np.pi/2, guard))**2
    result[-guard:] *= np.cos(np.linspace(0, np.pi/2, guard))**2
    result /= max(1, np.max(np.abs(result)))
    return result


def ffmpeg(args, data=None):
    proc = subprocess.run(["ffmpeg", "-hide_banner", "-nostdin", *args], input=data,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
    return proc


def pcm_args():
    return ["-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "pipe:0"]


def measure(signal):
    # EBU R128 integrated loudness uses 400 ms blocks. Explicit zero-padding
    # makes shorter UI cues measurable without changing their delivered duration.
    data = signal.astype("<f4").tobytes()
    proc = ffmpeg(["-v", "info", *pcm_args(), "-af",
                   "apad=whole_dur=0.4,loudnorm=I=-18:TP=-1:LRA=7:print_format=json",
                   "-f", "null", "-"], data)
    match = re.search(r'\{\s*"input_i".*?\}', proc.stderr.decode(), re.S)
    if not match:
        raise RuntimeError("Missing FFmpeg loudness measurement")
    values = json.loads(match.group())
    return float(values["input_i"]), float(values["input_tp"])


def decode(path):
    proc = ffmpeg(["-v", "error", "-i", str(path), "-ar", str(SR), "-ac", "1", "-f", "f32le", "-"])
    return np.frombuffer(proc.stdout, dtype="<f4")


def metrics(path):
    signal = decode(path)
    loudness, peak = measure(signal)
    edge = round(.005 * SR)
    return dict(bytes=path.stat().st_size, sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                decoded_duration_seconds=round(len(signal)/SR, 6),
                integrated_lufs=loudness, true_peak_dbtp=peak,
                boundary_peak_dbfs=round(20*math.log10(max(1e-12, float(np.max(np.abs(
                    np.concatenate((signal[:edge], signal[-edge:]))))))), 2),
                max_sample_step=round(float(np.max(np.abs(np.diff(signal)))), 6),
                dc_offset=round(float(np.mean(signal)), 9))


def validate(cue, fmt, values):
    name = cue["id"] + "." + fmt
    checks = [
        (values["bytes"] <= MAX_BYTES, "size > 30,000 bytes"),
        (abs(values["integrated_lufs"]-TARGET) <= TOLERANCE, "loudness outside -18 ±0.15 LUFS"),
        (values["true_peak_dbtp"] <= -1, "true peak > -1 dBTP"),
        (values["boundary_peak_dbfs"] <= -60, "non-silent boundary"),
        (values["max_sample_step"] < .20, "large sample discontinuity"),
        (abs(values["dc_offset"]) < .001, "DC offset"),
        (abs(values["decoded_duration_seconds"]-cue["duration_seconds"]) < .08, "duration mismatch")]
    for passed, reason in checks:
        if not passed:
            raise ValueError(f"{name}: {reason}: {values}")


def encode(cue, signal, fmt, output):
    long = cue["id"] == "timer_last_10"
    rate = 22050 if long else 44100
    codec = (["-c:a", "libvorbis", "-q:a", "0"] if fmt == "ogg" else
             ["-c:a", "libmp3lame", "-b:a", "16k" if long else "64k"])
    # Each format gets an independent decoded-output gain correction.
    gain = 10 ** ((TARGET-measure(signal)[0])/20)
    for _ in range(12):
        ffmpeg(["-v", "error", "-y", *pcm_args(), "-map_metadata", "-1", "-ar", str(rate),
                *codec, "-fflags", "+bitexact", "-flags:a", "+bitexact", str(output)],
               (signal*gain).astype("<f4").tobytes())
        values = metrics(output)
        error = TARGET-values["integrated_lufs"]
        if abs(error) <= .08:
            validate(cue, fmt, values)
            return dict(path=f"audio/{output.name}", mime="audio/ogg" if fmt == "ogg" else "audio/mpeg",
                        codec="vorbis" if fmt == "ogg" else "mp3", sample_rate_hz=rate,
                        channels=1, **values)
        # Damping avoids toggling between adjacent lossy-codec quantization steps.
        gain *= 10 ** (error*.5/20)
    raise ValueError(f"Loudness convergence failed: {output}")


HTML = '''<!doctype html>
<html lang="he" dir="rtl">
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; media-src 'self' file:; connect-src 'none'; base-uri 'none'; form-action 'none'">
<title>הצלילים של האי · UI Sounds v1</title>
<style>
:root{font:16px/1.6 system-ui,sans-serif;color:#183d43;background:#f3f8f5}
*{box-sizing:border-box}body{margin:0}main{max-width:1120px;margin:auto;padding:40px 22px 80px}
header{padding:28px;border:1px solid #b5d9cb;background:#e0f1e8;border-radius:26px;margin-bottom:24px}
.eyebrow{letter-spacing:.1em;font-size:.8rem;font-weight:800;color:#29695e}h1{font-size:clamp(2rem,5vw,3.3rem);line-height:1.15;margin:14px 0}p{max-width:750px}
.tags,.toolbar,.actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.tag{font-size:.8rem;border:1px solid #b5d9cb;padding:4px 12px;border-radius:20px;background:#fff9}
.toolbar{position:sticky;top:0;background:#f3f8f5f5;padding:16px 0;z-index:2;border-bottom:1px solid #d4e4dd}
button,select,input{font:inherit}button,select{min-height:44px;border-radius:12px;border:1px solid #a8c9be;padding:8px 14px;background:white;color:#183d43}
button{cursor:pointer}button:hover{background:#e5f4ed}button:focus-visible,select:focus-visible,input:focus-visible,a:focus-visible{outline:3px solid #b25210;outline-offset:3px}
button.primary{background:#1f6457;color:#fff;border-color:#1f6457}button:disabled{opacity:.5;cursor:default}
input[type=range]{width:100px;vertical-align:middle}section{margin-top:30px}h2{font-size:1.3rem}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,270px),1fr));gap:14px}
article{border:1px solid #d1e2da;border-radius:18px;background:#fff;padding:20px;display:flex;flex-direction:column;gap:10px}article.playing{border-color:#25745f;box-shadow:0 0 0 2px #25745f}
article h3,article p{margin:0}article p{font-size:.9rem;color:#45605d}.meta{font:12px/1.7 ui-monospace,monospace;color:#45605d;direction:ltr;text-align:right;overflow-wrap:anywhere}
.actions{margin-top:auto}.actions a{font-size:.8rem;color:#21594f}.copy{font-size:.8rem;padding:5px 10px}#status{min-height:28px;margin:12px 0;color:#21594f}footer{margin-top:36px;color:#45605d;font-size:.9rem}
@media(prefers-reduced-motion:no-preference){button{transition:background .15s}}
</style>
<main>
<header><div class="eyebrow">WORKOUT / ISLAND · SOUND LIBRARY 01</div>
<h1>קטנים באוזן.<br>שמחים במשחק.</h1>
<p>הקשות עגולות, ניצוצות עדינים ורגעים קטנים של הצלחה. בחרו צליל כדי להאזין, או נגנו את הספרייה ברצף.</p>
<div class="tags"><span class="tag">סינתזה מקורית</span><span class="tag">מקומי לחלוטין</span><span class="tag" dir="ltr">−18 LUFS · OGG + MP3</span><span class="tag">עד 30KB לקובץ</span></div></header>
<div class="toolbar" aria-label="בקרת האזנה">
<button class="primary" id="play-all">ניגון הכול</button><button id="stop">עצירה</button>
<label>פורמט <select id="format"><option value="auto">אוטומטי</option><option value="ogg">OGG</option><option value="mp3">MP3</option></select></label>
<label>עוצמה <input id="volume" aria-label="עוצמת האזנה" type="range" min="0" max="1" step=".05" value=".7"></label>
</div><div id="status" role="status" aria-live="polite">מוכנים להאזנה · __COUNT__ צלילים</div>
<div id="library"></div>
<footer>הספירה מוזיקלית, ללא דיבור. הטיימר כולל עשרה דפקים כפולים לאורך עשר שניות. הספירה המלאה נמשכת שלוש שניות; אחריה מנגנים את אות ההתחלה. פתיחת הדף והניגון פועלים גם ישירות מהתיקייה, ללא שרת או חיבור לאינטרנט.</footer>
</main>
<script id="sound-manifest" type="application/json">__MANIFEST__</script>
<script>
'use strict';
const manifest=JSON.parse(document.querySelector('#sound-manifest').textContent);
const status=document.querySelector('#status'), format=document.querySelector('#format'), volume=document.querySelector('#volume');
const groups={navigation:'מגע ותנועה',rewards:'ניצוצות ותגמולים',outcomes:'רגעי המשחק',timing:'קצב וזמן'};
const cards=new Map();
const player=new Audio();player.preload='none';
let generation=0, current=null, finish=null;
function stop(){generation++;if(finish)finish(false);finish=null;player.pause();player.removeAttribute('src');player.load();for(const c of cards.values())c.classList.remove('playing');current=null;status.textContent='הניגון נעצר';}
function choice(){return format.value==='auto'?(player.canPlayType('audio/ogg; codecs="vorbis"')?'ogg':'mp3'):format.value;}
async function play(cue,token){
 if(token!==generation)return false;
 const selected=choice();current=cue.id;cards.get(cue.id).classList.add('playing');
 status.textContent='מנגן: '+cue.label_he+' · '+selected.toUpperCase();
 const done=new Promise(resolve=>{finish=resolve;});
 player.src=cue.files[selected].path;player.volume=Number(volume.value);
 player.onended=()=>{if(token===generation&&finish)finish(true);};
 player.onerror=()=>{if(token===generation){status.textContent='לא ניתן לנגן '+cue.label_he+'; נסו פורמט אחר';if(finish)finish(false);}};
 try{await player.play();}catch(error){if(token===generation){status.textContent='הניגון לא זמין. נסו שוב בלחיצה או בחרו פורמט אחר.';if(finish)finish(false);}}
 const ended=await done;if(token!==generation)return false;
 finish=null;cards.get(cue.id).classList.remove('playing');current=null;
 if(ended)status.textContent='הסתיים: '+cue.label_he;return ended;
}
for(const [group,title] of Object.entries(groups)){
 const section=document.createElement('section'),heading=document.createElement('h2'),grid=document.createElement('div');heading.textContent=title;grid.className='grid';section.append(heading,grid);
 for(const cue of manifest.sounds.filter(s=>s.group===group)){
  const card=document.createElement('article');card.dataset.sound=cue.id;
  const h=document.createElement('h3');h.textContent=cue.label_he;
  if(cue.id==='countdown_321'){h.textContent='ספירה — ';const digits=document.createElement('bdi');digits.dir='ltr';digits.textContent='3, 2, 1';h.append(digits);}
  const p=document.createElement('p');p.textContent=cue.description_he;
  const meta=document.createElement('div');meta.className='meta';meta.textContent=cue.id+' · '+cue.duration_seconds.toFixed(2)+'s · OGG '+(cue.files.ogg.bytes/1000).toFixed(1)+' / MP3 '+(cue.files.mp3.bytes/1000).toFixed(1)+' KB';
  const actions=document.createElement('div');actions.className='actions';
  const button=document.createElement('button');button.textContent='האזנה';button.setAttribute('aria-label','האזנה: '+cue.label_he);button.onclick=()=>{stop();void play(cue,generation);};actions.append(button);
  for(const fmt of ['ogg','mp3']){const link=document.createElement('a');link.href=cue.files[fmt].path;link.download=cue.id+'.'+fmt;link.textContent=fmt.toUpperCase();link.setAttribute('aria-label','הורדת '+cue.label_he+' '+fmt);actions.append(link);}
  const copy=document.createElement('button');copy.className='copy';copy.textContent='העתקת מזהה';copy.onclick=async()=>{try{if(navigator.clipboard&&isSecureContext)await navigator.clipboard.writeText(cue.id);else{const field=document.createElement('textarea');field.value=cue.id;document.body.append(field);field.select();const ok=document.execCommand('copy');field.remove();if(!ok)throw Error('copy');}status.textContent='המזהה הועתק: '+cue.id;}catch{status.textContent='לא ניתן להעתיק בדפדפן הזה: '+cue.id;}};actions.append(copy);
  card.append(h,p,meta,actions);cards.set(cue.id,card);grid.append(card);
 }
 document.querySelector('#library').append(section);
}
document.querySelector('#stop').onclick=stop;
document.querySelector('#play-all').onclick=async()=>{stop();const token=generation;for(const cue of manifest.sounds){if(!await play(cue,token))return;}if(token===generation)status.textContent='כל הצלילים נוגנו';};
volume.oninput=()=>{player.volume=Number(volume.value);};format.onchange=stop;
document.addEventListener('keydown',e=>{if(e.key==='Escape')stop();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
window.addEventListener('pagehide',stop);
</script></html>
'''


LICENSE = '''SPDX-License-Identifier: CC0-1.0

UI Sounds v1 — original synthesized audio and accompanying source/documentation.
Created for Bakasun, 2026-11-17.

To the extent possible under law, the creators waive all copyright and related
or neighboring rights in this package under CC0 1.0 Universal. You may copy,
modify, distribute, and use these files, including commercially, without
permission or attribution. The work is provided without warranty.

Canonical dedication and full legal text:
https://creativecommons.org/publicdomain/zero/1.0/legalcode

All waveforms and musical phrases are generated from mathematical oscillators
in synthesize.py. No third-party audio, recordings, sample libraries, voices,
AI audio services, or downloaded assets are used. Python, NumPy, and FFmpeg are
external build tools, not bundled or relicensed by this dedication. No tool
binaries or WASM are included or required by the listening page.
'''


def report(manifest):
    sounds = manifest["sounds"]
    values = [v for cue in sounds for v in cue["files"].values()]
    lines = ["# דוח צלילי ממשק v1", "", "תאריך: 17.11.2026 · ענף: `codex/ui-sounds-v1`", "",
             "## מסירה", "",
             f"{len(sounds)} צלילים מקוריים, כל אחד ב־OGG Vorbis וב־MP3 ({len(values)} קובצי אודיו). "
             "כל השינויים בתיקייה החדשה `workout/island/design/ui-sounds-v1/` בלבד.", "",
             "סינתזה של גלים סינוסיים והרמוניות חלשות: עץ עגול למגע, פעמונים לתגמולים, "
             "בועות לפאנלים ומתנות, וצלילים רכים לתוצאות. אין הקלטות או דגימות חיצוניות. רישיון CC0-1.0.", "",
             "## תוצאות מדידה של הקבצים הדחוסים לאחר פענוח", "",
             "| בדיקה | תוצאה |", "|---|---|",
             f"| מגבלת גודל | כולם עד 30,000 בתים; הגדול ביותר {max(v['bytes'] for v in values):,} בתים |",
             f"| עוצמה משולבת | {min(v['integrated_lufs'] for v in values):.2f} עד {max(v['integrated_lufs'] for v in values):.2f} LUFS; יעד ‎−18, סבילות ±0.15 |",
             f"| שיא אמיתי | לכל היותר {max(v['true_peak_dbtp'] for v in values):.2f} dBTP, מתחת לתקרת ‎−1 |",
             f"| קצות הקבצים, 5 מ״ש | לכל היותר {max(v['boundary_peak_dbfs'] for v in values):.2f} dBFS |",
             f"| מעבר דגימות מרבי ב־48kHz | {max(v['max_sample_step'] for v in values):.6f}; סף 0.20 |",
             f"| סך אודיו, שני הפורמטים | {sum(v['bytes'] for v in values):,} בתים |",
             "| שלמות | SHA-256, משך מפוענח, עוצמה ושיא מתועדים לכל קובץ במניפסט |", "",
             "הנורמליזציה היא הגבר קבוע לכל פורמט בנפרד עם מדידה חוזרת אחרי הדחיסה; אין "
             "קומפרסור או חיתוך שיאים. המדידה היא EBU R128 באמצעות FFmpeg. בצלילים הקצרים מ־400 מ״ש "
             "מוסיפים שקט לצורך חלון המדידה בלבד; קובצי המסירה נשארים קצרים. גם `--verify` משתמש באותה שיטה.", "",
             "מניעת קליקים: התחלה וסיום חלקים לכל תו, התקפה של 12–20 מ״ש, שחרור של עד 65 מ״ש, "
             "שוליים שקטים ובדיקת קצות האודיו לאחר הדחיסה. אלו בדיקות אות אוטומטיות; האזנה אנושית "
             "ברמקול ובאוזניות בטלפון נשארת בדיקת הקבלה הסובייקטיבית.", "",
             "## שימוש והאזנה", "",
             "1. פותחים את `listen.html` ישירות מהתיקייה, או באמצעות שרת קבצים מקומי.",
             "2. בוחרים OGG או MP3 ולוחצים על האזנה. אפשר לנגן הכול ברצף, לשנות עוצמה ולהעתיק מזהה.",
             "3. עצירה או Escape מפסיקים את הניגון; מעבר ללשונית אחרת עוצר גם את הטיימר.", "",
             "הדף עצמאי, רספונסיבי ובעברית; המניפסט מוטמע בדף כדי לאפשר `file://`. "
             "אין ספריות דפדפן, בקשות לרשת חיצונית, CDN, גופנים חיצוניים או WASM.", "",
             "## שחזור ובדיקה", "", "דרישות בנייה בלבד: Python 3, NumPy, FFmpeg עם libvorbis ו־libmp3lame.", "",
             "```sh", "python3 workout/island/design/ui-sounds-v1/synthesize.py",
             "python3 workout/island/design/ui-sounds-v1/synthesize.py --verify",
             "python3 workout/island/design/ui-sounds-v1/synthesize.py --output /tmp/ui-sounds-rebuild", "```", "",
             "היצירה דטרמיניסטית באותה גרסת FFmpeg/NumPy. `--verify` אינו כותב קבצים: בודק כיסוי מזהים, "
             "מלאי, גיבובים, מטא־נתונים, עוצמה, שיאים, משכים וקצוות באמצעות פענוח מחדש.", "",
             "## הנחיות לחיבור בהמשך", "",
             "- `manifest.json` הוא מקור האמת למזהים ולנתיבים יחסית לתיקייה הזאת; מומלץ לטעון OGG עם MP3 כחלופה לפי תמיכת הדפדפן.",
             "- לחיצות: שלוש וריאציות; מטבעות: נמוך/בינוני/גבוה; כוכבים: 1/2/3 תווים עולים.",
             "- `timer_last_10`: ניגון יחיד של 10 שניות, עשר פעימות כפולות במרווח שנייה. לעצור בהשהיה או יציאה; אינו לולאה.",
             "- `countdown_3/2/1`: תווים נפרדים לתזמון מול שעון המשחק. `countdown_321`: רצף חלופי בן 3 שניות, לתזמון 3/2/1 בזמנים 0/1/2. לבחור באחת משתי האפשרויות.",
             "- `start` מנוגן בשנייה 3 לאחר הרצף. היסט ההתחלה הנשמע הוא כ־50 מ״ש, מתועד במניפסט; לתזמון מדויק יש לפענח מראש ולתזמן באמצעות Web Audio.",
             "- הספירה ללא דיבור, בהתאם לסינתזה המקורית. `passed` הוא אישור הצלחה קצר, `stage_success` חגיגה ארוכה יותר ו־`game_end` סיום חיובי ללא תלות בניצחון.",
             "- טיימר: 22.05kHz מונו, MP3 ב־16kbps כדי לשמור עשר שניות מתחת למגבלה. יתר הקבצים: 44.1kHz מונו, MP3 ב־64kbps; OGG באיכות 0.",
             "- קוד המשחק הקיים לא שונה והחבילה טרם חוברה למשחק.", "",
             "## מלאי", "", "| מזהה | תפקיד | משך מקור, שניות | OGG, בתים | MP3, בתים |", "|---|---|---:|---:|---:|"]
    for cue in sounds:
        lines.append(f"| `{cue['id']}` | {cue['label_he']} | {cue['duration_seconds']:.2f} | {cue['files']['ogg']['bytes']} | {cue['files']['mp3']['bytes']} |")
    return "\n".join(lines)+"\n"


def verify(output):
    manifest = json.loads((output/"manifest.json").read_text())
    expected = catalog()
    assert [s["id"] for s in manifest["sounds"]] == [c["id"] for c in expected], "Cue coverage/order mismatch"
    expected_files = {"manifest.json", "listen.html", "synthesize.py", "LICENSE.txt", "REPORT.md"}
    for cue, definition in zip(manifest["sounds"], expected):
        assert {k: v for k, v in cue.items() if k != "files"} == definition, cue["id"]
        for fmt in ("ogg", "mp3"):
            saved = cue["files"][fmt]
            relative = f"audio/{cue['id']}.{fmt}"
            assert saved["path"] == relative
            expected_files.add(relative)
            actual = metrics(output/relative)
            validate(cue, fmt, actual)
            for key in actual:
                assert actual[key] == saved[key], (relative, key, actual[key], saved[key])
            probe = subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-of", "json", str(output/relative)],
                                   capture_output=True, check=True)
            streams = json.loads(probe.stdout)["streams"]
            assert len(streams) == 1 and streams[0]["codec_type"] == "audio"
            assert streams[0]["codec_name"] == saved["codec"]
            assert int(streams[0]["sample_rate"]) == saved["sample_rate_hz"]
            assert streams[0]["channels"] == 1
    actual_files = {p.relative_to(output).as_posix() for p in output.rglob("*") if p.is_file()}
    assert actual_files == expected_files, (actual_files-expected_files, expected_files-actual_files)
    html = (output/"listen.html").read_text()
    embedded = re.search(r'<script id="sound-manifest" type="application/json">(.*?)</script>', html, re.S)
    assert json.loads(embedded.group(1)) == manifest, "Listening page manifest is stale"
    print(f"PASS: {len(expected)} cues / {len(expected)*2} exports; inventory, hashes, decoded audio, codecs and embedded manifest.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=HERE)
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    for tool in ("ffmpeg", "ffprobe"):
        if not shutil.which(tool):
            parser.error(f"Missing native build tool: {tool}")
    output = args.output.resolve()
    if args.verify:
        verify(output)
        return
    output.mkdir(parents=True, exist_ok=True)
    (output/"audio").mkdir(exist_ok=True)
    if output != HERE:
        shutil.copyfile(__file__, output/"synthesize.py")
    manifest = dict(schema_version=1, package="ui-sounds-v1", license="CC0-1.0",
                    target_integrated_lufs=TARGET, loudness_tolerance_lu=TOLERANCE,
                    loudness_method="EBU R128; decoded output; zero-pad to 400ms only for measurement of short cues",
                    max_bytes_per_file=MAX_BYTES, source_sample_rate_hz=SR,
                    build_tools=dict(ffmpeg=subprocess.run(["ffmpeg", "-version"], capture_output=True, check=True).stdout.decode().splitlines()[0],
                                     numpy=np.__version__), sounds=[])
    for cue in catalog():
        signal = synthesize(cue)
        cue["files"] = {fmt: encode(cue, signal, fmt, output/"audio"/f"{cue['id']}.{fmt}") for fmt in ("ogg", "mp3")}
        manifest["sounds"].append(cue)
        print(f"Built {cue['id']}: "+", ".join(f"{fmt} {v['bytes']} B / {v['integrated_lufs']:.2f} LUFS" for fmt, v in cue["files"].items()), flush=True)
    serialized = json.dumps(manifest, ensure_ascii=False, indent=2)+"\n"
    (output/"manifest.json").write_text(serialized, encoding="utf-8")
    (output/"listen.html").write_text(HTML.replace("__MANIFEST__", serialized).replace("__COUNT__", str(len(manifest["sounds"]))), encoding="utf-8")
    (output/"LICENSE.txt").write_text(LICENSE, encoding="utf-8")
    (output/"REPORT.md").write_text(report(manifest), encoding="utf-8")
    verify(output)


if __name__ == "__main__":
    main()
