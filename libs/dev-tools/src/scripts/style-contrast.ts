/**
 * Text contrast, proven from the graph and the style dump. No browser.
 *
 * The claim this module makes is narrow and it is worth stating before the
 * code: for every element the graph can prove holds text, in every scenario
 * the sheets can produce, it resolves the foreground and the background the
 * way the emitted CSS would, computes the WCAG ratio, and compares it against
 * the threshold the text's size earns. Everything it cannot resolve comes back
 * as `indeterminate` with a reason — never as a pass.
 *
 * Three design decisions carry the file.
 *
 * **The graph decides which pairs exist, the palette does not.** A palette of
 * twenty colours has four hundred pairs and an application uses perhaps thirty
 * of them. Failing the other three hundred and seventy would be noise, and
 * chasing them is how a contrast rule gets switched off. `paletteContrastMatrix`
 * in `style-report.ts` still lists them, informatively; this module reports on
 * pairs a text element can actually be rendered in.
 *
 * **The cascade is replayed, not approximated.** Atoms are partitioned into the
 * `components` layer and the `variants` layer exactly as `renderCss` writes
 * them, and ties inside the variants layer are broken by atomic class name —
 * because that is the order the emitter sorts them in, and therefore the order
 * the browser resolves them in. Modelling it as "sheet order wins" would be
 * tidier and would disagree with the stylesheet whenever two axes write the
 * same variable, which is the exact case a tone-plus-hover button is.
 *
 * **A missing proof is a result.** There is no branch here that falls back to
 * "assume white". A background nobody paints, a colour behind a gradient, a
 * component rendered from nowhere the graph can see — each has its own reason
 * and its own line in the report.
 */
import {
  contrastRatioOf,
  formatRatio,
  meetsContrast,
  parseCssColor,
  textContrastRequirement,
  type Rgb,
} from './contrast.ts';
import type { DependencyGraph } from './dependency-graph.ts';
import {
  provenanceName,
  type StyleDump,
  type StyleDumpAtom,
  type StyleDumpProvenance,
} from './style-graph.ts';

/* ------------------------------------------------------------------------ *
 * The result model
 * ------------------------------------------------------------------------ */

export type ContrastScenario = Readonly<{
  /** `scheme=dark+tone=warning`, sorted by axis. `base` when nothing varies. */
  id: string;
  axes: Readonly<Record<string, string>>;
}>;

export interface ContrastSource {
  /** The CSS value that ended up applying. */
  readonly value: string;
  /**
   * How it got there — `dsButton-root → --dsButton-bg → ui.accent.warning`.
   *
   * The chain and not just the token: a reader who is told the background is
   * `ui.accent.warning` still has to find out which of the six rules put it
   * there before they can change it.
   */
  readonly source: string;
  /** Set when the value came from a named palette token. */
  readonly token?: string;
}

export type ResolvedTextContrast = Readonly<{
  kind: 'resolved';
  route?: string;
  component: string;
  element: string;
  scenario: ContrastScenario;
  /** Other scenarios that resolve to exactly this result. See `dedupe`. */
  equivalentScenarios: readonly string[];
  foreground: ContrastSource;
  background: ContrastSource;
  fontSizePx: number;
  fontWeight: number;
  textScale: 'normal' | 'large';
  ratio: number;
  required: 3 | 4.5;
  verdict: 'pass' | 'fail';
}>;

export type IndeterminateReason =
  | 'unknown-foreground'
  | 'unknown-background'
  | 'unknown-font-size'
  | 'unsupported-background'
  | 'dynamic-style'
  | 'external-style'
  | 'incomplete-render-context';

export type IndeterminateTextContrast = Readonly<{
  kind: 'indeterminate';
  route?: string;
  component: string;
  element: string;
  scenario: ContrastScenario;
  equivalentScenarios: readonly string[];
  reason: IndeterminateReason;
  detail: string;
}>;

export type TextContrastResult =
  | ResolvedTextContrast
  | IndeterminateTextContrast;

export interface TextContrastOptions {
  /**
   * The root font size, in CSS pixels.
   *
   * A `rem` has to become a number somewhere, and the number is a property of
   * the page, not of the sheets. 16 is the UA default; a project that changes
   * it on `:root` from outside the model has to say so here, because nothing
   * in the dump can know.
   */
  readonly rootFontSizePx?: number;
  /** What the page starts at, before any sheet sets a size. */
  readonly inheritedFontSizePx?: number;
  readonly inheritedFontWeight?: number;
  /**
   * Ceiling on the render contexts explored per component.
   *
   * A leaf used in thirty places under three ancestors each is a product, and
   * an unbounded product is a report nobody reads. Exceeding it is reported as
   * `incomplete-render-context` rather than silently truncated.
   */
  readonly maxRenderContexts?: number;
  /** Ceiling on the scenarios enumerated per element, same reasoning. */
  readonly maxScenarios?: number;
}

