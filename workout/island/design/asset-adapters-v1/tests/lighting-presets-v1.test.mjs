import { checkAdapter } from './adapter-contract.mjs';
checkAdapter('lighting-presets-v1', () => import('../src/lighting-presets-v1.mjs'));
