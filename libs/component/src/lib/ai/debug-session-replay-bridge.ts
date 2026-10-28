import {
  provideAppInitializer,
  ɵinjectCraftPrimitiveRegistry,
  ɵinjectCraftRouterRuntime,
  ɵinjectCraftRouteActivationTracker,
  ɵinjectCraftCompiledRoutes,
  ɵinjectCraftMethodReplayRegistry,
  ɵinjectPersistedStorageSnapshotRegistry,
  ɵinjectSendContextSession,
  ɵclearCraftPrimitiveReplaySnapshots,
  ɵadvanceCraftHttpReplay,
  ɵinstallCraftHttpReplay,
  installCraftReplayTransports,
  injectCraftReplayTransports,
  ɵsetCraftReplayMode,
  ɵresolveCraftReplayTarget,
  ɵresolveCraftDeferReplayTarget,
  matchCraftRoutes,
  parseUrl,
  type CraftHttpReplayOutcome,
  type CraftReplayTarget,
  type SendContextEvent,
  type PersistedStorageSnapshotEntry,
} from '@craft-ts/core';
import type { Provider } from '../host-runtime';
import {
  createReplayController,
  createRecordedResponseResolver,
  getReplaySteps,
  installReplayNetworkGuard,
  isNetworkCoverageFailureEvent,
  type ReplayValidation,
  validateReplayExport,
} from './debug-session-replay';
import type { ReplayTargetResolver } from './debug-session-orchestrator';
import { startDebugSessionDialogReplay } from './debug-session-dialogs';
import {
  CRAFT_DEBUG_REPLAY_CHANNEL,
  isCraftDebugReplayLaunch,
  setCraftDebugReplayPersistencePaused,
} from './debug-session-replay-signals';
import { startDebugSnapshotLaunch } from './debug-session-snapshot-launch';
import {
  clearReplayStorageRestoreMarker,
  initialBrowserStorageSnapshot,
  markReplayStorageRestored,
  replayStorageWasRestored,
  restoreBrowserStorageSnapshot,
} from './debug-session-browser-storage';

const CHANNEL = CRAFT_DEBUG_REPLAY_CHANNEL;

export type CraftDebugReplayBridgeOptions = Readonly<{
  /** Exact dashboard origins allowed to control this application. */
  parentOrigins: readonly string[];
}>;

type BridgeMessage = Readonly<Record<string, unknown>> & {
  channel: typeof CHANNEL;
  type: string;
};

