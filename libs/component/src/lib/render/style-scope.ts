const definitionsByScope = new WeakMap<object, string>();
const definitionsByName = new Map<string, object>();

declare const ngDevMode: boolean | undefined;

/**
 * Returns the stable scope token associated with a Craft definition.
 *
 * The definition object is deliberately used as the identity instead of the
 * callable component. A piped component is a new callable that can still
 * share the original definition metadata.
 */
export function scopeIdFor(definition: object, name: string): string {
  const existing = definitionsByScope.get(definition);
  if (existing) return existing;

  const owner = definitionsByName.get(name);
  if (owner && owner !== definition) {
    const dev = typeof ngDevMode === 'undefined' || ngDevMode;
    if (dev) {
      const previousName = definitionsByScope.get(owner) ?? name;
      throw new Error(
        `Craft style scope name "${name}" is already used by "${previousName}". ` +
          'Component and directive names must be unique.',
      );
    }
  }

  definitionsByScope.set(definition, name);
  definitionsByName.set(name, definition);
  return name;
}

type CssChunk = { readonly text: string; readonly atRule?: string };

const UNSCOPABLE_BLOCKS = new Set([
  'keyframes',
  '-webkit-keyframes',
  'font-face',
  'property',
  'counter-style',
  'font-feature-values',
  'font-palette-values',
  'page',
  'view-transition',
]);

const UNSCOPABLE_STATEMENTS = new Set(['import', 'charset', 'namespace']);

function kebabCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function cssWithoutCommentsAndStrings(css: string): string {
  let result = '';
  let index = 0;
  while (index < css.length) {
    if (css[index] === '/' && css[index + 1] === '*') {
      const end = scanComment(css, index);
      result += ' '.repeat(end - index);
      index = end;
      continue;
    }
    if (css[index] === '"' || css[index] === "'") {
      const end = scanString(css, index, css[index]);
      result += css.slice(index, end).replace(/[^\n]/g, ' ');
      index = end;
      continue;
    }
    result += css[index];
    index += 1;
  }
  return result;
}

/**
 * Rejects constructs which would escape the component's `@scope` boundary.
 * Names are deliberately validated rather than rewritten: animation and font
 * references may be arbitrarily complex CSS values.
 */
export function validateStyleScope(scopeId: string, css: string): void {
  const inspectable = cssWithoutCommentsAndStrings(css);
  const privateRules = [
    ['keyframes', /@(?:-webkit-)?keyframes\s+([\w-]+)/gi],
    ['counter-style', /@counter-style\s+([\w-]+)/gi],
    ['font-palette-values', /@font-palette-values\s+([\w-]+)/gi],
  ] as const;
  for (const [rule, pattern] of privateRules) {
    for (const match of inspectable.matchAll(pattern)) {
      const name = match[1];
      if (!name.startsWith(`${scopeId}-`)) {
        throw new Error(
          `Craft style scope "${scopeId}": @${rule} "${name}" is global and can collide. ` +
            `Rename it "${scopeId}-${name}".`,
        );
      }
    }
  }

  for (const match of inspectable.matchAll(/@font-face\s*\{([\s\S]*?)\}/gi)) {
    const family = match[1].match(/font-family\s*:\s*([\w-]+)/i)?.[1];
    if (family && !family.startsWith(`${scopeId}-`)) {
      throw new Error(
        `Craft style scope "${scopeId}": @font-face family "${family}" is global and can collide. ` +
          `Rename it "${scopeId}-${family}".`,
      );
    }
  }

  const variablePrefix = `--${kebabCase(scopeId)}-`;
  for (const match of inspectable.matchAll(
    /@property\s+(--[\w-]+)\s*\{([\s\S]*?)\}/gi,
  )) {
    const [, name, body] = match;
    if (!name.startsWith(variablePrefix)) {
      throw new Error(
        `Craft style scope "${scopeId}": @property "${name}" is not owned by this component. ` +
          `Use the "${variablePrefix}*" namespace or register shared tokens in the application stylesheet.`,
      );
    }
    if (
      /inherits\s*:\s*false\b/i.test(body) &&
      new RegExp(
        `var\\(\\s*${name.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`,
      ).test(inspectable)
    ) {
      throw new Error(
        `Craft style scope "${scopeId}": @property "${name}" uses inherits: false and cannot be supplied or forwarded by a parent.`,
      );
    }
  }

  if (/@import\b/i.test(inspectable)) {
    throw new Error(
      `Craft style scope "${scopeId}": @import is global. Move it to the application stylesheet.`,
    );
  }
  if (/(^|})\s*(?::root\b|html\b|body\b)/im.test(inspectable)) {
    throw new Error(
      `Craft style scope "${scopeId}": :root, html and body selectors are not allowed in component styles.`,
    );
  }
}

