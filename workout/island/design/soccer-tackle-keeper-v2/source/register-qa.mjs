// SPDX-License-Identifier: CC0-1.0
// Adapt only the input inventory of the pinned, unchanged QA CLI.
import {register} from 'node:module';
register('./qa-loader.mjs', import.meta.url);
