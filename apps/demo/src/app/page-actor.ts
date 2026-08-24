export type PageMatch = {
  readonly index?: number;
  readonly track?: string;
};

export type PageAction =
  | { readonly goto: string }
  | { readonly id: string; readonly fill: unknown; readonly match?: PageMatch }
  | { readonly id: string; readonly press?: string; readonly match?: PageMatch }
  | { readonly id: string; readonly match?: PageMatch };

export function isGotoAction(
  action: PageAction,
): action is { readonly goto: string } {
  return 'goto' in action;
}

export function toGotoUrl(target: string): string {
  const trimmed = target.trim();
  if (trimmed.length === 0) {
    throw new Error('goto url is empty');
  }
  if (trimmed.startsWith('/')) {
    return trimmed;
  }
  try {
    const url = new URL(trimmed);
    return `${url.pathname}${url.search}${url.hash}` || '/';
  } catch {
    return `/${trimmed}`;
  }
}

export function toCraftGotoTarget(target: string): string {
  const path = toGotoUrl(target);
  const pathname = (path.split('#')[0] ?? path).split('?')[0] ?? path;
  if (pathname === '/' || pathname === '') {
    return '';
  }
  return pathname.startsWith('/') ? pathname.slice(1) : pathname;
}

export type PageControl = {
  readonly id: string;
  readonly role: string;
  readonly name: string;
  readonly value?: unknown;
  readonly enabled: boolean;
  readonly index: number;
  readonly track?: string;
};

export const PAGE_DOM_STYLES_MAX_BYTES = 256 * 1024;

export const DEFAULT_PAGE_STYLE_WHITELIST = [
  'display',
  'visibility',
  'opacity',
  'color',
  'background-color',
  'font-size',
  'overflow',
  'position',
] as const;

const INTERACTIVE_TAGS = new Set(['a', 'button', 'input', 'select', 'textarea']);

export function collectPageControls(root: ParentNode): readonly PageControl[] {
  const nodes = namedInteractiveNodes(root);
  const counts = new Map<string, number>();
  return nodes.map((node) => {
    const id = node.getAttribute('data-craft-name') ?? '';
    const index = counts.get(id) ?? 0;
    counts.set(id, index + 1);
    const role = roleOf(node);
    const control: PageControl = {
      id,
      role,
      name: accessibleName(node),
      enabled: isEnabled(node),
      index,
      ...(valueOf(node, role) === undefined
        ? {}
        : { value: valueOf(node, role) }),
      ...(trackOf(node) === undefined ? {} : { track: trackOf(node) }),
    };
    return control;
  });
}

export function applyPageActions(
  root: ParentNode,
  act: readonly PageAction[],
): {
  readonly controls: readonly PageControl[];
  readonly error?: string;
} {
  for (const action of act) {
    try {
      applyAction(root, action);
    } catch (error) {
      return {
        controls: collectPageControls(root),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  return { controls: collectPageControls(root) };
}

export function captureDomStyles(
  root: Element,
  styles?: readonly string[],
): unknown {
  const whitelist =
    styles === undefined ? [...DEFAULT_PAGE_STYLE_WHITELIST] : [...styles];
  const tree = serializeDom(root, whitelist);
  assertPagePayloadSize(tree);
  return tree;
}

export function assertPagePayloadSize(payload: unknown): void {
  const json = JSON.stringify(payload);
  if (json.length > PAGE_DOM_STYLES_MAX_BYTES) {
    throw new Error('dom-styles exceeds size cap');
  }
}

function applyAction(root: ParentNode, action: PageAction): void {
  if (isGotoAction(action)) {
    throw new Error(`goto "${action.goto}" cannot be applied to the DOM`);
  }
  const node = resolveControl(root, action.id, action.match);
  if (!isEnabled(node)) {
    throw new Error(`control "${action.id}" is disabled`);
  }
  if ('fill' in action) {
    fillControl(node, action.fill);
    return;
  }
  if ('press' in action && action.press !== undefined) {
    node.dispatchEvent(
      new KeyboardEvent('keydown', { key: action.press, bubbles: true }),
    );
    node.dispatchEvent(
      new KeyboardEvent('keyup', { key: action.press, bubbles: true }),
    );
    return;
  }
  (node as HTMLElement).click();
}

function fillControl(node: Element, value: unknown): void {
  const role = roleOf(node);
  if (role === 'button' || role === 'link') {
    throw new Error(`fill is not supported on role "${role}"`);
  }
  if (
    node instanceof HTMLInputElement &&
    (node.type === 'checkbox' || node.type === 'radio')
  ) {
    node.checked = Boolean(value);
    node.dispatchEvent(new Event('change', { bubbles: true }));
    node.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    return;
  }
  if (node instanceof HTMLSelectElement) {
    node.value = String(value);
    node.dispatchEvent(new Event('change', { bubbles: true }));
    node.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    return;
  }
  if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
    node.value = String(value);
    node.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        data: String(value),
        inputType: 'insertText',
      }),
    );
    node.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    return;
  }
  throw new Error(`fill is not supported on role "${role}"`);
}

