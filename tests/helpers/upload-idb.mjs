// Transactional test double: requests are asynchronous, transactions commit
// atomically and competing connections share the same serialized database.
export function uploadIndexedDB({ legacy = false } = {}) {
  const stores = new Map(legacy ? [['sessions', new Map()]] : []), versions = [];
  let tail = Promise.resolve();
  const db = {
    objectStoreNames: { contains: name => stores.has(name) },
    createObjectStore(name) { stores.set(name, new Map()); }, close() {},
    transaction(names, mode) {
      names = Array.isArray(names) ? names : [names];
      let aborted = false, working;
      const requests = [];
      const request = operation => { const req = {}; requests.push(() => {
        req.result = operation(); req.onsuccess?.();
      }); return req; };
      const tx = { abort() { aborted = true; }, objectStore(name) {
        if (!names.includes(name)) throw Error('store outside transaction');
        return {
          get: key => request(() => structuredClone(working.get(name).get(key))),
          getAll: () => request(() => [...working.get(name).values()].map(value => structuredClone(value))),
          put: (value, key = value.session) => request(() => working.get(name).set(key, structuredClone(value))),
          delete: key => request(() => working.get(name).delete(key)),
          clear: () => request(() => working.get(name).clear()),
        };
      } };
      tail = tail.then(() => new Promise(resolve => setImmediate(() => {
        working = new Map(names.map(name => [name, new Map(stores.get(name))]));
        try { while (requests.length && !aborted) requests.shift()(); } catch { aborted = true; }
        if (aborted) tx.onabort?.();
        else { if (mode === 'readwrite') for (const [name, values] of working) stores.set(name, values); tx.oncomplete?.(); }
        resolve();
      })));
      return tx;
    },
  };
  return { versions, open(name, version) {
    versions.push(version); const req = {};
    setImmediate(() => { req.result = db; req.onupgradeneeded?.(); req.onsuccess?.(); }); return req;
  } };
}
