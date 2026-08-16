import {
  signal,
} from './host/craft-compat';
import { TestBed } from './host/craft-test-bed';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { Equal, Expect } from 'test-type';
import { isCraftLoadingFeature } from './craft-pending';
import {
  CRAFT_START_VIEW_TRANSITION,
  CRAFT_VIEW_TRANSITION,
  CRAFT_VIEW_TRANSITION_SKIP_BLANK,
  CRAFT_VIEW_TRANSITIONS_ENABLED,
  injectCraftViewTransition,
  viewTransitionPayload,
  withCraftViewTransitions,
  type CraftViewTransitionInput,
  type ViewTransitionPayloadDef,
} from './craft-view-transition';

describe('withCraftViewTransitions', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('is a craft loading feature enabling the outlet-driven transition', () => {
    const feature = withCraftViewTransitions();
    expect(isCraftLoadingFeature(feature)).toBe(true);

    TestBed.configureTestingModule({ providers: feature.providers });
    expect(TestBed.inject(CRAFT_VIEW_TRANSITIONS_ENABLED)).toBe(true);
    expect(TestBed.inject(CRAFT_VIEW_TRANSITION_SKIP_BLANK)).toBe(false);
  });

  it('forwards the skipBlank option', () => {
    const feature = withCraftViewTransitions({ skipBlank: true });
    TestBed.configureTestingModule({ providers: feature.providers });
    expect(TestBed.inject(CRAFT_VIEW_TRANSITION_SKIP_BLANK)).toBe(true);
  });

  it('defaults the enabled token to false without the feature', () => {
    TestBed.configureTestingModule({ providers: [] });
    expect(TestBed.inject(CRAFT_VIEW_TRANSITIONS_ENABLED)).toBe(false);
  });
});

describe('viewTransitionPayload', () => {
  it('returns a marker carrying the declared payload type at the type level', () => {
    const marker = viewTransitionPayload<{
      name: string;
      image: string | null;
    }>();

    // Runtime is an opaque marker; the shape lives purely in the type.
    expect(typeof marker).toBe('object');

    type _DeclaredShape = Expect<
      Equal<
        typeof marker,
        ViewTransitionPayloadDef<{ name: string; image: string | null }>
      >
    >;
  });
});

describe('injectCraftViewTransition', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('reads the payload published on CRAFT_VIEW_TRANSITION', () => {
    const sink = signal<CraftViewTransitionInput>(null);
    TestBed.configureTestingModule({
      providers: [{ provide: CRAFT_VIEW_TRANSITION, useValue: sink }],
    });

    const payload = TestBed.runInInjectionContext(() =>
      injectCraftViewTransition(),
    );

    expect(payload()).toBeNull();
    sink.set({ name: 'photo-aurora', image: 'data:img' });
    expect(payload()).toEqual({ name: 'photo-aurora', image: 'data:img' });
  });
});

describe('CRAFT_START_VIEW_TRANSITION (default seam)', () => {
  const originalMatchMedia = window.matchMedia;
  let docWithVt: { startViewTransition?: (cb: () => void) => unknown };

  beforeEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
    docWithVt = document as unknown as typeof docWithVt;
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    delete docWithVt.startViewTransition;
  });

  function start(): (cb: () => void) => void {
    TestBed.configureTestingModule({ providers: [] });
    return TestBed.inject(CRAFT_START_VIEW_TRANSITION);
  }

  it('wraps document.startViewTransition when available and motion is allowed', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as never;
    const startViewTransition = vi.fn((cb: () => void) => cb());
    docWithVt.startViewTransition = startViewTransition;

    const cb = vi.fn();
    start()(cb);

    expect(startViewTransition).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('runs cb directly when the API is missing', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as never;
    delete docWithVt.startViewTransition;

    const cb = vi.fn();
    start()(cb);

    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('runs cb directly (no view transition) under prefers-reduced-motion', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as never;
    const startViewTransition = vi.fn((cb: () => void) => cb());
    docWithVt.startViewTransition = startViewTransition;

    const cb = vi.fn();
    start()(cb);

    expect(startViewTransition).not.toHaveBeenCalled();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('falls back when the browser does not invoke the update callback', async () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as never;
    const skipTransition = vi.fn();
    const startViewTransition = vi.fn((_cb: () => void) => ({
      skipTransition,
    }));
    docWithVt.startViewTransition = startViewTransition;

    const cb = vi.fn();
    start()(cb);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(startViewTransition).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(skipTransition).toHaveBeenCalledTimes(1);
  });
});
