# Licenses and provenance

## Original coach work — CC0-1.0

The original coach geometry, materials, expression shapes, animations, authoring scripts, preview code and documentation created for this package are dedicated to the public domain under [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/legalcode). To the extent possible under law, the creators have waived copyright and related rights in that original work. No external character, photograph, sound, texture, or motion capture is incorporated in the coach.

The names, hierarchy and rest translations of the 18 joints follow the existing repository's `workout/island/design/motion2/soccer.json` skeleton as an interoperability contract. The model and animation are newly authored; following that contract is not a claim of ownership over the existing repository or its contents.

## Motion QA — CC0-1.0

`source/qa-upstream/` contains the original CC0-1.0 motion QA tool files from [motion-qa-v1 at commit 5eb4f093bc22523ee417a7f2345c3b813bffba24](https://github.com/roynaor-work/Bakasun/tree/5eb4f093bc22523ee417a7f2345c3b813bffba24/workout/island/design/motion-qa-v1). The original per-file hashes and the input model hash are recorded in `verification/motion-qa-provenance.json`. The accompanying adapter and diagnostic results are original to this package and are also CC0-1.0.

## three.js r160 — MIT

`preview.html` includes a minified bundle of [three.js r160](https://github.com/mrdoob/three.js/tree/r160), including its GLTFLoader. `source/vendor/three.module.js` is an unmodified local copy of the three.js r160 module used by offline QA. The following license applies to both copies:

```text
The MIT License

Copyright © 2010-2023 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
of use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

## Authoring and verification tools

Python and NumPy generate the model; Node.js, esbuild, the Khronos glTF Validator, and the motion QA tool assist packaging and verification. These tools run separately and are not required by the offline preview. The preview contains the bundled three.js code described above, and its model is embedded locally; it does not load a CDN or external asset.
