# Standalone Git-index acceptance

Measured 2026-11-06, Node v24.19.0. Result: **PASS**.

The approved new directory was staged, including the ten CSV evidence files explicitly added despite the existing repository's `*.csv` ignore rule. The index contained 282 new files, all inside `workout/island/design/soccer-motion-v8/`; there were no edits, deletions or paths outside that prefix. `git checkout-index` exported exactly those files to `/tmp/soccer-v8-index-beWD12/`.

All 282 exported files were byte-compared against their workspace originals and matched. The exported hierarchy has no parent `package.json`, original motion JSON, source character GLBs, repository checkout or npm dependency folder. The optional browser and authoring tools are present but are not run or imported by the acceptance entry point.

```sh
cd /tmp/soccer-v8-index-beWD12/workout/island/design/soccer-motion-v8
node --test
```

Exit code: **0**. Duration: 56,471.03 ms. The isolated Node reporter displayed the passing `verification/verify.test.mjs` file, with zero failed, cancelled or skipped files. The same acceptance entry point's 34 individual checks were also exposed and passed in the workspace using `--test-isolation=none`; the default reporter granularity was separately controlled as documented in `final-independent-review.md`.

The run decoded the delivered local Draco assets, loaded every native animation, validated the legal transition graph and tested the actual geometry, runtime behavior and retained capture provenance. Browser textures are checked separately; the Node reader substitutes only raster image decoding with a neutral test pixel.

This report was added after exporting the index snapshot. Subsequent edits are final documentation and the continuing browser-soak result; none change the exported runtime, preview, authoring or acceptance code. The final commit's file count and exact bytes are recorded in `REPORT.md`.
