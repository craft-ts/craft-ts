import type { CraftPrimitiveRegistry } from '@craft-ts/core';

/**
 * Handing the tab back to the person for what the AI cannot do: type a
 * password, receive a code, choose an account. A banner says what is asked,
 * the field is highlighted, and the call returns once the condition holds in
 * the live state, the person confirms, declines, or the time is up.
 */
export type HandoffCondition =
  | Readonly<{
      /** Primitive address, ordinal-free (`service:session / query:currentUser`). */
      address: string;
      /** Dot path inside the value (`user.role`); the whole value when omitted. */
      path?: string;
      equals?: unknown;
      notEquals?: unknown;
      /** True: defined and not null. False: undefined or null. */
      exists?: boolean;
      /**
       * A regular expression the value's text must match, e.g.
       * `^(?!craft-ref:)` for a real token where the recording had a masked one.
       */
      matches?: string;
      /**
       * True: a real value, not one masked by a recording (`[REDACTED]`,
       * `craft-ref:…`). What `session.prerequisites` proposes for signing in.
       */
      unmasked?: boolean;
    }>
  | Readonly<{ route: string }>;

export type HandoffRequest = Readonly<{
  message: string;
  field?: string;
  until?: HandoffCondition;
  timeoutMs: number;
}>;

export type HandoffOutcome = Readonly<{
  outcome: 'condition' | 'confirmed' | 'declined' | 'timeout';
  waitedMs: number;
}>;

const POLL_MS = 250;
const BANNER_ATTRIBUTE = 'data-craft-guided-resume-handoff';

export function parseHandoffRequest(
  params: Readonly<Record<string, unknown>>,
): HandoffRequest {
  const message = params['message'];
  if (typeof message !== 'string' || message.trim().length === 0)
    throw new Error('message is required.');
  const field = params['field'];
  const until = params['until'];
  const timeoutMs = params['timeoutMs'];
  return {
    message,
    ...(typeof field === 'string' ? { field } : {}),
    ...(isCondition(until) ? { until } : {}),
    // The bridge call ends a little after the person's time is up.
    timeoutMs:
      typeof timeoutMs === 'number' && timeoutMs > 2_000 ? timeoutMs - 1_000 : 5 * 60_000,
  };
}

function isCondition(value: unknown): value is HandoffCondition {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record['address'] === 'string' || typeof record['route'] === 'string';
}

export function handoffConditionHolds(
  condition: HandoffCondition,
  registry: Pick<CraftPrimitiveRegistry, 'capture'>,
  currentRoute: string,
): boolean {
  if ('route' in condition) return currentRoute.startsWith(condition.route);
  const wanted = ordinalFree(condition.address);
  const captured = registry.capture();
  const address = Object.keys(captured).find(
    (candidate) => ordinalFree(candidate) === wanted,
  );
  const value =
    address === undefined ? undefined : readPath(captured[address], condition.path);
  if (condition.unmasked !== undefined)
    return (
      (value !== undefined && value !== null && value !== '' && !isMaskedValue(value)) ===
      condition.unmasked
    );
  if (condition.matches !== undefined)
    return (
      value !== undefined &&
      value !== null &&
      new RegExp(condition.matches).test(typeof value === 'string' ? value : JSON.stringify(value))
    );
  if (condition.exists !== undefined)
    return condition.exists ? value !== undefined && value !== null : value == null;
  if ('equals' in condition) return sameValue(value, condition.equals);
  if ('notEquals' in condition)
    return value !== undefined && !sameValue(value, condition.notEquals);
  return value !== undefined && value !== null;
}

export function handOff(
  request: HandoffRequest,
  registry: Pick<CraftPrimitiveRegistry, 'capture'>,
): Promise<HandoffOutcome> {
  const startedAt = Date.now();
  const document = globalThis.document;
  document.querySelector(`[${BANNER_ATTRIBUTE}]`)?.remove();
  const banner = document.createElement('aside');
  banner.setAttribute(BANNER_ATTRIBUTE, '');
  banner.setAttribute('data-craft-ai-overlay', '');
  banner.setAttribute('role', 'alertdialog');
  banner.setAttribute('aria-label', 'À vous');
  Object.assign(banner.style, {
    position: 'fixed',
    insetInline: '16px',
    bottom: '16px',
    zIndex: '2147483647',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    alignItems: 'center',
    padding: '12px 16px',
    borderRadius: '12px',
    background: '#1f2a24',
    color: '#f4f1e8',
    font: '14px/1.4 system-ui, sans-serif',
    boxShadow: '0 8px 24px rgb(0 0 0 / 25%)',
  });
  const title = document.createElement('strong');
  title.textContent = 'À vous';
  const text = document.createElement('span');
  text.textContent = request.message;
  text.style.flex = '1 1 240px';
  const done = button(document, 'C’est fait', true);
  const decline = button(document, 'Je ne peux pas', false);
  banner.append(title, text, done, decline);
  document.body.append(banner);

  const field = request.field
    ? document.querySelector<HTMLElement>(`[data-craft-name="${cssEscape(request.field)}"]`)
    : null;
  const previousOutline = field?.style.outline ?? '';
  if (field) {
    field.style.outline = '3px solid #e0a526';
    field.scrollIntoView?.({ block: 'center' });
    field.focus?.();
  }

  return new Promise<HandoffOutcome>((resolve) => {
    let finished = false;
    const finish = (outcome: HandoffOutcome['outcome']) => {
      if (finished) return;
      finished = true;
      clearInterval(poll);
      clearTimeout(timeout);
      banner.remove();
      if (field) field.style.outline = previousOutline;
      resolve({ outcome, waitedMs: Date.now() - startedAt });
    };
    done.addEventListener('click', () => finish('confirmed'));
    decline.addEventListener('click', () => finish('declined'));
    const route = () =>
      `${globalThis.location.pathname}${globalThis.location.search}${globalThis.location.hash}`;
    const check = () => {
      try {
        if (request.until && handoffConditionHolds(request.until, registry, route()))
          finish('condition');
      } catch {
        // A value that cannot be read now may be readable on the next tick.
      }
    };
    const poll = setInterval(check, POLL_MS);
    const timeout = setTimeout(() => finish('timeout'), request.timeoutMs);
    check();
  });
}

function button(document: Document, label: string, primary: boolean): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = label;
  Object.assign(element.style, {
    padding: '6px 12px',
    borderRadius: '8px',
    border: primary ? '0' : '1px solid #f4f1e8',
    background: primary ? '#e0a526' : 'transparent',
    color: primary ? '#1f2a24' : '#f4f1e8',
    font: 'inherit',
    cursor: 'pointer',
  });
  return element;
}

/** A value a recording replaced: a redaction or a reference placeholder. */
export function isMaskedValue(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    (/^\[REDACTED(?:_[A-Z]+)?\]$/.test(value) || value.startsWith('craft-ref:'))
  );
}

function readPath(value: unknown, path: string | undefined): unknown {
  if (!path) return value;
  let current = value;
  for (const key of path.split('.')) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function sameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function ordinalFree(address: string): string {
  return address
    .split(' / ')
    .map((part) => part.replace(/#\d+$/, ''))
    .join(' / ');
}

function cssEscape(value: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(value)
    : value.replace(/"/g, '\\"');
}
