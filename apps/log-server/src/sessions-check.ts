/**
 * The last base-against-head check of an app (`npm run sessions:check`), as
 * the dashboard's suite page shows it, and the approval of a change it found.
 *
 * The check runs on the developer's machine and leaves its report under
 * `tmp/sessions-check/<app>/report.json` of the repository. The server only
 * reads it; an approval is the command's (`--approve`), run here: the
 * attestation register has one writer, and a regression is refused there.
 */
import { execFile } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const LAUNCHER = join('tools', 'sessions-check', 'sessions-check.mjs');
const REPORTS = join('tmp', 'sessions-check');

export type SessionsCheckReport = Readonly<{ app: string; report: Record<string, unknown> }>;

export type SessionsCheckApproval =
  | Readonly<{ approved: true; output: string; report: SessionsCheckReport | undefined }>
  | Readonly<{ approved: false; message: string }>;

export type SessionsCheckAccess = Readonly<{
  /** The last check whose sessions were recorded at `origin`. */
  report(origin: string): SessionsCheckReport | undefined;
  approve(origin: string, sessionId: string): Promise<SessionsCheckApproval>;
}>;

/** The repository the server runs in, if it has the command: from `start` up. */
export function findSessionsCheckRepository(start: string): string | undefined {
  for (let directory = resolve(start); ; directory = dirname(directory)) {
    if (existsSync(join(directory, LAUNCHER))) return directory;
    if (dirname(directory) === directory) return undefined;
  }
}

export type SessionsCheckAccessOptions = Readonly<{
  repository: string;
  /** Runs the command; `node <launcher> …` in the repository by default. */
  run?: (args: readonly string[]) => Promise<Readonly<{ code: number; stdout: string; stderr: string }>>;
}>;

export function createSessionsCheckAccess(options: SessionsCheckAccessOptions): SessionsCheckAccess {
  const run =
    options.run ??
    ((args: readonly string[]) =>
      new Promise<{ code: number; stdout: string; stderr: string }>((done) => {
        execFile(
          process.execPath,
          [join(options.repository, LAUNCHER), ...args],
          { cwd: options.repository, maxBuffer: 8 * 1024 * 1024, timeout: 120_000 },
          (error, stdout, stderr) => done({ code: error ? (typeof error.code === 'number' ? error.code : 1) : 0, stdout, stderr }),
        );
      }));
  const report = (origin: string): SessionsCheckReport | undefined => {
    const directory = join(options.repository, REPORTS);
    if (!existsSync(directory)) return undefined;
    const found = readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap((entry) => {
        const file = join(directory, entry.name, 'report.json');
        try {
          const parsed = JSON.parse(readFileSync(file, 'utf8')) as unknown;
          if (!isRecord(parsed) || parsed['format'] !== 'craft-golden-check' || parsed['origin'] !== origin) return [];
          return [{ app: entry.name, report: parsed, at: statSync(file).mtimeMs }];
        } catch {
          return [];
        }
      })
      .sort((left, right) => right.at - left.at);
    return found[0] && { app: found[0].app, report: found[0].report };
  };
  return {
    report,
    async approve(origin, sessionId) {
      const last = report(origin);
      if (!last) return { approved: false, message: `Aucune vérification de ${origin} : lancez npm run sessions:check -- --base <ref>.` };
      const result = await run(['--approve', sessionId, '--app', last.app]);
      if (result.code !== 0)
        return { approved: false, message: (result.stderr.trim() || result.stdout.trim()).split('\n').slice(-3).join('\n') || `Approbation refusée (code ${result.code}).` };
      return { approved: true, output: result.stdout.trim(), report: report(origin) };
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
