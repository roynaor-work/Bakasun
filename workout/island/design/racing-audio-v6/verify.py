#!/usr/bin/env python3
"""Measure the published audio with local FFmpeg, NumPy and SciPy.

The optional v5 comparison reads Git blobs or an existing v5 directory.
JSON goes to stdout unless a new file is specified with --output.
"""

from __future__ import annotations

import argparse
from hashlib import sha256
import json
import math
from pathlib import Path
import re
import subprocess
import sys
from tempfile import TemporaryDirectory

import numpy as np
from scipy import signal


ROOT = Path(__file__).resolve().parent
V5_PATH = "workout/island/design/racing-audio-v5"
LEGACY_PATH = "workout/island/assets/racing-audio-v2"
LEGACY_MATCHES = ("engine-idle", "engine-low", "engine-mid", "engine-high", "pass-whoosh", "tyre-squeal")
RATE = 32_000
FFT_SIZE = 8192
FORMATS = {"ogg": "vorbis", "mp3": "mp3"}
LIMITS = {
    "max_bytes": 60_000,
    "lufs_i": -18.0,
    "lufs_tolerance": 0.25,
    "max_dbtp": -1.0,
    "tone_min_prominence_db": 12.0,
    "tone_max_width_hz": 30.0,
    "tone_min_relative_db": -55.0,
    "max_seam_step_ratio": 1.5,
    "max_seam_curvature_ratio": 2.0,
    "max_guard_error_dbfs": -42.0,
}


def run(*args: str) -> subprocess.CompletedProcess:
    result = subprocess.run(args, capture_output=True, check=False)
    if result.returncode:
        detail = result.stderr.decode(errors="replace").strip()
        raise ValueError(f"{args[0]} failed: {detail}")
    return result


def db(value: float, factor: int = 10) -> float:
    return factor * math.log10(max(float(value), 1e-30))


def decode(path: Path, channels: int, sample_rate: int | None = None) -> np.ndarray:
    args = ["ffmpeg", "-nostdin", "-v", "error", "-xerror", "-i", str(path), "-map", "0:a:0"]
    if sample_rate:
        args += ["-ac", str(channels), "-ar", str(sample_rate)]
    args += ["-c:a", "pcm_f32le", "-f", "f32le", "-"]
    samples = np.frombuffer(run(*args).stdout, dtype="<f4").reshape(-1, channels)
    if not samples.size or not np.isfinite(samples).all():
        raise ValueError(f"Empty or invalid decoded audio: {path}")
    return samples.astype(np.float64)


def loudness(path: Path) -> tuple[float, float]:
    # Only the input measurements are used. No padding or tiling is applied.
    result = run("ffmpeg", "-nostdin", "-hide_banner", "-nostats", "-i", str(path),
                 "-map", "0:a:0", "-af", "loudnorm=I=-18:TP=-1:LRA=11:print_format=json",
                 "-f", "null", "-")
    match = re.search(r'\{\s*"input_i".*?\}', result.stderr.decode(), re.S)
    if match is None:
        raise ValueError(f"No loudness measurement: {path}")
    stats = json.loads(match[0])
    measured = float(stats["input_i"]), float(stats["input_tp"])
    if not all(map(math.isfinite, measured)):
        raise ValueError(f"Non-finite loudness measurement: {path}")
    return measured


