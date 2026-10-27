/**
 * The `page` MCP surface of a development tab: the named controls an AI can
 * read and act on. Secrets stay with the person: a sensitive field never shows
 * its value and refuses `fill`, so the AI hands that field back instead.
 */
export type CraftPageMatch = Readonly<{ index?: number; track?: string }>;

export type CraftPageAction =
  | Readonly<{ goto: string }>
  | Readonly<{ id: string; fill: unknown; match?: CraftPageMatch }>
  | Readonly<{ id: string; press?: string; match?: CraftPageMatch }>
  | Readonly<{ id: string; match?: CraftPageMatch }>;

export type CraftPageControl = Readonly<{
  id: string;
  role: string;
  name: string;
  value?: unknown;
  /** Credentials, one-time codes, payment data: only the person fills it. */
  sensitive?: true;
  enabled: boolean;
  index: number;
  track?: string;
}>;

const INTERACTIVE_TAGS = new Set(['a', 'button', 'input', 'select', 'textarea']);
const SENSITIVE_INPUT_TYPES = new Set(['password']);
const SENSITIVE_AUTOCOMPLETE =
  /(?:^|\s)(?:current-password|new-password|one-time-code|cc-[a-z-]+)(?:\s|$)/i;
const SENSITIVE_NAME =
  /(?:password|passcode|passwd|mot.?de.?passe|\botp\b|one.?time|2fa|mfa|totp|secret|token|api.?key|cvc|cvv|card.?number|iban)/i;

export function isSensitiveControl(node: Element): boolean {
  if (node.closest('[data-craft-sensitive]')) return true;
  if (node instanceof HTMLInputElement && SENSITIVE_INPUT_TYPES.has(node.type))
    return true;
  const autocomplete = node.getAttribute('autocomplete');
  if (autocomplete && SENSITIVE_AUTOCOMPLETE.test(autocomplete)) return true;
  if (
    !(node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement)
  )
    return false;
  return [
    node.getAttribute('data-craft-name'),
    node.getAttribute('name'),
    node.id,
  ].some((name) => name !== null && SENSITIVE_NAME.test(name));
}

export function collectCraftPageControls(
  root: ParentNode,
): readonly CraftPageControl[] {
  const counts = new Map<string, number>();
  return namedInteractiveNodes(root).map((node) => {
    const id = node.getAttribute('data-craft-name') ?? '';
    const index = counts.get(id) ?? 0;
    counts.set(id, index + 1);
    const role = roleOf(node);
    const sensitive = isSensitiveControl(node);
    const value = sensitive ? undefined : valueOf(node, role);
    const track = trackOf(node);
    return {
      id,
      role,
      name: accessibleName(node),
      enabled: isEnabled(node),
      index,
      ...(value === undefined ? {} : { value }),
      ...(sensitive ? { sensitive: true as const } : {}),
      ...(track === undefined ? {} : { track }),
    };
  });
}

/**
 * Runs the actions in order and stops at the first that fails. `goto` goes
 * through `navigate` (the app's router when there is one) and is awaited.
 */
export async function applyCraftPageActions(
  root: ParentNode,
  act: readonly CraftPageAction[],
  navigate: (url: string) => Promise<unknown>,
): Promise<Readonly<{ error?: string }>> {
  for (const action of act) {
    try {
      if ('goto' in action) await navigate(toAppPath(action.goto));
      else applyAction(root, action);
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }
  return {};
}

export function isCraftPageAction(value: unknown): value is CraftPageAction {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record['goto'] === 'string' || typeof record['id'] === 'string';
}

/** A path inside the app: an absolute URL keeps only its path, query and hash. */
function toAppPath(target: string): string {
  const trimmed = target.trim();
  if (trimmed.length === 0) throw new Error('goto url is empty');
  if (trimmed.startsWith('/')) return trimmed;
  try {
    const url = new URL(trimmed);
    return `${url.pathname}${url.search}${url.hash}` || '/';
  } catch {
    return `/${trimmed}`;
  }
}

function applyAction(
  root: ParentNode,
  action: Exclude<CraftPageAction, Readonly<{ goto: string }>>,
): void {
  const node = resolveControl(root, action.id, action.match);
  if (!isEnabled(node)) throw new Error(`control "${action.id}" is disabled`);
  if ('fill' in action) {
    if (isSensitiveControl(node))
      throw new Error(
        `control "${action.id}" is sensitive: the person fills it (app.handoff).`,
      );
    fillControl(node, action.fill);
    return;
  }
  if ('press' in action && action.press !== undefined) {
    node.dispatchEvent(new KeyboardEvent('keydown', { key: action.press, bubbles: true }));
    node.dispatchEvent(new KeyboardEvent('keyup', { key: action.press, bubbles: true }));
    if (action.press === 'Enter') {
      const form = node.closest('form');
      if (form && !(node instanceof HTMLTextAreaElement)) form.requestSubmit();
    }
    return;
  }
  (node as HTMLElement).click();
}

function fillControl(node: Element, value: unknown): void {
  const role = roleOf(node);
  if (
    node instanceof HTMLInputElement &&
    (node.type === 'checkbox' || node.type === 'radio')
  ) {
    node.checked = Boolean(value);
    node.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }
  if (node instanceof HTMLSelectElement) {
    node.value = String(value);
    node.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }
  if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
    node.value = String(value);
    node.dispatchEvent(
      new InputEvent('input', { bubbles: true, data: String(value), inputType: 'insertText' }),
    );
    node.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }
  throw new Error(`fill is not supported on role "${role}"`);
}