function resolveControl(
  root: ParentNode,
  id: string,
  match: PageMatch | undefined,
): Element {
  const nodes = namedInteractiveNodes(root).filter(
    (node) => node.getAttribute('data-craft-name') === id,
  );
  if (nodes.length === 0) {
    throw new Error(`control "${id}" is not available`);
  }
  const byTrack =
    match?.track === undefined
      ? nodes
      : nodes.filter((node) => trackOf(node) === match.track);
  if (match?.track !== undefined && byTrack.length === 0) {
    throw new Error(`control "${id}" is not available`);
  }
  if (match?.index !== undefined) {
    const node = byTrack[match.index];
    if (node === undefined) {
      throw new Error(`control "${id}" is not available`);
    }
    return node;
  }
  if (byTrack.length > 1) {
    throw new Error(
      `control "${id}" is ambiguous (${byTrack.length} instances); pass match.index or match.track`,
    );
  }
  return byTrack[0] as Element;
}

function namedInteractiveNodes(root: ParentNode): Element[] {
  return Array.from(root.querySelectorAll('[data-craft-name]')).filter((node) =>
    INTERACTIVE_TAGS.has(node.tagName.toLowerCase()),
  );
}

function roleOf(node: Element): string {
  const explicit = node.getAttribute('role');
  if (explicit !== null && explicit.length > 0) {
    return explicit;
  }
  const tag = node.tagName.toLowerCase();
  if (tag === 'a') {
    return 'link';
  }
  if (tag === 'button') {
    return 'button';
  }
  if (tag === 'select') {
    return 'combobox';
  }
  if (tag === 'textarea') {
    return 'textbox';
  }
  if (node instanceof HTMLInputElement) {
    if (node.type === 'checkbox') {
      return 'checkbox';
    }
    if (node.type === 'radio') {
      return 'radio';
    }
    if (node.type === 'submit' || node.type === 'button' || node.type === 'reset') {
      return 'button';
    }
    return 'textbox';
  }
  return tag;
}

function accessibleName(node: Element): string {
  const labelledBy = node.getAttribute('aria-labelledby');
  if (labelledBy !== null && labelledBy.length > 0) {
    const labels = labelledBy
      .split(/\s+/)
      .map((id) => node.ownerDocument?.getElementById(id)?.textContent ?? '')
      .join(' ')
      .trim();
    if (labels.length > 0) {
      return labels;
    }
  }
  const ariaLabel = node.getAttribute('aria-label');
  if (ariaLabel !== null && ariaLabel.trim().length > 0) {
    return ariaLabel.trim();
  }
  if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement || node instanceof HTMLSelectElement) {
    const id = node.id;
    if (id.length > 0) {
      const label = node.ownerDocument?.querySelector(`label[for="${cssEscape(id)}"]`);
      const text = label?.textContent?.trim();
      if (text !== undefined && text.length > 0) {
        return text;
      }
    }
  }
  const text = node.textContent?.trim();
  if (text !== undefined && text.length > 0) {
    return text;
  }
  return node.getAttribute('data-craft-name') ?? '';
}

function valueOf(node: Element, role: string): unknown {
  if (node instanceof HTMLInputElement) {
    if (node.type === 'checkbox') {
      return node.checked;
    }
    if (node.type === 'radio') {
      return node.checked ? node.value : undefined;
    }
    if (role === 'button') {
      return undefined;
    }
    return node.value;
  }
  if (node instanceof HTMLTextAreaElement || node instanceof HTMLSelectElement) {
    return node.value;
  }
  return undefined;
}

function isEnabled(node: Element): boolean {
  if (node.hasAttribute('disabled')) {
    return false;
  }
  if (node instanceof HTMLInputElement || node instanceof HTMLButtonElement || node instanceof HTMLSelectElement || node instanceof HTMLTextAreaElement) {
    if (node.disabled) {
      return false;
    }
  }
  return node.getAttribute('aria-disabled') !== 'true';
}

function trackOf(node: Node): string | undefined {
  let current: Node | null = node;
  while (current !== null) {
    let sibling: Node | null = current.previousSibling;
    while (sibling !== null) {
      if (sibling.nodeType === Node.COMMENT_NODE) {
        const match = /^craft-for:(.+):start$/.exec(sibling.textContent ?? '');
        if (match?.[1] !== undefined) {
          return match[1];
        }
      }
      sibling = sibling.previousSibling;
    }
    current = current.parentNode;
  }
  return undefined;
}

function serializeDom(
  element: Element,
  whitelist: readonly string[],
): Readonly<{
  tag: string;
  id?: string;
  rect: Readonly<{ x: number; y: number; width: number; height: number }>;
  styles?: Readonly<Record<string, string>>;
  hidden?: boolean;
  children: readonly unknown[];
}> {
  const computed = getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  const styles =
    whitelist.length === 0 ? undefined : pickStyles(computed, whitelist);
  const hidden = computed.display === 'none';
  const craftName = element.getAttribute('data-craft-name');
  return {
    tag: element.tagName.toLowerCase(),
    ...(craftName === null ? {} : { id: craftName }),
    rect: {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    },
    ...(styles === undefined ? {} : { styles }),
    ...(hidden ? { hidden: true } : {}),
    children: Array.from(element.children, (child) =>
      serializeDom(child, whitelist),
    ),
  };
}

function pickStyles(
  computed: CSSStyleDeclaration,
  whitelist: readonly string[],
): Record<string, string> {
  const styles: Record<string, string> = {};
  for (const name of whitelist) {
    styles[name] = computed.getPropertyValue(name);
  }
  return styles;
}

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/"/g, '\\"');
}
