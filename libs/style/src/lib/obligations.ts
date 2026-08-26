/**
 * Les obligations de contexte : ce qu'une classe exige de ses ancêtres.
 *
 * Le cœur du dispositif tient en une ligne : **`provides(scrollPort.block)`
 * retourne l'effet CSS et la décharge dans le même objet**. Comme `overflow`
 * n'existe pas dans la table de propriétés, c'est l'unique chemin vers
 * `overflow: auto`. Le mauvais correctif — poser un `overflow` au hasard sur le
 * parent le plus proche — n'est pas découragé, il est inexprimable.
 */
import type { CraftRequirement } from '@craft-ts/core';
import type { Declaration } from './props/factory.ts';

/**
 * The payload the channel carries. An obligation and its discharge share the
 * **same** type — that is what makes `Exclude` cancel them in the core.
 *
 * It is a `CraftRequirement`, so the id and the explanation travel with it and
 * the sealing error can quote both. The core reads two opaque strings; every
 * word of CSS meaning in them is written here.
 */
export type Obligation<Id extends string, Explain extends string = string> =
  CraftRequirement<Id, Explain>;

export interface ObligationSpec<
  Id extends string,
  Explain extends string = string,
> {
  readonly id: Id;
  /** The CSS a provider must lay down, inseparable from the discharge. */
  readonly effect: readonly Declaration[];
  readonly explain: Explain;
}

const obligation = <const Id extends string, const Explain extends string>(
  id: Id,
  effect: readonly Declaration[],
  explain: Explain,
): ObligationSpec<Id, Explain> => ({ id, effect, explain });

const d = (property: string, value: string): Declaration => ({
  property,
  value,
  unproven: '',
});

export const scrollPort = {
  block: obligation(
    'scrollPort.block',
    // Les deux déclarations partent ensemble. `min-block-size: 0` sans
    // `overflow-block` ne sert à rien, et l'inverse produit un port qui ne
    // rétrécit jamais — c'est précisément le bug que ce couplage évite.
    [d('overflow-block', 'auto'), d('min-block-size', '0')],
    'declare it on the layout component that owns the scrollable area. An overflow on the direct parent would create a second scroll port, and the sticky element would stick to the wrong container.',
  ),
  inline: obligation(
    'scrollPort.inline',
    [d('overflow-inline', 'auto'), d('min-inline-size', '0')],
    'declare it on the layout component that owns the scrollable area.',
  ),
} as const;

export const noClipping = {
  block: obligation(
    'noClipping.block',
    [d('overflow-block', 'visible')],
    'no ancestor between this node and its container may clip the block axis.',
  ),
  inline: obligation(
    'noClipping.inline',
    [d('overflow-inline', 'visible')],
    'no ancestor between this node and its container may clip the inline axis.',
  ),
} as const;

export const containerType = {
  inlineSize: obligation(
    'containerType.inlineSize',
    [d('container-type', 'inline-size')],
    'declare it on the element whose inline size the container queries read.',
  ),
  size: obligation(
    'containerType.size',
    [d('container-type', 'size')],
    'declare it on the element whose size the container queries read.',
  ),
  scrollState: obligation(
    'containerType.scrollState',
    [d('container-type', 'scroll-state')],
    'declare it on the element whose scroll state must be queryable.',
  ),
} as const;

/**
 * Ce qu'une classe **exige**. S'attache à la classe qui en dépend, pas à la
 * feuille entière : c'est la classe précise qui porte la demande, sinon
 * l'erreur désigne un fichier au lieu d'une règle.
 */
export const requires = <const Id extends string, const Explain extends string>(
  spec: ObligationSpec<Id, Explain>,
) => ({ kind: 'requires', spec }) as const;

/**
 * Ce qu'un ancêtre **fournit**. Émet l'effet CSS ET la décharge. Il n'existe
 * pas de constructeur littéral de décharge : on ne peut pas prétendre avoir
 * fourni sans poser le CSS correspondant.
 */
export const provides = <const Id extends string, const Explain extends string>(
  spec: ObligationSpec<Id, Explain>,
) => ({ kind: 'provides', spec }) as const;

/**
 * Rogne l'overflow — et **déclare le faire**. Une classe qui clippe traverse
 * le canal `violates` : si une obligation `noClipping` reste ouverte sous elle,
 * le chemin est en faute et le typage le dit.
 */
export const clipOverflow = {
  block: {
    kind: 'violates',
    spec: obligation(
      'noClipping.block',
      [d('overflow-block', 'clip')],
      'this node clips the block axis.',
    ),
  },
  inline: {
    kind: 'violates',
    spec: obligation(
      'noClipping.inline',
      [d('overflow-inline', 'clip')],
      'this node clips the inline axis.',
    ),
  },
} as const;

/**
 * Discharges an obligation **without** laying down the CSS — for the cases the
 * model cannot see, such as a scroll port owned by a third-party shell.
 *
 * It is the marked escape hatch, not a loophole: `unproven` travels with it, so
 * the graph counts it as debt. An escape hatch that did not bubble up would be
 * a design bug, not a convenience.
 */
export const unsafeAssume = <
  const Id extends string,
  const Explain extends string,
  Reason extends string,
>(
  spec: ObligationSpec<Id, Explain>,
  reason: Reason,
) =>
  ({
    kind: 'provides',
    spec: { ...spec, effect: [] as readonly Declaration[] },
    unproven: reason,
  }) as const;

/**
 * Declares that a class *is* the thing an obligation asks for, without being
 * the one that asks. Reserved for the layout primitives that own a region.
 */
export const declares = provides;

export type ObligationEntry =
  | ReturnType<typeof requires>
  | ReturnType<typeof provides>
  | ReturnType<typeof unsafeAssume>
  | typeof clipOverflow.block
  | typeof clipOverflow.inline;
