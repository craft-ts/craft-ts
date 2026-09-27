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
import type { AnyAxisPoint } from '../lib/axes/index.ts';
import type {
  AtomicRule,
  PseudoElementName,
  RegisteredClass,
} from '../lib/styles.ts';
import type { CssVarDeclaration } from '../lib/css-vars.ts';
import type { ColorProvenance } from '../lib/tokens/units.ts';
import type { RegisteredKeyframes } from '../lib/animation.ts';
import type { RegisteredFont } from '../lib/font.ts';
import { propertyRule } from '../lib/css-vars.ts';
import {
  CRAFT_BASE,
  CRAFT_BASE_VARS,
  CRAFT_RESET,
  FOUNDATION_PROPERTIES,
  flattenGlobal,
  type GlobalLayer,
  type GlobalRule,
} from '../lib/global/index.ts';
import { prop } from '../lib/props/generated.ts';
import {
  clipOverflow,
  containerType,
  noClipping,
  scrollPort,
} from '../lib/obligations.ts';

/**
 * The layer order is fixed here so that no import order can change it.
 *
 * Every layer lives under `craft.`: a third-party stylesheet that arrives
 * unlayered is then recognisable at a glance — and it wins over all of these,
 * which is the CSS rule for unlayered styles and exactly why one should be
 * rare, deliberate, and attested.
 */
export const LAYERS = [
  'craft.reset',
  'craft.base',
  'craft.tokens',
  'craft.global',
  'craft.components',
  'craft.variants',
  'craft.overrides',
] as const;

/**
 * Properties the vocabulary owns.
 *
 * The generated table, plus the ones only an obligation can write. `overflow`
 * is in the second set and not the first on purpose: it is reachable through
 * `provides(scrollPort.block)` and through nothing else.
 */
export const knownProperties = (): ReadonlySet<string> => {
  const known = new Set<string>([
    ...Object.values(prop),
    ...FOUNDATION_PROPERTIES,
  ]);
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
  atoms: readonly { readonly property: string }[],
  source = 'the style registry',
): void {
  const known = knownProperties();
  for (const atom of atoms) {
    // A custom property is declared by `cssVars`, which already registered its
    // `@property` block; the table has nothing to say about it.
    if (atom.property.startsWith('--')) continue;
    if (!known.has(atom.property)) {
      throw new UnknownCssError(atom.property, source);
    }
  }
}

const escapeClass = (className: string): string =>
  `.${className.replace(/([^a-zA-Z0-9_-])/g, '\\$1')}`;

/** An at-rule condition nests around the rule; a selector fragment joins it. */
const isAtRule = (point: AnyAxisPoint): boolean => point.open.startsWith('@');

/**
 * One rule, conditions applied. The pseudo-element is appended **after**
 * every selector condition, whatever the nesting order was: CSS only accepts
 * it at the end of a compound selector.
 */
function wrapRule(
  selector: string,
  conditions: readonly AnyAxisPoint[],
  pseudoElement: PseudoElementName | undefined,
  declarationText: string,
): string {
  const parts = selector.split(/\s*,\s*/).map((part) => {
    const conditioned = conditions
      .filter((point) => !isAtRule(point))
      .reduce((current, point) => point.open.replace('&', current), part);
    return pseudoElement ? `${conditioned}::${pseudoElement}` : conditioned;
  });
  const body = `${parts.join(',')}{${declarationText}}`;
  return conditions
    .filter(isAtRule)
    .reduceRight((inner, point) => `${point.open}{${inner}}`, body);
}

function ruleText(atom: AtomicRule): string {
  return wrapRule(
    escapeClass(atom.className),
    atom.conditions,
    atom.pseudoElement,
    `${atom.property}:${atom.value}`,
  );
}

const globalRuleText = (rule: GlobalRule): string =>
  wrapRule(
    rule.selector,
    rule.conditions,
    rule.pseudoElement,
    `${rule.property}:${rule.value}${rule.important ? ' !important' : ''}`,
  );

const keyframesText = (frames: RegisteredKeyframes): string =>
  `@keyframes ${frames.name}{${frames.steps
    .map(
      (step) =>
        `${step.selector}{${step.declarations
          .map((declaration) => `${declaration.property}:${declaration.value}`)
          .join(';')}}`,
    )
    .join('')}}`;

const FONT_FORMAT: Readonly<Record<string, string>> = {
  woff2: 'woff2',
  woff: 'woff',
  ttf: 'truetype',
  otf: 'opentype',
};

const fontWeight = (weight: number | readonly [number, number]): string =>
  typeof weight === 'number' ? String(weight) : `${weight[0]} ${weight[1]}`;

