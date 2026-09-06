/**
 * Is the replay the thing that was measured?
 *
 * The snapshot is only worth showing if what it renders is what was attested.
 * A missing font, a media query left to re-evaluate, a stylesheet that could
 * be neither read nor fetched — each of those produces a document that looks
 * plausible and measures differently, and a reviewer would judge it without
 * ever knowing.
 *
 * So the replay is **checked, not trusted**: re-measure it with the same
 * collector and compare against the digest the ledger holds. That turns every
 * fidelity worry into an assertion, and it reuses the code that produced the
 * evidence in the first place rather than a second opinion about it.
 *
 * It is the same discipline the plan imposes on a `visualSeam`: verify by
 * rendering, not by reading the CSS and believing it.
 */
import { digestDelta, formatDelta, type LayoutDigest } from './digest.js';

export interface ReplayFidelity {
  readonly faithful: boolean;
  /** Nodes present in one and not the other. */
  readonly missing: readonly string[];
  readonly unexpected: readonly string[];
  /** Same node, different measurement. */
  readonly moved: readonly string[];
  /** What to show a reviewer, in the order they would read it. */
  readonly report: readonly string[];
}

export interface FidelityOptions {
  /**
   * Half-pixel differences to forgive, per box edge.
   *
   * Zero by default. A tolerance here is a tolerance on the only question that
   * matters — "is this the render that was judged" — so it has to be asked for
   * out loud rather than granted quietly.
   */
  readonly tolerance?: number;
}

/**
 * Compares a digest measured from the replay against the attested one.
 *
 * The attested digest is the second argument on purpose: the replay is what is
 * on trial, so it reads as "does the replay still say what the evidence said".
 */
export function replayFidelity(
  replayed: LayoutDigest,
  attested: LayoutDigest,
  options: FidelityOptions = {},
): ReplayFidelity {
  const tolerance = options.tolerance ?? 0;
  const inReplay = new Set(replayed.nodes.map((node) => node.path));
  const inAttested = new Set(attested.nodes.map((node) => node.path));

  const missing = [...inAttested].filter((path) => !inReplay.has(path)).sort();
  const unexpected = [...inReplay].filter((path) => !inAttested.has(path)).sort();

  const deltas = digestDelta(attested, replayed).filter((delta) => {
    if (!inReplay.has(delta.path) || !inAttested.has(delta.path)) return false;
    if (tolerance === 0) return true;
    const before = Number(delta.before);
    const after = Number(delta.after);
    if (Number.isNaN(before) || Number.isNaN(after)) return true;
    return Math.abs(after - before) > tolerance;
  });
  const moved = [...new Set(deltas.map((delta) => delta.path))].sort();

  const report: string[] = [];
  if (missing.length > 0) {
    report.push(
      `${missing.length} attested node(s) are absent from the replay — a stylesheet or a script-built element did not survive.`,
      ...missing.slice(0, 5).map((path) => `  ${path}`),
    );
  }
  if (unexpected.length > 0) {
    report.push(
      `${unexpected.length} node(s) appear in the replay and not in the evidence.`,
      ...unexpected.slice(0, 5).map((path) => `  ${path}`),
    );
  }
  if (moved.length > 0) {
    report.push(
      `${moved.length} node(s) measure differently in the replay:`,
      ...deltas.slice(0, 8).map((delta) => `  ${formatDelta(delta)}`),
    );
  }

  return {
    faithful: missing.length === 0 && unexpected.length === 0 && moved.length === 0,
    missing,
    unexpected,
    moved,
    report,
  };
}

/**
 * Fails when the replay is not the render that was attested.
 *
 * For a suite. A review surface should *show* the divergence and fall back to
 * the screenshot rather than throw — a card that refuses to display anything
 * is a card that gets approved blind.
 */
export function assertReplayFaithful(
  replayed: LayoutDigest,
  attested: LayoutDigest,
  options: FidelityOptions & { readonly subject?: string } = {},
): void {
  const fidelity = replayFidelity(replayed, attested, options);
  if (fidelity.faithful) return;
  throw new Error(
    [
      `assertReplayFaithful: the replay${options.subject ? ` of '${options.subject}'` : ''} is not the render that was measured.`,
      ...fidelity.report,
      '  Judging it would record a verdict about a document nobody attested.',
    ].join('\n'),
  );
}
