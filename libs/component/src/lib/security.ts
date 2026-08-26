const CRAFT_SAFE_HTML = Symbol('craft-safe-html');
const CRAFT_UNSAFE_HTML = Symbol('craft-unsafe-html');

export type CraftSafeHtml = Readonly<{
  readonly value: string;
  readonly [CRAFT_SAFE_HTML]: true;
}>;

export type CraftUnsafeHtml = Readonly<{
  readonly value: string;
  readonly [CRAFT_UNSAFE_HTML]: true;
}>;

export class CraftDomSecurityError extends Error {
  readonly code: string;

  constructor(
    code: string,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.code = code;
    this.name = 'CraftDomSecurityError';
  }
}

/**
 * Attributes whose value is fetched or navigated to by the browser. `srcset`
 * and `ping` hold several URLs, `xlink:href` is the SVG spelling and still
 * accepts scriptable schemes in some engines.
 */
const URL_ATTRIBUTES = new Set([
  'href',
  'xlink:href',
  'src',
  'srcset',
  'action',
  'formaction',
  'poster',
  'ping',
  'data',
  'background',
  'cite',
  'longdesc',
  'manifest',
]);

/**
 * URLs the browser loads as code or as an embedded document. They deserve the
 * stricter treatment: same-document by default, cross-origin only against an
 * explicit allowlist.
 */
const RESOURCE_URL_ATTRIBUTES = new Set([
  'src',
  'srcset',
  'poster',
  'data',
  'background',
  'manifest',
]);

const MULTI_URL_ATTRIBUTES = new Set(['srcset', 'ping']);

/** Elements that rewrite the document base or navigate on their own. */
const BLOCKED_ELEMENTS = new Set(['base', 'meta']);

export type CraftUrlOptions = Readonly<{
  /**
   * Origins a resource URL may point to, e.g. `https://cdn.example.com`.
   * Empty means same-document URLs only.
   */
  readonly allowedOrigins?: readonly string[];
  /** Schemes allowed for navigation URLs beyond http(s) and relative URLs. */
  readonly allowedSchemes?: readonly string[];
}>;

const DEFAULT_NAVIGATION_SCHEMES = ['http:', 'https:', 'mailto:', 'tel:'];
const PLACEHOLDER_ORIGIN = 'https://craft.invalid';

/** Allows relative URLs and safe schemes, never scriptable ones. */
export function safeUrl(value: unknown, options: CraftUrlOptions = {}): string {
  return sanitizeUrl(value, false, options);
}

/**
 * URL helper for resource-bearing attributes. Absolute URLs must match
 * `options.allowedOrigins`; without one, only same-document URLs pass.
 */
export function safeResourceUrl(
  value: unknown,
  options: CraftUrlOptions = {},
): string {
  return sanitizeUrl(value, true, options);
}

function sanitizeUrl(
  value: unknown,
  resource: boolean,
  options: CraftUrlOptions,
): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value !== 'string') {
    throw new CraftDomSecurityError(
      'CRAFT_DOM_URL_INVALID',
      'DOM URLs must be strings.',
    );
  }
  const normalized = value.trim();
  // A protocol-relative URL inherits the current scheme and leaves the origin,
  // which is never what a template author means by "a link".
  if (normalized.startsWith('//')) {
    throw new CraftDomSecurityError(
      'CRAFT_DOM_URL_BLOCKED',
      'Protocol-relative URLs are not allowed; use an absolute https URL.',
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(normalized, PLACEHOLDER_ORIGIN);
  } catch {
    throw new CraftDomSecurityError('CRAFT_DOM_URL_INVALID', 'Invalid URL.');
  }
  const relative = parsed.origin === PLACEHOLDER_ORIGIN && !/^[a-z][a-z0-9+.-]*:/i.test(normalized);
  const allowedSchemes = resource
    ? ['http:', 'https:']
    : (options.allowedSchemes ?? DEFAULT_NAVIGATION_SCHEMES);
  if (!relative && !allowedSchemes.includes(parsed.protocol)) {
    throw new CraftDomSecurityError(
      'CRAFT_DOM_URL_BLOCKED',
      `The ${parsed.protocol} URL scheme is not allowed.`,
    );
  }
  if (resource && !relative) {
    const allowedOrigins = options.allowedOrigins ?? [];
    if (!allowedOrigins.includes(parsed.origin)) {
      throw new CraftDomSecurityError(
        'CRAFT_DOM_RESOURCE_ORIGIN_BLOCKED',
        `Resource origin ${parsed.origin} is not in the allowed origins.`,
      );
    }
  }
  return normalized;
}

