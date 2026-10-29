# Soccer graphics and control verification — 27 October 2026

Base: `08f351c06cb892d0ba3da784fe455a1ffe6164d6` (main after PR180).

The before/after pairs are actual browser renders of the same synthetic stage-4,
seed-41 paused kickoff, with the same camera, viewport 1280×720 and original
`kid-full.glb`. Both pairs wait for all eight original characters to load.
`before.png` / `after.png` show the match view; `*-closeup.png` show the same
player closeup. These are not generated concepts or screenshots of FC Mobile.

## Implemented

- Local ambientCG Grass005 PBR albedo and OpenGL normal maps, 1024×1024 and
  835,010 bytes combined. CC0 provenance is in `assets/soccer-realism/`.
- World-scale mowing bands, fine grass detail and bounded goalmouth wear.
- One directional sun shadow pass: 2048, then 1024, then disabled on lower
  quality. Existing contact shadows and all original player models remain.
- Visible movement area and contextual action labels, desktop key hints,
  accessible focused-button activation, action shortcuts while a game button
  is focused, correct goalkeeper labels, correct pass/shot charge rings.
- Conservative pass-lane prediction from observed defender velocity, bounded
  to 0.55 seconds, symmetric across teams.
- Detached Ball tracks are removed from cloned player clips; original assets
  and unrelated animation tracks are unchanged.

## Verification

- 152 focused tests passed, 0 failed: controls, model integration, teamplay,
  original gameplay, G3h/G3i/G3j, shared tennis controls, lighting lifecycle,
  asset integrity and independent animation clips.
- Full repository run: 2,715 tests; 2,672 pass, 5 fail, 38 skip. All five failures
  reproduced on a clean worktree at the base above: camera squat count, camera
  voice-catalog documentation, workout voice catalog, original lab tennis hash,
  original lab soccer hash. No test thresholds were reduced.
- Browser: desktop 1280×720, phone layouts 844×390 and 390×844. Labels have a
  positive visible box and 11px computed size. Arrow movement and X pass from
  a focused action button produced movement and a real pass in the running
  session; labels switched to slide/steal when possession changed.
- High-quality paused kickoff: 128,045 visible triangles, 72 draw calls,
  eight loaded models, zero fallback models, both turf textures ready.
  These counters describe the main camera pass; the sun adds a separate pass.
- Forced economy tier: eight original models retained, 10 spectators,
  real shadows disabled and render-target texture count reduced by one.
- No physical phone or isolated FPS/input-latency measurement was performed.

## Reproduce

Serve the repository as static files and open
`codex-lab/soccer-realism/index.html?dev=1&freeze=1`.
The review adapter starts a synthetic match without reading or writing city
progress, currency or player names. The production session is used directly.

## Still open

The original players are **stylized children**, not realistic footballers.
FC Mobile is an art/gameplay quality reference; this change does not achieve
that level. A proper football model, rig adapter, animation set, PBR skin/kit
textures, mobile LOD and device performance review are the next major work.
The roster stays 4v4 until that work supports more players.

This branch is for review and Claude handoff. It is not merged or deployed.
The shared island release/cache stamp must be advanced during integration,
coordinated with the parallel city work.
