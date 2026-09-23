import { afterEach, describe, expect, it, vi } from 'vitest';

async function fresh() {
  vi.resetModules();
  return import('./ai-performance');
}

afterEach(() => vi.unstubAllGlobals());

describe('AI performance diagnostics', () => {
  it('bounds history and records failed work without swallowing errors', async () => {
    const api = await fresh();
    const failure = new Error('private data');
    expect(() =>
      api.measureAi('dom.page', () => {
        throw failure;
      }),
    ).toThrow(failure);
    expect(api.aiPerformanceSection()).toContain('"status": "error"');
    expect(api.aiPerformanceSection()).not.toContain('private data');
    for (let i = 0; i < 200; i++) api.measureAi('prompt.render', () => i);
    const section = api.aiPerformanceSection();
    const data = JSON.parse(section.split('```json\n')[1].split('\n```')[0]);
    expect(data.measurements).toHaveLength(120);
  });

  it('records clipboard completion for the next export without recording content', async () => {
    const api = await fresh();
    let resolve!: () => void;
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: vi.fn(
          () =>
            new Promise<void>((r) => {
              resolve = r;
            }),
        ),
      },
    });
    const pending = api.writeAiClipboard('private instruction');
    expect(api.aiPerformanceSection()).toContain('"status": "started"');
    resolve();
    await pending;
    expect(api.aiPerformanceSection()).toContain('"status": "ok"');
    expect(api.aiPerformanceSection()).not.toContain('private instruction');
  });

  it('keeps observing across controllers and disconnects exactly once', async () => {
    const disconnect = vi.fn();
    const observe = vi.fn();
    let callback!: (list: { getEntries(): unknown[] }) => void;
    vi.stubGlobal(
      'PerformanceObserver',
      class {
        static supportedEntryTypes = ['longtask'];
        constructor(cb: typeof callback) {
          callback = cb;
        }
        observe = observe;
        disconnect = disconnect;
      },
    );
    const api = await fresh();
    const first = api.observeAiPerformance();
    const second = api.observeAiPerformance();
    first();
    first();
    expect(disconnect).not.toHaveBeenCalled();
    callback({ getEntries: () => [{ startTime: 10, duration: 250 }] });
    expect(api.aiPerformanceSection()).toContain('browser.longtask');
    second();
    expect(observe).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('records craft measures next to long tasks and ignores foreign ones', async () => {
    let callback!: (list: { getEntries(): unknown[] }) => void;
    const observe = vi.fn();
    vi.stubGlobal(
      'PerformanceObserver',
      class {
        static supportedEntryTypes = ['longtask', 'measure'];
        constructor(cb: typeof callback) {
          callback = cb;
        }
        observe = observe;
        disconnect = vi.fn();
      },
    );
    const api = await fresh();
    const stop = api.observeAiPerformance();
    expect(observe).toHaveBeenCalledWith({
      entryTypes: ['longtask', 'measure'],
    });
    callback({
      getEntries: () => [
        { entryType: 'longtask', name: 'self', startTime: 1, duration: 32000 },
        {
          entryType: 'measure',
          name: 'craft:send-context.trim primitive removed=423',
          startTime: 1,
          duration: 31900,
        },
        { entryType: 'measure', name: 'app:other', startTime: 2, duration: 5 },
      ],
    });
    const section = api.aiPerformanceSection();
    expect(section).toContain('browser.longtask');
    expect(section).toContain('craft:send-context.trim primitive removed=423');
    expect(section).not.toContain('app:other');
    stop();
  });
});