const DEFAULTS = {
  rootFontSizePx: 16,
  inheritedFontSizePx: 16,
  inheritedFontWeight: 400,
  maxRenderContexts: 16,
  maxScenarios: 256,
} as const;

/* ------------------------------------------------------------------------ *
 * What the resolver reads
 * ------------------------------------------------------------------------ */

/**
 * The properties a scenario has to be enumerated for.
 *
 * An axis that only moves a box cannot change a ratio, and crossing it in
 * would multiply the report by a number of identical rows. `opacity` is in the
 * list not because it is resolved but because it *invalidates* a resolution:
 * an axis that fades an element changes what its text is composited against,
 * and a scenario where that happens must be reported rather than skipped.
 */
const COLOUR_PROPERTIES = new Set([
  'color',
  'background-color',
  'background',
  'background-image',
  'font-size',
  'font-weight',
  'opacity',
]);

const VAR_REFERENCE = /^var\(\s*(--[A-Za-z0-9_-]+)\s*(?:,([\s\S]*))?\)$/;
const VAR_ANYWHERE = /var\(\s*--[A-Za-z0-9_-]+/;

interface ElementInfo {
  readonly id: string;
  readonly label: string;
  readonly componentId: string;
  readonly component: string;
  readonly classKeys: readonly string[];
  readonly mayContainText: boolean;
  readonly branch: string;
  readonly unresolvedClass?: string;
  parentId?: string;
}

interface Model {
  readonly elements: ReadonlyMap<string, ElementInfo>;
  /** component node id → the elements it renders at its top level. */
  readonly componentRoots: ReadonlyMap<string, readonly string[]>;
  /** component node id → the elements that render it. */
  readonly renderSites: ReadonlyMap<string, readonly string[]>;
  readonly componentLabel: ReadonlyMap<string, string>;
  readonly routeOfComponent: ReadonlyMap<string, string>;
  readonly atomsByClass: ReadonlyMap<string, readonly StyleDumpAtom[]>;
  readonly atomByName: ReadonlyMap<string, StyleDumpAtom>;
  readonly vars: ReadonlyMap<
    string,
    { readonly initialValue: string; readonly inherits: boolean; readonly initialProvenance?: StyleDumpProvenance }
  >;
}

const readString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const readStrings = (value: unknown): readonly string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];

function buildModel(graph: DependencyGraph, dump: StyleDump): Model {
  const elements = new Map<string, ElementInfo>();
  const componentLabel = new Map<string, string>();
  for (const node of graph.nodes) {
    if (node.kind === 'component') componentLabel.set(node.id, node.label);
    if (node.kind !== 'styled-element') continue;
    elements.set(node.id, {
      id: node.id,
      label: node.label,
      componentId: readString(node.details?.['componentId']) ?? '',
      component: readString(node.details?.['component']) ?? '',
      classKeys: readStrings(node.details?.['classKeys']),
      mayContainText: node.details?.['mayContainText'] === true,
      branch: readString(node.details?.['branch']) ?? '',
      unresolvedClass: readString(node.details?.['unresolvedClass']),
    });
  }

  const componentRoots = new Map<string, string[]>();
  const renderSites = new Map<string, string[]>();
  const kindOf = new Map(graph.nodes.map((node) => [node.id, node.kind]));
  for (const edge of graph.edges) {
    if (edge.kind === 'contains' && elements.has(edge.to)) {
      if (elements.has(edge.from)) {
        const child = elements.get(edge.to);
        if (child) child.parentId = edge.from;
      } else if (kindOf.get(edge.from) === 'component') {
        const roots = componentRoots.get(edge.from) ?? [];
        roots.push(edge.to);
        componentRoots.set(edge.from, roots);
      }
    }
    if (
      edge.kind === 'renders' &&
      elements.has(edge.from) &&
      kindOf.get(edge.to) === 'component'
    ) {
      const sites = renderSites.get(edge.to) ?? [];
      sites.push(edge.from);
      renderSites.set(edge.to, sites);
    }
  }

  const atomByName = new Map(dump.atoms.map((atom) => [atom.className, atom]));
  const atomsByClass = new Map<string, readonly StyleDumpAtom[]>(
    dump.classes.map((registered) => [
      registered.key,
      registered.atoms.flatMap((name) => atomByName.get(name) ?? []),
    ]),
  );

  return {
    elements,
    componentRoots,
    renderSites,
    componentLabel,
    routeOfComponent: routesByComponent(graph),
    atomsByClass,
    atomByName,
    vars: new Map(
      dump.vars.map((declaration) => [
        declaration.name,
        {
          initialValue: declaration.initialValue,
          inherits: declaration.inherits,
          ...(declaration.initialProvenance
            ? { initialProvenance: declaration.initialProvenance }
            : {}),
        },
      ]),
    ),
  };
}

