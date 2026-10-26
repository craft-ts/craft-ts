import {
  provideAppInitializer,
  ɵinjectCraftMethodReplayRegistry,
  ɵinjectCraftPrimitiveRegistry,
  ɵinjectPersistedStorageSnapshotRegistry,
  ɵregisterCraftMcpBridgeMethod,
  type SendContextReplayExport,
} from '@craft-ts/core';
import type { Provider } from '../host-runtime';
import {
  buildDebugAppSnapshot,
  type DebugAppSnapshot,
} from './debug-session-app-snapshot';
import { validateDebugSessionExport } from './debug-session-replay';
import { handOff, parseHandoffRequest } from './guided-resume-handoff';
import { ɵreviveReplayArgument } from './debug-session-replay-bridge';
import {
  restoreDebugAppSnapshot,
  type DebugSnapshotRestoreOptions,
} from './debug-session-snapshot-launch';

/**
 * Guided resume: an AI, through the function registry MCP, brings this tab to
 * the state a recorded session had at one point. The tab reads the archive
 * from the local log server itself, so nothing but ids crosses the bridge.
 *
 * Methods added to the bridge: `app/launch`, `app/diff`, `app/replay`,
 * `app/writes`, `app/handoff`. Once a launch has happened the tab is in guided mode for the
 * rest of its session: writes to another origin are held, the others journaled.
 */
export type CraftGuidedResumeOptions = Readonly<{
  /** The log server that holds the archives; the local one by default. */
  logServerUrl?: string;
}>;

export const CRAFT_GUIDED_RESUME_QUERY_PARAM = 'craft-resume';
const BEFORE_PARAM = 'craft-resume-before';
const PARTICIPANT_PARAM = 'craft-resume-participant';
const MODE_KEY = 'craft-ts.guided-resume.mode';
const JOURNAL_KEY = 'craft-ts.guided-resume.writes';
const LAST_LAUNCH_KEY = 'craft-ts.guided-resume.last-launch';
const DEFAULT_LOG_SERVER_URL = 'http://127.0.0.1:4319';
const MAX_JOURNAL = 200;
const MAX_DIFFERENCES = 60;
const VALUE_LIMIT = 400;
const REFERENCE_PLACEHOLDER = 'craft-ref:';

export type GuidedResumeWrite = Readonly<{
  at: string;
  method: string;
  url: string;
  status: 'allowed' | 'held';
}>;

export type GuidedResumePoint = Readonly<{
  sessionId: string;
  beforeSequence?: number;
  participantId?: string;
}>;

export type GuidedResumeDifference = Readonly<{
  address: string;
  status: 'different' | 'missing' | 'extra';
  expected?: unknown;
  actual?: unknown;
}>;

export function provideCraftGuidedResume(
  options: CraftGuidedResumeOptions = {},
): Provider[] {
  const logServerUrl = (options.logServerUrl ?? DEFAULT_LOG_SERVER_URL).replace(/\/$/, '');
  return [
    provideAppInitializer(() => {
      if (typeof window === 'undefined') return;
      const restoreOptions: DebugSnapshotRestoreOptions = {
        registry: ɵinjectCraftPrimitiveRegistry(),
        storageRegistry: ɵinjectPersistedStorageSnapshotRegistry(),
        methods: ɵinjectCraftMethodReplayRegistry(),
        reviveArgument: ɵreviveReplayArgument,
      };
      if (readMode()) ɵinstallGuidedResumeWriteBarrier(logServerUrl);
      const archives = (sessionId: string) => fetchArchive(logServerUrl, sessionId);
      ɵregisterCraftMcpBridgeMethod('app/launch', (params) =>
        launch(params, archives),
      );
      ɵregisterCraftMcpBridgeMethod('app/diff', async (params) =>
        diffWithPoint(
          await targetSnapshot(parsePoint(params), archives),
          restoreOptions,
        ),
      );
      ɵregisterCraftMcpBridgeMethod('app/replay', (params) =>
        replayMethod(params, restoreOptions),
      );
      ɵregisterCraftMcpBridgeMethod('app/handoff', (params) =>
        handOff(parseHandoffRequest(params), restoreOptions.registry),
      );
      ɵregisterCraftMcpBridgeMethod('app/writes', () => ({
        active: readMode(),
        writes: readJournal(),
        lastLaunch: readJson(LAST_LAUNCH_KEY),
      }));
      return launchFromUrl(archives, restoreOptions);
    }),
  ];
}

