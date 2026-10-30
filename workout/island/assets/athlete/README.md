# Realistic athlete (soccer)

`athlete.glb` is the realistic footballer used by the soccer mini-game. It replaces the illustrated `../kid-full.glb` at runtime; the kid model stays in place as the verified fallback (it loads automatically if this file fails).

## What is inside

| Part | Detail |
| --- | --- |
| Mesh | MakeHuman hm08 base mesh, athletic male shape (muscle 0.78, weight 0.42, height 0.58, ideal proportions 0.75 plus torso/arm/calf detail targets) |
| Triangles | 11,614 per player (skin 8,546 + kit 3,068), about 93,000 for the 8-player roster; economy level of detail 5,336 per player (about 43,000 for the roster) |
| Draw calls | 2 per player (skin, kit) + 1 shared ball |
| Skeleton | 31-bone CMU/MotionBuilder rig (`cmu_mb`) from MPFB, MakeHuman vertex weights, max 4 influences |
| Morph targets | `african`, `asian`, `caucasian`, `jaw`, `narrow`, `nose`, `brow` (head only, masked by head weights) and `hairVolume` (hair shell) |
| Kit | jersey, shorts, socks and boots built as offset shells of the body, with drape smoothing; team colours, crest, back number and keeper kit are applied in the shader |
| Textures | skin albedo 2048 + normal/roughness/masks 1024, kit detail 2048 + normal/roughness/mask 1024, ball 1024×512; 1.47 MB of images in total |
| Clips | idle, ready, jog, run, sprint, shot, shot-b, pass, header, throw, reach, celebrate, sit (slide) — all retargeted from CMU motion capture |
| File size | athlete.glb 1.28 MB (both levels of detail, 13 clips) + 10 textures in `textures/` 1.40 MB; every file under the 2 MB per-file budget |

The economy mesh (`AthleteMeshLOD1`) shares the skeleton, morph targets and UV layout; the game switches to it from quality tier 2 (`view.athlete.lodFromQuality`).

The build writes one GLB with embedded textures; `compact-glb.py` then makes the morph targets sparse, narrows indices, joints and weights, recompresses the PNGs losslessly and moves the textures to `textures/`. The game renders pixel-identical before and after.

Clip sources (CMU take ids), the exact source ranges and the ball-contact times are stored in the GLB (`asset.extras.clips`, `animations[].extras`) and in `provenance.json`.

## Licences

- **MakeHuman** base mesh, shape targets, the `cmu_mb` rig and its weights: released as **CC0 1.0** by the MakeHuman team in September 2020 (`LICENSE.ASSETS.md` in the MakeHuman repository; the CC0 notice is in every source file header). Files were taken from the MPFB2 repository (`src/mpfb/data`).
- **Motion**: CMU Graphics Lab Motion Capture Database, BVH conversion by Bruce Hahne (cgspeed). CMU places no restrictions on use, including commercial use; the converter adds none. Requested credit: *The data used in this project was obtained from mocap.cs.cmu.edu. The database was created with funding from NSF EIA-0196217.*
- **Authored for this project** (CC0): skin, hair, eye, kit, boot and ball textures (procedural bakes), the kit/hair/boot geometry processing, the retargeting, and the match ball.
- No EA, club, sponsor or player likeness is used. The reference to EA SPORTS FC Mobile sets a quality bar only.

## Rebuilding

The build pipeline lives outside the game (`tools/athlete-build` in the hand-off package): Node (three r160, meshoptimizer) for mesh, rig, retargeting and GLB writing; Python (numpy, Pillow) for the texture bakes. It downloads the MakeHuman and CMU source files listed in `provenance.json` and reproduces this file.
