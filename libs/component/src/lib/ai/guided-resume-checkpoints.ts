import type { CraftPrimitiveRegistry } from '@craft-ts/core';
import {
  DEBUG_APP_SNAPSHOT_FORMAT,
  isDebugAppSnapshot,
  type DebugAppSnapshot,
} from './debug-session-app-snapshot';
import { captureBrowserStorageSnapshot } from './debug-session-browser-storage';
import {
  restoreDebugAppSnapshot,
  type DebugSnapshotRestoreOptions,
} from './debug-session-snapshot-launch';

/**
 * Resume points as the tab sees them: it captures its own state for the AI to
 * freeze, reopens a frozen point on its own (`?craft-resume-checkpoint=<id>`,
 * no AI involved), and checks a point with its probes — real requests from
 * this tab, so they carry its session.
 */
export const CRAFT_RESUME_CHECKPOINT_QUERY_PARAM = 'craft-resume-checkpoint';
const LAST_CHECKPOINT_KEY = 'craft-ts.guided-resume.last-checkpoint';
const PROBE_DELAY_MS = 500;

export type ResumeProbe = Readonly<{
  method?: string;
  url: string;
  headers?: Readonly<Record<string, string>>;
  body?: unknown;
  expect: Readonly<{ status?: number; match?: readonly string[] }>;
}>;

export type ResumeProbeResult = Readonly<{
  request: string;
  ok: boolean;
  status?: number;
  missing?: readonly string[];
  error?: string;
}>;

type StoredCheckpoint = Readonly<{
  id: string;
  origin: string;
  expiresAt: string;
  ttlReason: string;
  snapshot: unknown;
  recipeId?: string;
  probes?: readonly ResumeProbe[];
  created?: readonly Readonly<{ kind: string; id: string; cleanup?: ResumeProbe }>[];
}>;

export type ResumeCheckpointValidity = Readonly<{
  id: string;
  valid: boolean;
  expired: boolean;
  originMatches: boolean;
  expiresAt: string;
  ttlReason: string;
  probes: readonly ResumeProbeResult[];
}>;

/** The live state, as a snapshot `restoreDebugAppSnapshot` can put back. */
export async function captureLiveSnapshot(
  options: Pick<DebugSnapshotRestoreOptions, 'registry' | 'storageRegistry'>,
): Promise<Readonly<{ origin: string; snapshot: DebugAppSnapshot }>> {
  const browserStorage = await captureBrowserStorageSnapshot();
  return {
    origin: location.origin,
    snapshot: {
      format: DEBUG_APP_SNAPSHOT_FORMAT,
      version: 1,
      route: `${location.pathname}${location.search}${location.hash}`,
      primitives: options.registry.capture(),
      storage: await options.storageRegistry.capture(),
      browserStorage,
      warnings: browserStorage.warnings,
    },
  };
}

export async function fetchCheckpoint(
  logServerUrl: string,
  id: string,
): Promise<StoredCheckpoint> {
  const response = await fetch(`${logServerUrl}/sessions/checkpoints/${encodeURIComponent(id)}`);
  if (!response.ok) throw new Error(`Point de reprise ${id} introuvable (HTTP ${response.status}).`);
  const body = (await response.json()) as { checkpoint?: StoredCheckpoint };
  if (!body.checkpoint) throw new Error(`Point de reprise ${id} illisible.`);
  return body.checkpoint;
}

export async function validateCheckpoint(
  checkpoint: StoredCheckpoint,
  registry: Pick<CraftPrimitiveRegistry, 'capture'>,
): Promise<ResumeCheckpointValidity> {
  const expired = Date.parse(checkpoint.expiresAt) <= Date.now();
  const originMatches = checkpoint.origin === location.origin;
  const probes =
    expired || !originMatches ? [] : await runProbes(checkpoint.probes ?? [], registry);
  return {
    id: checkpoint.id,
    valid: !expired && originMatches && probes.every((probe) => probe.ok),
    expired,
    originMatches,
    expiresAt: checkpoint.expiresAt,
    ttlReason: checkpoint.ttlReason,
    probes,
  };
}

