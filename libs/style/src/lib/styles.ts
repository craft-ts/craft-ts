/**
 * `craftStyles`: a sheet whose **variant contract** is inferred, not declared,
 * and whose CSS is atomic and deduplicated.
 *
 * Two properties make the rest of the system possible:
 *
 * - Only the breakpoints **actually used** enter the contract. An axis that
 *   defines six points but which a component crosses at one does not produce
 *   six scenarios; it produces two (`base` and that one).
 * - A declaration under a condition is one **atomic class**, shared by every
 *   sheet that writes it. Output then grows with the vocabulary, not with the
 *   number of components — which is what keeps the emitted stylesheet flat as
 *   the app grows.
 *
 * Conjunction is nesting and nothing else — `when(a, [when(b, […])])`. A second
 * spelling would mean two identical components could produce two different
 * contracts.
 */
import type {
  ChannelsOf,
  CraftChannels,
  CraftChannelsCarrier,
  MergeChannelUnion,
} from '@craft-ts/core';
import type { AnyAxisPoint, AxisPoint, WritesSyntaxOf } from './axes/index.ts';
import type { VarWrite } from './css-vars.ts';
import type { Declaration } from './props/factory.ts';
import type {
  Obligation,
  ObligationEntry,
  ObligationSpec,
} from './obligations.ts';

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

/**
 * What an axis is allowed to contain.
 *
 * An unconstrained axis takes anything a sheet takes. An axis declared with
 * `writes: onlyVarsOfKind(kind.color)` takes **only** writes of that kind —
 * no properties, and no nesting, because an axis that may only repaint has
 * nothing to conjoin with. That constraint is what makes such an axis provably
 * orthogonal to the axes that move boxes, without analysing any CSS.
 */
export type AllowedItems<Point> = [WritesSyntaxOf<Point>] extends [never]
  ? readonly SheetItem[]
  : readonly VarWrite<WritesSyntaxOf<Point>>[];

/** Applies declarations under a condition. Nestable, and nothing else. */
export function when<
  const Point extends AnyAxisPoint,
  const Items extends readonly SheetItem[],
>(
  at: Point,
  // The constraint is intersected on the parameter rather than placed on the
  // type parameter: as a constraint it is resolved while `Point` is still being
  // inferred, so `AllowedItems<Point>` falls back to the unconstrained branch
  // and checks nothing. On the parameter it is checked once `Point` is known.
  items: Items & AllowedItems<Point>,
): Conditional<Point, Items> {
  assertLive(at, items as readonly SheetItem[]);
  return { kind: 'when', at, items };
}

/**
 * An intersection that no viewport can satisfy is a rule that will never apply.
 *
 * `when(above(bp.lg), [when(below(bp.sm), […])])` asks for "at least lg and
 * under sm" — dead CSS that no test will ever catch, because there is nothing
 * to see. It throws at sheet registration, which under the build plugin is a
 * build failure: the plugin imports every `*.style.ts` in Node before emitting.
 *
 * The check is a runtime one rather than a type-level one because comparing two
 * breakpoint positions in the type system needs their order as literals, and
 * `defineBreakpoints` cannot hand those back — object key order is not a tuple.
 */
function assertLive(at: AnyAxisPoint, items: readonly SheetItem[]): void {
  if (at.order === undefined) return;
  for (const item of items) {
    if (!isConditional(item)) continue;
    const inner = item.at;
    if (inner.axis !== at.axis || inner.order === undefined) continue;
    const outerFloor = at.bound === 'above';
    const innerCeiling = inner.bound === 'below';
    if (outerFloor && innerCeiling && inner.order <= at.order) {
      throw new Error(
        `craftStyles: '${at.axis}' is asked for at least '${at.point}' and below '${inner.point}' at once, which no viewport satisfies. The rule inside would never apply; drop it, or widen one of the two bounds.`,
      );
    }
  }
}

// ─── contract inference ─────────────────────────────────────────────────────