/* ── launching on a point ───────────────────────────────────────────────── */

type ArchiveReader = (sessionId: string) => Promise<SendContextReplayExport>;

async function launch(
  params: Readonly<Record<string, unknown>>,
  archives: ArchiveReader,
): Promise<unknown> {
  writeJson(MODE_KEY, true);
  let url: URL;
  let warnings: readonly string[] = [];
  if (params['sessionId'] === undefined) {
    url = new URL('/', location.href);
  } else {
    const point = parsePoint(params);
    const snapshot = await targetSnapshot(point, archives);
    warnings = snapshot.warnings;
    url = new URL(snapshot.route, location.href);
    url.searchParams.set(CRAFT_GUIDED_RESUME_QUERY_PARAM, point.sessionId);
    if (point.beforeSequence !== undefined)
      url.searchParams.set(BEFORE_PARAM, String(point.beforeSequence));
    if (point.participantId !== undefined)
      url.searchParams.set(PARTICIPANT_PARAM, point.participantId);
  }
  // Answer first: the reload closes the bridge socket.
  setTimeout(() => location.assign(url.href), 50);
  return {
    reloading: true,
    url: url.href,
    warnings,
    next: 'Call app.diff once the tab is back (the bridge waits for it).',
  };
}

/** The tab was reloaded by `app/launch`: restore the point before rendering. */
async function launchFromUrl(
  archives: ArchiveReader,
  options: DebugSnapshotRestoreOptions,
): Promise<void> {
  const search = new URLSearchParams(location.search);
  const sessionId = search.get(CRAFT_GUIDED_RESUME_QUERY_PARAM);
  if (!sessionId) return;
  const before = search.get(BEFORE_PARAM);
  const participantId = search.get(PARTICIPANT_PARAM);
  const point: GuidedResumePoint = {
    sessionId,
    ...(before !== null && /^\d+$/.test(before) ? { beforeSequence: Number(before) } : {}),
    ...(participantId ? { participantId } : {}),
  };
  try {
    const snapshot = await targetSnapshot(point, archives);
    const runId = `${point.sessionId}:${point.beforeSequence ?? 'end'}`;
    const restored = await restoreDebugAppSnapshot(snapshot, runId, options);
    if (restored === 'reloading') return new Promise<void>(() => undefined);
    writeJson(LAST_LAUNCH_KEY, { ...point, warnings: restored.warnings });
    void restored.inFlight?.then((result) =>
      writeJson(LAST_LAUNCH_KEY, { ...point, warnings: restored.warnings, inFlight: result }),
    );
  } catch (error) {
    writeJson(LAST_LAUNCH_KEY, {
      ...point,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  const url = new URL(location.href);
  for (const name of [CRAFT_GUIDED_RESUME_QUERY_PARAM, BEFORE_PARAM, PARTICIPANT_PARAM])
    url.searchParams.delete(name);
  history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

function parsePoint(params: Readonly<Record<string, unknown>>): GuidedResumePoint {
  const sessionId = params['sessionId'];
  if (typeof sessionId !== 'string' || sessionId.length === 0)
    throw new Error('sessionId is required.');
  const before = params['beforeSequence'];
  const participantId = params['participantId'];
  return {
    sessionId,
    ...(typeof before === 'number' ? { beforeSequence: before } : {}),
    ...(typeof participantId === 'string' ? { participantId } : {}),
  };
}

async function fetchArchive(
  logServerUrl: string,
  sessionId: string,
): Promise<SendContextReplayExport> {
  const response = await fetch(`${logServerUrl}/sessions/${encodeURIComponent(sessionId)}`);
  if (!response.ok) throw new Error(`Session ${sessionId} not found (HTTP ${response.status}).`);
  const validation = validateDebugSessionExport(await response.text());
  if (!validation.ok) throw new Error(validation.error);
  return validation.session;
}

async function targetSnapshot(
  point: GuidedResumePoint,
  archives: ArchiveReader,
): Promise<DebugAppSnapshot> {
  const archive = await archives(point.sessionId);
  return buildDebugAppSnapshot(
    participantArchive(archive, point),
    point.beforeSequence,
  );
}

/**
 * One recorded tab: the one named, else the one that acted last before the
 * point. A single-tab recording is used as it is.
 */
export function participantArchive(
  archive: SendContextReplayExport,
  point: Pick<GuidedResumePoint, 'beforeSequence' | 'participantId'>,
): SendContextReplayExport {
  const participants = archive.participants ?? [];
  if (participants.length <= 1) return archive;
  const owner =
    point.participantId ??
    archive.events
      .filter(
        (event) =>
          point.beforeSequence === undefined || event.sequence < point.beforeSequence,
      )
      .reduce<string | undefined>(
        (last, event) => event.participantId ?? last,
        undefined,
      );
  const participant = participants.find((item) => item.id === owner);
  if (!participant) return archive;
  const { initialSnapshot: _initialSnapshot, ...base } = archive;
  return {
    ...base,
    startUrl: participant.startUrl,
    ...(participant.initialSnapshot ? { initialSnapshot: participant.initialSnapshot } : {}),
    events: archive.events.filter((event) => event.participantId === participant.id),
  };
}

/* ── comparing the live tab with the point ─────────────────────────────── */

export function diffWithPoint(
  snapshot: DebugAppSnapshot,
  options: Pick<DebugSnapshotRestoreOptions, 'registry'>,
): unknown {
  const actualRoute = liveRoute();
  const live = byOrdinalFreeAddress(options.registry.capture());
  const expected = byOrdinalFreeAddress(snapshot.primitives);
  const differences: GuidedResumeDifference[] = [];
  let equal = 0;
  for (const [address, value] of expected) {
    if (!live.has(address)) {
      differences.push({ address, status: 'missing', expected: summarize(value) });
      continue;
    }
    const actual = live.get(address);
    if (equivalent(value, actual)) equal++;
    else
      differences.push({
        address,
        status: 'different',
        expected: summarize(value),
        actual: summarize(actual),
      });
  }
  const extra = [...live.keys()].filter((address) => !expected.has(address));
  return {
    route: {
      expected: snapshot.route,
      actual: actualRoute,
      equal: sameRoute(snapshot.route, actualRoute),
    },
    equal,
    differences: differences.slice(0, MAX_DIFFERENCES),
    ...(differences.length > MAX_DIFFERENCES
      ? { omitted: differences.length - MAX_DIFFERENCES }
      : {}),
    extra: extra.slice(0, 20),
    warnings: snapshot.warnings,
  };
}

function liveRoute(): string {
  const url = new URL(location.href);
  for (const name of [CRAFT_GUIDED_RESUME_QUERY_PARAM, BEFORE_PARAM, PARTICIPANT_PARAM])
    url.searchParams.delete(name);
  return `${url.pathname}${url.search}${url.hash}`;
}

function sameRoute(left: string, right: string): boolean {
  const normalize = (route: string) => {
    const url = new URL(route, 'http://route.invalid');
    url.searchParams.sort();
    return `${url.pathname.replace(/\/$/, '') || '/'}${url.search}${url.hash}`;
  };
  return normalize(left) === normalize(right);
}

function ordinalFree(address: string): string {
  return address
    .split(' / ')
    .map((part) => part.replace(/#\d+$/, ''))
    .join(' / ');
}

function byOrdinalFreeAddress(
  values: Readonly<Record<string, unknown>>,
): Map<string, unknown> {
  const map = new Map<string, unknown>();
  for (const [address, value] of Object.entries(values)) {
    const key = ordinalFree(address);
    if (!map.has(key)) map.set(key, value);
  }
  return map;
}

/**
 * Equal as JSON, where a redacted reference of the recording (`craft-ref:…`)
 * stands for any value: the live app has its own ids.
 */
function equivalent(expected: unknown, actual: unknown): boolean {
  if (typeof expected === 'string' && expected.startsWith(REFERENCE_PLACEHOLDER))
    return actual !== undefined;
  if (Array.isArray(expected))
    return (
      Array.isArray(actual) &&
      actual.length === expected.length &&
      expected.every((item, index) => equivalent(item, actual[index]))
    );
  if (isRecord(expected)) {
    if (!isRecord(actual)) return false;
    const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
    return [...keys].every((key) => equivalent(expected[key], actual[key]));
  }
  if (expected instanceof Date || actual instanceof Date)
    return toJson(expected) === toJson(actual);
  return Object.is(expected, actual) || toJson(expected) === toJson(actual);
}

function summarize(value: unknown): unknown {
  const json = toJson(value);
  if (json === undefined || json.length <= VALUE_LIMIT) return value;
  return `${json.slice(0, VALUE_LIMIT)}… (${json.length} caractères)`;
}

function toJson(value: unknown): string | undefined {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/* ── replaying one recorded gesture ─────────────────────────────────────── */

async function replayMethod(
  params: Readonly<Record<string, unknown>>,
  options: DebugSnapshotRestoreOptions,
): Promise<unknown> {
  const requested = params['address'];
  if (typeof requested !== 'string') throw new Error('address is required.');
  const addresses = options.methods.addresses();
  const wanted = ordinalFree(requested);
  const matches = addresses.includes(requested)
    ? [requested]
    : addresses.filter((address) => ordinalFree(address) === wanted);
  const address = matches.length === 1 ? matches[0] : undefined;
  if (address === undefined)
    throw new Error(
      matches.length === 0
        ? `No live method at ${requested}. Live methods: ${addresses.slice(0, 15).join(', ') || 'none'}.`
        : `${matches.length} live methods match ${requested}: ${matches.join(', ')}. Pass the exact address.`,
    );
  const args = Array.isArray(params['args']) ? params['args'] : [];
  const result = await options.methods.invoke(
    address,
    undefined,
    args.map(options.reviveArgument),
  );
  return { address, settled: true, result: summarize(result) ?? null };
}

/* ── the write barrier ──────────────────────────────────────────────────── */

let barrierInstalled = false;

/**
 * Writes the resume must not make for real elsewhere are held: a request with
 * a body to another origin than the app's never leaves. Same-origin and
 * loopback writes go through — the app's own backend and the dev tools — and
 * are journaled, so `app/writes` tells what the resume created.
 */
export function ɵinstallGuidedResumeWriteBarrier(logServerUrl: string): void {
  if (barrierInstalled || typeof globalThis.fetch !== 'function') return;
  barrierInstalled = true;
  const nativeFetch = globalThis.fetch.bind(globalThis);
  const quiet = new URL(logServerUrl).origin;
  globalThis.fetch = (input, init) => {
    const isRequest = typeof Request !== 'undefined' && input instanceof Request;
    const method = (init?.method ?? (isRequest ? input.method : 'GET')).toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS')
      return nativeFetch(input, init);
    const target = new URL(
      isRequest ? input.url : input instanceof URL ? input.href : String(input),
      location.href,
    );
    if (target.origin === quiet) return nativeFetch(input, init);
    const held = target.origin !== location.origin && !isLoopback(target.hostname);
    appendJournal({
      at: new Date().toISOString(),
      method,
      url: `${target.origin}${target.pathname}`,
      status: held ? 'held' : 'allowed',
    });
    if (!held) return nativeFetch(input, init);
    console.warn(`[craft guided resume] write held: ${method} ${target.origin}${target.pathname}`);
    return Promise.reject(
      new TypeError(`Écriture retenue par la reprise guidée : ${method} ${target.origin}${target.pathname}`),
    );
  };
}

function isLoopback(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname.endsWith('.localhost')
  );
}

function readMode(): boolean {
  return readJson(MODE_KEY) === true;
}

export function ɵreadGuidedResumeWrites(): readonly GuidedResumeWrite[] {
  return readJournal();
}

function readJournal(): readonly GuidedResumeWrite[] {
  const value = readJson(JOURNAL_KEY);
  return Array.isArray(value) ? (value as GuidedResumeWrite[]) : [];
}

function appendJournal(write: GuidedResumeWrite): void {
  writeJson(JOURNAL_KEY, [...readJournal(), write].slice(-MAX_JOURNAL));
}

function readJson(key: string): unknown {
  try {
    const text = window.sessionStorage.getItem(key);
    return text === null ? undefined : JSON.parse(text);
  } catch {
    return undefined;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The journal is best effort; the barrier itself does not depend on it.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
