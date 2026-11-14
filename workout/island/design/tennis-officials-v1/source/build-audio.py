#!/usr/bin/env python3
"""Original deterministic, non-speech tennis foley and abstract official calls.

Run with Python 3 + numpy + scipy. No recordings, TTS, external samples or voices.
The generated WAV assets are dedicated to the public domain under CC0-1.0.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import wave

import numpy as np
from scipy import signal

ROOT = Path(__file__).resolve().parents[1]
RATE = 48000
SEED = 180730


def lowpass(values: np.ndarray, hz: float) -> np.ndarray:
    return signal.sosfilt(signal.butter(3, hz, fs=RATE, output="sos"), values)


def bandpass(values: np.ndarray, low: float, high: float) -> np.ndarray:
    return signal.sosfilt(signal.butter(3, (low, high), btype="bandpass", fs=RATE, output="sos"), values)


def resonator(values: np.ndarray, hz: float, width: float) -> np.ndarray:
    b, a = signal.iirpeak(hz, hz / width, fs=RATE)
    return signal.lfilter(b, a, values)


def smooth_envelope(times: np.ndarray, start: float, attack: float, hold: float, release: float) -> np.ndarray:
    """C1 attack and release; all boundaries return zero without discontinuities."""
    phase = times - start
    rise = np.clip(phase / attack, 0, 1)
    fall = np.clip((attack + hold + release - phase) / release, 0, 1)
    rise = rise * rise * (3 - 2 * rise)
    fall = fall * fall * (3 - 2 * fall)
    return rise * fall


def abstract_call(kind: str) -> np.ndarray:
    """A brief breathy pitched gesture, with no syllables or lexical articulation."""
    length = 0.44 if kind == "out" else 0.38
    t = np.arange(round(length * RATE)) / RATE
    rng = np.random.default_rng(SEED + (1 if kind == "out" else 2))
    if kind == "out":
        pitch = 194 - 68 * np.clip(t / 0.31, 0, 1) + 3 * np.sin(2 * np.pi * 22 * t)
        envelope = smooth_envelope(t, .008, .018, .095, .230)
        formants = ((690, 190, 1.0), (1170, 230, .80), (2560, 370, .35))
    else:
        pitch = np.interp(t, [0, .10, .20, .30, .38], [178, 201, 214, 197, 188])
        envelope = smooth_envelope(t, .008, .038, .065, .205)
        formants = ((420, 165, 1.0), (1420, 270, .60), (2390, 430, .28))
    phase = 2 * np.pi * np.cumsum(pitch) / RATE
    # A rounded, irregular excitation avoids the steady pure-tone/beep timbre.
    drift = lowpass(rng.normal(size=len(t)), 40)
    excitation = np.zeros_like(t)
    for harmonic in range(1, 29):
        excitation += np.sin(harmonic * phase + harmonic * .018 * drift) / harmonic ** 1.28
    excitation *= .88 + .08 * np.sin(2 * np.pi * 31 * t) + .04 * drift
    breath = bandpass(rng.normal(size=len(t)), 650, 7000)
    source = excitation + .24 * breath
    body = sum(gain * resonator(source, hz, width) for hz, width, gain in formants)
    breath_attack = .05 * breath * np.exp(-t / .030)
    return (body + breath_attack) * envelope


def ball_roll() -> np.ndarray:
    """Dry felt rubbing over hard court grain, decelerating without an impact."""
    t = np.arange(round(.98 * RATE)) / RATE
    rng = np.random.default_rng(SEED + 3)
    noise = rng.normal(size=len(t))
    rub = bandpass(noise, 140, 1850)
    fine = bandpass(rng.normal(size=len(t)), 1700, 5300)
    rotation = 2 * np.pi * (12.0 * t - 4.9 * t ** 2)
    texture = (.66 + .20 * np.cos(rotation) + .07 * np.cos(3 * rotation))
    envelope = smooth_envelope(t, .008, .055, .13, .735)
    body = .80 * rub * texture + .12 * fine
    # Sparse very soft surface grains, each smoothed to avoid digital clicks.
    grains = np.zeros_like(t)
    for start, gain in zip(np.linspace(.075, .72, 11), rng.uniform(.10, .28, 11)):
        tt = t - start
        grain_envelope = smooth_envelope(t, start, .0015, .0006, .006)
        grains += gain * bandpass(rng.normal(size=len(t)), 900, 4200) * grain_envelope
    return (body + grains) * envelope


def applause_soft() -> np.ndarray:
    """Several small, irregular hand claps and a subdued compact room tail."""
    t = np.arange(round(1.38 * RATE)) / RATE
    rng = np.random.default_rng(SEED + 4)
    dry = np.zeros_like(t)
    for start, gain in ((.035, .75), (.135, .45), (.255, 1.0), (.385, .62),
                        (.505, .81), (.655, .56), (.790, .48), (.945, .34)):
        offset = start + rng.uniform(-.009, .009)
        dt = np.maximum(0, t - offset)
        noise = bandpass(rng.normal(size=len(t)), 450, 7100)
        # The short resonances supply the cupped-palm character of a hand clap.
        palm = resonator(noise, rng.uniform(1150, 1580), 850)
        attack = np.clip((t - offset) / .0013, 0, 1)
        envelope = attack * np.exp(-dt / rng.uniform(.019, .033))
        envelope[t < offset] = 0
        dry += gain * (.68 * noise + 1.7 * palm) * envelope
    wet = dry.copy()
    for delay, gain in ((.027, .10), (.047, .065), (.079, .035)):
        samples = round(delay * RATE)
        wet[samples:] += gain * lowpass(dry[:-samples], 3800)
    return wet * smooth_envelope(t, 0, .005, 1.08, .295)


SPECS = (
    {"id": "line-out", "file": "audio/line-out.wav", "label": "Line judge: out cue",
     "description": "Sharp descending abstract breathy call; non-speech, no words or human recording.",
     "peakTargetDBFS": -6.0, "make": lambda: abstract_call("out")},
    {"id": "line-good", "file": "audio/line-good.wav", "label": "Line judge: good cue",
     "description": "Softer gently rising abstract breathy call; non-speech, no words or human recording.",
     "peakTargetDBFS": -7.0, "make": lambda: abstract_call("good")},
    {"id": "ball-roll", "file": "audio/ball-roll.wav", "label": "Tennis ball rolling on hard court",
     "description": "Short dry felt friction and decelerating court grain; no bounce or voice.",
     "peakTargetDBFS": -14.0, "make": ball_roll},
    {"id": "applause-soft", "file": "audio/applause-soft.wav", "label": "Soft applause",
     "description": "Eight restrained, irregular hand claps with a compact quiet tail; no crowd speech.",
     "peakTargetDBFS": -12.0, "make": applause_soft},
)


def main() -> None:
    (ROOT / "audio").mkdir(parents=True, exist_ok=True)
    (ROOT / "verification").mkdir(parents=True, exist_ok=True)
    records = []
    for spec in SPECS:
        x = spec["make"]()
        x -= np.mean(x)
        # Remove DC and apply a final 8 ms fade to both file boundaries.
        x = signal.sosfilt(signal.butter(2, 65, "highpass", fs=RATE, output="sos"), x)
        fade = round(.008 * RATE)
        ramp = np.sin(np.linspace(0, np.pi / 2, fade)) ** 2
        x[:fade] *= ramp
        x[-fade:] *= ramp[::-1]
        x *= 10 ** (spec["peakTargetDBFS"] / 20) / np.max(np.abs(x))
        pcm = np.rint(x * 32767).astype("<i2")
        file = ROOT / spec["file"]
        with wave.open(str(file), "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(RATE)
            wav.writeframes(pcm.tobytes())
        # Verification measures serialized PCM, not the unquantized authoring buffer.
        with wave.open(str(file), "rb") as wav:
            decoded = np.frombuffer(wav.readframes(wav.getnframes()), dtype="<i2").astype(np.float64) / 32768
            rate, channels, bits = wav.getframerate(), wav.getnchannels(), wav.getsampwidth() * 8
        peak = np.max(np.abs(decoded))
        rms = np.sqrt(np.mean(decoded ** 2))
        record = {k: v for k, v in spec.items() if k != "make"}
        record.update({
            "sampleRateHz": rate, "channels": channels, "bitsPerSample": bits,
            "format": "WAV PCM signed 16-bit little-endian", "frames": len(decoded),
            "durationSeconds": len(decoded) / rate,
            "peakDBFS": round(float(20 * np.log10(peak)), 4),
            "rmsDBFS": round(float(20 * np.log10(rms)), 4),
            "dcOffset": round(float(np.mean(decoded)), 10),
            "clippedSamples": int(np.count_nonzero(np.abs(decoded) >= 32767 / 32768)),
            "firstSample": float(decoded[0]), "lastSample": float(decoded[-1]),
            "bytes": file.stat().st_size, "sha256": hashlib.sha256(file.read_bytes()).hexdigest(),
            "license": "CC0-1.0", "loop": False, "speech": False,
        })
        record["pass"] = bool(rate == RATE and channels == 1 and bits == 16 and record["clippedSamples"] == 0
                              and record["peakDBFS"] < -3 and record["firstSample"] == 0 and record["lastSample"] == 0
                              and abs(record["dcOffset"]) < .0001)
        if not record["pass"]:
            raise AssertionError(record)
        records.append(record)
    report = {
        "schemaVersion": 1, "kind": "audio-signal-verification", "generator": "source/build-audio.py",
        "authoring": "Original deterministic numerical synthesis; no recordings, TTS, voice identity or external samples.",
        "seed": SEED, "license": "CC0-1.0", "pass": all(r["pass"] for r in records),
        "checks": ["Decoded PCM is 48 kHz mono signed 16-bit", "Every peak below -3 dBFS",
                   "No clipped samples", "Zero first and last samples", "DC offset below 0.0001"],
        "note": "Signal checks establish format and headroom; perceived timbre remains a listening review.",
        "sounds": records,
    }
    (ROOT / "verification/audio.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"pass": report["pass"], "sounds": [{"file": r["file"], "seconds": r["durationSeconds"],
                      "peakDBFS": r["peakDBFS"], "rmsDBFS": r["rmsDBFS"], "bytes": r["bytes"]} for r in records]}, indent=2))


if __name__ == "__main__":
    main()
