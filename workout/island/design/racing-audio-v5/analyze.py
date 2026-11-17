#!/usr/bin/env python3
"""Measure delivered codecs and the read-only v4 baseline, using local tools.

Run `python analyze.py --validate` from anywhere.  Only measurements.json and
spectrum.png beside this script are written; manifest/audio/baseline are read-only.
Requires Python 3, NumPy, SciPy, FFmpeg, and Matplotlib for the optional figure.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import re
import subprocess
import sys

import numpy as np
from scipy import signal


ROOT = Path(__file__).resolve().parent
BASELINE = ROOT.parents[1] / "assets" / "racing-audio-v4"
SAMPLE_RATE = 32_000
FFT_SIZE = 8192
BAND_EDGES = [0, 250, 1000, 2000, 4000, 8000, 16001]
LIMITS = {
    "integrated_lufs": -18.0,
    "loudness_tolerance_lu": 0.25,
    "max_file_bytes": 50_000,
    "max_true_peak_dbtp": -1.0,
    "max_above_2khz_energy_db_relative_total": -45.0,
    "tone_min_prominence_db": 12.0,
    "tone_min_psd_db_relative_max_inband": -55.0,
    "tone_max_width_hz": 30.0,
    "max_loop_codec_continuation_error_dbfs": -42.0,
    "max_loop_seam_first_difference_ratio_p99": 6.0,
    "max_loop_seam_curvature_ratio_p99": 6.0,
}


def db(value: float, power: bool = False) -> float:
    return (10 if power else 20) * math.log10(max(float(value), 1e-30))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(command: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(command, check=True, stdout=subprocess.PIPE,
                          stderr=subprocess.PIPE)


def decode(path: Path) -> np.ndarray:
    result = run(["ffmpeg", "-nostdin", "-v", "error", "-i", str(path),
                  "-map", "0:a:0", "-ac", "1", "-ar", str(SAMPLE_RATE),
                  "-f", "f32le", "-"])
    x = np.frombuffer(result.stdout, dtype="<f4").astype(np.float64)
    if not len(x) or not np.all(np.isfinite(x)):
        raise ValueError(f"Empty or non-finite decoded audio: {path}")
    return x


def loudness(path: Path) -> dict:
    # input_* describes the delivered file, before loudnorm changes anything.
    # No silence is added and no tiling is used.  Shots must be >=400 ms.
    result = run(["ffmpeg", "-nostdin", "-hide_banner", "-nostats", "-i", str(path),
                  "-map", "0:a:0", "-af",
                  "loudnorm=I=-18:TP=-1:LRA=11:print_format=json",
                  "-f", "null", "-"])
    matches = re.findall(r'\{\s*"input_i".*?\}', result.stderr.decode(), re.S)
    if not matches:
        raise ValueError(f"No FFmpeg loudnorm measurements: {path}")
    stats = json.loads(matches[-1])
    integrated = float(stats["input_i"])
    peak = float(stats["input_tp"])
    if not math.isfinite(integrated) or not math.isfinite(peak):
        raise ValueError(f"Loudness cannot be measured without tiling: {path}")
    return {
        "integrated_lufs": integrated,
        "true_peak_dbtp": peak,
        "loudness_range_lu": float(stats["input_lra"]),
        "loudness_gate_lufs": float(stats["input_thresh"]),
    }


def narrow_peaks(f: np.ndarray, p: np.ndarray) -> list[dict]:
    """Find relevant narrow peaks, excluding codec noise far below the body.

    Local floor: median of +/-80 Hz, excluding +/-12 Hz about the peak.
    Both the prominence and significance gates must pass.  This avoids calling
    a 20 dB prominence at -150 dBFS/Hz an audible whistle.
    """
    df = float(f[1] - f[0])
    max_inband = max(float(np.max(p[(f >= 40) & (f <= 2000)])), 1e-30)
    peak_indices, _ = signal.find_peaks(p)
    relevant = [k for k in peak_indices
                if f[k] > 2000 and
                db(p[k] / max_inband, power=True) >=
                LIMITS["tone_min_psd_db_relative_max_inband"]]
    results = []
    outer, inner = max(4, round(80 / df)), max(1, round(12 / df))
    for k in relevant:
        lo, hi = max(0, k - outer), min(len(p), k + outer + 1)
        neighborhood = np.r_[p[lo:max(lo, k - inner)],
                             p[min(hi, k + inner + 1):hi]]
        if len(neighborhood) < 4:
            continue
        prominence = db(p[k] / max(float(np.median(neighborhood)), 1e-30), True)
        if prominence < LIMITS["tone_min_prominence_db"]:
            continue
        left, right = k, k
        half = p[k] * 0.5
        while left > 0 and p[left - 1] >= half:
            left -= 1
        while right + 1 < len(p) and p[right + 1] >= half:
            right += 1
        width = (right - left + 1) * df
        if width <= LIMITS["tone_max_width_hz"]:
            results.append({
                "frequency_hz": round(float(f[k]), 3),
                "prominence_db": round(prominence, 3),
                "psd_db_relative_max_inband": round(db(p[k] / max_inband, True), 3),
                "minus_3db_width_hz": round(width, 3),
            })
    return sorted(results, key=lambda row: row["prominence_db"], reverse=True)


def spectrum(x: np.ndarray) -> tuple[dict, np.ndarray, np.ndarray]:
    n = min(FFT_SIZE, len(x))
    f, p = signal.welch(x, fs=SAMPLE_RATE, window="hann", nperseg=n,
                        noverlap=n // 2, nfft=FFT_SIZE, detrend=False,
                        return_onesided=True, scaling="density")
    total = max(float(p.sum()), 1e-30)
    normalized = p / total
    bands = [100 * float(normalized[(f >= a) & (f < b)].sum())
             for a, b in zip(BAND_EDGES, BAND_EDGES[1:])]
    upper = float(normalized[f > 2000].sum())
    # A second time-local scan catches a line that the whole-file Welch average
    # might dilute.  Each frame spans 256 ms, hop 64 ms at 32 kHz.
    _, times, local = signal.spectrogram(
        x, fs=SAMPLE_RATE, window="hann", nperseg=n, noverlap=3 * n // 4,
        nfft=FFT_SIZE, detrend=False, mode="psd", scaling="density")
    local_peaks = []
    for i, time in enumerate(times):
        for peak in narrow_peaks(f, local[:, i]):
            local_peaks.append({**peak, "window_center_seconds": round(float(time), 6)})
    return ({
        "rms_dbfs": round(db(np.sqrt(np.mean(x * x))), 4),
        "dc_dbfs": round(db(abs(float(np.mean(x)))), 4),
        "sample_peak_dbfs": round(db(np.max(np.abs(x))), 4),
        "spectral_centroid_hz": round(float(np.dot(f, normalized)), 4),
        "spectral_rolloff_95_hz": round(float(f[np.searchsorted(np.cumsum(normalized), .95)]), 4),
        "band_energy_percent": [round(v, 9) for v in bands],
        "above_2khz_energy_percent": round(upper * 100, 9),
        "above_2khz_energy_db_relative_total": round(db(upper, True), 4),
        "significant_narrow_peaks_above_2khz": narrow_peaks(f, p),
        "time_local_narrow_peaks_above_2khz": sorted(
            local_peaks, key=lambda row: row["prominence_db"], reverse=True)[:12],
        "time_local_narrow_peak_frames": len({row["window_center_seconds"] for row in local_peaks}),
    }, f, p)


def loop_bounds(asset: dict) -> tuple[int, int] | None:
    loop = asset.get("loop")
    if not loop or (isinstance(loop, dict) and not loop.get("enabled", True)):
        return None
    bounds = loop if isinstance(loop, dict) else asset
    declared_rate = int(bounds.get("sample_rate_hz", bounds.get("sample_rate", asset.get("sample_rate_hz", SAMPLE_RATE))))
    start = bounds.get("start_seconds", bounds.get("loop_start_seconds"))
    end = bounds.get("end_seconds", bounds.get("loop_end_seconds"))
    if start is None:
        start = bounds.get("start_sample", 0) / declared_rate
    if end is None:
        if "end_sample" not in bounds:
            raise ValueError(f"Missing loop end for {asset['id']}")
        end = bounds["end_sample"] / declared_rate
    return round(float(start) * SAMPLE_RATE), round(float(end) * SAMPLE_RATE)


def loop_metrics(x: np.ndarray, asset: dict) -> dict | None:
    bounds = loop_bounds(asset)
    if bounds is None:
        return None
    start, end = bounds
    if not 0 <= start < end <= len(x) or end - start < 8:
        raise ValueError(f"Invalid decoded loop bounds for {asset['id']}: {bounds}/{len(x)}")
    y = x[start:end]
    differences = np.diff(y)
    curvature = np.diff(y, n=2)
    p99_d = max(float(np.quantile(np.abs(differences), .99)), 1e-15)
    p99_c = max(float(np.quantile(np.abs(curvature), .99)), 1e-15)
    seam = float(y[0] - y[-1])
    seam_curvature = max(abs(seam - differences[-1]), abs(differences[0] - seam))
    # Adjacent guard samples are the actual codec continuation, a useful extra
    # reference for whether jumping to the loop's start changes the trajectory.
    continuation_error = abs(float(y[0] - x[end])) if end < len(x) else None
    return {
        "start_sample": start,
        "end_sample_exclusive": end,
        "period_samples": end - start,
        "period_seconds": round((end - start) / SAMPLE_RATE, 9),
        "boundary_step_dbfs": round(db(abs(seam)), 4),
        "first_difference_p99_dbfs": round(db(p99_d), 4),
        "boundary_step_ratio_first_difference_p99": round(abs(seam) / p99_d, 6),
        "boundary_curvature_dbfs": round(db(seam_curvature), 4),
        "second_difference_p99_dbfs": round(db(p99_c), 4),
        "boundary_curvature_ratio_second_difference_p99": round(seam_curvature / p99_c, 6),
        "continuation_error_dbfs": round(db(continuation_error), 4) if continuation_error is not None else None,
    }


def file_stats(path: Path, asset: dict | None, relpath: str, format_name: str) -> tuple[dict, tuple]:
    x = decode(path)
    spectral, f, p = spectrum(x)
    stats = {
        "id": asset["id"] if asset else path.stem,
        "format": format_name,
        "path": relpath,
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
        "decoded_sample_rate_hz": SAMPLE_RATE,
        "decoded_samples": len(x),
        "decoded_duration_seconds": round(len(x) / SAMPLE_RATE, 9),
        **loudness(path),
        **spectral,
        "loop_metrics": loop_metrics(x, asset) if asset else None,
    }
    if asset:
        lm = stats["loop_metrics"]
        checks = {
            "loudness": abs(stats["integrated_lufs"] - LIMITS["integrated_lufs"]) <= LIMITS["loudness_tolerance_lu"],
            "size": stats["bytes"] <= LIMITS["max_file_bytes"],
            "true_peak": stats["true_peak_dbtp"] <= LIMITS["max_true_peak_dbtp"],
            "above_2khz_energy": stats["above_2khz_energy_db_relative_total"] <= LIMITS["max_above_2khz_energy_db_relative_total"],
            "no_significant_narrow_line_above_2khz": not (
                stats["significant_narrow_peaks_above_2khz"] or stats["time_local_narrow_peaks_above_2khz"]),
        }
        rate = float(asset.get("playback_rate", {}).get("max", 1.0))
        if rate > 1:
            # Native playbackRate changes both speed and pitch; resampling the
            # decoded signal models it without a browser, worklet, or WASM.
            from fractions import Fraction
            ratio = Fraction(1 / rate).limit_denominator(1000)
            pitched = signal.resample_poly(x, ratio.numerator, ratio.denominator)
            pitched_stats, _, _ = spectrum(pitched)
            stats["maximum_rate_spectrum"] = {
                "playback_rate": rate,
                "above_2khz_energy_percent": pitched_stats["above_2khz_energy_percent"],
                "above_2khz_energy_db_relative_total": pitched_stats["above_2khz_energy_db_relative_total"],
                "significant_narrow_peaks_above_2khz": pitched_stats["significant_narrow_peaks_above_2khz"],
                "time_local_narrow_peaks_above_2khz": pitched_stats["time_local_narrow_peaks_above_2khz"],
            }
            checks["maximum_rate_above_2khz_energy"] = pitched_stats["above_2khz_energy_db_relative_total"] <= LIMITS["max_above_2khz_energy_db_relative_total"]
            checks["maximum_rate_no_significant_narrow_line_above_2khz"] = not (
                pitched_stats["significant_narrow_peaks_above_2khz"] or pitched_stats["time_local_narrow_peaks_above_2khz"])
        if lm:
            checks.update({
                "loop_codec_continuation_error": lm["continuation_error_dbfs"] is not None and lm["continuation_error_dbfs"] <= LIMITS["max_loop_codec_continuation_error_dbfs"],
                "loop_seam_first_difference": lm["boundary_step_ratio_first_difference_p99"] <= LIMITS["max_loop_seam_first_difference_ratio_p99"],
                "loop_seam_curvature": lm["boundary_curvature_ratio_second_difference_p99"] <= LIMITS["max_loop_seam_curvature_ratio_p99"],
            })
        expected_bytes = asset["files"][format_name].get("bytes")
        expected_sha = asset["files"][format_name].get("sha256")
        if expected_bytes is not None:
            checks["manifest_bytes"] = stats["bytes"] == expected_bytes
        if expected_sha:
            checks["manifest_sha256"] = stats["sha256"] == expected_sha
        stats["checks"] = {name: bool(ok) for name, ok in checks.items()}
        stats["passed"] = all(checks.values())
    return stats, (f, p)


def figure(results: list[dict], traces: dict, pairs: dict) -> None:
    os.environ.setdefault("MPLCONFIGDIR", "/tmp/racing-audio-v5-matplotlib")
    os.environ.setdefault("XDG_CACHE_HOME", "/tmp/racing-audio-v5-cache")
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, axes = plt.subplots(2, 2, figsize=(12, 7.8), constrained_layout=True)
    colors = {"v4": "#d28743", "v5": "#167f88"}
    for ax, intensity in zip(axes.flat, ["light", "medium", "hard"]):
        before_id = f"brake-loop-{intensity}"
        after_ids = {before_id, f"brake-{intensity}", f"brake-{intensity}-loop"}
        after_ids.update(ident for ident, baseline in pairs.items() if baseline == before_id)
        for row in results:
            source = row["source"]
            if (source == "v4" and row["id"] != before_id) or (source == "v5" and row["id"] not in after_ids):
                continue
            f, p = traces[(source, row["path"])]
            # Density normalized by total spectral energy: matched shape
            # comparison independent of the -16/-18 LUFS level difference.
            normalized_density = p / max(float(np.sum(p)) * (f[1] - f[0]), 1e-30)
            ax.plot(f, 10 * np.log10(np.maximum(normalized_density, 1e-16)),
                    color=colors[source], linestyle="-" if row["format"] == "ogg" else "--",
                    alpha=.92, linewidth=1.2, label=f"{source} {row['format']}")
        ax.set_title(f"Brake: {intensity} (matched before/after)")
        ax.legend(fontsize=8, ncol=2)
    ax = axes.flat[3]
    for row in results:
        if row["source"] != "v5" or row["format"] != "ogg":
            continue
        f, p = traces[(row["source"], row["path"])]
        normalized_density = p / max(float(np.sum(p)) * (f[1] - f[0]), 1e-30)
        ax.plot(f, 10 * np.log10(np.maximum(normalized_density, 1e-16)),
                color=colors["v5"], alpha=.20, linewidth=.7)
    ax.set_title("All v5 OGG assets (shape overview)")
    for ax in axes.flat:
        ax.axvline(2000, color="#a53030", linewidth=.8, linestyle=":")
        ax.set(xlim=(0, 8000), ylim=(-145, -15), xlabel="Frequency (Hz)",
               ylabel="PSD / total energy (dB/Hz)")
        ax.grid(alpha=.20)
    fig.suptitle("Racing audio v5 / read-only v4 — decoded 32 kHz, Welch Hann 8192", fontsize=13)
    fig.savefig(ROOT / "spectrum.png", dpi=125)
    plt.close(fig)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--validate", action="store_true", help="Exit nonzero when a v5 acceptance check fails")
    parser.add_argument("--no-plot", action="store_true", help="Skip spectrum.png (NumPy/SciPy/FFmpeg only)")
    args = parser.parse_args()
    manifest_path = ROOT / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    if not BASELINE.is_dir():
        raise ValueError(f"Read-only baseline is missing: {BASELINE}")
    baseline_paths = sorted(p for p in BASELINE.iterdir() if p.suffix in {".ogg", ".mp3"})
    before_hashes = {p.name: sha256(p) for p in baseline_paths}
    results, traces, failures = [], {}, []
    for path in baseline_paths:
        stats, trace = file_stats(path, None, str(path.relative_to(ROOT.parents[3])), path.suffix[1:])
        stats["source"] = "v4"
        results.append(stats)
        traces[("v4", stats["path"])] = trace
        print(f"baseline {path.name}: {stats['integrated_lufs']:.2f} LUFS; >2k {stats['above_2khz_energy_db_relative_total']:.2f} dB", flush=True)
    seen_paths = set()
    for asset in manifest["assets"]:
        if set(asset["files"]) != {"ogg", "mp3"}:
            failures.append(f"{asset['id']}: both ogg and mp3 are required")
        for format_name, entry in asset["files"].items():
            path = (ROOT / entry["path"]).resolve()
            if not path.is_relative_to(ROOT) or not path.is_file():
                raise ValueError(f"Asset path escapes package or is missing: {path}")
            if path in seen_paths:
                failures.append(f"Duplicate asset file: {entry['path']}")
            seen_paths.add(path)
            stats, trace = file_stats(path, asset, entry["path"], format_name)
            stats["source"] = "v5"
            results.append(stats)
            traces[("v5", stats["path"])] = trace
            bad = [name for name, ok in stats["checks"].items() if not ok]
            failures.extend(f"{entry['path']}: {name}" for name in bad)
            print(f"v5 {path.name}: {stats['integrated_lufs']:.2f} LUFS; >2k {stats['above_2khz_energy_db_relative_total']:.2f} dB; "
                  f"{'PASS' if not bad else 'FAIL ' + ', '.join(bad)}", flush=True)
    after_hashes = {p.name: sha256(p) for p in baseline_paths}
    if before_hashes != after_hashes:
        failures.append("Read-only baseline hash set changed during analysis")
    baseline_rows = [row for row in results if row["source"] == "v4"]
    new_rows = [row for row in results if row["source"] == "v5"]
    comparisons = []
    pairs = manifest.get("baseline", {}).get("matched_pairs", {})
    for after in new_rows:
        for before in baseline_rows:
            if after["format"] != before["format"] or pairs.get(after["id"], after["id"]) != before["id"] or not before["id"].startswith("brake-loop-"):
                continue
            comparisons.append({
                "id": after["id"], "format": after["format"],
                "relationship": "direct replacement; same brake intensity",
                "before_path": before["path"], "after_path": after["path"],
                "above_2khz_energy_db_before": before["above_2khz_energy_db_relative_total"],
                "above_2khz_energy_db_after": after["above_2khz_energy_db_relative_total"],
                "above_2khz_energy_reduction_db": round(before["above_2khz_energy_db_relative_total"] - after["above_2khz_energy_db_relative_total"], 4),
                "centroid_hz_before": before["spectral_centroid_hz"],
                "centroid_hz_after": after["spectral_centroid_hz"],
            })
    output = {
        "schema_version": 1,
        "analysis": {
            "ffmpeg_version": run(["ffmpeg", "-version"]).stdout.decode().splitlines()[0],
            "manifest_sha256": sha256(manifest_path),
            "decoded_sample_rate_hz": SAMPLE_RATE,
            "decode": "FFmpeg mono f32le; source assets read-only; analysis resampling only",
            "loudness": "FFmpeg loudnorm input_i/input_tp, BS.1770/EBU R128; delivered file, no tiling or added silence",
            "spectrum": "Welch one-sided density, Hann 8192, 50% overlap, nfft8192, no detrend; unweighted energy",
            "frequency_resolution_hz": SAMPLE_RATE / FFT_SIZE,
            "band_edges_hz": BAND_EDGES,
            "band_convention": "Half-open [a,b); above_2khz is strictly f >2000, denominator all bins through Nyquist",
            "tonality": "Any Welch/time-local narrow peak >2kHz, >=12dB above median +/-80Hz excluding +/-12Hz, >=-55dB relative max40-2000Hz PSD, width<=30Hz fails",
            "time_local_tonality": "Hann8192, 75% overlap (256ms windows/64ms hop at32kHz)",
            "maximum_rate_test": "Decode first, rational resample to simulate manifest maximum playbackRate; repeat high-band and Welch/time-local tonal checks",
            "loop": "Manifest central loop. Raw last-to-first step includes ordinary waveform slope and is reported without an absolute acceptance limit. Acceptance: error abs(x[start]-x[end]) against actual decoded codec continuation <=-42dBFS, seam step <=6x interior first-difference p99, and the larger of the two seam second differences <=6x interior second-difference p99. No seam-to-silence assumption. Log floor1e-30 maps exact equality to-600dBFS.",
            "baseline_mapping": "Only brake-loop light/medium/hard have direct v4 replacements. Side scrape/bumps are context; v4 has no pit, offtrack, deceleration or shift assets.",
        },
        "limits": LIMITS,
        "summary": {
            "asset_count": len(manifest["assets"]),
            "v5_files": len(new_rows),
            "baseline_files": len(baseline_rows),
            "loop_files": sum(row["loop_metrics"] is not None for row in new_rows),
            "baseline_unchanged": before_hashes == after_hashes,
            "all_passed": not failures,
            "failures": failures,
            "maximum_v5_file_bytes": max(row["bytes"] for row in new_rows),
            "maximum_loudness_error_lu": round(max(abs(row["integrated_lufs"] + 18) for row in new_rows), 4),
            "maximum_true_peak_dbtp": max(row["true_peak_dbtp"] for row in new_rows),
            "maximum_above_2khz_energy_db_relative_total": max(row["above_2khz_energy_db_relative_total"] for row in new_rows),
            "maximum_rate_above_2khz_energy_db_relative_total": max(row.get("maximum_rate_spectrum", row)["above_2khz_energy_db_relative_total"] for row in new_rows),
        },
        "baseline": baseline_rows,
        "v5": new_rows,
        "direct_comparisons": comparisons,
    }
    (ROOT / "measurements.json").write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n")
    if not args.no_plot:
        figure(results, traces, pairs)
    print(json.dumps(output["summary"], indent=2, ensure_ascii=False))
    return 1 if args.validate and failures else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, KeyError, OSError, subprocess.CalledProcessError) as error:
        print(f"Analysis failed: {error}", file=sys.stderr)
        sys.exit(2)