function scanString(css: string, start: number, quote: string): number {
  let index = start + 1;
  while (index < css.length) {
    if (css[index] === '\\') {
      index += 2;
      continue;
    }
    if (css[index] === quote) return index + 1;
    index += 1;
  }
  return css.length;
}

function scanComment(css: string, start: number): number {
  const end = css.indexOf('*/', start + 2);
  return end === -1 ? css.length : end + 2;
}

function scanBalancedBlock(css: string, opening: number): number {
  let depth = 1;
  let parentheses = 0;
  let index = opening + 1;
  while (index < css.length) {
    const character = css[index];
    if (character === '/' && css[index + 1] === '*') {
      index = scanComment(css, index);
      continue;
    }
    if (character === '"' || character === "'") {
      index = scanString(css, index, character);
      continue;
    }
    if (character === '(') parentheses += 1;
    if (character === ')') parentheses = Math.max(0, parentheses - 1);
    if (parentheses === 0 && character === '{') depth += 1;
    if (parentheses === 0 && character === '}' && --depth === 0)
      return index + 1;
    index += 1;
  }
  return css.length;
}

function scanAtRule(css: string, start: number): CssChunk {
  let index = start + 1;
  let parentheses = 0;
  while (index < css.length) {
    const character = css[index];
    if (character === '/' && css[index + 1] === '*') {
      index = scanComment(css, index);
      continue;
    }
    if (character === '"' || character === "'") {
      index = scanString(css, index, character);
      continue;
    }
    if (character === '(') parentheses += 1;
    if (character === ')') parentheses = Math.max(0, parentheses - 1);
    if (parentheses === 0 && character === ';') {
      return {
        text: css.slice(start, index + 1),
        atRule: atRuleName(css, start),
      };
    }
    if (parentheses === 0 && character === '{') {
      const end = scanBalancedBlock(css, index);
      return { text: css.slice(start, end), atRule: atRuleName(css, start) };
    }
    index += 1;
  }
  return { text: css.slice(start), atRule: atRuleName(css, start) };
}

function atRuleName(css: string, start: number): string {
  const match = css.slice(start + 1).match(/^([\w-]+)/);
  return match?.[1].toLowerCase() ?? '';
}

/**
 * Hoists at-rules which cannot be nested in an @scope block.
 * This is intentionally not a CSS selector parser.
 */
export function splitUnscopableAtRules(css: string): {
  hoisted: string;
  scoped: string;
} {
  const hoistedPreamble: string[] = [];
  const hoisted: string[] = [];
  const scoped: string[] = [];
  let segmentStart = 0;
  let index = 0;
  let parentheses = 0;

  while (index < css.length) {
    const character = css[index];
    if (character === '/' && css[index + 1] === '*') {
      index = scanComment(css, index);
      continue;
    }
    if (character === '"' || character === "'") {
      index = scanString(css, index, character);
      continue;
    }
    if (character === '(') parentheses += 1;
    if (character === ')') parentheses = Math.max(0, parentheses - 1);
    if (character !== '@' || parentheses > 0) {
      index += 1;
      continue;
    }

    const preceding = css.slice(segmentStart, index);
    if (preceding.trim()) scoped.push(preceding);

    const chunk = scanAtRule(css, index);
    const isStatement = chunk.text.trimEnd().endsWith(';');
    const unscopable =
      UNSCOPABLE_BLOCKS.has(chunk.atRule ?? '') ||
      (isStatement &&
        (UNSCOPABLE_STATEMENTS.has(chunk.atRule ?? '') ||
          chunk.atRule === 'layer'));
    if (unscopable) {
      if (chunk.atRule === 'import' || chunk.atRule === 'charset') {
        hoistedPreamble.push(chunk.text);
      } else {
        hoisted.push(chunk.text);
      }
    } else {
      scoped.push(chunk.text);
    }
    index += chunk.text.length;
    segmentStart = index;
  }

  const tail = css.slice(segmentStart);
  if (tail.trim()) scoped.push(tail);
  return {
    hoisted: [...hoistedPreamble, ...hoisted].join('\n').trim(),
    scoped: scoped.join('').trim(),
  };
}

export interface CssScopeOptions {
  /** Attribute used to mark scope roots. */
  readonly rootAttribute?: string;
  /** Selector at which the scope stops. */
  readonly limitSelector?: string;
}

export function scopeCss(
  scopeId: string,
  css: string,
  options: CssScopeOptions = {},
): string {
  const { hoisted, scoped } = splitUnscopableAtRules(css);
  const rootAttribute = options.rootAttribute ?? 'data-craft-root';
  const limitSelector = options.limitSelector ?? `[${rootAttribute}] *`;
  const body = scoped
    ? `@scope ([${rootAttribute}~="${scopeId}"]) to (${limitSelector}) {\n${scoped}\n}`
    : '';
  return [hoisted, body].filter(Boolean).join('\n');
}
