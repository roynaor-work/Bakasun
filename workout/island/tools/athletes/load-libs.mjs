/** Loads the three shipped motion libraries as canonical clips (node only). */
import {readFileSync} from 'node:fs';
import {normaliseSoccerClip, normaliseTallClip, normaliseTennisClip} from '../../minigames/athletes-core.mjs';
const root = new URL('../../assets/', import.meta.url);
const json = p => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
export function loadLibraries() {
  const libs = {};
  const v9 = json('soccer-v9/clips.json'), v10 = json('soccer-v10/clips.json'), tall = json('hoops-tall/motion.json'), tennis = json('tennis-motion-v1/core.json');
  libs['soccer-v9'] = Object.fromEntries(Object.entries(v9.states).map(([n, s]) => [n, normaliseSoccerClip(n, s, 'soccer-v9')]));
  libs['soccer-v10'] = Object.fromEntries(Object.entries(v10.states).map(([n, s]) => [n, normaliseSoccerClip(n, s, 'soccer-v10')]));
  libs['hoops-tall'] = Object.fromEntries(Object.entries(tall.clips).map(([n, c]) => [n, normaliseTallClip(n, c, tall.fps)]));
  libs['tennis-v1'] = Object.fromEntries(Object.entries(tennis.clips).map(([n, c]) => [n, normaliseTennisClip(n, c)]));
  return libs;
}