/**
 * The route a component is reachable from, when exactly one is.
 *
 * Two routes rendering the same component is the normal case for a shared
 * widget, and naming one of them would be worse than naming none — the reader
 * would go and look at a page where the component is fine. So the field stays
 * empty unless the answer is unambiguous.
 */
function routesByComponent(graph: DependencyGraph): Map<string, string> {
  const outgoing = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (edge.kind !== 'loads' && edge.kind !== 'renders') continue;
    const list = outgoing.get(edge.from) ?? [];
    list.push(edge.to);
    outgoing.set(edge.from, list);
  }
  const reached = new Map<string, Set<string>>();
  for (const node of graph.nodes) {
    if (node.kind !== 'route') continue;
    const seen = new Set<string>();
    const queue = [node.id];
    while (queue.length) {
      const current = queue.pop() as string;
      for (const next of outgoing.get(current) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
        const routes = reached.get(next) ?? new Set<string>();
        routes.add(node.label);
        reached.set(next, routes);
      }
    }
  }
  return new Map(
    [...reached]
      .filter(([, routes]) => routes.size === 1)
      .map(([componentId, routes]) => [componentId, [...routes][0] as string]),
  );
}

/* ------------------------------------------------------------------------ *
 * Render contexts
 * ------------------------------------------------------------------------ */

/**
 * An ancestor chain, outermost first, ending at the element under test.
 *
 * `rooted` says whether the chain reaches a component nobody renders — an
 * application shell. A chain that is not rooted and whose background walk runs
 * out is `incomplete-render-context`, which is a different problem from a
 * rooted chain where genuinely nobody paints: the first is a gap in the graph,
 * the second is a bug in the styles.
 */
interface RenderContext {
  readonly chain: readonly string[];
  readonly rooted: boolean;
  readonly truncated: boolean;
}

function ancestorsWithin(model: Model, elementId: string): string[] {
  const chain: string[] = [];
  let current = model.elements.get(elementId);
  const guard = new Set<string>();
  while (current && !guard.has(current.id)) {
    guard.add(current.id);
    chain.unshift(current.id);
    current = current.parentId ? model.elements.get(current.parentId) : undefined;
  }
  return chain;
}

function contextsOf(
  model: Model,
  componentId: string,
  limit: number,
  seen: ReadonlySet<string> = new Set(),
): readonly RenderContext[] {
  const sites = model.renderSites.get(componentId) ?? [];
  if (sites.length === 0 || seen.has(componentId)) {
    // Nobody renders it that the graph can see — or it renders itself, and
    // unrolling the recursion would not add information.
    return [{ chain: [], rooted: sites.length === 0, truncated: false }];
  }
  const nested = new Set([...seen, componentId]);
  const contexts: RenderContext[] = [];
  let truncated = false;
  for (const site of sites) {
    const element = model.elements.get(site);
    if (!element) continue;
    const above = contextsOf(model, element.componentId, limit, nested);
    for (const outer of above) {
      if (contexts.length >= limit) {
        truncated = true;
        break;
      }
      contexts.push({
        chain: [...outer.chain, ...ancestorsWithin(model, site)],
        rooted: outer.rooted,
        truncated: outer.truncated,
      });
    }
  }
  if (contexts.length === 0) {
    return [{ chain: [], rooted: false, truncated: false }];
  }
  return truncated
    ? contexts.map((context) => ({ ...context, truncated: true }))
    : contexts;
}

/* ------------------------------------------------------------------------ *
 * Scenarios
 * ------------------------------------------------------------------------ */

const conditionsMatch = (
  atom: StyleDumpAtom,
  axes: Readonly<Record<string, string>>,
): boolean =>
  atom.conditions.every((condition) => {
    const separator = condition.lastIndexOf(':');
    const axis = condition.slice(0, separator);
    const point = condition.slice(separator + 1);
    return axes[axis] === point;
  });

/**
 * Only the axes that can move a colour, a size or a weight.
 *
 * An axis is relevant if one of its atoms writes such a property directly, or
 * writes a custom property — because a variable is precisely how this design
 * system paints, and an axis that writes `--dsButton-bg` and nothing else is
 * the most important axis in the report.
 */
function relevantAxes(
  model: Model,
  classKeys: readonly string[],
): Map<string, Set<string>> {
  const axes = new Map<string, Set<string>>();
  for (const key of classKeys) {
    for (const atom of model.atomsByClass.get(key) ?? []) {
      const paints =
        atom.property.startsWith('--') || COLOUR_PROPERTIES.has(atom.property);
      if (!paints) continue;
      for (const condition of atom.conditions) {
        const separator = condition.lastIndexOf(':');
        const axis = condition.slice(0, separator);
        const point = condition.slice(separator + 1);
        const points = axes.get(axis) ?? new Set<string>();
        points.add(point);
        axes.set(axis, points);
      }
    }
  }
  return axes;
}

