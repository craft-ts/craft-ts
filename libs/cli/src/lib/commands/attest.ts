/**
 * `craft-ts attest` — the register, from a terminal.
 *
 * Seven verbs, and the two that justify the rest:
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
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import {
  applyRenewals,
  canonicalJson,
  createEvidenceStore,
  diffTestRuns,
  evidenceHash,
  isAccepted,
  isVisualRunReport,
  observeTemplateObligations,
  observeVisualRun,
  observeTests,
  parseVisualRunReport,
  parseLedger,
  parseVitestReport,
  reportOn,
  serialiseLedger,
  storeVisual,
  storeTemplateEvidence,
  loadTemplateEvidence,
  templateEvidenceValue,
  testSubjectId,
  withAttestations,
  type Attestation,
  type Ledger,
  type Retirement,
  type SubjectKind,
  type SubjectObservation,
  type TemplateObligationInput,
  type VisualRunCapture,
  type Verdict,
} from '@craft-ts/attest';
import type {
  FolderLayoutReviewCard,
  PreviousDecision,
  ReviewCard as AttestationReviewCard,
  AttestationDevtoolModel,
  TemplateDiagnostic,
  TemplateReviewCard,
} from '@craft-ts/dev-tools/attestation-review';
import type {
  FolderLayoutAnalysis,
  FolderLayoutProposal,
} from '@craft-ts/dev-tools';
import {
  applyFolderLayoutProposal,
  folderLayoutGitPlan,
} from '@craft-ts/dev-tools';
import type { LayoutDigest } from '@craft-ts/style-testing';
import type { ReviewIterationOptions } from '@craft-ts/style-testing/review';
import { parseArguments } from '../args.js';
import type { CraftCliIo } from '../io.js';
import { loadReviewAttestConfig } from '../load-review-attest-config.js';

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
    'kind',
    'reason',
    'regenerate-script',
    'config',
  ],
  flags: ['all', 'json', 'help', 'apply'],
} as const;

const openReviewUrl = (url: string): void => {
  if (process.env['CRAFT_ATTEST_NO_OPEN'] === '1') return;
  const command =
    process.platform === 'darwin'
      ? { executable: 'open', arguments: [url] }
      : process.platform === 'win32'
        ? { executable: 'cmd', arguments: ['/c', 'start', '', url] }
        : { executable: 'xdg-open', arguments: [url] };
  try {
    const child = spawn(command.executable, command.arguments, {
      detached: true,
      stdio: 'ignore',
    });
    child.once('error', () => undefined);
    child.unref();
  } catch {
    // The URL is still printed below; a missing desktop opener is not a
    // reason to stop the review server.
  }
};

const NPM_SCRIPT_NAME = /^[a-zA-Z0-9:_-]+$/;

const runNpmScript = async (options: {
  readonly rootDir: string;
  readonly script: string;
}): Promise<void> => {
  if (!NPM_SCRIPT_NAME.test(options.script)) {
    throw new Error(
      `craft-ts attest: invalid npm regeneration script '${options.script}'.`,
    );
  }
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['run', options.script],
      {
        cwd: options.rootDir,
        env: { ...process.env, CRAFT_ATTEST_NO_OPEN: '1' },
        stdio: 'inherit',
      },
    );
    child.once('error', rejectPromise);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(
        new Error(
          `Regeneration script '${options.script}' failed${signal ? ` with signal ${signal}` : ` with exit code ${code ?? 'unknown'}`}.`,
        ),
      );
    });
  });
};

export const ATTEST_HELP = `craft-ts attest — a human judgement, recorded so it survives a refactor

Usage: craft-ts attest <verb> [options]

Verbs:
  status               What is current, carried, queued for review, or missing
  diff                 Compare two runs and name the five categories
  why <subject>        Which nodes of the subject's slice moved, and when a
                       person last actually looked at it
  renew                Record a verdict; --all marks the attestations as bulk
  retire               Sign the removal of a template obligation
  review               Open the local CraftTS review application
  devtools             Explore and review visual and template attestations
  unwatched            Nodes that moved and belong to no attested subject

Options:
  --ledger <path>      Ledger file (default: .craft/attestations.jsonl)
  --evidence <dir>     Evidence store (default: .craft/evidence)
  --report <path>      Vitest JSON or craft-ts visual report
  --kind <kind>        test | visual | template | all; template needs no report
  --port <number>      Local review application port (default: 4320)
  --regenerate-script <name>
                       npm script the review application may rerun on demand
  --config <path>      typed review-attest config (default: review-attest.config.ts)
  --before/--after     Two such reports, for \`diff\`
  --tsconfig <path>    Project the code graph is built from
  --root <dir>         Repository root (default: the working directory)
  --subject <id>       Subject to act on
  --verdict <v>        ok | ok-with-note | rejected | known-issue | blocked
  --note <text>        Recorded with the verdict; required for rejected
  --reason <reason>    derivation | superseded | defect (with \`retire\`)
  --by <name>          Who is judging (default: $USER)
  --all                Renew every reviewable subject, marked as bulk
  --json               Emit a machine-readable report

An attestation never says "validated". It says "validated, under these
assumptions" — and a changed assumption sends the subject back to review.

The review sidebar can export rejected cards as a Markdown/JSON handoff and a
copyable Codex iteration prompt next to the report.`;

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
const VERDICTS: readonly Verdict[] = [
  'ok',
  'ok-with-note',
  'rejected',
  'known-issue',
  'blocked',
];
type RequestedKind =
  | Extract<SubjectKind, 'test' | 'visual' | 'template' | 'folder-layout'>
  | 'all';
const SUBJECT_KINDS: readonly RequestedKind[] = [
  'test',
  'visual',
  'template',
  'folder-layout',
  'all',
];
const RETIREMENT_REASONS: readonly Retirement['reason'][] = [
  'derivation',
  'superseded',
  'defect',
];

const isVerdict = (value: string): value is Verdict =>
  VERDICTS.some((verdict) => verdict === value);

const isSubjectKind = (value: string): value is RequestedKind =>
  SUBJECT_KINDS.some((kind) => kind === value);

const isRetirementReason = (value: string): value is Retirement['reason'] =>
  RETIREMENT_REASONS.some((reason) => reason === value);

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
  readonly runScript?: (options: {
    readonly rootDir: string;
    readonly script: string;
  }) => Promise<void>;
}

export interface WorkspaceSlices {
  fingerprintFor(file: string, fullName: string): string;
  leavesFor(file: string, fullName: string): Readonly<Record<string, string>>;
  fingerprintForNode(nodeId: string): string;
  leavesForNode(nodeId: string): Readonly<Record<string, string>>;
  templateObligations(): readonly TemplateObligationInput[];
  templateDiagnostics(): readonly {
    readonly code: string;
    readonly message: string;
    readonly proof?: { readonly filePath: string; readonly line?: number };
  }[];
  fingerprintForTemplate(subject: string): string;
  leavesForTemplate(subject: string): Readonly<Record<string, string>>;
  detailForTemplate?(subject: string): {
    readonly subject: string;
    readonly renderSites?: readonly {
      readonly file: string;
      readonly line: number;
      readonly code: string;
    }[];
    readonly element?: {
      readonly file: string;
      readonly line: number;
      readonly code: string;
    };
    readonly method?: {
      readonly file: string;
      readonly line: number;
      readonly code: string;
    };
  };
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
  const codeSliceModule = await import(
    '@craft-ts/dev-tools/scripts/code-slice.js'
  );
  const templateModule = await import(
    '@craft-ts/dev-tools/scripts/template-obligations.js'
  );
  let templateIndex:
    | ReturnType<typeof templateModule.createTemplateObligationIndex>
    | undefined;
  const prepareTemplateIndex = () =>
    (templateIndex ??= templateModule.createTemplateObligationIndex(
      index.graph,
      options,
    ));
  const visualSlices = new Map<
    string,
    ReturnType<typeof codeSliceModule.sliceOfPortableNode>
  >();
  const prepareVisualSlice = (nodeId: string) => {
    const known = visualSlices.get(nodeId);
    if (known) return known;
    const created = codeSliceModule.sliceOfPortableNode(
      index.slices,
      nodeId,
      options.rootDir,
    );
    visualSlices.set(nodeId, created);
    return created;
  };
  return {
    fingerprintFor: (file, fullName) => index.fingerprintFor(file, fullName),
    leavesFor: (file, fullName) => index.leavesFor(file, fullName),
    fingerprintForNode: (nodeId) => prepareVisualSlice(nodeId).fingerprint,
    leavesForNode: (nodeId) => prepareVisualSlice(nodeId).leaves,
    templateObligations: () => prepareTemplateIndex().obligations,
    templateDiagnostics: () => prepareTemplateIndex().diagnostics,
    fingerprintForTemplate: (subject) =>
      prepareTemplateIndex().fingerprintFor(subject),
    leavesForTemplate: (subject) => prepareTemplateIndex().leavesFor(subject),
    detailForTemplate: (subject) => prepareTemplateIndex().detailFor(subject),
    nodeHashes: () =>
      Object.fromEntries(
        [...index.slices.hashes].map(([id, hash]) => [
          id.split(rootPrefix).join(''),
          hash,
        ]),
      ),
  };
};

interface VisualArtifact {
  readonly capture: VisualRunCapture;
  readonly reportDirectory: string;
}

interface ObservedRun {
  readonly applicationTargets?: readonly import('@craft-ts/style-testing/review-attest').VisualAppCaptureTarget[];
  readonly list: readonly SubjectObservation[];
  readonly workspace: WorkspaceSlices;
  readonly leaves: ReadonlyMap<string, Readonly<Record<string, string>>>;
  readonly visuals: ReadonlyMap<string, VisualArtifact>;
  readonly templates: ReadonlyMap<string, TemplateObligationInput>;
  readonly diagnostics: readonly TemplateDiagnostic[];
  readonly folderLayout?: {
    readonly analysis: FolderLayoutAnalysis;
    readonly proposal: FolderLayoutProposal;
  };
  readonly kind: 'test' | 'visual' | 'template' | 'folder-layout' | 'all';
}

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
  const ledgerPath = resolve(
    rootDir,
    parsed.values['ledger'] ?? DEFAULT_LEDGER,
  );
  const store = createEvidenceStore(
    resolve(rootDir, parsed.values['evidence'] ?? DEFAULT_EVIDENCE),
  );
  const ledger = await readLedger(io, ledgerPath);
  const json = parsed.flags.has('json');
  const kindValue = parsed.values['kind'];
  if (kindValue && !isSubjectKind(kindValue)) {
    io.writeError(`craft-ts attest: unknown subject kind '${kindValue}'.`);
    return 1;
  }
  const requestedKind = parsed.command === 'devtools' ? 'all' : kindValue;
  const loadSlices = dependencies.loadSlices ?? defaultLoadSlices;
  const now = dependencies.now ?? (() => new Date().toISOString());
  const user = dependencies.user ?? (() => process.env['USER'] ?? 'unknown');
  const runScript = dependencies.runScript ?? runNpmScript;
  const reportPath = parsed.values['report']
    ? resolve(rootDir, parsed.values['report'])
    : undefined;
  const tsconfigPath = resolve(
    rootDir,
    parsed.values['tsconfig'] ?? 'tsconfig.json',
  );
  let reviewConfig: Awaited<
    ReturnType<typeof loadReviewAttestConfig>
  >['config'];
  try {
    const loadedConfig = await loadReviewAttestConfig({
      rootDir,
      ...(parsed.values['config'] ? { config: parsed.values['config'] } : {}),
      explicit: parsed.values['config'] !== undefined,
    });
    reviewConfig = loadedConfig.config;
  } catch (error) {
    io.writeError(error instanceof Error ? error.message : String(error));
    return 1;
  }

  const slices = async () =>
    await loadSlices({
      rootDir,
      tsConfigFilePath: parsed.values['tsconfig'] ?? 'tsconfig.json',
    });

  const observations = async (): Promise<ObservedRun> => {
    const workspace = await slices();
    const { reviewAttestHasVisualTargets, reviewAttestVisualSubjects } =
      await import('@craft-ts/style-testing/review-attest');
    const folderLayoutRun = async (): Promise<ObservedRun | undefined> => {
      const configured = reviewConfig?.folderLayout;
      if (!configured) return undefined;
      const proposalPath = resolve(rootDir, configured.proposal);
      const analysisPath = resolve(
        rootDir,
        configured.analysis ??
          configured.proposal.replace(/proposal/i, 'analysis'),
      );
      const proposal = JSON.parse(
        await readFile(proposalPath, 'utf8'),
      ) as FolderLayoutProposal;
      const analysis = JSON.parse(
        await readFile(analysisPath, 'utf8'),
      ) as FolderLayoutAnalysis;
      if (
        proposal.version !== 1 ||
        !Array.isArray(proposal.placements) ||
        analysis.version !== 1
      ) {
        throw new Error(
          `craft-ts attest: invalid folder-layout artifacts at ${proposalPath}.`,
        );
      }
      const subject = `folder-layout:${proposal.sourceGraphHash}:${proposal.configHash}`;
      return {
        list: [
          {
            subject,
            kind: 'folder-layout',
            fingerprint: proposal.configHash,
            evidence: evidenceHash(canonicalJson(proposal)),
            assumptions: [],
          },
        ],
        workspace,
        leaves: new Map(),
        visuals: new Map(),
        templates: new Map(),
        diagnostics: [],
        folderLayout: { analysis, proposal },
        kind: 'folder-layout',
      };
    };
    const folderLayout = await folderLayoutRun();
    if (requestedKind === 'folder-layout') {
      if (!folderLayout)
        throw new Error(
          'craft-ts attest: no folder-layout proposal is configured.',
        );
      return folderLayout;
    }
    const templateRun = async (): Promise<ObservedRun> => {
      const templateEnabled =
        reviewConfig?.template ?? reviewConfig === undefined;
      const obligations = templateEnabled
        ? workspace.templateObligations()
        : [];
      const leaves = new Map<string, Readonly<Record<string, string>>>();
      const list = observeTemplateObligations(obligations, (obligation) => {
        leaves.set(
          obligation.subject,
          workspace.leavesForTemplate(obligation.subject),
        );
        return workspace.fingerprintForTemplate(obligation.subject);
      });
      await Promise.all(
        obligations.map(async (obligation) => {
          const stored = await storeTemplateEvidence(store, obligation);
          const observation = list.find(
            (candidate) => candidate.subject === obligation.subject,
          );
          if (observation && stored !== observation.evidence) {
            throw new Error(
              `template evidence: '${obligation.subject}' was stored under an unexpected hash.`,
            );
          }
        }),
      );
      const diagnostics = templateEnabled
        ? workspace.templateDiagnostics().map((diagnostic) => ({
            code: diagnostic.code,
            message: diagnostic.message,
            ...(diagnostic.proof?.filePath
              ? { filePath: diagnostic.proof.filePath }
              : {}),
            ...(diagnostic.proof?.line ? { line: diagnostic.proof.line } : {}),
          }))
        : [];
      for (const diagnostic of diagnostics) {
        const location = diagnostic.filePath
          ? `${diagnostic.filePath}${diagnostic.line ? `:${diagnostic.line}` : ''}: `
          : '';
        io.writeError(`${location}${diagnostic.code}: ${diagnostic.message}`);
      }
      return {
        list,
        workspace,
        leaves,
        visuals: new Map(),
        templates: new Map(
          obligations.map((obligation) => [obligation.subject, obligation]),
        ),
        diagnostics,
        ...(folderLayout?.folderLayout
          ? { folderLayout: folderLayout.folderLayout }
          : {}),
        kind: 'template',
      };
    };
    if (requestedKind === 'template') {
      return await templateRun();
    }
    const visualDisabled =
      requestedKind === 'visual' ||
      (requestedKind === 'all' && reviewConfig?.template !== true);
    if (
      reviewConfig &&
      visualDisabled &&
      (!reviewConfig.visual || !reviewAttestHasVisualTargets(reviewConfig))
    ) {
      return {
        list: [],
        workspace,
        leaves: new Map(),
        visuals: new Map(),
        templates: new Map(),
        diagnostics: [],
        ...(folderLayout?.folderLayout
          ? { folderLayout: folderLayout.folderLayout }
          : {}),
        kind: requestedKind === 'all' ? 'all' : 'visual',
      };
    }
    if (requestedKind === 'all' && !parsed.values['report']) {
      const templates = await templateRun();
      const { visualAppCaptureTargets } = await import(
        '@craft-ts/style-testing/review-attest'
      );
      const applicationTargets = reviewConfig?.visual?.app
        ? visualAppCaptureTargets(reviewConfig.visual.app).filter(
            (t) => t.page.scenarios,
          )
        : [];
      return {
        ...templates,
        applicationTargets,
        list: [
          ...templates.list,
          ...(folderLayout?.list ?? []),
          ...applicationTargets.map((target) => ({
            subject: target.subject,
            kind: 'visual' as const,
            evidenceMode: 'screenshot' as const,
            fingerprint: '',
            evidence: '',
            unavailable: 'No application capture report supplied.',
          })),
        ],
        ...(folderLayout?.folderLayout
          ? { folderLayout: folderLayout.folderLayout }
          : {}),
        kind: 'all',
      };
    }
    if (!reportPath) {
      throw new Error(
        'craft-ts attest: no run to look at. Point --report at Vitest JSON or a craft-ts visual report.',
      );
    }
    const raw = JSON.parse(await readFile(reportPath, 'utf8'));
    const leaves = new Map<string, Readonly<Record<string, string>>>();
    if (isVisualRunReport(raw)) {
      if (requestedKind === 'test') {
        throw new Error(
          'craft-ts attest: --kind test requires a Vitest JSON report.',
        );
      }
      const run = parseVisualRunReport(raw);
      const declared = reviewConfig
        ? new Set(reviewAttestVisualSubjects(reviewConfig))
        : undefined;
      const filteredRun =
        declared && declared.size > 0
          ? {
              ...run,
              captures: run.captures.filter((capture) =>
                declared.has(`visual:${capture.component}#${capture.scenario}`),
              ),
            }
          : run;
      const list: SubjectObservation[] = [
        ...observeVisualRun(
          {
            ...filteredRun,
            captures: filteredRun.captures.filter(
              (c) => c.evidenceMode !== 'screenshot',
            ),
          },
          (component) => workspace.fingerprintForNode(component),
        ),
      ];
      const visuals = new Map<string, VisualArtifact>();
      const diagnostics: TemplateDiagnostic[] = [];
      const appConfig = reviewConfig?.visual?.app;
      const { visualAppCaptureTargets } = await import(
        '@craft-ts/style-testing/review-attest'
      );
      const expected = appConfig
        ? visualAppCaptureTargets(appConfig).filter((t) => t.page.scenarios)
        : [];
      const expectedBySubject = new Map(expected.map((t) => [t.subject, t]));
      const appServer =
        expected.length ||
        filteredRun.captures.some((c) => c.evidenceMode === 'screenshot')
          ? await import('@craft-ts/style-testing/visual-app/server')
          : undefined;
      const missing = (subject: string, message: string) => {
        diagnostics.push({
          code: 'visual-app-incomplete',
          message: `${subject}: ${message}`,
        });
        list.push({
          subject,
          kind: 'visual',
          fingerprint: '',
          evidence: '',
          unavailable: message,
          evidenceMode: 'screenshot',
        });
      };
      // A failed generation is kept beside the last successfully published report.
      const failureText = await readFile(
        `${reportPath}.failure.json`,
        'utf8',
      ).catch(() => undefined);
      const failure = failureText
        ? (JSON.parse(failureText) as {
            failures: { subject: string; message: string }[];
          })
        : undefined;
      for (const capture of filteredRun.captures) {
        const subject = `visual:${capture.component}#${capture.scenario}`;
        if (capture.evidenceMode === 'screenshot') {
          const target = expectedBySubject.get(subject);
          if (!target || !appConfig || !appServer || !capture.application) {
            missing(subject, 'Capture has no current application contract.');
            continue;
          }
          const failed = failure?.failures.find((f) => f.subject === subject);
          if (failed) {
            missing(subject, `Generation failed: ${failed.message}`);
            visuals.set(subject, {
              capture,
              reportDirectory: dirname(reportPath),
            });
            continue;
          }
          try {
            const provenance = await appServer.visualAppProvenance(
              appConfig,
              target,
              rootDir,
              tsconfigPath,
            );
            if (
              appServer.canonicalCaptureValue(provenance) !==
                appServer.canonicalCaptureValue(
                  capture.application.provenance,
                ) ||
              appServer.canonicalCaptureValue(capture.metadata?.viewport) !==
                appServer.canonicalCaptureValue(target.viewport) ||
              appServer.canonicalCaptureValue(
                capture.application.comparison,
              ) !== appServer.canonicalCaptureValue(appConfig.comparison) ||
              !capture.application.environment.startsWith(
                `${appConfig.environment ?? 'chromium-v1'}|`,
              )
            ) {
              missing(
                subject,
                'Sources, mocks, recipe or viewport changed; regenerate.',
              );
              continue;
            }
            const image = await readFile(
              resolve(dirname(reportPath), capture.image!),
            );
            const evidence = evidenceHash(image);
            // Image bytes are always observed, even when dimensions and source code are unchanged.
            const previous = (await readLedger(io, ledgerPath)).get(subject);
            const reference =
              previous?.acceptedReference?.evidence ??
              (previous && isAccepted(previous.verdict)
                ? previous.evidence
                : undefined);
            const referenceBytes = reference
              ? await store.get(reference, '.png')
              : undefined;
            const comparison = referenceBytes
              ? appServer.compareVisualScreenshots(
                  image,
                  referenceBytes,
                  capture.application.comparison,
                )
              : undefined;
            const diff =
              comparison && 'diff' in comparison && comparison.diff
                ? await store.put(comparison.diff, '.png')
                : undefined;
            const policyHash = evidenceHash(
              canonicalJson({
                comparison: capture.application.comparison,
                environment: capture.application.environment,
              }),
            );
            list.push({
              subject,
              kind: 'visual',
              fingerprint: evidenceHash(canonicalJson(provenance)),
              evidence,
              evidenceMode: 'screenshot',
              assumptions: capture.assumptions ?? [],
              screenshotComparison: {
                reference: reference ?? '',
                matches: comparison?.matches ?? false,
                diffPixels: comparison?.diffPixels ?? null,
                ...capture.application.comparison,
                environment: capture.application.environment,
                policyHash,
                ...(diff ? { diff } : {}),
              },
            });
          } catch (error) {
            missing(
              subject,
              error instanceof Error ? error.message : String(error),
            );
            continue;
          }
        }
        leaves.set(subject, workspace.leavesForNode(capture.component));
        visuals.set(subject, { capture, reportDirectory: dirname(reportPath) });
      }
      const produced = new Set(list.map((o) => o.subject));
      for (const target of expected)
        if (!produced.has(target.subject))
          missing(
            target.subject,
            'Expected application capture is absent from report.',
          );
      const visual: ObservedRun = {
        list,
        workspace,
        leaves,
        visuals,
        templates: new Map(),
        diagnostics,
        ...(folderLayout?.folderLayout
          ? { folderLayout: folderLayout.folderLayout }
          : {}),
        applicationTargets: expected,
        kind: 'visual',
      };
      if (requestedKind !== 'all') return visual;
      const templates = await templateRun();
      return {
        list: [
          ...visual.list,
          ...templates.list,
          ...(folderLayout?.list ?? []),
        ],
        workspace,
        leaves: new Map([...visual.leaves, ...templates.leaves]),
        visuals,
        templates: templates.templates,
        diagnostics: [...visual.diagnostics, ...templates.diagnostics],
        ...(folderLayout?.folderLayout
          ? { folderLayout: folderLayout.folderLayout }
          : {}),
        applicationTargets: expected,
        kind: 'all',
      };
    }

    if (requestedKind === 'visual') {
      throw new Error(
        'craft-ts attest: --kind visual requires a craft-ts visual report.',
      );
    }

    const run = parseVitestReport(raw, { rootDir });
    const list = observeTests(run, (testCase) => {
      const subject = `test:${testCase.file}#${testCase.fullName}`;
      leaves.set(
        subject,
        workspace.leavesFor(testCase.file, testCase.fullName),
      );
      return workspace.fingerprintFor(testCase.file, testCase.fullName);
    });
    if (requestedKind === 'all') {
      throw new Error(
        'craft-ts attest: --kind all requires a craft-ts visual report.',
      );
    }
    return {
      list,
      workspace,
      leaves,
      visuals: new Map(),
      templates: new Map(),
      diagnostics: [],
      ...(folderLayout?.folderLayout
        ? { folderLayout: folderLayout.folderLayout }
        : {}),
      kind: 'test',
    };
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
      case 'retire':
        return await retire(
          io,
          ledger,
          ledgerPath,
          parsed,
          await observations(),
          { now, user },
        );
      case 'unwatched':
        return await unwatched(io, json, store, await slices());
      case 'review':
      case 'devtools': {
        io.write('Preparing the review queue…');
        const observed = await observations();
        const regenerateScript = parsed.values['regenerate-script'];
        const iteration: ReviewIterationOptions = {
          rootDir,
          ...(reportPath ? { reportPath } : {}),
          ledgerPath,
          evidenceDirectory: store.directory,
          tsconfigPath,
          ...(regenerateScript ? { regenerationScript: regenerateScript } : {}),
          now,
        };
        const folderLayoutPlan = observed.folderLayout
          ? folderLayoutGitPlan(observed.folderLayout.proposal)
          : undefined;
        const folderLayoutApply =
          observed.folderLayout &&
          folderLayoutPlan &&
          folderLayoutPlan.moves + folderLayoutPlan.deletions > 0
            ? {
                command: 'npm run apply:demo:folder-layout',
                gitCommands: folderLayoutPlan.commands,
                moves: folderLayoutPlan.moves,
                deletions: folderLayoutPlan.deletions,
                manualReviews: folderLayoutPlan.manualReviews,
                run: async () => {
                  if (!observed.folderLayout)
                    throw new Error(
                      'review: folder-layout proposal disappeared.',
                    );
                  applyFolderLayoutProposal({
                    rootDir,
                    project: parsed.values['tsconfig'] ?? 'tsconfig.json',
                    proposal: observed.folderLayout.proposal,
                  });
                },
              }
            : undefined;
        return await review(
          io,
          ledger,
          store,
          ledgerPath,
          parsed.values['port'],
          observed,
          { now, user },
          iteration,
          regenerateScript
            ? {
                reloadObserved: observations,
                run: async () =>
                  await runScript({ rootDir, script: regenerateScript }),
            }
            : undefined,
          folderLayoutApply,
        );
      }
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
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, serialiseLedger(ledger), 'utf8');
  await rename(temporary, path);
}

const isLayoutDigest = (value: unknown): value is LayoutDigest => {
  if (typeof value !== 'object' || value === null) return false;
  const digest = value as Partial<LayoutDigest>;
  return (
    digest.digestVersion === 1 &&
    Array.isArray(digest.nodes) &&
    typeof digest.signature === 'object' &&
    digest.signature !== null
  );
};

interface StoredArtifacts {
  readonly evidence: string;
  readonly image?: string;
  readonly snapshot?: string;
}

async function persistVisuals(
  store: ReturnType<typeof createEvidenceStore>,
  observed: ObservedRun,
  subjects: ReadonlySet<string>,
): Promise<ReadonlyMap<string, StoredArtifacts>> {
  const stored = new Map<string, StoredArtifacts>();
  const observations = new Map(
    observed.list.map((observation) => [observation.subject, observation]),
  );
  for (const subject of subjects) {
    const artifact = observed.visuals.get(subject);
    const observation = observations.get(subject);
    if (!artifact || !observation) continue;
    let image: Uint8Array | undefined;
    if (artifact.capture.image) {
      const imagePath = resolve(
        artifact.reportDirectory,
        artifact.capture.image,
      );
      try {
        image = await readFile(imagePath);
      } catch {
        throw new Error(
          `visual report: screenshot '${artifact.capture.image}' for '${subject}' does not exist.`,
        );
      }
    }
    let snapshot: string | undefined;
    if (artifact.capture.snapshot) {
      const snapshotPath = resolve(
        artifact.reportDirectory,
        artifact.capture.snapshot,
      );
      try {
        snapshot = await readFile(snapshotPath, 'utf8');
      } catch {
        // Missing is survivable — the card falls back to the screenshot and
        // says so. Silently pretending there was never a snapshot is not.
        snapshot = undefined;
      }
    }
    const result = await storeVisual(store, {
      component: artifact.capture.component,
      scenario: artifact.capture.scenario,
      digest: artifact.capture.digest,
      ...(artifact.capture.evidenceMode
        ? { evidenceMode: artifact.capture.evidenceMode }
        : {}),
      fingerprint: observation.fingerprint,
      ...(image ? { image } : {}),
      ...(snapshot ? { snapshot } : {}),
      assumptions: artifact.capture.assumptions ?? [],
    });
    stored.set(subject, {
      evidence: result.evidence,
      ...(result.image ? { image: result.image } : {}),
      ...(result.snapshot ? { snapshot: result.snapshot } : {}),
    });
  }
  return stored;
}

async function persistSliceManifests(
  store: ReturnType<typeof createEvidenceStore>,
  observed: ObservedRun,
  subjects: ReadonlySet<string>,
): Promise<void> {
  const observations = new Map(
    observed.list.map((observation) => [observation.subject, observation]),
  );
  for (const subject of subjects) {
    const observation = observations.get(subject);
    const leaves = observed.leaves.get(subject);
    if (!observation || !leaves) continue;
    await store.putAs(
      sliceKey(subject, observation.fingerprint),
      `${canonicalJson(leaves)}\n`,
      '.slice.json',
    );
  }
  await store.putAs(
    BASELINE,
    `${canonicalJson(observed.workspace.nodeHashes())}\n`,
    '.json',
  );
}

async function status(
  io: CraftCliIo,
  json: boolean,
  ledger: Ledger,
  observed: {
    readonly list: readonly SubjectObservation[];
    readonly kind: 'test' | 'visual' | 'template' | 'folder-layout' | 'all';
  },
): Promise<number> {
  const report = reportOn(ledger, observed.list, { toolVersion: TOOL_VERSION });
  const failures =
    report.counts.review +
    report.counts.missing +
    (observed.kind === 'template' ? report.unsignedRemovals.length : 0);
  if (json) {
    io.write(JSON.stringify(report, null, 2));
    return failures === 0 ? 0 : 1;
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
      io.write(
        `  ${entry.state.padEnd(8)} ${entry.subject}${entry.reason ? ` — ${entry.reason}` : ''}`,
      );
      if (entry.attestation?.verdict === 'rejected' && entry.attestation.note) {
        io.write(`    rejection reason: ${entry.attestation.note}`);
      }
    }
  }
  for (const subject of report.orphaned) {
    const unsigned = report.unsignedRemovals.includes(subject);
    io.write(
      `  orphaned ${subject} — nothing produces this any more${unsigned ? '; sign the removal with `attest retire`' : ''}`,
    );
  }
  if (report.bulk > 0) {
    // Visible on purpose. A bulk renewal that leaves no trace turns the
    // register into a rubber stamp.
    io.write(
      `  ${report.bulk} of these rest on a bulk renewal, not on somebody looking.`,
    );
  }
  return failures === 0 ? 0 : 1;
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
    io.writeError(
      'craft-ts attest diff: --before and --after are both required.',
    );
    return 1;
  }
  const read = async (path: string) =>
    parseVitestReport(
      JSON.parse(await readFile(resolve(rootDir, path), 'utf8')),
      {
        rootDir,
      },
    );

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
  const section = (
    name: string,
    subjects: readonly string[],
    note?: string,
  ) => {
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
  if (attestation.note) io.write(`  decision reason: ${attestation.note}`);
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

  const { sliceChange } = await import(
    '@craft-ts/dev-tools/scripts/code-slice.js'
  );
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
  observed: ObservedRun,
  clock: { readonly now: () => string; readonly user: () => string },
): Promise<number> {
  const all = parsed.flags.has('all');
  const only =
    parsed.values['subject'] ??
    (all ? undefined : argumentAfter(parsed, 'renew'));
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
      !entry.observation.unavailable &&
      (entry.state === 'review' || entry.state === 'missing'),
  );
  if (targets.length === 0) {
    if (report.statuses.some((entry) => entry.observation.unavailable)) {
      io.writeError(
        'Application captures are missing or stale; regenerate before accepting.',
      );
      return 1;
    }
    io.write('Nothing to renew.');
    return 0;
  }

  const verdictValue = parsed.values['verdict'] ?? 'ok';
  const note = parsed.values['note'];
  if (!isVerdict(verdictValue)) {
    io.writeError(`craft-ts attest renew: unknown verdict '${verdictValue}'.`);
    return 1;
  }
  if (verdictValue === 'rejected' && !note?.trim()) {
    io.writeError(
      'craft-ts attest renew: --note is required with a rejected verdict.',
    );
    return 1;
  }
  if (verdictValue === 'ok-with-note' && !note?.trim()) {
    io.writeError(
      'craft-ts attest renew: --note is required with an ok-with-note verdict.',
    );
    return 1;
  }
  const verdict = verdictValue;
  const attestations: Attestation[] = targets.map((entry) => {
    const previous = ledger.get(entry.subject);
    const acceptedReference = !isAccepted(verdict)
      ? (previous?.acceptedReference ??
        (previous && isAccepted(previous.verdict)
          ? {
              fingerprint: previous.fingerprint,
              evidence: previous.evidence,
            }
          : undefined))
      : undefined;
    return {
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
      ...(acceptedReference ? { acceptedReference } : {}),
      ...(entry.observation.screenshotComparison
        ? {
            screenshotPolicy: entry.observation.screenshotComparison.policyHash,
            screenshotComparison: entry.observation.screenshotComparison,
          }
        : {}),
      // The mark that keeps a bulk renewal honest. Without it a `renew --all`
      // is indistinguishable in the ledger from somebody having looked.
      ...(all ? { bulk: true as const } : {}),
    };
  });

  const targetSubjects = new Set([
    ...attestations.map((entry) => entry.subject),
    ...report.statuses
      .filter((entry) => entry.state === 'renewed')
      .map((entry) => entry.subject),
  ]);
  await persistVisuals(store, observed, targetSubjects);
  // The slice manifest is written under the fingerprint, which is already its
  // content address — that is what lets `why` name the nodes that moved.
  await persistSliceManifests(store, observed, targetSubjects);

  const carried = applyRenewals(ledger, report);
  await writeLedgerFile(ledgerPath, withAttestations(carried, attestations));
  io.write(
    `Recorded ${attestations.length} verdict(s) as '${verdict}'${all ? ', marked as a bulk renewal' : ''}.`,
  );
  return 0;
}

async function retire(
  io: CraftCliIo,
  ledger: Ledger,
  ledgerPath: string,
  parsed: ReturnType<typeof parseArguments>,
  observed: ObservedRun,
  clock: { readonly now: () => string; readonly user: () => string },
): Promise<number> {
  if (observed.kind !== 'template') {
    io.writeError('craft-ts attest retire: pass --kind template.');
    return 1;
  }
  const subject = parsed.values['subject'] ?? argumentAfter(parsed, 'retire');
  if (!subject) {
    io.writeError('craft-ts attest retire: --subject is required.');
    return 1;
  }
  const reasonValue = parsed.values['reason'];
  if (!reasonValue || !isRetirementReason(reasonValue)) {
    io.writeError(
      'craft-ts attest retire: --reason must be derivation, superseded, or defect.',
    );
    return 1;
  }
  const note = parsed.values['note'];
  if (!note?.trim()) {
    io.writeError('craft-ts attest retire: a non-empty --note is required.');
    return 1;
  }

  const attestation = ledger.get(subject);
  if (!attestation || attestation.kind !== 'template') {
    io.writeError(
      `craft-ts attest retire: '${subject}' is not an attested template obligation.`,
    );
    return 1;
  }
  const report = reportOn(ledger, observed.list, { toolVersion: TOOL_VERSION });
  if (!report.orphaned.includes(subject)) {
    io.writeError(
      `craft-ts attest retire: '${subject}' is still produced by the template.`,
    );
    return 1;
  }

  const retired: Attestation = {
    ...attestation,
    retired: {
      reason: reasonValue,
      note: note.trim(),
      by: parsed.values['by'] ?? clock.user(),
      at: clock.now(),
    },
  };
  await writeLedgerFile(ledgerPath, withAttestations(ledger, [retired]));
  io.write(`Recorded the retirement of '${subject}' as '${reasonValue}'.`);
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
    for (const node of Object.keys(
      JSON.parse(manifest) as Record<string, string>,
    )) {
      watched.add(node);
    }
  }

  const moved = Object.keys(after).filter(
    (node) => before[node] !== undefined && before[node] !== after[node],
  );
  const appeared = Object.keys(after).filter(
    (node) => before[node] === undefined,
  );
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
  for (const node of [...result.moved, ...result.appeared])
    io.write(`  ${node}`);
  if (result.moved.length + result.appeared.length === 0) {
    io.write(
      '  Everything that moved is covered by something somebody looked at.',
    );
  }
  return 0;
}

async function review(
  io: CraftCliIo,
  ledger: Ledger,
  store: ReturnType<typeof createEvidenceStore>,
  ledgerPath: string,
  port: string | undefined,
  initialObserved: ObservedRun,
  clock: { readonly now: () => string; readonly user: () => string },
  iteration: ReviewIterationOptions,
  regeneration:
    | {
        readonly run: () => Promise<void>;
        readonly reloadObserved: () => Promise<ObservedRun>;
    }
    | undefined,
  folderLayoutApply:
    | {
        readonly command: string;
        readonly gitCommands: string;
        readonly moves: number;
        readonly deletions: number;
        readonly manualReviews: number;
        readonly run: () => Promise<void>;
      }
    | undefined,
): Promise<number> {
  const {
    buildFolderLayoutReviewCard,
    buildRemovalReviewCard,
    buildTemplateReviewCard,
    clusterTemplateReviewCards,
  } = await import('@craft-ts/dev-tools/attestation-review');
  let module: typeof import('@craft-ts/style-testing/review');
  try {
    module = await import('@craft-ts/style-testing/review');
  } catch {
    io.writeError(
      "craft-ts attest review: the review surface lives in '@craft-ts/style-testing', which is not installed here. Add it as a dev dependency.",
    );
    return 1;
  }
  let observed = initialObserved;
  const initialReport = reportOn(ledger, observed.list, {
    toolVersion: TOOL_VERSION,
  });
  const reviewableSubjects = new Set(
    initialReport.statuses
      .filter(
        (status) =>
          !status.observation.unavailable &&
          (status.state === 'review' || status.state === 'missing'),
      )
      .map((status) => status.subject),
  );
  const visualSubjects = new Set(observed.visuals.keys());
  let stored = await persistVisuals(store, observed, visualSubjects);
  await persistSliceManifests(
    store,
    observed,
    new Set([
      ...reviewableSubjects,
      ...initialReport.statuses
        .filter((status) => status.state === 'renewed')
        .map((status) => status.subject),
    ]),
  );
  let observations = new Map(
    observed.list.map((observation) => [observation.subject, observation]),
  );
  const previousDecisionOf = (
    attestation: Attestation | undefined,
  ): PreviousDecision | undefined =>
    attestation
      ? {
          verdict: attestation.verdict,
          by: attestation.by,
          at: attestation.at,
          ...(attestation.note ? { note: attestation.note } : {}),
          ...(attestation.findings?.length
            ? { findings: attestation.findings }
            : {}),
          ...(attestation.degraded ? { degraded: true as const } : {}),
        }
      : undefined;
  const acceptedReferenceOf = (
    attestation: Attestation | undefined,
  ): { readonly fingerprint: string; readonly evidence: string } | undefined =>
    attestation?.acceptedReference ??
    (attestation && isAccepted(attestation.verdict)
      ? {
          fingerprint: attestation.fingerprint,
          evidence: attestation.evidence,
        }
      : undefined);
  const componentOfTemplateSubject = (subject: string): string =>
    subject.replace(/^template:/, '').split('#')[0] ?? subject;

  const buildCards = async (
    current: Ledger,
  ): Promise<AttestationReviewCard[]> => {
    const report = reportOn(current, observed.list, {
      toolVersion: TOOL_VERSION,
    });
    const visualItems: import('@craft-ts/style-testing/review').ReviewItem[] =
      [];
    const templateCards: TemplateReviewCard[] = [];
    const folderLayoutCards: FolderLayoutReviewCard[] = [];

    for (const status of report.statuses) {
      if (
        status.observation.unavailable ||
        (status.state !== 'review' && status.state !== 'missing')
      )
        continue;
      const artifact = observed.visuals.get(status.subject);
      if (artifact) {
        if (!isLayoutDigest(artifact.capture.digest)) {
          throw new Error(
            `visual report: '${status.subject}' does not contain a layout digest v1.`,
          );
        }
        const acceptedReference = acceptedReferenceOf(status.attestation);
        const approvedText = acceptedReference
          ? await store.getText(acceptedReference.evidence, '.digest.json')
          : undefined;
        const approvedValue = approvedText
          ? JSON.parse(approvedText)
          : undefined;
        const previousDecision = previousDecisionOf(status.attestation);
        visualItems.push({
          subject: status.subject,
          ...(artifact.capture.evidenceMode
            ? { evidenceMode: artifact.capture.evidenceMode }
            : {}),
          state: status.state,
          reason: status.reason ?? 'the output changed',
          digest: artifact.capture.digest,
          ...(isLayoutDigest(approvedValue) ? { approved: approvedValue } : {}),
          ...(stored.get(status.subject)?.image
            ? { image: stored.get(status.subject)?.image }
            : {}),
          ...(stored.get(status.subject)?.snapshot
            ? { snapshot: stored.get(status.subject)?.snapshot }
            : {}),
          ...(artifact.capture.snapshotRisks?.length
            ? { risks: artifact.capture.snapshotRisks }
            : {}),
          ...(stored.get(status.subject)?.evidence
            ? { evidence: stored.get(status.subject)?.evidence }
            : {}),
          ...(artifact.capture.metadata
            ? { metadata: artifact.capture.metadata }
            : {}),
          ...(status.attestation?.verdict === 'rejected' &&
          status.attestation.note
            ? { rejectionReason: status.attestation.note }
            : {}),
          ...(previousDecision ? { previousDecision } : {}),
        });
        continue;
      }

      const obligation = observed.templates.get(status.subject);
      if (
        observed.folderLayout &&
        status.subject.startsWith('folder-layout:')
      ) {
        const previousDecision = previousDecisionOf(status.attestation);
        if (status.state === 'review' || status.state === 'missing') {
          folderLayoutCards.push(
            buildFolderLayoutReviewCard({
              analysis: observed.folderLayout.analysis,
              proposal: observed.folderLayout.proposal,
              state: status.state,
              ...(previousDecision ? { previousDecision } : {}),
            }),
          );
        }
        continue;
      }
      if (!obligation) continue;
      const acceptedReference = acceptedReferenceOf(status.attestation);
      const previousEvidence = acceptedReference
        ? await loadTemplateEvidence(store, acceptedReference.evidence)
        : undefined;
      const previousLeavesText = acceptedReference
        ? await store.getText(
            sliceKey(status.subject, acceptedReference.fingerprint),
            '.slice.json',
          )
        : undefined;
      const previousDecision = previousDecisionOf(status.attestation);
      templateCards.push(
        buildTemplateReviewCard({
          subject: status.subject,
          state: status.state,
          reason: status.reason ?? 'the template promise changed',
          currentEvidenceHash: status.observation.evidence,
          component: obligation.component,
          statement: obligation.statement,
          statementParts: obligation.statementParts,
          effects: obligation.effects,
          conditions: obligation.conditions,
          currentEvidence: templateEvidenceValue(obligation),
          ...(previousEvidence ? { previousEvidence } : {}),
          hadPreviousAttestation: acceptedReference !== undefined,
          currentLeaves: observed.leaves.get(status.subject) ?? {},
          ...(previousLeavesText
            ? {
                previousLeaves: JSON.parse(previousLeavesText) as Record<
                  string,
                  string
                >,
              }
            : {}),
          ...(previousDecision ? { previousDecision } : {}),
        }),
      );
    }

    const removals: AttestationReviewCard[] = [];
    if (observed.kind === 'template' || observed.kind === 'all') {
      for (const subject of report.unsignedRemovals) {
        const attestation = current.get(subject);
        const previousDecision = previousDecisionOf(attestation);
        if (!attestation || !previousDecision) continue;
        const previousEvidence = await loadTemplateEvidence(
          store,
          attestation.evidence,
        );
        removals.push(
          buildRemovalReviewCard({
            subject,
            component: componentOfTemplateSubject(subject),
            evidenceHash: attestation.evidence,
            ...(previousEvidence ? { previousEvidence } : {}),
            previousDecision,
          }),
        );
      }
    }

    return [
      ...module.buildReviewQueue(visualItems).cards,
      ...clusterTemplateReviewCards(templateCards),
      ...folderLayoutCards,
      ...removals,
    ];
  };

  let currentLedger = applyRenewals(ledger, initialReport);
  let activeCards = await buildCards(currentLedger);
  const buildModel = (
    current: Ledger,
    cards: readonly AttestationReviewCard[],
  ): AttestationDevtoolModel => {
    const report = reportOn(current, observed.list, {
      toolVersion: TOOL_VERSION,
    });
    const statuses = new Map(
      report.statuses.map((status) => [status.subject, status]),
    );
    const assets = new Map<
      string,
      {
        evidence: string;
        image?: string;
        snapshot?: string;
        scenarios: string[];
      }
    >();
    for (const [subject] of observed.visuals) {
      const observation = observations.get(subject);
      if (!observation) continue;
      const artifact = stored.get(subject);
      const evidence = artifact?.evidence ?? observation.evidence;
      const known = assets.get(evidence);
      if (known) known.scenarios.push(subject);
      else {
        assets.set(evidence, {
          evidence,
          ...(artifact?.image ? { image: artifact.image } : {}),
          ...(artifact?.snapshot ? { snapshot: artifact.snapshot } : {}),
          scenarios: [subject],
        });
      }
    }
    return {
      visualAssets: [...assets.values()]
        .map((asset) => ({
          ...asset,
          scenarios: [...asset.scenarios].sort(),
        }))
        .sort((left, right) => left.evidence.localeCompare(right.evidence)),
      visualTests: [...observed.visuals.entries()]
        .map(([subject, artifact]) => {
          const status = statuses.get(subject);
          const observation = observations.get(subject);
          return {
            subject,
            component: artifact.capture.component,
            scenario: artifact.capture.scenario,
            state: status?.state ?? 'missing',
            evidence: observation?.evidence ?? '',
            ...(status?.attestation?.evidence
              ? { previousEvidence: status.attestation.evidence }
              : {}),
          };
        })
        .sort((left, right) => left.subject.localeCompare(right.subject)),
      templateObligations: [...observed.templates.entries()]
        .map(([subject, obligation]) => ({
          subject,
          component: obligation.component,
          direction: obligation.direction,
          statement: obligation.statement,
          statementParts: obligation.statementParts,
          ...(obligation.effects?.length
            ? { effects: obligation.effects }
            : {}),
          ...(obligation.conditions && obligation.conditions.length > 0
            ? { conditions: obligation.conditions }
            : {}),
          state: statuses.get(subject)?.state ?? 'missing',
          evidence: templateEvidenceValue(obligation),
        }))
        .sort((left, right) => left.subject.localeCompare(right.subject)),
      folderLayouts: observed.folderLayout
        ? [
            {
              subject:
                observed.list.find((item) =>
                  item.subject.startsWith('folder-layout:'),
                )?.subject ?? '',
              sourceGraphHash: observed.folderLayout.proposal.sourceGraphHash,
              configHash: observed.folderLayout.proposal.configHash,
              state:
                statuses.get(
                  observed.list.find((item) =>
                    item.subject.startsWith('folder-layout:'),
                  )?.subject ?? '',
                )?.state ?? 'missing',
              entries: observed.folderLayout.proposal.placements.map(
                (placement) => ({
                  sourcePath: placement.sourcePath,
                  proposedPath: placement.proposedPath,
                  status:
                    placement.action === 'delete'
                      ? ('deleted' as const)
                      : placement.proposedPath === null
                        ? ('unchanged' as const)
                        : placement.proposedPath === placement.sourcePath
                          ? ('unchanged' as const)
                          : ('moved' as const),
                  scope: placement.scope,
                  confidence: placement.confidence,
                  reasons: placement.reasons,
                }),
              ),
              statistics: observed.folderLayout.proposal.statistics,
            },
          ]
        : [],
      diagnostics: observed.diagnostics,
      applicationCaptures: (observed.applicationTargets ?? []).map((target) => {
        const status = statuses.get(target.subject);
        const artifact = stored.get(target.subject);
        const comparison = status?.observation.screenshotComparison;
        return {
          subject: target.subject,
          page: target.page.id,
          scenario: target.scenario.id,
          label: target.scenario.label,
          category: target.scenario.category,
          capture: target.capture.id,
          viewport: target.viewportName,
          dimensions: target.viewport,
          state: status?.state ?? 'missing',
          ...(status?.observation.unavailable
            ? { error: status.observation.unavailable }
            : {}),
          ...(artifact?.image ? { image: artifact.image } : {}),
          ...(comparison ? { comparison } : {}),
          ...(comparison?.reference ? { reference: comparison.reference } : {}),
          ...(comparison?.diff ? { diff: comparison.diff } : {}),
        };
      }),
      cards,
    };
  };
  // Inventory keeps `renewed` visible as history even though automatic carries
  // are deliberately absent from the human queue.
  const model = buildModel(ledger, activeCards);
  if (
    !regeneration &&
    activeCards.length === 0 &&
    model.visualAssets.length === 0 &&
    model.visualTests.length === 0 &&
    model.templateObligations.length === 0 &&
    model.diagnostics.length === 0
  ) {
    io.write('Aucune attestation à traiter. Nothing to review or explore.');
    return 0;
  }

  const previousDecisionsFor = (
    current: Ledger,
    cards: readonly AttestationReviewCard[],
  ): number => {
    const subjects = new Set([
      ...observed.list.map((observation) => observation.subject),
      ...cards.flatMap((card) => card.cluster),
    ]);
    return [...subjects].filter((subject) => current.has(subject)).length;
  };

  let finishReview: () => void = () => undefined;
  const reviewFinished = new Promise<void>((resolve) => {
    finishReview = resolve;
  });
  const reviewLedgerSnapshots = new Map<
    string,
    readonly (readonly [string, Attestation | undefined])[]
  >();
  const running = await module.startReviewServer({
    port: Number(port ?? 4320),
    cards: activeCards,
    model,
    templateDetailFor: (subject: string) =>
      observed.workspace.detailForTemplate?.(subject),
    iteration,
    ...(folderLayoutApply ? { folderLayoutApply } : {}),
    onClose: async (handoff) => {
      io.write('Review application closed.');
      if (handoff) {
        io.write(`Codex iteration prompt: ${handoff.promptPath}`);
        io.write('----- BEGIN CODEX ITERATION PROMPT -----');
        io.write(handoff.prompt);
        io.write('----- END CODEX ITERATION PROMPT -----');
      }
      finishReview();
    },
    ...(regeneration
      ? {
          previousDecisions: previousDecisionsFor(ledger, activeCards),
          regenerate: async () => {
            await regeneration.run();
            observed = await regeneration.reloadObserved();
            observations = new Map(
              observed.list.map((observation) => [
                observation.subject,
                observation,
              ]),
            );

            const diskLedger = await readLedger(io, ledgerPath);
            const regeneratedReport = reportOn(diskLedger, observed.list, {
              toolVersion: TOOL_VERSION,
            });
            const regeneratedReviewable = new Set(
              regeneratedReport.statuses
                .filter(
                  (status) =>
                    status.state === 'review' || status.state === 'missing',
                )
                .map((status) => status.subject),
            );
            stored = await persistVisuals(
              store,
              observed,
              new Set(observed.visuals.keys()),
            );
            await persistSliceManifests(
              store,
              observed,
              new Set([
                ...regeneratedReviewable,
                ...regeneratedReport.statuses
                  .filter((status) => status.state === 'renewed')
                  .map((status) => status.subject),
              ]),
            );
            currentLedger = applyRenewals(diskLedger, regeneratedReport);
            activeCards = await buildCards(currentLedger);
            return {
              cards: activeCards,
              model: buildModel(diskLedger, activeCards),
              previousDecisions: previousDecisionsFor(diskLedger, activeCards),
            };
          },
        }
      : {}),
    refreshCards: async () => {
      const diskLedger = await readLedger(io, ledgerPath);
      const diskReport = reportOn(diskLedger, observed.list, {
        toolVersion: TOOL_VERSION,
      });
      currentLedger = applyRenewals(diskLedger, diskReport);
      activeCards = await buildCards(currentLedger);
      return activeCards;
    },
    imageFor: async (hash) => await store.get(hash, '.png'),
    snapshotFor: async (hash) => await store.getText(hash, '.snapshot.html'),
    digestFor: async (hash) => await store.getText(hash, '.digest.json'),
    onDecision: async (decision) => {
      const card = activeCards.find(
        (candidate) =>
          candidate.shape === decision.shape &&
          (decision.id === undefined || candidate.id === decision.id),
      );
      if (!card) throw new Error('review: that diff cluster no longer exists.');
      if (card.kind === 'removal') {
        if (
          decision.verdict !== 'retire' ||
          !decision.retirementReason ||
          !decision.note?.trim()
        ) {
          throw new Error(
            'review: removed obligations require Retire, a reason, and a comment.',
          );
        }
        const previous = currentLedger.get(card.subject);
        if (!previous) {
          throw new Error(
            `review: '${card.subject}' disappeared from the ledger.`,
          );
        }
        reviewLedgerSnapshots.set(decision.shape, [[card.subject, previous]]);
        currentLedger = withAttestations(currentLedger, [
          {
            ...previous,
            retired: {
              reason: decision.retirementReason,
              note: decision.note.trim(),
              by: clock.user(),
              at: clock.now(),
            },
          },
        ]);
        await writeLedgerFile(ledgerPath, currentLedger);
        activeCards = await buildCards(currentLedger);
        return activeCards;
      }
      if (!isVerdict(decision.verdict)) {
        throw new Error(`review: unknown verdict '${decision.verdict}'.`);
      }
      const verdict = decision.verdict;
      reviewLedgerSnapshots.set(
        decision.shape,
        card.cluster.map(
          (subject) => [subject, currentLedger.get(subject)] as const,
        ),
      );
      const attestations = card.cluster.map((subject): Attestation => {
        const observation = observations.get(subject);
        if (!observation) {
          throw new Error(`review: '${subject}' disappeared from the run.`);
        }
        const previous = currentLedger.get(subject);
        const acceptedReference = !isAccepted(verdict)
          ? (previous?.acceptedReference ??
            (previous && isAccepted(previous.verdict)
              ? {
                  fingerprint: previous.fingerprint,
                  evidence: previous.evidence,
                }
              : undefined))
          : undefined;
        return {
          subject,
          kind: observation.kind,
          fingerprint: observation.fingerprint,
          evidence: observation.evidence,
          verdict,
          assumptions: observation.assumptions ?? [],
          by: clock.user(),
          at: clock.now(),
          toolVersion: TOOL_VERSION,
          ...(decision.note ? { note: decision.note } : {}),
          ...(acceptedReference ? { acceptedReference } : {}),
          ...(observation.screenshotComparison
            ? {
                screenshotPolicy: observation.screenshotComparison.policyHash,
                screenshotComparison: observation.screenshotComparison,
              }
            : {}),
          // A finding names a node of *this* subject; the server refuses one
          // that does not, so what lands here is already checked.
          ...(decision.findings && decision.findings.length > 0
            ? { findings: decision.findings }
            : {}),
          ...(decision.degraded && observation.evidenceMode !== 'screenshot'
            ? { degraded: true as const }
            : {}),
          ...(card.cluster.length > 1 ? { cluster: card.cluster } : {}),
        };
      });
      currentLedger = withAttestations(currentLedger, attestations);
      await writeLedgerFile(ledgerPath, currentLedger);
      activeCards = await buildCards(currentLedger);
      return activeCards;
    },
    onReopen: async ({ decision }) => {
      const snapshot = reviewLedgerSnapshots.get(decision.shape);
      if (!snapshot) {
        throw new Error(
          'review: the accepted decision cannot be restored in this session.',
        );
      }
      const restored = new Map(currentLedger);
      for (const [subject, attestation] of snapshot) {
        if (attestation) restored.set(subject, attestation);
        else restored.delete(subject);
      }
      currentLedger = restored;
      await writeLedgerFile(ledgerPath, currentLedger);
      reviewLedgerSnapshots.delete(decision.shape);
      activeCards = await buildCards(currentLedger);
      return activeCards;
    },
  });
  io.write(`Review queue at ${running.url}`);
  io.write(
    `If it did not open automatically, open ${running.url} in a browser.`,
  );
  io.write(
    '  j/k move · a accept · n accept with a note · r reject · ^C to stop',
  );
  openReviewUrl(running.url);
  // The command owns the process until the reviewer is done. Returning here
  // would close the socket the moment the queue opened.
  process.once('SIGINT', () => {
    void running.close().then(finishReview);
  });
  await reviewFinished;
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
