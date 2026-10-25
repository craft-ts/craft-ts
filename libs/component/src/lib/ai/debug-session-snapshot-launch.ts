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
import {
  createResumeFidelityReport,
  decideResumeCall,
} from './debug-session-resume-executor';
import {
  compareResumeOutcome,
  jsonStringContent,
  resumeCallNameOf,
  resumeCallNamesOf,
  resumePlaceholdersOf,
  substituteResumePlaceholders,
} from './debug-session-resume-calls';
import { readResumePathValue } from './debug-session-resume-path';
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
  /** Nobody watches the dashboard: a held call is refused at once. */
  unattended: boolean;
}>;

/** Expected outcomes are still compared this long after the user takes over. */
export const RESUME_OBSERVATION_MS = 5 * 60_000;
/** A held call nobody decides on is refused after this delay (frozen with the clock). */
const HELD_CALL_EXPIRY_MS = 120_000;
/** How long a request carrying a placeholder may wait for its substitution. */
const SUBSTITUTION_WAIT_MS = 15_000;

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
      callsWereReread: (calls: readonly string[]) => boolean,
    ): Promise<ResumeFidelityReport & Readonly<{ release?(): Promise<void> }>>;
    isReadOnlyRequest?(request: Request): boolean | Promise<boolean>;
    /** Origins whose GET and HEAD requests are reads, besides the app's own. */
    readOrigins?: readonly string[];
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
  // Global services start loading before the snapshot arrives (a session
  // query with the stored token). Nothing leaves the tab until the launch is
  // decided: then the resume barrier, or the network, takes every request.
  const launchNativeFetch = globalThis.fetch;
  let releaseEarlyRequests: ((target: typeof fetch) => void) | undefined;
  const earlyTarget = new Promise<typeof fetch>((resolveTarget) => {
    releaseEarlyRequests = resolveTarget;
  });
  const earlyFetch: typeof fetch = async (input, init) =>
    (await earlyTarget)(input, init);
  globalThis.fetch = earlyFetch;
  const releaseEarly = (target: typeof fetch) => {
    if (globalThis.fetch === earlyFetch) globalThis.fetch = target;
    releaseEarlyRequests?.(target);
    releaseEarlyRequests = undefined;
  };

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
    let resumeCompleted = false;
    /** Until the user takes over, undeclared calls are held. */
    let barrierActive = false;
    let observeUntil = Number.POSITIVE_INFINITY;
    let releaseAcquisitions: (() => Promise<void>) | undefined;
    let acquisitionsReleased = false;
    const outcomeResults: ResumeStepResult[] = [];
    /** Calls already sent again with a reacquired resource. */
    const rereadCalls = new Set<string>();
    let substitutionSettled = false;
    const substitutionListeners = new Set<() => void>();
    const notifySubstitutions = () => {
      for (const listener of [...substitutionListeners]) listener();
    };
    const clockNow = () => activeResumeTemporal?.now() ?? performance.now();

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
      releaseEarly(launchNativeFetch);
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

    /** The new value that replaces a recorded placeholder, once its resource is reacquired. */
    const placeholderValue = (fingerprint: string): string | undefined => {
      const substitution = resumeLaunch?.plan.substitutions.find(
        (item) => item.fingerprint === fingerprint,
      );
      if (!substitution) return undefined;
      const resource = sharedResumeResources.get(substitution.resource);
      if (resource === undefined) return undefined;
      const value = readResumePathValue(resource, substitution.valuePath);
      return typeof value === 'string' || typeof value === 'number'
        ? String(value)
        : undefined;
    };
    const placeholderKnown = (fingerprint: string) =>
      resumeLaunch?.plan.substitutions.some(
        (item) => item.fingerprint === fingerprint,
      ) ?? false;
    /**
     * Holds a request carrying placeholders until every one of them can be
     * replaced. Returns those that never will: unknown to the plan, or still
     * missing once the resume ended or the wait expired.
     */
    const waitForPlaceholders = async (
      fingerprints: readonly string[],
    ): Promise<readonly string[]> => {
      const deadline = clockNow() + SUBSTITUTION_WAIT_MS;
      for (;;) {
        const unresolved = fingerprints.filter(
          (fingerprint) => placeholderValue(fingerprint) === undefined,
        );
        if (
          unresolved.length === 0 ||
          unresolved.some((fingerprint) => !placeholderKnown(fingerprint)) ||
          substitutionSettled ||
          clockNow() >= deadline
        )
          return unresolved;
        await new Promise<void>((wake) => {
          const done = () => {
            substitutionListeners.delete(done);
            clearTimeout(timer);
            wake();
          };
          const timer = setTimeout(done, 200);
          substitutionListeners.add(done);
        });
      }
    };
    /** Calls declared for the resources a request was just rewritten with. */
    const callsOfResources = (resources: ReadonlySet<string>) =>
      new Set(
        (resumeLaunch?.plan.steps ?? [])
          .filter((step) => step.resource && resources.has(step.resource))
          .flatMap((step) => step.allowedCalls ?? []),
      );
    const resourcesOfPlaceholders = (fingerprints: readonly string[]) =>
      new Set(
        fingerprints.flatMap(
          (fingerprint) =>
            resumeLaunch?.plan.substitutions
              .filter((item) => item.fingerprint === fingerprint)
              .map((item) => item.resource) ?? [],
        ),
      );
    const reportOutcome = (result: ResumeStepResult) => {
      if (!resumeCompleted) {
        outcomeResults.push(result);
        return;
      }
      send('resume-outcome', {
        id: result.id,
        status: result.status,
        ...(result.code ? { code: result.code } : {}),
        ...(result.detail ? { detail: result.detail } : {}),
      });
      if (result.status === 'blocked') void releaseOnce();
    };
    const releaseOnce = async () => {
      if (acquisitionsReleased || !releaseAcquisitions) return;
      acquisitionsReleased = true;
      try {
        await releaseAcquisitions();
      } catch {
        // The dashboard already reports the resume as refused.
      }
    };
    const refusePlaceholders = (call: string, missing: readonly string[]) => {
      reportOutcome({
        id: `substitution:${call}`,
        status: 'blocked',
        code: 'placeholder-unresolved',
        detail: `Requête refusée : ${missing.length} référence(s) enregistrée(s) sans valeur reprise (${missing.map((fingerprint) => `craft-ref:${fingerprint}`).join(', ')}).`,
      });
      return new Error(
        `Reprise refusée : la requête ${call} porte une référence enregistrée sans correspondance.`,
      );
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
      barrierActive = true;
      const nativeFetch = launchNativeFetch;
      const requestDecision = (
        call: string,
      ): Promise<'live' | 'abort' | 'override'> => {
        const holdId = `${launchId}:${++heldCallSequence}`;
        send('resume-hold', { holdId, call });
        return new Promise<'live' | 'abort' | 'override'>((resolveDecision) => {
          // The expiry runs on the resume clock: it freezes with a paused replay.
          const expiry = new AbortController();
          heldCalls.set(holdId, {
            call,
            resolve: (decision) => {
              expiry.abort();
              heldCallResults.push({
                id: `held:${call}`,
                status: decision === 'abort' ? 'blocked' : 'overridden',
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
          const timer = activeResumeTemporal
            ? activeResumeTemporal.sleep(HELD_CALL_EXPIRY_MS, {
                owner: 'resume-held-call',
                signal: expiry.signal,
              })
            : sleep(HELD_CALL_EXPIRY_MS);
          void timer
            .then(() => {
              const pending = heldCalls.get(holdId);
              if (!pending) return;
              heldCalls.delete(holdId);
              pending.resolve('abort');
            })
            .catch(() => undefined);
        });
      };
      const expectationFor = (names: readonly string[]) =>
        resumeLaunch?.plan.expectedOutcomes?.find((outcome) =>
          names.includes(outcome.call),
        );
      /** Compares a declared outcome with the live answer and applies its policy. */
      const observe = async (
        names: readonly string[],
        perform: () => Promise<Response>,
      ): Promise<Response> => {
        const expectation = expectationFor(names);
        if (!expectation || (!barrierActive && clockNow() > observeUntil))
          return perform();
        const response = await perform();
        const body = await response
          .clone()
          .text()
          .catch(() => '');
        const comparison = compareResumeOutcome(expectation, {
          status: response.status,
          body,
        });
        const id = `outcome:${expectation.call}`;
        if (comparison.matched) {
          reportOutcome({ id, status: 'conformant', detail: comparison.detail });
          return response;
        }
        const policy = expectation.onMismatch ?? 'degraded';
        if (policy === 'abort') {
          reportOutcome({
            id,
            status: 'blocked',
            code: 'outcome-mismatch',
            detail: comparison.detail,
          });
          return response;
        }
        if (
          policy === 'recorded' &&
          barrierActive &&
          expectation.recordedBody !== undefined
        ) {
          reportOutcome({
            id,
            status: 'recorded',
            detail: `${comparison.detail} · réponse enregistrée servie`,
          });
          return new Response(
            typeof expectation.recordedBody === 'string'
              ? expectation.recordedBody
              : JSON.stringify(expectation.recordedBody),
            {
              status: expectation.status ?? 200,
              headers: { 'content-type': 'application/json' },
            },
          );
        }
        reportOutcome({
          id,
          status: 'drifted',
          detail:
            policy === 'recorded'
              ? `${comparison.detail} · réponse enregistrée non servie après la prise en main`
              : comparison.detail,
        });
        return response;
      };
      const isDefaultRead = (request: Request) => {
        if (request.method !== 'GET' && request.method !== 'HEAD') return false;
        const origin = new URL(request.url, location.href).origin;
        return (
          origin === location.origin ||
          (options.resume?.readOrigins ?? []).some(
            (allowed) => new URL(allowed).origin === origin,
          )
        );
      };
      const guardedFetch: typeof fetch = async (input, init) => {
        let request = new Request(input, init);
        const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
        let bodyText = hasBody
          ? await request
              .clone()
              .text()
              .catch(() => '')
          : '';
        const headers = [...request.headers.entries()];
        const placeholders = resumePlaceholdersOf(
          [request.url, bodyText, ...headers.map(([, value]) => value)].join(
            '\n',
          ),
        );
        let substitutedCalls = new Set<string>();
        if (placeholders.length) {
          const call = resumeCallNameOf(request.method, request.url, bodyText, location.href);
          const missing = await waitForPlaceholders(placeholders);
          if (missing.length) throw refusePlaceholders(call, missing);
          const url = substituteResumePlaceholders(request.url, (fingerprint) => {
            const value = placeholderValue(fingerprint);
            return value === undefined ? undefined : encodeURIComponent(value);
          }).text;
          bodyText = substituteResumePlaceholders(bodyText, (fingerprint) => {
            const value = placeholderValue(fingerprint);
            return value === undefined ? undefined : jsonStringContent(value);
          }).text;
          const rewrittenHeaders = new Headers();
          for (const [name, value] of headers)
            rewrittenHeaders.set(
              name,
              substituteResumePlaceholders(value, placeholderValue).text,
            );
          request = new Request(url, {
            method: request.method,
            headers: rewrittenHeaders,
            ...(hasBody ? { body: bodyText } : {}),
            credentials: request.credentials,
            cache: request.cache,
            redirect: request.redirect,
            referrer: request.referrer,
            signal: request.signal,
          });
          substitutedCalls = callsOfResources(
            resourcesOfPlaceholders(placeholders),
          );
        }
        const names = resumeCallNamesOf(
          request.method,
          request.url,
          bodyText,
          location.href,
        );
        const live = () => nativeFetch.call(globalThis, request);
        if (!barrierActive) {
          if (clockNow() > observeUntil && globalThis.fetch === guardedFetch)
            globalThis.fetch = nativeFetch;
          return observe(names, live);
        }
        const overridden = await applyDebugSessionResumeOverride(
          request,
          nativeFetch,
          resumeLaunch?.overrides ?? [],
        );
        if (overridden) {
          if (overridden.override) appliedOverrides.push(overridden.override);
          return overridden.response;
        }
        // Once a resource is reacquired, its declared readers may read it:
        // the substitution itself makes them load again.
        const readCalls = (resumeLaunch?.plan.steps ?? []).flatMap((step) =>
          step.kind === 'refetch' &&
          !step.unneeded &&
          step.resource &&
          sharedResumeResources.has(step.resource)
            ? (step.allowedCalls ?? [])
            : [],
        );
        const permitted = new Set([
          ...allowedCalls,
          ...substitutedCalls,
          ...readCalls,
        ]);
        const call =
          names.find((name) => permitted.has(name)) ??
          names[0] ??
          `${request.method} ${request.url}`;
        if (substitutedCalls.has(call) || readCalls.includes(call))
          for (const name of names) rereadCalls.add(name);
        const decision = decideResumeCall(call, {
          allowedCalls: permitted,
          readOnly:
            isDefaultRead(request) ||
            (await options.resume?.isReadOnlyRequest?.(request.clone())) === true,
          unattended: resumeLaunch?.unattended ?? false,
        });
        if (decision === 'live') return observe(names, live);
        if (decision === 'blocked') {
          heldCallResults.push({
            id: `held:${call}`,
            status: 'blocked',
            detail: 'Appel non déclaré refusé : personne ne peut le valider.',
          });
          throw new Error(`Reprise refusée : appel non déclaré (${call}).`);
        }
        const held = await requestDecision(call);
        if (held === 'override') {
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
        if (held === 'live') return observe(names, live);
        throw new Error(`Reprise refusée : appel retenu (${call}).`);
      };
      globalThis.fetch = guardedFetch;
      releaseEarly(guardedFetch);
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
        const text = typeof body === 'string' ? body : '';
        const names = resumeCallNamesOf(
          request.method,
          request.url,
          text,
          location.href,
        );
        const call = names.find((name) => allowedCalls.has(name)) ?? names[0] ?? request.url;
        const placeholders = resumePlaceholdersOf(`${request.url}\n${text}`);
        const decision = decideResumeCall(call, {
          allowedCalls,
          readOnly:
            (request.method === 'GET' || request.method === 'HEAD') &&
            new URL(request.url, location.href).origin === location.origin,
          unattended: resumeLaunch?.unattended ?? false,
        });
        if (!request.async && (placeholders.length || decision !== 'live'))
          throw new Error('Reprise bloquée : requête XHR non déclarée.');
        const sendWith = (payload: typeof body) => {
          if (decision === 'live') return nativeSend.call(this, payload);
          if (decision === 'blocked') return this.abort();
          void requestDecision(call).then((held) => {
            if (held === 'live') nativeSend.call(this, payload);
            else this.abort();
          });
        };
        if (!placeholders.length) return sendWith(body);
        // The URL was given to open(): only the body can still be rewritten.
        void waitForPlaceholders(placeholders).then((missing) => {
          if (missing.length || resumePlaceholdersOf(request.url).length) {
            refusePlaceholders(call, missing);
            this.abort();
            return;
          }
          sendWith(
            substituteResumePlaceholders(text, (fingerprint) => {
              const value = placeholderValue(fingerprint);
              return value === undefined ? undefined : jsonStringContent(value);
            }).text,
          );
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
      // Taking over lifts the holds; fetch keeps substituting placeholders
      // and comparing declared outcomes for RESUME_OBSERVATION_MS.
      restoreResumeBarrier = () => {
        barrierActive = false;
        observeUntil = clockNow() + RESUME_OBSERVATION_MS;
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
            notifySubstitutions();
            send('resume-resource', normalized);
          },
          (calls) => calls.some((call) => rereadCalls.has(call)),
        );
        releaseAcquisitions = report.release;
        substitutionSettled = true;
        notifySubstitutions();
        resumeCompleted = true;
        const finalReport = createResumeFidelityReport(
          [...report.steps, ...heldCallResults, ...outcomeResults],
          [...report.overrides, ...appliedOverrides],
        );
        // An outcome that aborted the run while it was executing: the
        // executor only released for its own blocked steps.
        if (
          finalReport.classification === 'refused' &&
          !report.steps.some((step) => step.status === 'blocked')
        )
          void releaseOnce();
        send('resume-completed', {
          classification: finalReport.classification,
          overrides: finalReport.overrides,
          steps: finalReport.steps.map(({ id, status, detail, code }) => ({
            id,
            status,
            detail,
            ...(code ? { code } : {}),
          })),
          blocked: finalReport.steps
            .filter((step) => step.status === 'blocked')
            .map((step) => step.id),
          warnings: finalReport.warnings,
        });
      } catch {
        send('resume-error', {
          message:
            'Impossible de terminer la reprise guidée dans l’application.',
        });
      } finally {
        resumeRunning = false;
        resumeCompleted = true;
        substitutionSettled = true;
        notifySubstitutions();
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
        if (resource) {
          sharedResumeResources.set(resource.resource, resource.value);
          notifySubstitutions();
        }
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
          unattended: data['resumeUnattended'] === true,
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
