import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  vendor = path.resolve(root, "../../vendor");
const read = (p) => fs.readFile(p, "utf8"),
  sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const out = path.join(root, "offline");
await fs.mkdir(out, { recursive: true });
const modules = {
  three: await read(path.join(vendor, "three.module.js")),
  geometry: await read(path.join(vendor, "BufferGeometryUtils.js")),
  gltf: await read(path.join(vendor, "GLTFLoader.js")),
  draco: await read(path.join(vendor, "DRACOLoader.js")),
  world: await read(path.join(root, "world/world.js")),
  motion: await read(path.join(root, "motion/motion.mjs")),
  preview: await read(path.join(root, "preview-client.mjs")),
};
const manifest = JSON.parse(
    await read(path.join(root, "characters/manifest.json")),
  ),
  entries = [];
async function walk(dir) {
  for (const item of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) await walk(full);
    else if (/\.(glb|webp|png|jpe?g|wasm)$/.test(item.name))
      entries.push([path.relative(root, full), await fs.readFile(full)]);
  }
}
await walk(path.join(root, "characters"));
await walk(path.join(root, "world"));
for (const name of ["draco_wasm_wrapper.js", "draco_decoder.wasm"])
  entries.push([
    `engine/${name}`,
    await fs.readFile(path.join(vendor, "draco", name)),
  ]);
const mime = (p) =>
  p.endsWith(".glb")
    ? "model/gltf-binary"
    : p.endsWith(".webp")
      ? "image/webp"
      : p.endsWith(".png")
        ? "image/png"
        : p.endsWith(".wasm")
          ? "application/wasm"
          : p.endsWith(".js")
            ? "text/javascript"
            : "image/jpeg";
// Content-defined boundaries recover identical atlas/animation runs after GLB
// buffer offsets change. Each piece has its own SHA; concatenation is lossless.
const gear = Array.from({ length: 256 }, (_, i) =>
  parseInt(sha(`alpine-v7-gear-${i}`).slice(0, 8), 16),
);
const chunks = {},
  assets = {};
let rawBytes = 0,
  uniqueBytes = 0;
for (const [p, bytes] of entries) {
  let start = 0,
    hash = 0;
  const ids = [];
  const emit = (end) => {
    const chunk = bytes.subarray(start, end),
      id = sha(chunk);
    if (!chunks[id]) {
      chunks[id] = chunk.toString("base64");
      uniqueBytes += chunk.length;
    }
    ids.push(id);
    start = end;
    hash = 0;
  };
  for (let i = 0; i < bytes.length; i++) {
    hash = ((hash << 1) + gear[bytes[i]]) >>> 0;
    const length = i + 1 - start;
    if (length >= 16384 || (length >= 2048 && (hash & 4095) === 0)) emit(i + 1);
  }
  if (start < bytes.length) emit(bytes.length);
  assets[p] = {
    mime: mime(p),
    bytes: bytes.length,
    sha256: sha(bytes),
    chunks: ids,
  };
  rawBytes += bytes.length;
}
const builtAt = new Date().toISOString(),
  sourceHashes = Object.fromEntries(
    Object.entries(modules).map(([name, code]) => [name, sha(code)]),
  ),
  scripts = [];
const registry = {
  modules: {},
  assets,
  chunks: {},
  chunkEncoding: "gear-sha256-v1",
  manifest,
  builtAt,
  sourceHashes,
};
await fs.writeFile(
  path.join(out, "registry.js"),
  `/* Generated exact-byte offline registry. */\nwindow.ALPINE_PACK=${JSON.stringify(registry)};\n`,
);
for (const [name, code] of Object.entries(modules)) {
  const file = `module-${name}.js`;
  scripts.push(file);
  await fs.writeFile(
    path.join(out, file),
    `/* Local ${name} module; upstream licenses in ../licenses. */\nwindow.ALPINE_PACK.modules[${JSON.stringify(name)}]=${JSON.stringify(code)};\n`,
  );
}
let batch = {},
  size = 0,
  index = 0;