function createReplayTargetResolver(
  methods: ReturnType<typeof ɵinjectCraftMethodReplayRegistry>,
  routes: ReturnType<typeof ɵinjectCraftCompiledRoutes>,
): ReplayTargetResolver {
  const normalizeMethodAddress = (address: string) =>
    address
      .split(' / ')
      .map((part) => part.replace(/#\d+$/, ''))
      .join(' / ');

  return (kind, target) => {
    if (kind === 'method') {
      const normalized = normalizeMethodAddress(target);
      const matches = methods
        .addresses()
        .filter((address) => normalizeMethodAddress(address) === normalized);
      return matches.length === 1
        ? 'resolved'
        : matches.length > 1
          ? 'ambiguous'
          : 'unknown';
    }
    if (kind === 'activation') {
      const resolution = ɵresolveCraftDeferReplayTarget(target);
      return resolution.status === 'resolved'
        ? 'resolved'
        : resolution.status === 'ambiguous'
          ? 'ambiguous'
          : resolution.status === 'unstable-identity'
            ? 'unknown'
            : 'unknown';
    }
    try {
      const url = new URL(target, window.location.href);
      const routeLocation = parseUrl(`${url.pathname}${url.search}${url.hash}`);
      return matchCraftRoutes(routes, routeLocation) ? 'resolved' : 'unknown';
    } catch {
      return 'missing';
    }
  };
}

/**
 * Explicitly opts an application into dashboard control from an iframe parent.
 * Every request is checked against both the parent window and an exact origin.
 */
export function provideCraftDebugReplayBridge(
  options: CraftDebugReplayBridgeOptions,
): Provider[] {
  const allowedOrigins = new Set(
    options.parentOrigins.map((origin) => new URL(origin).origin),
  );
  return [
    provideAppInitializer(() => {
      if (typeof window === 'undefined') return;
      // Opened by the dashboard in its own tab: a live debug launch, not a replay.
      if (window.parent === window)
        return startDebugSnapshotLaunch({
          allowedOrigins,
          registry: ɵinjectCraftPrimitiveRegistry(),
          storageRegistry: ɵinjectPersistedStorageSnapshotRegistry(),
          methods: ɵinjectCraftMethodReplayRegistry(),
          reviveArgument: reviveReplayArgument,
        });
      // URL-mode replay is enabled before the root component creates query,
      // mutation, and asyncProcess resources. Transport guards prevent startup
      // requests from reaching a live server before the session is delivered.
      if (isCraftDebugReplayLaunch()) {
        ɵclearCraftPrimitiveReplaySnapshots(ɵinjectCraftPrimitiveRegistry());
        ɵsetCraftReplayMode(true);
      }
      let restoreReplayLaunchFetch: (() => void) | undefined;
      if (isCraftDebugReplayLaunch()) {
        const nativeFetch = globalThis.fetch;
        const blockedFetch: typeof fetch = async (input, init) => {
          const request = new Request(input, init);
          throw new Error(
            `Replay blocked live network request before recorded responses were installed: ${request.method} ${request.url}`,
          );
        };
        globalThis.fetch = blockedFetch;
        restoreReplayLaunchFetch = () => {
          if (globalThis.fetch === blockedFetch) globalThis.fetch = nativeFetch;
          restoreReplayLaunchFetch = undefined;
        };
      }
      const session = ɵinjectSendContextSession();
      const registry = ɵinjectCraftPrimitiveRegistry();
      const methodReplayRegistry = ɵinjectCraftMethodReplayRegistry();
      const storageRegistry = ɵinjectPersistedStorageSnapshotRegistry();
      const craftRouter = ɵinjectCraftRouterRuntime();
      const routeActivationTracker = ɵinjectCraftRouteActivationTracker();
      let resolveReplayBootstrap: (() => void) | undefined;
      const replayBootstrap = isCraftDebugReplayLaunch()
        ? new Promise<void>((resolve) => {
            resolveReplayBootstrap = resolve;
          })
        : undefined;
      let replay: ReturnType<typeof createReplayController> | undefined;
      // Set once the replay reports an error: it has stopped, and a step that
      // resolves afterwards must not tell the dashboard it is merely paused.
      let replayFailed = false;
      let replayInteractionCount = 0;
      let activeReplayRunId: string | undefined;
      let restoreCraftHttpReplay: (() => void) | undefined;
      let restoreReplayFetch: (() => void) | undefined;
      let replayFetchResolver:
        | ReturnType<typeof createRecordedResponseResolver>
        | undefined;
      let replayTransports:
        | ReturnType<typeof installCraftReplayTransports>
        | undefined = isCraftDebugReplayLaunch()
        ? installCraftReplayTransports([], [], () => undefined)
        : undefined;
      let restoreDialogs: () => void = () => undefined;
      const send = (
        origin: string,
        type: string,
        payload: Record<string, unknown> = {},
      ) => {
        window.parent.postMessage(
          { channel: CHANNEL, type, ...payload },
          origin,
        );
      };
      const onMessage = async (event: MessageEvent<unknown>) => {
        if (
          !isTrustedCraftDebugReplayMessage(
            event,
            window.parent,
            allowedOrigins,
          ) ||
          !isMessage(event.data)
        )
          return;
        const message = event.data;
        if (message.type === 'hello' && typeof message['nonce'] === 'string') {
          send(event.origin, 'ready', {
            nonce: message['nonce'],
            href: location.href,
          });
          return;
        }
        if (message.type === 'export') {
          if (!session)
            return send(event.origin, 'error', {
              message: 'Session capture is not enabled in this app.',
            });
          send(event.origin, 'export', {
            session: session.exportSessionJson(),
          });
          return;
        }
        if (message.type === 'start') {
          let validation: ReplayValidation;
          try {
            const json =
              typeof message['session'] === 'string'
                ? message['session']
                : JSON.stringify(message['session']);
            validation = validateReplayExport(json ?? '');
          } catch {
            validation = {
              ok: false as const,
              error: 'The replay session could not be serialized.',
            };
          }
          if (!validation.ok)
            return send(event.origin, 'error', { message: validation.error });
          if (!session)
            return send(event.origin, 'error', {
              message: 'Session capture is not enabled in this app.',
            });
          const replayTransportDefinitions = injectCraftReplayTransports();
          const adaptersById = new Map(
            replayTransportDefinitions.map((definition) => [
              definition.id,
              definition,
            ]),
          );
          const missingTransport = validation.session.events.find((entry) => {
            if (
              entry.kind !== 'transport' ||
              isNetworkCoverageFailureEvent(entry) ||
              !isRecord(entry.payload)
            )
              return false;
            const definition =
              typeof entry.payload['transportId'] === 'string'
                ? adaptersById.get(entry.payload['transportId'])
                : undefined;
            return (
              !definition || definition.kind !== entry.payload['transport']
            );
          });
          if (missingTransport) {
            const transportId = isRecord(missingTransport.payload)
              ? missingTransport.payload['transportId']
              : undefined;
            return send(event.origin, 'error', {
              message: `Replay transport adapter is not registered: ${String(transportId)}.`,
            });
          }
          const replayRunId =
            typeof message['replayRunId'] === 'string'
              ? message['replayRunId']
              : undefined;
          activeReplayRunId = replayRunId;
          const browserStorageSnapshot = initialBrowserStorageSnapshot(
            validation.session.events,
          );
          for (const warning of browserStorageSnapshot?.warnings ?? [])
            send(event.origin, 'warning', { message: warning });
          if (
            browserStorageSnapshot &&
            replayRunId &&
            !replayStorageWasRestored(replayRunId)
          ) {
            try {
              await restoreBrowserStorageSnapshot(browserStorageSnapshot);
              markReplayStorageRestored(replayRunId);
              window.location.reload();
            } catch (error) {
              send(event.origin, 'error', {
                message: error instanceof Error ? error.message : String(error),
              });
            }
            return;
          }
          // The replay launch initializer holds application bootstrap until
          // this message arrives. Prime both registries and install recorded
          // transport outcomes before root components can create loaders.
          if (validation.session.initialSnapshot)
            registry.restore(validation.session.initialSnapshot);
          const initialStorageSnapshot = validation.session.events.find(
            (entry) =>
              entry.kind === 'storage' && entry.name === 'initial-snapshot',
          )?.payload;
          if (
            isRecord(initialStorageSnapshot) &&
            Array.isArray(initialStorageSnapshot['entries'])
          )
            storageRegistry.restore(
              initialStorageSnapshot[
                'entries'
              ] as PersistedStorageSnapshotEntry[],
            );
          replay?.stop();
          ɵclearCraftPrimitiveReplaySnapshots(registry);
          ɵsetCraftReplayMode(true);
          restoreCraftHttpReplay?.();
          restoreReplayFetch?.();
          replayFetchResolver?.dispose();
          replayTransports?.restore();
          replayTransports = installCraftReplayTransports(
            replayTransportDefinitions,
            validation.session.events.filter(
              (event) => event.kind === 'transport',
            ),
            (difference) => {
              send(event.origin, 'difference', {
                difference: {
                  ...difference,
                  transport: {
                    transportId: difference.transportId,
                    instanceId: difference.instanceId,
                    direction: difference.direction,
                    sequence: difference.sequence,
                    message: difference.message,
                  },
                },
              });
            },
          );
          restoreCraftHttpReplay = ɵinstallCraftHttpReplay(
            craftHttpReplayOutcomes(validation.session.events),
          );
          replayFetchResolver = createRecordedResponseResolver(
            validation.session,
          );
          const replayTransportFetch = globalThis.fetch.bind(globalThis);
          restoreReplayFetch = installReplayNetworkGuard(
            replayFetchResolver,
            () => {
              send(event.origin, 'difference', {
                difference: {
                  expected: '[recorded browser fetch response]',
                  actual: '[blocked before network]',
                  transport: {
                    transportId: 'network:fetch',
                    instanceId: 'unmatched-fetch',
                    direction: 'outgoing',
                    sequence: 1,
                    message: 'Replay blocked an unmatched fetch request.',
                  },
                },
              });
            },
            (request) => replayTransportFetch(request),
          );
          restoreDialogs();
          restoreDialogs = startDebugSessionDialogReplay(
            validation.session.events,
            (dialog) => send(event.origin, 'dialog', { dialog }),
          );
          setCraftDebugReplayPersistencePaused(true);
          replayInteractionCount = getReplaySteps(
            validation.session.events,
          ).length;
          replayFailed = false;
          replay = createReplayController(validation.session, {
            mode:
              message['mode'] === 'diagnostic' ? 'diagnostic' : 'invocation',
            verifyRecordedState: message['verifyState'] === true,
            resolveTarget: createReplayTargetResolver(
              methodReplayRegistry,
              ɵinjectCraftCompiledRoutes(),
            ),
            ...(typeof message['startIndex'] === 'number' &&
            Number.isSafeInteger(message['startIndex'])
              ? { startIndex: message['startIndex'] }
              : {}),
            ...(typeof message['timelineOriginMs'] === 'number' &&
            Number.isFinite(message['timelineOriginMs'])
              ? { timelineOriginMs: message['timelineOriginMs'] }
              : {}),
            observedEvents: () => session.events,
            readState: () => registry.capture(),
            restoreState: (state, recordedEvent) => {
              if (!isRecord(state)) return;
              const payload = isRecord(recordedEvent?.payload)
                ? recordedEvent.payload
                : undefined;
              const address = payload?.['address'];
              const metadata =
                typeof address === 'string' &&
                typeof payload?.['status'] === 'string'
                  ? {
                      [address]: {
                        status: payload['status'],
                        ...(payload['error'] === undefined
                          ? {}
                          : { error: payload['error'] }),
                      },
                    }
                  : undefined;
              registry.restore(state, metadata);
            },
            onTimelineAdvance: async (elapsedMs) => {
              replayFetchResolver?.advanceTo(elapsedMs);
              ɵadvanceCraftHttpReplay(elapsedMs);
              replayTransports?.advanceTo(elapsedMs);
              await Promise.resolve();
              await Promise.resolve();
              replayTransports?.assertDue(elapsedMs);
            },
            invokeRecordedMethod: async (event) => {
              const eventPayload = isRecord(event.payload) ? event.payload : {};
              const invocation = isRecord(eventPayload['replayInvocation'])
                ? eventPayload['replayInvocation']
                : undefined;
              if (
                !invocation ||
                typeof invocation['address'] !== 'string' ||
                !Array.isArray(invocation['args'])
              )
                throw new Error(
                  `L’appel de replay ${event.sequence} ne contient pas de méthode ou d’arguments valides.`,
                );
              const result = methodReplayRegistry.invoke(
                invocation['address'],
                undefined,
                invocation['args'].map(reviveReplayArgument),
              );
              if (result instanceof Promise) await result;
            },
            onDeferActivation: async (_event, targetId) => {
              const resolution = ɵresolveCraftDeferReplayTarget(targetId);
              if (resolution.status !== 'resolved')
                throw new Error(
                  resolution.status === 'missing'
                    ? `Nœud différé introuvable pour l’activation enregistrée (${targetId}).`
                    : resolution.status === 'unstable-identity'
                      ? `L’identité du nœud différé est instable ; activation refusée (${targetId}).`
                      : `L’identité du nœud différé est ambiguë ; activation refusée (${targetId}).`,
                );
              return resolution.activate();
            },
            navigateToRecordedRoute: async (url, navigationOptions) => {
              const route = craftReplayRouteForSameOriginHref(
                url,
                location.href,
              );
              if (!craftRouter)
                throw new Error(
                  'Le routeur Craft de l’application n’est pas disponible pour le replay.',
                );
              const currentRoute = `${location.pathname}${location.search}${location.hash}`;
              const activationWaiter =
                currentRoute === route
                  ? routeActivationTracker.waitFor(route)
                  : routeActivationTracker.waitForNext(route);
              try {
                if (currentRoute !== route) {
                  const navigated = await craftRouter.navigateByUrl(
                    route,
                    navigationOptions,
                  );
                  if (!navigated)
                    throw new Error(
                      `Le routeur Craft a refusé la destination ${route}.`,
                    );
                }
                await activationWaiter.promise;
              } catch (error) {
                activationWaiter.cancel();
                await activationWaiter.promise.catch(() => undefined);
                throw error;
              }
            },
            prepare: async () => {
              if (message['startMode'] === 'snapshot') {
                const snapshot = [...(validation.session.snapshots ?? [])].sort(
                  (left, right) => right.capturedAt - left.capturedAt,
                )[0];
                if (!snapshot)
                  throw new Error(
                    'This session has no complete, versioned replay snapshot.',
                  );
                await storageRegistry.restore(snapshot.storage);
                registry.restore(snapshot.primitives);
                if (!craftRouter)
                  throw new Error(
                    'The Craft router is unavailable for snapshot restoration.',
                  );
                const route = craftReplayRouteForSameOriginHref(
                  snapshot.route.url,
                  location.href,
                );
                if (!(await craftRouter.navigateByUrl(route)))
                  throw new Error(
                    `The Craft router refused snapshot route ${route}.`,
                  );
              }
              // URL mode must also start from the exact state captured before
              // the first interaction. This restores startup query results
              // whose network requests were denied before replay outcomes
              // arrived from the dashboard.
              if (
                message['startMode'] !== 'snapshot' &&
                validation.session.initialSnapshot
              )
                registry.restore(validation.session.initialSnapshot);
            },
            onError: (error) => {
              replayFailed = true;
              if (replayRunId) clearReplayStorageRestoreMarker(replayRunId);
              restoreDialogs();
              restoreDialogs = () => undefined;
              setCraftDebugReplayPersistencePaused(false);
              ɵsetCraftReplayMode(false);
              restoreReplayLaunchFetch?.();
              ɵclearCraftPrimitiveReplaySnapshots(registry);
              restoreCraftHttpReplay?.();
              restoreCraftHttpReplay = undefined;
              restoreReplayFetch?.();
              restoreReplayFetch = undefined;
              replayFetchResolver?.dispose();
              replayFetchResolver = undefined;
              replayTransports?.restore();
              replayTransports = undefined;
              send(event.origin, 'error', { message: error });
            },
            onWarning: (warning) => {
              send(event.origin, 'warning', { message: warning });
            },
            onDiagnostic: (report) => {
              if (!report.missing.length && !report.unexpected.length) return;
              send(event.origin, 'warning', {
                message: `Diagnostic · ${report.commandId}: attendues absentes [${report.missing.join(', ') || 'aucune'}] · inattendues [${report.unexpected.join(', ') || 'aucune'}].`,
              });
            },
            onInteraction: (interaction, target) => {
              const payload = isRecord(interaction.payload)
                ? interaction.payload
                : {};
              const rect = target.getBoundingClientRect();
              send(event.origin, 'interaction', {
                kind: interaction.kind,
                action: payload['action'],
                trigger: payload['trigger'],
                name: interaction.name,
                nextIndex: (replay?.index() ?? 0) + 1,
                clientX:
                  typeof payload['clientX'] === 'number'
                    ? payload['clientX']
                    : rect.left + rect.width / 2,
                clientY:
                  typeof payload['clientY'] === 'number'
                    ? payload['clientY']
                    : rect.top + rect.height / 2,
              });
            },
            onScroll: (scroll) => {
              send(event.origin, 'scroll-step', {
                name: scroll.name,
                nextIndex: (replay?.index() ?? 0) + 1,
              });
            },
            onViewport: async (viewport) => {
              const payload = isRecord(viewport.payload)
                ? viewport.payload
                : {};
              const width = payload['width'];
              const height = payload['height'];
              if (
                typeof width !== 'number' ||
                typeof height !== 'number' ||
                !Number.isSafeInteger(width) ||
                !Number.isSafeInteger(height) ||
                width < 1 ||
                height < 1 ||
                width > 16_384 ||
                height > 16_384
              )
                throw new Error(
                  `Replay viewport event ${viewport.sequence} is invalid.`,
                );
              send(event.origin, 'viewport-step', {
                width,
                height,
                nextIndex: (replay?.index() ?? 0) + 1,
              });
              await waitForViewportSize(width, height);
            },
            onReplayDifference: (difference) => {
              send(event.origin, 'difference', { difference });
            },
            forceRecovery: async (recovery) => {
              if (recovery.href) {
                const route = craftReplayRouteForSameOriginHref(
                  recovery.href,
                  location.href,
                );
                if (!craftRouter)
                  throw new Error(
                    'Le routeur Craft de l’application n’est pas disponible pour la reprise.',
                  );
                const navigated = await craftRouter.navigateByUrl(route);
                if (!navigated)
                  throw new Error(
                    `Le routeur Craft a refusé la destination ${route}.`,
                  );
              }
              if (
                typeof recovery.state === 'object' &&
                recovery.state !== null &&
                !Array.isArray(recovery.state)
              )
                registry.restore(
                  recovery.state as Parameters<typeof registry.restore>[0],
                );
            },
            onProgress: (index, total, state, nextDelayMs) => {
              if (state === 'completed') replayTransports?.assertComplete();
              send(event.origin, 'progress', {
                index,
                total,
                state,
                href: location.href,
                ...(nextDelayMs === undefined ? {} : { nextDelayMs }),
              });
              if (state === 'completed') restoreDialogs();
              if (state === 'completed' && replayRunId)
                clearReplayStorageRestoreMarker(replayRunId);
              if (state === 'completed') restoreDialogs = () => undefined;
              if (state === 'completed') {
                restoreCraftHttpReplay?.();
                restoreCraftHttpReplay = undefined;
                restoreReplayFetch?.();
                restoreReplayFetch = undefined;
                replayFetchResolver?.dispose();
                replayFetchResolver = undefined;
                replayTransports?.restore();
                replayTransports = undefined;
              }
              if (state === 'completed')
                setCraftDebugReplayPersistencePaused(false);
              if (state === 'completed') {
                ɵsetCraftReplayMode(false);
                restoreReplayLaunchFetch?.();
                ɵclearCraftPrimitiveReplaySnapshots(registry);
              }
            },
          });
          send(event.origin, 'status', {
            status: 'ready',
            eventCount: validation.session.events.length,
          });
          resolveReplayBootstrap?.();
          resolveReplayBootstrap = undefined;
          return;
        }
        if (message.type === 'step') {
          void replay
            ?.step()
            .then((difference) => {
              if (replayFailed) return;
              send(event.origin, 'step', {
                index: replay?.index() ?? 0,
                href: location.href,
                state:
                  replay && replay.index() >= replayInteractionCount
                    ? 'completed'
                    : 'paused',
                total: replayInteractionCount,
                ...(difference ? { difference } : {}),
              });
            })
            .catch((error: unknown) => {
              send(event.origin, 'error', {
                message: error instanceof Error ? error.message : String(error),
              });
            });
          return;
        }
        if (message.type === 'force-recover') {
          const activeReplay = replay;
          void activeReplay
            ?.forceAndContinue()
            .then((recovery) => {
              if (!recovery)
                return send(event.origin, 'error', {
                  message:
                    'Aucune destination ou aucun point de contrôle ne permet la reprise forcée.',
                });
              send(event.origin, 'recovered', {
                index: activeReplay.index(),
                href: recovery.href,
                currentHref: location.href,
                stateRestored: recovery.state !== undefined,
              });
            })
            .catch((error: unknown) =>
              send(event.origin, 'error', {
                message: error instanceof Error ? error.message : String(error),
              }),
            );
          return;
        }
        if (message.type === 'skip-to-checkpoint') {
          const activeReplay = replay;
          void activeReplay
            ?.skipToCheckpoint()
            .then((skipped) => {
              if (!skipped)
                return send(event.origin, 'error', {
                  message:
                    'Aucun checkpoint compatible ne permet de franchir cet écart en sécurité.',
                });
              send(event.origin, 'skipped', {
                index: activeReplay.index(),
                from: skipped.from,
                to: skipped.to,
                checkpointEventId: skipped.checkpointEventId,
              });
            })
            .catch((error: unknown) =>
              send(event.origin, 'error', {
                message: error instanceof Error ? error.message : String(error),
              }),
            );
          return;
        }
        if (message.type === 'play') {
          replay?.play();
          send(event.origin, 'status', {
            status: 'playing',
            index: replay?.index() ?? 0,
          });
          return;
        }
        if (message.type === 'skip-wait') {
          replay?.skipWait();
          return;
        }
        if (message.type === 'pause') {
          replay?.pause();
          send(event.origin, 'status', {
            status: 'paused',
            index: replay?.index() ?? 0,
          });
          return;
        }
        if (message.type === 'stop') {
          replay?.stop();
          replay = undefined;
          ɵsetCraftReplayMode(false);
          restoreReplayLaunchFetch?.();
          ɵclearCraftPrimitiveReplaySnapshots(registry);
          restoreCraftHttpReplay?.();
          restoreCraftHttpReplay = undefined;
          replayTransports?.restore();
          replayTransports = undefined;
          if (activeReplayRunId)
            clearReplayStorageRestoreMarker(activeReplayRunId);
          activeReplayRunId = undefined;
          restoreDialogs();
          restoreDialogs = () => undefined;
          setCraftDebugReplayPersistencePaused(false);
          send(event.origin, 'status', { status: 'stopped', index: 0 });
        }
      };
      window.addEventListener('message', onMessage);
      const cleanup = () => {
        window.removeEventListener('message', onMessage);
        replay?.stop();
        ɵsetCraftReplayMode(false);
        restoreReplayLaunchFetch?.();
        ɵclearCraftPrimitiveReplaySnapshots(registry);
        restoreCraftHttpReplay?.();
        replayTransports?.restore();
        restoreDialogs();
      };
      if (replayBootstrap) {
        // `provideAppInitializer` waits for this promise, so no component or
        // loader observes the page's live startup state during replay.
        return replayBootstrap.then(() => undefined);
      }
      return cleanup;
    }),
  ];
}

/** Turns a recorded method argument back into a value (dates, events, bigints…). */
export function ɵreviveReplayArgument(value: unknown): unknown {
  return reviveReplayArgument(value);
}

function reviveReplayArgument(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reviveReplayArgument);
  if (!isRecord(value)) return value;
  if ('$craftReplayUnsupported' in value)
    throw new Error(
      `Recorded Craft argument is not replayable: ${String(value['$craftReplayUnsupported'])}.`,
    );
  if (value['$craftReplayUndefined'] === true) return undefined;
  if (typeof value['$craftReplayBigInt'] === 'string')
    return BigInt(value['$craftReplayBigInt']);
  if (typeof value['$craftReplayDate'] === 'string')
    return new Date(value['$craftReplayDate']);
  if (typeof value['$craftReplayNumber'] === 'string') {
    if (value['$craftReplayNumber'] === '-0') return -0;
    const number = Number(value['$craftReplayNumber']);
    if (Number.isNaN(number)) return Number.NaN;
    if (value['$craftReplayNumber'] === 'Infinity')
      return Number.POSITIVE_INFINITY;
    if (value['$craftReplayNumber'] === '-Infinity')
      return Number.NEGATIVE_INFINITY;
    return number;
  }
  if (isRecord(value['$craftReplayEvent'])) {
    const recorded = value['$craftReplayEvent'];
    const type =
      typeof recorded['type'] === 'string' ? recorded['type'] : 'event';
    const init = isRecord(recorded['eventInit']) ? recorded['eventInit'] : {};
    const event =
      type.startsWith('pointer') && typeof PointerEvent !== 'undefined'
        ? new PointerEvent(type, init)
        : (type.startsWith('mouse') || type === 'click') &&
            typeof MouseEvent !== 'undefined'
          ? new MouseEvent(type, init)
          : type.startsWith('key') && typeof KeyboardEvent !== 'undefined'
            ? new KeyboardEvent(type, init)
            : type.startsWith('input') && typeof InputEvent !== 'undefined'
              ? new InputEvent(type, init)
              : new Event(type, init);
    let target: Element | undefined;
    if (isRecord(recorded['replayTarget'])) {
      const resolution = ɵresolveCraftReplayTarget(
        recorded['replayTarget'] as unknown as CraftReplayTarget,
      );
      if (resolution.status !== 'resolved')
        throw new Error(
          `Recorded event target could not be resolved: ${resolution.status}.`,
        );
      target = resolution.element;
    } else if (typeof recorded['targetSelector'] === 'string') {
      target = document.querySelector(recorded['targetSelector']) ?? undefined;
    }
    if (target) {
      Object.defineProperty(event, 'target', {
        configurable: true,
        value: target,
      });
      Object.defineProperty(event, 'currentTarget', {
        configurable: true,
        value: target,
      });
    }
    return event;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      reviveReplayArgument(entry),
    ]),
  );
}