/** Validates a `srcset`/`ping` style list of URLs, keeping its descriptors. */
export function safeUrlList(
  value: unknown,
  resource: boolean,
  options: CraftUrlOptions = {},
): string {
  if (typeof value !== 'string') {
    throw new CraftDomSecurityError(
      'CRAFT_DOM_URL_INVALID',
      'DOM URLs must be strings.',
    );
  }
  return value
    .split(',')
    .map((candidate) => {
      const trimmed = candidate.trim();
      if (trimmed === '') return '';
      const [url, ...descriptors] = trimmed.split(/\s+/);
      const safe = resource
        ? safeResourceUrl(url, options)
        : safeUrl(url, options);
      return [safe, ...descriptors].join(' ');
    })
    .filter((candidate) => candidate !== '')
    .join(', ');
}

/* ------------------------------------------------------------------ *
 * HTML sanitizer
 *
 * The sanitizer tokenizes the input and rebuilds the output from the tokens
 * it recognises. It never edits markup in place: removing a pattern from a
 * string can assemble a new tag out of its neighbours, which is how naive
 * filters turn `<scr<script>ipt>` into a live `<script>`.
 * ------------------------------------------------------------------ */

const ALLOWED_ELEMENTS = new Map<string, ReadonlySet<string>>([
  ['a', new Set(['href', 'target', 'rel', 'title'])],
  ['abbr', new Set(['title'])],
  ['address', new Set()],
  ['article', new Set()],
  ['aside', new Set()],
  ['b', new Set()],
  ['blockquote', new Set(['cite'])],
  ['br', new Set()],
  ['caption', new Set()],
  ['cite', new Set()],
  ['code', new Set()],
  ['col', new Set(['span'])],
  ['colgroup', new Set(['span'])],
  ['dd', new Set()],
  ['del', new Set(['datetime'])],
  ['details', new Set(['open'])],
  ['div', new Set()],
  ['dl', new Set()],
  ['dt', new Set()],
  ['em', new Set()],
  ['figcaption', new Set()],
  ['figure', new Set()],
  ['footer', new Set()],
  ['h1', new Set()],
  ['h2', new Set()],
  ['h3', new Set()],
  ['h4', new Set()],
  ['h5', new Set()],
  ['h6', new Set()],
  ['header', new Set()],
  ['hr', new Set()],
  ['i', new Set()],
  ['img', new Set(['src', 'alt', 'width', 'height', 'loading', 'title'])],
  ['ins', new Set(['datetime'])],
  ['kbd', new Set()],
  ['li', new Set(['value'])],
  ['main', new Set()],
  ['mark', new Set()],
  ['nav', new Set()],
  ['ol', new Set(['start', 'reversed', 'type'])],
  ['p', new Set()],
  ['pre', new Set()],
  ['q', new Set(['cite'])],
  ['s', new Set()],
  ['samp', new Set()],
  ['section', new Set()],
  ['small', new Set()],
  ['span', new Set()],
  ['strong', new Set()],
  ['sub', new Set()],
  ['summary', new Set()],
  ['sup', new Set()],
  ['table', new Set()],
  ['tbody', new Set()],
  ['td', new Set(['colspan', 'rowspan', 'headers'])],
  ['tfoot', new Set()],
  ['th', new Set(['colspan', 'rowspan', 'scope', 'headers'])],
  ['thead', new Set()],
  ['time', new Set(['datetime'])],
  ['tr', new Set()],
  ['u', new Set()],
  ['ul', new Set()],
  ['var', new Set()],
  ['wbr', new Set()],
]);

