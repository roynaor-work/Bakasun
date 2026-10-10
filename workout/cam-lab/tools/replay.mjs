#!/usr/bin/env node
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { replayRecording } from '../recording.mjs';

const MAX_FILE_BYTES = 40_000_000;
const usage = 'node workout/cam-lab/tools/replay.mjs skeleton.json [--thresholds \'{"squatDown":135}\' | thresholds.json]';

async function readJson(path) {
  if ((await stat(path)).size > MAX_FILE_BYTES) throw new RangeError('הקובץ גדול מהמגבלה של 40MB');
  return JSON.parse(await readFile(path, 'utf8'));
}

// The CLI reads only local skeleton files. It never sends recordings anywhere,
// and compares replayed counts rather than trusting a recorded count field.
export async function runReplay(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: usage };
  let input, thresholdSource;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--thresholds') {
      if (thresholdSource != null || !args[i + 1]) throw new TypeError('נדרש ערך יחיד אחרי --thresholds');
      thresholdSource = args[++i];
    } else if (args[i].startsWith('--')) throw new TypeError(`דגל לא מוכר: ${args[i]}`);
    else if (input) throw new TypeError('נדרש קובץ שלד אחד בלבד');
    else input = args[i];
  }
  if (!input) throw new TypeError(`חסר קובץ שלד. שימוש: ${usage}`);
  const recording = await readJson(resolve(input));
  const result = { exercise: recording.exercise, mode: recording.mode, frames: recording.frames?.length,
    durationMs: recording.endMs ?? recording.frames?.at(-1)?.t ?? 0,
    countStartMs: recording.countStartMs ?? null, baseline: replayRecording(recording, { details: true }) };
  if (thresholdSource != null) {
    const parsed = thresholdSource.trim().startsWith('{') ? JSON.parse(thresholdSource) : await readJson(resolve(thresholdSource));
    const overrides = parsed && Object.hasOwn(parsed, 'thresholds') ? parsed : { thresholds: parsed };
    if (Object.keys(overrides).some(k => !['thresholds', 'adultThresholds'].includes(k))) throw new TypeError('מבנה ספים חלופיים לא תקין');
    result.override = replayRecording(recording, { ...overrides, details: true });
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await runReplay(process.argv.slice(2));
    console.log(result.help || JSON.stringify(result, null, 2));
  } catch (error) {
    const message = error instanceof SyntaxError ? 'הקובץ או הספים אינם JSON תקין' :
      error.code === 'ENOENT' ? 'קובץ השלד או קובץ הספים לא נמצא' : error.message;
    console.error(`לא ניתן לשחזר את ההקלטה: ${message}`);
    process.exitCode = 1;
  }
}
