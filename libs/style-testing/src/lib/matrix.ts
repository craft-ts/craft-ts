/**
 * The visual matrix: every way a component can look, enumerated.
 *
 * It is computed **at runtime**, from the metadata the style values already
 * carry. Types only check the cardinal and the identifiers (see
 * `exhaustive.ts`) — materialising the cartesian product in the type system is
 * how you meet TS2589.
 *
 * The product is **complete**. The one reduction already banked happens
 * upstream, in the sheet: only the points a class actually crosses are in its
 * contract, so an axis with six breakpoints that a component cuts at one
 * contributes two cells, not seven. No further reduction is applied here — a
 * coverage that claims to be complete without being complete is worse than no
 * coverage at all.
 */
import {
  classKeyOf,
  registeredClasses,
  type AnyAxisPoint,
  type RegisteredClass,
} from '@craft-ts/style';

export interface ScenarioDriver {
  readonly axis: string;
  readonly point: string;
  readonly driver: AnyAxisPoint['driver'];
}

export interface VisualScenario {
  /**
   * `scheme=dark+viewport=md` — sorted, and stable under the addition of an
   * unrelated axis.
   *
   * Only the axes away from `base` appear. An identifier that listed every axis
   * would change the moment someone adds one somewhere else in the app, and
   * every baseline in the suite would be invalidated by a change that affects
   * none of them.
   */
  readonly id: string;
  readonly axes: Readonly<Record<string, string>>;
  readonly drivers: readonly ScenarioDriver[];
  /** Set when a content case was crossed in — see `contentCases`. */
  readonly content?: string;
}

/** What `craftStyles` returns: a record of branded class strings. */
export type StyleSheetClasses = Readonly<Record<string, string>>;

export interface MatrixOptions {
  /**
   * Container axes resolved by the component itself.
   *
   * A container axis answers "how wide is my box", which nobody above the
   * container can change. Naming the container here closes the axis at this
   * component instead of handing it to every ancestor.
   */
  readonly resolves?: readonly string[];
  /**
   * Axis points the component's own structure makes unreachable — a scroll
   * state under a `scrollPort.none`, for instance. Pruned rather than captured.
   */
  readonly unreachable?: readonly string[];
}

const BASE = 'base';

const keysOf = (input: MatrixInput): readonly string[] => {
  if (typeof input === 'string') return [classKeyOf(input) ?? input];
  if (Array.isArray(input)) return input.flatMap((entry) => keysOf(entry));
  if (isBranch(input)) return [];
  return Object.values(input as StyleSheetClasses).flatMap(
    (className) => classKeyOf(className) ?? [],
  );
};

const branchesOf = (input: MatrixInput): readonly Branch[] => {
  if (Array.isArray(input)) return input.flatMap((entry) => branchesOf(entry));
  return isBranch(input) ? [input] : [];
};

declare const BRANCH: unique symbol;

/**
 * Two sets of sheets that are never on screen at the same time.
 *
 * An `ifBlock` renders one side or the other, so the states of the two branches
 * **add up** — they do not multiply. Told nothing, the matrix would cross a
 * footer's three tones with a header's two breakpoints and ask for six captures
 * of pages that cannot exist.
 *
 * This is the single highest-leverage reduction in the whole system, and the
 * only one that is exactly true rather than probably true: the branches are
 * mutually exclusive by construction, not by analysis.
 *
 * The plan infers it from the `ifBlock` node's own type. It is declared here,
 * for the same reason the matrix takes sheets rather than components — and the
 * cost of that choice is stated plainly: a branch nobody declares is counted as
 * co-present, which over-captures rather than under-captures.
 */
export interface Branch {
  readonly [BRANCH]: true;
  readonly name: string;
  readonly whenTrue: MatrixInput;
  readonly whenFalse: MatrixInput;
}

export const branch = (
  name: string,
  whenTrue: MatrixInput,
  whenFalse: MatrixInput = [],
): Branch => ({ name, whenTrue, whenFalse }) as Branch;

const isBranch = (input: MatrixInput | Branch): input is Branch =>
  typeof input === 'object' && input !== null && 'whenTrue' in input;

export type MatrixInput =
  | string
  | StyleSheetClasses
  | Branch
  | readonly MatrixInput[];

const pointsByAxis = (
  classes: readonly RegisteredClass[],
): Map<string, Set<string>> => {
  const axes = new Map<string, Set<string>>();
  for (const registered of classes) {
    for (const [axis, points] of Object.entries(registered.axes)) {
      const known = axes.get(axis) ?? new Set<string>();
      points.forEach((point) => known.add(point));
      axes.set(axis, known);
    }
  }
  return axes;
};

const driverIndex = (
  classes: readonly RegisteredClass[],
): Map<string, AnyAxisPoint> => {
  const index = new Map<string, AnyAxisPoint>();
  for (const registered of classes) {
    for (const rule of registered.rules) {
      for (const point of rule.conditions) {
        index.set(`${point.axis}:${point.point}`, point);
      }
    }
  }
  return index;
};

/**
 * Every visual state of the given sheets.
 *
 * Takes what a component actually uses: one sheet, several, or the class
 * strings themselves. There is deliberately no `visualMatrix(Component)` — a
 * component's classes are only knowable by rendering it, and a matrix that
 * silently missed a child's sheet would be the worst possible outcome. Naming
 * the sheets is explicit and checkable.
 */
