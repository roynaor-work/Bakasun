# Reproduce the package

Run from the repository root. Authoring tools are isolated outside the repository; the viewer requires no installation.

```sh
npm install --prefix /tmp/hoops-technique-tools --cache /tmp/hoops-technique-npm-cache --no-audit --no-fund @gltf-transform/core@4.2.1 @gltf-transform/extensions@4.2.1 @gltf-transform/functions@4.2.1 draco3dgltf@1.5.7 gltf-validator@2.0.0-dev.3.10 meshoptimizer@0.25.0 playwright@1.56.1 sharp@0.34.5
node workout/island/design/hoops-technique-v1/source/build.mjs
node workout/island/design/hoops-technique-v1/source/validate.mjs
node workout/island/design/hoops-technique-v1/source/audit-technique.mjs
node workout/island/design/hoops-technique-v1/source/audit-bridges.mjs
node workout/island/design/hoops-technique-v1/source/capture.mjs
```

System Chromium is expected at `/usr/bin/chromium`. `build.mjs` writes only inside this package and one transient, full source-sample file in `/tmp/hoops-technique-source-samples.json`. Validation reads that file for independent source/bake comparisons. It must follow a fresh build; missing source samples fail the fidelity gate.

```sh
python3 -m http.server 8765 --bind 0.0.0.0
```

Open `http://localhost:8765/workout/island/design/hoops-technique-v1/preview.html` at 844×390. There are 24 main techniques, two reference animations and 96 explicitly named bridge animations. The main GLB is self-contained. `athlete-bind.glb` preserves the original rig/mesh input for reproducibility.

The canonical contract is the same 18 names and hierarchy as `motion2/hoops.json`; the delivered athlete uses the measured pg bind proportions recorded in `rig.json`. Applying local rotation channels to a different bind requires retargeting. The 18 bones do not include fingers; two independent grip morphs supply finger/thumb closure.

All animated tracks contain a key at each integer frame including both endpoints (30 Hz). Bone, grip and ball transform tracks use glTF CUBICSPLINE interpolation, with STEP ball visibility. Separate incoming/outgoing tangents are measured from the source at a 0.1 ms step; they preserve contact and free-flight curvature between frames. Impacts have distinct incoming/outgoing velocities. Bridges inherit endpoint derivatives from the adjacent sampled bone/grip tracks; legitimate basketball impacts and ball possession/visibility changes are outside that skeletal C1 claim.

Four run↔running-dribble bridges retain a complete 0.8-second lower-body gait cycle. Other bridges use measured skin clearance corrections, with zero additive endpoint values and derivatives. Some transitions contain a short hop; these do not declare a foot planted throughout a moving transition. An independent 120 Hz bridge-surface audit checks the actual decoded foot skin.

Root travel is stored in the `Root` bone. `MotionBallAnchor` is a separate scene node with world travel included. Each bridge records reference-animation times and root offsets for adjacent playback; offsets must be applied to both Root and ball anchor. Repeated running cycles accumulate terminal displacement. Runtime possession, receiving player, hoop alignment and collision remain integration responsibilities.

The local QA rubric and limits are embedded in `verification/motion-qa-v1.json`. Its score covers numerical tests, with every category a hard gate. It does not score professional technique aesthetics or establish external tool certification. The 2 cm slip limit applies to explicitly declared main-clip support windows. Generic bridges contain moving/hopping feet; the bridge audit separately measures surfaces and moving-foot clearance without inventing fixed-support declarations.

The compact bridge audit keeps summary metrics and worst/failing samples. Its full 120 Hz traces are saved outside the repository in `/tmp/hoops-technique-bridge-surfaces-full.json`; use `--include-samples` to include them in the report.
