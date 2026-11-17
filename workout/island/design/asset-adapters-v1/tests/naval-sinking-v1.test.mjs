import { checkAdapter } from './adapter-contract.mjs';
checkAdapter('naval-sinking-v1', () => import('../src/naval-sinking-v1.mjs'));
