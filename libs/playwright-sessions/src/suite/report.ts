import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GoldenSessionComparison, GoldenVerdict, MomentComparison } from './compare-runs.js';

export type GoldenCheckReport = Readonly<{
  format: 'craft-golden-check';
  schemaVersion: 1;
  /** The app checked, and where its sessions were recorded, when the check says so. */
  app?: string;
  origin?: string;
  base: string;
  head: string;
  sessions: readonly GoldenSessionComparison[];
  /** Sessions per verdict. */
  counts: Readonly<Record<GoldenVerdict, number>>;
  /** Of the `changed` sessions, those whose very difference a person approved. */
  approved: number;
  /** Whether a person or a fix is needed: a regression, or a change nobody approved yet. */
  passed: boolean;
}>;

export type GoldenCheckReportOptions = Readonly<{
  app?: string;
  origin?: string;
  /**
   * Whether a person approved the difference of a `changed` session (see
   * `isGoldenChangeApproved`). Asked of nothing else: a regression is never
   * approved.
   */
  isApproved?: (session: GoldenSessionComparison) => boolean;
}>;

const APPROVED = '✅ changement approuvé';

function verdictLabel(session: GoldenSessionComparison): string {
  return session.approved ? APPROVED : LABEL[session.verdict];
}

const ORDER: readonly GoldenVerdict[] = ['regression', 'changed', 'flaky', 'stale', 'unchanged'];
const LABEL: Readonly<Record<GoldenVerdict, string>> = {
  regression: '🔴 régression',
  changed: '🟡 changé',
  flaky: '🟠 instable',
  stale: '⚪ à réenregistrer',
  unchanged: '🟢 inchangé',
};

export function goldenCheckReport(
  compared: readonly GoldenSessionComparison[],
  builds: Readonly<{ base: string; head: string }>,
  options: GoldenCheckReportOptions = {},
): GoldenCheckReport {
  // Approved anew on each report: an approval read from an earlier one does not carry.
  const sessions = compared.map(({ approved: _approved, ...session }): GoldenSessionComparison =>
    session.verdict === 'changed' && options.isApproved?.(session) ? { ...session, approved: true } : session,
  );
  const approved = sessions.filter((session) => session.approved).length;
  const counts = Object.fromEntries(ORDER.map((verdict) => [verdict, sessions.filter((session) => session.verdict === verdict).length])) as Record<GoldenVerdict, number>;
  const sorted = [...sessions].sort((a, b) => ORDER.indexOf(a.verdict) - ORDER.indexOf(b.verdict) || (a.sessionId < b.sessionId ? -1 : 1));
  return {
    format: 'craft-golden-check',
    schemaVersion: 1,
    ...(options.app === undefined ? {} : { app: options.app }),
    ...(options.origin === undefined ? {} : { origin: options.origin }),
    ...builds,
    sessions: sorted,
    counts,
    approved,
    passed: counts.regression === 0 && counts.changed === approved,
  };
}

