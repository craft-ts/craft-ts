/**
 * Style nodes in the dependency graph.
 *
 * **One graph, two producers.** `craft graph` reads the AST and the types; the
 * style plugin evaluates the sheets and emits a dump. They meet here, joined on
 * the identity of a class. Re-deriving the style side from the AST instead
 * would mean a second, approximate evaluation of the DSL — and two answers that
 * disagree sooner or later.
 *
 * The queries worth having are the transverse ones: token → class → component →
 * route. That is the whole reason this is not a separate graph.
 */
import type {
  DependencyGraph,
  DependencyGraphDiagnostic,
  DependencyGraphEdge,
  DependencyGraphNode,
} from './dependency-graph.ts';

declare module './dependency-graph.ts' {
  interface DependencyGraphNodeRegistry {
    'style-class': Record<string, unknown>;
    'style-atom': Record<string, unknown>;
    'css-var': Record<string, unknown>;
    axis: Record<string, unknown>;
    obligation: Record<string, unknown>;
  }
  interface DependencyGraphEdgeRegistry {
    'styled-by': Record<string, unknown>;
    'varies-on': Record<string, unknown>;
    'declares-var': Record<string, unknown>;
    'reads-var': Record<string, unknown>;
    'emits-atom': Record<string, unknown>;
    requires: Record<string, unknown>;
    discharges: Record<string, unknown>;
  }
}

export interface StyleDumpClass {
  readonly key: string;
  readonly className: string;
  readonly axes: Readonly<Record<string, readonly string[]>>;
  readonly atoms: readonly string[];
  readonly unproven: readonly string[];
  readonly requires: readonly string[];
  readonly provides: readonly string[];
  readonly violates: readonly string[];
  readonly unusedAxes?: readonly string[];
}

export interface StyleDumpAtom {
  readonly className: string;
  readonly property: string;
  readonly value: string;
  readonly conditions: readonly string[];
  readonly unproven: string;
}

export interface StyleDumpVar {
  readonly name: string;
  readonly syntax: string;
  readonly inherits: boolean;
  readonly initialValue: string;
  readonly role: string;
}

export interface StyleDump {
  readonly classes: readonly StyleDumpClass[];
  readonly atoms: readonly StyleDumpAtom[];
  readonly vars: readonly StyleDumpVar[];
}

export const styleClassId = (key: string): string => `style-class:${key}`;
export const cssVarId = (name: string): string => `css-var:${name}`;
export const axisId = (axis: string): string => `axis:${axis}`;
export const obligationId = (id: string): string => `obligation:${id}`;
const atomId = (className: string): string => `style-atom:${className}`;

const VAR_READ = /var\((--[^),\s]+)/g;

/**
 * Which component uses which sheet.
 *
 * The dump knows classes, not components — it never sees a template. The
 * association is made by the AST producer, which does; this map is how the two
 * halves are handed to the merge. A component that uses a sheet nobody recorded
 * comes out as a diagnostic rather than as silence.
 */
export type ComponentStyleUsage = Readonly<Record<string, readonly string[]>>;

export interface MergeStyleOptions {
  /** component node id → the sheet keys it renders. */
  readonly usedBy?: ComponentStyleUsage;
  /**
   * Components the extraction is known not to cover — a component whose styles
   * come from a global stylesheet, for instance. Listed explicitly so that the
   * completeness rule can tell "not covered" from "forgotten".
   */
  readonly uncovered?: readonly string[];
}

/**
 * Folds a style dump into an existing graph.
 *
 * Idempotent: merging the same dump twice gives the same graph. The merge is
 * keyed on ids, not on array position, because the two producers do not walk
 * the tree in the same order and never will.
 */