/** `@font-face` blocks: local files, and the metric-adjusted fallback face. */
export function fontFaces(fonts: readonly RegisteredFont[]): string[] {
  const faces: string[] = [];
  for (const font of fonts) {
    if (font.source.kind === 'local') {
      for (const file of font.source.files) {
        const extension = file.url.split('.').pop()?.toLowerCase() ?? '';
        const format = FONT_FORMAT[extension];
        faces.push(
          `@font-face{font-family:${JSON.stringify(font.family)};src:url(${JSON.stringify(file.url)})${format ? ` format(${JSON.stringify(format)})` : ''};font-display:${font.display}${file.weight !== undefined ? `;font-weight:${fontWeight(file.weight)}` : ''}${file.style ? `;font-style:${file.style}` : ''}}`,
        );
      }
    }
    if (font.fallbackFace) {
      const face = font.fallbackFace;
      faces.push(
        `@font-face{font-family:${JSON.stringify(face.family)};src:local(${JSON.stringify(face.local)});size-adjust:${face.sizeAdjust};ascent-override:${face.ascentOverride};descent-override:${face.descentOverride};line-gap-override:${face.lineGapOverride}}`,
      );
    }
  }
  return faces;
}

/** A `<head>` tag, in the shape Vite's `transformIndexHtml` takes. */
export interface HeadTag {
  readonly tag: 'link';
  readonly attrs: Readonly<Record<string, string | boolean>>;
  readonly injectTo: 'head-prepend';
}

const googleHref = (font: RegisteredFont): string => {
  if (font.source.kind !== 'google') return '';
  const family = font.family.replace(/ /g, '+');
  const weights = [...font.source.weights].sort((a, b) => a - b);
  const axis = font.source.italic
    ? `ital,wght@${[
        ...weights.map((weight) => `0,${weight}`),
        ...weights.map((weight) => `1,${weight}`),
      ].join(';')}`
    : `wght@${weights.join(';')}`;
  return `https://fonts.googleapis.com/css2?family=${family}:${axis}&display=${font.display}`;
};

/**
 * What the fonts need in `<head>`.
 *
 * Google Fonts: a `preconnect` to both origins, then the stylesheet preloaded
 * and applied — instead of an `@import` inside the CSS, which the browser can
 * only discover after downloading the CSS. Local files: a `preload`, so the
 * font request starts with the document rather than with the first layout.
 */
export function fontHeadTags(fonts: readonly RegisteredFont[]): HeadTag[] {
  const tags: HeadTag[] = [];
  const link = (attrs: HeadTag['attrs']): HeadTag => ({
    tag: 'link',
    attrs,
    injectTo: 'head-prepend',
  });
  const google = fonts.filter((font) => font.source.kind === 'google');
  if (google.length > 0) {
    tags.push(
      link({ rel: 'preconnect', href: 'https://fonts.googleapis.com' }),
      link({
        rel: 'preconnect',
        href: 'https://fonts.gstatic.com',
        crossorigin: true,
      }),
    );
    for (const font of google) {
      const href = googleHref(font);
      tags.push(
        link({ rel: 'preload', as: 'style', href }),
        link({ rel: 'stylesheet', href }),
      );
    }
  }
  for (const font of fonts) {
    if (font.source.kind !== 'local') continue;
    for (const file of font.source.files) {
      if (!file.url.endsWith('.woff2')) continue;
      tags.push(
        link({
          rel: 'preload',
          as: 'font',
          type: 'font/woff2',
          href: file.url,
          crossorigin: true,
        }),
      );
    }
  }
  return tags;
}

const escapeAttribute = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** The same tags as HTML, for a server renderer that writes `<head>` itself. */
export const renderHeadTags = (tags: readonly HeadTag[]): string =>
  tags
    .map(
      (tag) =>
        `<${tag.tag} ${Object.entries(tag.attrs)
          .map(([name, value]) =>
            value === true
              ? name
              : `${name}="${escapeAttribute(String(value))}"`,
          )
          .join(' ')}>`,
    )
    .join('');

/** What the document-level part of the stylesheet is made of. */
export interface FoundationInput {
  /** The craft-ts reset (`craft.reset`). Off unless asked for. */
  readonly reset?: boolean;
  /** The craft-ts good defaults (`craft.base`). Off unless asked for. */
  readonly base?: boolean;
  /** The app's `craftGlobalStyles` rules (`craft.global`). */
  readonly globals?: readonly GlobalRule[];
  readonly keyframes?: readonly RegisteredKeyframes[];
  readonly fonts?: readonly RegisteredFont[];
}

const foundationRules = (
  layer: GlobalLayer,
  enabled: boolean | undefined,
): readonly GlobalRule[] =>
  enabled
    ? (layer === 'reset' ? CRAFT_RESET : CRAFT_BASE).flatMap((block) =>
        flattenGlobal(layer, block),
      )
    : [];