/** The report a person reads, e.g. in a pull request. Image paths are relative to the report. */
export function renderGoldenCheckReport(report: GoldenCheckReport): string {
  const lines = [
    `# Suite de sessions : ${report.base} → ${report.head}`,
    '',
    ORDER.filter((verdict) => report.counts[verdict] > 0)
      .map((verdict) =>
        verdict === 'changed' && report.approved > 0
          ? [report.counts.changed - report.approved > 0 ? `${LABEL.changed} : ${report.counts.changed - report.approved}` : '', `${APPROVED} : ${report.approved}`].filter(Boolean).join(' · ')
          : `${LABEL[verdict]} : ${report.counts[verdict]}`)
      .join(' · ') || 'Aucune session.',
    '',
    '| session | verdict | pourquoi | base | tête |',
    '| --- | --- | --- | --- | --- |',
    ...report.sessions.map((session) =>
      `| \`${session.sessionId}\` | ${verdictLabel(session)} | ${escapeCell(session.reason)} | ${run(session.base)} | ${run(session.head)} |`),
  ];
  for (const session of report.sessions.filter((item) => item.verdict === 'regression' || item.verdict === 'changed')) {
    lines.push('', `## ${verdictLabel(session)} · \`${session.sessionId}\``, '', session.reason);
    if (session.change)
      lines.push('', `Empreinte du changement : \`${session.change.fingerprint}\`${session.approved ? ' (approuvée)' : ` — \`npm run sessions:check -- --approve ${session.sessionId.slice(0, 8)}\` l’approuve`}.`);
    if (session.difference)
      lines.push('', '```json', JSON.stringify(session.difference, null, 2).slice(0, 4_000), '```');
    for (const moment of session.moments.filter((item) => item.status !== 'same')) lines.push('', ...renderMoment(session.sessionId, moment));
  }
  if (report.counts.stale > 0)
    lines.push('', 'Les sessions « à réenregistrer » ne se rejouent plus sur la base : elles ne prouvent rien pour ce changement.');
  return `${lines.join('\n')}\n`;
}

function renderMoment(sessionId: string, moment: MomentComparison): string[] {
  const where = `action ${moment.replayIndex}${moment.reasons.length ? ` (${moment.reasons.join(', ')})` : ''}`;
  if (moment.status === 'missing-in-head') return [`### ${where} : absent de la tête`];
  if (moment.status === 'new-in-head') return [`### ${where} : nouveau dans la tête`];
  const lines = [
    `### ${where}`,
    '',
    `${(moment.pixelRatio * 100).toFixed(2)} % des pixels changent (bruit de la base : ${(moment.noisyPixelRatio * 100).toFixed(2)} %)${moment.sizeChanged ? ', taille de l’image changée' : ''} · ${moment.measureChangeCount} mesure(s) changent (${moment.noisyMeasures} instable(s) écartée(s)).`,
    '',
    `| base | tête | différence |`,
    `| --- | --- | --- |`,
    `| ![](${imagePath(sessionId, moment, 'base')}) | ![](${imagePath(sessionId, moment, 'head')}) | ${moment.diffPng || (moment.pixelRatio > 0 && !moment.sizeChanged) ? `![](${imagePath(sessionId, moment, 'diff')})` : '—'} |`,
  ];
  if (moment.measureChanges.length > 0)
    lines.push('', '| mesure | base | tête |', '| --- | --- | --- |', ...moment.measureChanges.map((change) =>
      `| \`${escapeCell(change.path)}\` | ${escapeCell(change.base ?? '—')} | ${escapeCell(change.head ?? '—')} |`));
  if (moment.measureChangeCount > moment.measureChanges.length)
    lines.push('', `… et ${moment.measureChangeCount - moment.measureChanges.length} autre(s).`);
  return lines;
}

/**
 * Writes `report.md`, `report.json` (without pictures) and the pictures of
 * every moment that differs, under `directory`.
 */
export function writeGoldenCheckReport(directory: string, report: GoldenCheckReport): Readonly<{ markdown: string; json: string }> {
  mkdirSync(directory, { recursive: true });
  for (const session of report.sessions)
    for (const moment of session.moments) {
      const pictures = { base: moment.basePng, head: moment.headPng, diff: moment.diffPng };
      for (const [kind, png] of Object.entries(pictures)) {
        if (!png) continue;
        const path = join(directory, imagePath(session.sessionId, moment, kind as 'base' | 'head' | 'diff'));
        mkdirSync(join(path, '..'), { recursive: true });
        writeFileSync(path, png);
      }
    }
  const markdown = join(directory, 'report.md');
  const json = join(directory, 'report.json');
  writeFileSync(markdown, renderGoldenCheckReport(report));
  writeFileSync(json, `${JSON.stringify(report, withoutPictures, 2)}\n`);
  return { markdown, json };
}

function withoutPictures(key: string, value: unknown): unknown {
  return key === 'basePng' || key === 'headPng' || key === 'diffPng' ? undefined : value;
}

function imagePath(sessionId: string, moment: Pick<MomentComparison, 'replayIndex'>, kind: 'base' | 'head' | 'diff'): string {
  return `images/${sessionId}/${String(moment.replayIndex).padStart(3, '0')}-${kind}.png`;
}

function run(summary: GoldenSessionComparison['base']): string {
  return `${summary.status} ${summary.replayIndex}/${summary.total}${summary.unprovenInteractions ? ` · ${summary.unprovenInteractions} non prouvée(s)` : ''}${summary.droppedSteps ? ` · fin non rejouée (${summary.droppedSteps} action(s))` : ''}`;
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}