const BASE = 'base';

function enumerateScenarios(
  axes: ReadonlyMap<string, Set<string>>,
  limit: number,
): { readonly scenarios: readonly ContrastScenario[]; readonly truncated: boolean } {
  const ordered = [...axes].sort(([left], [right]) => left.localeCompare(right));
  let combinations: Record<string, string>[] = [{}];
  let truncated = false;
  for (const [axis, points] of ordered) {
    const values = [BASE, ...[...points].sort()];
    const next: Record<string, string>[] = [];
    for (const combination of combinations) {
      for (const value of values) {
        if (next.length >= limit) {
          truncated = true;
          break;
        }
        next.push({ ...combination, [axis]: value });
      }
    }
    combinations = next;
  }
  return {
    truncated,
    scenarios: combinations.map((axesOfScenario) => ({
      id:
        Object.entries(axesOfScenario)
          .filter(([, point]) => point !== BASE)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([axis, point]) => `${axis}=${point}`)
          .join('+') || BASE,
      axes: axesOfScenario,
    })),
  };
}

/* ------------------------------------------------------------------------ *
 * The cascade
 * ------------------------------------------------------------------------ */

interface Declared {
  readonly value: string;
  readonly classKey: string;
  readonly atom: StyleDumpAtom;
}

/**
 * What one element's classes compute to, in one scenario.
 *
 * Three tie-breaks, in the order the browser applies them, and each one is
 * load-bearing for a case the design system actually contains.
 *
 * 1. **Layer.** An unconditional atom is emitted into `components` and a
 *    conditional one into `variants`, so every variant beats every base rule
 *    whatever their selectors look like. Cascade layers outrank specificity,
 *    which is exactly why the emitter uses them.
 * 2. **Specificity**, within `variants`. `&[data-tone='warning']:hover` has
 *    one more selector fragment than `&[data-tone='warning']`, so the hovered
 *    fill wins — regardless of which was written first or how the names sort.
 *    A media query contributes nothing here, which is why the count comes
 *    from the dump rather than from `conditions.length`.
 * 3. **Name**, last. Two atoms of equal specificity are separated by source
 *    order, and `renderCss` sorts the layer by atomic class name, so name
 *    order *is* source order in the emitted sheet.
 *
 * Getting 2 wrong is the interesting failure: the solver would resolve a
 * tone-plus-hover button to its resting fill and report `pass` on the state
 * that fails.
 */
const specificityOf = (atom: StyleDumpAtom): number =>
  atom.selectorConditions ??
  // A version-1 dump does not carry the count. Zero for everything keeps the
  // layer rule intact and falls back to name order inside it, which is the
  // old behaviour rather than a wrong new one.
  0;

function declarationsOn(
  model: Model,
  element: ElementInfo,
  axes: Readonly<Record<string, string>>,
): Map<string, Declared> {
  const base = new Map<string, Declared>();
  const variants = new Map<string, Declared>();
  for (const classKey of element.classKeys) {
    for (const atom of model.atomsByClass.get(classKey) ?? []) {
      if (!conditionsMatch(atom, axes)) continue;
      const conditional = atom.conditions.length > 0;
      const target = conditional ? variants : base;
      const previous = target.get(atom.property);
      if (previous && conditional) {
        const beaten =
          specificityOf(previous.atom) - specificityOf(atom) ||
          previous.atom.className.localeCompare(atom.className);
        if (beaten > 0) continue;
      }
      target.set(atom.property, { value: atom.value, classKey, atom });
    }
  }
  return new Map([...base, ...variants]);
}

interface VarBinding {
  readonly value: string;
  readonly origin: string;
  readonly provenance?: StyleDumpProvenance;
}

/** A value plus the chain that produced it, for the report. */
interface Traced {
  readonly value: string;
  readonly trail: readonly string[];
  readonly provenance?: StyleDumpProvenance;
}

/**
 * Substitutes `var()` until a literal is left, or gives up naming the variable.
 *
 * `var(--x, fallback)` takes the fallback only when `--x` resolves to nothing —
 * and under `@property` a registered variable *always* resolves, to its
 * registered initial value if nobody wrote it. Treating an unwritten variable
 * as absent would make the fallback branch fire where the browser would use
 * the initial, and the two are routinely different colours.
 */
