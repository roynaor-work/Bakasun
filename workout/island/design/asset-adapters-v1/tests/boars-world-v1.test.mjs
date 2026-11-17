import { checkAdapter } from './adapter-contract.mjs';
checkAdapter('boars-world-v1', () => import('../src/boars-world-v1.mjs'));