def strongest_line(frequency: np.ndarray, power: np.ndarray) -> dict | None:
    """Apply v5's neighborhood and width criteria before its level threshold."""
    spacing = float(frequency[1])
    reference = max(float(power[(frequency >= 40) & (frequency <= 2000)].max()), 1e-30)
    outer = round(80 / spacing)
    inner = round(12 / spacing)
    # Peaks much farther below the reference than the v5 cutoff can be skipped.
    # The extra 40 dB leaves room to compare low-level residual peaks in reports.
    floor = reference * 10 ** ((LIMITS["tone_min_relative_db"] - 40) / 10)
    bins, _ = signal.find_peaks(power, height=floor)
    strongest = None
    for k in bins[frequency[bins] > 2000]:
        neighborhood = np.r_[power[max(0, k - outer):k - inner],
                             power[k + inner + 1:k + outer + 1]]
        prominence = db(power[k] / max(float(np.median(neighborhood)), 1e-30))
        if prominence < LIMITS["tone_min_prominence_db"]:
            continue
        left = right = k
        half = power[k] / 2
        while left > 0 and power[left - 1] >= half:
            left -= 1
        while right + 1 < power.size and power[right + 1] >= half:
            right += 1
        width = float(right - left + 1) * spacing
        if width > LIMITS["tone_max_width_hz"]:
            continue
        relative = db(power[k] / reference)
        if strongest is None or relative > strongest["relative_db"]:
            strongest = {"frequency_hz": float(frequency[k]), "prominence_db": prominence,
                         "relative_db": relative, "width_hz": width}
    return strongest


