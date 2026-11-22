#!/usr/bin/env python3
"""Matplotlib SVG curves from summary.json; no timestamps, network or game code.

Requires Python 3 and matplotlib. SVG embeds font outlines for portable Hebrew.
All data gaps remain gaps. The confidence bands apply to binomial win rates.
"""
import argparse
import json
import math
import os
from pathlib import Path
import re

os.environ.setdefault("MPLCONFIGDIR", "/tmp/balance-sim-matplotlib")
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D

matplotlib.rcParams.update({
    "font.family": "DejaVu Sans", "font.size": 11,
    "svg.hashsalt": "balance-sim-v1", "svg.fonttype": "path",
    "axes.spines.top": False, "axes.spines.right": False,
    "axes.edgecolor": "#94a3b8", "axes.labelcolor": "#334155",
    "xtick.color": "#475569", "ytick.color": "#475569",
    "figure.facecolor": "white", "axes.facecolor": "#f8fafc",
})
COLORS = {"impatient": "#d97706", "regular": "#2563eb", "skilled": "#059669"}
NAMES = {"impatient": "חסר סבלנות", "regular": "רגיל", "skilled": "מיומן"}


def rtl(text):
    """Matplotlib does not reorder Hebrew. These short Hebrew/ASCII labels need
    no joining forms: reverse visual order, then restore ASCII token order.
    """
    text = str(text)[::-1].translate(str.maketrans("()[]", ")(]["))
    return re.sub(r"[A-Za-z0-9.%=+:/−–-]+", lambda m: m.group(0)[::-1], text)


def finite(value):
    return isinstance(value, (int, float)) and math.isfinite(value)


def value(cell, key, scale=1):
    n = cell.get(key)
    return n * scale if finite(n) else float("nan")


