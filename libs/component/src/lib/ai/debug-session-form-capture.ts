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
  let openSelect: HTMLSelectElement | undefined;
  let openPicker: HTMLInputElement | undefined;
  const selectCanOpen = (element: Element): element is HTMLSelectElement =>
    element instanceof HTMLSelectElement &&
    !element.disabled &&
    !element.multiple &&
    element.size <= 1;
  const recordSelectPresentation = (
    element: HTMLSelectElement,
    action: 'select-open' | 'select-close',
    event: Event,
  ) => {
    if (paused || ɵwasReplayDomEventCaptured(event) || !session.activeClip)
      return;
    const selector = ɵstableReplaySelector(element);
    session.capture('dom', 'emitted', {
      name: `native:${action}`,
      payload: {
        action,
        eventName: event.type,
        interactionName: `native:${action}`,
        selector,
        replayTarget: ɵcaptureCraftReplayTarget(element, { selector }),
        valueOnly: true,
      },
      targets: [{ tagName: element.tagName, selector }],
    });
  };
  const recordPickerPresentation = (
    element: HTMLInputElement,
    action: 'picker-open' | 'picker-close',
    event: Event,
  ) => {
    if (paused || ɵwasReplayDomEventCaptured(event) || !session.activeClip)
      return;
    const selector = ɵstableReplaySelector(element);
    session.capture('dom', 'emitted', {
      name: `native:${action}`,
      payload: {
        action,
        eventName: event.type,
        interactionName: `native:${action}`,
        selector,
        replayTarget: ɵcaptureCraftReplayTarget(element, { selector }),
        controlType: element.type,
        valueOnly: true,
      },
      targets: [{ tagName: element.tagName, selector }],
    });
  };
  const recordNativeToggle = (event: Event) => {
    if (
      paused ||
      ɵwasReplayDomEventCaptured(event) ||
      !session.activeClip ||
      !(event.target instanceof HTMLElement)
    )
      return;
    const element = event.target;
    const stateKind =
      element instanceof HTMLDetailsElement
        ? 'details'
        : element instanceof HTMLDialogElement
          ? 'dialog'
          : element.hasAttribute('popover')
            ? 'popover'
            : undefined;
    if (!stateKind) return;
    const newState = (event as ToggleEvent).newState;
    let open =
      newState === 'open'
        ? true
        : newState === 'closed'
          ? false
          : stateKind === 'details' || stateKind === 'dialog'
            ? (element as HTMLDetailsElement | HTMLDialogElement).open
            : false;
    if (
      stateKind === 'popover' &&
      newState !== 'open' &&
      newState !== 'closed'
    ) {
      try {
        open = element.matches(':popover-open');
      } catch {
        open = false;
      }
    }
    const selector = ɵstableReplaySelector(element);
    let modal = false;
    if (stateKind === 'dialog') {
      try {
        modal = element.matches(':modal');
      } catch {
        modal = false;
      }
    }
    session.capture('dom', 'emitted', {
      name: `native:${stateKind}-${open ? 'open' : 'close'}`,
      payload: {
        action: `${stateKind}-${open ? 'open' : 'close'}`,
        eventName: event.type,
        interactionName: `native:${stateKind}-${open ? 'open' : 'close'}`,
        selector,
        replayTarget: ɵcaptureCraftReplayTarget(element, { selector }),
        stateKind,
        open,
        ...(stateKind === 'dialog' ? { modal } : {}),
        valueOnly: true,
      },
      targets: [{ tagName: element.tagName, selector }],
    });
  };
  const filePicker = (element: Element): element is HTMLInputElement =>
    element instanceof HTMLInputElement && element.type === 'file';
  const pickerType = (element: Element): string | undefined =>
    element instanceof HTMLInputElement &&
    ['date', 'datetime-local', 'month', 'time', 'week', 'color'].includes(
      element.type,
    )
      ? element.type
      : undefined;
  const shouldCaptureSelect = (event: Event) =>
    !paused && !ɵwasReplayDomEventCaptured(event) && !!session.activeClip;
  const onPointerDown = (event: Event) => {
    if (!shouldCaptureSelect(event)) return;
    const target = event.target instanceof Element ? event.target : undefined;
    const nextSelect = target?.closest('select');
    if (openSelect && openSelect !== nextSelect) {
      recordSelectPresentation(openSelect, 'select-close', event);
      openSelect = undefined;
    }
    const nextPicker = target?.closest('input');
    if (openPicker && openPicker !== nextPicker && nextPicker !== undefined) {
      recordPickerPresentation(openPicker, 'picker-close', event);
      openPicker = undefined;
    }
    if (nextSelect && selectCanOpen(nextSelect) && openSelect !== nextSelect) {
      recordSelectPresentation(nextSelect, 'select-open', event);
      openSelect = nextSelect;
    }
    if (nextPicker && pickerType(nextPicker) && openPicker !== nextPicker) {
      recordPickerPresentation(nextPicker, 'picker-open', event);
      openPicker = nextPicker;
    }
    if (nextPicker && filePicker(nextPicker)) {
      const selector = ɵstableReplaySelector(nextPicker);
      if (!paused && !ɵwasReplayDomEventCaptured(event) && session.activeClip)
        session.capture('dom', 'emitted', {
          name: 'native:file-picker-open',
          payload: {
            action: 'file-picker-open',
            eventName: event.type,
            interactionName: 'native:file-picker-open',
            selector,
            replayTarget: ɵcaptureCraftReplayTarget(nextPicker, { selector }),
            valueOnly: true,
          },
          targets: [{ tagName: nextPicker.tagName, selector }],
        });
    }
  };
  const onKeyDown = (event: Event) => {
    if (!shouldCaptureSelect(event)) return;
    if (!(event.target instanceof Element)) return;
    const target = event.target.closest('select');
    const key = (event as KeyboardEvent).key;
    const inputTarget = event.target.closest('input');
    if (openPicker === inputTarget && (key === 'Escape' || key === 'Tab')) {
      recordPickerPresentation(openPicker, 'picker-close', event);
      openPicker = undefined;
      return;
    }
    if (
      target &&
      selectCanOpen(target) &&
      openSelect === target &&
      (key === 'Escape' || key === 'Tab')
    ) {
      recordSelectPresentation(target, 'select-close', event);
      openSelect = undefined;
      return;
    }
    if (!target || !selectCanOpen(target)) {
      if (
        inputTarget &&
        pickerType(inputTarget) &&
        (key === 'ArrowDown' ||
          key === 'ArrowUp' ||
          key === ' ' ||
          key === 'Enter') &&
        openPicker !== inputTarget
      ) {
        recordPickerPresentation(inputTarget, 'picker-open', event);
        openPicker = inputTarget;
      }
      return;
    }
    const keyboardOpen =
      key === 'ArrowDown' ||
      key === 'ArrowUp' ||
      key === ' ' ||
      key === 'Enter';
    if (keyboardOpen && openSelect !== target) {
      recordSelectPresentation(target, 'select-open', event);
      openSelect = target;
    }
  };
  const capture = (event: Event) => {
    if (event.target instanceof HTMLSelectElement && event.type === 'change')
      openSelect = undefined;
    if (
      paused ||
      ɵwasReplayDomEventCaptured(event) ||
      !session.activeClip ||
      !(
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement
      )
    )
      return;

    const element = event.target;
    if (element instanceof HTMLInputElement && element.type === 'file') {
      if (event.type === 'change') {
        const selector = ɵstableReplaySelector(element);
        session.capture('dom', 'emitted', {
          name: 'native:file-selection',
          payload: {
            action: 'file-selection',
            selector,
            replayTarget: ɵcaptureCraftReplayTarget(element, { selector }),
            fileCount: element.files?.length ?? 0,
            replayable: false,
            valueOnly: true,
          },
          targets: [{ tagName: element.tagName, selector }],
        });
      }
      return;
    }
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
    const checked =
      explicitlyOptedIn &&
      element instanceof HTMLInputElement &&
      (element.type === 'checkbox' || element.type === 'radio')
        ? element.checked
        : undefined;
    if (element instanceof HTMLInputElement && event.type === 'change')
      openPicker = undefined;

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
        ...(checked === undefined ? {} : { checked }),
      },
      targets: [
        {
          tagName: element.tagName,
          selector: ɵstableReplaySelector(element),
        },
      ],
    });
  };
  const onToggle = (event: Event) => recordNativeToggle(event);
  const onReplayPersistence = (event: Event) => {
    const value = (event as CustomEvent<{ paused?: unknown }>).detail?.paused;
    if (typeof value === 'boolean') {
      paused = value;
      if (paused) openSelect = undefined;
      if (paused) openPicker = undefined;
    }
  };

  document.addEventListener('input', capture);
  document.addEventListener('change', capture);
  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('toggle', onToggle, true);
  window.addEventListener(
    CRAFT_DEBUG_REPLAY_PERSISTENCE_EVENT,
    onReplayPersistence,
  );
  return () => {
    document.removeEventListener('input', capture);
    document.removeEventListener('change', capture);
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('toggle', onToggle, true);
    openSelect = undefined;
    openPicker = undefined;
    window.removeEventListener(
      CRAFT_DEBUG_REPLAY_PERSISTENCE_EVENT,
      onReplayPersistence,
    );
  };
}