def spectrum(samples: np.ndarray) -> dict:
    n = min(FFT_SIZE, len(samples))
    frequency, mean = signal.welch(samples, fs=RATE, window="hann", nperseg=n,
                                    noverlap=n // 2, nfft=FFT_SIZE, detrend=False)
    _, times, frames = signal.spectrogram(samples, fs=RATE, window="hann", nperseg=n,
                                           noverlap=3 * n // 4, nfft=FFT_SIZE, detrend=False)
    normalized = mean / max(float(mean.sum()), 1e-30)
    strongest = strongest_line(frequency, mean)
    for time, frame in zip(times, frames.T):
        candidate = strongest_line(frequency, frame)
        if candidate is not None and (strongest is None or candidate["relative_db"] > strongest["relative_db"]):
            strongest = {**candidate, "window_center_seconds": float(time)}
    fraction = float(normalized[frequency > 2000].sum())
    return {"centroid_hz": round(float(frequency @ normalized), 3),
            "above_2khz_energy_db": round(db(fraction), 4),
            "above_2khz_energy_percent": fraction * 100,
            "strongest_narrow_line": strongest,
            "significant_narrow_line": (strongest is not None and
                                        strongest["relative_db"] >= LIMITS["tone_min_relative_db"])}


def loop_seam(samples: np.ndarray, asset: dict, rate: int) -> dict | None:
    loop = asset.get("loop")
    if not loop or (isinstance(loop, dict) and not loop.get("enabled", True)):
        return None
    bounds = loop if isinstance(loop, dict) else asset
    source_rate = bounds.get("sample_rate_hz", bounds.get("sample_rate", rate))
    start_seconds = bounds.get("start_seconds", bounds.get("loop_start_seconds"))
    end_seconds = bounds.get("end_seconds", bounds.get("loop_end_seconds"))
    start_sample, end_sample = bounds.get("start_sample"), bounds.get("end_sample")
    start = round(rate * start_seconds) if start_seconds is not None else 0
    end = round(rate * end_seconds) if end_seconds is not None else len(samples)
    matching_bounds = True
    if start_sample is not None:
        native_start = round(rate * start_sample / source_rate)
        matching_bounds = start_seconds is None or abs(start - native_start) <= 1
        start = native_start
    if end_sample is not None:
        native_end = round(rate * end_sample / source_rate)
        matching_bounds &= end_seconds is None or abs(end - native_end) <= 1
        end = native_end
    period = end - start
    if "period_seconds" in bounds:
        matching_bounds &= abs(period - round(rate * bounds["period_seconds"])) <= 1
    if "period_samples" in bounds:
        matching_bounds &= abs(period - round(rate * bounds["period_samples"] / source_rate)) <= 1
    if start < 0 or end > len(samples) or period < 8:
        raise ValueError(f"Invalid loop bounds for {asset['id']}: {start}:{end}/{len(samples)}")
    block = samples[start:end]
    step = block[0] - block[-1]
    left, right = block[-1] - block[-2], block[1] - block[0]
    curvature = np.maximum(abs(step - left), abs(right - step))
    # Use the 100 ms on both sides of the seam so louder parts of a loop do
    # not hide an anomalous jump or slope change in a quieter part.
    region = min(len(block), round(rate / 10))
    differences = np.concatenate([np.diff(part, axis=0) for part in (block[:region], block[-region:])])
    second = np.concatenate([np.diff(part, n=2, axis=0) for part in (block[:region], block[-region:])])
    step_reference = np.maximum(np.quantile(abs(differences), .999, axis=0), 1e-4)
    curve_reference = np.maximum(np.quantile(abs(second), .999, axis=0), 1e-4)
    guard_error = []
    if start > 0:
        guard_error.append(db(np.max(abs(block[-1] - samples[start - 1])), 20))
    if end < len(samples):
        guard_error.append(db(np.max(abs(block[0] - samples[end])), 20))
    return {"start_sample": start, "end_sample_exclusive": end, "period_samples": period,
            "period_seconds": period / rate, "bounds_match_manifest": matching_bounds,
            "step_dbfs": round(db(np.max(abs(step)), 20), 4),
            "step_ratio": round(float(np.max(abs(step) / step_reference)), 6),
            "curvature_ratio": round(float(np.max(curvature / curve_reference)), 6),
            "guard_error_dbfs": round(max(guard_error), 4) if guard_error else None}


def file_info(asset: dict, encoding: str) -> dict:
    entry = asset["files"][encoding]
    info = {"path": entry} if isinstance(entry, str) else entry
    path = Path(info["path"])
    if path.is_absolute() or ".." in path.parts:
        raise ValueError(f"Expected a relative package path: {path}")
    return info


def measure_file(root: Path, asset: dict, encoding: str, enforce: bool,
                 declared_rate: int | None = None, declared_channels: int | None = None) -> dict:
    info = file_info(asset, encoding)
    path = root / info["path"]
    data = path.read_bytes()
    digest = sha256(data).hexdigest()
    if "sha256" in info and digest != info["sha256"]:
        raise ValueError(f"SHA-256 differs from manifest: {path}")
    probe = json.loads(run("ffprobe", "-v", "error", "-select_streams", "a:0",
                           "-show_entries", "stream=codec_name,channels,sample_rate", "-of", "json", str(path)).stdout)
    stream, = probe["streams"]
    rate, channels = int(stream["sample_rate"]), stream["channels"]
    native = decode(path, channels)
    mono = native[:, 0] if rate == RATE and channels == 1 else decode(path, 1, RATE)[:, 0]
    band = spectrum(mono)
    channel_checks = []
    if channels > 1:
        normalized = native if rate == RATE else decode(path, channels, RATE)
        channel_checks = [spectrum(channel) for channel in normalized.T]
    integrated, peak = loudness(path)
    seam = loop_seam(native, asset, rate)
    stats = {"id": asset["id"], "format": encoding, "path": info["path"], "bytes": len(data),
             "sha256": digest, "sample_rate_hz": rate, "channels": channels, "decoded_frames": len(native),
             "decoded_seconds": len(native) / rate, "integrated_lufs": integrated, "true_peak_dbtp": peak,
             "spectrum": band, "loop_seam": seam}
    if channel_checks:
        stats["channel_spectra"] = channel_checks
    if enforce:
        expected = round(asset["duration_seconds"] * rate)
        expected_rate = asset.get("sample_rate_hz", declared_rate)
        expected_channels = asset.get("channels", declared_channels)
        stats["declared_duration_frames_error"] = len(native) - expected
        stats["checks"] = {"codec": stream["codec_name"] == FORMATS[encoding],
                           "sample_rate": expected_rate is None or rate == expected_rate,
                           "channels": expected_channels is None or channels == expected_channels,
                           "bytes": 0 < len(data) <= LIMITS["max_bytes"],
                           "integrated_lufs": abs(integrated - LIMITS["lufs_i"]) <= LIMITS["lufs_tolerance"],
                           "true_peak": peak <= LIMITS["max_dbtp"],
                           "decoded_duration": abs(len(native) - expected) <= 1,
                           "no_narrow_line": not any(row["significant_narrow_line"]
                                                     for row in [band, *channel_checks])}
        if seam is not None:
            stats["checks"]["loop_bounds"] = seam["bounds_match_manifest"]
            stats["checks"]["loop_seam"] = (
                seam["step_ratio"] <= LIMITS["max_seam_step_ratio"]
                and seam["curvature_ratio"] <= LIMITS["max_seam_curvature_ratio"]
                and (seam["guard_error_dbfs"] is None or seam["guard_error_dbfs"] <= LIMITS["max_guard_error_dbfs"]))
    return stats


def manifest(directory: Path) -> dict:
    return json.loads((directory / "manifest.json").read_bytes())


def measure_pack(directory: Path, metadata: dict, enforce: bool) -> list[dict]:
    audio = metadata.get("audio", {})
    rate = metadata.get("sample_rate_hz", audio.get("sample_rate_hz"))
    channels = metadata.get("channels", audio.get("channels"))
    return [measure_file(directory, asset, encoding, enforce, rate, channels)
            for asset in metadata["assets"] for encoding in FORMATS]


def load_git_baseline(ref: str, temp: Path) -> dict:
    def git(*args: str) -> bytes:
        return run("git", "-C", str(ROOT), *args).stdout

    def measure_blobs(base: str, metadata: dict) -> list[dict]:
        root = temp / base
        for asset in metadata["assets"]:
            for encoding in FORMATS:
                relative = file_info(asset, encoding)["path"]
                path = root / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(git("show", f"{commit}:{base}/{relative}"))
        return measure_pack(root, metadata, enforce=False)

    commit = git("rev-parse", "--verify", "--end-of-options", f"{ref}^{{commit}}").decode().strip()
    metadata = json.loads(git("show", f"{commit}:{V5_PATH}/manifest.json"))
    legacy = {"assets": [{"id": name, "files": {encoding: f"{name}.{encoding}" for encoding in FORMATS}}
                         for name in LEGACY_MATCHES]}
    return {"v5_commit": commit, "v5": measure_blobs(V5_PATH, metadata),
            "v5_branch_legacy_v2": measure_blobs(LEGACY_PATH, legacy)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    baseline = parser.add_mutually_exclusive_group()
    baseline.add_argument("--baseline-dir", type=Path, help="Existing read-only v5 snapshot with manifest.json")
    baseline.add_argument("--baseline-ref", help="Local Git ref or commit containing the v5 package")
    parser.add_argument("--output", type=Path, help="Write JSON to a new file instead of stdout")
    args = parser.parse_args()
    results = measure_pack(ROOT, manifest(ROOT), enforce=True)
    failures = [{"id": row["id"], "format": row["format"], "check": key}
                for row in results for key, ok in row["checks"].items() if not ok]
    version = run("ffmpeg", "-version").stdout.decode().splitlines()[0]
    report = {"limits": LIMITS, "ffmpeg_version": version, "analysis_sample_rate_hz": RATE, "fft_size": FFT_SIZE,
              "v6": results, "failures": failures}
    if args.baseline_dir:
        report["v5"] = measure_pack(args.baseline_dir, manifest(args.baseline_dir), enforce=False)
    if args.baseline_ref:
        with TemporaryDirectory(prefix="racing-audio-v5-") as temp:
            report.update(load_git_baseline(args.baseline_ref, Path(temp)))
    if args.output:
        with args.output.open("x", encoding="utf-8") as output:
            json.dump(report, output, indent=2, allow_nan=False)
            output.write("\n")
    else:
        print(json.dumps(report, indent=2, allow_nan=False))
    return int(bool(failures))


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, KeyError) as error:
        print(error, file=sys.stderr)
        raise SystemExit(2) from error
