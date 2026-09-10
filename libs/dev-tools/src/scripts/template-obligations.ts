/**
 * Promises made by a component template, derived from the source rather than
 * from a test or browser report.
 *
 * The dependency graph remains the source of truth for resolved targets. This
 * module walks the template again only to recover the public site carrying the
 * promise: a rendered reactive expression or an interactive handler. Keeping
 * that association outside the graph avoids changing any versioned graph
 * output merely to make obligations addressable.
 */
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import {
  Node,
  Project,
  SyntaxKind,
  type CallExpression,
  type ObjectLiteralExpression,
} from 'ts-morph';
import {
  createSliceIndex,
  fingerprintOf,
  portableNodeId,
  sliceOf,
  type SliceIndex,
} from './code-slice.js';
import {
  collectReactiveExpressions,
  isBindingName,
  isInteractiveElement,
  parseCraftHyperscript,
  templateParameterNames,
  walkTemplate,
  type DependencyGraph,
  type DependencyGraphDiagnostic,
  type DependencyGraphEdge,
  type DependencyGraphNode,
  type DependencyGraphNodeKind,
  type ParsedHyperscript,
} from './dependency-graph.js';
import type {
  TemplateCondition,
  TemplateStatementParts,
} from '../attestation-review.js';

export type ObligationDirection = 'render' | 'command';

export interface TemplateObligation {
  /** `template:<portable component id>#render:<portable target id>` */
  readonly subject: string;
  readonly direction: ObligationDirection;
  /** Portable id of the component whose template carries the promise. */
  readonly component: string;
  /** Portable id of the node the promise resolves to. */
  readonly target: string;
  readonly targetKind: DependencyGraphNodeKind;
  /** `button` / `a` / … — `command` only. */
  readonly element?: string;
  /** The literal name of the interactive element, when it has one. */
  readonly elementName?: string;
  /** Structural conditions that must hold for the promise to be visible. */
  readonly conditions: readonly TemplateCondition[];
  /** One sentence, for a human. Never part of the evidence. */
  readonly statement: string;
  /** Ingredients for localized presentation. Never part of the evidence. */
  readonly statementParts: TemplateStatementParts;
}

export interface TemplateObligationOptions {
  readonly rootDir?: string;
  readonly tsConfigFilePath?: string;
}

export interface TemplateObligationIndex {
  readonly graph: DependencyGraph;
  readonly obligations: readonly TemplateObligation[];
  /** Known holes in the derivation. Never silently discarded. */
  readonly diagnostics: readonly DependencyGraphDiagnostic[];
  fingerprintFor(obligation: TemplateObligation | string): string;
  leavesFor(
    obligation: TemplateObligation | string,
  ): Readonly<Record<string, string>>;
}

type Site = {
  readonly text: string;
  readonly node: Node;
  readonly parsed?: ParsedHyperscript;
  readonly conditions: readonly TemplateCondition[];
};

type Candidate = {
  readonly edge: DependencyGraphEdge;
  readonly target: DependencyGraphNode;
  readonly keys: readonly string[];
};

type Accumulated = {
  readonly direction: ObligationDirection;
  readonly component: DependencyGraphNode;
  readonly target: DependencyGraphNode;
  readonly sites: Set<string>;
  readonly elements: Set<string>;
  readonly elementNames: Set<string>;
  readonly conditionPaths: Map<string, readonly TemplateCondition[]>;
};

const INTERACTIVE_HANDLERS = new Set([
  'click',
  'onClick',
  'input',
  'onInput',
  'change',
  'onChange',
  'submit',
  'onSubmit',
]);

const sha = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

const normaliseSite = (text: string): string =>
  text.replace(/\s+/g, ' ').trim();

const usageIncludesTemplate = (edge: DependencyGraphEdge): boolean =>
  String(edge.details?.['usage'] ?? '')
    .split('+')
    .includes('template');

const edgeKeys = (edge: DependencyGraphEdge): readonly string[] =>
  ['reader', 'path', 'property', 'member']
    .map((key) => edge.details?.[key])
    .filter((value): value is string => typeof value === 'string')
    .flatMap((value) => {
      const parts = value.split('.');
      return [value, parts.at(-1) as string];
    });

const chainOf = (node: Node | undefined): string | undefined => {
  if (!node) return undefined;
  if (Node.isParenthesizedExpression(node))
    return chainOf(node.getExpression());
  if (Node.isIdentifier(node)) return node.getText();
  if (Node.isPropertyAccessExpression(node)) {
    const left = chainOf(node.getExpression());
    return left ? `${left}.${node.getName()}` : undefined;
  }
  if (Node.isCallExpression(node)) return chainOf(node.getExpression());
  return undefined;
};

