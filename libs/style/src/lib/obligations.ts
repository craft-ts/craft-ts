/**
 * Les obligations de contexte : ce qu'une classe exige de ses ancêtres.
 *
 * Le cœur du dispositif tient en une ligne : **`provides(scrollPort.block)`
 * retourne l'effet CSS et la décharge dans le même objet**. Comme `overflow`
 * n'existe pas dans la table de propriétés, c'est l'unique chemin vers
 * `overflow: auto`. Le mauvais correctif — poser un `overflow` au hasard sur le
 * parent le plus proche — n'est pas découragé, il est inexprimable.
 */
import type { Declaration } from './props';

declare const OBLIGATION: unique symbol;

/**
 * La charge transportée par le canal. Obligation et décharge partagent le
 * **même** type : c'est ce qui fait que `Exclude` les annule dans le core.
 */
export interface Obligation<Id extends string> {
  readonly [OBLIGATION]: Id;
}

export interface ObligationSpec<Id extends string> {
  readonly id: Id;
  /** Le CSS qu'un fournisseur doit poser, indissociable de la décharge. */
  readonly effect: readonly Declaration[];
  readonly explain: string;
}

const obligation = <const Id extends string>(
  id: Id,
  effect: readonly Declaration[],
  explain: string,
): ObligationSpec<Id> => ({ id, effect, explain });

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
    "déclarez-le sur le composant de layout qui possède la zone scrollable. Un overflow sur le parent direct créerait un second scroll port, et l'élément collant se figerait par rapport au mauvais conteneur.",
  ),
} as const;

export const noClipping = {
  block: obligation(
    'noClipping.block',
    [d('overflow-block', 'visible')],
    "aucun ancêtre entre ce nœud et son conteneur ne doit rogner l'axe de bloc.",
  ),
} as const;

export const containerType = {
  scrollState: obligation(
    'containerType.scrollState',
    [d('container-type', 'scroll-state')],
    'déclarez-le sur l’élément dont l’état de scroll doit être interrogeable.',
  ),
} as const;

/**
 * Ce qu'une classe **exige**. S'attache à la classe qui en dépend, pas à la
 * feuille entière : c'est la classe précise qui porte la demande, sinon
 * l'erreur désigne un fichier au lieu d'une règle.
 */
export const requires = <const Id extends string>(spec: ObligationSpec<Id>) =>
  ({ kind: 'requires', spec }) as const;

/**
 * Ce qu'un ancêtre **fournit**. Émet l'effet CSS ET la décharge. Il n'existe
 * pas de constructeur littéral de décharge : on ne peut pas prétendre avoir
 * fourni sans poser le CSS correspondant.
 */
export const provides = <const Id extends string>(spec: ObligationSpec<Id>) =>
  ({ kind: 'provides', spec }) as const;

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
      'ce nœud rogne l’axe de bloc.',
    ),
  },
} as const;

export type ObligationEntry =
  | ReturnType<typeof requires>
  | ReturnType<typeof provides>
  | typeof clipOverflow.block;
