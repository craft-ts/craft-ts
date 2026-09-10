/**
 * The handoff between a human attestation review and the next code iteration.
 *
 * The review card remains the source of truth. This module only turns the
 * rejected cards into two durable, project-relative documents: one for people
 * and one for tools. The generated Codex prompt points at the documents rather
 * than copying the whole review into a chat message.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import type {
  ReviewCard as AttestationReviewCard,
  PreviousDecision,
} from '@craft-ts/dev-tools/attestation-review';

export interface ReviewIterationOptions {
  /** Absolute project root used to make every path portable inside the repo. */
  readonly rootDir: string;
  /** The report that produced this review, when there is one. */
  readonly reportPath?: string;
  /** Absolute paths are accepted so custom CLI options remain unambiguous. */
  readonly ledgerPath: string;
  readonly evidenceDirectory: string;
  readonly tsconfigPath?: string;
  readonly regenerationScript?: string;
  readonly now?: () => string;
}

export interface ReviewIterationItem {
  readonly cardId: string;
  readonly kind: AttestationReviewCard['kind'];
  readonly subjects: readonly string[];
  readonly scenarios: readonly string[];
  readonly sourcePaths: readonly string[];
  readonly component?: string;
  readonly reason: string;
  readonly comment: string;
  readonly changes: readonly string[];
  readonly findings: readonly {
    readonly path: string;
    readonly note: string;
  }[];
  readonly degraded?: true;
  readonly evidence?: readonly {
    readonly subject: string;
    readonly digestPath?: string;
    readonly imagePath?: string;
    readonly snapshotPath?: string;
  }[];
  readonly statement?: string;
}

export interface ReviewIterationFeedback {
  readonly format: 'craft-ts-review-feedback';
  readonly version: 1;
  readonly generatedAt: string;
  readonly project: {
    readonly root: string;
    readonly rootAbsolute: string;
    readonly report?: string;
    readonly ledger: string;
    readonly evidenceDirectory: string;
    readonly tsconfig?: string;
    readonly regenerationScript?: string;
  };
  readonly rejectedCards: readonly ReviewIterationItem[];
}

export interface ReviewIterationResult {
  readonly rejectedCards: number;
  readonly feedbackPath: string;
  readonly feedbackJsonPath: string;
  readonly promptPath: string;
  readonly prompt: string;
  readonly feedback: ReviewIterationFeedback;
}

const relativePath = (rootDir: string, path: string): string => {
  const value = relative(rootDir, path).split('\\').join('/');
  return value === '' ? '.' : value;
};

const componentSourcePath = (value: string): string | undefined => {
  const withoutSubject = value.split('#', 1)[0] ?? value;
  const component = withoutSubject
    .replace(/^visual:/, '')
    .replace(/^component:/, '');
  const separator = component.lastIndexOf(':');
  return separator > 0 ? component.slice(0, separator) : undefined;
};

const scenarioOf = (subject: string): string => {
  const separator = subject.indexOf('#');
  return separator === -1 ? subject : subject.slice(separator + 1);
};

const sourcePathsOf = (card: AttestationReviewCard): readonly string[] => {
  const candidates: readonly (string | undefined)[] =
    card.kind === 'visual'
      ? card.cluster.map(componentSourcePath)
      : [componentSourcePath(card.component)];
  return [
    ...new Set(candidates.filter((path): path is string => Boolean(path))),
  ].sort();
};

const previousDecisionOf = (
  card: AttestationReviewCard,
): PreviousDecision | undefined => card.previousDecision;

const evidencePath = (
  rootDir: string,
  evidenceDirectory: string,
  hash: string | undefined,
  extension: string,
): string | undefined =>
  hash
    ? relativePath(
        rootDir,
        join(evidenceDirectory, hash.slice(0, 2), `${hash}${extension}`),
      )
    : undefined;