const expressionKeys = (expression: Node): readonly string[] => {
  const chain = chainOf(expression);
  if (!chain) return [];
  const parts = chain.split('.');
  return [...new Set([chain, parts.at(-1) as string])];
};

const matches = (expression: Node, candidate: Candidate): boolean => {
  const expressions = expressionKeys(expression);
  return expressions.some((key) => candidate.keys.includes(key));
};

const resolvedCandidates = (
  expression: Node,
  candidates: readonly Candidate[],
): readonly Candidate[] => {
  const matched = candidates.filter((candidate) =>
    matches(expression, candidate),
  );
  if (matched.length <= 1) return matched;
  const chain = chainOf(expression);
  const score = (candidate: Candidate): number => {
    const callSite = candidate.edge.details?.['callSite'];
    const offset =
      typeof callSite === 'object' && callSite !== null
        ? (callSite as { offset?: unknown }).offset
        : undefined;
    return (
      (offset === expression.getStart() ? 100 : 0) +
      (candidate.edge.evidence === 'ast' ? 20 : 0) +
      (chain && candidate.keys.includes(chain) ? 8 : 0) +
      (chain && candidate.target.id.includes(chain) ? 4 : 0) +
      (chain && candidate.target.label.includes(chain) ? 2 : 0)
    );
  };
  const sorted = [...matched].sort(
    (left, right) =>
      score(right) - score(left) ||
      left.target.id.localeCompare(right.target.id),
  );
  return sorted.slice(0, 1);
};

const propertyName = (property: Node): string | undefined => {
  if (
    Node.isPropertyAssignment(property) ||
    Node.isMethodDeclaration(property) ||
    Node.isShorthandPropertyAssignment(property)
  ) {
    return property.getName();
  }
  return undefined;
};

const handlerScope = (property: Node): Node | undefined => {
  if (Node.isPropertyAssignment(property)) return property.getInitializer();
  if (Node.isMethodDeclaration(property)) return property.getBody() ?? property;
  if (Node.isShorthandPropertyAssignment(property))
    return property.getNameNode();
  return undefined;
};

const handlerSites = (
  props: ObjectLiteralExpression | undefined,
  parsed: ParsedHyperscript,
  conditions: readonly TemplateCondition[],
): readonly Site[] =>
  (props?.getProperties() ?? []).flatMap((property) => {
    const name = propertyName(property);
    const scope = handlerScope(property);
    return name && INTERACTIVE_HANDLERS.has(name) && scope
      ? [{ text: property.getText(), node: scope, parsed, conditions }]
      : [];
  });

const isWithin = (node: Node, parent: Node): boolean =>
  node === parent || node.getAncestors().includes(parent);

const expressionLabel = (expression: Node): string | undefined => {
  const direct = chainOf(expression);
  if (direct) return direct;

  // A generator wrapper is common when a list is derived from another
  // reactive value: forNode(function* () { return yield* cards(); }, ...).
  // Prefer the named reactive read over printing the whole function body.
  const nested = collectReactiveExpressions(expression)
    .map(chainOf)
    .filter((value): value is string => value !== undefined);
  return nested[0];
};

const conditionName = (expression: Node | undefined): string =>
  expressionLabel(expression as Node) ??
  normaliseSite(expression?.getText() ?? 'condition');

const conditionFor = (
  node: Node,
  call: CallExpression,
): TemplateCondition | undefined => {
  const args = call.getArguments();
  const callee = call.getExpression().getText();
  if (callee === 'ifNode') {
    const expectation = isWithin(node, args[1] as Node)
      ? 'true'
      : args[2] && isWithin(node, args[2])
        ? 'false'
        : undefined;
    return expectation
      ? { kind: 'if', name: conditionName(args[0]), expectation }
      : undefined;
  }

  if (callee !== 'forNode') return undefined;
  if (args[2] && isWithin(node, args[2])) {
    return {
      kind: 'for',
      name: conditionName(args[0]),
      expectation: 'non-empty',
    };
  }
  const empty = args[1]
    ?.asKind(SyntaxKind.ObjectLiteralExpression)
    ?.getProperty('empty');
  const emptyInitializer = empty
    ?.asKind(SyntaxKind.PropertyAssignment)
    ?.getInitializer();
  return emptyInitializer && isWithin(node, emptyInitializer)
    ? { kind: 'for', name: conditionName(args[0]), expectation: 'empty' }
    : undefined;
};

