const DEFAULT_MAX_CAPTURE_BYTES = 256 * 1024;
const DEFAULT_MAX_CAPTURE_NODES = 2000;

const STYLE_WHITELIST = [
  'display',
  'position',
  'z-index',
  'inset',
  'top',
  'right',
  'bottom',
  'left',
  'width',
  'height',
  'min-width',
  'min-height',
  'max-width',
  'max-height',
  'box-sizing',
  'margin',
  'padding',
  'border',
  'border-radius',
  'box-shadow',
  'overflow',
  'overflow-x',
  'overflow-y',
  'pointer-events',
  'transform',
  'transform-origin',
  'isolation',
  'visibility',
  'opacity',
  'color',
  'background-color',
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'text-align',
  'white-space',
] as const;

/**
 * Captures a DOM subtree as a compact tree, including text, attributes and
 * computed CSS values useful for reproducing a visual/layout issue.
 */
export function captureAiDomStyles(
  root: Element,
  limits: {
    readonly maxBytes?: number;
    readonly maxNodes?: number;
  } = {},
): unknown {
  const maxBytes = limits.maxBytes ?? DEFAULT_MAX_CAPTURE_BYTES;
  const maxNodes = limits.maxNodes ?? DEFAULT_MAX_CAPTURE_NODES;
  let nodeCount = 0;
  const tree = serializeDom(root, STYLE_WHITELIST, () => {
    nodeCount += 1;
    if (nodeCount > maxNodes) {
      throw new Error('La capture DOM contient trop de nœuds.');
    }
  });
  const json = JSON.stringify(tree);
  if (json.length > maxBytes) {
    throw new Error('La capture DOM est trop volumineuse.');
  }
  return tree;
}

function serializeDom(
  element: Element,
  whitelist: readonly string[],
  visit: () => void,
): Readonly<{
  tag: string;
  id?: string;
  attributes?: Readonly<Record<string, string>>;
  text?: string;
  rect: Readonly<{ x: number; y: number; width: number; height: number }>;
  styles: Readonly<Record<string, string>>;
  hidden?: boolean;
  children: readonly unknown[];
}> {
  visit();
  const computed = getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  const craftName = element.getAttribute('data-craft-name');
  const attributes = Object.fromEntries(
    Array.from(element.attributes, ({ name, value }) => [name, value]),
  );
  const text = directText(element);
  return {
    tag: element.tagName.toLowerCase(),
    ...(craftName === null ? {} : { id: craftName }),
    ...(Object.keys(attributes).length === 0 ? {} : { attributes }),
    ...(text === undefined ? {} : { text }),
    rect: {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    },
    styles: pickStyles(computed, whitelist),
    ...(computed.display === 'none' ? { hidden: true } : {}),
    children: Array.from(element.children, (child) =>
      serializeDom(child, whitelist, visit),
    ),
  };
}

function directText(element: Element): string | undefined {
  const text = Array.from(element.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent ?? '')
    .join('');
  return text.trim().length === 0 ? undefined : text;
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