/** The last net, for the document-level rules. Same contract as `validateAtoms`. */
export function validateFoundation(
  foundation: FoundationInput,
  source = 'the style registry',
): void {
  validateAtoms(
    [
      ...(foundation.globals ?? []),
      ...(foundation.keyframes ?? []).flatMap((frames) =>
        frames.steps.flatMap((step) => step.declarations),
      ),
    ],
    source,
  );
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
  foundation: FoundationInput = {},
): string {
  const layered = atoms.filter((atom) => !atom.isolated);
  const base = layered
    .filter((atom) => atom.conditions.length === 0)
    .sort(byName);
  const variants = layered
    .filter((atom) => atom.conditions.length > 0)
    .sort(byName);
  // Isolated sheets, after every layer: base first, variants after, so a
  // variant wins by source order where its selector adds no specificity.
  const isolated = atoms.filter((atom) => atom.isolated);
  const isolatedRules = [
    ...isolated.filter((atom) => atom.conditions.length === 0).sort(byName),
    ...isolated.filter((atom) => atom.conditions.length > 0).sort(byName),
  ].map(ruleText);
  const properties = [...vars, ...(foundation.base ? CRAFT_BASE_VARS : [])]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(propertyRule);
  // Declaration order, not sorted: inside a global layer, a later rule for the
  // same selector is meant to win — `html { scroll-behavior: smooth }` then
  // its reduced-motion override. Module order is already deterministic.
  const reset = foundationRules('reset', foundation.reset);
  const baseLayer = foundationRules('base', foundation.base);
  const globals = foundation.globals ?? [];
  const frames = [...(foundation.keyframes ?? [])].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  const faces = fontFaces(foundation.fonts ?? []);

  const layer = (name: string, rules: readonly string[]): string =>
    rules.length ? `@layer ${name}{${rules.join('')}}` : '';

  const sections = [
    `@layer ${LAYERS.join(', ')};`,
    faces.join(''),
    layer('craft.reset', reset.map(globalRuleText)),
    layer('craft.base', baseLayer.map(globalRuleText)),
    layer('craft.tokens', properties),
    layer('craft.global', globals.map(globalRuleText)),
    layer('craft.components', [
      ...frames.map(keyframesText),
      ...base.map(ruleText),
    ]),
    layer('craft.variants', variants.map(ruleText)),
    isolatedRules.join(''),
  ];

  return sections.filter(Boolean).join('\n') + '\n';
}

/**
 * The dump format's own version.
 *
 * Bumped to 2 when colour provenance was added. The field is **optional** on
 * the way in: a dump written before the bump has no version and no
 * provenance, and every reader must still work on it — the alternative is a
 * tool that crashes on a file a colleague generated last week. What version 2
 * buys is the ability to tell "this dump has no provenance because it is old"
 * from "this dump has no provenance because nothing is named", which is the
 * difference between a coverage gap and a stale artefact.
 */
export const STYLE_DUMP_VERSION = 2;

export interface StyleDump {
  /** Absent on a version-1 dump. See `STYLE_DUMP_VERSION`. */
  readonly version?: number;
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
    readonly provenance?: ColorProvenance;
    /**
     * How many of the conditions are selector fragments rather than at-rules.
     *
     * It is the atom's specificity contribution, and it is emitted rather
     * than re-derived because the dump's conditions are `axis:point` strings
     * — from which nobody downstream can tell `@media (…)`, which adds
     * nothing, from `&[data-tone='warning']`, which adds a class's worth. A
     * reader that guessed would resolve a tone-plus-hover button backwards.
     */
    readonly selectorConditions: number;
    /** Set when the atom styles a pseudo-element, not the element. */
    readonly pseudoElement?: PseudoElementName;
  }[];
  readonly vars: readonly CssVarDeclaration[];
  /**
   * Custom properties read by document-level rules (`craftGlobalStyles`, the
   * foundation) and by keyframes. Those rules belong to no class, so without
   * this list a variable read only by `body` would look unread.
   */
  readonly globalReads?: readonly string[];
}

const VAR_READ = /var\((--[^),\s]+)/g;

/** The variables the document-level rules and keyframes read. */
export function globalVarReads(foundation: FoundationInput): string[] {
  const values = [
    ...foundationRules('reset', foundation.reset),
    ...foundationRules('base', foundation.base),
    ...(foundation.globals ?? []),
  ].map((rule) => rule.value);
  for (const frames of foundation.keyframes ?? []) {
    for (const step of frames.steps) {
      for (const declaration of step.declarations)
        values.push(declaration.value);
    }
  }
  const names = new Set<string>();
  for (const value of values) {
    for (const [, name] of value.matchAll(VAR_READ)) names.add(name);
  }
  return [...names].sort();
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
    version: STYLE_DUMP_VERSION,
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
      selectorConditions: atom.conditions.filter((point) => !isAtRule(point))
        .length,
      ...(atom.provenance ? { provenance: atom.provenance } : {}),
      ...(atom.pseudoElement ? { pseudoElement: atom.pseudoElement } : {}),
    })),
    vars: [...vars].sort((left, right) => left.name.localeCompare(right.name)),
  };
}