const conditionsFor = (node: Node): readonly TemplateCondition[] => {
  const controls = node
    .getAncestors()
    .filter((ancestor): ancestor is CallExpression => {
      if (!Node.isCallExpression(ancestor)) return false;
      const name = ancestor.getExpression().getText();
      return name === 'ifNode' || name === 'forNode';
    })
    .sort((left, right) => left.getStart() - right.getStart());
  return controls.flatMap((control) => {
    const condition = conditionFor(node, control);
    return condition ? [condition] : [];
  });
};

const conditionKey = (conditions: readonly TemplateCondition[]): string =>
  conditions
    .map(
      (condition) =>
        `${condition.kind}:${condition.name}:${condition.expectation}`,
    )
    .join('|');

const sameConditions = (
  left: readonly TemplateCondition[],
  right: readonly TemplateCondition[],
): boolean => conditionKey(left) === conditionKey(right);

const componentCall = (
  project: Project,
  component: DependencyGraphNode,
): CallExpression | undefined => {
  const source = component.filePath
    ? project.getSourceFile(component.filePath)
    : undefined;
  if (!source) return undefined;
  const calls = source
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter((call) => call.getExpression().getText() === 'craftComponent');
  return (
    calls.find((call) => call.getStartLineNumber() === component.line) ??
    calls.find(
      (call) =>
        call
          .getArguments()[0]
          ?.asKind(SyntaxKind.StringLiteral)
          ?.getLiteralValue() === component.label,
    )
  );
};

const templateImplementationParts = (part: Node | undefined): Node[] => {
  const resolve = (node: Node, seen: Set<Node>): Node[] => {
    if (seen.has(node)) return [];
    seen.add(node);
    if (Node.isArrowFunction(node) || Node.isFunctionExpression(node))
      return [node];
    if (Node.isVariableDeclaration(node)) {
      const initializer = node.getInitializer();
      return initializer ? resolve(initializer, seen) : [];
    }
    if (
      Node.isCallExpression(node) &&
      node.getExpression().getText() === 'craftTemplate'
    ) {
      const template = node.getArguments()[0];
      return template ? resolve(template, seen) : [];
    }
    if (Node.isIdentifier(node)) {
      const symbol = node.getSymbol();
      const resolved = symbol?.getAliasedSymbol() ?? symbol;
      return (resolved?.getDeclarations() ?? [])
        .filter(
          (declaration) => !declaration.getSourceFile().isDeclarationFile(),
        )
        .flatMap((declaration) => resolve(declaration, seen));
    }
    return [];
  };

  return part ? resolve(part, new Set()) : [];
};

const dynamicReference = (
  expression: Node,
  parameterNames: ReadonlySet<string>,
): Node | undefined => {
  const elementAccess = Node.isElementAccessExpression(expression)
    ? expression
    : expression.getFirstDescendantByKind(SyntaxKind.ElementAccessExpression);
  if (!elementAccess) return undefined;
  return elementAccess
    .getDescendantsOfKind(SyntaxKind.Identifier)
    .some(
      (identifier) =>
        parameterNames.has(identifier.getText()) && !isBindingName(identifier),
    )
    ? elementAccess
    : undefined;
};

const reactiveExpressionsAt = (scope: Node): readonly Node[] => {
  const root =
    Node.isCallExpression(scope) ||
    Node.isPropertyAccessExpression(scope) ||
    Node.isIdentifier(scope)
      ? [scope]
      : [];
  return [...root, ...collectReactiveExpressions(scope)];
};

const dynamicReferencesIn = (
  scope: Node,
  parameterNames: ReadonlySet<string>,
): readonly Node[] => {
  const accesses = [
    ...(Node.isElementAccessExpression(scope) ? [scope] : []),
    ...scope.getDescendantsOfKind(SyntaxKind.ElementAccessExpression),
  ];
  return accesses.filter(
    (access) =>
      !Node.isElementAccessExpression(access.getParent()) &&
      dynamicReference(access, parameterNames),
  );
};

const diagnosticFor = (
  component: DependencyGraphNode,
  expression: Node,
): DependencyGraphDiagnostic => ({
  code: 'template-obligation-unresolved',
  message: `Template obligation in '${component.label}' cannot resolve dynamic expression '${normaliseSite(expression.getText())}'.`,
  proof: {
    filePath: expression.getSourceFile().getFilePath(),
    line: expression.getStartLineNumber(),
    pattern: normaliseSite(expression.getText()),
  },
});

