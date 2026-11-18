// מדפיס אילו משפטים עוד בלי הקלטה: node workout/tools/voice-missing.mjs [--all]
// ברירת מחדל: רק משפטי המפתח החדשים (copy-*). הנגן נופל לקול המכשיר לכל קובץ חסר.
import fs from 'node:fs';
import { VOICE_LINES } from '../js/voice-lines.js';
const dir = new URL('../snd/voice/', import.meta.url);
const all = process.argv.includes('--all');
const scope = VOICE_LINES.filter(l => all || l.id.startsWith('copy-'));
const missing = scope.filter(l => !fs.existsSync(new URL(l.file, dir)));
console.log(`${scope.length - missing.length}/${scope.length} מוקלטים, חסרים ${missing.length}`);
for (const l of missing) console.log(`${l.file}\t${l.text}`);