function resolveValue(
  model: Model,
  raw: string,
  environment: ReadonlyMap<string, VarBinding>,
  trail: readonly string[],
  depth = 0,
): Traced | undefined {
  const value = raw.trim();
  if (depth > 8) return undefined;
  const reference = VAR_REFERENCE.exec(value);
  if (!reference) {
    return VAR_ANYWHERE.test(value)
      ? undefined
      : { value, trail };
  }
  const name = reference[1] as string;
  const fallback = reference[2];
  const bound = environment.get(name);
  if (bound) {
    const resolved = resolveValue(
      model,
      bound.value,
      environment,
      [...trail, `${bound.origin} → ${name}`],
      depth + 1,
    );
    // The write's own provenance is the answer here: `set(v.bg,
    // ui.accent.warningHover)` puts a literal in the variable, and the literal
    // has no name once it is a string. Losing it costs the report exactly the
    // thing it exists for — `#f5b544` instead of `ui.accent.warning.dark`.
    return resolved && !resolved.provenance && bound.provenance
      ? { ...resolved, provenance: bound.provenance }
      : resolved;
  }
  const declared = model.vars.get(name);
  if (declared) {
    const resolved = resolveValue(
      model,
      declared.initialValue,
      environment,
      [...trail, `${name} (initial)`],
      depth + 1,
    );
    return resolved && declared.initialProvenance
      ? { ...resolved, provenance: resolved.provenance ?? declared.initialProvenance }
      : resolved;
  }
  if (fallback !== undefined) {
    return resolveValue(model, fallback, environment, [...trail, `${name} (fallback)`], depth + 1);
  }
  return undefined;
}

/* ------------------------------------------------------------------------ *
 * Resolving one element in one scenario
 * ------------------------------------------------------------------------ */

interface ComputedElement {
  readonly element: ElementInfo;
  readonly declarations: ReadonlyMap<string, Declared>;
  readonly vars: ReadonlyMap<string, VarBinding>;
  readonly fontSizePx: number | undefined;
  readonly fontWeight: number;
  readonly color: Traced | undefined;
  readonly opacity: string | undefined;
}

const PX_PER_PT = 4 / 3;

function toPixels(
  css: string,
  context: { readonly parentPx: number; readonly rootPx: number },
): number | undefined {
  const match = /^(-?[\d.]+)(px|rem|em|pt|%)?$/.exec(css.trim());
  if (!match) return undefined;
  const amount = Number(match[1]);
  if (Number.isNaN(amount)) return undefined;
  switch (match[2]) {
    case undefined:
    case 'px':
      return amount;
    case 'rem':
      return amount * context.rootPx;
    case 'em':
      return amount * context.parentPx;
    case 'pt':
      return amount * PX_PER_PT;
    case '%':
      return (amount / 100) * context.parentPx;
    default:
      return undefined;
  }
}

const WEIGHT_KEYWORDS: Readonly<Record<string, number>> = {
  normal: 400,
  bold: 700,
  lighter: 100,
  bolder: 700,
};

/**
 * Walks a chain outside-in, carrying inheritance as it goes.
 *
 * Custom properties are carried too, and the `inherits` flag is honoured
 * rather than assumed: a non-inheriting `--dsButton-bg` set on a wrapper is
 * *not* visible to the button inside it, and a solver that let it through
 * would prove the wrong colour for the most common shape in the design system
 * — a theme variable that inherits sitting above a component variable that
 * does not.
 */
function computeChain(
  model: Model,
  chain: readonly string[],
  axes: Readonly<Record<string, string>>,
  options: Required<TextContrastOptions>,
): readonly ComputedElement[] {
  const computed: ComputedElement[] = [];
  let inheritedVars = new Map<string, VarBinding>();
  let fontSizePx = options.inheritedFontSizePx;
  let fontWeight = options.inheritedFontWeight;
  let color: Traced | undefined;

  for (const id of chain) {
    const element = model.elements.get(id);
    if (!element) continue;
    const declarations = declarationsOn(model, element, axes);

    const local = new Map(inheritedVars);
    for (const [property, declared] of declarations) {
      if (!property.startsWith('--')) continue;
      local.set(property, {
        value: declared.value,
        origin: declared.classKey,
        ...(declared.atom.provenance ? { provenance: declared.atom.provenance } : {}),
      });
    }

    const own = declarations.get('color');
    if (own) {
      // An unresolvable value is kept as written rather than dropped: the
      // parser downstream turns `var(--ds-ink)` into an `unresolved-var`
      // reason, which names the variable. Dropping it here would produce
      // "nothing sets a colour", which sends the reader to the wrong file.
      const resolved = resolveValue(model, own.value, local, [own.classKey]);
      color = resolved
        ? { ...resolved, provenance: resolved.provenance ?? own.atom.provenance }
        : { value: own.value, trail: [own.classKey] };
    }

    const size = declarations.get('font-size');
    if (size) {
      const resolved = resolveValue(model, size.value, local, [size.classKey]);
      const px = resolved
        ? toPixels(resolved.value, { parentPx: fontSizePx, rootPx: options.rootFontSizePx })
        : undefined;
      fontSizePx = px ?? Number.NaN;
    }

    const weight = declarations.get('font-weight');
    if (weight) {
      const resolved = resolveValue(model, weight.value, local, [weight.classKey]);
      const text = resolved?.value ?? weight.value;
      fontWeight = WEIGHT_KEYWORDS[text] ?? Number(text);
      if (Number.isNaN(fontWeight)) fontWeight = options.inheritedFontWeight;
    }

    computed.push({
      element,
      declarations,
      vars: local,
      fontSizePx: Number.isNaN(fontSizePx) ? undefined : fontSizePx,
      fontWeight,
      color,
      opacity: declarations.get('opacity')?.value,
    });

    // Only inheriting custom properties cross the boundary to the child.
    const next = new Map<string, VarBinding>();
    for (const [name, binding] of local) {
      if (model.vars.get(name)?.inherits) next.set(name, binding);
    }
    inheritedVars = next;
  }
  return computed;
}

