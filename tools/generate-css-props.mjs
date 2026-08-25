#!/usr/bin/env node
/**
 * Generates the typed CSS property table from MDN's data.
 *
 * Written rather than hand-maintained for one reason: a hand-written table
 * eventually contains a keyword nobody checked against the spec, and a keyword
 * that does not exist is CSS the browser silently ignores — the exact failure
 * this package is supposed to make impossible.
 *
 * The reader is deliberately conservative. It closes three grammar shapes:
 *
 *   1. a closed keyword set                → a namespace object
 *   2. a single terminal type              → a callable helper
 *   3. a terminal type plus keywords       → a callable helper with members
 *
 * Everything else is **not exported**. It lands in `UNCOVERED_PROPERTIES`,
 * which a spec reads, instead of being exported with a `string` parameter
 * "for now" — one such helper would sink the no-value-is-a-string guarantee
 * for the whole table.
 *
 * Usage:
 *   node tools/generate-css-props.mjs            # write the file
 *   node tools/generate-css-props.mjs --check    # fail if it would change
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXCLUSIONS, TERMINALS } from './css-props.data.mjs';

const require = createRequire(import.meta.url);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = join(repoRoot, 'libs/style/src/lib/props/generated.ts');

const properties = require('mdn-data/css/properties.json');
const syntaxes = require('mdn-data/css/syntaxes.json');

const EXCLUDED = new Set(EXCLUSIONS);
const MAX_EXPANSION_DEPTH = 8;
/**
 * Some grammars (`background`, `font`, `grid-template`) blow up exponentially
 * once every reference is inlined. A grammar that large is one this reader was
 * never going to close, so the budget is a guard, not a heuristic.
 */
const MAX_EXPANDED_LENGTH = 8000;

// ─── grammar reading ────────────────────────────────────────────────────────

/** `<length-percentage [0,∞]>` and friends: the range is not part of the type. */
const stripRanges = (syntax) =>
  // The inner class must exclude `[` as well as `]`: without it the match runs
  // across a group opener and eats a required term, silently.
  syntax.replace(/\s*\[[^\][]*[,∞][^\][]*\]\s*(?=>)/g, '');

function expand(syntax) {
  let current = stripRanges(syntax);
  for (let depth = 0; depth < MAX_EXPANSION_DEPTH; depth += 1) {
    const next = current
      .replace(/<'([-a-zA-Z]+)'>/g, (match, name) =>
        properties[name]
          ? `[ ${stripRanges(properties[name].syntax)} ]`
          : match,
      )
      .replace(/<([-a-zA-Z]+)>/g, (match, name) =>
        TERMINALS[match] === undefined && syntaxes[name]
          ? `[ ${stripRanges(syntaxes[name].syntax)} ]`
          : match,
      );
    if (next.length > MAX_EXPANDED_LENGTH) return null;
    if (next === current) return current;
    current = next;
  }
  return null; // did not settle: treat as unreadable rather than guess
}

/** Split on a top-level separator, respecting `[ ]` nesting. */
function splitTop(syntax, separator) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < syntax.length; index += 1) {
    const char = syntax[index];
    if (char === '[') depth += 1;
    else if (char === ']') depth -= 1;
    else if (depth === 0 && syntax.startsWith(separator, index)) {
      parts.push(syntax.slice(start, index));
      index += separator.length - 1;
      start = index + 1;
    }
  }
  parts.push(syntax.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
}

/**
 * Remove every bracket group that a single value may omit — `[ … ]?` and
 * `[ … ]*` — including nested ones, which a regex cannot see.
 *
 * `*` is zero-or-more, so the group goes; `+` and `#` are one-or-more, so the
 * group stays and only the multiplier goes. Getting that backwards is how a
 * reader ends up dropping a required term and generating a helper that emits
 * invalid CSS.
 */
function dropOptionalGroups(syntax) {
  let current = syntax;
  for (;;) {
    let removed = false;
    const stack = [];
    for (let index = 0; index < current.length; index += 1) {
      const char = current[index];
      if (char === '[') stack.push(index);
      else if (char === ']') {
        const open = stack.pop();
        const after = current.slice(index + 1).match(/^\s*([?*])/);
        if (open !== undefined && after) {
          current =
            current.slice(0, open) +
            ' ' +
            current.slice(index + 1 + after[0].length);
          removed = true;
          break;
        }
      }
    }
    if (!removed) return current;
  }
}

