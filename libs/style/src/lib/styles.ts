/**
 * `craftStyles` : une feuille de style dont le **contrat de variantes** est
 * inféré, pas déclaré.
 *
 * Ce qui rend la matrice de scénarios possible plus loin, c'est que seuls les
 * points de coupure **réellement utilisés** entrent dans le contrat. Un axe qui
 * définit six breakpoints mais dont un composant n'en utilise qu'un ne produit
 * pas six scénarios : il en produit deux (`base` et celui-là).
 *
 * La conjonction se fait par **imbrication uniquement** — `when(a, [when(b, …)])`.
 * Pas de forme multi-arguments équivalente : une seule façon d'écrire chaque
 * chose, sinon deux composants identiques produisent deux contrats différents.
 */
import type {
  ChannelsOf,
  CraftChannels,
  CraftChannelsCarrier,
  MergeChannelUnion,
} from '@craft-ng/core';
import type { AnyAxisPoint, AxisPoint } from './axes';
import type { Declaration } from './props';
import type { Obligation, ObligationEntry } from './obligations';

declare const VARIANTS: unique symbol;

export interface Conditional<
  Point extends AnyAxisPoint,
  Items extends readonly unknown[],
> {
  readonly kind: 'when';
  readonly at: Point;
  readonly items: Items;
}

export type SheetItem =
  | Declaration
  | readonly Declaration[]
  | ObligationEntry
  | Conditional<AnyAxisPoint, readonly any[]>;

/** Applique des déclarations sous une condition. Imbricable, et rien d'autre. */
export function when<
  const Point extends AnyAxisPoint,
  const Items extends readonly SheetItem[],
>(at: Point, items: Items): Conditional<Point, Items> {
  return { kind: 'when', at, items };
}

// ─── inférence du contrat ───────────────────────────────────────────────────

type PointsIn<Item> =
  Item extends Conditional<infer Point, infer Items>
    ? Point | PointsIn<Items[number]>
    : Item extends readonly (infer Child)[]
      ? PointsIn<Child>
      : never;

/** axe → points **réellement** utilisés. Jamais tous les points de l'axe. */
export type VariantContract<Points extends AnyAxisPoint> = {
  readonly [Axis in Points['axis']]: Extract<
    Points,
    AxisPoint<Axis, string>
  >['point'];
};

type EntriesIn<Item, Kind extends string> =
  Item extends Conditional<AnyAxisPoint, infer Items>
    ? EntriesIn<Items[number], Kind>
    : Item extends readonly (infer Child)[]
      ? EntriesIn<Child, Kind>
      : Item extends {
            readonly kind: Kind;
            readonly spec: { readonly id: infer Id extends string };
          }
        ? Obligation<Id>
        : never;

/**
 * Le canal que la classe pose sur le nœud qui la porte. Le core ne sait pas ce
 * qu'il transporte : pour lui, `Obligation<'scrollPort.block'>` est une charge
 * opaque qu'un `Exclude` annule.
 */
export type ChannelsOfSheet<Item> = MergeChannelUnion<{
  readonly accumulate: never;
  readonly obligations: EntriesIn<Item, 'requires'>;
  readonly discharges: EntriesIn<Item, 'provides'>;
  readonly violates: EntriesIn<Item, 'violates'>;
}>;

/**
 * Une classe brandée. À l'exécution c'est une chaîne — le renderer existant la
 * pose telle quelle — mais son type porte les variantes qu'elle produit et le
 * canal qu'elle ouvre. Ce que le typage ne peut pas empêcher (écrire
 * `class: 'badge'` à la main), la règle ESLint `no-raw-class` l'interdit :
 * l'étanchéité partielle donne 0 % de garantie, pas 90 %.
 */
export type CraftClass<
  Points extends AnyAxisPoint = never,
  Channels extends CraftChannels = never,
> = string &
  CraftChannelsCarrier<Channels> & {
    readonly [VARIANTS]?: Points;
  };

/**
 * Le contrat d'une classe, lisible depuis l'extérieur. C'est lui que la matrice
 * déplie et que l'assertion d'exhaustivité compare aux baselines.
 */
export type VariantsOf<Class> = typeof VARIANTS extends keyof Class
  ? Class extends { readonly [VARIANTS]?: infer Points }
    ? [Points] extends [AnyAxisPoint]
      ? VariantContract<Points>
      : Record<never, never>
    : Record<never, never>
  : Record<never, never>;

export type StyleSheet = Readonly<Record<string, readonly SheetItem[]>>;

export type CraftStyles<Sheet extends StyleSheet> = {
  readonly [Key in keyof Sheet]: CraftClass<
    PointsIn<Sheet[Key][number]>,
    ChannelsOfSheet<Sheet[Key][number]>
  >;
};

// ─── registre d'émission ────────────────────────────────────────────────────
// La classe est une chaîne, donc elle ne peut pas porter ses règles. Le registre
// les tient à sa place — c'est aussi lui que lira le plugin de build pour émettre
// le CSS et le dump destiné au graphe.

export interface RegisteredClass {
  readonly className: string;
  readonly items: readonly SheetItem[];
  readonly axes: Readonly<Record<string, readonly string[]>>;
  readonly unproven: readonly string[];
}

const registry = new Map<string, RegisteredClass>();

export const registeredClasses = (): readonly RegisteredClass[] => [
  ...registry.values(),
];

