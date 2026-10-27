# City finish visual review — 27 October 2026

Base: `12177da` (main after PR179). Prior world pass: `b8a87b2`.
Release/cache stamp: `island-city-finish-20261027-1`.

## Like-for-like captures

The before images use the first coastal pass, rebased onto the same clean UI.
Both sides render the same synthetic 32×32 ready-plan fixture: four houses at
levels 1/2/3/4, and one of each other eligible building. The building levels do
not change between captures. Camera, 1280×720 canvas and high quality match.
All original building, palm, car, citizen and avatar models finish loading
before animation is frozen. No personal save or private reference is included.

| View | Before | After |
| --- | --- | --- |
| Town | [before](before-town.jpg) | [after](after-town.jpg) |
| Closer view | [before](before-garden.jpg) | [after](after-garden.jpg) |
| Whole island | [before](before-island.jpg) | [after](after-island.jpg) |

## Changes

- Locally bundled CC0 asphalt/paver photographs share one existing paving draw;
  lane markings remain plain. Original authored model materials stay untouched.
- Limestone wall caps, hedge beds, path joints and original garden/park palms
  replace flat plot covers and placeholder park trees. Garden trees have a
  separate small budget. The existing road lamp/tree quotas cover all quadrants.
- Up to eight high-quality / two low-quality parked car instances reuse the
  existing original car cache, without requesting a new model or occupying roads.
- Contact shadows fit the actual rotated model bounds. A bounded eight-tap
  screen-space depth pass adds crease/contact depth in supported high quality.
  It has one extra draw and a 1440px maximum target dimension. Unsupported and
  low quality render directly. Slow frames disable and release this pass before
  the existing low-quality fallback. Effect failure falls back to direct render.
- Zoom reaches 4.8× and stays anchored under the wheel/pinch. Two-finger movement
  pans the camera; the single-finger orbit and placement flow remain available.
- PR179's clean UI is included through the main rebase. The broad import edits
  are one mechanical release/cache stamp update, not UI or minigame changes.

The two new 1024px photos total 448,917 bytes. Sources and CC0 provenance:
`../../assets/textures/STREET-SOURCES.txt`. The prior coast maps add 221,993 bytes.
No original GLB or embedded material has been edited.

## Validation

- 95 focused tests pass, including 11 new tests for anchored zoom and actual
  gesture bindings, site distribution, parking bounds, original-art ownership,
  texture failure/late loading, GPU disposal, bounded occlusion, renderer-state
  restoration, direct-render recovery and asset size/provenance.
- Full suite: 2,695 tests — 2,652 pass, 38 skip, 5 fail. The five failures match
  those previously reproduced in a clean Windows baseline: squat calibration,
  camera/exercise voice docs, and original tennis/soccer lab hashes. No unrelated
  tests are weakened. After the final GPU-geometry cleanup the focused 95 pass
  again; the full suite was not repeated for that small cleanup.
- Browser: direct production app loads without warnings/errors. Wheel zoom
  changed 1× to 2.054×. Building another house changed 36 available lots to 35;
  this persisted after reload. The latest full-app images include the clean UI.
- Responsive frames: 390×700 and 844×390, plus a low-quality close city view.
  These are desktop-browser frames, not a physical-phone or real-touch test.
  The frame wrapper logged a MutationObserver error; the direct production tab
  and isolated world test did not reproduce it. Its source is not confirmed.
- Live synthetic whole-island point samples: prior pass 67 calls / 441,578
  triangles; new high quality 69 / 497,442; new low quality 59 / 336,356.
  The extra two high-quality draws are the reused parked car batch and depth
  composite. Streets use 5 draws high / 4 low in this fixture. Water remains
  one draw, with no reflection pass. Local stable samples were around 60 FPS;
  startup/background samples fluctuate and these are not hardware benchmarks.

## Remaining limits

This improves surface depth and city detail; it is not a claim of SimCity art
quality. Building variety and physical-device performance still need review.
The code is prepared in PR180 and is not merged or live. Next: review the paired
images and test a physical phone before merging. No Claude handoff is needed.
