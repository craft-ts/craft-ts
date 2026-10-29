import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_THUMBNAIL_PARAMS } from './thumbnail-service';
import { createPlaywrightCapturer } from './playwright-capturer';

describe('Playwright thumbnail capture', () => {
  it('captures a reached point while normal playback continues', async () => {
    let worker = {
      ready: true,
      failed: undefined,
      state: 'ready',
      replayIndex: 0,
      total: 1,
      seeking: false,
      difference: false,
      scale: 1,
      activeParticipantId: 'participant-1',
      viewport: undefined,
    };
    const points = [
      { replayIndex: 0, reasons: ['start'], offsetMs: 0 },
      { replayIndex: 1, reasons: ['interaction'], offsetMs: 100 },
    ];
    const statesAtScreenshot: string[] = [];
    const settleWindows: number[] = [];
    let encodedFrame = 0;

    const frameLocator = {
      waitFor: vi.fn(),
      isVisible: vi.fn(async () => true),
      screenshot: vi.fn(async () => {
        statesAtScreenshot.push(worker.state);
        return Buffer.from('png');
      }),
      elementHandle: vi.fn(async () => ({
        contentFrame: async () => ({
          url: () => 'http://localhost:4200/',
          evaluate: async (_fn: unknown, arg: { quiet: number }) => {
            settleWindows.push(arg.quiet);
          },
        }),
      })),
    };
    const page = {
      goto: vi.fn(async () => undefined),
      waitForFunction: vi.fn(async () => undefined),
      setViewportSize: vi.fn(async () => undefined),
      locator: vi.fn(() => frameLocator),
      evaluate: vi.fn(async (_fn: unknown, arg?: unknown) => {
        if (typeof arg === 'number') {
          worker = { ...worker, state: 'playing', replayIndex: arg };
          return undefined;
        }
        if (
          typeof arg === 'object' &&
          arg !== null &&
          'maxPoints' in arg
        )
          return points;
        return worker;
      }),
    };
    const encoderPage = {
      evaluate: vi.fn(async () => {
        encodedFrame += 1;
        return {
          base64: Buffer.from(`webp-${encodedFrame}`).toString('base64'),
          width: 480,
          height: 1,
          signature: Array.from({ length: 24 * 24 }, () => encodedFrame * 10),
        };
      }),
    };
    const browser = {
      version: () => 'test-browser',
      newContext: async () => ({
        newPage: vi
          .fn()
          .mockResolvedValueOnce(page)
          .mockResolvedValueOnce(encoderPage),
      }),
      close: vi.fn(async () => undefined),
    };
    const capture = createPlaywrightCapturer({
      dashboardUrl: 'http://localhost:4210/',
      loadPlaywright: async () => ({
        chromium: { launch: async () => browser },
      }),
      stallTimeoutMs: 10,
    });
    const frames: number[] = [];

    await capture(
      {
        sessionId: 'c598c4d7-7eef-4e63-b23a-f5dca4dca91f',
        params: { ...DEFAULT_THUMBNAIL_PARAMS, maxWaitMs: 100 },
        signal: new AbortController().signal,
      },
      {
        planned: vi.fn(),
        frame: (frame) => frames.push(frame.replayIndex),
        skipped: vi.fn(),
        browser: vi.fn(),
      },
    );

    expect(statesAtScreenshot).toEqual(['ready', 'playing']);
    expect(settleWindows).toEqual([400, 80]);
    expect(frames).toEqual([0, 1]);
  });
});