type PointsIn<Item> =
  Item extends Conditional<infer Point, infer Items>
    ? Point | PointsIn<Items[number]>
    : Item extends readonly (infer Child)[]
      ? PointsIn<Child>
      : never;

/** axis → the points **actually** used. Never all the points of the axis. */
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
            readonly spec: {
              readonly id: infer Id extends string;
              readonly explain: infer Explain extends string;
            };
          }
        ? Obligation<Id, Explain>
        : never;

/**
 * The channel a class lays on the node carrying it. The core does not know what
 * it transports: to it, `Obligation<'scrollPort.block'>` is an opaque payload
 * that an `Exclude` cancels.
 */
export type ChannelsOfSheet<Item> = MergeChannelUnion<{
  readonly accumulate: never;
  readonly obligations: EntriesIn<Item, 'requires'>;
  readonly discharges: EntriesIn<Item, 'provides'>;
  readonly violates: EntriesIn<Item, 'violates'>;
}>;

/**
 * A branded class. At runtime it is a string — the existing renderer sets it
 * as-is — but its type carries the variants it produces and the channel it
 * opens. What typing cannot prevent (writing `class: 'badge'` by hand) the
 * `no-raw-class` ESLint rule forbids: partial tightness buys 0 % of the
 * guarantee, not 90 %.
 */
export type CraftClass<
  Points extends AnyAxisPoint = never,
  Channels extends CraftChannels = never,
> = string &
  CraftChannelsCarrier<Channels> & {
    readonly [VARIANTS]?: Points;
  };

/** A class's contract, readable from outside — what the matrix unfolds. */
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

// ─── the atomic registry ────────────────────────────────────────────────────
// A class is a string, so it cannot carry its own rules. The registry holds
// them instead — and it is also what the build plugin reads to emit the CSS
// and the JSON dump the dependency graph consumes.

export interface AtomicRule {
  readonly className: string;
  /** Outer to inner, in nesting order. */
  readonly conditions: readonly AnyAxisPoint[];
  readonly property: string;
  readonly value: string;
  readonly unproven: string;
}

export interface RegisteredClass {
  /** `badge-root` — stable, human-readable, and the key the matrix uses. */
  readonly key: string;
  /** The space-separated atomic classes actually set on the element. */
  readonly className: string;
  readonly rules: readonly AtomicRule[];
  readonly axes: Readonly<Record<string, readonly string[]>>;
  readonly unproven: readonly string[];
  readonly requires: readonly string[];
  readonly provides: readonly string[];
  readonly violates: readonly string[];
  /**
   * Axes the sheet declared and never used. Not an error — a budget is an
   * upper bound — but it is dead weight a reader takes for a real variation,
   * so the graph reports it in wave 4.
   */
  readonly unusedAxes: readonly string[];
}

const classes = new Map<string, RegisteredClass>();
const atoms = new Map<string, AtomicRule>();
const byClassName = new Map<string, string>();

export const registeredClasses = (): readonly RegisteredClass[] => [
  ...classes.values(),
];

/** Every distinct atomic rule in the build — the unit of deduplication. */
export const registeredAtoms = (): readonly AtomicRule[] => [...atoms.values()];

/** From the rendered class string back to the sheet key, for the matrix. */
export const classKeyOf = (className: string): string | undefined =>
  byClassName.get(className);

/** Test-only: the registry is module state, and a spec must be able to reset it. */
export const resetStyleRegistry = (): void => {
  classes.clear();
  atoms.clear();
  byClassName.clear();
};

// ─── atomic class names ─────────────────────────────────────────────────────

const hash = (input: string): string => {
  let value = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    value ^= input.charCodeAt(index);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value.toString(36).padStart(6, '0').slice(-6);
};

const slugify = (text: string): string =>
  text
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 56);

/**
 * The name is readable **and** collision-proof: a slug so that the DOM says
 * what it applies, a hash of the full rule so two different rules cannot land
 * on the same name after slugging. Being a pure function of the rule is what
 * makes the name identical in the Node evaluation and in the browser — the
 * build and the runtime agree without sharing anything.
 */