export function mergeStyleDump(
  graph: DependencyGraph,
  dump: StyleDump,
  options: MergeStyleOptions = {},
): DependencyGraph {
  const nodes = new Map<string, DependencyGraphNode>(
    graph.nodes.map((node) => [node.id, node]),
  );
  const edges = new Map<string, DependencyGraphEdge>(
    graph.edges.map((edge) => [`${edge.from}|${edge.kind}|${edge.to}`, edge]),
  );
  const diagnostics: DependencyGraphDiagnostic[] = [
    ...(graph.diagnostics ?? []),
  ];

  const addNode = (node: DependencyGraphNode) => nodes.set(node.id, node);
  const addEdge = (edge: DependencyGraphEdge) =>
    edges.set(`${edge.from}|${edge.kind}|${edge.to}`, edge);

  for (const declaration of dump.vars) {
    addNode({
      id: cssVarId(declaration.name),
      kind: 'css-var',
      label: declaration.name,
      details: {
        syntax: declaration.syntax,
        inherits: declaration.inherits,
        initialValue: declaration.initialValue,
        role: declaration.role,
      },
    });
  }

  const atomsByName = new Map(dump.atoms.map((atom) => [atom.className, atom]));
  for (const atom of dump.atoms) {
    addNode({
      id: atomId(atom.className),
      kind: 'style-atom',
      label: `${atom.property}: ${atom.value}`,
      details: {
        property: atom.property,
        value: atom.value,
        conditions: atom.conditions,
        unproven: atom.unproven,
      },
    });
    for (const condition of atom.conditions) {
      const axis = condition.split(':')[0];
      addNode({ id: axisId(axis), kind: 'axis', label: axis });
    }
  }

  for (const registered of dump.classes) {
    const id = styleClassId(registered.key);
    addNode({
      id,
      kind: 'style-class',
      label: registered.key,
      details: {
        className: registered.className,
        axes: registered.axes,
        matrixSize: matrixSizeOf(registered),
        unproven: registered.unproven,
        unusedAxes: registered.unusedAxes ?? [],
      },
    });

    for (const className of registered.atoms) {
      addEdge({
        from: id,
        to: atomId(className),
        kind: 'emits-atom',
        evidence: 'type',
      });
      const atom = atomsByName.get(className);
      if (!atom) continue;
      if (atom.property.startsWith('--')) {
        addEdge({
          from: id,
          to: cssVarId(atom.property),
          kind: 'declares-var',
          evidence: 'type',
        });
      }
      for (const [, name] of atom.value.matchAll(VAR_READ)) {
        addEdge({
          from: id,
          to: cssVarId(name),
          kind: 'reads-var',
          evidence: 'type',
        });
      }
    }

    for (const axis of Object.keys(registered.axes)) {
      addEdge({
        from: id,
        to: axisId(axis),
        kind: 'varies-on',
        evidence: 'type',
      });
    }
    for (const requirement of registered.requires) {
      addNode({
        id: obligationId(requirement),
        kind: 'obligation',
        label: requirement,
      });
      addEdge({
        from: id,
        to: obligationId(requirement),
        kind: 'requires',
        evidence: 'type',
      });
    }
    for (const discharge of registered.provides) {
      addNode({
        id: obligationId(discharge),
        kind: 'obligation',
        label: discharge,
      });
      addEdge({
        from: id,
        to: obligationId(discharge),
        kind: 'discharges',
        evidence: 'type',
      });
    }
  }

  const known = new Set(dump.classes.map((registered) => registered.key));
  const uncovered = new Set(options.uncovered ?? []);
  for (const [componentId, keys] of Object.entries(options.usedBy ?? {})) {
    for (const key of keys) {
      if (!known.has(key)) {
        // One producer saw a sheet the other did not. Swallowing it would make
        // every rule downstream green on an incomplete graph, which is the same
        // false confidence as a matrix that is not tight.
        diagnostics.push({
          code: 'style-class-missing-from-dump',
          message: `'${componentId}' renders the sheet class '${key}', which the style dump does not contain. The graph is incomplete: regenerate the dump, or the rules that read it will pass on a partial picture.`,
        });
        continue;
      }
      addEdge({
        from: componentId,
        to: styleClassId(key),
        kind: 'styled-by',
        evidence: 'ast',
      });
    }
  }

  for (const node of graph.nodes) {
    if (node.kind !== 'component') continue;
    if (uncovered.has(node.id)) continue;
    if (options.usedBy?.[node.id]?.length) continue;
    diagnostics.push({
      code: 'component-without-style-class',
      message: `'${node.label}' is not styled by any sheet the graph knows about. Either it uses CSS from outside the model — list it as uncovered so the gap is visible — or the extraction missed it.`,
    });
  }

  return {
    ...graph,
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    diagnostics,
  };
}

/**
 * The number of visual states a class produces, `base` included.
 *
 * The same arithmetic the matrix does, kept here so the graph can answer
 * "what does this route cost to capture?" without loading the testing package.
 */
export function matrixSizeOf(registered: StyleDumpClass): number {
  return Object.values(registered.axes).reduce(
    (total, points) => total * (points.length + 1),
    1,
  );
}