type BackgroundOutcome =
  | { readonly kind: 'painted'; readonly source: ContrastSource; readonly rgb: Rgb }
  | { readonly kind: 'unsupported'; readonly detail: string }
  | { readonly kind: 'none' };

/**
 * The first opaque colour under the text, walking outwards.
 *
 * An element that paints nothing is transparent and the search continues; an
 * element that paints something this module cannot read — a gradient, an
 * image, a semi-transparent fill — stops the search with `unsupported`, because
 * whatever is behind it is no longer what the text is composited against.
 */
function backgroundBehind(
  model: Model,
  computed: readonly ComputedElement[],
): BackgroundOutcome {
  for (let index = computed.length - 1; index >= 0; index -= 1) {
    const level = computed[index] as ComputedElement;
    if (level.opacity !== undefined && level.opacity.trim() !== '1') {
      return {
        kind: 'unsupported',
        detail: `'${level.element.label}' sets opacity: ${level.opacity}, so what is behind it is blended into the background. v1 does not composite.`,
      };
    }
    const painted =
      level.declarations.get('background-color') ??
      level.declarations.get('background') ??
      level.declarations.get('background-image');
    if (!painted) continue;
    const resolved = resolveValue(model, painted.value, level.vars, [
      `${level.element.label}: ${painted.classKey}`,
    ]);
    if (!resolved) {
      return {
        kind: 'unsupported',
        detail: `'${level.element.label}' paints '${painted.value}', which still holds an unresolved variable.`,
      };
    }
    if (resolved.value.trim().toLowerCase() === 'transparent') continue;
    const colour = parseCssColor(resolved.value);
    if (colour.kind === 'unsupported') {
      return { kind: 'unsupported', detail: `'${level.element.label}': ${colour.detail}` };
    }
    return {
      kind: 'painted',
      rgb: colour.rgb,
      source: {
        value: resolved.value,
        source: resolved.trail.join(' → '),
        ...(resolved.provenance ? { token: provenanceName(resolved.provenance) } : {}),
      },
    };
  }
  return { kind: 'none' };
}

/* ------------------------------------------------------------------------ *
 * The pass
 * ------------------------------------------------------------------------ */

export function analyzeTextContrast(
  graph: DependencyGraph,
  dump: StyleDump,
  options: TextContrastOptions = {},
): readonly TextContrastResult[] {
  const settings: Required<TextContrastOptions> = { ...DEFAULTS, ...options };
  const model = buildModel(graph, dump);
  const results: TextContrastResult[] = [];

  for (const element of model.elements.values()) {
    if (!element.mayContainText) continue;
    const contexts = contextsOf(model, element.componentId, settings.maxRenderContexts);
    const own = ancestorsWithin(model, element.id);

    for (const context of contexts) {
      const chain = [...context.chain, ...own];
      const classKeys = chain.flatMap(
        (id) => model.elements.get(id)?.classKeys ?? [],
      );
      const { scenarios, truncated } = enumerateScenarios(
        relevantAxes(model, classKeys),
        settings.maxScenarios,
      );
      for (const scenario of scenarios) {
        results.push(
          judge(model, element, chain, context, scenario, settings, truncated),
        );
      }
    }
  }

  return dedupe(results);
}