const atomicName = (
  conditions: readonly AnyAxisPoint[],
  property: string,
  value: string,
): string => {
  const scope = conditions
    .map((point) => `${point.axis}:${point.point}`)
    .join('|');
  const identity = `${scope}{${property}:${value}}`;
  return `${slugify(`${scope}-${property}-${value}`)}-${hash(identity)}`;
};

// ─── sheet walking ──────────────────────────────────────────────────────────

interface Walked {
  readonly rules: AtomicRule[];
  readonly axes: Map<string, Set<string>>;
  readonly unproven: string[];
  readonly requires: string[];
  readonly provides: string[];
  readonly violates: string[];
}

const isDeclaration = (item: unknown): item is Declaration =>
  typeof item === 'object' &&
  item !== null &&
  typeof (item as Declaration).property === 'string' &&
  typeof (item as Declaration).value === 'string';

const isConditional = (
  item: unknown,
): item is Conditional<AnyAxisPoint, readonly SheetItem[]> =>
  typeof item === 'object' &&
  item !== null &&
  (item as { kind?: unknown }).kind === 'when';

const isObligation = (
  item: unknown,
): item is { readonly kind: string; readonly spec: ObligationSpec<string> } =>
  typeof item === 'object' &&
  item !== null &&
  typeof (item as { spec?: unknown }).spec === 'object';

function addRule(
  walked: Walked,
  conditions: readonly AnyAxisPoint[],
  declaration: Declaration,
): void {
  const className = atomicName(
    conditions,
    declaration.property,
    declaration.value,
  );
  const rule: AtomicRule = {
    className,
    conditions,
    property: declaration.property,
    value: declaration.value,
    unproven: declaration.unproven,
  };
  // Deduplication happens here, not in the emitter: two sheets writing
  // `padding: 1rem` under the same condition converge on the same atom.
  if (!atoms.has(className)) atoms.set(className, rule);
  walked.rules.push(rule);
  if (declaration.unproven) walked.unproven.push(declaration.unproven);
}

function walk(
  items: readonly SheetItem[],
  conditions: readonly AnyAxisPoint[],
  walked: Walked,
): void {
  for (const item of items) {
    if (Array.isArray(item)) {
      walk(item as readonly SheetItem[], conditions, walked);
      continue;
    }
    if (isConditional(item)) {
      const points = walked.axes.get(item.at.axis) ?? new Set<string>();
      points.add(item.at.point);
      walked.axes.set(item.at.axis, points);
      walk(item.items, [...conditions, item.at], walked);
      continue;
    }
    if (isDeclaration(item)) {
      addRule(walked, conditions, item);
      continue;
    }
    if (isObligation(item)) {
      const entry = item as {
        readonly kind: string;
        readonly spec: ObligationSpec<string>;
      };
      if (entry.kind === 'requires') walked.requires.push(entry.spec.id);
      if (entry.kind === 'violates') walked.violates.push(entry.spec.id);
      if (entry.kind === 'provides') {
        walked.provides.push(entry.spec.id);
        // The discharge and its CSS effect are inseparable: claiming to
        // provide a scroll port without laying down the overflow would be a
        // lie the type system could not catch.
        for (const declaration of entry.spec.effect) {
          addRule(walked, conditions, declaration);
        }
      }
    }
  }
}

/**
 * A budget of axes, declared by the sheet that spends it.
 *
 * Without it a component can multiply the matrix of every page that composes
 * it, and nobody decided that: an axis added deep in a leaf shows up as a
 * doubled capture bill three levels up. Declaring the axes makes the cost a
 * choice rather than a consequence.
 *
 * The plan puts the budget on `craftComponent(..., { axes })`. It lives on the
 * sheet here for the same reason the matrix takes sheets rather than
 * components: a component's classes are only knowable by rendering it, and a
 * budget that silently missed a child's sheet would read as a guarantee while
 * being none.
 */