function resolveControl(
  root: ParentNode,
  id: string,
  match: CraftPageMatch | undefined,
): Element {
  const nodes = namedInteractiveNodes(root).filter(
    (node) => node.getAttribute('data-craft-name') === id,
  );
  const tracked =
    match?.track === undefined
      ? nodes
      : nodes.filter((node) => trackOf(node) === match.track);
  const node =
    match?.index !== undefined
      ? tracked[match.index]
      : tracked.length > 1
        ? undefined
        : tracked[0];
  if (node) return node;
  if (tracked.length > 1)
    throw new Error(
      `control "${id}" is ambiguous (${tracked.length} instances); pass match.index or match.track`,
    );
  throw new Error(`control "${id}" is not available`);
}

function namedInteractiveNodes(root: ParentNode): Element[] {
  return Array.from(root.querySelectorAll('[data-craft-name]')).filter((node) =>
    INTERACTIVE_TAGS.has(node.tagName.toLowerCase()),
  );
}

function roleOf(node: Element): string {
  const explicit = node.getAttribute('role');
  if (explicit) return explicit;
  const tag = node.tagName.toLowerCase();
  if (tag === 'a') return 'link';
  if (tag === 'button') return 'button';
  if (tag === 'select') return 'combobox';
  if (tag === 'textarea') return 'textbox';
  if (node instanceof HTMLInputElement) {
    if (node.type === 'checkbox' || node.type === 'radio') return node.type;
    if (['submit', 'button', 'reset'].includes(node.type)) return 'button';
    return 'textbox';
  }
  return tag;
}

function accessibleName(node: Element): string {
  const labelledBy = node.getAttribute('aria-labelledby');
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => node.ownerDocument.getElementById(id)?.textContent ?? '')
      .join(' ')
      .trim();
    if (text) return text;
  }
  const ariaLabel = node.getAttribute('aria-label')?.trim();
  if (ariaLabel) return ariaLabel;
  if (
    (node instanceof HTMLInputElement ||
      node instanceof HTMLTextAreaElement ||
      node instanceof HTMLSelectElement) &&
    node.labels?.[0]?.textContent?.trim()
  )
    return node.labels[0].textContent.trim();
  return node.textContent?.trim() || (node.getAttribute('data-craft-name') ?? '');
}

function valueOf(node: Element, role: string): unknown {
  if (node instanceof HTMLInputElement) {
    if (node.type === 'checkbox') return node.checked;
    if (node.type === 'radio') return node.checked ? node.value : undefined;
    return role === 'button' ? undefined : node.value;
  }
  if (node instanceof HTMLTextAreaElement || node instanceof HTMLSelectElement)
    return node.value;
  return undefined;
}

function isEnabled(node: Element): boolean {
  if (node.hasAttribute('disabled')) return false;
  return node.getAttribute('aria-disabled') !== 'true';
}

function trackOf(node: Node): string | undefined {
  for (let current: Node | null = node; current; current = current.parentNode) {
    for (let sibling = current.previousSibling; sibling; sibling = sibling.previousSibling) {
      if (sibling.nodeType !== 8) continue;
      const match = /^craft-for:(.+):start$/.exec(sibling.textContent ?? '');
      if (match?.[1] !== undefined) return match[1];
    }
  }
  return undefined;
}
