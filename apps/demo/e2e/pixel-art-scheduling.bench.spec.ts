import { test } from '@playwright/test';

type BenchmarkStrategy = 'sync' | 'frame';

const cases = [256, 1_000, 10_000] as const;
const strategies: readonly BenchmarkStrategy[] = ['sync', 'frame'];

test.skip(
  process.env['RUN_PIXEL_ART_BENCHMARK'] !== '1',
  'Opt-in production benchmark; see docs/benchmarks/schedule-each-pixel-art.md.',
);

test('measures Pixel Art sync/frame rendering', async ({ page }) => {
  test.setTimeout(120_000);

  for (const cells of cases) {
    for (const strategy of strategies) {
      await page.addInitScript(
        ({ cells: expectedCells }) => {
          const state = {
            startedAt: performance.now(),
            firstCellAt: undefined as number | undefined,
            completeAt: undefined as number | undefined,
            animationFrameCallbacks: 0,
            paintAfterStart: undefined as number | undefined,
            longTaskDuration: 0,
          };

          const observeGrid = () => {
            const count = document.querySelectorAll('.pixel-cell').length;
            const current = performance.now();
            if (count > 0 && state.firstCellAt === undefined) {
              state.firstCellAt = current;
            }
            if (count >= expectedCells && state.completeAt === undefined) {
              state.completeAt = current;
            }
          };
          new MutationObserver(observeGrid).observe(document, {
            childList: true,
            subtree: true,
          });

          const originalRequestAnimationFrame =
            globalThis.requestAnimationFrame;
          if (typeof originalRequestAnimationFrame === 'function') {
            globalThis.requestAnimationFrame = (callback) =>
              originalRequestAnimationFrame((time) => {
                state.animationFrameCallbacks += 1;
                if (state.paintAfterStart === undefined) {
                  state.paintAfterStart = performance.now();
                }
                callback(time);
              });
          }

          if ('PerformanceObserver' in globalThis) {
            try {
              new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                  state.longTaskDuration += entry.duration;
                }
              }).observe({ type: 'longtask', buffered: true });
            } catch {
              // Long-task entries are not available in every browser engine.
            }
          }

          Object.defineProperty(globalThis, '__pixelArtBenchmark', {
            configurable: true,
            value: state,
          });
        },
        { cells },
      );

      await page.goto(`/pixel-art?cells=${cells}&schedule=${strategy}`);
      await page
        .locator('.pixel-cell')
        .nth(cells - 1)
        .waitFor({
          state: 'attached',
          timeout: 60_000,
        });

      const result = await page.evaluate((expectedCells) => {
        const state = (
          globalThis as typeof globalThis & {
            __pixelArtBenchmark: {
              startedAt: number;
              firstCellAt?: number;
              completeAt?: number;
              animationFrameCallbacks: number;
              paintAfterStart?: number;
              longTaskDuration: number;
            };
          }
        ).__pixelArtBenchmark;
        const now = performance.now();
        return {
          cells: expectedCells,
          firstCellMs: (state.firstCellAt ?? now) - state.startedAt,
          completeGridMs: (state.completeAt ?? now) - state.startedAt,
          longTaskDurationMs: state.longTaskDuration,
          animationFrameCallbacks: state.animationFrameCallbacks,
          firstPaintMs: (state.paintAfterStart ?? now) - state.startedAt,
        };
      }, cells);

      console.log(JSON.stringify({ strategy, ...result }));
    }
  }
});
