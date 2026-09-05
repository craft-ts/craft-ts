/**
 * `craft-ts attest` — the register, from a terminal.
 *
 * Six verbs, and the two that justify the rest:
 *
 * - **`why`** names the graph nodes that moved inside a subject's slice. A
 *   review that cannot answer "why am I being asked this?" gets rubber-stamped
 *   within a week, and this is also the best debugger the mechanism has.
 * - **`unwatched`** lists what moved that no attested subject covers. "What
 *   changed while nobody was looking." It falls out of the machinery for free
 *   and nothing else in the repository reports it.
 *
 * The graph half is loaded lazily. `@craft-ts/cli` ships without a
 * typechecker; a user who only deploys should not pay for ts-morph, and a user
 * who attests gets a sentence telling them what to install rather than a
 * module-not-found stack.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  applyRenewals,
  canonicalJson,
  createEvidenceStore,
  evidenceHash,
  observeTests,
  parseLedger,
  parseVitestReport,
  reportOn,
  serialiseLedger,
  withAttestations,
  type Attestation,
  type Ledger,
  type SubjectObservation,
  type Verdict,
} from '@craft-ts/attest';
import { parseArguments } from '../args.js';
import type { CraftCliIo } from '../io.js';

const SPEC = {
  values: [
    'ledger',
    'evidence',
    'report',
    'before',
    'after',
    'tsconfig',
    'root',
    'subject',
    'verdict',
    'note',
    'by',
    'port',
  ],
  flags: ['all', 'json', 'help', 'apply'],
} as const;

export const ATTEST_HELP = `craft-ts attest — a human judgement, recorded so it survives a refactor

Usage: craft-ts attest <verb> [options]

Verbs:
  status               What is current, carried, queued for review, or missing
  diff                 Compare two runs and name the five categories
  why <subject>        Which nodes of the subject's slice moved, and when a
                       person last actually looked at it
  renew                Record a verdict; --all marks the attestations as bulk
  review               Open the local review surface
  unwatched            Nodes that moved and belong to no attested subject

Options:
  --ledger <path>      Ledger file (default: .craft/attestations.jsonl)
  --evidence <dir>     Evidence store (default: .craft/evidence)
  --report <path>      Test runner report, JSON (vitest --reporter=json)
  --before/--after     Two such reports, for \`diff\`
  --tsconfig <path>    Project the code graph is built from
  --root <dir>         Repository root (default: the working directory)
  --subject <id>       Subject to act on
  --verdict <v>        ok | ok-with-note | rejected | known-issue | blocked
  --note <text>        Recorded with the verdict
  --by <name>          Who is judging (default: $USER)
  --all                Renew every reviewable subject, marked as bulk
  --json               Emit a machine-readable report

An attestation never says "validated". It says "validated, under these
assumptions" — and a changed assumption sends the subject back to review.`;

const DEFAULT_LEDGER = '.craft/attestations.jsonl';
const DEFAULT_EVIDENCE = '.craft/evidence';
const BASELINE = 'graph-baseline';

/**
 * Where a subject's slice manifest is stored.
 *
 * Keyed on the subject *and* the fingerprint, not on the fingerprint alone.
 * Two subjects that share a fingerprint share it because their slices are
 * identical — but the store must not depend on every caller honouring that, and
 * the failure if one does not is `why` quietly describing the wrong subject.
 */
const sliceKey = (subject: string, fingerprint: string): string =>
  `${fingerprint}.${evidenceHash(subject).slice(0, 8)}`;
const TOOL_VERSION = '0.8.3';

export interface AttestDependencies {
  /**
   * Loads the code-graph half.
   *
   * Injected so the command is testable without building a TypeScript program,
   * and lazy so `@craft-ts/cli` does not drag ts-morph behind it.
   */
  readonly loadSlices?: (options: {
    readonly rootDir: string;
    readonly tsConfigFilePath: string;
  }) => Promise<WorkspaceSlices>;
  readonly now?: () => string;
  readonly user?: () => string;
}

export interface WorkspaceSlices {
  fingerprintFor(file: string, fullName: string): string;
  leavesFor(file: string, fullName: string): Readonly<Record<string, string>>;
  /** `nodeId → hash` for every node in the graph. */
  nodeHashes(): Readonly<Record<string, string>>;
}

