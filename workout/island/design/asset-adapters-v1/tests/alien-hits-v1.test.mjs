import { checkAdapter } from './adapter-contract.mjs';
checkAdapter('alien-hits-v1', () => import('../src/alien-hits-v1.mjs'));
