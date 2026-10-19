import {
  ɵcaptureCraftReplayTarget,
  ɵstableReplaySelector,
  ɵwasReplayDomEventCaptured,
  type SendContextSession,
} from '@craft-ts/core';
import { CRAFT_DEBUG_REPLAY_PERSISTENCE_EVENT } from './debug-session-replay-signals';

export type DebugSessionFormCaptureOptions = Readonly<{
  captureInputValues?: boolean;
  captureSensitiveInputValues?: boolean;
}>;

/** Captures native form-control changes that do not pass through Craft DOM hooks. */
export function connectDebugSessionFormCapture(
  session: SendContextSession,
  options: DebugSessionFormCaptureOptions = {},
): () => void {
  let paused = false;
  const capture = (event: Event) => {
    if (
      paused ||
      ɵwasReplayDomEventCaptured(event) ||
      !session.activeClip ||
      !(event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement)
    )
      return;

    const element = event.target;
    const explicitlyOptedIn =
      options.captureInputValues === true ||
      element.getAttribute('data-debug-session-capture-value') === 'true' ||
      element.getAttribute('data-debug-session-capture-sensitive-value') ===
        'true';
    const sensitive =
      (element instanceof HTMLInputElement && element.type === 'password') ||
      /password|secret|token|authorization|cookie/i.test(
        `${element.getAttribute('name') ?? ''} ${element.id}`,
      );
    const sensitiveCaptureAllowed =
      options.captureSensitiveInputValues === true ||
      element.getAttribute('data-debug-session-capture-sensitive-value') ===
        'true';
    const value =
      explicitlyOptedIn && (!sensitive || sensitiveCaptureAllowed)
        ? element.value
        : undefined;

    session.capture('dom', 'emitted', {
      name: `native:${event.type}`,
      payload: {
        action: event.type,
        eventName: event.type,
        interactionName: `native:${event.type}`,
        selector: ɵstableReplaySelector(element),
        replayTarget: ɵcaptureCraftReplayTarget(element, {
          selector: ɵstableReplaySelector(element),
        }),
        valueOnly: true,
        ...(value === undefined ? {} : { value }),
      },
      targets: [
        {
          tagName: element.tagName,
          selector: ɵstableReplaySelector(element),
        },
      ],
    });
  };
  const onReplayPersistence = (event: Event) => {
    const value = (event as CustomEvent<{ paused?: unknown }>).detail?.paused;
    if (typeof value === 'boolean') paused = value;
  };

  document.addEventListener('input', capture);
  document.addEventListener('change', capture);
  window.addEventListener(
    CRAFT_DEBUG_REPLAY_PERSISTENCE_EVENT,
    onReplayPersistence,
  );
  return () => {
    document.removeEventListener('input', capture);
    document.removeEventListener('change', capture);
    window.removeEventListener(
      CRAFT_DEBUG_REPLAY_PERSISTENCE_EVENT,
      onReplayPersistence,
    );
  };
}
