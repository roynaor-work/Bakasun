#!/usr/bin/env python3
"""Seeded combat regression against a locally served Boar Island game.

python -m pip install playwright
python -m playwright install chromium
python bot-playthrough.py --game-dir path/to/boar-island --output run.json
"""
import argparse
from contextlib import contextmanager
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import sys
from threading import Thread

from playwright.sync_api import sync_playwright


PROFILES = {
    "novice": {"error": .18, "reaction": .8, "stay": True, "abilities": False},
    "regular": {"error": .075, "reaction": .32, "stay": False, "abilities": True},
    "expert": {"error": .015, "reaction": .12, "stay": False, "abilities": True},
}

# A single fixed-step clock drives combat. The real-time render loop would race
# the test clock and consume random numbers between steps on slower machines.
INIT = """
    let randomState = 1;
    window.seedCombat = n => { randomState = n >>> 0; };
    Math.random = () => {
        randomState = (Math.imul(1664525, randomState) + 1013904223) >>> 0;
        return randomState / 4294967296;
    };
    window.requestAnimationFrame = () => 0;
"""

PLAY = """
({wave, seed, profile, seconds, checkpoint}) => {
    const qa = window.__boar;
    window.seedCombat((seed + Math.imul(wave, 0x9e3779b9)) >>> 0);
    if (checkpoint) {
        // Identical equipment for all three bots at each chapter checkpoint.
        const save = qa.state.save;
        const tier = Math.floor((wave - 1) / 5);
        Object.assign(save.weapons, {mg: 1 + 2 * tier, shotgun: tier, cannon: tier, tesla: tier});
        Object.assign(save.upgrades, {armor: tier, cooling: tier, rocket: tier,
            frost: Math.min(tier, 2), turret: tier});
        qa.setSave(save);
    } else if (wave > 1) {
        // Spend only coins actually earned. Preserve the real price/cap rules.
        if (qa.state.campaignEnabled) {
            qa.buy('special', 'mg-jacket');
            qa.buy('special', 'mg-rounds');
        }
        const shoppingList = [
            ['w','mg',6], ['u','turret',3], ['u','cooling',3], ['u','armor',3],
            ['w','mg',10], ['u','rocket',3], ['w','shotgun',4], ['u','frost',2]
        ];
        for (const [type, key, goal] of shoppingList) {
            const domain = type === 'w' ? 'weapons' : 'upgrades';
            while (qa.state.save[domain][key] < goal && qa.buy(type, key)) {}
        }
        const perk = document.querySelector('#perks button');
        if (!perk) throw new Error('Missing perk offer after victory');
        perk.click();
    }

    if (!checkpoint && qa.state.campaignEnabled && qa.state.campaignProgress.unlocked < wave)
        throw new Error('Campaign failed to unlock level ' + wave);
    if (checkpoint) qa.start(wave);
    else if (wave === 1) {
        document.querySelector('#start').click();
        if (qa.state.campaignEnabled) document.querySelector('[data-level="1"]').click();
    } else document.querySelector('#next-wave').click();
    const start = qa.state;
    if (start.mode !== 'battle' || start.wave !== wave) throw new Error('Failed to start ' + wave);
    qa.bot(true, profile);
    let state = start, peakEnemies = 0, firstKill = null, firstDamage = null;
    const bosses = new Set();
    for (let sample = 0; sample < seconds * 3 && state.mode === 'battle'; sample++) {
        qa.step(10, 1/30);
        state = qa.state;
        const t = +(state.elapsed - start.elapsed).toFixed(2);
        if (state.killed && firstKill === null) firstKill = t;
        if (state.hp < start.hp && firstDamage === null) firstDamage = t;
        peakEnemies = Math.max(peakEnemies, state.enemies.length);
        if (state.boss) bosses.add(state.boss);
    }
    qa.bot(false);
    const result = state.mode === 'dead' ? 'lost' : state.mode === 'battle' ? 'timeout' :
        state.mode === 'shop' && state.remaining === 0 ? 'won' : state.mode;
    if (!['won','lost','timeout'].includes(result)) throw new Error('Unknown result ' + result);
    if (!checkpoint && result === 'won' && state.campaignEnabled &&
        !state.campaignProgress.cleared.includes(wave)) throw new Error('Missing clear for wave ' + wave);
    const owned = entries => Object.fromEntries(Object.entries(entries).filter(([, rank]) => rank));
    return {wave, weather: qa.wx().set, result, seconds: +(state.elapsed - start.elapsed).toFixed(2), kills: state.killed,
        remaining: state.remaining, hpStart: start.hp, hpEnd: Math.round(state.hp), shots: state.shots,
        hits: state.hits, crits: state.crits, firstKillSeconds: firstKill, firstDamageSeconds: firstDamage,
        peakEnemies, bosses: [...bosses], coinsEarned: state.coins - start.coins,
        equipment: {weapons: owned(start.save.weapons), upgrades: owned(start.save.upgrades),
            specials: start.campaignProgress?.upgrades ?? []},
        unlocked: state.campaignProgress?.unlocked ?? null};
}
"""


class LocalHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


@contextmanager
def serve(directory):
    with ThreadingHTTPServer(("127.0.0.1", 0), partial(LocalHandler, directory=directory)) as server:
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            yield f"http://127.0.0.1:{server.server_port}/index.html?qa"
        finally:
            server.shutdown()
            thread.join()


def open_game(browser, url, baseline):
    page = browser.new_page(viewport={"width": 960, "height": 540}, device_scale_factor=1)
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
    page.add_init_script(INIT)
    page.goto(url, wait_until="load", timeout=120_000)
    if not page.evaluate("!!window.__boar"):
        raise RuntimeError("QA startup failed: " + " | ".join(errors))
    enabled = page.evaluate("window.__boar.state.campaignEnabled === true")
    if enabled == baseline:
        raise RuntimeError("Wrong campaign version. Use a patched game or request --baseline.")
    page.evaluate("""() => {
        window.__boar.hold(true);
        if (window.__boar.state.sound) document.querySelector('#sound').click();
    }""")
    return page


def run(args, waves):
    report = {"seed": args.seed, "mode": "checkpoint" if waves else "campaign",
              "baseline": args.baseline, "fixedHz": 30, "sampleHz": 3, "limitSeconds": args.limit,
              "profiles": {name: PROFILES[name] for name in args.profiles}, "runs": []}
    with serve(args.game_dir.resolve()) as url, sync_playwright() as pw:
        with pw.chromium.launch(executable_path=args.chromium, args=[
            "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
        ]) as browser:
            report["chromium"] = browser.version
            if args.baseline:
                url += "&boarsLevels=0"
            for name in args.profiles:
                page = None
                try:
                    for wave in waves or range(1, 21):
                        if page is None:
                            page = open_game(browser, url, args.baseline)
                        row = page.evaluate(PLAY, {"wave": wave, "seed": args.seed,
                            "profile": PROFILES[name], "seconds": args.limit, "checkpoint": bool(waves)})
                        report["runs"].append({"profile": name, **row})
                        print(f"{name:8} {wave:2} {row['result']:7} {row['seconds']:6.2f}s "
                              f"HP {row['hpEnd']}/{row['hpStart']} hits {row['hits']}/{row['shots']}",
                              file=sys.stderr, flush=True)
                        if waves:
                            page.close()
                            page = None
                        elif row["result"] != "won":
                            break
                finally:
                    if page:
                        page.close()
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--game-dir", required=True, type=Path, help="patched directory containing game.js")
    parser.add_argument("--profiles", nargs="+", choices=PROFILES, default=list(PROFILES))
    selection = parser.add_mutually_exclusive_group()
    selection.add_argument("--waves", nargs="+", type=int, choices=range(1, 21), metavar="N",
                           help="run isolated equal-loadout trials for the listed waves")
    selection.add_argument("--all", action="store_true", help="run isolated trials for all 20 waves")
    parser.add_argument("--baseline", action="store_true", help="run the original game via boarsLevels=0")
    parser.add_argument("--seed", type=int, default=1701)
    parser.add_argument("--limit", type=int, default=180, help="maximum game seconds per wave")
    parser.add_argument("--chromium", help="optional path to a system Chromium")
    parser.add_argument("--output", type=Path, help="write machine-readable results (default stdout)")
    args = parser.parse_args()
    if args.limit < 1 or not (args.game_dir / "game.js").is_file():
        parser.error("Supply a positive --limit and a game directory containing game.js")
    report = run(args, list(range(1, 21)) if args.all else args.waves)
    data = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.write_text(data, encoding="utf-8")
    else:
        sys.stdout.write(data)


if __name__ == "__main__":
    main()