/**
 * Attributes accepted on every allowed element. `id` and `name` are absent on
 * purpose: they let injected markup shadow `document.<name>` properties.
 */
const GLOBAL_ATTRIBUTES = new Set(['class', 'dir', 'lang', 'role']);

const VOID_ELEMENTS = new Set([
  'br',
  'col',
  'hr',
  'img',
  'wbr',
]);

/** Elements whose text content is markup or code, dropped with their content. */
const RAW_TEXT_ELEMENTS = new Set([
  'script',
  'style',
  'iframe',
  'noscript',
  'noembed',
  'object',
  'embed',
  'template',
  'title',
  'textarea',
  'svg',
  'math',
]);

export type CraftSanitizeHtmlOptions = CraftUrlOptions;

/**
 * Sanitizes a presentation fragment against a fixed allowlist of elements and
 * attributes. Unknown elements are dropped, their text is kept and re-encoded.
 *
 * This covers formatted text, links, lists, tables and images. It is not a
 * general-purpose sanitizer: rich user-generated documents belong to a
 * project-approved sanitizer (DOMPurify in the browser, a parser-backed
 * pipeline on the server) behind an audited `unsafeHtml` exception.
 */
export function sanitizedHtml(
  value: unknown,
  options: CraftSanitizeHtmlOptions = {},
): CraftSafeHtml {
  if (typeof value !== 'string') {
    throw new CraftDomSecurityError(
      'CRAFT_DOM_HTML_INVALID',
      'HTML must be a string.',
    );
  }
  const output: string[] = [];
  const open: string[] = [];
  let index = 0;

  while (index < value.length) {
    const next = value.indexOf('<', index);
    if (next === -1) {
      output.push(escapeHtmlText(value.slice(index)));
      break;
    }
    if (next > index) output.push(escapeHtmlText(value.slice(index, next)));

    if (value.startsWith('<!--', next)) {
      const end = value.indexOf('-->', next + 4);
      index = end === -1 ? value.length : end + 3;
      continue;
    }
    if (value.startsWith('<!', next) || value.startsWith('<?', next)) {
      const end = value.indexOf('>', next + 2);
      index = end === -1 ? value.length : end + 1;
      continue;
    }

    const tag = readTag(value, next);
    if (!tag) {
      // A lone `<` is text, not the start of a tag.
      output.push(escapeHtmlText('<'));
      index = next + 1;
      continue;
    }
    index = tag.end;

    if (RAW_TEXT_ELEMENTS.has(tag.name)) {
      if (!tag.closing && !tag.selfClosing) {
        index = skipRawTextContent(value, tag.end, tag.name);
      }
      continue;
    }
    if (BLOCKED_ELEMENTS.has(tag.name)) continue;

    const allowedAttributes = ALLOWED_ELEMENTS.get(tag.name);
    if (!allowedAttributes) continue;

    if (tag.closing) {
      const position = open.lastIndexOf(tag.name);
      if (position === -1) continue;
      while (open.length > position) {
        output.push(`</${open.pop()}>`);
      }
      continue;
    }

    const attributes = renderAttributes(
      tag.name,
      tag.attributes,
      allowedAttributes,
      options,
    );
    if (VOID_ELEMENTS.has(tag.name)) {
      output.push(`<${tag.name}${attributes}>`);
      continue;
    }
    output.push(`<${tag.name}${attributes}>`);
    if (!tag.selfClosing) open.push(tag.name);
    else output.push(`</${tag.name}>`);
  }

  while (open.length > 0) output.push(`</${open.pop()}>`);
  return Object.freeze({ value: output.join(''), [CRAFT_SAFE_HTML]: true as const });
}

