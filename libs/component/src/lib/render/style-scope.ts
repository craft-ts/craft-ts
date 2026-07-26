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

export function scopeCss(scopeId: string, css: string): string {
  const { hoisted, scoped } = splitUnscopableAtRules(css);
  const body = scoped
    ? `@scope ([data-craft-root~="${scopeId}"]) to ([data-craft-root] *) {\n${scoped}\n}`
    : '';
  return [hoisted, body].filter(Boolean).join('\n');
}