export type AxisSet = Readonly<Record<string, AnyAxisPoint>>;

/**
 * Distributes over the union of declared sets on purpose.
 *
 * `Budget[number]` is a union, and `keyof` a union is the keys the members
 * share — none, for two different axes. Read without distributing, a budget of
 * two axes therefore declares nothing at all, and every sheet using it reports
 * every axis as out of budget. The naked parameter is what makes it distribute.
 */
type AxesOfSet<Set> = Set extends AxisSet ? Set[keyof Set]['axis'] : never;

export type DeclaredAxes<Budget extends readonly AxisSet[]> = AxesOfSet<
  Budget[number]
>;

/** The axes a sheet actually varies on, read off its declaration. */
export type PointsUsedIn<Sheet extends StyleSheet> = PointsIn<
  Sheet[keyof Sheet][number]
>['axis'];

export type WithinBudget<
  Sheet extends StyleSheet,
  Budget extends readonly AxisSet[],
> = [Budget] extends [never]
  ? // No budget declared: the sheet is unbudgeted, and nothing is checked.
    // `axes: []` is not the same thing — that declares a budget of nothing,
    // and any axis the sheet uses is then out of it.
    unknown
  : [Exclude<PointsUsedIn<Sheet>, DeclaredAxes<Budget>>] extends [never]
    ? unknown
    : {
        readonly [Axis in Exclude<
          PointsUsedIn<Sheet>,
          DeclaredAxes<Budget>
        > as `ERROR_axis_${Axis}_is_not_in_this_sheet_s_budget`]: 'Add it to the axes option, or stop varying on it. Every axis a sheet uses multiplies the visual matrix of every page that composes it.';
      };

export interface StyleSheetOptions<Budget extends readonly AxisSet[]> {
  /** The axes this sheet is allowed to vary on. */
  readonly axes?: Budget;
}

export function craftStyles<
  const Sheet extends StyleSheet,
  const Budget extends readonly AxisSet[] = never,
>(
  prefix: string,
  sheet: Sheet,
  // The budget check rides on the **third** parameter, not the second: on the
  // sheet it would be evaluated while `Budget` is still being inferred from
  // `options`, and would check nothing. Same inference-order trap as the axis
  // write constraint, and the same fix — check where both are known.
  options: StyleSheetOptions<Budget> &
    WithinBudget<Sheet, Budget> = {} as never,
): CraftStyles<Sheet> {
  const budget = options.axes
    ? new Set(
        options.axes.flatMap((set) =>
          Object.values(set).map((point) => point.axis),
        ),
      )
    : undefined;
  const entries = Object.entries(sheet).map(([key, items]) => {
    const classKey = `${prefix}-${key}`;
    if (classes.has(classKey)) {
      throw new Error(
        `craftStyles: class '${classKey}' is already declared. Two sheets share the prefix '${prefix}'.`,
      );
    }
    const walked: Walked = {
      rules: [],
      axes: new Map(),
      unproven: [],
      requires: [],
      provides: [],
      violates: [],
    };
    walk(items, [], walked);

    // Within one class, a later declaration replaces an earlier one for the
    // same property under the same conditions. Keeping both would leave the
    // winner to stylesheet order — which is alphabetical here, so `font(text.xs)`
    // followed by `lineHeight(num(1))` would silently resolve the wrong way.
    // Cascade order inside a sheet must be the order that was written.
    const kept = new Map<string, AtomicRule>();
    for (const rule of walked.rules) {
      const scope = rule.conditions
        .map((point) => `${point.axis}:${point.point}`)
        .join('|');
      kept.set(`${scope}|${rule.property}`, rule);
    }
    const rules = [...kept.values()];
    if (budget) {
      for (const axis of walked.axes.keys()) {
        if (!budget.has(axis)) {
          throw new Error(
            `craftStyles: '${classKey}' varies on the axis '${axis}', which is not in its budget. Every axis a sheet uses multiplies the visual matrix of every page that composes it, so the cost has to be a decision: add '${axis}' to the axes option, or stop varying on it.`,
          );
        }
      }
    }

    const className = rules.map((rule) => rule.className).join(' ');
    classes.set(classKey, {
      key: classKey,
      className,
      rules,
      axes: Object.fromEntries(
        [...walked.axes].map(([axis, points]) => [axis, [...points].sort()]),
      ),
      unproven: walked.unproven,
      requires: walked.requires,
      provides: walked.provides,
      violates: walked.violates,
      unusedAxes: budget
        ? [...budget].filter((axis) => !walked.axes.has(axis)).sort()
        : [],
    });
    byClassName.set(className, classKey);
    return [key, className] as const;
  });

  return Object.fromEntries(entries) as CraftStyles<Sheet>;
}

