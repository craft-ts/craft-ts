import {
  provideAppInitializer,
  ɵinjectCraftPrimitiveRegistry,
  ɵinjectCraftRouterRuntime,
  ɵinjectSendContextSession,
} from '@craft-ts/core';
import type { Provider } from '../host-runtime';
import {
  createReplayController,
  type ReplayValidation,
  validateReplayExport,
} from './debug-session-replay';
import { setCraftDebugReplayPersistencePaused } from './debug-session-replay-signals';

const CHANNEL = 'craft-debug-replay';

export type CraftDebugReplayBridgeOptions = Readonly<{
  /** Exact dashboard origins allowed to control this application. */
  parentOrigins: readonly string[];
}>;

type BridgeMessage = Readonly<Record<string, unknown>> & {
  channel: typeof CHANNEL;
  type: string;
};

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
      if (typeof window === 'undefined' || window.parent === window) return;
      const session = ɵinjectSendContextSession();
      const registry = ɵinjectCraftPrimitiveRegistry();
      const craftRouter = ɵinjectCraftRouterRuntime();
      let replay: ReturnType<typeof createReplayController> | undefined;
      let replayInteractionCount = 0;
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
      const onMessage = (event: MessageEvent<unknown>) => {
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
          replay?.stop();
          if (!session)
            return send(event.origin, 'error', {
              message: 'Session capture is not enabled in this app.',
            });
          setCraftDebugReplayPersistencePaused(true);
          replayInteractionCount = validation.session.events.filter(
            (item) =>
              item.phase === 'emitted' &&
              (item.kind === 'dom' ||
                item.kind === 'scroll' ||
                item.kind === 'viewport'),
          ).length;
          replay = createReplayController(validation.session, {
            ...(typeof message['timelineOriginMs'] === 'number' &&
            Number.isFinite(message['timelineOriginMs'])
              ? { timelineOriginMs: message['timelineOriginMs'] }
              : {}),
            observedEvents: () => session.events,
            readState: () => registry.capture(),
            prepare: () => {
              if (message['startMode'] === 'snapshot') {
                if (!validation.session.initialSnapshot)
                  throw new Error('This session has no initial snapshot.');
                registry.restore(validation.session.initialSnapshot);
              }
            },
            onError: (error) => {
              setCraftDebugReplayPersistencePaused(false);
              send(event.origin, 'error', { message: error });
            },
            onInteraction: (interaction, target) => {
              const payload = isRecord(interaction.payload)
                ? interaction.payload
                : {};
              const rect = target.getBoundingClientRect();
              send(event.origin, 'interaction', {
                action: payload['action'],
                name: interaction.name,
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
              send(event.origin, 'viewport-step', { width, height });
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
              send(event.origin, 'progress', {
                index,
                total,
                state,
                ...(nextDelayMs === undefined ? {} : { nextDelayMs }),
              });
              if (state === 'completed')
                setCraftDebugReplayPersistencePaused(false);
            },
          });
          send(event.origin, 'status', {
            status: 'ready',
            eventCount: validation.session.events.length,
          });
          return;
        }
        if (message.type === 'step') {
          void replay
            ?.step()
            .then((difference) => {
              send(event.origin, 'step', {
                index: replay?.index() ?? 0,
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
          setCraftDebugReplayPersistencePaused(false);
          send(event.origin, 'status', { status: 'stopped', index: 0 });
        }
      };
      window.addEventListener('message', onMessage);
      return () => {
        window.removeEventListener('message', onMessage);
        replay?.stop();
      };
    }),
  ];
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