function collect(
  items: readonly SheetItem[],
  axes: Map<string, Set<string>>,
  unproven: string[],
): void {
  for (const item of items) {
    if (Array.isArray(item)) {
      collect(item as readonly SheetItem[], axes, unproven);
    } else if ((item as Conditional<AnyAxisPoint, []>).kind === 'when') {
      const conditional = item as Conditional<AnyAxisPoint, readonly SheetItem[]>;
      const points = axes.get(conditional.at.axis) ?? new Set<string>();
      points.add(conditional.at.point);
      axes.set(conditional.at.axis, points);
      collect(conditional.items, axes, unproven);
    } else if ((item as Declaration).property !== undefined) {
      const declaration = item as Declaration;
      if (declaration.unproven) unproven.push(declaration.unproven);
    }
  }
}

export function craftStyles<const Sheet extends StyleSheet>(
  prefix: string,
  sheet: Sheet,
): CraftStyles<Sheet> {
  const classes = Object.entries(sheet).map(([key, items]) => {
    const className = `${prefix}-${key}`;
    if (registry.has(className)) {
      throw new Error(
        `craftStyles: la classe '${className}' est déjà déclarée. Deux feuilles partagent le préfixe '${prefix}'.`,
      );
    }
    const axes = new Map<string, Set<string>>();
    const unproven: string[] = [];
    collect(items, axes, unproven);
    registry.set(className, {
      className,
      items,
      axes: Object.fromEntries(
        [...axes].map(([axis, points]) => [axis, [...points].sort()]),
      ),
      unproven,
    });
    return [key, className] as const;
  });

  return Object.fromEntries(classes) as CraftStyles<Sheet>;
}

// ─── matrice de scénarios ───────────────────────────────────────────────────

export interface VisualScenario {
  /** `base|dark|md` — trié, stable, sert de nom de baseline. */
  readonly id: string;
  readonly axes: Readonly<Record<string, string>>;
}

/**
 * Produit cartésien **complet**. Aucune réduction « intelligente » ici : une
 * couverture qui se déclare complète sans l'être est pire que pas de couverture.
 * La seule réduction déjà acquise est en amont — seuls les points réellement
 * utilisés sont dans le contrat.
 *
 * `base` est implicite sur chaque axe, d'où le `1 +` : deux axes à un point
 * chacun font quatre scénarios, pas un.
 */
export function scenarios(...classNames: readonly string[]): VisualScenario[] {
  const axes = new Map<string, Set<string>>();
  for (const className of classNames) {
    const registered = registry.get(className);
    if (!registered) continue;
    for (const [axis, points] of Object.entries(registered.axes)) {
      const known = axes.get(axis) ?? new Set<string>();
      points.forEach((point) => known.add(point));
      axes.set(axis, known);
    }
  }

  const ordered = [...axes].sort(([left], [right]) => left.localeCompare(right));
  let combinations: Record<string, string>[] = [{}];
  for (const [axis, points] of ordered) {
    const values = ['base', ...[...points].sort()];
    combinations = combinations.flatMap((combination) =>
      values.map((value) => ({ ...combination, [axis]: value })),
    );
  }

  return combinations.map((combination) => ({
    id: ordered.map(([axis]) => combination[axis]).join('|') || 'base',
    axes: combination,
  }));
}

// ─── scellage ───────────────────────────────────────────────────────────────

/**
 * Le message d'erreur **est** l'API ici.
 *
 * Il doit dire *où* déclarer, pourquoi pas ailleurs, et nommer le demandeur.
 * Verbeux pour un humain qui connaît déjà la réponse ; exactement ce qu'il faut
 * pour un agent qui, sans ça, ira poser un `overflow` au hasard sur le parent
 * le plus proche — c'est-à-dire créera le bug suivant.
 *
 * Le message est la **clé** et non la valeur, contrairement aux
 * `ERROR_…` du reste du dépôt. C'est ce qui le fait sortir en tête du
 * `Property '…' is missing`, au lieu d'être enterré sous l'impression du type
 * de nœud. Il reste que tsc imprime le nœud complet avant : le texte est bon,
 * le cadre est bruyant, et c'est une limite de la forme « intersection », pas
 * du message.
 */
export type ContextError<Message extends string> = {
  readonly [Key in Message]: never;
};

/**
 * Le paramètre nu `Payload` n'est pas une coquetterie : un conditionnel ne
 * distribue que sur un paramètre nu. Écrit directement sur
 * `ChannelsOf<Node>['obligations']`, le test ne distribue pas, et `never extends
 * Obligation<infer Id>` est **vrai** — `Id` retombe alors sur sa contrainte et
 * vaut `string`. Résultat : un arbre sans aucune obligation ouverte échoue au
 * scellage, avec un message qui parle d'une obligation nommée `string`.
 */
type IdOf<Payload> = Payload extends Obligation<infer Id extends string>
  ? Id
  : never;

type UndischargedIds<Node> = IdOf<ChannelsOf<Node>['obligations']>;

export type SealCheck<Node> = [UndischargedIds<Node>] extends [never]
  ? unknown
  : ContextError<`'${UndischargedIds<Node>}' est exigee par une classe de ce sous-arbre et personne ne la fournit. Ajoutez provides(${UndischargedIds<Node>}) sur le composant de layout qui possede la zone concernee — pas sur le parent direct, ou l'effet CSS creerait un second contexte et deplacerait le bug au lieu de le corriger.`>;

/**
 * Ferme un arbre : à partir d'ici, plus personne au-dessus ne répondra.
 *
 * C'est le seul endroit où l'obligation devient une erreur — jusque-là elle
 * voyage, parce qu'un ancêtre a encore le droit d'y répondre. Dans le système
 * complet, ce contrôle vit sur `craftComponent(..., { seals: [...] })` ; ici
 * c'est une fonction, pour que l'exemple tienne en un fichier.
 */
export function seal<const Node>(node: Node & SealCheck<Node>): Node {
  return node as Node;
}
