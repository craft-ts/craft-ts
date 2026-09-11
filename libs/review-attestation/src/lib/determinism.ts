/**
 * Making a render repeat itself, exactly.
 *
 * Determinism is not hygiene here, it is load-bearing, and it carries two
 * independent mechanisms:
 *
 * - **the automatic carry-forward** reads "the code moved, the output did
 *   not". A render that wobbles never produces the same output twice, the
 *   queue fills with nothing, and people start stamping.
 * - **the bisection** in `transitions.ts` reads a discrete signature as a
 *   monotone function of one parameter. A wobble manufactures phantom
 *   transitions, and the margin report starts lying in the dangerous
 *   direction.
 *
 * So this ships *before* anything visual uses the register, never after.
 *
 * The page is described structurally rather than imported from Playwright, for
 * the same reason as `drivers.ts`: the package stays usable from a plain
 * browser harness, and a Playwright `Page` matches the shape unchanged.
 */

export interface DeterministicPage {
  addInitScript(script: string | ((argument: unknown) => unknown), argument?: unknown): Promise<unknown>;
  emulateMedia(options: Readonly<Record<string, string>>): Promise<unknown>;
  route?(
    pattern: string,
    handler: (route: { abort(): Promise<unknown> }) => unknown,
  ): Promise<unknown>;
  evaluate<Argument>(
    body: (argument: Argument) => unknown,
    argument: Argument,
  ): Promise<unknown>;
}

export interface DeterminismOptions {
  /** Frozen wall clock, in epoch milliseconds. */
  readonly now?: number;
  /** Seed for the replacement `Math.random`. */
  readonly seed?: number;
  /**
   * Requests to let through. Everything else is refused.
   *
   * Refusing by default rather than allowing by default: a request that
   * escapes makes a render depend on somebody else's uptime, and the failure
   * shows up as a flaky diff months later rather than as a refused request now.
   */
  readonly allowRequests?: readonly string[];
  /** Fonts embedded as data URIs, so nothing is fetched and nothing swaps. */
  readonly fontFaces?: readonly string[];
  /** Kept for the record: a capture is only comparable within one browser. */
  readonly browser?: { readonly name: string; readonly version: string };
}

export const FROZEN_NOW = Date.UTC(2026, 0, 1, 12, 0, 0);

/**
 * CSS that removes every source of motion from the page.
 *
 * `animation: none` alone is not enough — a transition mid-flight, a caret
 * blinking, and smooth scrolling each produce a capture that differs from the
 * one before it by a few pixels, which is exactly the amount that is hardest
 * to attribute to anything.
 */
export const STILLNESS_CSS = `
*, *::before, *::after {
  animation-delay: -1ms !important;
  animation-duration: 1ms !important;
  animation-iteration-count: 1 !important;
  transition-delay: 0s !important;
  transition-duration: 0s !important;
  caret-color: transparent !important;
  scroll-behavior: auto !important;
}
html { -webkit-font-smoothing: antialiased; text-rendering: geometricPrecision; }
`;

/**
 * The script installed before any page code runs.
 *
 * Built as a string rather than a function reference: it has to run in the
 * page's world before the first script tag, and a closure over anything in
 * this module would not survive the crossing.
 */
export function determinismScript(options: DeterminismOptions = {}): string {
  const now = options.now ?? FROZEN_NOW;
  const seed = options.seed ?? 0x2f6e2b1;
  const fonts = (options.fontFaces ?? []).join('\n');
  return `(() => {
  const FROZEN = ${now};
  // A frozen clock, not a slowed one: a duration read twice must give the same
  // answer, or a component that renders "3 seconds ago" is a coin flip.
  const RealDate = Date;
  class FrozenDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(FROZEN);
      else super(...args);
    }
    static now() { return FROZEN; }
  }
  globalThis.Date = FrozenDate;
  globalThis.performance.now = () => 0;

  // xorshift32: small, seeded, and identical across engines. Math.random is
  // not seedable, and a per-engine PRNG would make two browsers disagree for
  // reasons that have nothing to do with the layout.
  let state = ${seed} >>> 0;
  Math.random = () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5;  state >>>= 0;
    return state / 0x100000000;
  };

  const style = document.createElement('style');
  style.textContent = ${JSON.stringify(STILLNESS_CSS)} + ${JSON.stringify(fonts)};
  const install = () => document.head?.appendChild(style);
  if (document.head) install();
  else document.addEventListener('DOMContentLoaded', install);
})();`;
}

export interface DeterminismRecord {
  readonly now: number;
  readonly seed: number;
  readonly browser?: { readonly name: string; readonly version: string };
  readonly blockedRequests: boolean;
  readonly embeddedFonts: number;
}

/**
 * Pins everything that could make two identical renders differ.
 *
 * Returns what it pinned, so the record can travel with the evidence: a digest
 * compared across two browser versions is not a comparison, and the only way
 * to notice is to have written the version down.
 */
export async function makeDeterministic(
  page: DeterministicPage,
  options: DeterminismOptions = {},
): Promise<DeterminismRecord> {
  await page.addInitScript(determinismScript(options));
  await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'none' });

  const allowed = options.allowRequests ?? [];
  if (page.route) {
    await page.route('**/*', (route) => route.abort());
    for (const pattern of allowed) {
      // Allowing is expressed as "stop intercepting this", so an allowed
      // pattern is visible in the record rather than hidden in a handler.
      await page.route?.(pattern, () => undefined);
    }
  }

  return {
    now: options.now ?? FROZEN_NOW,
    seed: options.seed ?? 0x2f6e2b1,
    ...(options.browser ? { browser: options.browser } : {}),
    blockedRequests: Boolean(page.route),
    embeddedFonts: options.fontFaces?.length ?? 0,
  };
}

export interface DeterminismReport {
  readonly runs: number;
  readonly distinct: number;
  readonly stable: boolean;
  /** The first run whose result differed, and what it produced. */
  readonly firstDivergence?: { readonly run: number; readonly value: string };
}

/**
 * Runs the same capture N times and reports whether it ever moved.
 *
 * The gate for the whole visual half of the plan: until a hundred consecutive
 * renders of one scenario produce a hundred identical digests, neither the
 * carry-forward nor the bisection means anything, and building on top of them
 * is building on sand.
 */
export async function measureDeterminism(
  capture: () => Promise<string> | string,
  runs = 100,
): Promise<DeterminismReport> {
  const seen = new Set<string>();
  let first: string | undefined;
  let firstDivergence: { run: number; value: string } | undefined;

  for (let run = 0; run < runs; run += 1) {
    const value = await capture();
    seen.add(value);
    if (first === undefined) first = value;
    else if (value !== first && !firstDivergence) {
      firstDivergence = { run, value };
    }
  }

  return {
    runs,
    distinct: seen.size,
    stable: seen.size <= 1,
    ...(firstDivergence ? { firstDivergence } : {}),
  };
}

/** Fails with the run number, because "flaky" is not an actionable report. */
export async function assertDeterministic(
  capture: () => Promise<string> | string,
  runs = 100,
): Promise<void> {
  const report = await measureDeterminism(capture, runs);
  if (report.stable) return;
  throw new Error(
    [
      `assertDeterministic: ${report.runs} renders produced ${report.distinct} different results.`,
      report.firstDivergence
        ? `  Run ${report.firstDivergence.run} was the first to differ.`
        : '',
      '  Nothing downstream works until this is one: a wobbling render fills the review queue with',
      '  changes nobody made, and manufactures transitions the bisection then reports as real.',
    ]
      .filter(Boolean)
      .join('\n'),
  );
}
