import { checkAdapter } from './adapter-contract.mjs';
checkAdapter('alpine-content-v1', () => import('../src/alpine-content-v1.mjs'));
