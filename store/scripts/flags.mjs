// Finds the URL flags the island code reads (static scan) and classifies them for the store build.
// Used by build-web.mjs. The classification rules are in store/flag-policy.json.
import fs from 'node:fs';
import path from 'node:path';

export const SKIP_DIRS = /^(vendor|tests|tools|verification|notes)\//;
// Preview and review pages under design/ are not loaded by the game; they are listed in the report only when they hold a flag.
export const DESIGN_PAGES = /^design\/.*(preview|viewer|demo|showcase|standalone|phone-check|offline\.html|\/app\.mjs|\/source\/)/;

export function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(mjs|js|html)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const KEY = /^[A-Za-z][\w-]*$/;

/** Returns Map key -> {files:Set, ops:Set('=== "1"' ...)} for the scanned tree. */
export function scanFlags(root) {
  const keys = new Map();
  const add = (key, rel, op = '') => {
    if (!KEY.test(key)) return;
    if (!keys.has(key)) keys.set(key, { files: new Set(), ops: new Set() });
    const entry = keys.get(key);
    entry.files.add(rel);
    if (op) entry.ops.add(op.replace(/\s+/g, ''));
  };
  const opTail = '\\s*((?:!==|===|!=|==)\\s*[\'"][^\'"]*[\'"])?';
  for (const file of walk(root)) {
    const rel = path.relative(root, file).split(path.sep).join('/');
    if (SKIP_DIRS.test(rel) || DESIGN_PAGES.test(rel)) continue;
    const text = fs.readFileSync(file, 'utf8');
    if (!/URLSearchParams|location\??\.search|searchParams/.test(text)) continue;
    // inline: new URLSearchParams(...).get('k')
    for (const m of text.matchAll(new RegExp('URLSearchParams\\([^()]*(?:\\([^()]*\\)[^()]*)*\\)\\s*\\.(?:get|has)\\(\\s*[\'"]([^\'"]+)[\'"]\\s*\\)' + opTail, 'g'))) add(m[1], rel, m[2]);
    // variables bound to a URLSearchParams (or to a helper wrapping one)
    const vars = new Set();
    for (const m of text.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*(?:new URLSearchParams\(|[^;\n]*searchParams)/g)) vars.add(m[1]);
    for (const m of text.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*\(?[\w\s,=?.'"|]*\)?\s*=>\s*\{?\s*(?:try\s*\{)?[^;\n]*new URLSearchParams/g)) vars.add(m[1]);
    for (const m of text.matchAll(/function\s+(\w+)\s*\([^)]*\)\s*\{[^}]{0,200}new URLSearchParams/g)) vars.add(m[1]);
    for (const v of vars) {
      for (const m of text.matchAll(new RegExp('\\b' + v + '\\s*(?:\\?\\.|\\.)(?:get|has)\\(\\s*[\'"]([\\w-]+)[\'"]\\s*\\)' + opTail, 'g'))) add(m[1], rel, m[2]);
      for (const m of text.matchAll(new RegExp('\\b' + v + '\\(\\s*[\'"]([\\w-]+)[\'"]\\s*(?:,[^()]*)?\\)' + opTail, 'g'))) add(m[1], rel, m[2]);
      for (const m of text.matchAll(new RegExp('\\b' + v + '\\(\\s*[\'"]([\\w-]+)[\'"]', 'g'))) add(m[1], rel);
    }
    for (const m of text.matchAll(new RegExp('\\b(?:p|q|params|query|urlFlags|u)\\.(?:get|has)\\(\\s*[\'"]([A-Za-z][\\w-]*)[\'"]\\s*\\)' + opTail, 'g'))) add(m[1], rel, m[2]);
  }
  return keys;
}

/** Default when the flag is absent, from the comparison the code makes. */
export function defaultOf(ops) {
  // "!== x" and "=== '0' / 'off' / 'old' / 'missing'" mean the flag switches something off, so the default is ON.
  // "=== other" means the flag switches something on, so the default is OFF.
  let on = false;
  let off = false;
  for (const op of ops) {
    const strict = op.startsWith('===') || op.startsWith('==');
    const literal = op.replace(/^[!=]+/, '').replace(/['"]/g, '');
    if (!strict || ['0', 'off', 'old', 'missing'].includes(literal)) on = true;
    else off = true;
  }
  if (on && off) return 'mixed';
  if (on) return 'on';
  if (off) return 'off';
  return 'value';
}

export function classify(key, ops, policy) {
  for (const rule of policy.rules) {
    if (rule.keys?.includes(key) || (rule.match && new RegExp(rule.match).test(key))) {
      return { group: rule.group, decision: rule.decision, why: rule.why };
    }
  }
  const def = defaultOf(ops);
  const fallback = policy.defaults[def] ?? policy.defaults.value;
  return { group: fallback.group, decision: fallback.decision, why: fallback.why, auto: true };
}