const portableLeaves = (
  leaves: Readonly<Record<string, string>>,
  rootDir: string,
): Readonly<Record<string, string>> =>
  Object.fromEntries(
    Object.entries(leaves).map(([id, hash]) => [
      portableNodeId(id, rootDir),
      hash,
    ]),
  );

const obligationOf = (
  value: Accumulated,
  rootDir: string,
): TemplateObligation => {
  const component = portableNodeId(value.component.id, rootDir);
  const target = portableNodeId(value.target.id, rootDir);
  const element = [...value.elements].sort().at(0);
  const elementName = [...value.elementNames].sort().at(0);
  const conditionPaths = [...value.conditionPaths.values()];
  // An obligation can aggregate several sites. Only present a `when` clause
  // when every site has the same structural guard; otherwise claiming one
  // guard would be misleading for the other site(s).
  const conditions =
    conditionPaths.length > 0 &&
    conditionPaths.every((path) =>
      sameConditions(path, conditionPaths[0] ?? []),
    )
      ? (conditionPaths[0] as readonly TemplateCondition[])
      : [];
  const subject = `template:${component}#${value.direction}:${target}`;
  const statement =
    value.direction === 'render'
      ? `${value.component.label}'s template renders ${value.target.label}.`
      : `${element ?? 'interactive element'}${elementName ? ` '${elementName}'` : ''} in ${value.component.label}'s template invokes ${value.target.label}.`;
  const statementParts: TemplateStatementParts = {
    direction: value.direction,
    component: value.component.label,
    target: value.target.label,
    ...(element ? { element } : {}),
    ...(elementName ? { elementName } : {}),
  };
  return {
    subject,
    direction: value.direction,
    component,
    target,
    targetKind: value.target.kind,
    ...(element ? { element } : {}),
    ...(elementName ? { elementName } : {}),
    conditions,
    statement,
    statementParts,
  };
};