type ParsedTag = Readonly<{
  name: string;
  closing: boolean;
  selfClosing: boolean;
  attributes: ReadonlyArray<readonly [string, string]>;
  end: number;
}>;

function readTag(input: string, start: number): ParsedTag | undefined {
  let index = start + 1;
  const closing = input[index] === '/';
  if (closing) index += 1;
  const nameStart = index;
  while (index < input.length && /[A-Za-z0-9:_-]/.test(input[index])) index += 1;
  const name = input.slice(nameStart, index).toLowerCase();
  if (name === '' || !/^[a-z]/.test(name)) return undefined;

  const attributes: Array<readonly [string, string]> = [];
  let selfClosing = false;
  while (index < input.length) {
    while (index < input.length && /[\s/]/.test(input[index])) {
      if (input[index] === '/' && input[index + 1] === '>') selfClosing = true;
      index += 1;
    }
    if (index >= input.length) break;
    if (input[index] === '>') {
      index += 1;
      break;
    }
    const attributeStart = index;
    while (index < input.length && !/[\s/>=]/.test(input[index])) index += 1;
    const attributeName = input.slice(attributeStart, index).toLowerCase();
    let attributeValue = '';
    while (index < input.length && /\s/.test(input[index])) index += 1;
    if (input[index] === '=') {
      index += 1;
      while (index < input.length && /\s/.test(input[index])) index += 1;
      const quote = input[index];
      if (quote === '"' || quote === "'") {
        index += 1;
        const end = input.indexOf(quote, index);
        attributeValue = input.slice(index, end === -1 ? input.length : end);
        index = end === -1 ? input.length : end + 1;
      } else {
        const valueStart = index;
        while (index < input.length && !/[\s>]/.test(input[index])) index += 1;
        attributeValue = input.slice(valueStart, index);
      }
    }
    if (attributeName !== '') attributes.push([attributeName, attributeValue]);
  }
  return { name, closing, selfClosing, attributes, end: index };
}

function skipRawTextContent(input: string, from: number, name: string): number {
  const pattern = new RegExp(`<\\s*/\\s*${name}[^>]*>`, 'i');
  const rest = input.slice(from);
  const match = pattern.exec(rest);
  return match ? from + match.index + match[0].length : input.length;
}

function renderAttributes(
  element: string,
  attributes: ReadonlyArray<readonly [string, string]>,
  allowed: ReadonlySet<string>,
  options: CraftUrlOptions,
): string {
  const rendered: string[] = [];
  let hasBlankTarget = false;
  let relation: string | undefined;

  for (const [name, rawValue] of attributes) {
    const isAria = name.startsWith('aria-');
    const isData = name.startsWith('data-');
    if (!allowed.has(name) && !GLOBAL_ATTRIBUTES.has(name) && !isAria && !isData) {
      continue;
    }
    // Entities are decoded before validation: a browser reads
    // `jav&#x09;ascript:` as `javascript:`, and so must the check.
    const value = decodeHtmlEntities(rawValue);
    if (URL_ATTRIBUTES.has(name)) {
      const resource = RESOURCE_URL_ATTRIBUTES.has(name);
      try {
        const safe = MULTI_URL_ATTRIBUTES.has(name)
          ? safeUrlList(value, resource, options)
          : resource
            ? safeResourceUrl(value, options)
            : safeUrl(value, options);
        if (safe === '') continue;
        rendered.push(` ${name}="${escapeHtmlAttribute(safe)}"`);
      } catch {
        // A rejected URL drops the attribute; the element itself stays.
        continue;
      }
      continue;
    }
    if (name === 'target') {
      if (value !== '_blank' && value !== '_self') continue;
      hasBlankTarget = value === '_blank';
      rendered.push(` target="${escapeHtmlAttribute(value)}"`);
      continue;
    }
    if (name === 'rel') {
      relation = value;
      continue;
    }
    rendered.push(` ${name}="${escapeHtmlAttribute(value)}"`);
  }

  if (element === 'a' && hasBlankTarget) {
    const parts = new Set((relation ?? '').split(/\s+/).filter(Boolean));
    parts.add('noopener');
    parts.add('noreferrer');
    relation = [...parts].join(' ');
  }
  if (relation) rendered.push(` rel="${escapeHtmlAttribute(relation)}"`);
  return rendered.join('');
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  tab: '\t',
  newline: '\n',
  colon: ':',
  sol: '/',
  lpar: '(',
  rpar: ')',
};

