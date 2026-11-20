import { registerHooks } from 'node:module';

// Use an allowlist for this isolated test process. Production stays closed.
export function mockApprovedUploadEndpoint(endpoint) {
  return registerHooks({
    load(url, context, next) {
      const result = next(url, context);
      if (!new URL(url).pathname.endsWith('/cam-lab/upload-endpoints.mjs')) return result;
      const source = result.source.toString();
      const policy = 'Object.freeze([])';
      if (!source.includes(policy)) throw new Error('Cannot install the synthetic allowlist');
      return { ...result, source: source.replace(policy, `Object.freeze(${JSON.stringify([endpoint])})`) };
    },
  });
}