const flush = async () => {
  if (!Object.keys(batch).length) return;
  const file = `assets-${String(index++).padStart(2, "0")}.js`;
  scripts.push(file);
  await fs.writeFile(
    path.join(out, file),
    `/* Deduplicated exact-byte local chunks. */\nObject.assign(window.ALPINE_PACK.chunks,${JSON.stringify(batch)});\n`,
  );
  batch = {};
  size = 0;
};
for (const [id, base64] of Object.entries(chunks)) {
  if (size + base64.length + id.length + 8 > 1100000) await flush();
  batch[id] = base64;
  size += base64.length + id.length + 8;
}
await flush();
for (const name of await fs.readdir(out))
  if (/^assets-\d+\.js$/.test(name) && !scripts.includes(name))
    await fs.unlink(path.join(out, name));
const htmlPath = path.join(root, "preview.html");
let html = await read(htmlPath);
html = html.replace(
  /<!-- OFFLINE_PAYLOADS -->[\s\S]*?(?=<script src="bootstrap.js")/,
  `<!-- OFFLINE_PAYLOADS -->\n${scripts.map((p) => `<script src="offline/${p}"></script>`).join("\n")}\n`,
);
await fs.writeFile(htmlPath, html);
const payloads = await Promise.all(
  ["registry.js", ...scripts].map(async (p) => ({
    path: `offline/${p}`,
    bytes: (await fs.stat(path.join(out, p))).size,
  })),
);
let standalone = html
  .replace(
    '<link rel="stylesheet" href="preview.css">',
    `<style>${await read(path.join(root, "preview.css"))}</style>`,
  )
  .replace(/<script src="[^"]+"><\/script>/g, "");
const payload = JSON.stringify({ ...registry, modules, chunks }),
  compressed = gzipSync(payload, { level: 9 }).toString("base64"),
  bootstrap = await read(path.join(root, "bootstrap.js"));
const inline = `(async()=>{try{const bytes=Uint8Array.from(atob(${JSON.stringify(compressed)}),c=>c.charCodeAt(0));const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));window.ALPINE_PACK=JSON.parse(await new Response(stream).text());${bootstrap}}catch(error){document.getElementById('status').textContent=error.message;window.__ALPINE_ERROR=error.message;console.error(error);}})();`;
const notices =
  (await read(path.join(root, "licenses/three-MIT.txt"))) +
  "\n\n" +
  (await read(path.join(root, "licenses/draco-Apache-2.0.txt")));
standalone = standalone.replace(
  "</head>",
  `<template id="third-party-notices">${notices.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</template></head>`,
);
standalone = standalone.replace(
  "</body>",
  `<script>${inline.replace(/<\/script/gi, "<\\/script")}</script></body>`,
);
await fs.writeFile(path.join(root, "preview-standalone.html.tmp"), standalone);
await fs.rename(
  path.join(root, "preview-standalone.html.tmp"),
  path.join(root, "preview-standalone.html"),
);
const report = {
  builtAt,
  threeRevision: "160",
  chunkEncoding: registry.chunkEncoding,
  assetCount: entries.length,
  uniqueChunks: Object.keys(chunks).length,
  originalEmbeddedBytes: rawBytes,
  uniqueEmbeddedBytes: uniqueBytes,
  deduplicationSavingsBytes: rawBytes - uniqueBytes,
  scriptCount: scripts.length,
  payloads,
  largestPayloadBytes: Math.max(...payloads.map((p) => p.bytes)),
  standaloneBytes: Buffer.byteLength(standalone),
  gzipPayloadBytes: Buffer.from(compressed, "base64").length,
  uncompressedPayloadBytes: Buffer.byteLength(payload),
  note: "Exact-byte deduplication only; standalone has no local subrequests or external network requests. Original GLBs remain self-contained.",
};
await fs.writeFile(
  path.join(root, "verification/offline-package.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify(report, (key, value) =>
    key === "payloads" ? undefined : value,
  ),
);
