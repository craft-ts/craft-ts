export type FocusEdge = 'first' | 'last';

/**
 * Shared focus movement for vertical lists of controls. The containing
 * component chooses the right items, wrapping policy, and Escape behavior for
 * its ARIA pattern.
 */
export function handleFocusListKeydown(
  event: KeyboardEvent,
  items: Iterable<HTMLElement>,
  options: {
    readonly wrap?: boolean;
    readonly onEscape?: () => void;
  } = {},
): boolean {
  if (event.key === 'Escape') {
    if (!options.onEscape) return false;
    event.preventDefault();
    options.onEscape();
    return true;
  }

  const enabledItems = [...items].filter(
    (item) =>
      !item.matches(':disabled') &&
      item.getAttribute('aria-disabled') !== 'true',
  );
  if (!enabledItems.length) return false;

  const currentIndex = enabledItems.indexOf(event.currentTarget as HTMLElement);
  let nextIndex: number;
  switch (event.key) {
    case 'ArrowDown':
      nextIndex = currentIndex + 1;
      break;
    case 'ArrowUp':
      nextIndex = currentIndex - 1;
      break;
    case 'Home':
      nextIndex = 0;
      break;
    case 'End':
      nextIndex = enabledItems.length - 1;
      break;
    default:
      return false;
  }

  event.preventDefault();
  if (options.wrap) {
    nextIndex = (nextIndex + enabledItems.length) % enabledItems.length;
  } else {
    nextIndex = Math.max(0, Math.min(nextIndex, enabledItems.length - 1));
  }
  enabledItems[nextIndex]?.focus();
  return true;
}

export function focusListEdge(
  items: Iterable<HTMLElement>,
  edge: FocusEdge,
): boolean {
  const enabledItems = [...items].filter(
    (item) =>
      !item.matches(':disabled') &&
      item.getAttribute('aria-disabled') !== 'true',
  );
  const item = edge === 'first' ? enabledItems[0] : enabledItems.at(-1);
  item?.focus();
  return item !== undefined;
}

export function menuItemsWithin(element: HTMLElement): HTMLElement[] {
  const panel = element.matches('[role="menu"]')
    ? element
    : (element.closest<HTMLElement>('[role="menu"]') ??
      document.getElementById(element.getAttribute('aria-controls') ?? ''));
  return panel
    ? [...panel.querySelectorAll<HTMLElement>('[role^="menuitem"]')]
    : [];
}

/** Implements the shared menu-button keyboard behavior for a real ARIA menu. */
export function handleMenuTriggerKeydown(
  event: KeyboardEvent,
  trigger: HTMLButtonElement,
  toggle: () => void,
): boolean {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return false;
  const items = menuItemsWithin(trigger);
  if (trigger.getAttribute('aria-expanded') === 'true') {
    event.preventDefault();
    focusListEdge(items, event.key === 'ArrowDown' ? 'first' : 'last');
  } else {
    event.preventDefault();
    toggle();
    requestAnimationFrame(() =>
      focusListEdge(items, event.key === 'ArrowDown' ? 'first' : 'last'),
    );
  }
  return true;
}

/** Moves within a menu and restores focus to its button when Escape closes it. */
export function handleMenuItemKeydown(
  event: KeyboardEvent,
  close: () => void,
): boolean {
  const panel = (event.currentTarget as HTMLElement).closest<HTMLElement>(
    '[role="menu"]',
  );
  if (!panel) return false;
  const trigger = panel
    .closest('[data-doc-menu]')
    ?.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]');
  return handleFocusListKeydown(
    event,
    panel.querySelectorAll<HTMLElement>('[role^="menuitem"]'),
    {
      wrap: true,
      onEscape: () => {
        close();
        trigger?.focus();
      },
    },
  );
}

/** Opens a menu on activation and places focus on its first menu item. */
export function toggleMenuFromTrigger(
  trigger: HTMLButtonElement,
  toggle: () => void,
): void {
  const opens = trigger.getAttribute('aria-expanded') !== 'true';
  toggle();
  if (opens) {
    const items = menuItemsWithin(trigger);
    requestAnimationFrame(() => focusListEdge(items, 'first'));
  }
}

export function closeMenuAndReturnFocus(
  element: HTMLElement,
  close: () => void,
): void {
  const trigger = element
    .closest('[data-doc-menu]')
    ?.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]');
  close();
  trigger?.focus();
}
