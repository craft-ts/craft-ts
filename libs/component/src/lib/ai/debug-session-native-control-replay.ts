import type { SendContextEvent } from '@craft-ts/core';

/** A replay-only visual stand-in for the browser-owned native select popup. */
export function createDebugSessionNativeControlReplayPresentation(): {
  sync(
    event: SendContextEvent,
    target: HTMLElement,
    onWarning?: (message: string) => void,
  ): void;
  close(): void;
  dispose(): void;
} {
  let select: HTMLSelectElement | undefined;
  let anchor: HTMLElement | undefined;
  let popup: HTMLDivElement | undefined;

  const clear = () => {
    popup?.remove();
    popup = undefined;
    select = undefined;
    anchor = undefined;
  };

  const close = () => {
    window.removeEventListener('resize', position);
    window.removeEventListener('scroll', position, true);
    clear();
  };

  function position(): void {
    if (!anchor || !popup) return;
    if (!anchor.isConnected) {
      close();
      return;
    }

    const rect = anchor.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    const width = Math.max(
      120,
      Math.min(Math.max(rect.width, 180), viewportWidth),
    );
    const left = Math.max(0, Math.min(rect.left, viewportWidth - width));
    const availableBelow = Math.max(0, viewportHeight - rect.bottom - 8);
    const availableAbove = Math.max(0, rect.top - 8);
    const maxHeight = Math.max(
      48,
      Math.min(280, Math.max(availableBelow, availableAbove)),
    );
    const placeAbove =
      availableBelow < Math.min(180, maxHeight) &&
      availableAbove > availableBelow;

    popup.style.left = `${left}px`;
    popup.style.width = `${width}px`;
    popup.style.maxHeight = `${maxHeight}px`;
    popup.style.top = placeAbove
      ? `${Math.max(0, rect.top - maxHeight)}px`
      : `${Math.max(0, rect.bottom)}px`;
  }

  const open = (target: HTMLSelectElement) => {
    close();
    if (
      !target.isConnected ||
      target.disabled ||
      target.multiple ||
      target.size > 1
    )
      return;

    select = target;
    anchor = target;
    popup = document.createElement('div');
    popup.dataset['craftSelectReplayOverlay'] = '';
    popup.setAttribute('aria-hidden', 'true');
    Object.assign(popup.style, {
      position: 'fixed',
      zIndex: '2147483647',
      boxSizing: 'border-box',
      overflowY: 'auto',
      overscrollBehavior: 'contain',
      pointerEvents: 'none',
      padding: '3px',
      border: '1px solid color-mix(in srgb, CanvasText 24%, transparent)',
      borderRadius: '6px',
      background: 'Canvas',
      color: 'CanvasText',
      boxShadow: '0 4px 18px rgb(0 0 0 / 24%)',
      font: getComputedStyle(target).font,
      lineHeight: '1.4',
    });

    for (const option of Array.from(target.options)) {
      const row = document.createElement('div');
      row.textContent = option.label || option.textContent || option.value;
      Object.assign(row.style, {
        boxSizing: 'border-box',
        minHeight: '28px',
        padding: '4px 8px',
        borderRadius: '3px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        opacity: option.disabled ? '0.55' : '1',
      });
      if (option.parentElement instanceof HTMLOptGroupElement)
        row.style.paddingLeft = '20px';
      if (option.selected) {
        row.style.background = 'Highlight';
        row.style.color = 'HighlightText';
      }
      popup.append(row);
    }

    document.body.append(popup);
    position();
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
  };

  const openNotice = (target: HTMLInputElement, text: string) => {
    close();
    if (!target.isConnected) return;
    anchor = target;
    popup = document.createElement('div');
    popup.dataset['craftSelectReplayOverlay'] = '';
    popup.setAttribute('aria-hidden', 'true');
    popup.textContent = text;
    Object.assign(popup.style, {
      position: 'fixed',
      zIndex: '2147483647',
      boxSizing: 'border-box',
      maxWidth: 'min(320px, calc(100vw - 16px))',
      padding: '10px 12px',
      border: '1px solid color-mix(in srgb, CanvasText 24%, transparent)',
      borderRadius: '6px',
      background: 'Canvas',
      color: 'CanvasText',
      boxShadow: '0 4px 18px rgb(0 0 0 / 24%)',
      font: getComputedStyle(target).font,
      lineHeight: '1.4',
      pointerEvents: 'none',
    });
    document.body.append(popup);
    position();
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
  };

  const sync = (
    event: SendContextEvent,
    target: HTMLElement,
    onWarning?: (message: string) => void,
  ) => {
    const payload =
      typeof event.payload === 'object' && event.payload !== null
        ? (event.payload as Record<string, unknown>)
        : {};
    const action = payload['action'];
    if (action === 'select-open' && target instanceof HTMLSelectElement) {
      open(target);
      return;
    }
    if (
      action === 'picker-open' &&
      target instanceof HTMLInputElement &&
      typeof payload['controlType'] === 'string'
    ) {
      openNotice(
        target,
        `Sélecteur ${payload['controlType']} (aperçu du replay)`,
      );
      return;
    }
    if (action === 'file-picker-open' && target instanceof HTMLInputElement) {
      openNotice(target, 'Sélecteur de fichiers (aperçu du replay)');
      return;
    }
    if (action === 'file-selection') {
      close();
      onWarning?.(
        'La sélection de fichiers enregistrée ne peut pas être restaurée pendant le replay.',
      );
      return;
    }
    if (
      action === 'select-close' ||
      action === 'picker-close' ||
      action === 'change'
    ) {
      close();
      return;
    }

    const stateKind = payload['stateKind'];
    const openState = payload['open'];
    if (typeof openState === 'boolean' && target instanceof HTMLElement) {
      try {
        if (stateKind === 'details' && target instanceof HTMLDetailsElement) {
          target.open = openState;
        } else if (
          stateKind === 'dialog' &&
          target instanceof HTMLDialogElement
        ) {
          if (openState && !target.open) {
            if (
              payload['modal'] === true &&
              typeof target.showModal === 'function'
            )
              target.showModal();
            else if (typeof target.show === 'function') target.show();
            else target.open = true;
          } else if (!openState && target.open) {
            if (typeof target.close === 'function') target.close();
            else target.open = false;
          }
        } else if (stateKind === 'popover') {
          const popover = target as HTMLElement & {
            showPopover?: () => void;
            hidePopover?: () => void;
          };
          if (openState) popover.showPopover?.();
          else popover.hidePopover?.();
        }
      } catch {
        onWarning?.(
          `L’état natif ${String(stateKind)} n’a pas pu être restauré.`,
        );
      }
    }
    if (anchor && (!anchor.isConnected || target !== anchor)) close();
  };

  return {
    sync,
    close,
    dispose: close,
  };
}
