import {
  ɵclearCraftPrimitiveReplaySnapshots,
  activateCraftTemporalRuntime,
  SuspendableCraftTemporalRuntime,
  type ɵinjectCraftMethodReplayRegistry,
  type ɵinjectCraftPrimitiveRegistry,
  type ɵinjectPersistedStorageSnapshotRegistry,
} from '@craft-ts/core';
import {
  isDebugAppSnapshot,
  type DebugAppSnapshot,
  type DebugInFlightWork,
} from './debug-session-app-snapshot';
import { restoreBrowserStorageSnapshot } from './debug-session-browser-storage';
import {
  CRAFT_DEBUG_REPLAY_CHANNEL,
  CRAFT_DEBUG_SNAPSHOT_QUERY_PARAM,
} from './debug-session-replay-signals';
import { type DebugSessionResumeManifest } from './debug-session-resume-manifest';
import { isDebugSessionResumeManifest } from './debug-session-resume-preflight';
import type {
  ResumeFidelityReport,
  ResumeOverride,
  ResumeStepResult,
} from './debug-session-resume-executor';
import { createResumeFidelityReport } from './debug-session-resume-executor';
import {
  applyDebugSessionResumeOverride,
  isDebugSessionResumeOverrideList,
} from './debug-session-resume-overrides';
import {
  debugSessionResumeResourcesMap,
  normalizeDebugSessionResumeResource,
} from './debug-session-resume-resources';
import {
  isDebugSessionResumePlan,
  type DebugSessionResumePlan,
} from './debug-session-resume-plan';

type ResumeLaunch = Readonly<{
  plan: DebugSessionResumePlan;
  manifest: DebugSessionResumeManifest;
  overrides: readonly ResumeOverride[];
}>;

/** Set once origin storage is restored and the page reloaded, to avoid a loop. */
const STORAGE_RESTORED_MARKER = 'craft-debug-snapshot-storage-run';
const SNAPSHOT_WAIT_MS = 10_000;
/** Restored values stop being offered to primitives created after this delay. */
const SNAPSHOT_RELEASE_MS = 20_000;
/** How long to wait for the app to create the primitive or method to relaunch. */
const RELAUNCH_WAIT_MS = 10_000;
const RELAUNCH_POLL_MS = 100;
const resumeXhrMetadata = new WeakMap<
  XMLHttpRequest,
  { method: string; url: string; async: boolean }
>();

type LaunchOptions = Readonly<{
  allowedOrigins: ReadonlySet<string>;
  registry: ReturnType<typeof ɵinjectCraftPrimitiveRegistry>;
  storageRegistry: ReturnType<typeof ɵinjectPersistedStorageSnapshotRegistry>;
  methods: ReturnType<typeof ɵinjectCraftMethodReplayRegistry>;
  /** Turns a recorded argument back into a value (dates, events, bigints…). */
  reviveArgument: (value: unknown) => unknown;
  resume?: Readonly<{
    waitForRoute(route: string): Promise<void>;
    execute(
      plan: DebugSessionResumePlan,
      manifest: DebugSessionResumeManifest,
      snapshot: DebugAppSnapshot,
      setAllowedCalls: (calls: ReadonlySet<string>) => void,
      onStep: (result: ResumeStepResult, index: number) => void,
      taskWasScheduled: (index: number) => boolean,
      sharedResources: Map<string, unknown>,
      onResourceAcquired: (resource: string, value: unknown) => void,
    ): Promise<ResumeFidelityReport>;
    isReadOnlyRequest?(request: Request): boolean | Promise<boolean>;
  }>;
}>;