export async function cleanUpCheckpoint(
  checkpoint: StoredCheckpoint,
  registry: Pick<CraftPrimitiveRegistry, 'capture'>,
): Promise<readonly (ResumeProbeResult & Readonly<{ kind: string; id: string }>)[]> {
  const results = [];
  for (const created of checkpoint.created ?? []) {
    if (!created.cleanup) continue;
    const [result] = await runProbes([created.cleanup], registry);
    if (result) results.push({ kind: created.kind, id: created.id, ...result });
  }
  return results;
}

/**
 * The tab was opened on a frozen point: restore it before rendering, then
 * check it. A point that no longer holds says so in a banner — the person
 * asks the AI to repair it, from this point rather than from scratch.
 */
export async function reopenCheckpointFromUrl(
  logServerUrl: string,
  options: DebugSnapshotRestoreOptions,
  fallbackRecipe?: (id: string) => Promise<unknown>,
): Promise<void> {
  const id = new URLSearchParams(location.search).get(CRAFT_RESUME_CHECKPOINT_QUERY_PARAM);
  if (!id) return;
  let checkpoint: StoredCheckpoint | undefined;
  let fallbackStarted = false;
  const runFallback = async () => {
    if (!checkpoint?.recipeId || !fallbackRecipe || fallbackStarted) return;
    fallbackStarted = true;
    showResumeNotice('Le point ne tient plus ; sa recette liée démarre.');
    try { await fallbackRecipe(checkpoint.recipeId); }
    catch (error) { showResumeNotice(`La recette liée a échoué : ${error instanceof Error ? error.message : String(error)}`); }
  };
  try {
    checkpoint = await fetchCheckpoint(logServerUrl, id);
    const ahead = await validateCheckpoint({ ...checkpoint, probes: [] }, options.registry);
    if (!ahead.valid)
      throw new Error(
        ahead.expired
          ? `Ce point de reprise a expiré (${checkpoint.ttlReason}).`
          : `Ce point de reprise a été pris sur ${checkpoint.origin}.`,
      );
    if (!isDebugAppSnapshot(checkpoint.snapshot))
      throw new Error('Ce point de reprise ne contient pas d’état lisible.');
    const restored = await restoreDebugAppSnapshot(
      checkpoint.snapshot,
      `checkpoint:${id}`,
      options,
    );
    if (restored === 'reloading') return new Promise<void>(() => undefined);
    // Probes run once the app has started and holds its session again.
    const restoredCheckpoint = checkpoint;
    setTimeout(() => {
      void validateCheckpoint(restoredCheckpoint, options.registry).then(async (validity) => {
        writeLastCheckpoint(validity);
        if (!validity.valid) {
          showResumeNotice(
            `Ce point de reprise ne tient plus : ${validity.probes
              .filter((probe) => !probe.ok)
              .map((probe) => probe.request)
              .join(', ')}.`,
          );
          await runFallback();
        }
      });
    }, PROBE_DELAY_MS);
  } catch (error) {
    showResumeNotice(error instanceof Error ? error.message : String(error));
    await runFallback();
  }
  const url = new URL(location.href);
  url.searchParams.delete(CRAFT_RESUME_CHECKPOINT_QUERY_PARAM);
  history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

export function readLastCheckpointValidity(): unknown {
  try {
    const text = window.sessionStorage.getItem(LAST_CHECKPOINT_KEY);
    return text === null ? undefined : JSON.parse(text);
  } catch {
    return undefined;
  }
}

function writeLastCheckpoint(validity: ResumeCheckpointValidity): void {
  try {
    window.sessionStorage.setItem(LAST_CHECKPOINT_KEY, JSON.stringify(validity));
  } catch {
    // Reported again on the next validation.
  }
}

/* ── probes ─────────────────────────────────────────────────────────────── */

export async function runProbes(
  probes: readonly ResumeProbe[],
  registry: Pick<CraftPrimitiveRegistry, 'capture'>,
): Promise<readonly ResumeProbeResult[]> {
  const results: ResumeProbeResult[] = [];
  for (const probe of probes) {
    const method = (probe.method ?? 'GET').toUpperCase();
    const label = `${method} ${probe.url}`;
    try {
      const state = registry.capture();
      const url = new URL(String(fillTemplate(probe.url, state)), location.href);
      if (url.origin !== location.origin)
        throw new Error('une sonde ne s’adresse qu’à l’app elle-même');
      const headers = Object.fromEntries(
        Object.entries(probe.headers ?? {}).map(([key, value]) => [
          key,
          String(fillTemplate(value, state)),
        ]),
      );
      const body = probe.body === undefined ? undefined : fillTemplate(probe.body, state);
      const response = await fetch(url, {
        method,
        credentials: 'include',
        headers: {
          ...(body !== undefined && typeof body !== 'string'
            ? { 'content-type': 'application/json' }
            : {}),
          ...headers,
        },
        ...(body === undefined
          ? {}
          : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
      });
      const text = await response.text();
      const decoded = decodedAnswer(text);
      const missing = (probe.expect.match ?? []).filter(
        (part) => !text.includes(part) && !decoded.includes(part),
      );
      const statusOk =
        probe.expect.status === undefined
          ? response.ok
          : response.status === probe.expect.status;
      results.push({
        request: label,
        ok: statusOk && missing.length === 0,
        status: response.status,
        ...(missing.length ? { missing } : {}),
      });
    } catch (error) {
      results.push({
        request: label,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}

/**
 * The answer as JSON text once decoded: server functions answer a JSON string
 * that holds JSON, where `"role":"admin"` only appears escaped.
 */
export function decodedAnswer(text: string): string {
  let value: unknown = text;
  for (let depth = 0; depth < 3 && typeof value === 'string'; depth++) {
    try {
      value = JSON.parse(value);
    } catch {
      break;
    }
  }
  return typeof value === 'string' ? value : JSON.stringify(value);
}

const STATE_PLACEHOLDER = /\{\{\s*state\s+([^}]+?)\s*\}\}/g;

/**
 * `{{state <address> <path>}}` reads the live state: the address is
 * ordinal-free, the path a dot path (`.` for the whole value). A string that
 * is only a placeholder takes the value itself, not its text.
 */
export function fillTemplate(
  value: unknown,
  state: Readonly<Record<string, unknown>>,
): unknown {
  if (typeof value === 'string') {
    const whole = /^\{\{\s*state\s+([^}]+?)\s*\}\}$/.exec(value);
    if (whole?.[1] !== undefined) return readState(whole[1], state);
    return value.replace(STATE_PLACEHOLDER, (_, reference: string) => {
      const found = readState(reference, state);
      return typeof found === 'string' ? found : JSON.stringify(found);
    });
  }
  if (Array.isArray(value)) return value.map((item) => fillTemplate(item, state));
  if (typeof value === 'object' && value !== null)
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, fillTemplate(item, state)]),
    );
  return value;
}

function readState(reference: string, state: Readonly<Record<string, unknown>>): unknown {
  const split = reference.lastIndexOf(' ');
  if (split < 0) throw new Error(`{{state ${reference}}} needs an address and a path`);
  const address = ordinalFree(reference.slice(0, split).trim());
  const path = reference.slice(split + 1);
  const key = Object.keys(state).find((candidate) => ordinalFree(candidate) === address);
  if (key === undefined) throw new Error(`no live state at ${address}`);
  let current: unknown = state[key];
  if (path !== '.')
    for (const part of path.split('.')) {
      if (typeof current !== 'object' || current === null) {
        current = undefined;
        break;
      }
      current = (current as Record<string, unknown>)[part];
    }
  if (current === undefined) throw new Error(`no value at ${address} ${path}`);
  return current;
}

function ordinalFree(address: string): string {
  return address
    .split(' / ')
    .map((part) => part.replace(/#\d+$/, ''))
    .join(' / ');
}

export function showResumeNotice(message: string): void {
  const document = globalThis.document;
  const notice = document.createElement('aside');
  notice.setAttribute('data-craft-ai-overlay', '');
  notice.setAttribute('data-craft-resume-checkpoint-notice', '');
  notice.setAttribute('role', 'status');
  notice.textContent = message;
  Object.assign(notice.style, {
    position: 'fixed',
    insetInline: '16px',
    bottom: '16px',
    zIndex: '2147483647',
    padding: '12px 16px',
    borderRadius: '12px',
    background: '#5c1f1f',
    color: '#fbeee8',
    font: '14px/1.4 system-ui, sans-serif',
  });
  notice.addEventListener('click', () => notice.remove());
  const show = () => document.body.append(notice);
  if (document.body) show();
  else document.addEventListener('DOMContentLoaded', show, { once: true });
}
