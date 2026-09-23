/**
 * Document-level styles: the only place a selector is not a class.
 *
 * Three layers, in cascade order, and each has one owner:
 *
 * - `craft.reset` — shipped by craft-ts (`reset.ts`), on by default.
 * - `craft.base` — shipped by craft-ts (`base.ts`): colour scheme, focus ring,
 *   reduced motion, selection. Driven by typed theme variables.
 * - `craft.global` — the app's own, through `craftGlobalStyles`: its theme
 *   variables on `:root`, and element defaults (`body`, `a`).
 *
 * All three are written with the same vocabulary as a sheet — declarations
 * from the generated table, `set(...)`, `when(...)`, `pseudo.*` — so a global
 * style is not where raw CSS gets back in. What a class cannot do here is
 * nothing: an element selector is the one extra thing, and it is closed over
 * the HTML tag names.
 */
import type { AnyAxisPoint } from '../axes/index.ts';
import type { Declaration } from '../props/factory.ts';
import type { ColorProvenance } from '../tokens/units.ts';
import {
  isConditional,
  isDeclaration,
  isObligation,
  isPseudoBlock,
  type PseudoElementName,
  type SheetItem,
} from '../styles.ts';

export type GlobalLayer = 'reset' | 'base' | 'global';

export interface GlobalRule {
  readonly layer: GlobalLayer;
  readonly selector: string;
  /** Outer to inner, in nesting order. */
  readonly conditions: readonly AnyAxisPoint[];
  readonly pseudoElement?: PseudoElementName;
  readonly property: string;
  readonly value: string;
  readonly unproven: string;
  readonly provenance?: ColorProvenance;
  /**
   * Reserved to the foundation: the reduced-motion guard has to beat every
   * later layer, and an important declaration in an **earlier** layer is the
   * one thing that does. No public helper sets it.
   */
  readonly important?: boolean;
}

/** A block of the foundation: one selector, sheet items under it. */
export interface GlobalBlock {
  readonly selector: string;
  readonly items: readonly SheetItem[];
}

declare const IMPORTANT: unique symbol;

/** Foundation-only. See `GlobalRule.important`. */
export type ImportantDeclaration = Declaration & { readonly [IMPORTANT]: true };

export const important = (declaration: Declaration): ImportantDeclaration =>
  ({ ...declaration, important: true }) as unknown as ImportantDeclaration;

/** Flattens sheet items under a selector into global rules. */
export function flattenGlobal(
  layer: GlobalLayer,
  block: GlobalBlock,
): readonly GlobalRule[] {
  const rules: GlobalRule[] = [];
  const walk = (
    items: readonly SheetItem[],
    conditions: readonly AnyAxisPoint[],
    pseudoElement: PseudoElementName | undefined,
  ): void => {
    for (const item of items) {
      if (Array.isArray(item)) {
        walk(item as readonly SheetItem[], conditions, pseudoElement);
      } else if (isConditional(item)) {
        walk(item.items, [...conditions, item.at], pseudoElement);
      } else if (isPseudoBlock(item)) {
        if (pseudoElement) {
          throw new Error(
            `craftGlobalStyles: '::${item.element}' is nested inside '::${pseudoElement}' under '${block.selector}'.`,
          );
        }
        walk(item.items, conditions, item.element);
      } else if (isDeclaration(item)) {
        rules.push({
          layer,
          selector: block.selector,
          conditions,
          property: item.property,
          value: item.value,
          unproven: item.unproven,
          ...(pseudoElement ? { pseudoElement } : {}),
          ...(item.provenance ? { provenance: item.provenance } : {}),
          ...((item as { important?: boolean }).important
            ? { important: true }
            : {}),
        });
      } else if (isObligation(item)) {
        throw new Error(
          `craftGlobalStyles: an obligation sits under '${block.selector}'. Obligations are discharged inside a component tree; a document-level style has no tree to discharge them in.`,
        );
      }
    }
  };
  walk(block.items, [], undefined);
  return rules;
}

// ─── the app's own layer ────────────────────────────────────────────────────

/** The element selectors `craftGlobalStyles` accepts — tag names, nothing else. */
export type GlobalElement = keyof HTMLElementTagNameMap;

export interface GlobalStylesSpec {
  /** On `:root` — theme variables, `color-scheme`, the root font size. */
  readonly root?: readonly SheetItem[];
  /** Element defaults, by tag name. */
  readonly elements?: Partial<Record<GlobalElement, readonly SheetItem[]>>;
}

const globalRules = new Map<string, readonly GlobalRule[]>();

/** Every rule of the `craft.global` layer, in declaration order. */
export const registeredGlobalRules = (): readonly GlobalRule[] =>
  [...globalRules.values()].flat();

/** Test-only: the registry is module state, and a spec must be able to reset it. */
export const resetGlobalRegistry = (): void => globalRules.clear();

const TAG_NAME = /^[a-z][a-z0-9]*$/;

/**
 * The app's document-level styles, in the `craft.global` layer.
 *
 * The reset is not written here: craft-ts ships it (`craftStyle({ reset })`).
 * What remains for an app is small — its theme on `:root`, a font on `body`,
 * a link colour — and it is written with the same vocabulary as a sheet.
 */
export function craftGlobalStyles(
  prefix: string,
  spec: GlobalStylesSpec,
): void {
  if (globalRules.has(prefix)) {
    throw new Error(
      `craftGlobalStyles: '${prefix}' is already declared. One call per app is the norm; two calls need two prefixes.`,
    );
  }
  const blocks: GlobalBlock[] = [];
  if (spec.root) blocks.push({ selector: ':root', items: spec.root });
  for (const [element, items] of Object.entries(spec.elements ?? {})) {
    if (!TAG_NAME.test(element)) {
      throw new Error(
        `craftGlobalStyles: '${element}' is not a tag name. Only element selectors are accepted here; anything narrower belongs to a component sheet.`,
      );
    }
    if (items) blocks.push({ selector: element, items });
  }
  globalRules.set(
    prefix,
    blocks.flatMap((block) => flattenGlobal('global', block)),
  );
}