function ordinalFree(address: string): string {
  return address
    .split(' / ')
    .map((part) => part.replace(/#\d+$/, ''))
    .join(' / ');
}

const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

async function waitForRestoredTemporalTasks(
  temporal: SuspendableCraftTemporalRuntime | undefined,
  expectedCount: number,
): Promise<void> {
  if (expectedCount === 0 || !temporal) return;
  const deadline = Date.now() + 1_500;
  while (Date.now() < deadline) {
    if (
      Array.from({ length: expectedCount }, (_, index) =>
        temporal.restoredTaskWasScheduled(index),
      ).every(Boolean)
    )
      return;
    await sleep(10);
  }
}

/**
 * Relaunches what was running at the chosen moment, once the app has created
 * the methods and primitives involved: the method calls that had issued
 * requests still unanswered, then the primitives that were loading. The
 * requests are real, so they reach the server again.
 */
async function relaunchInFlightWork(
  work: DebugInFlightWork,
  options: LaunchOptions,
): Promise<
  Readonly<{ relaunched: readonly string[]; failed: readonly string[] }>
> {
  const relaunched: string[] = [];
  const failed: string[] = [];
  const deadline = Date.now() + RELAUNCH_WAIT_MS;
  for (const invocation of work.invocations) {
    const wanted = ordinalFree(invocation.address);
    while (
      !options.methods.addresses().some((a) => ordinalFree(a) === wanted) &&
      Date.now() < deadline
    )
      await sleep(RELAUNCH_POLL_MS);
    try {
      const result = options.methods.invoke(
        invocation.address,
        undefined,
        invocation.args.map(options.reviveArgument),
      );
      // The call stays in flight: that is the state being restored.
      if (result instanceof Promise) result.catch(() => undefined);
      relaunched.push(invocation.address);
    } catch {
      failed.push(invocation.address);
    }
  }
  for (const address of work.reloads) {
    const wanted = ordinalFree(address);
    const find = () => {
      const matches = options.registry
        .list()
        .filter((entry) => ordinalFree(entry.address) === wanted);
      return matches.length === 1 ? matches[0] : undefined;
    };
    while (!find() && Date.now() < deadline) await sleep(RELAUNCH_POLL_MS);
    if (find()?.reload?.()) relaunched.push(address);
    else failed.push(address);
  }
  return { relaunched, failed };
}

/**
 * The page was opened by the dashboard (`window.opener`) with a launch id: ask
 * it for the app snapshot and hold the bootstrap until the state is restored,
 * so no component ever renders the live startup state. The app then runs for
 * real — network, timers, recording — which is the point: it is a debug
 * session, not a replay.
 */
export function startDebugSnapshotLaunch(
  options: LaunchOptions,
): Promise<void> | undefined {
  const requestedLaunchId = new URLSearchParams(location.search).get(
    CRAFT_DEBUG_SNAPSHOT_QUERY_PARAM,
  );
  const opener: Window | null = window.opener;
  if (!requestedLaunchId || !opener || opener === window) return undefined;
  const launchId: string = requestedLaunchId;

  return new Promise<void>((resolve) => {
    let settled = false;
    let resumeLaunch: ResumeLaunch | undefined;
    let allowedCalls = new Set<string>();
    let restoreResumeBarrier: (() => void) | undefined;
    let restoreResumeTemporal: (() => void) | undefined;
    let resumeSnapshot: DebugAppSnapshot | undefined;
    let activeResumeTemporal: SuspendableCraftTemporalRuntime | undefined;
    let userInteracted = false;
    let heldCallSequence = 0;
    const heldCalls = new Map<
      string,
      Readonly<{
        call: string;
        resolve: (decision: 'live' | 'abort' | 'override') => void;
      }>
    >();
    const heldCallResults: ResumeStepResult[] = [];
    const appliedOverrides: ResumeOverride[] = [];
    const approvedOverrides: ResumeOverride[] = [];
    const sharedResumeResources = new Map<string, unknown>();
    let resumeShouldDefer = false;
    let resumeStarted = false;
    let resumeStartRequested = false;
    let resumeAbortRequested = false;
    let resumeAbortReported = false;

    const send = (type: string, payload: Record<string, unknown> = {}) => {
      for (const origin of options.allowedOrigins) {
        try {
          opener.postMessage(
            { channel: CRAFT_DEBUG_REPLAY_CHANNEL, type, launchId, ...payload },
            origin,
          );
        } catch {
          // A closed dashboard has nobody to tell.
        }
      }
    };

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (!resumeLaunch) window.removeEventListener('message', onMessage);
      try {
        window.sessionStorage.removeItem(STORAGE_RESTORED_MARKER);
      } catch {
        // Marker cleanup is best effort.
      }
      // The launch id must not become router state.
      const url = new URL(location.href);
      url.searchParams.delete(CRAFT_DEBUG_SNAPSHOT_QUERY_PARAM);
      history.replaceState(
        history.state,
        '',
        `${url.pathname}${url.search}${url.hash}`,
      );
      resolve();
    };

    const releaseRestoredValues = () => {
      ɵclearCraftPrimitiveReplaySnapshots(options.registry);
      window.removeEventListener('pointerdown', releaseRestoredValues, true);
      window.removeEventListener('keydown', releaseRestoredValues, true);
    };

    const releaseResumeBarrier = () => {
      if (!resumeLaunch || !restoreResumeBarrier) return;
      if (resumeShouldDefer && !resumeStarted) {
        userInteracted = true;
        return;
      }
      if (resumeRunning) {
        userInteracted = true;
        return;
      }
      restoreResumeBarrier();
      restoreResumeBarrier = undefined;
      window.removeEventListener('pointerdown', releaseResumeBarrier, true);
      window.removeEventListener('keydown', releaseResumeBarrier, true);
    };
    let resumeRunning = false;
    const abortDeferredResume = () => {
      if (
        !resumeLaunch ||
        !restoreResumeBarrier ||
        resumeStarted ||
        resumeAbortReported
      )
        return;
      resumeAbortReported = true;
      allowedCalls = new Set();
      activeResumeTemporal?.clearRestoredTaskTracking();
      restoreResumeTemporal?.();
      restoreResumeTemporal = undefined;
      releaseResumeBarrier();
      send('resume-completed', {
        classification: 'refused',
        steps: [],
        blocked: ['La reprise a été interrompue par l’onglet de tête.'],
      });
    };

    const installResumeBarrier = () => {
      if (!options.resume || restoreResumeBarrier) return;
      if (resumeLaunch && !restoreResumeTemporal) {
        const temporal = new SuspendableCraftTemporalRuntime();
        activeResumeTemporal = temporal;
        temporal.restorePendingTasks(
          resumeSnapshot?.temporalNow === undefined
            ? []
            : (resumeSnapshot.pendingTasks ?? []),
          resumeSnapshot?.temporalNow ?? temporal.now(),
        );
        if (
          resumeLaunch.plan.clockPolicy === 'recorded' &&
          typeof resumeSnapshot?.temporalDateNow === 'number'
        )
          temporal.setDateNowOffset(
            resumeSnapshot.temporalDateNow - Date.now(),
          );
        restoreResumeTemporal = activateCraftTemporalRuntime(temporal);
        window.addEventListener('pagehide', () => restoreResumeTemporal?.(), {
          once: true,
        });
      }
      const nativeFetch = globalThis.fetch;
      const requestDecision = (
        call: string,
      ): Promise<'live' | 'abort' | 'override'> => {
        const holdId = `${launchId}:${++heldCallSequence}`;
        send('resume-hold', { holdId, call });
        return new Promise<'live' | 'abort' | 'override'>((resolveDecision) => {
          heldCalls.set(holdId, {
            call,
            resolve: (decision) => {
              heldCallResults.push({
                id: `held:${call}`,
                status: decision === 'abort' ? 'blocked' : 'tolerated',
                detail:
                  decision === 'live'
                    ? 'Appel autorisé manuellement hors du plan.'
                    : decision === 'override'
                      ? 'Appel servi par une surcharge approuvée par une personne.'
                      : 'Appel retenu refusé ou expiré sans décision.',
              });
              resolveDecision(decision);
            },
          });
          setTimeout(() => {
            const pending = heldCalls.get(holdId);
            if (!pending) return;
            heldCalls.delete(holdId);
            pending.resolve('abort');
          }, 120_000);
        });
      };
      const guardedFetch: typeof fetch = async (input, init) => {
        const request = new Request(input, init);
        const overridden = await applyDebugSessionResumeOverride(
          request,
          nativeFetch,
          resumeLaunch?.overrides ?? [],
        );
        if (overridden) {
          if (overridden.override) appliedOverrides.push(overridden.override);
          return overridden.response;
        }
        const readOnly = await options.resume?.isReadOnlyRequest?.(request);
        if (readOnly) return nativeFetch.call(globalThis, request);
        if (
          request.method === 'POST' &&
          new URL(request.url).origin === location.origin &&
          new URL(request.url).pathname === '/__server-functions'
        ) {
          try {
            const body: unknown = await request.clone().json();
            if (
              typeof body === 'object' &&
              body !== null &&
              'id' in body &&
              typeof body.id === 'string' &&
              allowedCalls.has(body.id)
            )
              return nativeFetch.call(globalThis, request);
          } catch {
            // Malformed requests remain blocked.
          }
        }
        const call = `${request.method} ${new URL(request.url).pathname}`;
        const decision = await requestDecision(call);
        if (decision === 'override') {
          const lateOverride = await applyDebugSessionResumeOverride(
            request,
            nativeFetch,
            approvedOverrides,
          );
          if (lateOverride) {
            if (lateOverride.override)
              appliedOverrides.push(lateOverride.override);
            return lateOverride.response;
          }
          throw new Error(
            `Reprise refusée : aucune surcharge approuvée pour ${call}.`,
          );
        }
        if (decision === 'live') return nativeFetch.call(globalThis, request);
        throw new Error(`Reprise refusée : appel retenu (${call}).`);
      };
      globalThis.fetch = guardedFetch;
      const xhrPrototype = XMLHttpRequest.prototype;
      const nativeOpen = xhrPrototype.open;
      const nativeSend = xhrPrototype.send;
      const nativeWebSocket = globalThis.WebSocket;
      const nativeWorker = globalThis.Worker;
      const nativeSharedWorker = globalThis.SharedWorker;
      const guardedOpen = function (
        this: XMLHttpRequest,
        method: string,
        url: string | URL,
        async = true,
        username?: string | null,
        password?: string | null,
      ): void {
        resumeXhrMetadata.set(this, {
          method: method.toUpperCase(),
          url: String(url),
          async,
        });
        nativeOpen.call(this, method, url, async, username, password);
      };
      const guardedSend = function (
        this: XMLHttpRequest,
        body?: Document | XMLHttpRequestBodyInit | null,
      ): void {
        const request = resumeXhrMetadata.get(this);
        if (!request)
          throw new Error('Reprise bloquée : requête XHR inconnue.');
        if (
          resumeXhrCallAllowed(request.method, request.url, body, allowedCalls)
        ) {
          nativeSend.call(this, body);
          return;
        }
        if (!request.async)
          throw new Error('Reprise bloquée : requête XHR non déclarée.');
        const call = `${request.method} ${new URL(request.url, location.href).pathname}`;
        void requestDecision(call).then((decision) => {
          if (decision === 'live') nativeSend.call(this, body);
          else this.abort();
        });
      };
      xhrPrototype.open = guardedOpen;
      xhrPrototype.send = guardedSend;
      class GuardedWebSocket extends nativeWebSocket {
        constructor(url: string | URL, protocols?: string | string[]) {
          const href = new URL(String(url), location.href).href;
          if (!allowedCalls.has(`websocket:${href}`))
            throw new Error('Reprise bloquée : WebSocket non déclaré.');
          super(url, protocols);
        }
      }
      class GuardedWorker extends nativeWorker {
        constructor(url: string | URL, options?: WorkerOptions) {
          const href = new URL(String(url), location.href).href;
          if (!allowedCalls.has(`worker:${href}`))
            throw new Error('Reprise bloquée : worker non déclaré.');
          super(url, options);
        }
      }
      class GuardedSharedWorker extends nativeSharedWorker {
        constructor(scriptURL: string | URL, options?: string | WorkerOptions) {
          const href = new URL(String(scriptURL), location.href).href;
          if (!allowedCalls.has(`shared-worker:${href}`))
            throw new Error('Reprise bloquée : SharedWorker non déclaré.');
          super(scriptURL, options);
        }
      }
      globalThis.WebSocket = GuardedWebSocket;
      globalThis.Worker = GuardedWorker;
      globalThis.SharedWorker = GuardedSharedWorker;
      restoreResumeBarrier = () => {
        if (globalThis.fetch === guardedFetch) globalThis.fetch = nativeFetch;
        if (xhrPrototype.open === guardedOpen) xhrPrototype.open = nativeOpen;
        if (xhrPrototype.send === guardedSend) xhrPrototype.send = nativeSend;
        if (globalThis.WebSocket === GuardedWebSocket)
          globalThis.WebSocket = nativeWebSocket;
        if (globalThis.Worker === GuardedWorker)
          globalThis.Worker = nativeWorker;
        if (globalThis.SharedWorker === GuardedSharedWorker)
          globalThis.SharedWorker = nativeSharedWorker;
      };
      window.addEventListener('pointerdown', releaseResumeBarrier, true);
      window.addEventListener('keydown', releaseResumeBarrier, true);
    };

    const runResume = async (snapshot: DebugAppSnapshot) => {
      const launch = resumeLaunch;
      if (!launch || !options.resume) return;
      resumeRunning = true;
      send('resume-started', { total: launch.plan.steps.length });
      try {
        await options.resume.waitForRoute(snapshot.route);
        await waitForRestoredTemporalTasks(
          activeResumeTemporal,
          snapshot.pendingTasks?.length ?? 0,
        );
        const report = await options.resume.execute(
          launch.plan,
          launch.manifest,
          snapshot,
          (calls) => (allowedCalls = new Set(calls)),
          (result, index) =>
            send('resume-step', {
              index,
              total: launch.plan.steps.length,
              id: result.id,
              status: result.status,
              detail: result.detail,
            }),
          (index) =>
            activeResumeTemporal?.restoredTaskWasScheduled(index) ?? false,
          sharedResumeResources,
          (resource, value) => {
            const normalized = normalizeDebugSessionResumeResource({
              resource,
              value,
            });
            if (!normalized) return;
            sharedResumeResources.set(resource, normalized.value);
            send('resume-resource', normalized);
          },
        );
        const finalReport = createResumeFidelityReport(
          [...report.steps, ...heldCallResults],
          [...report.overrides, ...appliedOverrides],
        );
        send('resume-completed', {
          classification: finalReport.classification,
          overrides: finalReport.overrides,
          steps: finalReport.steps.map(({ id, status, detail }) => ({
            id,
            status,
            detail,
          })),
          blocked: finalReport.steps
            .filter((step) => step.status === 'blocked')
            .map((step) => step.id),
        });
      } catch {
        send('resume-error', {
          message:
            'Impossible de terminer la reprise guidée dans l’application.',
        });
      } finally {
        resumeRunning = false;
        allowedCalls = new Set();
        activeResumeTemporal?.clearRestoredTaskTracking();
        if (userInteracted) releaseResumeBarrier();
      }
    };

    const storageAlreadyRestored = (): boolean => {
      try {
        return (
          window.sessionStorage.getItem(STORAGE_RESTORED_MARKER) === launchId
        );
      } catch {
        return false;
      }
    };

    async function onMessage(event: MessageEvent<unknown>): Promise<void> {
      const data = event.data as Record<string, unknown> | null;
      if (
        event.source !== opener ||
        !options.allowedOrigins.has(event.origin) ||
        data?.['channel'] !== CRAFT_DEBUG_REPLAY_CHANNEL ||
        data['launchId'] !== launchId
      )
        return;
      if (
        data['type'] === 'resume-hold-decision' &&
        typeof data['holdId'] === 'string' &&
        (data['decision'] === 'live' ||
          data['decision'] === 'abort' ||
          data['decision'] === 'override')
      ) {
        const pending = heldCalls.get(data['holdId']);
        if (pending) {
          if (data['decision'] === 'override') {
            const candidate = data['override'];
            const candidateList = [candidate];
            if (
              !isDebugSessionResumeOverrideList(candidateList) ||
              candidateList[0]!.call !== pending.call
            )
              return;
            const acceptedOverride = candidateList[0]!;
            for (let index = approvedOverrides.length - 1; index >= 0; index--)
              if (approvedOverrides[index]?.call === acceptedOverride.call)
                approvedOverrides.splice(index, 1);
            approvedOverrides.push(acceptedOverride);
          }
          heldCalls.delete(data['holdId']);
          pending.resolve(data['decision']);
        }
        return;
      }
      if (data['type'] === 'resume-resource') {
        const resource = normalizeDebugSessionResumeResource(data);
        if (resource)
          sharedResumeResources.set(resource.resource, resource.value);
        return;
      }
      if (data['type'] === 'resume-start') {
        resumeStartRequested = true;
        if (resumeLaunch && resumeSnapshot && !resumeStarted) {
          resumeStarted = true;
          void runResume(resumeSnapshot);
        }
        return;
      }
      if (data['type'] === 'resume-abort' && !resumeStarted) {
        resumeAbortRequested = true;
        abortDeferredResume();
        return;
      }
      if (settled || data['type'] !== 'restore-app-snapshot') return;
      const snapshot = data['snapshot'];
      if (!isDebugAppSnapshot(snapshot)) {
        send('snapshot-error', { message: 'Snapshot d’application invalide.' });
        return finish();
      }
      const rawPlan = data['resumePlan'];
      const rawManifest = data['resumeManifest'];
      const rawOverrides = data['resumeOverrides'] ?? [];
      if (rawPlan !== undefined || rawManifest !== undefined) {
        if (
          !options.resume ||
          !isDebugSessionResumePlan(rawPlan) ||
          rawPlan.status !== 'ready' ||
          !isDebugSessionResumeManifest(rawManifest) ||
          !isDebugSessionResumeOverrideList(rawOverrides)
        ) {
          send('snapshot-error', {
            message: 'Plan de reprise invalide ou exécuteur indisponible.',
          });
          return finish();
        }
        resumeLaunch = {
          plan: rawPlan,
          manifest: rawManifest,
          overrides: rawOverrides,
        };
        resumeSnapshot = snapshot;
        resumeShouldDefer = data['deferResume'] === true;
        for (const [resource, value] of debugSessionResumeResourcesMap(
          data['resumeResources'],
        ))
          sharedResumeResources.set(resource, value);
      }
      try {
        if (snapshot.browserStorage && !storageAlreadyRestored()) {
          await restoreBrowserStorageSnapshot(snapshot.browserStorage);
          window.sessionStorage.setItem(STORAGE_RESTORED_MARKER, launchId);
          // Frameworks read origin storage while bootstrapping: start over.
          location.reload();
          return;
        }
        await options.storageRegistry.restore(snapshot.storage);
        options.registry.restore(snapshot.primitives);
        if (resumeLaunch) installResumeBarrier();
        window.addEventListener('pointerdown', releaseRestoredValues, true);
        window.addEventListener('keydown', releaseRestoredValues, true);
        setTimeout(releaseRestoredValues, SNAPSHOT_RELEASE_MS);
        send('snapshot-restored', { warnings: snapshot.warnings });
        if (resumeAbortRequested) abortDeferredResume();
        else if (resumeLaunch && (!resumeShouldDefer || resumeStartRequested)) {
          resumeStarted = true;
          void runResume(snapshot);
        }
        if (snapshot.inFlight)
          void relaunchInFlightWork(snapshot.inFlight, options).then((result) =>
            send('snapshot-inflight', result),
          );
      } catch (error) {
        send('snapshot-error', {
          message: error instanceof Error ? error.message : String(error),
        });
      }
      finish();
    }

    window.addEventListener('message', onMessage);
    const timeout = setTimeout(() => {
      send('snapshot-error', {
        message:
          'Le dashboard n’a pas envoyé le snapshot : l’app démarre à son état normal.',
      });
      finish();
    }, SNAPSHOT_WAIT_MS);
    send('snapshot-request');
  });
}

function resumeXhrCallAllowed(
  method: string,
  href: string,
  body: Document | XMLHttpRequestBodyInit | null | undefined,
  allowedCalls: ReadonlySet<string>,
): boolean {
  if (method !== 'POST' || typeof body !== 'string') return false;
  try {
    const url = new URL(href, location.href);
    if (
      url.origin !== location.origin ||
      url.pathname !== '/__server-functions'
    )
      return false;
    const parsed: unknown = JSON.parse(body);
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      'id' in parsed &&
      typeof parsed.id === 'string' &&
      allowedCalls.has(parsed.id)
    );
  } catch {
    return false;
  }
}