/** Drop what a single value is allowed to omit; keep what it must provide. */
function simplify(alternative) {
  let current = alternative.trim();
  let previous = '';
  let rounds = 0;
  while (current !== previous && (rounds += 1) < 50) {
    previous = current;
    current = dropOptionalGroups(current)
      // optional terms disappear for a one-value call
      .replace(/<[^<>]*>\s*[?*]/g, ' ')
      .replace(/[-a-zA-Z]+\s*[?*]/g, ' ')
      // repetition allows exactly one, so the multiplier is not a constraint
      .replace(/\{\s*\d+(\s*,\s*\d*)?\s*\}/g, ' ')
      .replace(/([>\]a-zA-Z])\s*[+#]/g, '$1')
      // a group with a single member is that member
      .replace(/\[\s*([^[\]|&]*?)\s*\]/g, (match, inner) =>
        inner.includes(' ') && !inner.startsWith('<') ? match : ` ${inner} `,
      )
      .replace(/\s+/g, ' ')
      .trim();
  }
  return current;
}

const KEYWORD = /^[a-zA-Z][-a-zA-Z0-9]*$/;

/**
 * Returns `{ keywords, terminals, dropped }` for a property, or `null` when
 * nothing in the grammar could be closed.
 *
 * An alternative the reader cannot close is **dropped**, not fatal. Dropping
 * narrows the helper — `background` ends up accepting a `<color>` and nothing
 * else — which is safe in the only direction that matters: a narrowed helper
 * cannot emit CSS the browser rejects, while a widened one could. The count is
 * kept and exported so the narrowing is visible instead of implied.
 */
function read(syntax) {
  const expanded = expand(syntax);
  if (expanded === null) return null;

  const queue = splitTop(expanded, '|');
  let budget = 4000;
  let dropped = 0;
  const keywords = new Set();
  const terminals = new Set();

  while (queue.length) {
    if ((budget -= 1) <= 0) return null;
    const alternative = simplify(queue.pop());
    if (!alternative) continue;

    if (alternative.startsWith('[') && alternative.endsWith(']')) {
      const inner = alternative.slice(1, -1).trim();
      if (inner === alternative) {
        dropped += 1;
        continue;
      }
      queue.push(inner);
      continue;
    }
    // `a || b` takes at least one, so each term is a valid single value.
    // `a && b` takes both, so no single value satisfies it: drop the branch.
    for (const separator of ['|', '||']) {
      const parts = splitTop(alternative, separator);
      if (parts.length > 1) {
        queue.push(...parts);
      }
    }
    if (
      splitTop(alternative, '|').length > 1 ||
      splitTop(alternative, '||').length > 1
    ) {
      continue;
    }
    if (alternative.includes('&&') || /\s/.test(alternative)) {
      dropped += 1;
      continue;
    }

    if (TERMINALS[alternative]) {
      terminals.add(TERMINALS[alternative]);
      continue;
    }
    if (KEYWORD.test(alternative)) {
      keywords.add(alternative);
      continue;
    }
    dropped += 1;
  }

  if (keywords.size === 0 && terminals.size === 0) return null;
  return {
    keywords: [...keywords].sort(),
    terminals: [...terminals].sort(),
    dropped,
  };
}

// ─── emission ───────────────────────────────────────────────────────────────

const camel = (name) =>
  name.replace(/-([a-z0-9])/g, (_, char) => char.toUpperCase());

const covered = [];
const uncovered = [];
const narrowed = [];

for (const [name, definition] of Object.entries(properties).sort(([a], [b]) =>
  a.localeCompare(b),
)) {
  if (name.startsWith('-') || name.startsWith('--')) continue;
  if (definition.status !== 'standard') continue;
  if (EXCLUDED.has(name)) continue;

  const parsed = read(definition.syntax);
  if (!parsed) {
    uncovered.push(name);
    continue;
  }
  covered.push({ name, ...parsed });
  if (parsed.dropped > 0) narrowed.push(name);
}

const list = (items) =>
  items.length
    ? `[${items.map((item) => `'${item}'`).join(', ')}] as const`
    : '[] as const';

const lines = covered.map(({ name, terminals, keywords }) =>
  terminals.length
    ? `export const ${camel(name)} = /* @__PURE__ */ valueProp('${name}', ${list(terminals)}, ${list(keywords)});`
    : `export const ${camel(name)} = /* @__PURE__ */ keywordProp('${name}', ${list(keywords)});`,
);

const propNames = covered.map(
  ({ name }) => `  ${camel(name)}: /* @__PURE__ */ propertyName('${name}'),`,
);

const output = `/**
 * GENERATED by \`node tools/generate-css-props.mjs\` — do not edit by hand.
 *
 * Source: mdn-data (${require('mdn-data/package.json').version}). Regenerating is part of CI:
 * \`props.spec.ts\` fails when the committed file and a fresh generation differ,
 * which is what keeps the table from quietly ageing behind the spec.
 *
 * ${covered.length} properties covered, ${uncovered.length} not. \`overflow\` and its longhands are
 * excluded by construction — see \`tools/css-props.data.mjs\`.
 */
import { keywordProp, propertyName, valueProp } from './factory.ts';

${lines.join('\n')}

/**
 * Property-name tokens, for the places that need to *name* a property rather
 * than set it — \`global.inherit(prop.color)\`, and the axis \`writes\` constraint.
 */
export const prop = {
${propNames.join('\n')}
} as const;

/**
 * Properties whose grammar the reader could not close. They are absent from the
 * table on purpose: a helper taking \`string\` would be worse than a missing one.
 */
export const UNCOVERED_PROPERTIES = ${JSON.stringify(uncovered)} as const;

/**
 * Properties whose helper is **narrower** than the CSS grammar: at least one
 * alternative was a shape the reader could not close, so it was left out. A
 * narrowed helper never emits CSS the browser rejects; it only refuses forms
 * CSS would have allowed.
 */
export const NARROWED_PROPERTIES = ${JSON.stringify(narrowed)} as const;

export type PropertyName = (typeof prop)[keyof typeof prop];
`;

// Formatted with the repo's own Prettier config: an unformatted generated file
// would fail `prettier --check`, and reformatting it by hand would then break
// `--check` here. One formatter, one source of truth.
const prettier = await import('prettier');
const formatted = await prettier.format(output, {
  ...(await prettier.resolveConfig(OUTPUT)),
  parser: 'typescript',
});

const previous = (() => {
  try {
    return readFileSync(OUTPUT, 'utf8');
  } catch {
    return null;
  }
})();

if (process.argv.includes('--check')) {
  if (previous !== formatted) {
    console.error(
      'generate-css-props: the committed table differs from a fresh generation.',
    );
    process.exit(1);
  }
  console.log(`generate-css-props: up to date (${covered.length} properties).`);
} else {
  writeFileSync(OUTPUT, formatted);
  console.log(
    `generate-css-props: ${covered.length} covered (${narrowed.length} narrowed), ${uncovered.length} uncovered -> ${OUTPUT}`,
  );
}