function derive(
  graph: DependencyGraph,
  options: TemplateObligationOptions,
): {
  readonly obligations: readonly TemplateObligation[];
  readonly diagnostics: readonly DependencyGraphDiagnostic[];
  readonly sites: ReadonlyMap<string, string>;
  readonly rawTargets: ReadonlyMap<string, string>;
} {
  const rootDir = resolve(options.rootDir ?? graph.rootDir);
  const project = new Project({
    tsConfigFilePath: resolve(
      rootDir,
      options.tsConfigFilePath ?? graph.tsConfigFilePath,
    ),
  });
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const accumulated = new Map<string, Accumulated>();
  const diagnostics: DependencyGraphDiagnostic[] = [];

  const add = (
    direction: ObligationDirection,
    component: DependencyGraphNode,
    candidate: Candidate,
    site: Site,
  ): void => {
    const key = `${component.id}\0${direction}\0${candidate.target.id}`;
    let known = accumulated.get(key);
    if (!known) {
      known = {
        direction,
        component,
        target: candidate.target,
        sites: new Set(),
        elements: new Set(),
        elementNames: new Set(),
        conditionPaths: new Map(),
      };
      accumulated.set(key, known);
    }
    const siteText = normaliseSite(site.text);
    const conditions = site.conditions;
    known.sites.add(
      `${siteText}${conditions.length > 0 ? ` [${conditionKey(conditions)}]` : ''}`,
    );
    known.conditionPaths.set(conditionKey(conditions), conditions);
    if (site.parsed) {
      known.elements.add(site.parsed.tag);
      if (site.parsed.name) known.elementNames.add(site.parsed.name);
    }
  };

  for (const component of graph.nodes.filter(
    (node) => node.kind === 'component',
  )) {
    const call = componentCall(project, component);
    const templates = templateImplementationParts(call?.getArguments()[3]);
    if (templates.length === 0) continue;
    const outgoing: Candidate[] = graph.edges
      .filter(
        (edge) =>
          edge.from === component.id &&
          usageIncludesTemplate(edge) &&
          (edge.kind === 'uses-property' || edge.kind === 'calls'),
      )
      .flatMap((edge) => {
        const target = nodes.get(edge.to);
        return target ? [{ edge, target, keys: edgeKeys(edge) }] : [];
      });
    // `calls` is not synonymous with a command. A call made while rendering
    // (`items.map`, a computed reader, …) is a render promise; only calls
    // found below an interactive handler are command promises.
    const renderCandidates = outgoing;
    const commandCandidates = outgoing.filter(
      (candidate) => candidate.edge.kind === 'calls',
    );

    for (const template of templates) {
      const handlers: Site[] = [];
      walkTemplate(template, (node) => {
        if (!Node.isCallExpression(node)) return undefined;
        if (
          node !== template &&
          node.getExpression().getText() === 'craftComponent'
        ) {
          return 'skip';
        }
        const parsed = parseCraftHyperscript(node);
        if (!parsed || !isInteractiveElement(parsed)) return undefined;
        handlers.push(
          ...handlerSites(parsed.props, parsed, conditionsFor(node)),
        );
        return undefined;
      });

      for (const handler of handlers) {
        for (const expression of reactiveExpressionsAt(handler.node)) {
          const resolved = resolvedCandidates(expression, commandCandidates);
          for (const candidate of resolved)
            add('command', component, candidate, handler);
        }
        for (const dynamic of dynamicReferencesIn(
          handler.node,
          templateParameterNames(template),
        )) {
          diagnostics.push(diagnosticFor(component, dynamic));
        }
      }

      const handlerNodes = handlers.map((handler) => handler.node);
      const parameters = templateParameterNames(template);
      for (const expression of collectReactiveExpressions(template)) {
        if (handlerNodes.some((handler) => isWithin(expression, handler)))
          continue;
        if (
          Node.isIdentifier(expression) &&
          parameters.has(expression.getText()) &&
          isBindingName(expression)
        ) {
          continue;
        }
        const resolved = resolvedCandidates(expression, renderCandidates);
        for (const candidate of resolved) {
          add('render', component, candidate, {
            text: expression.getText(),
            node: expression,
            conditions: conditionsFor(expression),
          });
        }
      }
      for (const dynamic of dynamicReferencesIn(template, parameters)) {
        if (handlerNodes.some((handler) => isWithin(dynamic, handler)))
          continue;
        diagnostics.push(diagnosticFor(component, dynamic));
      }
    }
  }

  const values = [...accumulated.values()].sort((left, right) =>
    `${left.component.id}:${left.direction}:${left.target.id}`.localeCompare(
      `${right.component.id}:${right.direction}:${right.target.id}`,
    ),
  );
  const obligations = values.map((value) => obligationOf(value, rootDir));
  return {
    obligations,
    diagnostics: diagnostics.filter(
      (diagnostic, index, all) =>
        all.findIndex(
          (candidate) =>
            candidate.message === diagnostic.message &&
            candidate.proof?.filePath === diagnostic.proof?.filePath &&
            candidate.proof?.line === diagnostic.proof?.line,
        ) === index,
    ),
    sites: new Map(
      values.map((value, index) => [
        (obligations[index] as TemplateObligation).subject,
        [...value.sites].sort().join('\n'),
      ]),
    ),
    rawTargets: new Map(
      values.map((value, index) => [
        (obligations[index] as TemplateObligation).subject,
        value.target.id,
      ]),
    ),
  };
}

export function createTemplateObligationIndex(
  graph: DependencyGraph,
  options: TemplateObligationOptions = {},
): TemplateObligationIndex {
  const rootDir = resolve(options.rootDir ?? graph.rootDir);
  const derived = derive(graph, options);
  const slices: SliceIndex = createSliceIndex(graph);
  const leaves = new Map<string, Readonly<Record<string, string>>>();

  const leavesFor = (
    obligation: TemplateObligation | string,
  ): Readonly<Record<string, string>> => {
    const subject =
      typeof obligation === 'string' ? obligation : obligation.subject;
    const known = leaves.get(subject);
    if (known) return known;
    const target = derived.rawTargets.get(subject);
    const site = derived.sites.get(subject);
    if (!target || site === undefined) {
      throw new Error(`template obligation: unknown subject '${subject}'.`);
    }
    const created = {
      [`site:${subject}`]: sha(site),
      ...portableLeaves(sliceOf(slices, target).leaves, rootDir),
    };
    leaves.set(subject, created);
    return created;
  };

  return {
    graph,
    obligations: derived.obligations,
    diagnostics: derived.diagnostics,
    leavesFor,
    fingerprintFor: (obligation) => fingerprintOf(leavesFor(obligation)),
  };
}

export function extractTemplateObligations(
  graph: DependencyGraph,
  options: TemplateObligationOptions = {},
): readonly TemplateObligation[] {
  return createTemplateObligationIndex(graph, options).obligations;
}