const itemOf = (
  card: AttestationReviewCard,
  options: ReviewIterationOptions,
): ReviewIterationItem | undefined => {
  const previous = previousDecisionOf(card);
  if (previous?.verdict !== 'rejected') return undefined;
  const comment = previous.note?.trim() || card.rejectionReason?.trim();
  if (!comment) return undefined;

  const evidence =
    card.kind === 'visual'
      ? card.members.map((member) => ({
          subject: member.subject,
          ...(evidencePath(
            options.rootDir,
            options.evidenceDirectory,
            member.evidence,
            '.digest.json',
          )
            ? {
                digestPath: evidencePath(
                  options.rootDir,
                  options.evidenceDirectory,
                  member.evidence,
                  '.digest.json',
                ),
              }
            : {}),
          ...(evidencePath(
            options.rootDir,
            options.evidenceDirectory,
            member.image,
            '.png',
          )
            ? {
                imagePath: evidencePath(
                  options.rootDir,
                  options.evidenceDirectory,
                  member.image,
                  '.png',
                ),
              }
            : {}),
          ...(evidencePath(
            options.rootDir,
            options.evidenceDirectory,
            member.snapshot,
            '.snapshot.html',
          )
            ? {
                snapshotPath: evidencePath(
                  options.rootDir,
                  options.evidenceDirectory,
                  member.snapshot,
                  '.snapshot.html',
                ),
              }
            : {}),
        }))
      : undefined;

  return {
    cardId: card.id,
    kind: card.kind,
    subjects: [...card.cluster],
    scenarios: card.cluster.map(scenarioOf),
    sourcePaths: sourcePathsOf(card),
    ...(card.kind !== 'visual' ? { component: card.component } : {}),
    reason: card.reason,
    comment,
    changes: card.changes,
    findings: previous.findings ?? [],
    ...(previous.degraded ? { degraded: true as const } : {}),
    ...(evidence ? { evidence } : {}),
    ...(card.kind === 'template' ? { statement: card.statement } : {}),
  };
};

const outputStem = (options: ReviewIterationOptions): string => {
  const report = options.reportPath
    ? basename(options.reportPath, extname(options.reportPath))
    : 'attestation-review';
  return report || 'attestation-review';
};

export const reviewIterationPaths = (options: ReviewIterationOptions) => {
  const directory = options.reportPath
    ? dirname(options.reportPath)
    : join(options.rootDir, '.craft', 'runs');
  const stem = outputStem(options);
  return {
    feedbackPath: join(directory, `${stem}.review-feedback.md`),
    feedbackJsonPath: join(directory, `${stem}.review-feedback.json`),
    promptPath: join(directory, `${stem}.codex-prompt.md`),
  };
};

const bullet = (value: string): string => `- ${value}`;

const markdownFor = (
  feedback: ReviewIterationFeedback,
  paths: ReturnType<typeof reviewIterationPaths>,
  options: ReviewIterationOptions,
): string => {
  const project = feedback.project;
  const items = feedback.rejectedCards
    .map((item, index) => {
      const lines = [
        `## ${index + 1}. ${item.kind} — ${item.scenarios.join(', ')}`,
        '',
        `- Card: \`${item.cardId}\``,
        `- Source file(s): ${item.sourcePaths.length > 0 ? item.sourcePaths.map((path) => `\`${path}\``).join(', ') : 'not resolved from the graph id'}`,
        `- Subject(s): ${item.subjects.map((subject) => `\`${subject}\``).join(', ')}`,
        `- Why it was queued: ${item.reason}`,
        `- Review comment: ${item.comment}`,
      ];
      if (item.component) lines.push(`- Component: \`${item.component}\``);
      if (item.statement) lines.push(`- Template statement: ${item.statement}`);
      if (item.changes.length > 0) {
        lines.push('', '**Measured changes**', '', ...item.changes.map(bullet));
      }
      if (item.findings.length > 0) {
        lines.push(
          '',
          '**Pointed nodes**',
          '',
          ...item.findings.map(
            (finding) => `- \`${finding.path}\`: ${finding.note}`,
          ),
        );
      }
      if (item.evidence?.length) {
        lines.push(
          '',
          '**Evidence files**',
          '',
          ...item.evidence.flatMap((entry) => [
            `- \`${entry.subject}\``,
            ...(entry.digestPath
              ? [`  - digest: \`${entry.digestPath}\``]
              : []),
            ...(entry.imagePath
              ? [`  - screenshot: \`${entry.imagePath}\``]
              : []),
            ...(entry.snapshotPath
              ? [`  - snapshot: \`${entry.snapshotPath}\``]
              : []),
          ]),
        );
      }
      if (item.degraded) {
        lines.push(
          '',
          '> This rejection was recorded without a faithful replay.',
        );
      }
      return lines.join('\n');
    })
    .join('\n\n');

  return [
    '# CraftTS review feedback',
    '',
    `Generated: ${feedback.generatedAt}`,
    `Rejected decision cards: ${feedback.rejectedCards.length}`,
    '',
    '## Project context',
    '',
    `- Project root: \`${project.root}\``,
    `- Absolute project root: \`${project.rootAbsolute}\``,
    ...(project.report ? [`- Report: \`${project.report}\``] : []),
    `- Ledger: \`${project.ledger}\``,
    `- Evidence directory: \`${project.evidenceDirectory}\``,
    ...(project.tsconfig ? [`- Graph tsconfig: \`${project.tsconfig}\``] : []),
    ...(project.regenerationScript
      ? [`- Capture script: \`npm run ${project.regenerationScript}\``]
      : []),
    `- This file: \`${relativePath(options.rootDir, paths.feedbackPath)}\``,
    '',
    '## Instructions for the next iteration',
    '',
    'Correct the source files named below. Do not edit the attestation ledger to hide a rejection and do not modify accepted evidence as a substitute for fixing the source.',
    '',
    items ||
      '_No rejected cards were present when this handoff was generated._',
    '',
  ].join('\n');
};