const defaultLoadSlices = async (options: {
  rootDir: string;
  tsConfigFilePath: string;
}): Promise<WorkspaceSlices> => {
  let module: typeof import('@craft-ts/dev-tools/scripts/test-slice.js');
  try {
    module = await import('@craft-ts/dev-tools/scripts/test-slice.js');
  } catch {
    throw new Error(
      "craft-ts attest: the code graph comes from '@craft-ts/dev-tools', which is not installed. Add it as a dev dependency, or pass a report-only verb.",
    );
  }
  const index = module.createTestSliceIndex({
    rootDir: options.rootDir,
    tsConfigFilePath: options.tsConfigFilePath,
  });
  const rootPrefix = `${resolve(options.rootDir)}/`;
  return {
    fingerprintFor: (file, fullName) => index.fingerprintFor(file, fullName),
    leavesFor: (file, fullName) => index.leavesFor(file, fullName),
    nodeHashes: () =>
      Object.fromEntries(
        [...index.slices.hashes].map(([id, hash]) => [
          id.split(rootPrefix).join(''),
          hash,
        ]),
      ),
  };
};

export async function runAttestCommand(
  argv: readonly string[],
  io: CraftCliIo,
  dependencies: AttestDependencies = {},
): Promise<number> {
  const parsed = parseArguments(argv, SPEC);
  if (parsed.flags.has('help') || parsed.command === null) {
    io.write(ATTEST_HELP);
    return parsed.command === null ? 1 : 0;
  }
  if (parsed.unknown.length > 0) {
    io.writeError(`Unknown option(s): ${parsed.unknown.join(', ')}`);
    io.writeError(ATTEST_HELP);
    return 1;
  }

  const rootDir = resolve(io.cwd, parsed.values['root'] ?? '.');
  const ledgerPath = resolve(rootDir, parsed.values['ledger'] ?? DEFAULT_LEDGER);
  const store = createEvidenceStore(
    resolve(rootDir, parsed.values['evidence'] ?? DEFAULT_EVIDENCE),
  );
  const ledger = await readLedger(io, ledgerPath);
  const json = parsed.flags.has('json');
  const loadSlices = dependencies.loadSlices ?? defaultLoadSlices;
  const now = dependencies.now ?? (() => new Date().toISOString());
  const user = dependencies.user ?? (() => process.env['USER'] ?? 'unknown');

  const slices = async () =>
    await loadSlices({
      rootDir,
      tsConfigFilePath: parsed.values['tsconfig'] ?? 'tsconfig.json',
    });

  const observations = async (): Promise<{
    readonly list: readonly SubjectObservation[];
    readonly workspace: WorkspaceSlices;
    readonly leaves: ReadonlyMap<string, Readonly<Record<string, string>>>;
  }> => {
    const reportPath = parsed.values['report'];
    if (!reportPath) {
      throw new Error(
        'craft-ts attest: no run to look at. Point --report at a test runner report (vitest --reporter=json --outputFile=…).',
      );
    }
    const workspace = await slices();
    const run = parseVitestReport(
      JSON.parse(await readFile(resolve(rootDir, reportPath), 'utf8')),
      { rootDir },
    );
    const leaves = new Map<string, Readonly<Record<string, string>>>();
    const list = observeTests(run, (testCase) => {
      const subject = `test:${testCase.file}#${testCase.fullName}`;
      leaves.set(subject, workspace.leavesFor(testCase.file, testCase.fullName));
      return workspace.fingerprintFor(testCase.file, testCase.fullName);
    });
    return { list, workspace, leaves };
  };

  try {
    switch (parsed.command) {
      case 'status':
        return await status(io, json, ledger, await observations());
      case 'diff':
        return await diff(io, json, parsed.values, rootDir, await slices());
      case 'why':
        return await why(io, ledger, store, parsed, await observations());
      case 'renew':
        return await renew(
          io,
          ledger,
          store,
          ledgerPath,
          parsed,
          await observations(),
          { now, user },
        );
      case 'unwatched':
        return await unwatched(io, json, store, await slices());
      case 'review':
        return await review(io, parsed.values['port']);
      default:
        io.writeError(`Unknown verb: ${parsed.command}`);
        io.writeError(ATTEST_HELP);
        return 1;
    }
  } catch (error) {
    io.writeError(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

async function readLedger(io: CraftCliIo, path: string): Promise<Ledger> {
  let contents: string;
  try {
    contents = await readFile(path, 'utf8');
  } catch {
    return new Map();
  }
  const parsed = parseLedger(contents);
  for (const rejected of parsed.rejected) {
    // Reported, not thrown on: a bad merge must not make the register
    // unreadable, because the recovery for that is "re-attest everything".
    io.writeError(
      `${path}:${rejected.line}: ignored, ${rejected.reason}. Fix the line or drop it; the subject will show as missing.`,
    );
  }
  return parsed.ledger;
}

async function writeLedgerFile(path: string, ledger: Ledger): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, serialiseLedger(ledger), 'utf8');
}

async function status(
  io: CraftCliIo,
  json: boolean,
  ledger: Ledger,
  observed: { readonly list: readonly SubjectObservation[] },
): Promise<number> {
  const report = reportOn(ledger, observed.list, { toolVersion: TOOL_VERSION });
  if (json) {
    io.write(JSON.stringify(report, null, 2));
    return report.counts.review + report.counts.missing === 0 ? 0 : 1;
  }

  io.write(
    `current ${report.counts.current}  renewed ${report.counts.renewed}  review ${report.counts.review}  missing ${report.counts.missing}`,
  );
  if (report.counts.renewed > 0) {
    io.write(
      `  ${report.counts.renewed} carried forward: the code moved, the output did not.`,
    );
  }
  for (const entry of report.statuses) {
    if (entry.state === 'review' || entry.state === 'missing') {
      io.write(`  ${entry.state.padEnd(8)} ${entry.subject}${entry.reason ? ` — ${entry.reason}` : ''}`);
    }
  }
  for (const subject of report.orphaned) {
    io.write(`  orphaned ${subject} — nothing produces this any more`);
  }
  if (report.bulk > 0) {
    // Visible on purpose. A bulk renewal that leaves no trace turns the
    // register into a rubber stamp.
    io.write(
      `  ${report.bulk} of these rest on a bulk renewal, not on somebody looking.`,
    );
  }
  return report.counts.review + report.counts.missing === 0 ? 0 : 1;
}

async function diff(
  io: CraftCliIo,
  json: boolean,
  values: Readonly<Record<string, string>>,
  rootDir: string,
  workspace: WorkspaceSlices,
): Promise<number> {
  const before = values['before'];
  const after = values['after'];
  if (!before || !after) {
    io.writeError('craft-ts attest diff: --before and --after are both required.');
    return 1;
  }
  const read = async (path: string) =>
    parseVitestReport(JSON.parse(await readFile(resolve(rootDir, path), 'utf8')), {
      rootDir,
    });

  const { diffTestRuns, testSubjectId } = await import('@craft-ts/attest');
  const [left, right] = [await read(before), await read(after)];
  const fingerprints = (run: Awaited<ReturnType<typeof read>>) =>
    Object.fromEntries(
      run.cases.map((testCase) => [
        testSubjectId(testCase),
        workspace.fingerprintFor(testCase.file, testCase.fullName),
      ]),
    );

  // Both runs are fingerprinted against the *current* tree, which is the only
  // tree the tool can see. What that measures is "these two runs disagree, and
  // the code under them is not the code either of them ran against" — so a
  // pre-merge diff is honest and a post-merge one is not.
  const report = diffTestRuns(left, right, {
    before: fingerprints(left),
    after: fingerprints(right),
  });

  if (json) {
    io.write(JSON.stringify(report, null, 2));
    return report.red.length === 0 ? 0 : 1;
  }
  const section = (name: string, subjects: readonly string[], note?: string) => {
    if (subjects.length === 0) return;
    io.write(`${name} (${subjects.length})${note ? ` — ${note}` : ''}`);
    for (const subject of subjects) io.write(`  ${subject}`);
  };
  section('added', report.added);
  section('removed', report.removed);
  section('changed', report.changed);
  section('red', report.red);
  section(
    'green over moved code',
    report.greenOverMovedCode,
    'still passing, but no longer exercising what it exercised',
  );
  return report.red.length === 0 ? 0 : 1;
}

async function why(
  io: CraftCliIo,
  ledger: Ledger,
  store: ReturnType<typeof createEvidenceStore>,
  parsed: ReturnType<typeof parseArguments>,
  observed: {
    readonly list: readonly SubjectObservation[];
    readonly leaves: ReadonlyMap<string, Readonly<Record<string, string>>>;
  },
): Promise<number> {
  const subject =
    parsed.values['subject'] ??
    parsed.unknown.at(0) ??
    argumentAfter(parsed, 'why');
  if (!subject) {
    io.writeError('craft-ts attest why: name a subject.');
    return 1;
  }
  const attestation = ledger.get(subject);
  if (!attestation) {
    io.write(`${subject}\n  never attested.`);
    return 1;
  }

  const origin = attestation.carriedFrom ?? attestation.fingerprint;
  io.write(subject);
  io.write(
    `  judged '${attestation.verdict}' by ${attestation.by} on ${attestation.at}${attestation.bulk ? ' (bulk renewal)' : ''}`,
  );
  if (attestation.carriedFrom) {
    io.write(
      `  carried forward since ${origin}: the code moved, the output did not.`,
    );
  }
  for (const assumption of attestation.assumptions) {
    io.write(`  assuming ${JSON.stringify(assumption)}`);
  }

  const recorded = await store.getText(
    sliceKey(subject, attestation.fingerprint),
    '.slice.json',
  );
  const current = observed.leaves.get(subject);
  if (!recorded || !current) {
    io.write(
      '  no slice manifest for that fingerprint: run `attest renew` once to record one.',
    );
    return 0;
  }

  const { sliceChange } = await import('@craft-ts/dev-tools/scripts/code-slice.js');
  const change = sliceChange(
    JSON.parse(recorded) as Record<string, string>,
    current,
  );
  const list = (name: string, nodes: readonly string[]) => {
    if (nodes.length === 0) return;
    io.write(`  ${name} (${nodes.length}):`);
    for (const node of nodes.slice(0, 20)) io.write(`    ${node}`);
    if (nodes.length > 20) io.write(`    … and ${nodes.length - 20} more`);
  };
  list('moved', change.changed);
  list('entered the slice', change.added);
  list('left the slice', change.removed);
  if (
    change.changed.length + change.added.length + change.removed.length ===
    0
  ) {
    io.write('  nothing in the slice moved.');
  }
  return 0;
}

async function renew(
  io: CraftCliIo,
  ledger: Ledger,
  store: ReturnType<typeof createEvidenceStore>,
  ledgerPath: string,
  parsed: ReturnType<typeof parseArguments>,
  observed: {
    readonly list: readonly SubjectObservation[];
    readonly leaves: ReadonlyMap<string, Readonly<Record<string, string>>>;
    readonly workspace: WorkspaceSlices;
  },
  clock: { readonly now: () => string; readonly user: () => string },
): Promise<number> {
  const all = parsed.flags.has('all');
  const only =
    parsed.values['subject'] ?? (all ? undefined : argumentAfter(parsed, 'renew'));
  if (!all && !only) {
    io.writeError(
      'craft-ts attest renew: name a subject, or pass --all to renew every reviewable one.',
    );
    return 1;
  }

  const report = reportOn(ledger, observed.list, { toolVersion: TOOL_VERSION });
  const targets = report.statuses.filter(
    (entry) =>
      (only ? entry.subject === only : true) &&
      (entry.state === 'review' || entry.state === 'missing'),
  );
  if (targets.length === 0) {
    io.write('Nothing to renew.');
    return 0;
  }

  const verdict = (parsed.values['verdict'] ?? 'ok') as Verdict;
  const note = parsed.values['note'];
  const attestations: Attestation[] = targets.map((entry) => ({
    subject: entry.subject,
    kind: entry.observation.kind,
    fingerprint: entry.observation.fingerprint,
    evidence: entry.observation.evidence,
    verdict,
    assumptions: entry.observation.assumptions ?? [],
    by: parsed.values['by'] ?? clock.user(),
    at: clock.now(),
    toolVersion: TOOL_VERSION,
    ...(note ? { note } : {}),
    // The mark that keeps a bulk renewal honest. Without it a `renew --all`
    // is indistinguishable in the ledger from somebody having looked.
    ...(all ? { bulk: true as const } : {}),
  }));

  // The slice manifest is written under the fingerprint, which is already its
  // content address — that is what lets `why` name the nodes that moved.
  for (const attestation of attestations) {
    const leaves = observed.leaves.get(attestation.subject);
    if (leaves) {
      await store.putAs(
        sliceKey(attestation.subject, attestation.fingerprint),
        `${canonicalJson(leaves)}\n`,
        '.slice.json',
      );
    }
  }
  await store.putAs(
    BASELINE,
    `${canonicalJson(observed.workspace.nodeHashes())}\n`,
    '.json',
  );

  const carried = applyRenewals(ledger, report);
  await writeLedgerFile(ledgerPath, withAttestations(carried, attestations));
  io.write(
    `Recorded ${attestations.length} verdict(s) as '${verdict}'${all ? ', marked as a bulk renewal' : ''}.`,
  );
  return 0;
}

async function unwatched(
  io: CraftCliIo,
  json: boolean,
  store: ReturnType<typeof createEvidenceStore>,
  workspace: WorkspaceSlices,
): Promise<number> {
  const baseline = await store.getText(BASELINE, '.json');
  if (!baseline) {
    io.writeError(
      'craft-ts attest unwatched: no baseline yet. Run `attest renew` once — the report is "what moved since the last time somebody looked", and that needs a last time.',
    );
    return 1;
  }
  const before = JSON.parse(baseline) as Record<string, string>;
  const after = workspace.nodeHashes();

  const watched = new Set<string>();
  for (const hash of await store.list()) {
    const manifest = await store.getText(hash, '.slice.json');
    if (!manifest) continue;
    for (const node of Object.keys(JSON.parse(manifest) as Record<string, string>)) {
      watched.add(node);
    }
  }

  const moved = Object.keys(after).filter(
    (node) => before[node] !== undefined && before[node] !== after[node],
  );
  const appeared = Object.keys(after).filter((node) => before[node] === undefined);
  const result = {
    moved: moved.filter((node) => !watched.has(node)).sort(),
    appeared: appeared.filter((node) => !watched.has(node)).sort(),
  };

  if (json) {
    io.write(JSON.stringify(result, null, 2));
    return 0;
  }
  io.write(
    `${result.moved.length} node(s) moved and ${result.appeared.length} appeared with no attested subject covering them.`,
  );
  for (const node of [...result.moved, ...result.appeared]) io.write(`  ${node}`);
  if (result.moved.length + result.appeared.length === 0) {
    io.write('  Everything that moved is covered by something somebody looked at.');
  }
  return 0;
}

async function review(io: CraftCliIo, port: string | undefined): Promise<number> {
  let module: typeof import('@craft-ts/style-testing/review');
  try {
    module = await import('@craft-ts/style-testing/review');
  } catch {
    io.writeError(
      "craft-ts attest review: the review surface lives in '@craft-ts/style-testing', which is not installed here. Add it as a dev dependency.",
    );
    return 1;
  }
  const running = await module.startReviewServer({ port: Number(port ?? 4320) });
  io.write(`Review queue at ${running.url}`);
  io.write('  j/k move · a accept · n accept with a note · r reject · ^C to stop');
  // The command owns the process until the reviewer is done. Returning here
  // would close the socket the moment the queue opened.
  await new Promise<void>((resolve) => {
    process.once('SIGINT', () => void running.close().then(resolve));
  });
  return 0;
}

/** `attest why <subject>` — the verb is the first positional, the target the second. */
function argumentAfter(
  parsed: ReturnType<typeof parseArguments>,
  verb: string,
): string | undefined {
  const index = parsed.positional.indexOf(verb);
  return index === -1 ? undefined : parsed.positional[index + 1];
}