def make_chart(game):
    stages = game["stages"]
    count = len(stages)
    # 108 stages get a wide vector canvas; no attempt is made to squeeze 108
    # labels into a small bitmap. Every stage is plotted; ticks are sampled.
    width = max(12.8, min(20, 9 + count * .065))
    fig, axes = plt.subplots(4, 1, figsize=(width, 12), sharex=True)
    fig.subplots_adjust(left=.085, right=.975, top=.89, bottom=.105, hspace=.29)
    index = {(c["stage"], c["profile"]): c for c in game["cells"]}
    panels = [("winPct", "ניצחונות", "%"), ("timeMean", "זמן ממוצע", "שניות"),
              ("starsMean", "כוכבים ממוצעים", "כוכבים"), ("fallsMean", "נפילות ממוצעות", "נפילות")]
    time_titles = {"islandRacing":"משך מרוץ ללא ספירת הזינוק", "alpineRush":"משך מרוץ ללא ספירת הזינוק",
                   "streetSlam":"משך משחק כולל עצירות", "tennis":"משך משחק כולל הגשות",
                   "catchCriminal":"משך מרדף והטלות רשת"}
    fall_titles = {"soccer":"נפילות מעבירה בממוצע", "alpineRush":"נפילות סקי בממוצע",
                   "islandRacing":"התהפכויות ויציאות מהמסלול בממוצע"}
    boundaries = []
    for i in range(1, count):
        a = index.get((stages[i-1], "regular"), {}).get("modes", [])
        b = index.get((stages[i], "regular"), {}).get("modes", [])
        if a and b and a != b:
            boundaries.append((stages[i-1] + stages[i]) / 2)

    for ax, (key, title, unit) in zip(axes, panels):
        if key == "timeMean":
            title = time_titles.get(game["id"], title)
        elif key == "fallsMean":
            title = fall_titles.get(game["id"], title)
        available = False
        for profile in ("impatient", "regular", "skilled"):
            cells = [index.get((stage, profile), {}) for stage in stages]
            ys = [value(c, key) for c in cells]
            available |= any(finite(y) for y in ys)
            ax.plot(stages, ys, color=COLORS[profile], linewidth=1.8,
                    marker="o", markersize=2.4 if count > 45 else 3.4,
                    label=rtl(NAMES[profile]), zorder=3)
            if key == "winPct":
                low = [100*c["winWilson95"]["low"] if c.get("winWilson95") else float("nan") for c in cells]
                high = [100*c["winWilson95"]["high"] if c.get("winWilson95") else float("nan") for c in cells]
                ax.fill_between(stages, low, high, color=COLORS[profile], alpha=.075, linewidth=0)
                ax.plot(stages, low, color=COLORS[profile], linewidth=.7, alpha=.42, linestyle=":")
                ax.plot(stages, high, color=COLORS[profile], linewidth=.7, alpha=.42, linestyle=":")
        ax.set_title(rtl(title), loc="right", fontsize=12, pad=6, weight="bold")
        ax.set_ylabel(rtl(unit), fontsize=10)
        ax.grid(axis="y", color="#cbd5e1", linewidth=.6, alpha=.75)
        ax.set_axisbelow(True)
        if key == "winPct":
            ax.set_ylim(-3, 103)
            ax.set_yticks([0, 25, 50, 75, 100])
        elif key == "starsMean":
            ax.set_ylim(-.08, 3.12)
            ax.set_yticks([0, 1, 2, 3])
        else:
            vals = [value(c, key) for c in game["cells"]]
            maximum = max((v for v in vals if finite(v)), default=0)
            ax.set_ylim(0, max(1, maximum * 1.12))
        if not available:
            any_trials = any(c["n"] for c in game["cells"])
            text = "המדד אינו מוגדר בחוזה המשחק" if any_trials and key in ("starsMean", "fallsMean") else "טרם נאספו נתונים"
            ax.text(.5, .5, rtl(text), transform=ax.transAxes, ha="center", va="center",
                    color="#64748b", fontsize=12, bbox={"facecolor":"white", "edgecolor":"none", "alpha":.9})
        for boundary in boundaries:
            ax.axvline(boundary, color="#475569", linestyle="--", linewidth=.9, alpha=.6)
        # Stages with undefined league awards remain a visibly empty span.
        ax.set_xlim(min(stages)-.5, max(stages)+.5)

    step = 1 if count <= 18 else 5 if count <= 45 else 10
    ticks = sorted(set([stages[0], stages[-1]] + [s for s in stages if s % step == 0]))
    axes[-1].set_xticks(ticks)
    axes[-1].set_xlabel(rtl("שלב בסימולציה; מיפוי שלבי ליגה בטבלה"), labelpad=8)
    cov = game["coverage"]
    status = "כיסוי מלא" if cov["complete"] else "נתונים חלקיים"
    fig.suptitle(rtl(game["name"]), fontsize=21, weight="bold", x=.975, ha="right", y=.975)
    subtitle = f"{status} · {cov['completeCells']}/{cov['expectedCells']} תאים · {cov['totalTrials']} ניסיונות"
    fig.text(.975, .94, rtl(subtitle), ha="right", color="#475569", fontsize=11)
    handles = [Line2D([0], [0], color=COLORS[p], marker="o", linewidth=2, markersize=4,
                      label=rtl(NAMES[p])) for p in ("skilled", "regular", "impatient")]
    fig.legend(handles=handles, loc="upper left", bbox_to_anchor=(.08,.973), ncol=3, frameon=False, fontsize=11)
    caption = "רצועות וקווים מנוקדים: רווח Wilson של 95% לניצחונות. נתונים חסרים אינם אפס."
    fig.text(.975, .047, rtl(caption), ha="right", fontsize=9, color="#475569")
    caption2 = "בוטים מלאכותיים, ציוד התחלתי בכל שלב; זמן לוגיקה ללא טעינה ורינדור."
    if boundaries:
        caption2 += " קו אנכי מקווקו: מעבר מצב משחק."
    fig.text(.975, .027, rtl(caption2), ha="right", fontsize=9, color="#475569")
    return fig


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--summary", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    summary = json.loads(Path(args.summary).read_text(encoding="utf-8"))
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    for game in summary["games"]:
        fig = make_chart(game)
        fig.savefig(output / f"{game['id']}.svg", format="svg",
                    metadata={"Date": None, "Creator": "balance-sim-v1 / Matplotlib",
                              "Title": game["name"], "Description": game["timingNote"] + " " + game.get("fallsNote", "")})
        svg = output / f"{game['id']}.svg"
        svg.write_text("\n".join(line.rstrip() for line in svg.read_text(encoding="utf-8").splitlines()) + "\n", encoding="utf-8")
        plt.close(fig)


if __name__ == "__main__":
    main()