/** Validates a recorded destination before it can reach the Craft router. */
export function craftReplayRouteForSameOriginHref(
  href: string,
  currentHref: string,
): string {
  let decodedHref = href;
  try {
    decodedHref = decodeURIComponent(href);
  } catch {
    // URL parsing below reports malformed encodings as a normal invalid URL.
  }
  if (/\[REDACTED\]/i.test(decodedHref))
    throw new Error(
      'La destination enregistrée contient un paramètre secret masqué et ne peut pas être forcée.',
    );

  let destination: URL;
  let current: URL;
  try {
    destination = new URL(href, currentHref);
    current = new URL(currentHref);
  } catch {
    throw new Error('La destination enregistrée n’est pas une URL valide.');
  }
  if (destination.username || destination.password)
    throw new Error(
      'La destination enregistrée contient des identifiants et ne peut pas être forcée.',
    );
  if (destination.protocol !== 'http:' && destination.protocol !== 'https:')
    throw new Error('La reprise forcée accepte uniquement une URL HTTP(S).');
  if (destination.origin !== current.origin)
    throw new Error(
      'La reprise forcée est limitée à une navigation de même origine.',
    );
  return `${destination.pathname}${destination.search}${destination.hash}`;
}

/** Pure source/origin check used by the bridge and its security tests. */
export function isTrustedCraftDebugReplayMessage(
  event: Pick<MessageEvent<unknown>, 'source' | 'origin'>,
  expectedSource: MessageEventSource | null,
  allowedOrigins: ReadonlySet<string>,
): boolean {
  return event.source === expectedSource && allowedOrigins.has(event.origin);
}

