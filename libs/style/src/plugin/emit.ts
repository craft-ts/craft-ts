/**
 * Turning the registry into CSS.
 *
 * This module is pure: registry in, stylesheet out. It never touches the
 * filesystem and never asks the typechecker anything — the types verify, the
 * values emit. Everything that reads files lives in `vite.ts`.
 *
 * Deduplication happened upstream, when the atoms were registered: two
 * components writing `padding: 1rem` under the same condition already share one
 * atom. What is left here is ordering, wrapping, and the last safety net —
 * validating that every property about to be written is one the vocabulary
 * actually owns.
 */
import type { AnyAxisPoint } from '../lib/axes';
import type { AtomicRule, RegisteredClass } from '../lib/styles';
import type { CssVarDeclaration } from '../lib/css-vars';
import { propertyRule } from '../lib/css-vars';
import { prop } from '../lib/props/generated';
import {
  clipOverflow,
  containerType,
  noClipping,
  scrollPort,
} from '../lib/obligations';

/** The layer order is fixed here so that no import order can change it. */
export const LAYERS = [
  'reset',
  'tokens',
  'components',
  'variants',
  'overrides',
] as const;

/**
 * Properties the vocabulary owns.
 *
 * The generated table, plus the ones only an obligation can write. `overflow`
 * is in the second set and not the first on purpose: it is reachable through
 * `provides(scrollPort.block)` and through nothing else.
 */
export const knownProperties = (): ReadonlySet<string> => {
  const known = new Set<string>(Object.values(prop));
  const specs = [
    ...Object.values(scrollPort),
    ...Object.values(noClipping),
    ...Object.values(containerType),
    ...Object.values(clipOverflow).map((entry) => entry.spec),
  ];
  for (const spec of specs) {
    for (const declaration of spec.effect) known.add(declaration.property);
  }
  return known;
};

export class UnknownCssError extends Error {
  readonly property: string;
  readonly source: string;

  constructor(property: string, source: string) {
    super(
      `craft-style: '${property}' is not a property of the vocabulary (emitted from ${source}). Nothing in the generated table produces it, so it reached the emitter through an escape hatch. Add it to the table or route it through an obligation.`,
    );
    this.property = property;
    this.source = source;
  }
}

/**
 * The last net under the escape hatches.
 *
 * A keyword or property that slipped past the types would otherwise become CSS
 * the browser silently drops — the exact failure the package exists to prevent,
 * arriving at the last possible moment.
 */
export function validateAtoms(
  atoms: readonly AtomicRule[],
  source = 'the style registry',
): void {
  const known = knownProperties();
  for (const atom of atoms) {
    if (!known.has(atom.property)) {
      throw new UnknownCssError(atom.property, source);
    }
  }
}

const escapeClass = (className: string): string =>
  `.${className.replace(/([^a-zA-Z0-9_-])/g, '\\$1')}`;

/** An at-rule condition nests around the rule; a selector fragment joins it. */
const isAtRule = (point: AnyAxisPoint): boolean => point.open.startsWith('@');

function ruleText(atom: AtomicRule): string {
  const selector = atom.conditions
    .filter((point) => !isAtRule(point))
    .reduce(
      (current, point) => point.open.replace('&', current),
      escapeClass(atom.className),
    );
  const body = `${selector}{${atom.property}:${atom.value}}`;
  return atom.conditions
    .filter(isAtRule)
    .reduceRight((inner, point) => `${point.open}{${inner}}`, body);
}

const byName = (left: AtomicRule, right: AtomicRule): number =>
  left.className.localeCompare(right.className);

/**
 * The stylesheet.
 *
 * Unconditional atoms land in `components`, conditional ones in `variants`, so
 * a variant always wins over the base without anyone counting selector
 * specificity. Ordering is by class name rather than by registration order:
 * the output must not depend on which module the bundler happened to load
 * first, or two identical builds would produce two different files.
 */
export function renderCss(
  atoms: readonly AtomicRule[],
  vars: readonly CssVarDeclaration[],
): string {
  const base = atoms
    .filter((atom) => atom.conditions.length === 0)
    .sort(byName);
  const variants = atoms
    .filter((atom) => atom.conditions.length > 0)
    .sort(byName);
  const properties = [...vars]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(propertyRule);

  const sections = [
    `@layer ${LAYERS.join(', ')};`,
    properties.length ? `@layer tokens{${properties.join('')}}` : '',
    base.length ? `@layer components{${base.map(ruleText).join('')}}` : '',
    variants.length
      ? `@layer variants{${variants.map(ruleText).join('')}}`
      : '',
  ];

  return sections.filter(Boolean).join('\n') + '\n';
}

export interface StyleDump {
  readonly classes: readonly {
    readonly key: string;
    readonly className: string;
    readonly axes: Readonly<Record<string, readonly string[]>>;
    readonly atoms: readonly string[];
    readonly unproven: readonly string[];
    readonly requires: readonly string[];
    readonly provides: readonly string[];
    readonly violates: readonly string[];
  }[];
  readonly atoms: readonly {
    readonly className: string;
    readonly property: string;
    readonly value: string;
    readonly conditions: readonly string[];
    readonly unproven: string;
  }[];
  readonly vars: readonly CssVarDeclaration[];
}

/**
 * What the dependency graph consumes.
 *
 * Emitted by the plugin rather than re-derived by an AST pass: there is one
 * graph and two producers, and a second, approximate evaluation of the DSL
 * would disagree with this one sooner or later.
 */
export function styleDump(
  classes: readonly RegisteredClass[],
  atoms: readonly AtomicRule[],
  vars: readonly CssVarDeclaration[],
): StyleDump {
  return {
    classes: [...classes]
      .sort((left, right) => left.key.localeCompare(right.key))
      .map((registered) => ({
        key: registered.key,
        className: registered.className,
        axes: registered.axes,
        atoms: registered.rules.map((rule) => rule.className),
        unproven: registered.unproven,
        requires: registered.requires,
        provides: registered.provides,
        violates: registered.violates,
      })),
    atoms: [...atoms].sort(byName).map((atom) => ({
      className: atom.className,
      property: atom.property,
      value: atom.value,
      conditions: atom.conditions.map(
        (point) => `${point.axis}:${point.point}`,
      ),
      unproven: atom.unproven,
    })),
    vars: [...vars].sort((left, right) => left.name.localeCompare(right.name)),
  };
}