const promptFor = (
  feedback: ReviewIterationFeedback,
  paths: ReturnType<typeof reviewIterationPaths>,
  options: ReviewIterationOptions,
): string => {
  const feedbackRelative = relativePath(options.rootDir, paths.feedbackPath);
  const feedbackAbsolute = resolve(paths.feedbackPath);
  const report = feedback.project.report
    ? `\n- Report: \`${feedback.project.report}\``
    : '';
  const capture = feedback.project.regenerationScript
    ? `\n- After changes, rerun the capture with \`npm run ${feedback.project.regenerationScript}\`.`
    : '';
  return [
    '# Codex iteration prompt',
    '',
    'You are continuing a CraftTS visual/template attestation workflow.',
    '',
    'Read the complete review feedback before changing anything:',
    `- Relative path: \`${feedbackRelative}\``,
    `- Absolute path: \`${feedbackAbsolute}\``,
    '',
    'Project context:',
    `- Work from the project root: \`${feedback.project.rootAbsolute}\``,
    `- Ledger: \`${feedback.project.ledger}\``,
    `- Evidence directory: \`${feedback.project.evidenceDirectory}\`${report}`,
    ...(feedback.project.tsconfig
      ? [`- Dependency graph tsconfig: \`${feedback.project.tsconfig}\``]
      : []),
    '',
    'For every rejected card in the feedback file:',
    '1. Inspect the source file(s) and the surrounding implementation.',
    '2. Map each review comment and pointed node back to the source that produced it.',
    '3. Implement the smallest correct source-level fix, preserving accepted variants and unrelated behavior.',
    '4. Run the relevant tests, architecture checks, and visual capture when available.',
    '5. Report what changed, what was verified, and any comment that still needs a human review.',
    capture,
    '',
    'Do not mark the rejection as accepted yourself. The human reviewer will perform the next attestation after the correction.',
    '',
  ].join('\n');
};

export async function writeReviewIterationHandoff(
  cards: readonly AttestationReviewCard[],
  options: ReviewIterationOptions,
): Promise<ReviewIterationResult> {
  const generatedAt = options.now?.() ?? new Date().toISOString();
  const paths = reviewIterationPaths(options);
  const rejectedCards = cards
    .map((card) => itemOf(card, options))
    .filter((item): item is ReviewIterationItem => Boolean(item));
  const feedback: ReviewIterationFeedback = {
    format: 'craft-ts-review-feedback',
    version: 1,
    generatedAt,
    project: {
      root: relativePath(options.rootDir, options.rootDir),
      rootAbsolute: resolve(options.rootDir),
      ...(options.reportPath
        ? { report: relativePath(options.rootDir, options.reportPath) }
        : {}),
      ledger: relativePath(options.rootDir, options.ledgerPath),
      evidenceDirectory: relativePath(
        options.rootDir,
        options.evidenceDirectory,
      ),
      ...(options.tsconfigPath
        ? { tsconfig: relativePath(options.rootDir, options.tsconfigPath) }
        : {}),
      ...(options.regenerationScript
        ? { regenerationScript: options.regenerationScript }
        : {}),
    },
    rejectedCards,
  };
  const markdown = markdownFor(feedback, paths, options);
  const prompt = promptFor(feedback, paths, options);
  await mkdir(dirname(paths.feedbackPath), { recursive: true });
  await Promise.all([
    writeFile(paths.feedbackPath, markdown, 'utf8'),
    writeFile(
      paths.feedbackJsonPath,
      `${JSON.stringify(feedback, null, 2)}\n`,
      'utf8',
    ),
    writeFile(paths.promptPath, prompt, 'utf8'),
  ]);
  return {
    rejectedCards: rejectedCards.length,
    ...paths,
    prompt,
    feedback,
  };
}