async function waitForViewportSize(
  width: number,
  height: number,
  timeoutMs = 2_000,
): Promise<void> {
  const deadline = performance.now() + timeoutMs;
  while (window.innerWidth !== width || window.innerHeight !== height) {
    if (performance.now() >= deadline)
      throw new Error(
        `Replay viewport did not resize to ${width} × ${height} px.`,
      );
    await new Promise<void>((resolve) => setTimeout(resolve, 16));
  }
}

function isMessage(value: unknown): value is BridgeMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<string, unknown>)['channel'] === CHANNEL &&
    typeof (value as Record<string, unknown>)['type'] === 'string'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function craftHttpReplayOutcomes(
  events: readonly SendContextEvent[],
): CraftHttpReplayOutcome[] {
  return events.flatMap((started) => {
    if (
      started.kind !== 'http' ||
      started.phase !== 'started' ||
      !started.operationId ||
      !isRecord(started.payload) ||
      started.payload['source'] !== 'craft-http-client' ||
      typeof started.payload['method'] !== 'string' ||
      typeof started.payload['url'] !== 'string'
    )
      return [];
    const finished = events.find(
      (candidate) =>
        candidate.kind === 'http' &&
        candidate.operationId === started.operationId &&
        (candidate.phase === 'succeeded' || candidate.phase === 'failed'),
    );
    if (!finished) return [];
    if (finished.phase !== 'succeeded' && finished.phase !== 'failed')
      return [];
    return [
      {
        context: {
          method: started.payload['method'],
          url: started.payload['url'],
          ...(started.payload['params'] === undefined
            ? {}
            : { params: started.payload['params'] }),
          ...(started.payload['payload'] === undefined
            ? {}
            : { payload: started.payload['payload'] }),
          ...(typeof started.payload['replayKey'] === 'string'
            ? { replayKey: started.payload['replayKey'] }
            : {}),
        },
        elapsedMs:
          finished.globalElapsedMs ?? finished.elapsedMs ?? finished.timestamp,
        phase: finished.phase,
        response: finished.response,
      },
    ];
  });
}