function judge(
  model: Model,
  element: ElementInfo,
  chain: readonly string[],
  context: RenderContext,
  scenario: ContrastScenario,
  settings: Required<TextContrastOptions>,
  truncated: boolean,
): TextContrastResult {
  const route = model.routeOfComponent.get(element.componentId);
  const shell = {
    ...(route ? { route } : {}),
    component: element.component || model.componentLabel.get(element.componentId) || '(unknown)',
    element: element.label,
    scenario,
    equivalentScenarios: [] as readonly string[],
  };
  const indeterminate = (
    reason: IndeterminateReason,
    detail: string,
  ): IndeterminateTextContrast => ({ kind: 'indeterminate', ...shell, reason, detail });

  if (element.unresolvedClass) {
    return indeterminate('dynamic-style', element.unresolvedClass);
  }
  if (truncated) {
    return indeterminate(
      'incomplete-render-context',
      `More than ${settings.maxScenarios} scenarios reach '${element.label}'. The enumeration was stopped rather than truncated silently; narrow the axes this element depends on, or raise maxScenarios deliberately.`,
    );
  }
  if (context.truncated) {
    return indeterminate(
      'incomplete-render-context',
      `'${shell.component}' is rendered in more places than the analysis explores (limit ${settings.maxRenderContexts}). Some surfaces it appears on were not evaluated.`,
    );
  }

  const computed = computeChain(model, chain, scenario.axes, settings);
  const self = computed[computed.length - 1];
  if (!self) {
    return indeterminate(
      'incomplete-render-context',
      `'${element.label}' has no resolvable render chain; the graph did not record the elements around it.`,
    );
  }

  if (!self.color) {
    return indeterminate(
      'unknown-foreground',
      `Nothing in the chain above '${element.label}' sets a colour the model can read, so the text colour comes from outside CraftTS.`,
    );
  }
  if (self.opacity !== undefined && self.opacity.trim() !== '1') {
    return indeterminate(
      'unknown-foreground',
      `'${element.label}' sets opacity: ${self.opacity}; the painted text colour is a blend v1 does not compute.`,
    );
  }
  const foreground = parseCssColor(self.color.value);
  if (foreground.kind === 'unsupported') {
    return indeterminate('unknown-foreground', foreground.detail);
  }

  const background = backgroundBehind(model, computed);
  if (background.kind === 'unsupported') {
    return indeterminate('unsupported-background', background.detail);
  }
  if (background.kind === 'none') {
    return indeterminate(
      context.rooted ? 'unknown-background' : 'incomplete-render-context',
      context.rooted
        ? `No element above '${element.label}' paints an opaque background, so there is nothing to measure the text against. Give the surface a background, or the page one.`
        : `'${shell.component}' is not rendered anywhere the graph can see, so the background behind '${element.label}' depends on a caller that was not analysed.`,
    );
  }

  if (self.fontSizePx === undefined) {
    return indeterminate(
      'unknown-font-size',
      `The font size applying to '${element.label}' is not a length this analysis can turn into pixels, so the 3:1 / 4.5:1 threshold cannot be chosen.`,
    );
  }

  const requirement = textContrastRequirement({
    fontSizePx: self.fontSizePx,
    fontWeight: self.fontWeight,
  });
  const ratio = contrastRatioOf(foreground.rgb, background.rgb);

  return {
    kind: 'resolved',
    ...shell,
    foreground: {
      value: self.color.value,
      source: self.color.trail.join(' → '),
      ...(self.color.provenance
        ? { token: provenanceName(self.color.provenance) }
        : {}),
    },
    background: background.source,
    fontSizePx: self.fontSizePx,
    fontWeight: self.fontWeight,
    textScale: requirement.scale,
    ratio,
    required: requirement.required,
    verdict: meetsContrast(ratio, requirement.required) ? 'pass' : 'fail',
  };
}

/* ------------------------------------------------------------------------ *
 * Deduplication and reporting
 * ------------------------------------------------------------------------ */

/**
 * Folds scenarios that produce the same answer, keeping their names.
 *
 * A button with five tones and three sizes has eighteen scenarios and often
 * three distinct answers. Printing eighteen rows buries the two that differ;
 * printing three and dropping the names makes the failure unreproducible. So
 * the row is one and it lists the scenarios it stands for.
 */
function dedupe(results: readonly TextContrastResult[]): readonly TextContrastResult[] {
  const groups = new Map<string, TextContrastResult[]>();
  for (const result of results) {
    const { scenario: _scenario, equivalentScenarios: _also, ...identity } = result;
    const key = JSON.stringify(identity);
    const group = groups.get(key) ?? [];
    group.push(result);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => {
      const ordered = [...group].sort((left, right) =>
        left.scenario.id.localeCompare(right.scenario.id),
      );
      const first = ordered[0] as TextContrastResult;
      // Distinct scenario names only, and never the row's own. A group can
      // hold the same scenario twice — one component rendered on two surfaces
      // that turn out to paint the same colour — and printing
      // `also in: base` next to `scenario: base` reads as a bug in the tool.
      const others = new Set(
        ordered.slice(1).map((entry) => entry.scenario.id),
      );
      others.delete(first.scenario.id);
      return {
        ...first,
        equivalentScenarios: [...others].sort(),
      } as TextContrastResult;
    })
    .sort(
      (left, right) =>
        left.component.localeCompare(right.component) ||
        left.element.localeCompare(right.element) ||
        left.scenario.id.localeCompare(right.scenario.id),
    );
}

export interface TextContrastSummary {
  readonly total: number;
  readonly pass: number;
  readonly fail: number;
  readonly indeterminate: number;
}

