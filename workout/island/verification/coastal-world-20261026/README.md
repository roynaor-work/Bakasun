# Coastal world visual review

Baseline: `9f7fe882b0ea363a1e01561b1551c45b0fd42529` (PR176).

The paired images are actual WebGL renders of the same synthetic 32×32
construction fixture, using the existing ready-plot plan and original building,
palm, vehicle and citizen assets. Both versions use the same 1280×720 canvas,
camera presets and high quality. Animation is frozen for captures. No personal
save, name, account data or private reference image is included. The isolated
world deliberately omits the production UI, whose cleanup is a separate change.

| View | Before | After |
| --- | --- | --- |
| Island | [before](before-island.jpg) | [after](after-island.jpg) |
| Town | [before](before-town.jpg) | [after](after-town.jpg) |
| Coast | [before](before-coast.jpg) | [after](after-coast.jpg) |

## Observed changes

- Photographic, locally bundled CC0 grass/sand detail replaces the conspicuous
  sine-wave ground pattern; stable world-space color patches remain after growth.
- Dry sand, damp tidal sand and the underwater shelf have distinct transitions.
- Calmer water normals, depth attenuation and interrupted surf preserve one
  water draw with no reflection pass.
- Coastal rocks/shrubs are grouped rather than forming a continuous necklace.
- Sidewalk expansion joints and more original instanced street palms improve
  scale without changing the saved road network or occupying building cells.
- One instanced palm contact-shadow batch also remains when directional shadows
  are disabled by the existing adaptive renderer.

Original GLB geometry, embedded texture maps and materials are unchanged.
The two added 1024px JPEG maps total 221,993 bytes. Their sources and license are
in `../../assets/textures/COASTAL-SOURCES.txt`.

## Validation

- 37 focused tests pass, including 6 new tests for flat buildable terrain at
  32/40/48, continuous noise, vegetation clearance, fallback/late texture loading,
  GPU resource disposal, shared original art and the download budget.
- After rebasing onto `9e1897d` (PR178), the same 37 focused tests pass again.
  The full-suite counts below describe the original PR176 baseline run.
- Full suite: 2,657 tests, 2,614 pass, 38 skipped, 5 fail. Those same 5 failures
  were reproduced in a clean baseline checkout in the same Windows environment:
  camera squat calibration, camera voice documentation, exercise voice catalog
  documentation, and original lab hashes for tennis and soccer. No unrelated
  baseline test or game file is modified to hide these failures.
- Browser: desktop plus 390×700 and 844×390 iframe viewports; all original models
  and new local maps load without console errors. A house was built through the
  full production UI, and the count changed from 37 available plots to 36 and
  survived reload. These are responsive-browser checks, not a physical-phone test.
- On the local desktop a live high-quality sample window ranged from 21 to 61
  FPS (about 48 average), with a 60 FPS low-quality point sample. This was not an
  isolated hardware benchmark. A representative whole-island frame rose from
  425,548 to 443,590 triangles (4.2%) and 67 to 68 draw calls. The low-quality
  sample used 57 calls / 316,684 triangles. Water remains one draw / zero extra
  reflection passes. Physical-device performance remains to be verified.

## Integration and quality limit

This is a concrete coastal-world improvement, not a claim that the city has
reached SimCity quality. Urban density, building variety and further street
detail still need art direction and device testing.

Keep this PR a draft until the separate clean-interface work has landed. Rebase
onto that version and apply one shared release/cache stamp before merging; this
world-only branch intentionally does not churn UI or global version references.
It does not change placement rules, saves, construction costs or progression.
