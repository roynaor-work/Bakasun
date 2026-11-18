import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { BUILDINGS, STARTER_SUPPLIES } from '../data/catalog.mjs';
import { cityProgressStorage, prepareCityProgressData } from '../src/island-adapter.mjs';
import { constructionStage, progressMetrics } from '../src/progression.mjs';
import { PROFILES } from './profiles.mjs';
import { curveCsv, summarize } from './results.mjs';
import { memoryStorage, runScenario, TICK_SECONDS } from './scenario.mjs';

const { values } = parseArgs({
  options: {
    checkout: { type: 'string' },
    output: { type: 'string' },
    'starter-materials': { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  },
});

if (values.help) {
  console.log('Usage: node sim/run.mjs [--checkout patched-repository-root] [--output directory] [--starter-materials per-active-minute]');
} else {
  const materialsPerMinute = values['starter-materials'] === undefined ? STARTER_SUPPLIES.materials : Number(values['starter-materials']);
  if (!Number.isFinite(materialsPerMinute) || materialsPerMinute < 0) throw new Error('Starter materials must be a finite non-negative rate.');
  const materialsDelta = materialsPerMinute - STARTER_SUPPLIES.materials;
  const island = values.checkout
    ? pathToFileURL(resolve(values.checkout, 'workout/island') + '/')
    : new URL('../../../', import.meta.url);
  const { loadData } = await import(new URL('engine/load-data.mjs', island).href);
  const { createEngine } = await import(new URL('engine/engine.mjs', island).href);
  const fetchLocal = async url => ({ ok: true, json: async () => JSON.parse(await readFile(url, 'utf8')) });
  const assetTypeIds = new Set(Object.entries(BUILDINGS).filter(([, row]) => row.assetId).map(([id]) => id));

  const scenarios = [];
  for (const profile of PROFILES) {
    for (const enabled of [false, true]) {
      const data = await loadData(island, fetchLocal);
      if (enabled) {
        prepareCityProgressData(data);
        if (materialsDelta) {
          const standardIncome = data.cityProgress.income;
          data.cityProgress.income = (...input) => {
            const income = standardIncome(...input);
            income.materials += materialsDelta;
            const starterSource = income.sources.find(source => source.id === 'progress.supplies' && source.resource === 'materials');
            starterSource.amount = materialsPerMinute;
            return income;
          };
        }
      }
      const createStorage = () => enabled ? cityProgressStorage(memoryStorage()) : memoryStorage();
      scenarios.push(summarize(runScenario({ createEngine, data, profile, enabled, assetTypeIds, constructionStage, progressMetrics, createStorage })));
    }
  }
  const json = JSON.stringify({ format: 1, tickSeconds: TICK_SECONDS, starterMaterialsPerMinute: materialsPerMinute, scenarios }, null, 2) + '\n';
  if (values.output) {
    const directory = resolve(values.output);
    await mkdir(directory, { recursive: true });
    await Promise.all([
      writeFile(join(directory, 'results.json'), json),
      writeFile(join(directory, 'curve.csv'), curveCsv(scenarios)),
    ]);
  } else {
    process.stdout.write(json);
  }
}
