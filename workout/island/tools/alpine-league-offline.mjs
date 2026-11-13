// Ski league v23: writes the league's own offline group (offline-manifest.json games.alpineLeague) from the theme asset map: every
// file of the Codex theme pack a theme can request (assets/alpine-themes-v23). The shipped ski files a theme falls back to are in
// games.alpine already, and the ski group's size budget stays as it was. Run from anywhere:  node workout/island/tools/alpine-league-offline.mjs
import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {THEME_IDS, themePackFiles} from '../minigames/alpine-league-theme.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const leagueOfflineFiles = () => [...new Set(THEME_IDS.flatMap(id => themePackFiles(id)))].sort();
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = path.join(root, 'offline-manifest.json'), manifest = JSON.parse(await readFile(file, 'utf8')), games = {};
  for (const [game, list] of Object.entries(manifest.games)) { games[game] = list; if (game === 'alpine') games.alpineLeague = leagueOfflineFiles(); }
  manifest.games = games; await writeFile(file, JSON.stringify(manifest, null, 1) + '\n');
  console.log('alpineLeague files:', games.alpineLeague.length);
}
