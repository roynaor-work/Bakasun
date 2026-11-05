/** Existing test-helper adapter: select an installed Chromium, preserving every
 * test argument and CSP assertion. This file is authoring-only, never shipped
 * into the interactive page. ISLAND_PLAYWRIGHT is the repository's supported hook.
 */
import { pathToFileURL } from "node:url";
const modulePath =
  process.env.ALPINE_PLAYWRIGHT_MODULE ||
  "/tmp/alpine-v7-tools/node_modules/playwright-core/index.mjs";
const { chromium: originalChromium } = await import(
  pathToFileURL(modulePath).href
);
const executable = process.env.CHROMIUM_PATH || "/usr/bin/chromium";
export const chromium = new Proxy(originalChromium, {
  get(target, property) {
    if (property === "launch")
      return (options = {}) =>
        target.launch({
          ...options,
          executablePath: options.executablePath || executable,
        });
    if (property === "launchPersistentContext")
      return (userDataDir, options = {}) =>
        target.launchPersistentContext(userDataDir, {
          ...options,
          executablePath: options.executablePath || executable,
        });
    if (property === "executablePath") return () => executable;
    const value = Reflect.get(target, property, target);
    return typeof value === "function" ? value.bind(target) : value;
  },
});
