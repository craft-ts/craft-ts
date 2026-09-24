/**
 * Pseudo-elements, as blocks of a sheet.
 *
 * `pseudo.before([...])` nests like `when(...)`: it is an item of a class, not
 * a selector. The emitter appends `::before` after every condition, so the
 * pseudo-element always ends the selector — the one place CSS accepts it.
 *
 * Pseudo-**classes** are not here on purpose. `:hover`, `:disabled`,
 * `:focus-visible` are states, and a state is an **axis** (`interaction.*`):
 * that is what puts it in the variant contract, the visual matrix and the
 * contrast proof. A free `:hover` selector would be invisible to all three.
 */
import type { Declaration } from './props/factory.ts';
import { declaration } from './props/factory.ts';
import type { AnyAxisPoint } from './axes/index.ts';
import type { Conditional, PseudoBlock, PseudoElementName } from './styles.ts';
import type { CssStringValue, IdentValue } from './tokens/units.ts';

declare const CONTENT: unique symbol;

/**
 * A `content` declaration built by `pseudo.content.*`.
 *
 * The brand is **required**: `::before` and `::after` do not exist without a
 * `content`, and a block that forgets it renders nothing — no error, no
 * warning, and a decoration that silently disappears. The brand is what lets
 * `pseudo.before` refuse such a block at compile time.
 */
export interface ContentDeclaration extends Declaration {
  readonly [CONTENT]: true;
}

/** What a pseudo-element block may contain: declarations, and conditions. */
export type PseudoItem =
  | Declaration
  | readonly Declaration[]
  | Conditional<AnyAxisPoint, readonly any[]>;

/**
 * `::before` / `::after` must say what they generate.
 *
 * Checked on the **top level** of the block: a `content` hidden under a
 * condition generates nothing in the base scenario, which is the same bug.
 */
export type RequiresContent<Items extends readonly unknown[]> = [
  Extract<Items[number], ContentDeclaration>,
] extends [never]
  ? {
      readonly ERROR_a_generated_pseudo_element_needs_content: 'Add pseudo.content.empty, pseudo.content.text(cssString(...)) or pseudo.content.counter(ident(...)) at the top level of the block. Without content, ::before and ::after are never generated and nothing they declare applies.';
    }
  : unknown;

const contentOf = (value: string): ContentDeclaration =>
  declaration('content', value) as ContentDeclaration;

const block =
  <const Name extends PseudoElementName>(element: Name) =>
  <const Items extends readonly PseudoItem[]>(
    items: Items,
  ): PseudoBlock<Name, Items> => ({ kind: 'pseudo', element, items });

const generated =
  <const Name extends 'before' | 'after'>(element: Name) =>
  <const Items extends readonly PseudoItem[]>(
    // The check rides on the parameter, not on the type parameter's
    // constraint — as a constraint it would be resolved while `Items` is still
    // being inferred, and would check nothing. See `when` in `styles.ts`.
    items: Items & RequiresContent<Items>,
  ): PseudoBlock<Name, Items> => ({ kind: 'pseudo', element, items });

export const pseudo = {
  before: generated('before'),
  after: generated('after'),
  placeholder: block('placeholder'),
  marker: block('marker'),
  selection: block('selection'),
  backdrop: block('backdrop'),
  /**
   * The `content` property, typed.
   *
   * Under `pseudo` rather than beside the generated `content` helper, which
   * sets the property on an element (`content: url(...)` on an `img`) and
   * carries no brand. Same collision rule as `unit.px` and `kind.color`.
   */
  content: {
    /** `content: none` — the pseudo-element is not generated. */
    none: contentOf('none'),
    /** `content: ""` — a purely decorative box. */
    empty: contentOf('""'),
    /** A quoted text, built by `cssString`, so it cannot break out of the rule. */
    text: (value: CssStringValue): ContentDeclaration => contentOf(value.css),
    /** `counter(name)`. */
    counter: (name: IdentValue): ContentDeclaration =>
      contentOf(`counter(${name.css})`),
    /**
     * `attr(name)` — the text of one of the element's attributes, for a
     * tooltip or a placeholder that the template writes as data.
     */
    attr: (name: IdentValue): ContentDeclaration =>
      contentOf(`attr(${name.css})`),
  },
} as const;
