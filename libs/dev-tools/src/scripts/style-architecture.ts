/**
 * Architecture predicates over the style side of the graph.
 *
 * The **first** one to reach for is `extractionGaps`. A rule that comes back
 * green on an incomplete graph gives exactly the false confidence of a matrix
 * that is not tight: the answer looks like a guarantee and is an artefact of
 * what was never looked at.
 */
import type {
  DependencyGraph,
  DependencyGraphNode,
} from './dependency-graph.ts';
import { matrixSizeOf, type StyleDumpClass } from './style-graph.ts';

const nodesOf = (graph: DependencyGraph, kind: string) =>
  graph.nodes.filter((node) => node.kind === kind);

const detailsOf = <Value>(node: DependencyGraphNode, key: string): Value =>
  (node.details?.[key] ?? undefined) as Value;

const edgesOf = (graph: DependencyGraph, kind: string) =>
  graph.edges.filter((edge) => edge.kind === kind);

/** Components the graph knows nothing about, style-wise. Read this first. */
export const extractionGaps = (graph: DependencyGraph): readonly string[] =>
  (graph.diagnostics ?? [])
    .filter(
      (diagnostic) =>
        diagnostic.code === 'component-without-style-class' ||
        diagnostic.code === 'style-class-missing-from-dump',
    )
    .map((diagnostic) => diagnostic.message)
    .sort();

/** How many captures a sheet class costs, by class id. */
export const matrixSize = (
  graph: DependencyGraph,
): Readonly<Record<string, number>> =>
  Object.fromEntries(
    nodesOf(graph, 'style-class').map((node) => [
      node.label,
      detailsOf<number>(node, 'matrixSize') ?? 1,
    ]),
  );

/**
 * What a component costs to capture: the product of the sheets it renders.
 *
 * The product, not the sum — the sheets are on screen together. This is the
 * number the plan wants watched per route, because it is the CI bill.
 */
export function matrixSizeByComponent(
  graph: DependencyGraph,
): Readonly<Record<string, number>> {
  const sizeById = new Map(
    nodesOf(graph, 'style-class').map((node) => [
      node.id,
      detailsOf<number>(node, 'matrixSize') ?? 1,
    ]),
  );
  const totals = new Map<string, number>();
  for (const edge of edgesOf(graph, 'styled-by')) {
    totals.set(
      edge.from,
      (totals.get(edge.from) ?? 1) * (sizeById.get(edge.to) ?? 1),
    );
  }
  return Object.fromEntries(
    [...totals].map(([id, total]) => [
      graph.nodes.find((node) => node.id === id)?.label ?? id,
      total,
    ]),
  );
}

/** Obligations required somewhere and discharged nowhere in this graph. */
export function undischargedObligations(
  graph: DependencyGraph,
): readonly string[] {
  const discharged = new Set(
    edgesOf(graph, 'discharges').map((edge) => edge.to),
  );
  return [
    ...new Set(
      edgesOf(graph, 'requires')
        .filter((edge) => !discharged.has(edge.to))
        .map((edge) => edge.to.replace(/^obligation:/, '')),
    ),
  ].sort();
}

/** Sheet classes that discharge something — the layout layer, in practice. */
export const dischargers = (graph: DependencyGraph): readonly string[] =>
  [
    ...new Set(
      edgesOf(graph, 'discharges').map(
        (edge) =>
          graph.nodes.find((node) => node.id === edge.from)?.label ?? edge.from,
      ),
    ),
  ].sort();

/**
 * The custom properties an axis writes, by axis.
 *
 * This is what makes "the colour-scheme axis only repaints" checkable instead
 * of asserted: an axis that writes a length somewhere shows up here with it.
 */
export function varsWrittenBy(
  graph: DependencyGraph,
): Readonly<Record<string, readonly string[]>> {
  const byAxis = new Map<string, Set<string>>();
  for (const node of nodesOf(graph, 'style-atom')) {
    const property = detailsOf<string>(node, 'property');
    const conditions = detailsOf<readonly string[]>(node, 'conditions') ?? [];
    if (!property?.startsWith('--')) continue;
    for (const condition of conditions) {
      const axis = condition.split(':')[0];
      const known = byAxis.get(axis) ?? new Set<string>();
      known.add(property);
      byAxis.set(axis, known);
    }
  }
  return Object.fromEntries(
    [...byAxis].map(([axis, names]) => [axis, [...names].sort()]),
  );
}

/**
 * Properties an axis writes that are **not** custom properties.
 *
 * An axis constrained to colours must show up empty here. One entry means the
 * axis moves a box, and every reduction that assumed otherwise is wrong.
 */
export function propertiesWrittenBy(
  graph: DependencyGraph,
): Readonly<Record<string, readonly string[]>> {
  const byAxis = new Map<string, Set<string>>();
  for (const node of nodesOf(graph, 'style-atom')) {
    const property = detailsOf<string>(node, 'property');
    const conditions = detailsOf<readonly string[]>(node, 'conditions') ?? [];
    if (!property || property.startsWith('--')) continue;
    for (const condition of conditions) {
      const axis = condition.split(':')[0];
      const known = byAxis.get(axis) ?? new Set<string>();
      known.add(property);
      byAxis.set(axis, known);
    }
  }
  return Object.fromEntries(
    [...byAxis].map(([axis, names]) => [axis, [...names].sort()]),
  );
}

/** Declared variables nothing reads, and read variables nothing declares. */
export function danglingVars(graph: DependencyGraph): {
  readonly unread: readonly string[];
  readonly undeclared: readonly string[];
} {
  const declared = new Set(nodesOf(graph, 'css-var').map((node) => node.label));
  const read = new Set(
    edgesOf(graph, 'reads-var').map((edge) => edge.to.replace(/^css-var:/, '')),
  );
  return {
    unread: [...declared].filter((name) => !read.has(name)).sort(),
    undeclared: [...read].filter((name) => !declared.has(name)).sort(),
  };
}

/** Every escape hatch taken, with the reason its author gave. */
export function unproven(graph: DependencyGraph): readonly string[] {
  const reasons = new Set<string>();
  for (const node of [
    ...nodesOf(graph, 'style-class'),
    ...nodesOf(graph, 'style-atom'),
  ]) {
    const value = node.details?.['unproven'];
    if (typeof value === 'string' && value)
      reasons.add(`${node.label}: ${value}`);
    if (Array.isArray(value)) {
      for (const reason of value) reasons.add(`${node.label}: ${reason}`);
    }
  }
  return [...reasons].sort();
}

/**
 * What a change to a token or a variable can be seen in.
 *
 * The gain that pays for the visual CI: changing one colour should recapture
 * the scenarios reachable from it, not the whole suite. Conservative on
 * purpose — a node the graph does not know reaches everything.
 */
export function impactedClasses(
  graph: DependencyGraph,
  changed: readonly string[],
): readonly string[] {
  const wanted = new Set(changed);
  const hit = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.kind !== 'reads-var' && edge.kind !== 'declares-var') continue;
    const name = edge.to.replace(/^css-var:/, '');
    if (!wanted.has(name)) continue;
    const node = graph.nodes.find((entry) => entry.id === edge.from);
    if (node) hit.add(node.label);
  }
  return [...hit].sort();
}

export type { StyleDumpClass };
export { matrixSizeOf };