function decodeHtmlEntities(value: string): string {
  return value.replace(
    /&(#x[0-9a-f]+|#[0-9]+|[a-z]+);?/gi,
    (match, entity: string) => {
      const lower = entity.toLowerCase();
      if (lower.startsWith('#x')) {
        const code = Number.parseInt(lower.slice(2), 16);
        return Number.isNaN(code) ? match : safeFromCodePoint(code, match);
      }
      if (lower.startsWith('#')) {
        const code = Number.parseInt(lower.slice(1), 10);
        return Number.isNaN(code) ? match : safeFromCodePoint(code, match);
      }
      return NAMED_ENTITIES[lower] ?? match;
    },
  );
}

function safeFromCodePoint(code: number, fallback: string): string {
  if (code < 0 || code > 0x10ffff) return fallback;
  try {
    return String.fromCodePoint(code);
  } catch {
    return fallback;
  }
}

function escapeHtmlText(value: string): string {
  return decodeHtmlEntities(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Deliberate escape hatch. Prefer sanitizedHtml and record an exception. */
export function unsafeHtml(value: string): CraftUnsafeHtml {
  return Object.freeze({ value, [CRAFT_UNSAFE_HTML]: true as const });
}

export function isCraftSafeHtml(value: unknown): value is CraftSafeHtml {
  return isMarked(value, CRAFT_SAFE_HTML);
}

export function isCraftUnsafeHtml(value: unknown): value is CraftUnsafeHtml {
  return isMarked(value, CRAFT_UNSAFE_HTML);
}

export function isCraftUrlAttribute(name: string): boolean {
  return URL_ATTRIBUTES.has(name.toLowerCase());
}

export function isCraftResourceUrlAttribute(name: string): boolean {
  return RESOURCE_URL_ATTRIBUTES.has(name.toLowerCase());
}

export function isCraftMultiUrlAttribute(name: string): boolean {
  return MULTI_URL_ATTRIBUTES.has(name.toLowerCase());
}

export function isCraftBlockedElement(name: string): boolean {
  return BLOCKED_ELEMENTS.has(name.toLowerCase());
}

function isMarked(value: unknown, marker: symbol): boolean {
  return typeof value === 'object' && value !== null && marker in value;
}

/**
 * Element and attribute names are validated wherever markup is produced: a
 * name that carries a quote, a space or an angle bracket would break out of
 * its own markup, and value escaping cannot save it.
 */
const TAG_NAME = /^[A-Za-z][A-Za-z0-9-]*$/;
const ATTRIBUTE_NAME = /^[A-Za-z_:][A-Za-z0-9_:.-]*$/;

export function assertCraftTagName(tag: string): string {
  if (!TAG_NAME.test(tag)) {
    throw new CraftDomSecurityError(
      'CRAFT_DOM_TAG_NAME_INVALID',
      `"${tag}" is not a valid element name.`,
    );
  }
  return tag;
}

export function assertCraftAttributeName(name: string): string {
  if (!ATTRIBUTE_NAME.test(name)) {
    throw new CraftDomSecurityError(
      'CRAFT_DOM_ATTRIBUTE_NAME_INVALID',
      `"${name}" is not a valid attribute name.`,
    );
  }
  return name;
}