export function visualMatrix(
  input: MatrixInput,
  options: MatrixOptions = {},
): readonly VisualScenario[] {
  const branches = branchesOf(input);
  if (branches.length) {
    // Each branch is a sum, not a factor: the shared sheets are crossed with
    // *one* side at a time, and the two sides are concatenated. Nesting two
    // branches therefore gives a sum of sums, which is what keeps an if-block
    // from doubling the bill of everything above it.
    const [first, ...rest] = branches;
    // Every branch is stripped from the shared part, then `rest` is put back
    // once. Stripping only `first` would leave the others in twice — inside
    // the shared input and in `rest` — and the count would explode instead of
    // shrinking.
    const shared = stripBranches(input);
    return [
      ...visualMatrix([shared, first.whenTrue, ...rest], options).map(
        (scenario) => tagBranch(scenario, first.name, true),
      ),
      ...visualMatrix([shared, first.whenFalse, ...rest], options).map(
        (scenario) => tagBranch(scenario, first.name, false),
      ),
    ];
  }
  return unfold(input, options);
}

const stripBranches = (input: MatrixInput): MatrixInput => {
  if (Array.isArray(input)) return input.map(stripBranches);
  return isBranch(input) ? [] : input;
};

const tagBranch = (
  scenario: VisualScenario,
  name: string,
  taken: boolean,
): VisualScenario => {
  const axes = { ...scenario.axes, [name]: taken ? 'true' : 'false' };
  return { ...scenario, axes, id: identify(axes, scenario.content) };
};

function unfold(
  input: MatrixInput,
  options: MatrixOptions,
): readonly VisualScenario[] {
  const wanted = new Set(keysOf(input));
  const classes = registeredClasses().filter((registered) =>
    wanted.has(registered.key),
  );
  const points = driverIndex(classes);
  const unreachable = new Set(options.unreachable ?? []);

  const resolves = new Set(options.resolves ?? []);
  const axes = [...pointsByAxis(classes)]
    .filter(([axis]) => !unreachable.has(axis))
    // A container axis belongs to the component that declares the container,
    // and to nobody above it: an ancestor cannot change how wide that box is,
    // so handing it those scenarios would ask for captures it cannot affect.
    // Naming the container is how a component claims the axis; every other
    // caller drops it.
    .filter(
      ([axis]) =>
        !axis.startsWith('container.') ||
        resolves.has(axis.slice('container.'.length)),
    )
    .sort(([left], [right]) => left.localeCompare(right));

  let combinations: Record<string, string>[] = [{}];
  for (const [axis, used] of axes) {
    const values = [
      BASE,
      ...[...used]
        .filter((point) => !unreachable.has(`${axis}:${point}`))
        .sort(),
    ];
    combinations = combinations.flatMap((combination) =>
      values.map((value) => ({ ...combination, [axis]: value })),
    );
  }

  return combinations.map((combination) => ({
    id: identify(combination),
    axes: combination,
    drivers: Object.entries(combination)
      .filter(([, point]) => point !== BASE)
      .sort(([left], [right]) => left.localeCompare(right))
      .flatMap(([axis, point]) => {
        const known = points.get(`${axis}:${point}`);
        if (!known) {
          throw new Error(
            `visualMatrix: '${axis}: ${point}' has no driver, so nothing can put a page in that state. An axis whose points cannot be reached would add captures that all look the same — false coverage. Give the axis a driver, or do not use it.`,
          );
        }
        return [{ axis, point, driver: known.driver }];
      }),
  }));
}

export function identify(
  axes: Readonly<Record<string, string>>,
  content?: string,
): string {
  const parts = Object.entries(axes)
    .filter(([, point]) => point !== BASE)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([axis, point]) => `${axis}=${point}`);
  const id = parts.length ? parts.join('+') : BASE;
  return content ? `${id}#${content}` : id;
}

/**
 * Data cases, crossed into the matrix.
 *
 * The matrix covers *conditions*, not *data* — and the eighty-character title,
 * the empty list and the seven-figure price are what break layouts most often.
 * No type can derive them, so they are declared.
 *
 * The crossing rule: a content case is rendered at **one** point of each axis,
 * except on the axes that change the space available — viewport and container —
 * where the crossing is complete. A long title behaves differently at two
 * widths; it does not behave differently in two colour schemes.
 */
export function contentCases(
  scenarios: readonly VisualScenario[],
  cases: Readonly<Record<string, unknown>>,
): readonly VisualScenario[] {
  const names = Object.keys(cases);
  if (names.length === 0) return scenarios;

  const spatial = (scenario: VisualScenario) =>
    Object.entries(scenario.axes).some(
      ([axis, point]) =>
        point !== BASE &&
        (axis === 'viewport' || axis.startsWith('container.')),
    );

  return scenarios.flatMap((scenario) => {
    const relevant =
      spatial(scenario) ||
      Object.values(scenario.axes).every((point) => point === BASE);
    const applicable = relevant ? names : [];
    return [
      scenario,
      ...applicable.map((name) => ({
        ...scenario,
        id: identify(scenario.axes, name),
        content: name,
      })),
    ];
  });
}