// ─── scenario matrix ────────────────────────────────────────────────────────

export interface VisualScenario {
  /** `base|dark|md` — sorted, stable, and the name of the baseline. */
  readonly id: string;
  readonly axes: Readonly<Record<string, string>>;
}

/**
 * The **full** cartesian product. No clever reduction here: a coverage that
 * claims to be complete without being complete is worse than no coverage. The
 * one reduction already banked happens upstream — only the points actually
 * used are in the contract.
 *
 * `base` is implicit on every axis, hence the extra value: two axes with one
 * point each make four scenarios, not one.
 */
export function scenarios(...keys: readonly string[]): VisualScenario[] {
  const axes = new Map<string, Set<string>>();
  for (const key of keys) {
    const registered = classes.get(key) ?? classes.get(classKeyOf(key) ?? '');
    if (!registered) continue;
    for (const [axis, points] of Object.entries(registered.axes)) {
      const known = axes.get(axis) ?? new Set<string>();
      points.forEach((point) => known.add(point));
      axes.set(axis, known);
    }
  }

  const ordered = [...axes].sort(([left], [right]) =>
    left.localeCompare(right),
  );
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

// ─── sealing ────────────────────────────────────────────────────────────────

/**
 * The error message **is** the API here.
 *
 * It has to say *where* to declare, why not elsewhere, and name the requester.
 * Verbose for a human who already knows the answer; exactly right for an agent
 * that would otherwise drop an `overflow` on the nearest parent — which is to
 * say, write the next bug.
 *
 * The message is the **key** rather than the value, unlike the `ERROR_…`
 * markers elsewhere in the repo. That is what makes it come out at the head of
 * `Property '…' is missing` instead of being buried under the printed node type.
 */
export type ContextError<Message extends string> = {
  readonly [Key in Message]: never;
};

/**
 * The bare parameter `Payload` is not a flourish: a conditional distributes
 * only over a bare parameter. Written straight onto
 * `ChannelsOf<Node>['obligations']`, the test does not distribute, and
 * `never extends Obligation<infer Id>` is **true** — `Id` then falls back to its
 * constraint and is `string`. A tree with no open obligation would fail to
 * seal, complaining about an obligation named `string`.
 */
type IdOf<Payload> =
  Payload extends Obligation<infer Id extends string> ? Id : never;

type UndischargedIds<Node> = IdOf<ChannelsOf<Node>['obligations']>;

export type SealCheck<Node> = [UndischargedIds<Node>] extends [never]
  ? unknown
  : ContextError<`'${UndischargedIds<Node>}' is required by a class in this subtree and nobody provides it. Add provides(${UndischargedIds<Node>}) on the layout component that owns the area — not on the direct parent, where the CSS effect would create a second context and move the bug instead of fixing it.`>;

/**
 * Closes a tree: from here up, nobody else will answer.
 *
 * This is the only place an obligation becomes an error — until then it
 * travels, because an ancestor still has the right to answer it.
 */
export function seal<const Node>(node: Node & SealCheck<Node>): Node {
  return node as Node;
}
