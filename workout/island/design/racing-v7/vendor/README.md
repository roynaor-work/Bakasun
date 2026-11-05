# Local runtime dependencies

Three.js r160 and the four loaders/utilities are byte-for-byte copies of the corresponding files under `workout/island/vendor/`. Their upstream MIT license is in LICENSE.three. The two runtime Draco decoder resources are local copies from `workout/island/vendor/draco/`; the Apache-2.0 license is in draco/LICENSE.draco.

The runtime never imports from a CDN. The optional offline packer rewrites module specifiers in memory and embeds module blobs, assets and the decoder into offline.html. It does not edit these vendored files. Source attribution and the complete notices are embedded in that standalone document too.
