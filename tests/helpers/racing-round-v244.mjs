// racing-v24.5: imported FIRST by the test files that measure the v24.4 circuits (the chicane wiggles and 17 m hairpins: speed bars, lap times, a run-off gate at a
// fixed spot). The circuits are built at import time from the address, so this sets ?racingRound=v244 before racing-tracks.mjs is evaluated in that test process.
// The new round circuits are measured by tests/island-racing-v24-5.test.mjs.
globalThis.location={search:'?racingRound=v244'};
