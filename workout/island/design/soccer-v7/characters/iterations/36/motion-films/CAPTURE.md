# Capture method

The frozen canonical utility `source/capture-motion-film.mjs` defines all four semantic plans and their request/event/terminal witnesses. Its SHA256 remains cbbd5f5904c578f19c5acb9e5102ad6bc6187cfa68507d33c8146529877e7d96.

The retained temporary adapter captures the actual rendered surface with CDP `Page.captureScreenshot`, bypassing Playwright stability waits after deterministic RAF suppression. It preserves the semantic plans, simulation clocks, controller, payloads and encoder. Every PNG is checked for exact requested CSS dimensions before encoding. Adapter SHA256 is recorded by every film report and the eight-film summary. This method does not measure device FPS.

Round35 films remain historical baseline evidence; this directory will contain a fresh round36 capture bound to its new final runtime/data/models.
