/* Offline module bootstrap. All payloads are local classic scripts, usable with file://. */
(async () => {
  const pack = window.ALPINE_PACK;
  const status = document.getElementById("status");
  try {
    if (!pack) throw Error("חסרה חבילת התצוגה המקומית");
    const urls = new Map();
    const blob = (code) =>
      URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
    const moduleURL = (name) => {
      if (urls.has(name)) return urls.get(name);
      let source = pack.modules[name];
      if (!source) throw Error(`Missing local module: ${name}`);
      source = source.replace(/from\s*(['"])([^'"]+)\1/g, (full, q, spec) => {
        const key = spec.endsWith("three.module.js")
          ? "three"
          : spec.endsWith("BufferGeometryUtils.js")
            ? "geometry"
            : spec.endsWith("GLTFLoader.js")
              ? "gltf"
              : spec.endsWith("DRACOLoader.js")
                ? "draco"
                : null;
        return key ? `from '${moduleURL(key)}'` : full;
      });
      const url = blob(source);
      urls.set(name, url);
      return url;
    };
    const decodedChunks = new Map(),
      assetURLs = new Map(),
      assetKeysByURL = new Map();
    const bytesFor = (key) => {
      const item = pack.assets[key];
      if (!item) throw Error(`Missing local asset: ${key}`);
      if (item.base64)
        return Uint8Array.from(atob(item.base64), (c) => c.charCodeAt(0));
      const result = new Uint8Array(item.bytes);
      let offset = 0;
      for (const id of item.chunks) {
        let bytes = decodedChunks.get(id);
        if (!bytes) {
          const encoded = pack.chunks[id];
          if (!encoded) throw Error(`Missing local chunk: ${id}`);
          bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
          decodedChunks.set(id, bytes);
        }
        result.set(bytes, offset);
        offset += bytes.length;
      }
      if (offset !== item.bytes)
        throw Error(`Invalid local asset size: ${key}`);
      return result;
    };
    const THREE = await import(moduleURL("three"));
    const { GLTFLoader } = await import(moduleURL("gltf"));
    const { DRACOLoader } = await import(moduleURL("draco"));
    class LocalDraco extends DRACOLoader {
      _loadLibrary(name, type) {
        const item = pack.assets[`engine/${name}`];
        if (!item)
          return Promise.reject(Error(`Missing local decoder: ${name}`));
        const bytes = bytesFor(`engine/${name}`);
        return Promise.resolve(
          type === "arraybuffer"
            ? bytes.buffer
            : new TextDecoder().decode(bytes),
        );
      }
    }
    const draco = new LocalDraco()
      .setDecoderConfig({ type: "wasm" })
      .setWorkerLimit(1);
    const loader = new GLTFLoader().setDRACOLoader(draco);
    const assetURL = (path) => {
      const key = path.replace(/^\.\//, "");
      if (assetURLs.has(key)) return assetURLs.get(key);
      const item = pack.assets[key];
      if (!item) throw Error(`Missing local asset: ${key}`);
      const url = URL.createObjectURL(
        new Blob([bytesFor(key)], { type: item.mime }),
      );
      assetURLs.set(key, url);
      assetKeysByURL.set(url, key);
      return url;
    };
    const loadGLB = async (path) => {
      const key = path.replace(/^\.\//, "");
      const bytes = assetKeysByURL.has(key)
        ? bytesFor(assetKeysByURL.get(key))
        : key.startsWith("data:")
          ? Uint8Array.from(atob(key.split(",")[1]), (c) => c.charCodeAt(0))
          : bytesFor(key);
      return loader.parseAsync(bytes.buffer, "");
    };
    const { buildWorld } = await import(moduleURL("world"));
    const motion = pack.modules.motion ? await import(moduleURL("motion")) : {};
    const { startPreview } = await import(moduleURL("preview"));
    await startPreview({ THREE, buildWorld, motion, loadGLB, assetURL, pack });
  } catch (error) {
    status.textContent = `לא ניתן לטעון את התצוגה: ${error.message}`;
    status.classList.add("error");
    console.error(error);
    window.__ALPINE_ERROR = error.message;
  }
})();
