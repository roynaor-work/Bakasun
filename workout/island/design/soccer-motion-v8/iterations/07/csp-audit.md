# Existing island CSP loading check

Measured UTC: 2026-11-06T10:42:45.239Z. Real headless Chromium, local HTTP responses.

The HTML response carries the exact policy read from island/index.html. JavaScript, the classic static worker and WASM receive no CSP header, matching the repository server. No policy was relaxed.

- Native clips loaded and played: 25/25.
- Static worker instances: 1. Decoder wrapper requests: 1. WASM requests: 1.
- Runtime CSP violations: 0. Runtime page errors: 0. External requests: 0. Failed requests before teardown: 0.
- Old Blob worker positive control: blocked; 2 observed CSP records.
- missing-wasm: rejected HTTP404 in 185.00ms; unhandled rejections 0; page errors 0; workers 0; live workers 0.
- missing-wasm-preload: rejected HTTP404 in 203.90ms; unhandled rejections 0; page errors 0; workers 0; live workers 0.

## Transport observations before teardown

No failed requests observed.

These observations were captured after decode settled and before context closure; they are not attributed to teardown.

## Exact HTML policy

```
default-src 'self' blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' blob:; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'
```

## Positive-control evidence

- Creating a worker from 'blob:http://127.0.0.1:36755/1925c643-e081-4271-b69a-187cc2788548' violates the following Content Security Policy directive: "script-src 'self'". Note that 'worker-src' was not explicitly set, so 'script-src' is used as a fallback. The action has been blocked.
- worker-src: blob

## Exact runtime inputs

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| runtime/controller.mjs | 15082 | da4c53291284a1c87106ef34fa79983b6db217f1b3b22ede10ebe05743ab8fc0 |
| runtime/LocalDRACOLoader.mjs | 2778 | b89f87ec91c25ef60a1196317f9c11f27f5384f8a44f9d7e2fe38ef39a7d836a |
| runtime/draco-worker.js | 6495 | 5b6bc305d5a07f3708983b2b804fb00fa24e12468b11ff72fa242b5f656a7194 |
| runtime/catalog.mjs | 285494 | fed8aab642afcce852ad7678f40b1e1789a3fb3021b4db8cbb2628325993d69b |
| runtime/player.glb | 821680 | 2df9d13df44f0c6c77851a248b221ffe34f14a4f33702450ab47c07ca05818ef |
| runtime/keeper.glb | 948984 | 4d786e2f7998f3114c71e9cd91cad0ce4d2989d30168a5343bb328727a574f42 |
