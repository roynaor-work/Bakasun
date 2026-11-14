# Pinned motion-qa-v1 evaluator

The `motion-qa-v1` directory is copied byte for byte from branch
`codex/motion-qa-v1`, commit `5eb4f093bc22523ee417a7f2345c3b813bffba24`, in
[roynaor-work/Bakasun](https://github.com/roynaor-work/Bakasun/tree/5eb4f093bc22523ee417a7f2345c3b813bffba24/workout/island/design/motion-qa-v1).
Only the upstream documentation filenames are suffixed `.upstream` to distinguish
them from this package's documentation. No thresholds, weights, formulas, tests,
or sampling code have been modified. The upstream CLI enumerates a fixed set of
soccer and basketball libraries, so `../validate-motion.mjs` calls its public
`sampleGLB` and `analyzeClip` APIs for this tennis asset package.

The sibling `soccer-motion-v8/runtime/vendor/three.module.js` keeps the original
GLB reader's relative import valid without changing its bytes. It is the existing
Three.js r160 copy at base commit `19d9cdc5e3718236df5a2fc4d8b8c26c72007575`.
Its complete MIT license is beside it in `LICENSE.three`. The QA code and original
defect-injection fixtures are CC0-1.0; full upstream notices are retained in
`motion-qa-v1/LICENSES.upstream.md`. See `provenance.json` for every exact source
path, commit, license and SHA-256 hash.

Run the unchanged upstream reader and metric tests from the repository root:

```sh
node --test workout/island/design/tennis-officials-v1/source/qa-vendor/motion-qa-v1/test/*.test.mjs
```

Run the tennis adapter after installing the build dependencies documented in the
package's report:

```sh
node workout/island/design/tennis-officials-v1/source/validate-motion.mjs
```

The adapter records the upstream metrics and coverage for every embedded clip in
all seven delivered character GLBs. It also decodes the skinned mesh and measures
every vertex against the court plane at 120Hz plus all authored key times. These
mesh measurements extend the upstream skeletal floor probes without changing the
evaluator's scoring. Footrest contact uses a separate vertical-contact check; the
court floor remains `Y=0` for seated and standing characters alike.