export const summariseTextContrast = (
  results: readonly TextContrastResult[],
): TextContrastSummary => ({
  total: results.length,
  pass: results.filter(
    (result) => result.kind === 'resolved' && result.verdict === 'pass',
  ).length,
  fail: results.filter(
    (result) => result.kind === 'resolved' && result.verdict === 'fail',
  ).length,
  indeterminate: results.filter((result) => result.kind === 'indeterminate').length,
});

/**
 * The human form. The shape is fixed because it is read under pressure:
 * where, in what state, which two colours, which threshold, by how much.
 */
export function formatTextContrast(result: TextContrastResult): string {
  const lines: string[] = [];
  if (result.kind === 'resolved') {
    lines.push(`contrast/${result.verdict}`);
  } else {
    lines.push(`contrast/indeterminate (${result.reason})`);
  }
  if (result.route) lines.push(`route: ${result.route}`);
  lines.push(`component: ${result.component}`);
  lines.push(`element: ${result.element}`);
  lines.push(`scenario: ${result.scenario.id}`);
  if (result.equivalentScenarios.length > 0) {
    lines.push(`also in: ${result.equivalentScenarios.join(', ')}`);
  }
  if (result.kind === 'indeterminate') {
    lines.push(`why: ${result.detail}`);
    return lines.join('\n');
  }
  const name = (source: ContrastSource) =>
    `${source.token ? `${source.token} ` : ''}${source.value} (${source.source})`;
  lines.push(`foreground: ${name(result.foreground)}`);
  lines.push(`background: ${name(result.background)}`);
  lines.push(
    `font: ${result.fontSizePx}px / ${result.fontWeight} (${result.textScale} text)`,
  );
  lines.push(`ratio: ${formatRatio(result.ratio)}`);
  lines.push(`required: ${result.required}:1`);
  return lines.join('\n');
}

/* ------------------------------------------------------------------------ *
 * The report the CLI and CI both read
 * ------------------------------------------------------------------------ */

/**
 * The JSON shape is a contract, so it is spelled out rather than being
 * whatever the internal types happen to serialise to. Fields get added, never
 * renamed or removed, and `results` keeps the solver's own deterministic
 * order so two runs on unchanged sources produce byte-identical output.
 */
export interface TextContrastReport {
  readonly version: 1;
  readonly summary: TextContrastSummary;
  readonly policy: { readonly indeterminate: 'error' | 'warning' };
  readonly results: readonly TextContrastResult[];
}

export interface TextContrastPolicy {
  /**
   * Whether a result nobody could prove is allowed through.
   *
   * `false` by default, and the caller has to say otherwise out loud. A check
   * whose default is "unknown counts as fine" reports a clean bill on an
   * application it understood half of — which is the exact failure this whole
   * analysis exists to remove, arriving one level up.
   */
  readonly allowIndeterminate?: boolean;
}

export const textContrastReport = (
  results: readonly TextContrastResult[],
  policy: TextContrastPolicy = {},
): TextContrastReport => ({
  version: 1,
  summary: summariseTextContrast(results),
  policy: { indeterminate: policy.allowIndeterminate ? 'warning' : 'error' },
  results,
});

/** 0 when the run may pass, 1 when it must not. */
export function textContrastExitCode(report: TextContrastReport): number {
  if (report.summary.fail > 0) return 1;
  return report.summary.indeterminate > 0 &&
    report.policy.indeterminate === 'error'
    ? 1
    : 0;
}

/**
 * The console form: a summary line, then violations, then what could not be
 * proven. In that order because a reader with thirty seconds should see the
 * things that are wrong before the things that are unknown.
 */
export function formatTextContrastReport(report: TextContrastReport): string {
  const { summary } = report;
  const lines = [
    `Text contrast: ${summary.pass} pass, ${summary.fail} fail, ${summary.indeterminate} indeterminate (${summary.total} checked).`,
  ];
  const failures = report.results.filter(
    (result) => result.kind === 'resolved' && result.verdict === 'fail',
  );
  const unknown = report.results.filter(
    (result) => result.kind === 'indeterminate',
  );
  for (const result of [...failures, ...unknown]) {
    lines.push('', formatTextContrast(result));
  }
  if (summary.total === 0) {
    // Zero checked is not a pass. It nearly always means the graph found no
    // element it could prove holds text, which is a wiring problem and not a
    // clean application.
    lines.push(
      '',
      'Nothing was checked. Either no element in the program was proven to hold text, or the dump and the program describe different applications.',
    );
  }
  if (unknown.length > 0 && report.policy.indeterminate === 'warning') {
    lines.push(
      '',
      `${unknown.length} result(s) could not be proven and indeterminates are allowed, so they do not fail the run. A report with no violations and open indeterminates is not a proof of accessibility.`,
    );
  }
  return lines.join('\n');
}
