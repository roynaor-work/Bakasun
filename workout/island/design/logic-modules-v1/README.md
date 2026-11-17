# Logic modules v1

Three independent, dependency-free JavaScript ES modules for later game integration.
Nothing here changes or connects to the existing games.

| Module | Entry point | Contract | Preview |
| --- | --- | --- | --- |
| Soccer motion state machine | [src/index.mjs](soccer-motion-statemachine/src/index.mjs) | [API.md](soccer-motion-statemachine/API.md) | [preview.html](soccer-motion-statemachine/preview.html) |
| Building fire simulation | [src/index.mjs](fire-spread-model/src/index.mjs) | [API.md](fire-spread-model/API.md) | [preview.html](fire-spread-model/preview.html) |
| Ski runner course generator | [src/index.mjs](runner-course-generator/src/index.mjs) | [API.md](runner-course-generator/API.md) | [preview.html](runner-course-generator/preview.html) |

## Run all module tests

From the repository root, using Node.js 22 or newer:

```sh
node --test workout/island/design/logic-modules-v1/contracts.test.mjs workout/island/design/logic-modules-v1/*/tests/*.test.mjs
```

No install, bundler, browser, network connection, or WebAssembly is needed for
these tests or any module's runtime. Each module owns its data and imports only
its own relative ES modules. The soccer asset extraction tool is a separate
development-time utility; normal operation uses the included data.

## Open the previews

From the repository root:

```sh
python3 -m http.server 8765
```

Open a preview through HTTP, for example:

```text
http://localhost:8765/workout/island/design/logic-modules-v1/runner-course-generator/preview.html
```

The previews use each module's public API. They are small diagnostic interfaces,
not replacements for the existing games. See [REPORT.md](REPORT.md) for scope,
validation results, asset provenance, and integration limits.
