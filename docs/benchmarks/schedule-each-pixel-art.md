# `scheduleEach` Pixel Art benchmark

This opt-in Playwright benchmark measures the production build of the Pixel Art
demo for 256, 1,000, and 10,000 cells. It compares the synchronous baseline
with `scheduleEach({ strategy: 'frame' })` and reports:

- time to the first cell;
- time to the complete grid;
- accumulated long-task duration when the browser exposes `PerformanceObserver`;
- animation-frame callback count;
- time to the first paint observed during rendering.

Run it against a production preview:

```sh
npx nx build demo --configuration=production
npx vite preview --config apps/demo/vite.config.ts --host 127.0.0.1 --port 4173
BASE_URL=http://127.0.0.1:4173 RUN_PIXEL_ART_BENCHMARK=1 \
  npx playwright test apps/demo/e2e/pixel-art-scheduling.bench.spec.ts \
  --config apps/demo/playwright.config.ts --project=chromium
```

The first delivery intentionally does not include the `idle` strategy; the
benchmark will gain that comparison when its scheduler and fallback policy are
implemented. Scheduling changes when the work happens, not how much total work
is required, so compare both first-cell latency and complete-grid time. For
large, continuously scrolling collections, use virtualisation instead.
