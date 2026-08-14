import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  HostListener,
  inject,
  Injector,
  Injectable,
  input,
  OnInit,
  runInInjectionContext,
  signal,
  type Signal,
  type WritableSignal,
} from '@angular/core';
import { DOCUMENT, JsonPipe } from '@angular/common';
import {
  Edge,
  GroupNode,
  initializeModel,
  ModelAdapter,
  NgDiagramBaseEdgeComponent,
  NgDiagramComponent,
  NgDiagramEdgeTemplate,
  NgDiagramEdgeTemplateMap,
  NgDiagramGroupHighlightedDirective,
  NgDiagramGroupNodeTemplate,
  NgDiagramNodeTemplate,
  NgDiagramNodeTemplateMap,
  NgDiagramNodeResizeAdornmentComponent,
  NgDiagramNodeSelectedDirective,
  NgDiagramPortComponent,
  NgDiagramViewportService,
  NodeDragEndedEvent,
  NodeDragStartedEvent,
  Node as DiagramNode,
  provideNgDiagram,
  SelectionMovedEvent,
  SelectionChangedEvent,
} from 'ng-diagram';
import ELK, { type ElkNode } from 'elkjs/lib/elk.bundled';

type GraphStateContext<Value> = {
  state: Signal<Value>;
  set: (value: Value) => void;
  update: (updater: (value: Value) => Value) => void;
};

type GraphStateMethods = Record<string, (...args: never[]) => unknown>;

function state<
  Name extends string,
  Value,
  Methods extends GraphStateMethods,
>(
  name: Name,
  initialValue: Value,
  insertion: (context: GraphStateContext<Value>) => Methods,
): Record<Name, WritableSignal<Value> & Methods> {
  const value = signal(initialValue);
  const methods = insertion({
    state: value.asReadonly(),
    set: (nextValue) => value.set(nextValue),
    update: (updater) => value.update(updater),
  });
  return {
    [name]: Object.assign(value, methods),
  } as Record<Name, WritableSignal<Value> & Methods>;
}

function craftUse<Value>(value: Value): Value {
  return value;
}

type GraphNodeKind =
  | 'route'
  | 'route-hook'
  | 'component'
  | 'service'
  | 'property'
  | 'primitive'
  | 'source';

type GraphEdgeKind =
  | 'loads'
  | 'renders'
  | 'contains'
  | 'depends-on'
  | 'uses-property'
  | 'calls'
  | 'reads'
  | 'writes'
  | 'subscribes'
  | 'triggers';

type GraphNode = {
  id: string;
  kind: GraphNodeKind;
  label: string;
  filePath?: string;
  line?: number;
  details?: Record<string, unknown>;
};

type OverviewSummary = {
  memberCount: number;
  counts: Partial<Record<GraphNodeKind, number>>;
  sampleLabels: string[];
};

type ConstellationSummary = {
  weight: number;
  level: 'macro' | 'primitive' | 'property';
};

type HttpEndpoint = {
  method: string;
  url: string;
  line: number;
};

type TemporalOperation = {
  operation: string;
  delay?: string;
  line: number;
};

type FocusTechnology = 'all' | 'http' | 'temporal';
type FocusEntityKind = 'all' | 'route' | 'component' | 'service';
type FocusDepth = 'target' | 'level-1' | 'level-2' | 'components';

type GraphEdge = {
  from: string;
  to: string;
  kind: GraphEdgeKind;
  evidence: 'ast' | 'type';
  details?: Record<string, unknown>;
};

type DependencyGraph = {
  version: number;
  rootDir: string;
  tsConfigFilePath: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
};

type DiagramNodeData = {
  label: string;
  kind: GraphNodeKind;
  appStart: boolean;
  anonymous: boolean;
  usageLabel: string;
  externalRouteGhost: boolean;
  externalRouteBundle: boolean;
  externalRouteLabel?: string;
  externalRouteLabels: string[];
  externalRouteContentCount: number;
  filePath?: string;
  line?: number;
  externalRouteUses: string[];
  httpEndpoints: HttpEndpoint[];
  temporalOperations: TemporalOperation[];
  memberCount?: number;
  sourceNodeId?: string;
  groupRole?: 'host' | 'primitive';
  collapsed?: boolean;
  overview?: OverviewSummary;
  constellation?: ConstellationSummary;
};

type DiagramEdgeData = {
  kind: GraphEdgeKind;
  evidence: 'ast' | 'type';
  details: Record<string, unknown>;
};

type DiagramGraphNode = DiagramNode<DiagramNodeData>;
type DiagramGraphGroup = GroupNode<DiagramNodeData>;
type DiagramGraphAnyNode = DiagramGraphNode | DiagramGraphGroup;
type DiagramGraphEdge = Edge<DiagramEdgeData>;
type DiagramLayoutPosition = {
  column: number;
  row: number;
  x: number;
  y: number;
  width: number;
  height: number;
  groupId?: string;
  containerId?: string;
};
type DiagramLayout = Map<string, DiagramLayoutPosition>;
type DiagramLayoutResult = {
  layout: DiagramLayout;
  childrenByHost: Map<string, GraphNode[]>;
  childrenByPrimitive: Map<string, GraphNode[]>;
  displayLabelByNodeId: Map<string, string>;
  collapsedGroupIds: ReadonlySet<string>;
  collapsedMemberCountByGroupId: ReadonlyMap<string, number>;
  templateIdByComponent: Map<string, string>;
  width: number;
  height: number;
};

type ElkPosition = {
  x: number;
  y: number;
};

type DiagramProjection = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  collapsedGroupIds: ReadonlySet<string>;
  collapsedMemberCountByGroupId: ReadonlyMap<string, number>;
};

type GraphSearchResult = {
  node: GraphNode;
  displayLabelParts: SearchTextPart[];
  sourceLabelParts: SearchTextPart[];
};

type SearchTextPart = {
  text: string;
  matched: boolean;
};

const DIAGRAM_NODE_WIDTH = 260;
const DIAGRAM_NODE_HEIGHT = 92;
const GROUP_WIDTH = 330;
const GROUP_HEADER_HEIGHT = 54;
const GROUP_PADDING = 16;
const GROUP_CHILD_GAP = 12;
const PRIMITIVE_GROUP_HEADER_HEIGHT = 46;
const COLUMN_WIDTH = 500;
const ROW_GAP = 48;
const DIAGRAM_ORIGIN_X = 40;
const DIAGRAM_ORIGIN_Y = 40;
const CONSTELLATION_LAYOUT_MARGIN = 112;
const OVERVIEW_EDGE_KINDS = new Set<GraphEdgeKind>([
  'loads',
  'renders',
  'depends-on',
]);

@Injectable({ providedIn: 'root' })
class GraphHoverState {
  private edges: GraphEdge[] = [];
  private readonly hoveredNodeState = craftUse(
    state('hoveredNodeId', null as string | null, ({ set }) => ({
      setHoveredNodeId: (value: string | null) => set(value),
    })),
  );
  readonly hoveredNodeId = this.hoveredNodeState.hoveredNodeId;
  private readonly selectedNodeState = craftUse(
    state('selectedNodeId', null as string | null, ({ set }) => ({
      setSelectedNodeId: (value: string | null) => set(value),
    })),
  );
  private readonly selectedNodeId = this.selectedNodeState.selectedNodeId;
  private readonly activeNodeState = craftUse(
    state(
      'activeNodeIds',
      new Set<string>() as ReadonlySet<string>,
      ({ set }) => ({
        setActiveNodeIds: (value: ReadonlySet<string>) => set(value),
      }),
    ),
  );
  private readonly activeNodeIds = this.activeNodeState.activeNodeIds;
  private readonly activeEdgeState = craftUse(
    state(
      'activeEdgeKeys',
      new Set<string>() as ReadonlySet<string>,
      ({ set }) => ({
        setActiveEdgeKeys: (value: ReadonlySet<string>) => set(value),
      }),
    ),
  );
  private readonly activeEdgeKeys = this.activeEdgeState.activeEdgeKeys;

  setEdges(edges: GraphEdge[], nodeIds: Iterable<string>): void {
    this.edges = edges;
    const visibleNodeIds = new Set(nodeIds);
    const selectedNodeId = this.selectedNodeId();
    craftUse(this.hoveredNodeState.hoveredNodeId.setHoveredNodeId(null));
    if (selectedNodeId && visibleNodeIds.has(selectedNodeId)) {
      this.activateNode(selectedNodeId);
    } else {
      this.clear();
    }
  }

  hoverNode(nodeId: string): void {
    craftUse(this.hoveredNodeState.hoveredNodeId.setHoveredNodeId(nodeId));
    this.activateNode(nodeId);
  }

  clearNode(nodeId: string): void {
    if (this.hoveredNodeId() !== nodeId) return;
    craftUse(this.hoveredNodeState.hoveredNodeId.setHoveredNodeId(null));
    const persistentNodeId = this.selectedNodeId();
    if (persistentNodeId) this.activateNode(persistentNodeId);
    else this.clearActiveFocus();
  }

  selectNode(nodeId: string | null): void {
    craftUse(this.selectedNodeState.selectedNodeId.setSelectedNodeId(nodeId));
    const focusNodeId = this.hoveredNodeId() ?? nodeId;
    if (focusNodeId) this.activateNode(focusNodeId);
    else this.clearActiveFocus();
  }

  clearSelection(): void {
    craftUse(this.selectedNodeState.selectedNodeId.setSelectedNodeId(null));
    const focusNodeId = this.hoveredNodeId();
    if (focusNodeId) this.activateNode(focusNodeId);
    else this.clearActiveFocus();
  }

  isNodeDimmed(nodeId: string): boolean {
    return (
      (this.hoveredNodeId() !== null || this.selectedNodeId() !== null) &&
      !this.activeNodeIds().has(nodeId)
    );
  }

  isEdgeDimmed(edgeId: string): boolean {
    return (
      (this.hoveredNodeId() !== null || this.selectedNodeId() !== null) &&
      !this.activeEdgeKeys().has(edgeId)
    );
  }

  private clear(): void {
    craftUse(this.hoveredNodeState.hoveredNodeId.setHoveredNodeId(null));
    craftUse(this.selectedNodeState.selectedNodeId.setSelectedNodeId(null));
    this.clearActiveFocus();
  }

  private clearActiveFocus(): void {
    craftUse(this.activeNodeState.activeNodeIds.setActiveNodeIds(new Set()));
    craftUse(this.activeEdgeState.activeEdgeKeys.setActiveEdgeKeys(new Set()));
  }

  private activateNode(nodeId: string): void {
    const activeNodes = new Set([nodeId]);
    const activeEdgeKeys = new Set<string>();

    for (const edge of this.edges) {
      if (edge.from !== nodeId && edge.to !== nodeId) continue;
      activeNodes.add(edge.from);
      activeNodes.add(edge.to);
      activeEdgeKeys.add(this.edgeKey(edge));
    }

    const pendingChildren = [nodeId];
    const visitedContainers = new Set([nodeId]);
    while (pendingChildren.length > 0) {
      const parentId = pendingChildren.shift();
      if (!parentId) continue;
      for (const edge of this.edges) {
        if (edge.kind !== 'contains' || edge.from !== parentId) continue;
        activeNodes.add(edge.to);
        activeEdgeKeys.add(this.edgeKey(edge));
        if (!visitedContainers.has(edge.to)) {
          visitedContainers.add(edge.to);
          pendingChildren.push(edge.to);
        }
      }
    }

    craftUse(this.activeNodeState.activeNodeIds.setActiveNodeIds(activeNodes));
    craftUse(
      this.activeEdgeState.activeEdgeKeys.setActiveEdgeKeys(activeEdgeKeys),
    );
  }

  private edgeKey(edge: GraphEdge): string {
    return `${edge.from}|${edge.kind}|${edge.to}`;
  }
}

@Injectable({ providedIn: 'root' })
class GraphConstellationFocusState {
  private readonly focusedNodeState = craftUse(
    state('focusedNodeId', null as string | null, ({ set }) => ({
      focus: (value: string) => set(value),
      clear: () => set(null),
    })),
  );
  readonly focusedNodeId = this.focusedNodeState.focusedNodeId;

  focus(nodeId: string): void {
    craftUse(this.focusedNodeState.focusedNodeId.focus(nodeId));
  }

  clear(): void {
    craftUse(this.focusedNodeState.focusedNodeId.clear());
  }
}

@Injectable({ providedIn: 'root' })
class GraphExternalRouteFocusState {
  private readonly routeState = craftUse(
    state('routeLabel', null as string | null, ({ set }) => ({
      focus: (value: string) => set(value),
      clear: () => set(null),
    })),
  );
  readonly routeLabel = this.routeState.routeLabel;

  focus(routeLabel: string): void {
    craftUse(this.routeState.routeLabel.focus(routeLabel));
  }

  clear(): void {
    craftUse(this.routeState.routeLabel.clear());
  }
}

@Injectable({ providedIn: 'root' })
class GraphExternalRouteBundleState {
  private readonly expandedState = craftUse(
    state('expanded', false, ({ set, update }) => ({
      toggle: () => update((value) => !value),
      clear: () => set(false),
    })),
  );
  readonly expanded = this.expandedState.expanded;

  toggle(): void {
    craftUse(this.expandedState.expanded.toggle());
  }

  clear(): void {
    craftUse(this.expandedState.expanded.clear());
  }
}

@Injectable({ providedIn: 'root' })
class GraphExternalRouteContentState {
  private readonly expandedState = craftUse(
    state(
      'expandedRouteLabels',
      new Set<string>() as ReadonlySet<string>,
      ({ set, update }) => ({
        toggle: (routeLabel: string) =>
          update((current) => {
            const next = new Set(current);
            if (next.has(routeLabel)) next.delete(routeLabel);
            else next.add(routeLabel);
            return next;
          }),
        clear: () => set(new Set()),
      }),
    ),
  );
  readonly expandedRouteLabels = this.expandedState.expandedRouteLabels;

  isExpanded(routeLabel: string): boolean {
    return this.expandedRouteLabels().has(routeLabel);
  }

  toggle(routeLabel: string): void {
    craftUse(this.expandedState.expandedRouteLabels.toggle(routeLabel));
  }

  clear(): void {
    craftUse(this.expandedState.expandedRouteLabels.clear());
  }
}

@Injectable({ providedIn: 'root' })
class GraphCollapseState {
  private readonly collapsedState = craftUse(
    state(
      'collapsedIds',
      new Set<string>() as ReadonlySet<string>,
      ({ set }) => ({
        setCollapsedIds: (value: ReadonlySet<string>) => set(value),
      }),
    ),
  );
  readonly collapsedIds = this.collapsedState.collapsedIds;

  isCollapsed(nodeId: string): boolean {
    return this.collapsedIds().has(nodeId);
  }

  toggle(nodeId: string): void {
    const next = new Set(this.collapsedIds());
    if (next.has(nodeId)) next.delete(nodeId);
    else next.add(nodeId);
    craftUse(this.collapsedState.collapsedIds.setCollapsedIds(next));
  }

  setCollapsed(nodeIds: Iterable<string>): void {
    craftUse(
      this.collapsedState.collapsedIds.setCollapsedIds(new Set(nodeIds)),
    );
  }

  expandAll(): void {
    craftUse(this.collapsedState.collapsedIds.setCollapsedIds(new Set()));
  }
}

type CodePreviewTarget = {
  id: string;
  label: string;
  kind: GraphNodeKind;
  filePath?: string;
  line?: number;
};

type CodePreviewAnchor = {
  top: number;
  right: number;
  left: number;
};

type CodePreviewLine = {
  number: number;
  tokens: CodePreviewToken[];
};

type CodePreviewToken = {
  kind:
    | 'plain'
    | 'comment'
    | 'string'
    | 'decorator'
    | 'keyword'
    | 'number'
    | 'type'
    | 'function';
  text: string;
};

@Injectable({ providedIn: 'root' })
class GraphCodePreviewState {
  private readonly targetState = craftUse(
    state('target', null as CodePreviewTarget | null, ({ set }) => ({
      setTarget: (value: CodePreviewTarget | null) => set(value),
    })),
  );
  readonly target = this.targetState.target;
  private readonly anchorState = craftUse(
    state('anchor', null as CodePreviewAnchor | null, ({ set }) => ({
      setAnchor: (value: CodePreviewAnchor | null) => set(value),
    })),
  );
  readonly anchor = this.anchorState.anchor;
  private readonly contentState = craftUse(
    state('content', null as string | null, ({ set }) => ({
      setContent: (value: string | null) => set(value),
    })),
  );
  readonly content = this.contentState.content;
  private readonly loadingState = craftUse(
    state('loading', false, ({ set }) => ({
      setLoading: (value: boolean) => set(value),
    })),
  );
  readonly loading = this.loadingState.loading;
  private readonly errorState = craftUse(
    state('error', null as string | null, ({ set }) => ({
      setError: (value: string | null) => set(value),
    })),
  );
  readonly error = this.errorState.error;
  readonly lines = computed<CodePreviewLine[]>(() =>
    (this.content() ?? '').split(/\r?\n/).map((text, index) => ({
      number: index + 1,
      tokens: this.highlightLine(text),
    })),
  );
  readonly position = computed(() => {
    const anchor = this.anchor();
    if (!anchor || typeof window === 'undefined') {
      return { top: 16, left: 16 };
    }

    const width = Math.min(720, window.innerWidth - 32);
    const left =
      anchor.right + 14 + width <= window.innerWidth - 16
        ? anchor.right + 14
        : Math.max(16, anchor.left - width - 14);
    const top = Math.max(
      16,
      Math.min(anchor.top - 12, window.innerHeight - 560),
    );
    return { top, left };
  });

  private readonly cache = new Map<string, string>();
  private requestId = 0;

  private readonly tokenPattern =
    /\/\/.*$|\/\*.*?\*\/|`(?:\\.|[^`])*`|'(?:\\.|[^'])*'|"(?:\\.|[^"])*"|@[A-Za-z_$][\w$]*|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$]*(?=\s*\()|\b[A-Za-z_$][\w$]*\b/g;
  private readonly keywords = new Set([
    'as',
    'async',
    'await',
    'case',
    'catch',
    'class',
    'const',
    'else',
    'export',
    'extends',
    'finally',
    'for',
    'from',
    'function',
    'if',
    'implements',
    'import',
    'in',
    'interface',
    'new',
    'of',
    'private',
    'protected',
    'public',
    'readonly',
    'return',
    'static',
    'throw',
    'try',
    'type',
    'typeof',
    'undefined',
    'void',
  ]);
  private readonly types = new Set([
    'boolean',
    'Date',
    'Map',
    'number',
    'Promise',
    'Record',
    'Set',
    'string',
    'unknown',
  ]);

  show(target: CodePreviewTarget, anchorElement: HTMLElement): void {
    if (!target.filePath) return;
    const rect = anchorElement.getBoundingClientRect();
    craftUse(
      this.anchorState.anchor.setAnchor({
        top: rect.top,
        right: rect.right,
        left: rect.left,
      }),
    );
    craftUse(this.targetState.target.setTarget(target));
    craftUse(this.errorState.error.setError(null));
    const cached = this.cache.get(target.filePath);
    if (cached !== undefined) {
      craftUse(this.contentState.content.setContent(cached));
      craftUse(this.loadingState.loading.setLoading(false));
      return;
    }

    craftUse(this.contentState.content.setContent(null));
    craftUse(this.loadingState.loading.setLoading(true));
    const requestId = ++this.requestId;
    void this.load(target.filePath, requestId);
  }

  toggle(target: CodePreviewTarget, anchorElement: HTMLElement): void {
    if (this.target()?.id === target.id) {
      this.close();
      return;
    }
    this.show(target, anchorElement);
  }

  close(): void {
    craftUse(this.targetState.target.setTarget(null));
    craftUse(this.anchorState.anchor.setAnchor(null));
    craftUse(this.errorState.error.setError(null));
    craftUse(this.contentState.content.setContent(null));
  }

  private async load(filePath: string, requestId: number): Promise<void> {
    try {
      const sourcePath = this.toSourceAssetPath(filePath);
      if (!sourcePath) throw new Error('Chemin source non disponible.');
      const response = await fetch(sourcePath);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const content = await response.text();
      if (requestId !== this.requestId) return;
      this.cache.set(filePath, content);
      craftUse(this.contentState.content.setContent(content));
      craftUse(this.errorState.error.setError(null));
    } catch (loadError) {
      if (requestId !== this.requestId) return;
      craftUse(this.contentState.content.setContent(null));
      craftUse(
        this.errorState.error.setError(
          loadError instanceof Error
            ? loadError.message
            : 'Impossible de charger le code source.',
        ),
      );
    } finally {
      if (requestId === this.requestId) {
        craftUse(this.loadingState.loading.setLoading(false));
      }
    }
  }

  private highlightLine(text: string): CodePreviewToken[] {
    const tokens: CodePreviewToken[] = [];
    let cursor = 0;

    for (const match of text.matchAll(this.tokenPattern)) {
      const tokenText = match[0];
      const index = match.index ?? cursor;
      if (index > cursor) {
        tokens.push({ kind: 'plain', text: text.slice(cursor, index) });
      }
      tokens.push({ kind: this.tokenKind(tokenText), text: tokenText });
      cursor = index + tokenText.length;
    }

    if (cursor < text.length) {
      tokens.push({ kind: 'plain', text: text.slice(cursor) });
    }
    return tokens.length > 0 ? tokens : [{ kind: 'plain', text: '' }];
  }

  private tokenKind(token: string): CodePreviewToken['kind'] {
    if (token.startsWith('//') || token.startsWith('/*')) return 'comment';
    if (token[0] === '`' || token[0] === "'" || token[0] === '"') {
      return 'string';
    }
    if (token.startsWith('@')) return 'decorator';
    if (/^\d/.test(token)) return 'number';
    if (this.keywords.has(token)) return 'keyword';
    if (this.types.has(token) || /^[A-Z]/.test(token)) return 'type';
    return 'plain';
  }

  private toSourceAssetPath(filePath: string): string | null {
    const match = filePath.match(/(?:^|\/)((?:apps|libs)\/.*)$/);
    if (!match?.[1]) return null;
    const encodedPath = match[1]
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    return `source/${encodedPath}`;
  }
}

const EDGE_KINDS: GraphEdgeKind[] = [
  'loads',
  'renders',
  'contains',
  'depends-on',
  'uses-property',
  'calls',
  'reads',
  'writes',
  'subscribes',
  'triggers',
];

const NODE_COLUMNS: Record<GraphNodeKind, number> = {
  route: 0,
  'route-hook': 0,
  component: 1,
  service: 2,
  primitive: 3,
  source: 2,
  property: 4,
};

@Component({
  selector: 'app-graph-node-template',
  imports: [NgDiagramPortComponent],
  template: `
    <article
      class="graph-node"
      [class]="'node-' + node().data.kind"
      [class.is-constellation]="node().data.constellation"
      [class.is-major-constellation]="
        (node().data.constellation?.weight ?? 0) >= 3
      "
      [class.is-app-start]="node().data.appStart"
      [class.is-external-route-ghost]="node().data.externalRouteGhost"
      [class.is-external-route-bundle]="node().data.externalRouteBundle"
      [class.is-http-client]="node().data.httpEndpoints.length > 0"
      [class.is-temporal]="node().data.temporalOperations.length > 0"
      [class.is-log-node]="isLogNode()"
      [attr.title]="node().data.constellation ? constellationTitle() : null"
      [class.is-dimmed]="hoverState.isNodeDimmed(node().id)"
      (mouseenter)="hoverState.hoverNode(node().id)"
      (mouseleave)="hoverState.clearNode(node().id)"
    >
      <ng-diagram-port id="in" type="both" side="left" />
      <ng-diagram-port id="top" type="both" side="top" />
      @if (node().data.filePath) {
        <button
          type="button"
          class="code-preview-button"
          aria-label="Prévisualiser le code"
          title="Prévisualiser le code"
          (pointerdown)="stopEvent($event)"
          (click)="toggleCodePreview($event)"
        >
          &lt;/&gt;
        </button>
      }
      @if (node().data.constellation) {
        <button
          type="button"
          class="constellation-focus-button"
          aria-label="Ouvrir la vue détaillée"
          title="Ouvrir la vue détaillée"
          (pointerdown)="openConstellationDetail($event)"
          (click)="stopEvent($event)"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
            <circle cx="12" cy="12" r="2.6" />
          </svg>
        </button>
      }
      @if (node().data.externalRouteGhost) {
        @if (node().data.externalRouteBundle) {
          <button
            type="button"
            class="external-route-bundle-toggle"
            [attr.aria-expanded]="externalRouteBundle.expanded()"
            [attr.aria-label]="
              externalRouteBundle.expanded()
                ? 'Replier les routes utilisées ailleurs'
                : 'Développer les routes utilisées ailleurs'
            "
            [attr.title]="
              externalRouteBundle.expanded()
                ? 'Replier les routes utilisées ailleurs'
                : 'Afficher les routes utilisées ailleurs'
            "
            (pointerdown)="stopEvent($event)"
            (click)="toggleExternalRouteBundle($event)"
          >
            <span class="external-route-bundle-chevron">
              {{ externalRouteBundle.expanded() ? '▾' : '▸' }}
            </span>
            <span>
              {{ externalRouteBundle.expanded() ? '↙ routes externes ouvertes' : '↗ utilisé ailleurs' }}
            </span>
          </button>
          <span class="external-route-bundle-count">
            {{ node().data.externalRouteLabels.length }} routes · cliquer pour
            {{ externalRouteBundle.expanded() ? 'replier' : 'développer' }}
          </span>
        } @else {
          <button
            type="button"
            class="external-route-focus-button"
            aria-label="Ouvrir cette route"
            title="Ouvrir la vue de cette route"
            (pointerdown)="openExternalRoute($event)"
            (click)="stopEvent($event)"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
              <circle cx="12" cy="12" r="2.6" />
            </svg>
          </button>
          <span class="external-route-badge">↗ utilisé ailleurs</span>
          @if (node().data.externalRouteContentCount > 0) {
            <button
              type="button"
              class="external-route-content-toggle"
              [attr.aria-expanded]="externalRouteContentExpanded()"
              [attr.aria-label]="
                externalRouteContentExpanded()
                  ? 'Replier le contenu de cette route'
                  : 'Afficher le contenu de cette route'
              "
              (pointerdown)="stopEvent($event)"
              (click)="toggleExternalRouteContent($event)"
            >
              {{ externalRouteContentExpanded() ? '▾' : '▸' }}
              contenu · {{ node().data.externalRouteContentCount }}
            </button>
          }
        }
      }
      <div class="node-kicker">{{ node().data.kind }}</div>
      @if (node().data.overview; as overview) {
        <div class="node-label">
          {{
            overview.sampleLabels.length > 0
              ? overview.sampleLabels[0]
              : node().data.label
          }}
        </div>
        <div class="node-overview-context">{{ node().data.label }}</div>
      } @else {
        <div class="node-label">{{ node().data.label }}</div>
      }
      @if (node().data.appStart) {
        <span class="app-start-badge">⚡ app start</span>
      }
      @if (node().data.anonymous) {
        <span class="anonymous-badge">nom inféré</span>
      }
      <div class="node-usage">{{ node().data.usageLabel }}</div>
      @if (node().data.overview; as overview) {
        <div class="node-overview-summary">
          {{ overview.memberCount }} éléments · {{ summaryLabel(overview) }}
        </div>
      }
      @if (node().data.constellation; as constellation) {
        <div class="node-constellation-summary">
          poids {{ constellation.weight }}
        </div>
      }
      @if (node().data.httpEndpoints.length > 0) {
        <div class="http-client-endpoints">
          @for (
            endpoint of node().data.httpEndpoints;
            track endpoint.line + endpoint.method + endpoint.url
          ) {
            <span>{{ endpoint.method }} {{ endpoint.url }}</span>
          }
        </div>
      }
      @if (node().data.temporalOperations.length > 0) {
        <div class="temporal-client-endpoints">
          @for (
            operation of node().data.temporalOperations;
            track operation.line + operation.operation
          ) {
            <span>{{ operation.operation }}{{ operation.delay ? '(' + operation.delay + ')' : '' }}</span>
          }
        </div>
      }
      @if (node().data.externalRouteUses.length > 0) {
        <div class="node-warning">
          Used by {{ node().data.externalRouteUses.length }} other route(s)
        </div>
      }
      @if (node().data.line) {
        <div class="node-source">L{{ node().data.line }}</div>
      }
      <ng-diagram-port id="out" type="source" side="right" />
      <ng-diagram-port id="bottom" type="both" side="bottom" />
    </article>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 100%;
      }

      .graph-node {
        position: relative;
        box-sizing: border-box;
        width: 100%;
        height: 100%;
        overflow: hidden;
        border: 2px solid #cbd5e1;
        border-radius: 10px;
        padding: 11px 15px;
        background: #fff;
        box-shadow: 0 5px 16px #0f172a22;
      }

      .graph-node.is-constellation {
        overflow: visible;
      }

      .code-preview-button {
        position: absolute;
        top: 7px;
        right: 8px;
        z-index: 2;
        display: inline-grid;
        width: 26px;
        height: 22px;
        place-items: center;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        padding: 0;
        color: #475569;
        background: #ffffffcc;
        cursor: help;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 10px;
        font-weight: 800;
      }

      .code-preview-button:hover,
      .code-preview-button:focus-visible {
        border-color: #8b5cf6;
        color: #6d28d9;
        background: #f5f3ff;
        outline: none;
      }

      .graph-node.node-route {
        border-color: #64748b;
        background: #f8fafc;
      }
      .graph-node.node-component {
        border-color: #8b5cf6;
        background: #faf5ff;
      }
      .graph-node.node-service {
        border-color: #14b8a6;
        background: #f0fdfa;
      }
      .graph-node.is-app-start {
        border-color: #f59e0b;
        background: #fff7ed;
        box-shadow:
          0 0 0 2px #fed7aa,
          0 5px 16px #0f172a22;
      }
      .graph-node.is-external-route-ghost {
        border-color: #94a3b8;
        border-style: dashed;
        opacity: 0.38;
        background: #f8fafc;
        box-shadow: none;
      }

      .graph-node.is-external-route-bundle {
        border-color: #94a3b8;
        opacity: 0.58;
        background: #f1f5f9;
        box-shadow: 0 4px 14px #64748b1c;
      }

      .graph-node.is-external-route-ghost:hover {
        opacity: 0.72;
      }
      .graph-node.node-property {
        border-color: #60a5fa;
        background: #eff6ff;
      }
      .graph-node.node-primitive {
        border-color: #f59e0b;
        background: #fffbeb;
      }
      .graph-node.node-source {
        border-color: #06b6d4;
        background: #ecfeff;
      }
      .graph-node.is-http-client {
        border-color: #f59e0b;
        background: #fff7ed;
        box-shadow:
          0 0 0 3px #fde68a,
          0 0 22px 6px #fbbf2466,
          0 5px 16px #c2410c30;
      }

      .graph-node {
        transition:
          opacity 0.15s ease,
          filter 0.15s ease;
      }
      .graph-node.is-dimmed {
        opacity: 0.16;
        filter: grayscale(0.8);
      }

      .graph-node.is-overview {
        border-style: dashed;
        box-shadow: 0 4px 12px #0f172a18;
      }

      .graph-node.is-constellation {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        padding: 12px;
        text-align: center;
        box-shadow: 0 5px 18px #0f172a2c;
      }

      .graph-node.is-constellation.is-http-client {
        border-color: #f59e0b;
        background: #fff7ed;
        box-shadow:
          0 0 0 4px #fde68a,
          0 0 30px 9px #fbbf2477,
          0 5px 18px #c2410c26;
      }

      .graph-node.is-constellation .code-preview-button,
      .graph-node.is-constellation .http-client-endpoints,
      .graph-node.is-constellation .temporal-client-endpoints,
      .graph-node.is-constellation .node-warning,
      .graph-node.is-constellation .node-source,
      .graph-node.is-constellation .node-usage,
      .graph-node.is-constellation .anonymous-badge {
        display: none;
      }

      .graph-node.is-constellation .node-kicker {
        font-size: 8px;
      }

      .graph-node.is-constellation .node-label {
        display: -webkit-box;
        margin-top: 3px;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 3;
        font-size: 11px;
        line-height: 1.1;
        text-overflow: ellipsis;
        overflow-wrap: anywhere;
      }

      .graph-node.is-constellation.node-property .node-kicker,
      .graph-node.is-constellation.node-primitive .node-kicker {
        display: block;
        font-size: 7px;
      }

      .graph-node.is-constellation.node-property,
      .graph-node.is-constellation.node-primitive {
        padding: 10px;
      }

      .graph-node.is-constellation.node-property .node-label,
      .graph-node.is-constellation.node-primitive .node-label {
        display: -webkit-box;
        max-width: 100%;
        font-size: 9px;
        line-height: 1.05;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 3;
      }

      .graph-node.is-constellation.node-property .node-constellation-summary,
      .graph-node.is-constellation.node-primitive .node-constellation-summary {
        margin: 0;
        font-size: 9px;
      }

      .graph-node.is-constellation ng-diagram-port {
        opacity: 0;
      }

      .graph-node.is-constellation .node-constellation-summary {
        margin-top: 3px;
        font-size: 8px;
      }

      .constellation-focus-button {
        position: absolute;
        top: 5px;
        right: 5px;
        z-index: 2;
        display: grid;
        width: 22px;
        height: 22px;
        padding: 3px;
        place-items: center;
        border: 1px solid #c4b5fd;
        border-radius: 999px;
        color: #6d28d9;
        background: #ffffffdd;
        pointer-events: auto;
      }

      .graph-node.is-constellation .constellation-focus-button {
        display: grid !important;
        visibility: visible;
        opacity: 1;
      }

      .graph-node.is-constellation.node-property .constellation-focus-button,
      .graph-node.is-constellation.node-primitive .constellation-focus-button {
        top: 2px;
        right: 2px;
        width: 18px;
        height: 18px;
        padding: 2px;
      }

      .graph-node.is-constellation.node-property .constellation-focus-button svg,
      .graph-node.is-constellation.node-primitive .constellation-focus-button svg {
        width: 11px;
        height: 11px;
      }

      .constellation-focus-button:hover,
      .constellation-focus-button:focus-visible {
        color: #fff;
        background: #7c3aed;
      }

      .constellation-focus-button svg {
        width: 14px;
        height: 14px;
        fill: none;
        stroke: currentColor;
        stroke-linecap: round;
        stroke-linejoin: round;
        stroke-width: 1.8;
      }

      .node-kicker,
      .node-source {
        color: #64748b;
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .app-start-badge {
        display: inline-flex;
        align-items: center;
        width: fit-content;
        margin-top: 7px;
        border: 1px solid #fdba74;
        border-radius: 999px;
        padding: 3px 7px;
        color: #9a3412;
        background: #ffedd5;
        font-size: 10px;
        font-weight: 800;
      }

      .anonymous-badge {
        display: inline-flex;
        width: fit-content;
        margin-top: 7px;
        border: 1px solid #cbd5e1;
        border-radius: 999px;
        padding: 3px 7px;
        color: #475569;
        background: #f1f5f9;
        font-size: 10px;
        font-weight: 800;
      }

      .node-usage {
        margin-top: 7px;
        overflow: hidden;
        color: #64748b;
        font-size: 10px;
        font-weight: 700;
        line-height: 1.2;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .external-route-badge {
        display: inline-flex;
        width: fit-content;
        margin-top: 7px;
        border: 1px solid #cbd5e1;
        border-radius: 999px;
        padding: 3px 7px;
        color: #64748b;
        background: #f1f5f9;
        font-size: 10px;
        font-weight: 800;
      }

      .external-route-content-toggle {
        display: inline-flex;
        align-items: center;
        width: fit-content;
        gap: 3px;
        margin-top: 5px;
        border: 1px solid #cbd5e1;
        border-radius: 999px;
        padding: 3px 7px;
        color: #64748b;
        background: #ffffffaa;
        cursor: pointer;
        font-size: 10px;
        font-weight: 800;
      }

      .external-route-content-toggle:hover,
      .external-route-content-toggle:focus-visible {
        color: #334155;
        background: #fff;
        outline: none;
      }

      .external-route-bundle-toggle {
        display: inline-flex;
        align-items: center;
        width: fit-content;
        gap: 4px;
        margin-top: 7px;
        border: 1px solid #cbd5e1;
        border-radius: 999px;
        padding: 3px 7px;
        color: #475569;
        background: #ffffffcc;
        cursor: pointer;
        font-size: 10px;
        font-weight: 800;
      }

      .external-route-bundle-toggle:hover,
      .external-route-bundle-toggle:focus-visible {
        color: #172033;
        background: #fff;
        outline: none;
      }

      .external-route-bundle-chevron {
        font-size: 12px;
        line-height: 1;
      }

      .external-route-bundle-count {
        display: block;
        margin-top: 4px;
        color: #64748b;
        font-size: 10px;
        font-weight: 700;
      }

      .external-route-focus-button {
        position: absolute;
        top: 6px;
        left: 8px;
        z-index: 2;
        display: grid;
        width: 22px;
        height: 22px;
        place-items: center;
        border: 1px solid #cbd5e1;
        border-radius: 999px;
        padding: 3px;
        color: #64748b;
        background: #ffffffdd;
      }

      .external-route-focus-button:hover,
      .external-route-focus-button:focus-visible {
        color: #172033;
        background: #fff;
        outline: none;
      }

      .external-route-focus-button svg {
        width: 14px;
        height: 14px;
        fill: none;
        stroke: currentColor;
        stroke-linecap: round;
        stroke-linejoin: round;
        stroke-width: 1.8;
      }

      .node-label {
        margin-top: 5px;
        overflow: hidden;
        color: #172033;
        font-size: 14px;
        font-weight: 800;
        line-height: 1.2;
        overflow-wrap: anywhere;
      }

      .node-overview-context {
        max-width: 100%;
        overflow: hidden;
        color: #64748b;
        font-size: 8px;
        font-weight: 700;
        line-height: 1.1;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .node-overview-summary {
        margin-top: 6px;
        overflow: hidden;
        color: #64748b;
        font-size: 10px;
        font-weight: 700;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .node-constellation-summary {
        margin-top: 6px;
        color: #92400e;
        font-size: 10px;
        font-weight: 800;
        text-transform: uppercase;
        white-space: nowrap;
      }

      .node-source {
        margin-top: 7px;
        font-size: 9px;
      }

      .http-client-endpoints {
        display: grid;
        gap: 2px;
        margin-top: 5px;
        overflow: hidden;
        color: #c2410c;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 9px;
        font-weight: 800;
        line-height: 1.2;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .http-client-endpoints span {
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .temporal-client-endpoints {
        display: grid;
        gap: 2px;
        margin-top: 5px;
        overflow: hidden;
        color: #f9a8d4;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 9px;
        font-weight: 800;
        line-height: 1.2;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .temporal-client-endpoints span {
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .node-warning {
        display: inline-block;
        margin-top: 7px;
        border-radius: 999px;
        padding: 4px 8px;
        color: #92400e;
        background: #fef3c7;
        font-size: 11px;
        font-weight: 800;
      }

      /* Nebula palette shared by detailed, constellation and collision nodes. */
      .graph-node {
        border-color: #53649a;
        color: #e6edff;
        background: linear-gradient(145deg, #172143ee, #0d1530ee);
        box-shadow: 0 0 22px #4f46e533, 0 8px 20px #02061766;
      }

      .graph-node.node-route {
        border-color: #60a5fa;
        background: linear-gradient(145deg, #142d58ee, #0b1734ee);
        box-shadow: 0 0 0 1px #60a5fa22, 0 0 20px #60a5fa55, 0 8px 20px #02061766;
      }

      .graph-node.node-component {
        border-color: #a78bfa;
        background: linear-gradient(145deg, #2a1d54ee, #17163bee);
        box-shadow: 0 0 0 1px #a78bfa22, 0 0 20px #a78bfa55, 0 8px 20px #02061766;
      }

      .graph-node.node-service {
        border-color: #2dd4bf;
        background: linear-gradient(145deg, #103d44ee, #0c2238ee);
        box-shadow: 0 0 0 1px #2dd4bf22, 0 0 20px #2dd4bf55, 0 8px 20px #02061766;
      }

      .graph-node.node-property {
        border-color: #60a5fa;
        background: linear-gradient(145deg, #12365fee, #0d1d3aee);
        box-shadow: 0 0 0 1px #60a5fa22, 0 0 16px #60a5fa44, 0 8px 20px #02061766;
      }

      .graph-node.node-primitive {
        border-color: #fbbf24;
        background: linear-gradient(145deg, #44301bee, #241b24ee);
        box-shadow: 0 0 0 1px #fbbf2422, 0 0 18px #fbbf2455, 0 8px 20px #02061766;
      }

      .graph-node.node-source {
        border-color: #22d3ee;
        background: linear-gradient(145deg, #103e4bee, #0c2539ee);
        box-shadow: 0 0 0 1px #22d3ee22, 0 0 18px #22d3ee55, 0 8px 20px #02061766;
      }

      .graph-node.is-constellation {
        background:
          radial-gradient(circle at 30% 23%, #ffffffcc 0, #c4b5fd66 3%, transparent 18%),
          radial-gradient(circle at 50% 48%, #182348ee 0, #0b1230ee 58%, #020617f2 100%);
        box-shadow:
          0 0 0 1px #ffffff33,
          0 0 18px #c4b5fd66,
          0 0 42px #6366f133,
          0 8px 22px #020617aa;
      }

      .graph-node.is-constellation::before {
        position: absolute;
        inset: 0;
        border-radius: inherit;
        background: linear-gradient(
          135deg,
          #ffffff3d 0,
          #ffffff00 18%,
          transparent 38%
        );
        content: '';
        opacity: 0.45;
        pointer-events: none;
        mix-blend-mode: screen;
      }

      .graph-node.is-constellation > * {
        position: relative;
        z-index: 1;
      }

      .graph-node.is-constellation.is-major-constellation::after {
        position: absolute;
        top: 12%;
        right: 16%;
        z-index: 1;
        width: 18px;
        height: 18px;
        border-radius: 2px;
        background: #fff4c7;
        box-shadow: 0 0 12px #fff4c7cc;
        clip-path: polygon(
          50% 0,
          61% 39%,
          100% 50%,
          61% 61%,
          50% 100%,
          39% 61%,
          0 50%,
          39% 39%
        );
        content: '';
        pointer-events: none;
      }

      .graph-node.is-constellation.node-route {
        border-color: #60a5fa;
        background:
          radial-gradient(circle at 30% 23%, #ffffffdd 0, #bfdbfe66 3%, transparent 18%),
          radial-gradient(circle at 50% 48%, #142d58ee 0, #0b1734ee 58%, #020617f2 100%);
        box-shadow:
          0 0 0 1px #dbeafe55,
          0 0 20px #60a5fa88,
          0 0 44px #2563eb44,
          0 8px 22px #020617aa;
      }

      .graph-node.is-constellation.node-component {
        border-color: #a78bfa;
        background:
          radial-gradient(circle at 30% 23%, #ffffffdd 0, #ddd6fe66 3%, transparent 18%),
          radial-gradient(circle at 50% 48%, #2a1d54ee 0, #17163bee 58%, #050817f2 100%);
        box-shadow:
          0 0 0 1px #ede9fe55,
          0 0 20px #a78bfa88,
          0 0 44px #7c3aed44,
          0 8px 22px #020617aa;
      }

      .graph-node.is-constellation.node-service {
        border-color: #2dd4bf;
        background:
          radial-gradient(circle at 30% 23%, #ffffffdd 0, #ccfbf166 3%, transparent 18%),
          radial-gradient(circle at 50% 48%, #103d44ee 0, #0c2238ee 58%, #020617f2 100%);
        box-shadow:
          0 0 0 1px #ccfbf155,
          0 0 20px #2dd4bf88,
          0 0 44px #0d948844,
          0 8px 22px #020617aa;
      }

      .graph-node.is-constellation.node-source {
        border-color: #22d3ee;
        background:
          radial-gradient(circle at 30% 23%, #ffffffdd 0, #cffafe66 3%, transparent 18%),
          radial-gradient(circle at 50% 48%, #103e4bee 0, #0c2539ee 58%, #020617f2 100%);
        box-shadow:
          0 0 0 1px #cffafe55,
          0 0 20px #22d3ee88,
          0 0 44px #0891b244,
          0 8px 22px #020617aa;
      }

      .graph-node.is-temporal {
        box-shadow:
          0 0 0 2px #f9a8d433,
          0 0 28px 7px #ec489966,
          0 8px 20px #02061766;
      }

      .graph-node.is-constellation.is-temporal {
        box-shadow:
          0 0 0 1px #f9a8d477,
          0 0 24px #ec4899aa,
          0 0 50px #be185c44,
          0 8px 22px #020617aa;
      }

      .node-label {
        color: #f8fbff;
        text-shadow: 0 0 12px #a5b4fc44;
      }

      .node-kicker,
      .node-overview-summary,
      .node-overview-context,
      .node-source {
        color: #a5b4fc;
      }

      .node-constellation-summary {
        color: #fde68a;
        text-shadow: 0 0 10px #fbbf2466;
      }

      .http-client-endpoints {
        color: #fcd34d;
        text-shadow: 0 0 10px #f59e0b55;
      }

      /* Celestial Constellation: flat editorial map for constellation views. */
      :host-context(.celestial-view) .graph-node.is-constellation {
        border-color: #fff4c7;
        color: #262c3d;
        background: #fff4c7 !important;
        box-shadow: 0 0 0 1px #fff4c766, 0 0 16px #fff4c755 !important;
        text-shadow: none;
      }

      :host-context(.celestial-view)
        .graph-node.is-constellation::before {
        display: none;
      }

      :host-context(.celestial-view)
        .graph-node.is-constellation.node-route {
        border-color: #fff4c7;
        background: #dbeafe !important;
      }

      :host-context(.celestial-view)
        .graph-node.is-constellation.node-route-hook {
        border-color: #a5b4fc;
        background: #e0e7ff !important;
      }

      :host-context(.celestial-view)
        .graph-node.is-constellation.node-component {
        border-color: #c084fc;
        background: #f3e8ff !important;
      }

      :host-context(.celestial-view)
        .graph-node.is-constellation.node-service {
        border-color: #2dd4bf;
        background: #ccfbf1 !important;
      }

      :host-context(.celestial-view)
        .graph-node.is-constellation.node-source {
        border-color: #22d3ee;
        background: #cffafe !important;
      }

      :host-context(.celestial-view)
        .graph-node.is-constellation.is-app-start {
        border-color: #f59e0b;
        background: #ffedd5 !important;
      }

      :host-context(.celestial-view)
        .graph-node.is-constellation.is-major-constellation {
        box-shadow:
          0 0 0 2px #fff4c7,
          0 0 20px #fff4c7aa !important;
      }

      :host-context(.celestial-view)
        .graph-node.is-constellation.is-major-constellation::after {
        background: #262c3d;
        box-shadow: 0 0 0 2px #fff4c7, 0 0 12px #fff4c7;
      }

      :host-context(.celestial-view)
        .graph-node.is-constellation
        .node-kicker,
      :host-context(.celestial-view)
        .graph-node.is-constellation
        .node-constellation-summary {
        color: #596176;
        text-shadow: none;
      }

      :host-context(.celestial-view)
        .graph-node.is-constellation
        .node-label {
        color: #262c3d;
        text-shadow: none;
      }

      /* Constellation nodes use the same nebula cards as the other views. */
      .graph-node.is-constellation {
        container-type: size;
        box-shadow: 0 0 22px #4f46e533, 0 8px 20px #02061766;
      }

      .graph-node.is-constellation::before,
      .graph-node.is-constellation::after {
        display: none;
      }

      .graph-node.is-constellation.node-route {
        border-color: #60a5fa;
        background: linear-gradient(145deg, #142d58ee, #0b1734ee);
        box-shadow: 0 0 0 1px #60a5fa22, 0 0 20px #60a5fa55, 0 8px 20px #02061766;
      }

      .graph-node.is-constellation.node-route-hook {
        border-color: #818cf8;
        background: linear-gradient(145deg, #25255aee, #151a3bee);
        box-shadow: 0 0 0 1px #818cf822, 0 0 18px #818cf855, 0 8px 20px #02061766;
      }

      .graph-node.is-constellation.node-component {
        border-color: #a78bfa;
        background: linear-gradient(145deg, #2a1d54ee, #17163bee);
        box-shadow: 0 0 0 1px #a78bfa22, 0 0 20px #a78bfa55, 0 8px 20px #02061766;
      }

      .graph-node.is-constellation.node-service {
        border-color: #2dd4bf;
        background: linear-gradient(145deg, #103d44ee, #0c2238ee);
        box-shadow: 0 0 0 1px #2dd4bf22, 0 0 20px #2dd4bf55, 0 8px 20px #02061766;
      }

      .graph-node.is-constellation.node-source {
        border-color: #22d3ee;
        background: linear-gradient(145deg, #103e4bee, #0c2539ee);
        box-shadow: 0 0 0 1px #22d3ee22, 0 0 18px #22d3ee55, 0 8px 20px #02061766;
      }

      .graph-node.is-constellation.is-app-start {
        border-color: #f59e0b;
        background: linear-gradient(145deg, #44301bee, #241b24ee);
        box-shadow: 0 0 0 2px #fbbf2455, 0 0 22px #fbbf2455, 0 8px 20px #02061766;
      }

      .graph-node.is-constellation.is-log-node {
        border-color: #fbbf24;
        background: linear-gradient(145deg, #44301bee, #241b24ee);
        box-shadow: 0 0 0 2px #fbbf2477, 0 0 28px #fbbf2477, 0 8px 20px #02061766;
      }

      .graph-node.is-constellation .node-kicker {
        font-size: clamp(8px, 2.2cqw, 14px);
      }

      .graph-node.is-constellation .node-label {
        max-width: 78%;
        font-size: clamp(11px, 6cqw, 25px);
        line-height: 1.1;
      }

      .graph-node.is-constellation .node-constellation-summary {
        font-size: clamp(8px, 2.1cqw, 14px);
      }

      .graph-node.is-constellation.is-dimmed {
        opacity: 1;
        filter: none;
        transform: none;
        border-width: 1px;
        padding: 0;
        box-shadow: 0 6px 18px #02061733 !important;
      }

      .graph-node.is-constellation.is-dimmed > * {
        display: none;
      }

      .graph-node.is-constellation.is-dimmed .constellation-focus-button,
      .graph-node.is-constellation.is-dimmed ng-diagram-port {
        display: none !important;
      }

      .graph-node.is-constellation.is-dimmed::after {
        position: absolute;
        top: 50%;
        left: 50%;
        display: block;
        width: 6px;
        height: 6px;
        border: 1px solid #ffffffcc;
        border-radius: 50%;
        background: #fff4c7;
        content: '';
        pointer-events: none;
        transform: translate(-50%, -50%);
      }

      .graph-node.is-constellation.is-dimmed.node-route {
        border-color: #60a5fa66;
        background: #142d5840 !important;
      }

      .graph-node.is-constellation.is-dimmed.node-route-hook {
        border-color: #818cf866;
        background: #25255a40 !important;
      }

      .graph-node.is-constellation.is-dimmed.node-component {
        border-color: #a78bfa66;
        background: #2a1d5440 !important;
      }

      .graph-node.is-constellation.is-dimmed.node-service {
        border-color: #2dd4bf66;
        background: #103d4440 !important;
      }

      .graph-node.is-constellation.is-dimmed.node-source {
        border-color: #22d3ee66;
        background: #103e4b40 !important;
      }

      .graph-node.is-constellation.is-dimmed.is-http-client,
      .graph-node.is-constellation.is-dimmed.is-log-node {
        border-color: #fbbf2477;
        background: #44301b40 !important;
      }

      .graph-node.is-constellation.is-dimmed.node-route::after {
        background: #60a5fa;
      }

      .graph-node.is-constellation.is-dimmed.node-route-hook::after {
        background: #818cf8;
      }

      .graph-node.is-constellation.is-dimmed.node-component::after {
        background: #a78bfa;
      }

      .graph-node.is-constellation.is-dimmed.node-service::after {
        background: #2dd4bf;
      }

      .graph-node.is-constellation.is-dimmed.node-source::after {
        background: #22d3ee;
      }

      .graph-node.is-constellation.is-dimmed.is-http-client::after,
      .graph-node.is-constellation.is-dimmed.is-log-node::after {
        background: #fbbf24;
      }

      /* Temporal dependencies stay visually prominent after the per-kind
       * constellation rules. A node can carry both HTTP and temporal usage;
       * in that case the two glows remain visible together. */
      .graph-node.is-temporal {
        box-shadow:
          0 0 0 2px #f9a8d488,
          0 0 30px 7px #ec489988,
          0 8px 20px #02061766;
      }

      .graph-node.is-constellation.is-temporal {
        box-shadow:
          0 0 0 4px #ec4899aa,
          0 0 20px #ec489977,
          0 8px 20px #02061766;
      }

      .graph-node.is-http-client {
        box-shadow:
          0 0 0 4px #fbbf24aa,
          0 0 20px #fbbf2477,
          0 8px 20px #02061766;
      }

      .graph-node.is-constellation.is-http-client {
        box-shadow:
          0 0 0 4px #fbbf24aa,
          0 0 20px #fbbf2477,
          0 8px 20px #02061766;
      }

      .graph-node.is-http-client.is-temporal {
        box-shadow:
          0 0 0 4px #fbbf24aa,
          0 0 0 8px #ec4899aa,
          0 0 24px #ec489977,
          0 8px 20px #02061766;
      }

      .graph-node.is-constellation.is-http-client.is-temporal {
        box-shadow:
          0 0 0 4px #fbbf24aa,
          0 0 0 8px #ec4899aa,
          0 0 24px #ec489977,
          0 8px 20px #02061766;
      }

      .graph-node.is-constellation {
        --constellation-glow: #ffffff66;
      }

      .graph-node.is-constellation.node-route {
        --constellation-glow: #60a5fa99;
      }

      .graph-node.is-constellation.node-route-hook {
        --constellation-glow: #818cf899;
      }

      .graph-node.is-constellation.node-component {
        --constellation-glow: #a78bfa99;
      }

      .graph-node.is-constellation.node-service {
        --constellation-glow: #2dd4bf99;
      }

      .graph-node.is-constellation.node-source {
        --constellation-glow: #22d3ee99;
      }

      .graph-node.is-constellation.node-primitive,
      .graph-node.is-constellation.node-property {
        --constellation-glow: #fbbf2499;
      }

      .graph-node.is-constellation.is-http-client {
        --constellation-glow: #fbbf24cc;
      }

      .graph-node.is-constellation.is-temporal {
        --constellation-glow: #ec4899cc;
      }

      .graph-node.is-constellation.is-http-client.is-temporal {
        --constellation-glow: #f472b6dd;
      }

      .graph-node.is-constellation:not(.is-dimmed) {
        filter: drop-shadow(0 0 12px var(--constellation-glow));
      }

      .graph-node.is-constellation.is-dimmed.is-http-client,
      .graph-node.is-constellation.is-dimmed.is-temporal {
        box-shadow: 0 0 0 1px currentColor, 0 4px 10px #02061722 !important;
      }

      .graph-node.is-constellation.is-dimmed.is-http-client {
        color: #fbbf2455;
        border-color: #fbbf2444;
      }

      .graph-node.is-constellation.is-dimmed.is-temporal {
        color: #ec489955;
        border-color: #ec489944;
      }

      .graph-node.is-constellation.is-dimmed.is-http-client.is-temporal {
        color: #f472b666;
        border-color: #f472b655;
      }

      .graph-node.is-constellation.is-dimmed.is-http-client::after {
        background: #fbbf2455;
      }

      .graph-node.is-constellation.is-dimmed.is-temporal::after {
        background: #ec489955;
      }

      .graph-node.is-constellation.is-dimmed.is-http-client.is-temporal::after {
        background: #f472b666;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class GraphNodeTemplate implements NgDiagramNodeTemplate<DiagramNodeData> {
  readonly node = input.required<DiagramGraphNode>();
  protected readonly hoverState = inject(GraphHoverState);
  protected readonly codePreview = inject(GraphCodePreviewState);
  private readonly constellationFocus = inject(GraphConstellationFocusState);
  private readonly externalRouteFocus = inject(GraphExternalRouteFocusState);
  protected readonly externalRouteBundle = inject(GraphExternalRouteBundleState);
  protected readonly externalRouteContent = inject(
    GraphExternalRouteContentState,
  );

  protected summaryLabel(summary: OverviewSummary): string {
    return Object.entries(summary.counts)
      .filter((entry): entry is [string, number] => entry[1] !== undefined)
      .sort((left, right) => right[1] - left[1])
      .slice(0, 3)
      .map(([kind, count]) => `${count} ${kind}`)
      .join(' · ');
  }

  protected constellationTitle(): string {
    const constellation = this.node().data.constellation;
    return constellation
      ? `${this.node().data.label} · poids ${constellation.weight}`
      : this.node().data.label;
  }

  protected isLogNode(): boolean {
    const words = this.node()
      .data.label.replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter(Boolean);
    return words.some((word) => word === 'log' || word === 'upstream');
  }

  protected toggleCodePreview(event: Event): void {
    event.stopPropagation();
    this.codePreview.toggle(
      {
        id: this.node().id,
        label: this.node().data.label,
        kind: this.node().data.kind,
        filePath: this.node().data.filePath,
        line: this.node().data.line,
      },
      event.currentTarget as HTMLElement,
    );
  }

  protected stopEvent(event: Event): void {
    event.stopPropagation();
  }

  protected openConstellationDetail(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.constellationFocus.focus(this.node().id);
  }

  protected openExternalRoute(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    const routeLabel = this.node().data.externalRouteLabel;
    if (routeLabel) this.externalRouteFocus.focus(routeLabel);
  }

  protected toggleExternalRouteBundle(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.externalRouteBundle.expanded()) {
      this.externalRouteContent.clear();
    }
    this.externalRouteBundle.toggle();
  }

  protected externalRouteContentExpanded(): boolean {
    const routeLabel = this.node().data.externalRouteLabel;
    return Boolean(
      routeLabel && this.externalRouteContent.isExpanded(routeLabel),
    );
  }

  protected toggleExternalRouteContent(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    const routeLabel = this.node().data.externalRouteLabel;
    if (routeLabel) this.externalRouteContent.toggle(routeLabel);
  }
}

@Component({
  selector: 'app-graph-group-template',
  imports: [
    NgDiagramGroupHighlightedDirective,
    NgDiagramNodeResizeAdornmentComponent,
    NgDiagramNodeSelectedDirective,
    NgDiagramPortComponent,
  ],
  template: `
    <ng-diagram-node-resize-adornment>
      <section
        class="graph-group"
        [class]="'group-' + node().data.kind"
        [class.is-app-start]="node().data.appStart"
        [class.is-http-client]="node().data.httpEndpoints.length > 0"
        [class.is-temporal]="node().data.temporalOperations.length > 0"
        [class.is-dimmed]="hoverState.isNodeDimmed(node().id)"
        ngDiagramNodeSelected
        ngDiagramGroupHighlighted
        [node]="node()"
        (mouseenter)="hoverState.hoverNode(node().id)"
        (mouseleave)="hoverState.clearNode(node().id)"
      >
        <ng-diagram-port id="in" type="both" side="left" />
        <ng-diagram-port id="top" type="both" side="top" />
        <header class="group-header">
          <div class="group-title-row">
            <span class="group-kicker">
              {{ node().data.kind }} · {{ node().data.groupRole ?? 'host' }}
            </span>
            <span class="group-actions">
              @if (node().data.filePath) {
                <button
                  type="button"
                  class="code-preview-button"
                  aria-label="Prévisualiser le code"
                  title="Prévisualiser le code"
                  (pointerdown)="stopEvent($event)"
                  (click)="toggleCodePreview($event)"
                >
                  &lt;/&gt;
                </button>
              }
              <button
                type="button"
                class="collapse-button"
                [attr.aria-label]="
                  isCollapsed ? 'Ouvrir le bloc' : 'Replier le bloc'
                "
                (pointerdown)="stopEvent($event)"
                (click)="toggle($event)"
              >
                {{ isCollapsed ? '▸' : '▾' }}
              </button>
            </span>
          </div>
          <strong>{{ node().data.label }}</strong>
          @if (node().data.appStart) {
            <span class="group-app-start-badge">⚡ app start · démarrage</span>
          }
          @if (node().data.anonymous) {
            <span class="group-anonymous-badge">nom inféré</span>
          }
          <span class="group-usage">{{ node().data.usageLabel }}</span>
          @if (node().data.httpEndpoints.length > 0) {
            <div class="http-client-endpoints group-http-client-endpoints">
              @for (
                endpoint of node().data.httpEndpoints;
                track endpoint.line + endpoint.method + endpoint.url
              ) {
                <span>{{ endpoint.method }} {{ endpoint.url }}</span>
              }
            </div>
          }
          @if (node().data.temporalOperations.length > 0) {
            <div class="temporal-client-endpoints group-temporal-endpoints">
              @for (
                operation of node().data.temporalOperations;
                track operation.line + operation.operation
              ) {
                <span>{{ operation.operation }}{{ operation.delay ? '(' + operation.delay + ')' : '' }}</span>
              }
            </div>
          }
          @if (node().data.externalRouteUses.length > 0) {
            <div class="group-route-use-warning">
              Used by {{ node().data.externalRouteUses.length }} other route(s)
            </div>
          }
          <span class="group-count">
            @if (isCollapsed) {
              replié · {{ node().data.memberCount ?? 0 }} éléments masqués
            } @else {
              {{ node().data.memberCount ?? 0 }} éléments internes
            }
          </span>
          @if (node().data.constellation; as constellation) {
            <span class="group-weight">
              poids {{ constellation.weight }}
            </span>
          }
        </header>
        <ng-diagram-port id="out" type="source" side="right" />
        <ng-diagram-port id="bottom" type="both" side="bottom" />
      </section>
    </ng-diagram-node-resize-adornment>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 100%;
      }

      .graph-group {
        position: relative;
        box-sizing: border-box;
        width: 100%;
        height: 100%;
        overflow: visible;
        border: 2px solid #94a3b8;
        border-radius: 14px;
        padding: 12px 14px;
        background: #ffffffee;
        box-shadow: 0 8px 22px #0f172a18;
        transition:
          opacity 0.15s ease,
          filter 0.15s ease;
      }

      .graph-group.is-dimmed {
        opacity: 0.16;
        filter: grayscale(0.8);
      }

      .group-component {
        border-color: #8b5cf6;
        background: #faf5ffeb;
      }

      .group-service {
        border-color: #14b8a6;
        background: #f0fdfaec;
      }

      .graph-group.is-app-start {
        border-color: #f59e0b;
        background: #fff7edec;
        box-shadow:
          0 0 0 2px #fed7aa,
          0 8px 22px #0f172a18;
      }

      .group-app-start-badge {
        display: inline-flex;
        width: fit-content;
        margin-top: 7px;
        border: 1px solid #fdba74;
        border-radius: 999px;
        padding: 3px 8px;
        color: #9a3412;
        background: #ffedd5;
        font-size: 10px;
        font-weight: 800;
      }

      .group-anonymous-badge {
        display: inline-flex;
        width: fit-content;
        border: 1px solid #cbd5e1;
        border-radius: 999px;
        padding: 3px 8px;
        color: #475569;
        background: #f1f5f9;
        font-size: 10px;
        font-weight: 800;
      }

      .group-usage {
        overflow: hidden;
        color: #64748b;
        font-size: 10px;
        font-weight: 700;
        line-height: 1.2;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .group-primitive {
        border-color: #f59e0b;
        border-radius: 11px;
        background: #fffbebee;
      }

      .graph-group.is-http-client {
        border-color: #f59e0b;
        background: #fff7edee;
        box-shadow:
          0 0 0 3px #fde68a,
          0 0 24px 7px #fbbf2455,
          0 8px 22px #c2410c26;
      }

      .group-http-client-endpoints {
        margin-top: 0;
        max-width: 100%;
        color: #c2410c;
      }

      .group-header {
        display: grid;
        gap: 4px;
        min-height: 42px;
        padding: 0 4px;
      }

      .group-title-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }

      .group-actions {
        display: inline-flex;
        align-items: center;
        gap: 5px;
      }

      .code-preview-button {
        display: inline-grid;
        width: 26px;
        height: 22px;
        place-items: center;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        padding: 0;
        color: #475569;
        background: #ffffffaa;
        cursor: help;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 10px;
        font-weight: 800;
      }

      .code-preview-button:hover,
      .code-preview-button:focus-visible {
        border-color: #8b5cf6;
        color: #6d28d9;
        background: #f5f3ff;
        outline: none;
      }

      .collapse-button {
        display: inline-grid;
        width: 24px;
        height: 22px;
        place-items: center;
        flex: 0 0 auto;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        color: #475569;
        background: #ffffffaa;
        cursor: pointer;
        font-size: 15px;
        line-height: 1;
      }

      .collapse-button:hover {
        border-color: #64748b;
        background: #ffffff;
      }

      .group-kicker,
      .group-count {
        color: #64748b;
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .group-header strong {
        overflow-wrap: anywhere;
        color: #172033;
        font-size: 15px;
        line-height: 1.2;
      }

      .group-count {
        color: #94a3b8;
        font-size: 9px;
      }

      .group-weight {
        color: #b45309;
        font-size: 9px;
        font-weight: 800;
        text-transform: uppercase;
      }

      .group-route-use-warning {
        max-width: 100%;
        overflow: hidden;
        border-radius: 999px;
        padding: 4px 8px;
        color: #92400e;
        background: #fef3c7;
        font-size: 10px;
        font-weight: 800;
        line-height: 1.2;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .graph-group.ng-diagram-node-selected,
      .graph-group.ng-diagram-group-highlight {
        box-shadow:
          0 0 0 3px #38bdf855,
          0 8px 22px #0f172a18;
      }

      /* Nebula palette for host blocks in every non-constellation schema. */
      .graph-group {
        border-color: #53649a;
        color: #e6edff;
        background: linear-gradient(145deg, #172143ee, #0d1530ee);
        box-shadow: 0 0 24px #4f46e533, 0 10px 26px #02061777;
      }

      .graph-group.group-component {
        border-color: #a78bfa;
        background: linear-gradient(145deg, #2a1d54ee, #17163bee);
        box-shadow: 0 0 0 1px #a78bfa22, 0 0 24px #a78bfa55, 0 10px 26px #02061777;
      }

      .graph-group.group-service {
        border-color: #2dd4bf;
        background: linear-gradient(145deg, #103d44ee, #0c2238ee);
        box-shadow: 0 0 0 1px #2dd4bf22, 0 0 24px #2dd4bf55, 0 10px 26px #02061777;
      }

      .graph-group.group-primitive {
        border-color: #fbbf24;
        background: linear-gradient(145deg, #44301bee, #241b24ee);
        box-shadow: 0 0 0 1px #fbbf2422, 0 0 22px #fbbf2455, 0 10px 26px #02061777;
      }

      .graph-group.is-temporal {
        box-shadow:
          0 0 0 2px #f9a8d433,
          0 0 30px 7px #ec489966,
          0 10px 26px #02061777;
      }

      .group-temporal-endpoints {
        color: #f9a8d4;
        text-shadow: 0 0 10px #ec489966;
      }

      .group-header strong {
        color: #f8fbff;
        text-shadow: 0 0 12px #a5b4fc44;
      }

      .group-kicker,
      .group-usage,
      .group-count {
        color: #a5b4fc;
      }

      .group-weight {
        color: #fde68a;
        text-shadow: 0 0 10px #fbbf2466;
      }

      .group-http-client-endpoints {
        color: #fcd34d;
        text-shadow: 0 0 10px #f59e0b55;
      }

      .graph-group.is-http-client {
        box-shadow:
          0 0 0 4px #fbbf24aa,
          0 0 20px #fbbf2477,
          0 10px 26px #02061777;
      }

      .graph-group.is-http-client.is-temporal {
        box-shadow:
          0 0 0 4px #fbbf24aa,
          0 0 0 8px #ec4899aa,
          0 0 24px #ec489977,
          0 10px 26px #02061777;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class GraphGroupTemplate
  implements NgDiagramGroupNodeTemplate<DiagramNodeData>
{
  readonly node = input.required<DiagramGraphGroup>();
  protected readonly hoverState = inject(GraphHoverState);
  protected readonly collapseState = inject(GraphCollapseState);
  protected readonly codePreview = inject(GraphCodePreviewState);

  protected get isCollapsed(): boolean {
    return this.collapseState.isCollapsed(this.node().id);
  }

  protected stopEvent(event: Event): void {
    event.stopPropagation();
  }

  protected toggleCodePreview(event: Event): void {
    event.stopPropagation();
    this.codePreview.toggle(
      {
        id: this.node().id,
        label: this.node().data.label,
        kind: this.node().data.kind,
        filePath: this.node().data.filePath,
        line: this.node().data.line,
      },
      event.currentTarget as HTMLElement,
    );
  }

  protected toggle(event: Event): void {
    event.stopPropagation();
    this.collapseState.toggle(this.node().id);
  }
}

@Component({
  selector: 'app-graph-template-group-template',
  imports: [
    NgDiagramGroupHighlightedDirective,
    NgDiagramNodeResizeAdornmentComponent,
    NgDiagramNodeSelectedDirective,
    NgDiagramPortComponent,
  ],
  template: `
    <ng-diagram-node-resize-adornment>
      <section
        class="graph-template-group"
        [class.is-dimmed]="
          hoverState.isNodeDimmed(node().data.sourceNodeId ?? node().id)
        "
        ngDiagramNodeSelected
        ngDiagramGroupHighlighted
        [node]="node()"
        (mouseenter)="
          hoverState.hoverNode(node().data.sourceNodeId ?? node().id)
        "
        (mouseleave)="
          hoverState.clearNode(node().data.sourceNodeId ?? node().id)
        "
      >
        <ng-diagram-port id="in" type="both" side="left" />
        <ng-diagram-port id="top" type="both" side="top" />
        <span class="template-kicker">component</span>
        <strong>template</strong>
        @if (node().data.filePath) {
          <button
            type="button"
            class="code-preview-button"
            aria-label="Prévisualiser le code"
            title="Prévisualiser le code"
            (pointerdown)="stopEvent($event)"
            (click)="toggleCodePreview($event)"
          >
            &lt;/&gt;
          </button>
        }
        <ng-diagram-port id="out" type="both" side="right" />
        <ng-diagram-port id="bottom" type="both" side="bottom" />
      </section>
    </ng-diagram-node-resize-adornment>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 100%;
      }

      .graph-template-group {
        position: relative;
        display: flex;
        box-sizing: border-box;
        width: 100%;
        height: 100%;
        align-items: center;
        justify-content: space-between;
        border: 1px dashed #a78bfa;
        border-radius: 9px;
        padding: 10px 13px;
        color: #5b21b6;
        background: #f5f3ffef;
        box-shadow: inset 0 0 0 1px #ffffffaa;
        transition:
          opacity 0.15s ease,
          filter 0.15s ease;
      }

      .graph-template-group.is-dimmed {
        opacity: 0.16;
        filter: grayscale(0.8);
      }

      .template-kicker {
        color: #8b5cf6;
        font-size: 9px;
        font-weight: 800;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }

      .code-preview-button {
        position: absolute;
        top: 5px;
        right: 7px;
        display: inline-grid;
        width: 26px;
        height: 22px;
        place-items: center;
        border: 1px solid #c4b5fd;
        border-radius: 6px;
        padding: 0;
        color: #6d28d9;
        background: #ffffffaa;
        cursor: help;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 10px;
        font-weight: 800;
      }

      .code-preview-button:hover,
      .code-preview-button:focus-visible {
        border-color: #8b5cf6;
        background: #ede9fe;
        outline: none;
      }

      strong {
        font-size: 13px;
        letter-spacing: 0.02em;
      }

      .graph-template-group.ng-diagram-node-selected,
      .graph-template-group.ng-diagram-group-highlight {
        box-shadow:
          0 0 0 3px #8b5cf655,
          inset 0 0 0 1px #ffffffaa;
      }

      .graph-template-group {
        border-color: #c4b5fd;
        color: #ede9fe;
        background: linear-gradient(145deg, #302064ee, #1c1740ee);
        box-shadow: 0 0 22px #8b5cf655, inset 0 0 0 1px #ffffff22;
      }

      .template-kicker {
        color: #c4b5fd;
        text-shadow: 0 0 10px #a78bfa66;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class GraphTemplateGroupTemplate
  implements NgDiagramGroupNodeTemplate<DiagramNodeData>
{
  readonly node = input.required<DiagramGraphGroup>();
  protected readonly hoverState = inject(GraphHoverState);
  protected readonly codePreview = inject(GraphCodePreviewState);

  protected toggleCodePreview(event: Event): void {
    event.stopPropagation();
    this.codePreview.toggle(
      {
        id: this.node().id,
        label: this.node().data.label,
        kind: this.node().data.kind,
        filePath: this.node().data.filePath,
        line: this.node().data.line,
      },
      event.currentTarget as HTMLElement,
    );
  }

  protected stopEvent(event: Event): void {
    event.stopPropagation();
  }
}

@Component({
  selector: 'app-graph-edge-template',
  imports: [NgDiagramBaseEdgeComponent],
  template: `
    <ng-diagram-base-edge
      [edge]="edge()"
      [stroke]="stroke"
      [strokeWidth]="strokeWidth"
      [strokeOpacity]="strokeOpacity"
      [strokeDasharray]="strokeDasharray"
      targetArrowhead="ng-diagram-arrow"
    />
  `,
  styles: [
    `
      :host-context(.celestial-view) svg {
        color: #fff4c7 !important;
      }

      :host-context(.celestial-view) .ng-diagram-edge__path {
        stroke: #fff4c7d9 !important;
        stroke-width: 2px;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class GraphEdgeTemplate implements NgDiagramEdgeTemplate<DiagramEdgeData> {
  readonly edge = input.required<DiagramGraphEdge>();
  private readonly hoverState = inject(GraphHoverState);
  private readonly document = inject(DOCUMENT);

  private get isCelestialView(): boolean {
    return (
      this.document.querySelector('main')?.classList.contains('celestial-view') ??
      false
    );
  }

  get strokeOpacity(): number {
    if (this.edge().data.details['externalRouteGhost'] === true) {
      return this.hoverState.isEdgeDimmed(this.edge().id) ? 0.04 : 0.28;
    }
    return this.hoverState.isEdgeDimmed(this.edge().id) ? 0.08 : 0.82;
  }

  get stroke(): string {
    if (this.edge().data.details['externalRouteGhost'] === true) {
      return '#94a3b8';
    }
    if (this.isCelestialView) {
      return '#fff4c7';
    }
    return {
      loads: '#93c5fd',
      renders: '#c4b5fd',
      contains: '#64748b',
      'depends-on': '#5eead4',
      'uses-property': '#e9d5ff',
      calls: '#fb923c',
      reads: '#67e8f9',
      writes: '#fb923c',
      subscribes: '#22d3ee',
      triggers: '#fde047',
    }[this.edge().data.kind];
  }

  get strokeWidth(): number {
    if (this.edge().data.details['externalRouteGhost'] === true) {
      return 1.2;
    }
    if (this.isCelestialView) {
      return this.edge().data.kind === 'depends-on' ? 2.6 : 2;
    }
    return this.edge().data.kind === 'depends-on' ? 2.6 : 1.5;
  }

  get strokeDasharray(): string | undefined {
    return this.edge().data.kind === 'loads' ? '8 6' : undefined;
  }
}

@Component({
  imports: [JsonPipe, NgDiagramComponent],
  providers: [provideNgDiagram()],
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App implements OnInit {
  private readonly graphState = craftUse(
    state('graph', null as DependencyGraph | null, ({ set }) => ({
      setGraph: (value: DependencyGraph | null) => set(value),
    })),
  );
  protected readonly graph = this.graphState.graph;
  private readonly loadingState = craftUse(
    state('loading', true, ({ set }) => ({
      setLoading: (value: boolean) => set(value),
    })),
  );
  protected readonly loading = this.loadingState.loading;
  private readonly errorState = craftUse(
    state('error', null as string | null, ({ set }) => ({
      setError: (value: string | null) => set(value),
    })),
  );
  protected readonly error = this.errorState.error;
  private readonly selectedRouteState = craftUse(
    state('selectedRouteId', '', ({ set }) => ({
      selectRoute: (value: string) => set(value),
    })),
  );
  protected readonly selectedRouteId = this.selectedRouteState.selectedRouteId;
  private readonly showAllState = craftUse(
    state('showAll', true, ({ update, set }) => ({
      toggle: () => update((value) => !value),
      show: () => set(true),
      hide: () => set(false),
    })),
  );
  protected readonly showAll = this.showAllState.showAll;
  private readonly overviewState = craftUse(
    state('overview', false, ({ update, set }) => ({
      toggle: () => update((value) => !value),
      show: () => set(true),
      hide: () => set(false),
    })),
  );
  protected readonly overview = this.overviewState.overview;
  private readonly constellationState = craftUse(
    state('constellation', false, ({ update, set }) => ({
      toggle: () => update((value) => !value),
      show: () => set(true),
      hide: () => set(false),
    })),
  );
  protected readonly constellation =
    this.constellationState.constellation;
  private readonly collisionConstellationState = craftUse(
    state('collisionConstellation', false, ({ update, set }) => ({
      toggle: () => update((value) => !value),
      show: () => set(true),
      hide: () => set(false),
    })),
  );
  protected readonly collisionConstellation =
    this.collisionConstellationState.collisionConstellation;
  private readonly elkLayoutState = craftUse(
    state('elkLayout', true, ({ set }) => ({
      show: () => set(true),
      hide: () => set(false),
    })),
  );
  protected readonly elkLayout = this.elkLayoutState.elkLayout;
  private readonly focusTechnologyState = craftUse(
    state('focusTechnology', 'all' as FocusTechnology, ({ set }) => ({
      setFocusTechnology: (value: FocusTechnology) => set(value),
    })),
  );
  protected readonly focusTechnology =
    this.focusTechnologyState.focusTechnology;
  private readonly focusEntityKindState = craftUse(
    state('focusEntityKind', 'all' as FocusEntityKind, ({ set }) => ({
      setFocusEntityKind: (value: FocusEntityKind) => set(value),
    })),
  );
  protected readonly focusEntityKind = this.focusEntityKindState.focusEntityKind;
  private readonly focusDepthState = craftUse(
    state('focusDepth', 'level-1' as FocusDepth, ({ set }) => ({
      setFocusDepth: (value: FocusDepth) => set(value),
    })),
  );
  protected readonly focusDepth = this.focusDepthState.focusDepth;
  private readonly selectedNodeState = craftUse(
    state('selectedNodeId', null as string | null, ({ set }) => ({
      selectNode: (value: string | null) => set(value),
    })),
  );
  protected readonly selectedNodeId = this.selectedNodeState.selectedNodeId;
  private readonly selectedEdgeState = craftUse(
    state('selectedEdgeKey', null as string | null, ({ set }) => ({
      selectEdge: (value: string | null) => set(value),
    })),
  );
  protected readonly selectedEdgeKey = this.selectedEdgeState.selectedEdgeKey;
  private readonly detailsState = craftUse(
    state('detailsOpen', false, ({ update, set }) => ({
      toggle: () => update((value) => !value),
      open: () => set(true),
      close: () => set(false),
    })),
  );
  protected readonly detailsOpen = this.detailsState.detailsOpen;
  private readonly urlReady = signal(false);
  private readonly injector = inject(Injector);
  private readonly viewportService = inject(NgDiagramViewportService);
  private readonly hoverState = inject(GraphHoverState);
  private readonly constellationFocus = inject(GraphConstellationFocusState);
  private readonly externalRouteFocus = inject(GraphExternalRouteFocusState);
  protected readonly externalRouteBundle = inject(GraphExternalRouteBundleState);
  private readonly externalRouteContent = inject(
    GraphExternalRouteContentState,
  );
  private readonly collapseState = inject(GraphCollapseState);
  private readonly elk = new ELK();
  private elkLayoutKey = '';
  private elkLayoutRequest = 0;
  private elkPositions = new Map<string, ElkPosition>();
  protected readonly codePreview = inject(GraphCodePreviewState);
  private dragStartPositions = new Map<string, { x: number; y: number }>();
  private internalEdgeRefreshFrame: number | null = null;
  private readonly collapseRebuildEffect = effect(() => {
    this.collapseState.collapsedIds();
    if (!this.loading() && this.graph()) {
      queueMicrotask(() => this.rebuildModel());
    }
  });
  private readonly constellationFocusEffect = effect(() => {
    const focusedNodeId = this.constellationFocus.focusedNodeId();
    if (!focusedNodeId || this.loading() || !this.graph()) return;

    craftUse(this.overviewState.overview.hide());
    craftUse(this.constellationState.constellation.hide());
    craftUse(this.collisionConstellationState.collisionConstellation.hide());
    craftUse(this.elkLayoutState.elkLayout.show());
    craftUse(
      this.selectedNodeState.selectedNodeId.selectNode(focusedNodeId),
    );
    queueMicrotask(() => this.rebuildModel());
  });
  private readonly externalRouteFocusEffect = effect(() => {
    const routeLabel = this.externalRouteFocus.routeLabel();
    if (!routeLabel || this.loading() || !this.graph()) return;

    this.externalRouteFocus.clear();
    this.selectRoute(routeLabel);
  });
  private readonly externalRouteBundleEffect = effect(() => {
    this.externalRouteBundle.expanded();
    if (!this.loading() && this.graph()) {
      queueMicrotask(() => this.rebuildModel());
    }
  });
  private readonly externalRouteContentEffect = effect(() => {
    this.externalRouteContent.expandedRouteLabels();
    if (!this.loading() && this.graph()) {
      queueMicrotask(() => this.rebuildModel());
    }
  });
  private readonly urlStateEffect = effect(() => {
    if (!this.urlReady() || this.loading()) return;
    this.persistUrlState();
  });
  private readonly codePreviewScrollEffect = effect(() => {
    const target = this.codePreview.target();
    const content = this.codePreview.content();
    if (!target?.line || content === null) return;

    setTimeout(() => {
      if (this.codePreview.target()?.id !== target.id) return;
      const container = document.querySelector<HTMLElement>(
        '.code-preview-content',
      );
      const line = container?.querySelector<HTMLElement>('.is-target-line');
      if (!container || !line) return;

      const containerRect = container.getBoundingClientRect();
      const lineRect = line.getBoundingClientRect();
      const lineCenter = lineRect.top + lineRect.height / 2;
      const containerCenter = containerRect.top + containerRect.height / 2;

      container.scrollTo({
        top: Math.max(0, container.scrollTop + lineCenter - containerCenter),
        behavior: 'auto',
      });
    }, 0);
  });
  private readonly modelState = craftUse(
    state('model', this.createModel([], []), ({ set }) => ({
      replaceModel: (value: ModelAdapter) => set(value),
    })),
  );
  protected readonly model = this.modelState.model;

  protected readonly nodeTemplateMap = new NgDiagramNodeTemplateMap([
    ['graph-node', GraphNodeTemplate],
    ['graph-group', GraphGroupTemplate],
    ['graph-primitive-group', GraphGroupTemplate],
    ['graph-template', GraphTemplateGroupTemplate],
  ]);
  protected readonly edgeTemplateMap = new NgDiagramEdgeTemplateMap([
    ['graph-edge', GraphEdgeTemplate],
  ]);

  protected readonly routes = computed(() =>
    (this.graph()?.nodes ?? [])
      .filter((node) => node.kind === 'route')
      .sort((left, right) => left.label.localeCompare(right.label)),
  );

  protected readonly collapsedGroupCount = computed(
    () => this.collapseState.collapsedIds().size,
  );

  protected readonly visibleGraph = computed(() =>
    this.buildVisibleGraph(
      this.graph(),
      this.selectedRouteId(),
      this.showAll(),
      this.focusTechnology(),
      this.focusEntityKind(),
      this.focusDepth(),
    ),
  );

  protected readonly focusActive = computed(
    () => this.focusTechnology() !== 'all',
  );

  protected readonly visibleNodeCount = computed(
    () => this.visibleGraph().nodes.length,
  );
  protected readonly visibleEdgeCount = computed(
    () => this.visibleGraph().edges.length,
  );

  private readonly searchOpenState = craftUse(
    state('searchOpen', false, ({ set }) => ({
      open: () => set(true),
      close: () => set(false),
    })),
  );
  protected readonly searchOpen = this.searchOpenState.searchOpen;
  private readonly searchQueryState = craftUse(
    state('searchQuery', '', ({ set }) => ({
      setQuery: (value: string) => set(value),
    })),
  );
  protected readonly searchQuery = this.searchQueryState.searchQuery;
  private readonly searchActiveIndexState = craftUse(
    state('searchActiveIndex', 0, ({ set, update }) => ({
      reset: () => set(0),
      next: (max: number) => update((index) => Math.min(index + 1, max)),
      previous: () => update((index) => Math.max(index - 1, 0)),
    })),
  );
  protected readonly searchActiveIndex =
    this.searchActiveIndexState.searchActiveIndex;

  protected readonly searchResults = computed<GraphSearchResult[]>(() => {
    const query = this.normalizeSearchText(this.searchQuery());
    const candidates = this.visibleGraph().nodes;

    return candidates
      .filter((node) => {
        if (!query) return true;
        const usage = this.primitiveUsage(node);
        const searchableText = [
          node.label,
          usage,
          node.kind,
          node.filePath,
          String(node.line ?? ''),
        ]
          .filter(Boolean)
          .join(' ');
        return this.normalizeSearchText(searchableText).includes(query);
      })
      .sort((left, right) => {
        const rankDifference =
          this.searchMatchRank(left, query) -
          this.searchMatchRank(right, query);
        if (rankDifference !== 0) return rankDifference;

        return `${left.label}|${left.filePath}|${left.line}`.localeCompare(
          `${right.label}|${right.filePath}|${right.line}`,
        );
      })
      .map((node) => ({
        node,
        displayLabelParts: this.searchHighlightParts(
          this.nodeDisplayLabel(node),
          query,
        ),
        sourceLabelParts: this.searchHighlightParts(
          `${this.displayPath(node.filePath)}${
            node.line ? ` · L${node.line}` : ''
          }`,
          query,
        ),
      }));
  });

  private searchMatchRank(node: GraphNode, query: string): number {
    if (!query) return 0;
    const label = this.normalizeSearchText(node.label);
    const usage = this.normalizeSearchText(this.primitiveUsage(node) ?? '');
    const kind = this.normalizeSearchText(node.kind);
    const filePath = this.normalizeSearchText(node.filePath ?? '');

    if (label === query) return 0;
    if (label.startsWith(query)) return 1;
    if (label.includes(query)) return 2;
    if (usage.includes(query)) return 3;
    if (kind.includes(query)) return 4;
    if (filePath.includes(query)) return 5;
    return 6;
  }

  private searchHighlightParts(
    value: string,
    query: string,
  ): SearchTextPart[] {
    if (!query) return [{ text: value, matched: false }];

    const normalizedQuery = this.normalizeSearchText(query);
    if (!normalizedQuery) return [{ text: value, matched: false }];
    const normalizeCharacter = (character: string): string =>
      character
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
    const normalizedValue = normalizeCharacter(value);

    const originalIndexAt = (normalizedIndex: number, end: boolean): number => {
      let cursor = 0;
      for (let index = 0; index < value.length; index += 1) {
        const normalizedCharacter = normalizeCharacter(value[index]);
        const nextCursor = cursor + normalizedCharacter.length;
        if (
          normalizedIndex < nextCursor ||
          (end && normalizedIndex === nextCursor)
        ) {
          return end ? index + 1 : index;
        }
        cursor = nextCursor;
      }
      return value.length;
    };

    const ranges: Array<[number, number]> = [];
    let searchStart = 0;
    while (searchStart < normalizedValue.length) {
      const matchStart = normalizedValue.indexOf(normalizedQuery, searchStart);
      if (matchStart < 0) break;
      const matchEnd = matchStart + normalizedQuery.length;
      ranges.push([
        originalIndexAt(matchStart, false),
        originalIndexAt(matchEnd, true),
      ]);
      searchStart = matchEnd;
    }

    if (ranges.length === 0) return [{ text: value, matched: false }];

    const parts: SearchTextPart[] = [];
    let cursor = 0;
    for (const [start, end] of ranges) {
      if (start > cursor) parts.push({ text: value.slice(cursor, start), matched: false });
      parts.push({ text: value.slice(start, end), matched: true });
      cursor = end;
    }
    if (cursor < value.length) {
      parts.push({ text: value.slice(cursor), matched: false });
    }
    return parts;
  }

  protected readonly diagramSize = computed(() => {
    const projected = this.getDiagramProjection();
    const layout = this.createLayout(
      projected.nodes,
      projected.edges,
      projected.collapsedGroupIds,
      projected.collapsedMemberCountByGroupId,
    );
    return {
      width: layout.width,
      height: layout.height,
    };
  });

  protected readonly selectedNode = computed(() => {
    const nodeId = this.selectedNodeId();
    if (!nodeId) return null;
    return (
      this.graph()?.nodes.find((node) => node.id === nodeId) ??
      this.visibleGraph().nodes.find((node) => node.id === nodeId) ??
      null
    );
  });

  protected readonly hoveredNode = computed(() => {
    const nodeId = this.hoverState.hoveredNodeId();
    if (!nodeId) return null;
    return (
      this.visibleGraph().nodes.find((node) => node.id === nodeId) ??
      this.graph()?.nodes.find((node) => node.id === nodeId) ??
      null
    );
  });

  protected readonly inspectedNode = computed(
    () => this.selectedNode() ?? this.hoveredNode(),
  );

  protected readonly detailsVisible = computed(() => true);

  protected readonly constellationDetailNode = computed(() => {
    const nodeId = this.constellationFocus.focusedNodeId();
    return nodeId
      ? this.graph()?.nodes.find((node) => node.id === nodeId) ?? null
      : null;
  });

  protected readonly selectedEdge = computed(() => {
    const edgeKey = this.selectedEdgeKey();
    if (!edgeKey) return null;
    const [from, kind, to] = edgeKey.split('|');
    return (
      this.visibleGraph().edges.find(
        (edge) => edge.from === from && edge.kind === kind && edge.to === to,
      ) ?? null
    );
  });

  protected readonly externalRouteUses = computed(() => {
    const selected = this.selectedNode();
    if (!selected || selected.kind === 'route') return [];
    const currentRoute = this.selectedRouteId();
    return this.routes()
      .filter((route) => route.label !== currentRoute)
      .filter((route) => this.reachableFromRoute(route.id).has(selected.id))
      .map((route) => route.label);
  });

  @HostListener('document:keydown', ['$event'])
  protected onDocumentKeydown(event: KeyboardEvent): void {
    const isSearchShortcut =
      (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
    if (isSearchShortcut) {
      event.preventDefault();
      this.openSearch();
      return;
    }

    if (event.key === 'Escape' && this.searchOpen()) {
      event.preventDefault();
      this.closeSearch();
    }
  }

  protected openSearch(): void {
    craftUse(this.searchOpenState.searchOpen.open());
    craftUse(this.searchActiveIndexState.searchActiveIndex.reset());
    queueMicrotask(() => {
      document.querySelector<HTMLInputElement>('[data-search-input]')?.focus();
    });
  }

  protected closeSearch(): void {
    craftUse(this.searchOpenState.searchOpen.close());
  }

  protected updateSearchQuery(event: Event): void {
    craftUse(
      this.searchQueryState.searchQuery.setQuery(
        (event.target as HTMLInputElement).value,
      ),
    );
    craftUse(this.searchActiveIndexState.searchActiveIndex.reset());
  }

  protected setFocusTechnology(value: string): void {
    const technology: FocusTechnology =
      value === 'http' || value === 'temporal' ? value : 'all';
    craftUse(
      this.focusTechnologyState.focusTechnology.setFocusTechnology(technology),
    );
    craftUse(this.selectedNodeState.selectedNodeId.selectNode(null));
    craftUse(this.selectedEdgeState.selectedEdgeKey.selectEdge(null));
    this.rebuildModel();
  }

  protected setFocusEntityKind(value: string): void {
    const entityKind: FocusEntityKind =
      value === 'route' || value === 'component' || value === 'service'
        ? value
        : 'all';
    craftUse(
      this.focusEntityKindState.focusEntityKind.setFocusEntityKind(entityKind),
    );
    this.rebuildModel();
  }

  protected setFocusDepth(value: string): void {
    const depth: FocusDepth =
      value === 'target' ||
      value === 'level-1' ||
      value === 'level-2' ||
      value === 'components'
        ? value
        : 'level-1';
    craftUse(this.focusDepthState.focusDepth.setFocusDepth(depth));
    this.rebuildModel();
  }

  protected clearFocus(): void {
    craftUse(
      this.focusTechnologyState.focusTechnology.setFocusTechnology('all'),
    );
    craftUse(this.focusEntityKindState.focusEntityKind.setFocusEntityKind('all'));
    craftUse(this.focusDepthState.focusDepth.setFocusDepth('level-1'));
    this.rebuildModel();
  }

  protected onSearchKeydown(event: KeyboardEvent): void {
    const results = this.searchResults();
    if (event.key === 'ArrowDown' && results.length > 0) {
      event.preventDefault();
      craftUse(
        this.searchActiveIndexState.searchActiveIndex.next(results.length - 1),
      );
    } else if (event.key === 'ArrowUp' && results.length > 0) {
      event.preventDefault();
      craftUse(this.searchActiveIndexState.searchActiveIndex.previous());
    } else if (event.key === 'Enter' && results.length > 0) {
      event.preventDefault();
      this.selectSearchResult(results[this.searchActiveIndex()] ?? results[0]);
    }
  }

  protected selectSearchResult(result: GraphSearchResult): void {
    this.expandCollapsedAncestors(result.node.id);
    craftUse(this.selectedNodeState.selectedNodeId.selectNode(result.node.id));
    this.hoverState.selectNode(result.node.id);
    craftUse(this.selectedEdgeState.selectedEdgeKey.selectEdge(null));
    craftUse(this.detailsState.detailsOpen.open());
    this.closeSearch();
    setTimeout(() => this.focusNode(result.node.id), 180);
  }

  async ngOnInit(): Promise<void> {
    try {
      const response = await fetch('craft-dependency-graph.json');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const graph = (await response.json()) as DependencyGraph;
      craftUse(this.graphState.graph.setGraph(graph));
      craftUse(
        this.selectedRouteState.selectedRouteId.selectRoute(
          this.routeFromUrl(graph),
        ),
      );
      this.restoreViewFromUrl();
      this.urlReady.set(true);
      this.rebuildModel();
    } catch (loadError) {
      craftUse(
        this.errorState.error.setError(
          loadError instanceof Error
            ? loadError.message
            : 'Impossible de charger le graphe.',
        ),
      );
    } finally {
      craftUse(this.loadingState.loading.setLoading(false));
    }
  }

  private routeFromUrl(graph: DependencyGraph): string {
    const requestedRoute = new URLSearchParams(window.location.search).get(
      'route',
    );
    return graph.nodes.some(
      (node) => node.kind === 'route' && node.label === requestedRoute,
    )
      ? requestedRoute ?? ''
      : '';
  }

  private restoreViewFromUrl(): void {
    const params = new URLSearchParams(window.location.search);
    const view = params.get('view');
    const scope = params.get('scope');

    if (scope === 'route' && this.selectedRouteId()) {
      craftUse(this.showAllState.showAll.hide());
    } else {
      craftUse(this.showAllState.showAll.show());
    }
    if (view === 'overview') {
      craftUse(this.overviewState.overview.show());
    } else if (view === 'constellation') {
      craftUse(this.constellationState.constellation.show());
      craftUse(this.elkLayoutState.elkLayout.hide());
    } else if (view === 'collision') {
      craftUse(this.constellationState.constellation.show());
      craftUse(this.collisionConstellationState.collisionConstellation.show());
      craftUse(this.elkLayoutState.elkLayout.hide());
    }
    const focus = params.get('focus');
    const focusKind = params.get('focusKind');
    const focusDepth = params.get('focusDepth');
    craftUse(
      this.focusTechnologyState.focusTechnology.setFocusTechnology(
        focus === 'http' || focus === 'temporal' ? focus : 'all',
      ),
    );
    craftUse(
      this.focusEntityKindState.focusEntityKind.setFocusEntityKind(
        focusKind === 'route' ||
          focusKind === 'component' ||
          focusKind === 'service'
          ? focusKind
          : 'all',
      ),
    );
    craftUse(
      this.focusDepthState.focusDepth.setFocusDepth(
        focusDepth === 'target' ||
          focusDepth === 'level-1' ||
          focusDepth === 'level-2' ||
          focusDepth === 'components'
          ? focusDepth
          : 'level-1',
      ),
    );
  }

  private persistUrlState(): void {
    const params = new URLSearchParams(window.location.search);
    if (this.selectedRouteId()) {
      params.set('route', this.selectedRouteId());
    } else {
      params.delete('route');
    }
    params.set('scope', this.showAll() ? 'all' : 'route');
    params.set(
      'view',
      this.collisionConstellation()
        ? 'collision'
        : this.constellation()
          ? 'constellation'
          : this.overview()
            ? 'overview'
            : 'detail',
    );
    if (this.focusTechnology() === 'all') {
      params.delete('focus');
      params.delete('focusKind');
      params.delete('focusDepth');
    } else {
      params.set('focus', this.focusTechnology());
      params.set('focusKind', this.focusEntityKind());
      params.set('focusDepth', this.focusDepth());
    }
    const query = params.toString();
    const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
    window.history.replaceState(null, '', nextUrl);
  }

  protected selectRoute(label: string): void {
    this.constellationFocus.clear();
    this.externalRouteBundle.clear();
    this.externalRouteContent.clear();
    if (label) {
      craftUse(this.showAllState.showAll.hide());
    } else {
      craftUse(this.showAllState.showAll.show());
    }
    craftUse(this.overviewState.overview.hide());
    craftUse(this.constellationState.constellation.hide());
    craftUse(this.collisionConstellationState.collisionConstellation.hide());
    craftUse(this.elkLayoutState.elkLayout.show());
    craftUse(this.selectedRouteState.selectedRouteId.selectRoute(label));
    craftUse(this.selectedNodeState.selectedNodeId.selectNode(null));
    craftUse(this.selectedEdgeState.selectedEdgeKey.selectEdge(null));
    this.rebuildModel();
  }

  protected selectDetailedView(): void {
    this.constellationFocus.clear();
    this.externalRouteBundle.clear();
    this.externalRouteContent.clear();
    craftUse(this.constellationState.constellation.hide());
    craftUse(this.collisionConstellationState.collisionConstellation.hide());
    craftUse(this.elkLayoutState.elkLayout.show());
    craftUse(this.overviewState.overview.hide());
    craftUse(this.selectedNodeState.selectedNodeId.selectNode(null));
    craftUse(this.selectedEdgeState.selectedEdgeKey.selectEdge(null));
    this.rebuildModel();
  }

  protected selectOverviewView(): void {
    this.constellationFocus.clear();
    this.externalRouteBundle.clear();
    this.externalRouteContent.clear();
    craftUse(this.showAllState.showAll.show());
    craftUse(this.selectedRouteState.selectedRouteId.selectRoute(''));
    craftUse(this.overviewState.overview.hide());
    craftUse(this.collisionConstellationState.collisionConstellation.hide());
    craftUse(this.elkLayoutState.elkLayout.show());
    craftUse(this.constellationState.constellation.hide());
    craftUse(this.overviewState.overview.show());
    craftUse(this.selectedNodeState.selectedNodeId.selectNode(null));
    craftUse(this.selectedEdgeState.selectedEdgeKey.selectEdge(null));
    this.rebuildModel();
  }

  protected selectConstellationView(): void {
    this.constellationFocus.clear();
    this.externalRouteBundle.clear();
    this.externalRouteContent.clear();
    craftUse(this.showAllState.showAll.show());
    craftUse(this.selectedRouteState.selectedRouteId.selectRoute(''));
    craftUse(this.overviewState.overview.hide());
    craftUse(this.elkLayoutState.elkLayout.hide());
    craftUse(this.constellationState.constellation.show());
    craftUse(this.collisionConstellationState.collisionConstellation.hide());
    craftUse(this.selectedNodeState.selectedNodeId.selectNode(null));
    craftUse(this.selectedEdgeState.selectedEdgeKey.selectEdge(null));
    this.rebuildModel();
  }

  protected selectCollisionView(): void {
    this.constellationFocus.clear();
    this.externalRouteBundle.clear();
    this.externalRouteContent.clear();
    craftUse(this.showAllState.showAll.show());
    craftUse(this.selectedRouteState.selectedRouteId.selectRoute(''));
    craftUse(this.overviewState.overview.hide());
    craftUse(this.elkLayoutState.elkLayout.hide());
    craftUse(this.constellationState.constellation.show());
    craftUse(this.collisionConstellationState.collisionConstellation.show());
    craftUse(this.selectedNodeState.selectedNodeId.selectNode(null));
    craftUse(this.selectedEdgeState.selectedEdgeKey.selectEdge(null));
    this.rebuildModel();
  }

  private resetElkLayout(): void {
    this.elkLayoutRequest += 1;
    this.elkLayoutKey = '';
    this.elkPositions.clear();
  }

  protected collapseAll(): void {
    const projected = this.visibleGraph();
    const layout = this.createLayout(projected.nodes, projected.edges);
    this.collapseState.setCollapsed(
      projected.nodes
        .filter(
          (node) =>
            node.kind === 'route' ||
            node.kind === 'component' ||
            node.kind === 'service' ||
            layout.childrenByPrimitive.has(node.id),
        )
        .map((node) => node.id),
    );
  }

  protected expandAll(): void {
    this.collapseState.expandAll();
  }

  protected collapseExternalRoutes(): void {
    this.externalRouteContent.clear();
    this.externalRouteBundle.clear();
  }

  protected onSelectionChanged(event: SelectionChangedEvent): void {
    const node = event.selectedNodes[0];
    const edge = event.selectedEdges[0];
    const nodeData = node?.data as { sourceNodeId?: string } | undefined;
    const selectedNodeId = nodeData?.sourceNodeId ?? node?.id ?? null;
    craftUse(this.selectedNodeState.selectedNodeId.selectNode(selectedNodeId));
    if (node) this.hoverState.selectNode(selectedNodeId);
    else this.hoverState.clearSelection();
    craftUse(
      this.selectedEdgeState.selectedEdgeKey.selectEdge(edge?.id ?? null),
    );
    if (node || edge) craftUse(this.detailsState.detailsOpen.open());
  }

  protected onNodeDragStarted(_event: NodeDragStartedEvent): void {
    const startPositions = new Map<string, { x: number; y: number }>();
    for (const node of this.model().getNodes()) {
      if (node.position) startPositions.set(node.id, node.position);
    }
    this.dragStartPositions = startPositions;
  }

  protected onNodeDragEnded(_event: NodeDragEndedEvent): void {
    if (this.collisionConstellation()) {
      this.model().updateNodes((nodes) =>
        this.resolveDiagramNodeCollisions(nodes),
      );
      this.scheduleInternalEdgeRefresh();
    }
    this.dragStartPositions.clear();
  }

  protected onSelectionMoved(event: SelectionMovedEvent): void {
    const currentNodes = this.model().getNodes();
    const parentDeltas = event.nodes
      .map((parent) => {
        const start = this.dragStartPositions.get(parent.id);
        const current = parent.position;
        return start && current
          ? {
              parentId: parent.id,
              x: current.x - start.x,
              y: current.y - start.y,
            }
          : null;
      })
      .filter(
        (delta): delta is { parentId: string; x: number; y: number } =>
          delta !== null,
      );

    const nodesById = new Map(currentNodes.map((node) => [node.id, node]));

    if (parentDeltas.length > 0) {
      const childUpdates = currentNodes
        .filter((node) =>
          parentDeltas.some((delta) =>
            this.isDescendantOf(node, delta.parentId, nodesById),
          ),
        )
        .map((node) => {
          const delta = parentDeltas.find((candidate) =>
            this.isDescendantOf(node, candidate.parentId, nodesById),
          );
          const start = this.dragStartPositions.get(node.id);
          return delta && start
            ? {
                ...node,
                position: {
                  x: start.x + delta.x,
                  y: start.y + delta.y,
                },
              }
            : null;
        })
        .filter((node) => node !== null);
      const childUpdatesById = new Map(
        childUpdates.map((node) => [node.id, node]),
      );
      this.model().updateNodes((nodes) =>
        nodes.map((node) => childUpdatesById.get(node.id) ?? node),
      );
    }

    this.scheduleInternalEdgeRefresh();
  }

  private scheduleInternalEdgeRefresh(): void {
    if (this.internalEdgeRefreshFrame !== null) return;

    this.internalEdgeRefreshFrame = requestAnimationFrame(() => {
      this.internalEdgeRefreshFrame = null;
      this.refreshInternalEdgesForCurrentPositions();
    });
  }

  private refreshInternalEdgesForCurrentPositions(): void {
    const projected = this.getDiagramProjection();
    const baseLayout = this.createLayout(
      projected.nodes,
      projected.edges,
      projected.collapsedGroupIds,
      projected.collapsedMemberCountByGroupId,
    );
    const movedLayout: DiagramLayout = new Map(baseLayout.layout);

    for (const node of this.model().getNodes()) {
      const position = movedLayout.get(node.id);
      if (position && node.position) {
        movedLayout.set(node.id, {
          ...position,
          x: node.position.x,
          y: node.position.y,
        });
      }
    }

    const graphEdgeByKey = new Map(
      projected.edges.map((edge) => [this.edgeKey(edge), edge]),
    );
    this.model().updateEdges((edges) =>
      edges.map((diagramEdge) => {
        const graphEdge = graphEdgeByKey.get(diagramEdge.id);
        if (!graphEdge) return diagramEdge;

        const updatedEdge = this.toDiagramEdge(graphEdge, {
          ...baseLayout,
          layout: movedLayout,
        });
        return updatedEdge.routingMode === 'manual' ? updatedEdge : diagramEdge;
      }),
    );
  }

  private isDescendantOf(
    node: DiagramNode,
    ancestorId: string,
    nodesById: Map<string, DiagramNode>,
  ): boolean {
    let groupId = node.groupId;
    const visited = new Set<string>();

    while (groupId && !visited.has(groupId)) {
      if (groupId === ancestorId) return true;
      visited.add(groupId);
      groupId = nodesById.get(groupId)?.groupId;
    }

    return false;
  }

  private resolveDiagramNodeCollisions<
    Node extends {
      position: { x: number; y: number };
      size?: { width: number; height: number };
    },
  >(nodes: Node[]): Node[] {
    const margin = CONSTELLATION_LAYOUT_MARGIN / 2;
    const movedNodes = nodes.map((node) => ({
      ...node,
      position: { ...node.position },
    }));

    for (let iteration = 0; iteration < 120; iteration += 1) {
      let moved = false;
      for (let leftIndex = 0; leftIndex < movedNodes.length; leftIndex += 1) {
        const left = movedNodes[leftIndex];
        const leftSize = left.size ?? { width: 120, height: 80 };
        for (
          let rightIndex = leftIndex + 1;
          rightIndex < movedNodes.length;
          rightIndex += 1
        ) {
          const right = movedNodes[rightIndex];
          const rightSize = right.size ?? { width: 120, height: 80 };
          const dx =
            right.position.x + rightSize.width / 2 -
            (left.position.x + leftSize.width / 2);
          const dy =
            right.position.y + rightSize.height / 2 -
            (left.position.y + leftSize.height / 2);
          const overlapX =
            (leftSize.width + rightSize.width) / 2 + margin - Math.abs(dx);
          const overlapY =
            (leftSize.height + rightSize.height) / 2 + margin - Math.abs(dy);
          if (overlapX <= 0 || overlapY <= 0) continue;

          if (overlapX < overlapY) {
            const direction = dx === 0 ? 1 : Math.sign(dx);
            left.position.x -= (direction * overlapX) / 2;
            right.position.x += (direction * overlapX) / 2;
          } else {
            const direction = dy === 0 ? 1 : Math.sign(dy);
            left.position.y -= (direction * overlapY) / 2;
            right.position.y += (direction * overlapY) / 2;
          }
          moved = true;
        }
      }
      if (!moved) break;
    }

    return movedNodes;
  }

  protected onDiagramInit(): void {
    this.scheduleZoomToFit();
  }

  protected clearSelection(): void {
    craftUse(this.selectedNodeState.selectedNodeId.selectNode(null));
    this.hoverState.clearSelection();
    craftUse(this.selectedEdgeState.selectedEdgeKey.selectEdge(null));
    craftUse(this.detailsState.detailsOpen.close());
  }

  protected toggleDetails(): void {
    craftUse(this.detailsState.detailsOpen.toggle());
  }

  protected openNodeCodePreview(node: GraphNode, event: Event): void {
    if (!node.filePath) return;
    this.codePreview.toggle(
      {
        id: node.id,
        label: node.label,
        kind: node.kind,
        filePath: node.filePath,
        line: node.line,
      },
      event.currentTarget as HTMLElement,
    );
  }

  protected closeConstellationDetail(): void {
    this.constellationFocus.clear();
    craftUse(this.constellationState.constellation.show());
    this.rebuildModel();
  }

  protected edgeKey(edge: GraphEdge): string {
    return `${edge.from}|${edge.kind}|${edge.to}`;
  }

  protected displayPath(filePath?: string): string {
    return filePath?.replace(`${this.graph()?.rootDir}/`, '') ?? '—';
  }

  protected nodeDisplayLabel(node: GraphNode): string {
    const usage = this.primitiveUsage(node);
    return usage ? `${node.label} · ${usage}` : node.label;
  }

  protected overviewSummary(
    node: GraphNode | null | undefined,
  ): OverviewSummary | undefined {
    const summary = node?.details?.['overview'];
    return summary && typeof summary === 'object'
      ? (summary as OverviewSummary)
      : undefined;
  }

  protected constellationSummary(
    node: GraphNode | null | undefined,
  ): ConstellationSummary | undefined {
    const summary = node?.details?.['constellation'];
    return summary && typeof summary === 'object'
      ? (summary as ConstellationSummary)
      : undefined;
  }

  protected overviewKinds(
    summary: OverviewSummary,
  ): Array<{ kind: string; count: number }> {
    return Object.entries(summary.counts)
      .filter((entry): entry is [string, number] => entry[1] !== undefined)
      .sort((left, right) => right[1] - left[1])
      .map(([kind, count]) => ({ kind, count }));
  }

  private primitiveUsage(node: GraphNode): string | undefined {
    return node.kind === 'primitive' &&
      typeof node.details?.['usage'] === 'string'
      ? node.details['usage']
      : undefined;
  }

  protected httpEndpoints(node: GraphNode | null | undefined): HttpEndpoint[] {
    const endpoints = node?.details?.['httpEndpoints'];
    return Array.isArray(endpoints)
      ? endpoints.filter((endpoint): endpoint is HttpEndpoint => {
          if (!endpoint || typeof endpoint !== 'object') return false;
          const value = endpoint as Record<string, unknown>;
          return (
            typeof value['method'] === 'string' &&
            typeof value['url'] === 'string' &&
            typeof value['line'] === 'number'
          );
        })
      : [];
  }

  protected temporalOperations(
    node: GraphNode | null | undefined,
  ): TemporalOperation[] {
    const operations = node?.details?.['temporalOperations'];
    return Array.isArray(operations)
      ? operations.filter((operation): operation is TemporalOperation => {
          if (!operation || typeof operation !== 'object') return false;
          const value = operation as Record<string, unknown>;
          return (
            typeof value['operation'] === 'string' &&
            typeof value['line'] === 'number' &&
            (value['delay'] === undefined || typeof value['delay'] === 'string')
          );
        })
      : [];
  }

  private normalizeSearchText(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  private expandCollapsedAncestors(nodeId: string): void {
    const graph = this.visibleGraph();
    const layout = this.createLayout(graph.nodes, graph.edges);
    const collapsedIds = new Set(this.collapseState.collapsedIds());
    const visited = new Set<string>();
    let groupId = layout.layout.get(nodeId)?.groupId;
    let changed = false;

    while (groupId && !visited.has(groupId)) {
      visited.add(groupId);
      changed = collapsedIds.delete(groupId) || changed;
      groupId = layout.layout.get(groupId)?.groupId;
    }

    if (changed) this.collapseState.setCollapsed(collapsedIds);
  }

  private focusNode(nodeId: string): void {
    const nodeElement = Array.from(
      document.querySelectorAll<HTMLElement>('ng-diagram-node[data-node-id]'),
    ).find((element) => element.dataset['nodeId'] === nodeId);

    nodeElement?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
      inline: 'center',
    });
  }

  protected displayEndpoint(id: string): string {
    const parts = id.split(':');
    return parts[parts.length - 1] ?? id;
  }

  private getDiagramProjection(): DiagramProjection {
    const graph = this.visibleGraph();
    const collapsedGroupIds = new Set(this.collapseState.collapsedIds());
    const collapsedMemberCountByGroupId = new Map<string, number>();
    if (collapsedGroupIds.size === 0) {
      return {
        ...graph,
        collapsedGroupIds,
        collapsedMemberCountByGroupId,
      };
    }

    const completeLayout = this.createLayout(graph.nodes, graph.edges);
    const containsChildrenByParent = new Map<string, GraphNode[]>();
    for (const edge of graph.edges) {
      if (edge.kind !== 'contains') continue;
      const child = graph.nodes.find((node) => node.id === edge.to);
      if (!child) continue;
      const children = containsChildrenByParent.get(edge.from) ?? [];
      if (!children.some((item) => item.id === child.id)) children.push(child);
      containsChildrenByParent.set(edge.from, children);
    }

    const hiddenNodeIds = new Set<string>();
    for (const groupId of collapsedGroupIds) {
      if (!graph.nodes.some((node) => node.id === groupId)) continue;
      const hiddenByGroup = new Set<string>();
      const pending = [
        ...(completeLayout.childrenByHost.get(groupId) ?? []),
        ...(completeLayout.childrenByPrimitive.get(groupId) ?? []),
      ];

      while (pending.length > 0) {
        const child = pending.shift();
        if (!child || hiddenByGroup.has(child.id)) continue;
        hiddenByGroup.add(child.id);
        pending.push(...(containsChildrenByParent.get(child.id) ?? []));
        pending.push(
          ...(completeLayout.childrenByPrimitive.get(child.id) ?? []),
        );
      }

      hiddenByGroup.forEach((nodeId) => hiddenNodeIds.add(nodeId));
      collapsedMemberCountByGroupId.set(groupId, hiddenByGroup.size);
    }

    return {
      nodes: graph.nodes.filter((node) => !hiddenNodeIds.has(node.id)),
      edges: graph.edges.filter(
        (edge) => !hiddenNodeIds.has(edge.from) && !hiddenNodeIds.has(edge.to),
      ),
      collapsedGroupIds,
      collapsedMemberCountByGroupId,
    };
  }

  private rebuildModel(): void {
    const projected = this.getDiagramProjection();
    const layout = this.createLayout(
      projected.nodes,
      projected.edges,
      projected.collapsedGroupIds,
      projected.collapsedMemberCountByGroupId,
    );
    const renderedEdges = projected.edges.filter(
      (edge) => edge.details?.['hiddenInConstellation'] !== true,
    );
    this.hoverState.setEdges(
      renderedEdges,
      projected.nodes.map((node) => node.id),
    );
    const templateNodes = Array.from(layout.templateIdByComponent.entries())
      .map(([componentId, templateId], index) => {
        const component = projected.nodes.find(
          (node) => node.id === componentId,
        );
        return component && !layout.collapsedGroupIds.has(component.id)
          ? this.toTemplateGroupNode(component, templateId, index, layout)
          : null;
      })
      .filter((node): node is DiagramGraphGroup => node !== null);
    const nextModel = this.createModel(
      [
        ...projected.nodes.map((node, index) =>
          this.toDiagramNode(node, index, layout),
        ),
        ...templateNodes,
      ],
      renderedEdges.map((edge) => this.toDiagramEdge(edge, layout)),
    );
    const currentModel = this.model();
    currentModel.updateNodes(nextModel.getNodes());
    currentModel.updateEdges(nextModel.getEdges());
    this.scheduleZoomToFit();
  }

  private scheduleZoomToFit(): void {
    setTimeout(() => {
      this.viewportService.zoomToFit({ padding: 80 });
      requestAnimationFrame(() => this.centerDiagramViewport());
    }, 120);
  }

  private centerDiagramViewport(): void {
    const canvas = document.querySelector<HTMLElement>('.diagram-canvas');
    if (!canvas) return;

    const items = Array.from(
      canvas.querySelectorAll<HTMLElement>('.graph-node, .graph-group'),
    );
    if (items.length === 0) {
      canvas.scrollTo(
        (canvas.scrollWidth - canvas.clientWidth) / 2,
        (canvas.scrollHeight - canvas.clientHeight) / 2,
      );
      return;
    }

    const canvasBounds = canvas.getBoundingClientRect();
    const bounds = items.reduce(
      (current, item) => {
        const itemBounds = item.getBoundingClientRect();
        return {
          minX: Math.min(current.minX, itemBounds.left),
          maxX: Math.max(current.maxX, itemBounds.right),
          minY: Math.min(current.minY, itemBounds.top),
          maxY: Math.max(current.maxY, itemBounds.bottom),
        };
      },
      {
        minX: Number.POSITIVE_INFINITY,
        maxX: Number.NEGATIVE_INFINITY,
        minY: Number.POSITIVE_INFINITY,
        maxY: Number.NEGATIVE_INFINITY,
      },
    );
    const contentCenterX =
      (bounds.minX + bounds.maxX) / 2 -
      canvasBounds.left +
      canvas.scrollLeft;
    const contentCenterY =
      (bounds.minY + bounds.maxY) / 2 -
      canvasBounds.top +
      canvas.scrollTop;
    const maxScrollLeft = Math.max(0, canvas.scrollWidth - canvas.clientWidth);
    const maxScrollTop = Math.max(0, canvas.scrollHeight - canvas.clientHeight);

    canvas.scrollTo(
      Math.max(
        0,
        Math.min(maxScrollLeft, contentCenterX - canvas.clientWidth / 2),
      ),
      Math.max(
        0,
        Math.min(maxScrollTop, contentCenterY - canvas.clientHeight / 2),
      ),
    );
  }

  private createModel(
    nodes: DiagramGraphAnyNode[],
    edges: DiagramGraphEdge[],
  ): ModelAdapter {
    return runInInjectionContext(this.injector, () =>
      initializeModel({ nodes, edges }),
    );
  }

  private toDiagramNode(
    node: GraphNode,
    index: number,
    layoutResult: DiagramLayoutResult,
  ): DiagramGraphAnyNode {
    const position =
      layoutResult.layout.get(node.id) ?? this.fallbackLayoutPosition();
    const members = layoutResult.childrenByHost.get(node.id);
    const primitiveMembers = layoutResult.childrenByPrimitive.get(node.id);
    const isCollapsed = layoutResult.collapsedGroupIds.has(node.id);
    const isPrimitiveGroup =
      node.kind === 'primitive' &&
      (Boolean(primitiveMembers?.length) || isCollapsed);
    const externalRouteUses =
      node.details?.['externalRouteGhost'] === true
        ? []
        : this.externalRouteUsesForNode(node);
    const temporalOperations = this.temporalOperations(node);
    const nestedTemporalOperations = [
      ...(members ?? []),
      ...(primitiveMembers ?? []),
    ].flatMap((member) => this.temporalOperations(member));
    const mergedTemporalOperations = [
      ...temporalOperations,
      ...nestedTemporalOperations,
    ].filter(
      (operation, index, operations) =>
        operations.findIndex(
          (candidate) =>
            candidate.operation === operation.operation &&
            candidate.delay === operation.delay &&
            candidate.line === operation.line,
        ) === index,
    );

    const data: DiagramNodeData = {
      label: layoutResult.displayLabelByNodeId.get(node.id) ?? node.label,
      kind: node.kind,
      appStart: node.details?.['appStart'] === true,
      anonymous: node.details?.['anonymous'] === true,
      usageLabel: this.nodeUsageLabel(node),
      externalRouteGhost: node.details?.['externalRouteGhost'] === true,
      externalRouteBundle: node.details?.['externalRouteBundle'] === true,
      externalRouteLabel:
        typeof node.details?.['externalRouteLabel'] === 'string'
          ? node.details['externalRouteLabel']
          : undefined,
      externalRouteLabels: Array.isArray(node.details?.['externalRouteLabels'])
        ? node.details['externalRouteLabels'].filter(
            (label): label is string => typeof label === 'string',
          )
        : [],
      externalRouteContentCount:
        typeof node.details?.['externalRouteContentCount'] === 'number'
          ? node.details['externalRouteContentCount']
          : 0,
      filePath: node.filePath,
      line: node.line,
      externalRouteUses,
      httpEndpoints: this.httpEndpoints(node),
      temporalOperations: mergedTemporalOperations,
      memberCount: isCollapsed
        ? (layoutResult.collapsedMemberCountByGroupId.get(node.id) ?? 0)
        : (primitiveMembers?.length ?? members?.length),
      groupRole:
        isPrimitiveGroup || node.kind === 'primitive' ? 'primitive' : 'host',
      collapsed: isCollapsed,
      overview: this.overviewSummary(node),
      constellation: this.constellationSummary(node),
    };

    if (data.overview || data.constellation) {
      return {
        id: node.id,
        type: 'graph-node',
        position: { x: position.x, y: position.y },
        size: { width: position.width, height: position.height },
        autoSize: false,
        groupId: position.groupId,
        draggable: position.groupId === undefined,
        data,
        zOrder: index,
      };
    }

    if (isPrimitiveGroup) {
      return {
        id: node.id,
        type: 'graph-primitive-group',
        isGroup: true,
        highlighted: false,
        position: { x: position.x, y: position.y },
        size: { width: position.width, height: position.height },
        autoSize: false,
        resizable: false,
        draggable: position.groupId === undefined,
        groupId: position.groupId,
        data,
        zOrder: -250 + index,
      };
    }

    if (
      members?.length ||
      node.kind === 'component' ||
      node.kind === 'service' ||
      isCollapsed
    ) {
      return {
        id: node.id,
        type: 'graph-group',
        isGroup: true,
        highlighted: false,
        position: { x: position.x, y: position.y },
        size: { width: position.width, height: position.height },
        autoSize: false,
        resizable: false,
        draggable: position.groupId === undefined,
        data,
        zOrder: -1000 + index,
      };
    }

    return {
      id: node.id,
      type: 'graph-node',
      position: { x: position.x, y: position.y },
      size: { width: position.width, height: position.height },
      autoSize: false,
      groupId: position.groupId,
      draggable: position.groupId === undefined,
      data,
      zOrder: index,
    };
  }

  private toTemplateGroupNode(
    component: GraphNode,
    templateId: string,
    index: number,
    layoutResult: DiagramLayoutResult,
  ): DiagramGraphGroup {
    const position = layoutResult.layout.get(templateId);
    if (!position) {
      throw new Error(
        `Position introuvable pour le template de ${component.id}`,
      );
    }

    return {
      id: templateId,
      type: 'graph-template',
      isGroup: true,
      highlighted: false,
      position: { x: position.x, y: position.y },
      size: { width: position.width, height: position.height },
      autoSize: false,
      resizable: false,
      draggable: false,
      groupId: component.id,
      data: {
        label: 'template',
        kind: 'component',
        appStart: false,
        anonymous: false,
        usageLabel: 'template utilisé par ce composant',
        externalRouteGhost: false,
        externalRouteBundle: false,
        filePath: component.filePath,
        line: component.line,
        sourceNodeId: component.id,
        externalRouteUses: [],
        externalRouteLabels: [],
        externalRouteContentCount: 0,
        httpEndpoints: [],
        temporalOperations: [],
      },
      zOrder: -500 + index,
    };
  }

  private isTemplateSourcedEdge(edge: GraphEdge): boolean {
    if (edge.kind !== 'uses-property' && edge.kind !== 'calls') return false;
    const usage = edge.details?.['usage'];
    return typeof usage === 'string' && usage.split('+').includes('template');
  }

  private toDiagramEdge(
    edge: GraphEdge,
    layoutResult: DiagramLayoutResult,
  ): DiagramGraphEdge {
    const sourceId =
      edge.kind === 'renders' || this.isTemplateSourcedEdge(edge)
        ? (layoutResult.templateIdByComponent.get(edge.from) ?? edge.from)
        : edge.from;
    const source =
      layoutResult.layout.get(sourceId) ?? this.fallbackLayoutPosition();
    const target =
      layoutResult.layout.get(edge.to) ?? this.fallbackLayoutPosition();
    const sameContainer =
      source.containerId !== undefined &&
      source.containerId === target.containerId;
    let sourcePort: string | undefined;
    let targetPort: string | undefined;
    let manualPoints: Array<{ x: number; y: number }> | undefined;

    if (sameContainer) {
      sourcePort = 'out';
      targetPort = 'in';
      manualPoints = this.createInternalContainerPoints(
        source,
        target,
        layoutResult.layout.get(source.containerId ?? ''),
      );
    } else if (
      !this.constellation() &&
      (edge.kind === 'renders' ||
        edge.kind === 'depends-on' ||
        edge.kind === 'uses-property' ||
        edge.kind === 'calls')
    ) {
      const isMostlyVertical =
        Math.abs(target.y - source.y) >= Math.abs(target.x - source.x);
      if (isMostlyVertical) {
        const isDownward = target.y >= source.y;
        sourcePort = isDownward ? 'bottom' : 'top';
        targetPort = isDownward ? 'top' : 'bottom';
      } else {
        const isRightward = target.x >= source.x;
        sourcePort = isRightward ? 'out' : 'in';
        targetPort = isRightward ? 'in' : 'out';
      }
      manualPoints = this.createRenderPoints(
        source,
        target,
        sourcePort,
        targetPort,
      );
    }

    return {
      id: this.edgeKey(edge),
      type: 'graph-edge',
      source: sourceId,
      target: edge.to,
      ...(manualPoints
        ? {
            sourcePort,
            targetPort,
            sourcePosition: this.portPoint(source, sourcePort),
            targetPosition: this.portPoint(target, targetPort),
          }
        : {}),
      routing:
        manualPoints && edge.kind === 'depends-on' ? 'orthogonal' : 'polyline',
      routingMode: manualPoints ? 'manual' : 'auto',
      points: manualPoints,
      data: {
        kind: edge.kind,
        evidence: edge.evidence,
        details: edge.details ?? {},
      },
    };
  }

  private createInternalContainerPoints(
    source: DiagramLayoutPosition,
    target: DiagramLayoutPosition,
    container?: DiagramLayoutPosition,
  ): Array<{ x: number; y: number }> {
    const sourcePoint = this.portPoint(source, 'out');
    const targetPoint = this.portPoint(target, 'in');
    const laneX = container
      ? container.x + container.width - 14
      : Math.max(sourcePoint.x, targetPoint.x) + 14;

    return [
      sourcePoint,
      { x: laneX, y: sourcePoint.y },
      { x: laneX, y: targetPoint.y },
      targetPoint,
    ];
  }

  private createRenderPoints(
    source: DiagramLayoutPosition,
    target: DiagramLayoutPosition,
    sourcePort: string | undefined,
    targetPort: string | undefined,
  ): Array<{ x: number; y: number }> {
    const sourcePoint = this.portPoint(source, sourcePort);
    const targetPoint = this.portPoint(target, targetPort);
    const isVertical = sourcePort === 'top' || sourcePort === 'bottom';
    if (!isVertical || sourcePoint.x === targetPoint.x) {
      return [sourcePoint, targetPoint];
    }

    const laneY = sourcePoint.y + (targetPoint.y - sourcePoint.y) / 2;
    return [
      sourcePoint,
      { x: sourcePoint.x, y: laneY },
      { x: targetPoint.x, y: laneY },
      targetPoint,
    ];
  }

  private portPoint(
    position: DiagramLayoutPosition,
    port: string | undefined,
  ): { x: number; y: number } {
    const x = position.x;
    const y = position.y;

    switch (port) {
      case 'in':
        return { x, y: y + 46 };
      case 'out':
        return { x: x + position.width, y: y + position.height / 2 };
      case 'top':
        return { x: x + position.width / 2, y };
      case 'bottom':
        return { x: x + position.width / 2, y: y + position.height };
      default:
        return {
          x: x + position.width / 2,
          y: y + position.height / 2,
        };
    }
  }

  private createConstellationLayout(
    nodes: GraphNode[],
    edges: GraphEdge[],
  ): DiagramLayoutResult {
    if (this.collisionConstellation()) {
      return this.createCollisionConstellationLayout(nodes, edges);
    }

    // Les cercles ont une taille proportionnelle au poids : la surface doit
    // donc grandir avec eux pour éviter que les nœuds pondérés ne se tassent.
    const width = 5200;
    const height = 3800;
    const labelCounts = new Map<string, number>();
    nodes.forEach((node) =>
      labelCounts.set(node.label, (labelCounts.get(node.label) ?? 0) + 1),
    );

    const displayLabelByNodeId = new Map(
      nodes.map((node) => [
        node.id,
        (labelCounts.get(node.label) ?? 0) > 1 && node.line
          ? `${node.label} · L${node.line}`
          : node.label,
      ] as const),
    );
    const simulationNodes = nodes.map((node, index) => {
      const angle = (index / Math.max(1, nodes.length)) * Math.PI * 2;
      const ring =
        node.kind === 'route'
          ? 1350
          : node.kind === 'component' || node.kind === 'service'
            ? 850
            : 560;
      const size = this.constellationNodeSize(node);
      return {
        node,
        x: width / 2 + Math.cos(angle) * ring,
        y: height / 2 + Math.sin(angle) * ring * 0.78,
        vx: 0,
        vy: 0,
        width: size.width,
        height: size.height,
      };
    });
    const simulationNodeById = new Map(
      simulationNodes.map((simulationNode) => [
        simulationNode.node.id,
        simulationNode,
      ]),
    );
    const simulationEdgesByPair = new Map<
      string,
      {
        edge: GraphEdge;
        from: (typeof simulationNodes)[number];
        to: (typeof simulationNodes)[number];
        linkCount: number;
      }
    >();
    for (const edge of edges) {
      const from = simulationNodeById.get(edge.from);
      const to = simulationNodeById.get(edge.to);
      if (!from || !to) continue;

      const pairKey = [edge.from, edge.to].sort().join('|');
      const linkCount =
        typeof edge.details?.['constellationLinkCount'] === 'number'
          ? edge.details['constellationLinkCount']
          : 1;
      const existing = simulationEdgesByPair.get(pairKey);
      if (existing) {
        existing.linkCount = Math.max(existing.linkCount, linkCount);
      } else {
        simulationEdgesByPair.set(pairKey, {
          edge,
          from,
          to,
          linkCount,
        });
      }
    }
    const simulationEdges = Array.from(simulationEdgesByPair.values());

    for (let iteration = 0; iteration < 220; iteration += 1) {
      for (let leftIndex = 0; leftIndex < simulationNodes.length; leftIndex += 1) {
        const left = simulationNodes[leftIndex];
        for (
          let rightIndex = leftIndex + 1;
          rightIndex < simulationNodes.length;
          rightIndex += 1
        ) {
          const right = simulationNodes[rightIndex];
          let dx = right.x - left.x;
          let dy = right.y - left.y;
          const distance = Math.max(1, Math.hypot(dx, dy));
          dx /= distance;
          dy /= distance;
          const repulsion = Math.min(8, 40000 / (distance * distance));
          left.vx -= dx * repulsion;
          left.vy -= dy * repulsion;
          right.vx += dx * repulsion;
          right.vy += dy * repulsion;
          const minimumDistance =
            (Math.max(left.width, left.height) +
              Math.max(right.width, right.height)) /
              2 +
            30;
          if (distance < minimumDistance) {
            const push = (minimumDistance - distance) * 0.16;
            left.vx -= dx * push;
            left.vy -= dy * push;
            right.vx += dx * push;
            right.vy += dy * push;
          }
        }
      }

      for (const simulationEdge of simulationEdges) {
        const { from, to, linkCount } = simulationEdge;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const distance = Math.max(1, Math.hypot(dx, dy));
        const attractionMultiplier = Math.min(
          3.5,
          1 + Math.log2(Math.max(1, linkCount)) * 0.75,
        );
        const targetDistance = 220;
        const strength = 0.0055 * attractionMultiplier;
        const pull = (distance - targetDistance) * strength;
        from.vx += (dx / distance) * pull;
        from.vy += (dy / distance) * pull;
        to.vx -= (dx / distance) * pull;
        to.vy -= (dy / distance) * pull;
      }

      for (const simulationNode of simulationNodes) {
        simulationNode.vx += (width / 2 - simulationNode.x) * 0.0008;
        simulationNode.vy += (height / 2 - simulationNode.y) * 0.0008;
        simulationNode.vx = Math.max(-16, Math.min(16, simulationNode.vx));
        simulationNode.vy = Math.max(-16, Math.min(16, simulationNode.vy));
        simulationNode.x += simulationNode.vx;
        simulationNode.y += simulationNode.vy;
        simulationNode.vx *= 0.88;
        simulationNode.vy *= 0.88;
      }
    }

    // Dernière passe déterministe : la simulation peut laisser deux gros
    // nœuds se toucher lorsque plusieurs liens les attirent au même endroit.
    // Cette passe ne cherche plus l'équilibre global ; elle garantit seulement
    // une marge minimale de lecture entre les cercles.
    for (let pass = 0; pass < 90; pass += 1) {
      let moved = false;
      for (let leftIndex = 0; leftIndex < simulationNodes.length; leftIndex += 1) {
        const left = simulationNodes[leftIndex];
        for (
          let rightIndex = leftIndex + 1;
          rightIndex < simulationNodes.length;
          rightIndex += 1
        ) {
          const right = simulationNodes[rightIndex];
          let dx = right.x - left.x;
          let dy = right.y - left.y;
          const distance = Math.max(1, Math.hypot(dx, dy));
          const minimumDistance =
            (Math.max(left.width, left.height) +
              Math.max(right.width, right.height)) /
              2 +
              56;
          if (distance >= minimumDistance) continue;
          dx /= distance;
          dy /= distance;
          // Chaque nœud prend la moitié de l'écart : la paire est séparée
          // dès cette passe, puis les éventuels nouveaux conflits sont
          // résolus aux passes suivantes.
          const push = (minimumDistance - distance) * 0.5;
          left.x -= dx * push;
          left.y -= dy * push;
          right.x += dx * push;
          right.y += dy * push;
          moved = true;
        }
      }
      for (const simulationNode of simulationNodes) {
        simulationNode.x = Math.max(
          simulationNode.width / 2 + 24,
          Math.min(width - simulationNode.width / 2 - 24, simulationNode.x),
        );
        simulationNode.y = Math.max(
          simulationNode.height / 2 + 24,
          Math.min(height - simulationNode.height / 2 - 24, simulationNode.y),
        );
      }
      if (!moved) break;
    }

    const layout: DiagramLayout = new Map();
    simulationNodes.forEach((simulationNode, index) => {
      layout.set(simulationNode.node.id, {
        column: 0,
        row: index,
        x: Math.max(
          20,
          Math.min(
            width - simulationNode.width - 20,
            simulationNode.x - simulationNode.width / 2,
          ),
        ),
        y: Math.max(
          20,
          Math.min(
            height - simulationNode.height - 20,
            simulationNode.y - simulationNode.height / 2,
          ),
        ),
        width: simulationNode.width,
        height: simulationNode.height,
      });
    });

    return {
      layout,
      childrenByHost: new Map(),
      childrenByPrimitive: new Map(),
      displayLabelByNodeId,
      collapsedGroupIds: new Set(),
      collapsedMemberCountByGroupId: new Map(),
      templateIdByComponent: new Map(),
      width,
      height,
    };
  }

  private createCollisionConstellationLayout(
    nodes: GraphNode[],
    edges: GraphEdge[],
  ): DiagramLayoutResult {
    const width = 5600;
    const height = 4000;
    const padding = 80;
    const collisionMargin = CONSTELLATION_LAYOUT_MARGIN;
    const labelCounts = new Map<string, number>();
    nodes.forEach((node) =>
      labelCounts.set(node.label, (labelCounts.get(node.label) ?? 0) + 1),
    );

    const displayLabelByNodeId = new Map(
      nodes.map((node) => [
        node.id,
        (labelCounts.get(node.label) ?? 0) > 1 && node.line
          ? `${node.label} · L${node.line}`
          : node.label,
      ] as const),
    );
    const collisionNodes = nodes.map((node, index) => {
      const angle = (index / Math.max(1, nodes.length)) * Math.PI * 2;
      const ring =
        node.kind === 'route'
          ? 1000
          : node.kind === 'component' || node.kind === 'service'
            ? 760
            : 480;
      const size = this.constellationNodeSize(node);
      return {
        node,
        x: width / 2 + Math.cos(angle) * ring,
        y: height / 2 + Math.sin(angle) * ring * 0.78,
        vx: 0,
        vy: 0,
        width: size.width,
        height: size.height,
      };
    });

    const collisionNodeById = new Map(
      collisionNodes.map((collisionNode) => [
        collisionNode.node.id,
        collisionNode,
      ]),
    );
    const simulationEdgesByPair = new Map<
      string,
      {
        from: (typeof collisionNodes)[number];
        to: (typeof collisionNodes)[number];
        linkCount: number;
      }
    >();
    for (const edge of edges) {
      const from = collisionNodeById.get(edge.from);
      const to = collisionNodeById.get(edge.to);
      if (!from || !to) continue;

      const pairKey = [edge.from, edge.to].sort().join('|');
      const linkCount =
        typeof edge.details?.['constellationLinkCount'] === 'number'
          ? edge.details['constellationLinkCount']
          : 1;
      const existing = simulationEdgesByPair.get(pairKey);
      if (existing) {
        existing.linkCount = Math.max(existing.linkCount, linkCount);
      } else {
        simulationEdgesByPair.set(pairKey, { from, to, linkCount });
      }
    }

    // La vue collision conserve une force d'attraction : les liens donnent
    // une structure au placement avant que la séparation finale ne garantisse
    // une marge lisible entre les blocs.
    for (let iteration = 0; iteration < 220; iteration += 1) {
      for (let leftIndex = 0; leftIndex < collisionNodes.length; leftIndex += 1) {
        const left = collisionNodes[leftIndex];
        for (
          let rightIndex = leftIndex + 1;
          rightIndex < collisionNodes.length;
          rightIndex += 1
        ) {
          const right = collisionNodes[rightIndex];
          let dx = right.x - left.x;
          let dy = right.y - left.y;
          const distance = Math.max(1, Math.hypot(dx, dy));
          dx /= distance;
          dy /= distance;
          const repulsion = Math.min(10, 50000 / (distance * distance));
          left.vx -= dx * repulsion;
          left.vy -= dy * repulsion;
          right.vx += dx * repulsion;
          right.vy += dy * repulsion;
        }
      }

      for (const { from, to, linkCount } of simulationEdgesByPair.values()) {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const distance = Math.max(1, Math.hypot(dx, dy));
        const attractionMultiplier = Math.min(
          3.5,
          1 + Math.log2(Math.max(1, linkCount)) * 0.75,
        );
        const pull = (distance - 250) * 0.0055 * attractionMultiplier;
        from.vx += (dx / distance) * pull;
        from.vy += (dy / distance) * pull;
        to.vx -= (dx / distance) * pull;
        to.vy -= (dy / distance) * pull;
      }

      for (const collisionNode of collisionNodes) {
        collisionNode.vx += (width / 2 - collisionNode.x) * 0.0008;
        collisionNode.vy += (height / 2 - collisionNode.y) * 0.0008;
        collisionNode.vx = Math.max(-18, Math.min(18, collisionNode.vx));
        collisionNode.vy = Math.max(-18, Math.min(18, collisionNode.vy));
        collisionNode.x += collisionNode.vx;
        collisionNode.y += collisionNode.vy;
        collisionNode.vx *= 0.88;
        collisionNode.vy *= 0.88;
      }
    }

    // Même principe que l'exemple React Flow : après le placement initial,
    // chaque paire qui se chevauche est séparée sur l'axe de pénétration
    // minimale. Les passes s'arrêtent dès qu'il n'y a plus de collision.
    for (let iteration = 0; iteration < 180; iteration += 1) {
      let moved = false;
      for (let leftIndex = 0; leftIndex < collisionNodes.length; leftIndex += 1) {
        const left = collisionNodes[leftIndex];
        for (
          let rightIndex = leftIndex + 1;
          rightIndex < collisionNodes.length;
          rightIndex += 1
        ) {
          const right = collisionNodes[rightIndex];
          const dx = right.x - left.x;
          const dy = right.y - left.y;
          const minimumX =
            (left.width + right.width) / 2 + collisionMargin;
          const minimumY =
            (left.height + right.height) / 2 + collisionMargin;
          const overlapX = minimumX - Math.abs(dx);
          const overlapY = minimumY - Math.abs(dy);
          if (overlapX <= 0 || overlapY <= 0) continue;

          const directionX = dx === 0 ? (rightIndex % 2 === 0 ? 1 : -1) : Math.sign(dx);
          const directionY = dy === 0 ? (leftIndex % 2 === 0 ? 1 : -1) : Math.sign(dy);
          if (overlapX < overlapY) {
            const shift = overlapX / 2;
            left.x -= directionX * shift;
            right.x += directionX * shift;
          } else {
            const shift = overlapY / 2;
            left.y -= directionY * shift;
            right.y += directionY * shift;
          }
          moved = true;
        }
      }

      for (const collisionNode of collisionNodes) {
        collisionNode.x = Math.max(
          collisionNode.width / 2 + padding,
          Math.min(width - collisionNode.width / 2 - padding, collisionNode.x),
        );
        collisionNode.y = Math.max(
          collisionNode.height / 2 + padding,
          Math.min(height - collisionNode.height / 2 - padding, collisionNode.y),
        );
      }
      if (!moved) break;
    }

    const layout: DiagramLayout = new Map();
    collisionNodes.forEach((collisionNode, index) => {
      layout.set(collisionNode.node.id, {
        column: 0,
        row: index,
        x: collisionNode.x - collisionNode.width / 2,
        y: collisionNode.y - collisionNode.height / 2,
        width: collisionNode.width,
        height: collisionNode.height,
      });
    });

    return {
      layout,
      childrenByHost: new Map(),
      childrenByPrimitive: new Map(),
      displayLabelByNodeId,
      collapsedGroupIds: new Set(),
      collapsedMemberCountByGroupId: new Map(),
      templateIdByComponent: new Map(),
      width,
      height,
    };
  }

  private constellationNodeSize(node: GraphNode): {
    width: number;
    height: number;
  } {
    const scale = this.constellationScale(node);
    const baseDiameter =
      node.kind === 'property'
        ? 100
        : node.kind === 'primitive'
          ? 126
          : node.kind === 'route'
            ? 150
            : 180;
    const diameter = Math.round(baseDiameter * scale);
    return { width: diameter, height: diameter };
  }

  private createLayout(
    nodes: GraphNode[],
    edges: GraphEdge[],
    collapsedGroupIds: ReadonlySet<string> = new Set(),
    collapsedMemberCountByGroupId: ReadonlyMap<string, number> = new Map(),
  ): DiagramLayoutResult {
    const baseLayout = this.createStandardLayout(
      nodes,
      edges,
      collapsedGroupIds,
      collapsedMemberCountByGroupId,
    );
    if (!this.elkLayout() || this.constellation()) return baseLayout;

    this.scheduleElkLayout(nodes, edges, baseLayout);
    return this.applyElkPositions(nodes, baseLayout);
  }

  private createStandardLayout(
    nodes: GraphNode[],
    edges: GraphEdge[],
    collapsedGroupIds: ReadonlySet<string> = new Set(),
    collapsedMemberCountByGroupId: ReadonlyMap<string, number> = new Map(),
  ): DiagramLayoutResult {
    if (this.constellation()) {
      return this.createConstellationLayout(nodes, edges);
    }

    const layout: DiagramLayout = new Map();
    const nodesById = new Map(nodes.map((node) => [node.id, node]));
    const containsChildrenByParent = new Map<string, GraphNode[]>();
    const childrenByHost = new Map<string, GraphNode[]>();
    const childrenByPrimitive = new Map<string, GraphNode[]>();
    const propertiesGroupedByPrimitive = new Set<string>();
    const labelCounts = new Map<string, number>();
    for (const node of nodes) {
      const usage =
        node.kind === 'primitive' && typeof node.details?.['usage'] === 'string'
          ? node.details['usage']
          : undefined;
      const contextualLabel = usage ? `${node.label} · ${usage}` : node.label;
      labelCounts.set(
        contextualLabel,
        (labelCounts.get(contextualLabel) ?? 0) + 1,
      );
    }
    const displayLabelByNodeId = new Map(
      nodes.map((node) => {
        const usage =
          node.kind === 'primitive' &&
          typeof node.details?.['usage'] === 'string'
            ? node.details['usage']
            : undefined;
        const contextualLabel = usage ? `${node.label} · ${usage}` : node.label;
        const isDuplicate = (labelCounts.get(contextualLabel) ?? 0) > 1;
        return [
          node.id,
          isDuplicate && node.line
            ? `${contextualLabel} · L${node.line}`
            : contextualLabel,
        ] as const;
      }),
    );
    const templateIdByComponent = new Map<string, string>();

    for (const edge of edges) {
      const child = nodesById.get(edge.to);
      if (!child || !nodesById.has(edge.from)) continue;

      if (edge.kind === 'contains') {
        const children = containsChildrenByParent.get(edge.from) ?? [];
        if (!children.some((item) => item.id === child.id))
          children.push(child);
        containsChildrenByParent.set(edge.from, children);
      }
    }

    for (const primitive of nodes.filter((node) => node.kind === 'primitive')) {
      const members: GraphNode[] = [];
      const visited = new Set<string>();
      const primitiveName =
        typeof primitive.details?.['name'] === 'string'
          ? primitive.details['name']
          : undefined;
      const ownerId =
        typeof primitive.details?.['ownerId'] === 'string'
          ? primitive.details['ownerId']
          : undefined;
      const owner = ownerId ? nodesById.get(ownerId) : undefined;
      const propertyPrefix =
        owner && primitiveName ? `${owner.label}.${primitiveName}` : undefined;
      const semanticProperties = propertyPrefix
        ? nodes.filter(
            (node) =>
              node.kind === 'property' &&
              (node.label === propertyPrefix ||
                node.label.startsWith(`${propertyPrefix}.`)),
          )
        : [];
      const pending = [
        ...(containsChildrenByParent.get(primitive.id) ?? []),
        ...semanticProperties,
      ];

      while (pending.length > 0) {
        const child = pending.shift();
        if (!child || visited.has(child.id)) continue;
        visited.add(child.id);

        if (child.kind === 'property') {
          members.push(child);
          propertiesGroupedByPrimitive.add(child.id);
          pending.push(...(containsChildrenByParent.get(child.id) ?? []));
        } else if (child.kind === 'primitive') {
          members.push(child);
        }
      }

      if (members.length > 0) childrenByPrimitive.set(primitive.id, members);
    }

    const nestedPrimitiveIds = new Set(
      [...childrenByPrimitive.values()].flatMap((members) =>
        members
          .filter((member) => member.kind === 'primitive')
          .map((member) => member.id),
      ),
    );

    for (const host of nodes) {
      if (
        host.kind !== 'route' &&
        host.kind !== 'component' &&
        host.kind !== 'service'
      ) {
        continue;
      }

      const members: GraphNode[] = [];
      const visited = new Set<string>();
      const pending = [...(containsChildrenByParent.get(host.id) ?? [])];

      while (pending.length > 0) {
        const child = pending.shift();
        if (!child || visited.has(child.id)) continue;
        visited.add(child.id);

        if (
          child.kind === 'route-hook' ||
          (child.kind === 'primitive' && !nestedPrimitiveIds.has(child.id)) ||
          (child.kind === 'property' &&
            !propertiesGroupedByPrimitive.has(child.id))
        ) {
          members.push(child);
        }
        if (child.kind !== 'primitive') {
          pending.push(...(containsChildrenByParent.get(child.id) ?? []));
        }
      }

      if (members.length > 0) childrenByHost.set(host.id, members);
    }

    const childIds = new Set([
      ...Array.from(childrenByHost.values()).flatMap((children) =>
        children.map((child) => child.id),
      ),
      ...Array.from(childrenByPrimitive.values()).flatMap((children) =>
        children.map((child) => child.id),
      ),
    ]);
    const topLevelNodes = nodes.filter((node) => !childIds.has(node.id));
    const orderedTopLevelNodes = this.orderTopLevelNodes(
      topLevelNodes,
      edges,
      childrenByHost,
      childrenByPrimitive,
    );
    const rowByColumn = new Map<number, number>();
    const cursorYByColumn = new Map<number, number>();
    let maxColumn = 0;
    let maxBottom = DIAGRAM_ORIGIN_Y + DIAGRAM_NODE_HEIGHT;

    for (const node of orderedTopLevelNodes) {
      const column = NODE_COLUMNS[node.kind];
      const row = rowByColumn.get(column) ?? 0;
      const members = childrenByHost.get(node.id);
      const isCollapsed = collapsedGroupIds.has(node.id);
      const isOverviewNode = this.overviewSummary(node) !== undefined;
      const hasTemplate =
        node.kind === 'component' &&
        !isCollapsed &&
        !isOverviewNode &&
        !this.constellation();
      const hasVisualChildren =
        !isOverviewNode &&
        (node.kind === 'component' ||
          node.kind === 'service' ||
          Boolean(members?.length) ||
          isCollapsed);
      const width = hasVisualChildren
        ? this.constellationSize(node, GROUP_WIDTH, DIAGRAM_NODE_HEIGHT).width
        : this.constellationSize(node, DIAGRAM_NODE_WIDTH, DIAGRAM_NODE_HEIGHT)
            .width;
      const groupHeaderHeight = this.groupHeaderHeight(node);
      const templateHeight = 58;
      const defaultMemberWidth = Math.max(
        200,
        width - GROUP_PADDING * 2 - 22,
      );
      const memberSizes =
        members?.map((member) => {
          const primitiveMembers = childrenByPrimitive.get(member.id);
          if (!primitiveMembers?.length) {
            return this.constellationSize(
              member,
              DIAGRAM_NODE_WIDTH,
              DIAGRAM_NODE_HEIGHT,
            );
          }

          const propertySizes = primitiveMembers.map((property) =>
            this.constellationSize(
              property,
              DIAGRAM_NODE_WIDTH,
              DIAGRAM_NODE_HEIGHT,
            ),
          );
          const primitiveScale = this.constellationScale(member);
          return {
            width: Math.max(
              defaultMemberWidth,
              ...propertySizes.map(
                (property) => property.width + GROUP_PADDING * 2 + 22,
              ),
            ),
            height:
              this.primitiveGroupHeaderHeight(member) +
              GROUP_PADDING * 2 +
              Math.round(DIAGRAM_NODE_HEIGHT * (primitiveScale - 1) * 0.5) +
              propertySizes.reduce((total, property) => total + property.height, 0) +
              Math.max(0, propertySizes.length - 1) * GROUP_CHILD_GAP,
          };
        }) ?? [];
      const membersHeight = memberSizes.reduce(
        (total, member) => total + member.height,
        0,
      );
      const innerHeight =
        (hasTemplate ? templateHeight : 0) +
        (hasTemplate && members?.length ? GROUP_CHILD_GAP : 0) +
        (members?.length
          ? membersHeight + Math.max(0, members.length - 1) * GROUP_CHILD_GAP
          : 0);
      const height = hasVisualChildren
        ? groupHeaderHeight + GROUP_PADDING * 2 + innerHeight
        : DIAGRAM_NODE_HEIGHT;
      const x = DIAGRAM_ORIGIN_X + column * COLUMN_WIDTH;
      const y = cursorYByColumn.get(column) ?? DIAGRAM_ORIGIN_Y;

      layout.set(node.id, {
        column,
        row,
        x,
        y,
        width,
        height,
        containerId: hasVisualChildren ? node.id : undefined,
      });
      rowByColumn.set(column, row + 1);
      cursorYByColumn.set(column, y + height + ROW_GAP);
      maxColumn = Math.max(maxColumn, column);
      maxBottom = Math.max(maxBottom, y + height);

      let childY = y + groupHeaderHeight + GROUP_PADDING;

      if (hasTemplate) {
        const templateId = `template:${node.id}`;
        templateIdByComponent.set(node.id, templateId);
          layout.set(templateId, {
          column,
          row: 0,
          x: x + GROUP_PADDING,
          y: childY,
          width: width - GROUP_PADDING * 2,
          height: templateHeight,
          groupId: node.id,
          containerId: node.id,
        });
        childY += templateHeight + (members?.length ? GROUP_CHILD_GAP : 0);
      }

      if (members?.length) {
        members.forEach((child, childIndex) => {
          const memberSize = memberSizes[childIndex];
          const primitiveMembers = childrenByPrimitive.get(child.id);
          const memberX = x + GROUP_PADDING + 11;
          const memberY =
            childY +
            memberSizes
              .slice(0, childIndex)
              .reduce(
                (total, member) => total + member.height + GROUP_CHILD_GAP,
                0,
              );
          layout.set(child.id, {
            column,
            row: childIndex,
            x: memberX,
            y: memberY,
            width: memberSize.width,
            height: memberSize.height,
            groupId: node.id,
            containerId: primitiveMembers?.length ? child.id : node.id,
          });

          if (primitiveMembers?.length) {
            let propertyY =
              memberY + this.primitiveGroupHeaderHeight(child) + GROUP_PADDING;
            primitiveMembers.forEach((property, propertyIndex) => {
              const propertySize = this.constellationSize(
                property,
                DIAGRAM_NODE_WIDTH,
                DIAGRAM_NODE_HEIGHT,
              );
              layout.set(property.id, {
                column,
                row: propertyIndex,
                x: memberX + GROUP_PADDING + 11,
                y: propertyY,
                width: propertySize.width,
                height: propertySize.height,
                groupId: child.id,
                containerId: child.id,
              });
              propertyY += propertySize.height + GROUP_CHILD_GAP;
            });
          }
        });
      }
    }

    return {
      layout,
      childrenByHost,
      childrenByPrimitive,
      displayLabelByNodeId,
      collapsedGroupIds,
      collapsedMemberCountByGroupId,
      templateIdByComponent,
      width: Math.max(
        1400,
        DIAGRAM_ORIGIN_X + (maxColumn + 1) * COLUMN_WIDTH + GROUP_WIDTH + 80,
      ),
      height: Math.max(1200, maxBottom + DIAGRAM_ORIGIN_Y + 80),
    };
  }

  private scheduleElkLayout(
    nodes: GraphNode[],
    edges: GraphEdge[],
    baseLayout: DiagramLayoutResult,
  ): void {
    const topLevelNodes = nodes.filter((node) => {
      const position = baseLayout.layout.get(node.id);
      return position !== undefined && position.groupId === undefined;
    });
    if (topLevelNodes.length === 0) return;

    const topLevelIds = new Set(topLevelNodes.map((node) => node.id));
    const ownerByLayoutId = this.createElkOwnerMap(baseLayout, topLevelIds);
    const uniqueEdges = new Set<string>();
    const elkEdges: ElkNode['edges'] = [];

    for (const edge of edges) {
      const source = ownerByLayoutId.get(edge.from);
      const target = ownerByLayoutId.get(edge.to);
      if (!source || !target || source === target) continue;
      const edgeKey = `${source}->${target}`;
      if (uniqueEdges.has(edgeKey)) continue;
      uniqueEdges.add(edgeKey);
      elkEdges.push({
        id: `elk-edge-${uniqueEdges.size}`,
        sources: [source],
        targets: [target],
      });
    }

    const elkNodes: ElkNode[] = topLevelNodes.map((node) => {
      const position = baseLayout.layout.get(node.id);
      return {
        id: node.id,
        width: position?.width ?? DIAGRAM_NODE_WIDTH,
        height: position?.height ?? DIAGRAM_NODE_HEIGHT,
      };
    });
    const layoutKey = [
      topLevelNodes
        .map((node) => {
          const position = baseLayout.layout.get(node.id);
          return `${node.id}:${position?.width ?? 0}x${position?.height ?? 0}`;
        })
        .sort()
        .join('|'),
      Array.from(uniqueEdges).sort().join('|'),
    ].join('::');
    if (layoutKey === this.elkLayoutKey) return;

    this.elkLayoutKey = layoutKey;
    const requestId = ++this.elkLayoutRequest;
    const elkGraph: ElkNode = {
      id: 'craft-graph-root',
      children: elkNodes,
      edges: elkEdges,
      layoutOptions: {
        'elk.algorithm': 'layered',
        'elk.direction': 'RIGHT',
        'elk.spacing.nodeNode': '80',
        'elk.spacing.edgeNode': '40',
        'elk.layered.spacing.nodeNodeBetweenLayers': '180',
        'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
        'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      },
    };

    void this.elk.layout(elkGraph).then((result) => {
      if (requestId !== this.elkLayoutRequest || !this.elkLayout()) return;

      const positions = new Map<string, ElkPosition>();
      for (const child of result.children ?? []) {
        if (typeof child.x !== 'number' || typeof child.y !== 'number') {
          continue;
        }
        positions.set(child.id, { x: child.x, y: child.y });
      }
      this.elkPositions = positions;
      this.rebuildModel();
    }).catch((error: unknown) => {
      if (requestId === this.elkLayoutRequest) {
        console.warn('ELK.js layout indisponible, placement standard conservé.', error);
      }
    });
  }

  private applyElkPositions(
    nodes: GraphNode[],
    baseLayout: DiagramLayoutResult,
  ): DiagramLayoutResult {
    if (this.elkPositions.size === 0) return baseLayout;

    const topLevelIds = new Set(
      nodes
        .filter((node) => {
          const position = baseLayout.layout.get(node.id);
          return position !== undefined && position.groupId === undefined;
        })
        .map((node) => node.id),
    );
    const ownerByLayoutId = this.createElkOwnerMap(baseLayout, topLevelIds);
    const deltaByOwner = new Map<string, ElkPosition>();

    for (const ownerId of topLevelIds) {
      const target = this.elkPositions.get(ownerId);
      const current = baseLayout.layout.get(ownerId);
      if (!target || !current) continue;
      deltaByOwner.set(ownerId, {
        x: DIAGRAM_ORIGIN_X + target.x - current.x,
        y: DIAGRAM_ORIGIN_Y + target.y - current.y,
      });
    }
    if (deltaByOwner.size === 0) return baseLayout;

    const layout: DiagramLayout = new Map();
    let maxRight = baseLayout.width;
    let maxBottom = baseLayout.height;
    for (const [id, position] of baseLayout.layout) {
      const ownerId = ownerByLayoutId.get(id);
      const delta = ownerId ? deltaByOwner.get(ownerId) : undefined;
      const nextPosition = delta
        ? { ...position, x: position.x + delta.x, y: position.y + delta.y }
        : position;
      layout.set(id, nextPosition);
      maxRight = Math.max(maxRight, nextPosition.x + nextPosition.width + 80);
      maxBottom = Math.max(maxBottom, nextPosition.y + nextPosition.height + 80);
    }

    return {
      ...baseLayout,
      layout,
      width: Math.max(baseLayout.width, maxRight),
      height: Math.max(baseLayout.height, maxBottom),
    };
  }

  private createElkOwnerMap(
    layoutResult: DiagramLayoutResult,
    topLevelIds: ReadonlySet<string>,
  ): Map<string, string> {
    const ownerByLayoutId = new Map<string, string>();
    for (const [id, position] of layoutResult.layout) {
      let currentId = id;
      let currentPosition: DiagramLayoutPosition | undefined = position;
      const visited = new Set<string>();
      while (
        currentPosition?.groupId &&
        currentPosition.groupId !== currentId &&
        !visited.has(currentId)
      ) {
        visited.add(currentId);
        currentId = currentPosition.groupId;
        currentPosition = layoutResult.layout.get(currentId);
      }
      if (topLevelIds.has(currentId)) ownerByLayoutId.set(id, currentId);
    }
    return ownerByLayoutId;
  }

  private orderTopLevelNodes(
    topLevelNodes: GraphNode[],
    edges: GraphEdge[],
    childrenByHost: ReadonlyMap<string, GraphNode[]>,
    childrenByPrimitive: ReadonlyMap<string, GraphNode[]>,
  ): GraphNode[] {
    const topLevelIds = new Set(topLevelNodes.map((node) => node.id));
    const topLevelByNodeId = new Map<string, string>();
    const nodeById = new Map(topLevelNodes.map((node) => [node.id, node]));

    for (const node of topLevelNodes) topLevelByNodeId.set(node.id, node.id);

    for (const [hostId, members] of childrenByHost) {
      if (!topLevelIds.has(hostId)) continue;
      for (const member of members) {
        topLevelByNodeId.set(member.id, hostId);
        for (const property of childrenByPrimitive.get(member.id) ?? []) {
          topLevelByNodeId.set(property.id, hostId);
        }
      }
    }

    const neighborsByNodeId = new Map<string, Set<string>>();
    const addNeighbor = (from: string, to: string): void => {
      if (from === to || !topLevelIds.has(from) || !topLevelIds.has(to)) {
        return;
      }
      const neighbors = neighborsByNodeId.get(from) ?? new Set<string>();
      neighbors.add(to);
      neighborsByNodeId.set(from, neighbors);
    };

    for (const edge of edges) {
      const from = topLevelByNodeId.get(edge.from);
      const to = topLevelByNodeId.get(edge.to);
      if (!from || !to) continue;
      addNeighbor(from, to);
      addNeighbor(to, from);
    }

    const nodesByColumn = new Map<number, GraphNode[]>();
    for (const node of topLevelNodes) {
      const column = NODE_COLUMNS[node.kind];
      const columnNodes = nodesByColumn.get(column) ?? [];
      columnNodes.push(node);
      nodesByColumn.set(column, columnNodes);
    }

    const orderIndex = new Map<string, number>();
    const refreshOrderIndex = (): void => {
      for (const columnNodes of nodesByColumn.values()) {
        columnNodes.forEach((node, index) => orderIndex.set(node.id, index));
      }
    };
    refreshOrderIndex();

    const reorderColumn = (
      column: number,
      direction: 'left' | 'right',
    ): void => {
      const columnNodes = nodesByColumn.get(column);
      if (!columnNodes || columnNodes.length < 2) return;

      const currentOrder = new Map(
        columnNodes.map((node, index) => [node.id, index]),
      );
      const ranked = columnNodes.map((node, originalIndex) => {
        const neighborOrders = Array.from(
          neighborsByNodeId.get(node.id) ?? [],
        )
          .filter((neighborId) => {
            const neighbor = nodeById.get(neighborId);
            if (!neighbor) return false;
            const neighborColumn = NODE_COLUMNS[neighbor.kind];
            return direction === 'left'
              ? neighborColumn < column
              : neighborColumn > column;
          })
          .map((neighborId) => orderIndex.get(neighborId))
          .filter((index): index is number => index !== undefined);

        return {
          node,
          originalIndex,
          score:
            neighborOrders.length > 0
              ? neighborOrders.reduce((total, index) => total + index, 0) /
                neighborOrders.length
              : (currentOrder.get(node.id) ?? originalIndex),
        };
      });

      ranked.sort(
        (left, right) =>
          left.score - right.score || left.originalIndex - right.originalIndex,
      );
      nodesByColumn.set(
        column,
        ranked.map((item) => item.node),
      );
      refreshOrderIndex();
    };

    const columns = Array.from(nodesByColumn.keys()).sort(
      (left, right) => left - right,
    );
    for (let pass = 0; pass < 3; pass += 1) {
      for (const column of columns) reorderColumn(column, 'left');
      for (const column of [...columns].reverse()) reorderColumn(column, 'right');
    }

    return columns.flatMap((column) => nodesByColumn.get(column) ?? []);
  }

  private fallbackLayoutPosition(): DiagramLayoutPosition {
    return {
      column: 0,
      row: 0,
      x: DIAGRAM_ORIGIN_X,
      y: DIAGRAM_ORIGIN_Y,
      width: DIAGRAM_NODE_WIDTH,
      height: DIAGRAM_NODE_HEIGHT,
    };
  }

  private constellationScale(node: GraphNode): number {
    const weight = this.constellationSummary(node)?.weight;
    if (weight === undefined) return 1;
    if (this.collisionConstellation()) {
      return Math.min(
        2.65,
        0.5 + Math.log2(Math.max(1, weight) + 1) * 0.32,
      );
    }
    // Le diamètre minimal doit laisser de la place au nom et au poids, même
    // pour un nœud sans liaison. Les poids élevés restent nettement plus
    // grands pour conserver la hiérarchie visuelle.
    return Math.min(3.4, 1.05 + Math.log2(weight + 1) * 0.4);
  }

  private constellationSize(
    node: GraphNode,
    width: number,
    height: number,
  ): { width: number; height: number } {
    const scale = this.constellationScale(node);
    return {
      width: Math.round(width * scale),
      height: Math.round(height * scale),
    };
  }

  protected nodeUsageLabel(node: GraphNode): string {
    if (node.details?.['externalRouteBundle'] === true) {
      return this.externalRouteBundle.expanded()
        ? 'liens ouverts · cliquer pour replier'
        : 'liens regroupés · cliquer pour développer';
    }
    if (node.details?.['appStart'] === true) {
      return 'initialisé au démarrage de l’application';
    }

    const graph = this.graph();
    if (!graph) return 'usage issu de l’analyse statique';

    const incoming = graph.edges.filter(
      (edge) => edge.to === node.id && edge.kind !== 'contains',
    );
    const outgoing = graph.edges.filter(
      (edge) => edge.from === node.id && edge.kind !== 'contains',
    );
    const parent = graph.nodes.find((candidate) =>
      graph.edges.some(
        (edge) =>
          edge.kind === 'contains' &&
          edge.from === candidate.id &&
          edge.to === node.id,
      ),
    );

    switch (node.kind) {
      case 'route':
        return 'point d’entrée de la navigation';
      case 'route-hook':
        return 'hook attaché à une route';
      case 'component':
        if (incoming.some((edge) => edge.kind === 'loads')) {
          return 'chargé par une route';
        }
        if (incoming.some((edge) => edge.kind === 'renders')) {
          return 'rendu par un composant';
        }
        return incoming.length || outgoing.length
          ? 'utilisé par le graphe'
          : 'non relié dans ce graphe';
      case 'service':
        if (incoming.length) return 'utilisé par une dépendance';
        if (outgoing.length) return 'dépend de services';
        return 'service sans utilisation détectée';
      case 'primitive':
        return parent ? `primitive interne à ${parent.label}` : 'primitive autonome';
      case 'property':
        return parent ? `propriété de ${parent.label}` : 'propriété autonome';
      case 'source':
        return incoming.length || outgoing.length
          ? 'source utilisée par le graphe'
          : 'source sans utilisation détectée';
    }
  }

  private groupHeaderHeight(node: GraphNode): number {
    const usageExtraHeight =
      18 +
      (node.details?.['appStart'] === true ||
      node.details?.['anonymous'] === true
        ? 18
        : 0);
    return (
      GROUP_HEADER_HEIGHT +
      usageExtraHeight +
      this.httpEndpointExtraHeight(node) +
      this.externalRouteUseExtraHeight(node)
    );
  }

  private primitiveGroupHeaderHeight(node: GraphNode): number {
    return (
      PRIMITIVE_GROUP_HEADER_HEIGHT +
      18 +
      this.httpEndpointExtraHeight(node) +
      this.externalRouteUseExtraHeight(node)
    );
  }

  private httpEndpointExtraHeight(node: GraphNode): number {
    const endpointCount = Math.min(this.httpEndpoints(node).length, 3);
    return endpointCount > 0 ? 18 + (endpointCount - 1) * 14 : 0;
  }

  private externalRouteUsesForNode(node: GraphNode): string[] {
    return this.routes()
      .filter((route) => route.label !== this.selectedRouteId())
      .filter((route) => this.reachableFromRoute(route.id).has(node.id))
      .map((route) => route.label);
  }

  private externalRouteUseExtraHeight(node: GraphNode): number {
    return this.externalRouteUsesForNode(node).length > 0 ? 24 : 0;
  }

  private buildConstellationGraph(graph: {
    nodes: GraphNode[];
    edges: GraphEdge[];
  }): {
    nodes: GraphNode[];
    edges: GraphEdge[];
  } {
    const weightByNodeId = new Map<string, number>();
    const touchedByVisibleEdge = new Set<string>();
    const parentByChild = new Map<string, string[]>();
    const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));

    for (const edge of graph.edges) {
      if (edge.kind !== 'contains') {
        touchedByVisibleEdge.add(edge.from);
        touchedByVisibleEdge.add(edge.to);
      } else {
        const parents = parentByChild.get(edge.to) ?? [];
        parents.push(edge.from);
        parentByChild.set(edge.to, parents);
      }
    }

    // Le poids de la constellation est calculé au niveau des blocs visibles.
    // Plusieurs liens vers une primitive ou l'une de ses propriétés sont donc
    // ramenés à une seule liaison entre leurs hôtes (par exemple un composant
    // et ApiService). Les liens internes à un même hôte ne pèsent pas dans la
    // constellation.
    const ownerByNodeId = new Map<string, string>();
    const resolvingOwnerIds = new Set<string>();
    const ownerOf = (nodeId: string): string => {
      const cachedOwnerId = ownerByNodeId.get(nodeId);
      if (cachedOwnerId) return cachedOwnerId;
      if (resolvingOwnerIds.has(nodeId)) return nodeId;

      const node = nodeById.get(nodeId);
      if (!node || node.kind === 'route' || node.kind === 'component' || node.kind === 'service') {
        ownerByNodeId.set(nodeId, nodeId);
        return nodeId;
      }

      resolvingOwnerIds.add(nodeId);
      const ownerId = (parentByChild.get(nodeId) ?? [])
        .slice()
        .sort()
        .map((parentId) => ownerOf(parentId))
        .find((parentId) => parentId !== nodeId) ?? nodeId;
      resolvingOwnerIds.delete(nodeId);
      ownerByNodeId.set(nodeId, ownerId);
      return ownerId;
    };

    const countedLinks = new Set<string>();
    const linkCountByPair = new Map<string, number>();
    for (const edge of graph.edges) {
      if (edge.kind === 'contains') continue;

      const fromOwnerId = ownerOf(edge.from);
      const toOwnerId = ownerOf(edge.to);
      if (fromOwnerId === toOwnerId) continue;

      const linkKey = [fromOwnerId, toOwnerId].sort().join('|');
      linkCountByPair.set(
        linkKey,
        (linkCountByPair.get(linkKey) ?? 0) + 1,
      );
      if (countedLinks.has(linkKey)) continue;
      countedLinks.add(linkKey);
      weightByNodeId.set(
        fromOwnerId,
        (weightByNodeId.get(fromOwnerId) ?? 0) + 1,
      );
      weightByNodeId.set(
        toOwnerId,
        (weightByNodeId.get(toOwnerId) ?? 0) + 1,
      );
    }

    const activeIds = new Set(
      graph.nodes
        .filter(
          (node) =>
            node.kind === 'route' ||
            node.kind === 'component' ||
            node.kind === 'service' ||
            touchedByVisibleEdge.has(node.id),
        )
        .map((node) => node.id),
    );
    let changed = true;
    while (changed) {
      changed = false;
      for (const childId of Array.from(activeIds)) {
        for (const parentId of parentByChild.get(childId) ?? []) {
          if (!activeIds.has(parentId)) {
            activeIds.add(parentId);
            changed = true;
          }
        }
      }
    }

    const visibleNodeIds = new Set(
      graph.nodes
        .filter(
          (node) =>
            activeIds.has(node.id) &&
            node.kind !== 'primitive' &&
            node.kind !== 'property',
        )
        .map((node) => node.id),
    );
    const httpEndpointsByOwner = new Map<string, HttpEndpoint[]>();
    const temporalOperationsByOwner = new Map<string, TemporalOperation[]>();
    for (const node of graph.nodes) {
      const endpoints = this.httpEndpoints(node);
      const ownerId = ownerOf(node.id);
      if (endpoints.length > 0) {
        const ownerEndpoints = httpEndpointsByOwner.get(ownerId) ?? [];
        for (const endpoint of endpoints) {
          const key = `${endpoint.line}|${endpoint.method}|${endpoint.url}`;
          if (
            !ownerEndpoints.some(
              (current) =>
                `${current.line}|${current.method}|${current.url}` === key,
            )
          ) {
            ownerEndpoints.push(endpoint);
          }
        }
        httpEndpointsByOwner.set(ownerId, ownerEndpoints);
      }

      const temporalOperations = this.temporalOperations(node);
      if (temporalOperations.length > 0) {
        const ownerOperations = temporalOperationsByOwner.get(ownerId) ?? [];
        for (const operation of temporalOperations) {
          if (
            !ownerOperations.some(
              (current) =>
                current.operation === operation.operation &&
                current.delay === operation.delay &&
                current.line === operation.line,
            )
          ) {
            ownerOperations.push(operation);
          }
        }
        temporalOperationsByOwner.set(ownerId, ownerOperations);
      }
    }

    const nodes = graph.nodes
      .filter((node) => visibleNodeIds.has(node.id))
      .map((node) => ({
        ...node,
        details: {
          ...node.details,
          ...(httpEndpointsByOwner.has(node.id)
            ? { httpEndpoints: httpEndpointsByOwner.get(node.id) }
            : {}),
          ...(temporalOperationsByOwner.has(node.id)
            ? {
                temporal: true,
                temporalOperations: temporalOperationsByOwner.get(node.id),
              }
            : {}),
          constellation: {
            weight: weightByNodeId.get(node.id) ?? 0,
            level:
              node.kind === 'primitive'
                ? 'primitive'
                : node.kind === 'property'
                  ? 'property'
                  : 'macro',
          } satisfies ConstellationSummary,
        },
      }));
    const activeEdges: GraphEdge[] = [];
    const edgeKeys = new Set<string>();
    for (const edge of graph.edges) {
      if (edge.kind === 'contains') continue;
      const from = ownerOf(edge.from);
      const to = ownerOf(edge.to);
      if (from === to || !visibleNodeIds.has(from) || !visibleNodeIds.has(to)) {
        continue;
      }
      const key = `${from}|${edge.kind}|${to}`;
      if (edgeKeys.has(key)) continue;
      edgeKeys.add(key);
      activeEdges.push({
        ...edge,
        from,
        to,
        details: {
          ...edge.details,
          constellationLinkCount:
            linkCountByPair.get([from, to].sort().join('|')) ?? 1,
        },
      });
    }

    return {
      nodes,
      edges: activeEdges,
    };
  }

  private buildConstellationDetailGraph(
    graph: DependencyGraph,
    focusedNodeId: string,
  ): { nodes: GraphNode[]; edges: GraphEdge[] } {
    const focusedNode = graph.nodes.find((node) => node.id === focusedNodeId);
    if (!focusedNode) return { nodes: [], edges: [] };

    const focusedIds = new Set([focusedNodeId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const edge of graph.edges) {
        if (edge.kind === 'contains' && focusedIds.has(edge.from)) {
          changed = focusedIds.has(edge.to)
            ? changed
            : (focusedIds.add(edge.to), true);
        }
      }
    }

    const scopeIds = new Set(focusedIds);
    for (const edge of graph.edges) {
      if (
        edge.kind !== 'contains' &&
        (scopeIds.has(edge.from) || scopeIds.has(edge.to))
      ) {
        focusedIds.add(edge.from);
        focusedIds.add(edge.to);
      }
    }

    // Conserver les hôtes des dépendances ciblées pour que le retour vers le
    // service ou le composant reste lisible dans la vue détaillée.
    changed = true;
    while (changed) {
      changed = false;
      for (const edge of graph.edges) {
        if (edge.kind === 'contains' && focusedIds.has(edge.to)) {
          changed = focusedIds.has(edge.from)
            ? changed
            : (focusedIds.add(edge.from), true);
        }
      }
    }

    const nodes = graph.nodes
      .filter((node) => focusedIds.has(node.id))
      .map((node) => {
        if (!node.details?.['constellation']) return node;
        const { constellation: _constellation, ...details } = node.details;
        return { ...node, details };
      });

    return {
      nodes,
      edges: graph.edges.filter(
        (edge) => focusedIds.has(edge.from) && focusedIds.has(edge.to),
      ),
    };
  }

  private buildOverviewGraph(graph: {
    nodes: GraphNode[];
    edges: GraphEdge[];
  }): {
    nodes: GraphNode[];
    edges: GraphEdge[];
  } {
    const overviewIdByNodeId = new Map<string, string>();
    const membersByOverviewId = new Map<string, GraphNode[]>();

    for (const node of graph.nodes) {
      const overviewId =
        node.kind === 'route'
          ? node.id
          : `overview:file:${node.filePath ?? node.id}`;
      overviewIdByNodeId.set(node.id, overviewId);
      const members = membersByOverviewId.get(overviewId) ?? [];
      members.push(node);
      membersByOverviewId.set(overviewId, members);
    }

    const nodes: GraphNode[] = [];
    for (const [overviewId, members] of membersByOverviewId) {
      if (
        members.length === 1 &&
        members[0]?.kind === 'route' &&
        members[0].id === overviewId
      ) {
        nodes.push(members[0]);
        continue;
      }

      const counts: Partial<Record<GraphNodeKind, number>> = {};
      for (const member of members) {
        counts[member.kind] = (counts[member.kind] ?? 0) + 1;
      }
      const filePath = members.find((member) => member.filePath)?.filePath;
      const summary: OverviewSummary = {
        memberCount: members.length,
        counts,
        sampleLabels: members
          .filter((member) => member.kind !== 'property')
          .slice(0, 4)
          .map((member) => member.label),
      };

      const httpEndpoints = members
        .flatMap((member) => this.httpEndpoints(member))
        .filter(
          (endpoint, index, endpoints) =>
            endpoints.findIndex(
              (candidate) =>
                candidate.method === endpoint.method &&
                candidate.url === endpoint.url &&
                candidate.line === endpoint.line,
            ) === index,
        );
      const temporalOperations = members
        .flatMap((member) => this.temporalOperations(member))
        .filter(
          (operation, index, operations) =>
            operations.findIndex(
              (candidate) =>
                candidate.operation === operation.operation &&
                candidate.delay === operation.delay &&
                candidate.line === operation.line,
            ) === index,
        );

      nodes.push({
        id: overviewId,
        kind: this.overviewKind(counts),
        label: this.overviewModuleLabel(filePath),
        filePath,
        details: {
          overview: summary,
          ...(httpEndpoints.length > 0
            ? { craftHttpClient: true, httpEndpoints }
            : {}),
          ...(temporalOperations.length > 0
            ? { temporal: true, temporalOperations }
            : {}),
        },
      });
    }

    const originalLabelById = new Map(
      graph.nodes.map((node) => [node.id, node.label]),
    );
    const edgeBuckets = new Map<
      string,
      { from: string; to: string; kind: GraphEdgeKind; edges: GraphEdge[] }
    >();

    for (const edge of graph.edges) {
      if (!OVERVIEW_EDGE_KINDS.has(edge.kind)) continue;
      const from = overviewIdByNodeId.get(edge.from);
      const to = overviewIdByNodeId.get(edge.to);
      if (!from || !to || from === to) continue;

      const key = `${from}|${edge.kind}|${to}`;
      const bucket =
        edgeBuckets.get(key) ??
        ({ from, to, kind: edge.kind, edges: [] } satisfies {
          from: string;
          to: string;
          kind: GraphEdgeKind;
          edges: GraphEdge[];
        });
      bucket.edges.push(edge);
      edgeBuckets.set(key, bucket);
    }

    const edges: GraphEdge[] = Array.from(edgeBuckets.values()).map((bucket) => ({
      from: bucket.from,
      to: bucket.to,
      kind: bucket.kind,
      evidence: bucket.edges.some((edge) => edge.evidence === 'type')
        ? 'type'
        : 'ast',
      details: {
        count: bucket.edges.length,
        examples: bucket.edges.slice(0, 5).map((edge) => ({
          from: originalLabelById.get(edge.from) ?? edge.from,
          to: originalLabelById.get(edge.to) ?? edge.to,
        })),
      },
    }));

    return { nodes, edges };
  }

  private overviewKind(
    counts: Partial<Record<GraphNodeKind, number>>,
  ): GraphNodeKind {
    if ((counts['component'] ?? 0) > 0) return 'component';
    if ((counts['service'] ?? 0) > 0) return 'service';
    if ((counts['primitive'] ?? 0) > 0) return 'primitive';
    if ((counts['route-hook'] ?? 0) > 0) return 'route-hook';
    return 'source';
  }

  private overviewModuleLabel(filePath?: string): string {
    const path = this.displayPath(filePath);
    const parts = path.split('/');
    return parts.length > 3 ? `…/${parts.slice(-3).join('/')}` : path;
  }

  private buildTechnologyFocusGraph(
    graph: { nodes: GraphNode[]; edges: GraphEdge[] },
    technology: FocusTechnology,
    entityKind: FocusEntityKind,
    depth: FocusDepth,
  ): { nodes: GraphNode[]; edges: GraphEdge[] } {
    if (technology === 'all') return graph;

    const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
    const parentByChild = new Map<string, string[]>();
    const adjacency = new Map<string, Set<string>>();
    const connect = (from: string, to: string): void => {
      const neighbors = adjacency.get(from) ?? new Set<string>();
      neighbors.add(to);
      adjacency.set(from, neighbors);
    };

    for (const edge of graph.edges) {
      connect(edge.from, edge.to);
      connect(edge.to, edge.from);
      if (edge.kind === 'contains') {
        const parents = parentByChild.get(edge.to) ?? [];
        parents.push(edge.from);
        parentByChild.set(edge.to, parents);
      }
    }

    const macroKinds = new Set<GraphNodeKind>([
      'route',
      'component',
      'service',
    ]);
    const ownerOf = (nodeId: string): string => {
      let current = nodeId;
      const visited = new Set<string>();
      while (!visited.has(current)) {
        visited.add(current);
        const node = nodeById.get(current);
        if (!node || macroKinds.has(node.kind)) return current;
        const parent = parentByChild.get(current)?.[0];
        if (!parent) return current;
        current = parent;
      }
      return current;
    };

    const matchesTechnology = (node: GraphNode): boolean => {
      if (technology === 'http') {
        return (
          node.details?.['craftHttpClient'] === true ||
          this.httpEndpoints(node).length > 0
        );
      }
      return (
        node.details?.['temporal'] === true ||
        this.temporalOperations(node).length > 0
      );
    };

    const directOwners = new Set(
      graph.nodes.filter(matchesTechnology).map((node) => ownerOf(node.id)),
    );
    const seeds = new Set<string>();
    if (entityKind === 'all') {
      directOwners.forEach((id) => seeds.add(id));
    } else if (entityKind === 'route') {
      for (const route of graph.nodes.filter((node) => node.kind === 'route')) {
        if (
          directOwners.has(route.id) ||
          [...directOwners].some((ownerId) =>
            this.reachableFromRoute(route.id).has(ownerId),
          )
        ) {
          seeds.add(route.id);
        }
      }
    } else {
      for (const ownerId of directOwners) {
        if (nodeById.get(ownerId)?.kind === entityKind) seeds.add(ownerId);
      }
    }

    if (seeds.size === 0) return { nodes: [], edges: [] };
    if (depth === 'target') {
      return {
        nodes: graph.nodes.filter((node) => seeds.has(node.id)),
        edges: [],
      };
    }

    const maxDistance = depth === 'level-1' ? 1 : depth === 'level-2' ? 2 : 4;
    const distances = new Map<string, number>();
    const queue: Array<readonly [string, number]> = [...seeds].map(
      (id) => [id, 0] as const,
    );
    for (const seed of seeds) distances.set(seed, 0);
    while (queue.length > 0) {
      const currentEntry = queue.shift();
      if (!currentEntry) break;
      const [current, currentDistance] = currentEntry;
      if (currentDistance >= maxDistance) continue;
      for (const neighbor of adjacency.get(current) ?? []) {
        if (distances.has(neighbor)) continue;
        distances.set(neighbor, currentDistance + 1);
        queue.push([neighbor, currentDistance + 1]);
      }
    }

    const includedIds = new Set<string>();
    for (const node of graph.nodes) {
      const distance = distances.get(node.id);
      if (distance === undefined) continue;
      if (depth !== 'components' || macroKinds.has(node.kind) || distance <= 1) {
        includedIds.add(node.id);
      }
    }
    for (const seed of seeds) includedIds.add(seed);

    return {
      nodes: graph.nodes.filter((node) => includedIds.has(node.id)),
      edges: graph.edges.filter(
        (edge) => includedIds.has(edge.from) && includedIds.has(edge.to),
      ),
    };
  }

  private buildVisibleGraph(
    graph: DependencyGraph | null,
    routeLabel: string,
    all: boolean,
    technology: FocusTechnology = 'all',
    entityKind: FocusEntityKind = 'all',
    depth: FocusDepth = 'level-1',
  ): { nodes: GraphNode[]; edges: GraphEdge[] } {
    if (!graph) return { nodes: [], edges: [] };
    const filteredGraph = this.hideUnusedInfrastructureNodes(graph);
    const focusedNodeId = this.constellationFocus.focusedNodeId();
    if (focusedNodeId) {
      return this.buildConstellationDetailGraph(graph, focusedNodeId);
    }
    if (this.constellation()) {
      return this.buildConstellationGraph(
        this.buildTechnologyFocusGraph(
          filteredGraph,
          technology,
          entityKind,
          depth,
        ),
      );
    }
    if (this.overview()) {
      return this.buildOverviewGraph(
        this.buildTechnologyFocusGraph(
          filteredGraph,
          technology,
          entityKind,
          depth,
        ),
      );
    }
    if (all) {
      return this.buildTechnologyFocusGraph(
        filteredGraph,
        technology,
        entityKind,
        depth,
      );
    }

    const route = filteredGraph.nodes.find(
      (node) => node.kind === 'route' && node.label === routeLabel,
    );
    if (!route) return { nodes: [], edges: [] };

    const ids = this.reachableFromRoute(route.id);
    const nodes = filteredGraph.nodes.filter((node) => ids.has(node.id));
    const edges = filteredGraph.edges.filter(
      (edge) => ids.has(edge.from) && ids.has(edge.to),
    );
    return this.buildTechnologyFocusGraph(
      this.addExternalRouteGhosts(filteredGraph, route, nodes, edges),
      technology,
      entityKind,
      depth,
    );
  }

  private addExternalRouteGhosts(
    graph: DependencyGraph,
    selectedRoute: GraphNode,
    nodes: GraphNode[],
    edges: GraphEdge[],
  ): { nodes: GraphNode[]; edges: GraphEdge[] } {
    const visibleHostIds = new Set(
      nodes
        .filter((node) => node.kind === 'component' || node.kind === 'service')
        .map((node) => node.id),
    );
    if (visibleHostIds.size === 0) return { nodes, edges };

    const resultNodes = [...nodes];
    const resultEdges = [...edges];
    const externalRoutes = graph.nodes.filter(
      (node) => node.kind === 'route' && node.id !== selectedRoute.id,
    );
    const sharedRoutes = externalRoutes
      .map((externalRoute) => ({
        externalRoute,
        sharedHostIds: [...visibleHostIds].filter((nodeId) =>
          this.reachableFromRoute(externalRoute.id).has(nodeId),
        ),
      }))
      .filter(({ sharedHostIds }) => sharedHostIds.length > 0);

    if (sharedRoutes.length === 0) return { nodes, edges };

    if (!this.externalRouteBundle.expanded()) {
      const sharedHostIds = new Set(
        sharedRoutes.flatMap(({ sharedHostIds: hostIds }) => hostIds),
      );
      const bundleId = 'external-route-bundle:' + selectedRoute.id;
      resultNodes.push({
        id: bundleId,
        kind: 'route',
        label: 'Routes utilisées ailleurs',
        details: {
          externalRouteGhost: true,
          externalRouteBundle: true,
          externalRouteLabels: sharedRoutes.map(
            ({ externalRoute }) => externalRoute.label,
          ),
        },
      });
      for (const hostId of sharedHostIds) {
        resultEdges.push({
          from: bundleId,
          to: hostId,
          kind: 'loads',
          evidence: 'ast',
          details: {
            externalRouteGhost: true,
            externalRouteBundle: true,
            note: 'routes externes regroupées',
          },
        });
      }
      return { nodes: resultNodes, edges: resultEdges };
    }

    const selectedNodeIds = new Set(nodes.map((node) => node.id));
    const resultNodeIds = new Set(resultNodes.map((node) => node.id));
    const edgeKeys = new Set(
      resultEdges.map((edge) => `${edge.from}|${edge.kind}|${edge.to}`),
    );
    const addEdge = (edge: GraphEdge): void => {
      const key = `${edge.from}|${edge.kind}|${edge.to}`;
      if (edgeKeys.has(key)) return;
      edgeKeys.add(key);
      resultEdges.push(edge);
    };

    for (const { externalRoute, sharedHostIds } of sharedRoutes) {
      const reachable = this.reachableFromRoute(externalRoute.id);
      const contentNodeIds = new Set(
        graph.nodes
          .filter(
            (node) =>
              reachable.has(node.id) &&
              !selectedNodeIds.has(node.id) &&
              node.id !== externalRoute.id &&
              node.kind !== 'source',
          )
          .map((node) => node.id),
      );
      const contentExpanded = this.externalRouteContent.isExpanded(
        externalRoute.label,
      );

      resultNodes.push({
        ...externalRoute,
        details: {
          ...(externalRoute.details ?? {}),
          externalRouteGhost: true,
          externalRouteLabel: externalRoute.label,
          externalRouteContentCount: contentNodeIds.size,
        },
      });
      resultNodeIds.add(externalRoute.id);

      for (const hostId of sharedHostIds) {
        addEdge({
          from: externalRoute.id,
          to: hostId,
          kind: 'loads',
          evidence: 'ast',
          details: {
            externalRouteGhost: true,
            note: 'route externe utilisant ce bloc',
          },
        });
      }

      if (!contentExpanded || contentNodeIds.size === 0) continue;

      for (const contentNode of graph.nodes) {
        if (!contentNodeIds.has(contentNode.id) || resultNodeIds.has(contentNode.id)) {
          continue;
        }
        resultNodes.push(contentNode);
        resultNodeIds.add(contentNode.id);
      }

      const visibleContentIds = new Set([
        externalRoute.id,
        ...contentNodeIds,
        ...sharedHostIds,
      ]);
      for (const edge of graph.edges) {
        if (visibleContentIds.has(edge.from) && visibleContentIds.has(edge.to)) {
          addEdge(edge);
        }
      }
    }

    return { nodes: resultNodes, edges: resultEdges };
  }

  private hideUnusedInfrastructureNodes(graph: DependencyGraph): DependencyGraph {
    const parentByChild = new Map<string, string[]>();
    for (const edge of graph.edges) {
      if (edge.kind !== 'contains') continue;
      const parents = parentByChild.get(edge.to) ?? [];
      parents.push(edge.from);
      parentByChild.set(edge.to, parents);
    }

    const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
    const connectedNodeIds = new Set<string>();
    const markServiceAncestors = (nodeId: string): void => {
      const pending = [nodeId];
      const visited = new Set<string>();
      while (pending.length > 0) {
        const currentId = pending.pop();
        if (!currentId || visited.has(currentId)) continue;
        visited.add(currentId);
        const current = nodeById.get(currentId);
        if (current?.kind === 'service') connectedNodeIds.add(current.id);
        pending.push(...(parentByChild.get(currentId) ?? []));
      }
    };

    for (const edge of graph.edges) {
      if (edge.kind === 'contains') continue;
      connectedNodeIds.add(edge.from);
      connectedNodeIds.add(edge.to);
      markServiceAncestors(edge.from);
      markServiceAncestors(edge.to);
    }

    const hiddenInfrastructureIds = new Set(
      graph.nodes
        .filter(
          (node) =>
            ((node.kind === 'service' && node.details?.['appStart'] !== true) ||
              node.kind === 'source') &&
            !connectedNodeIds.has(node.id),
        )
        .map((node) => node.id),
    );
    if (hiddenInfrastructureIds.size === 0) return graph;

    const hiddenNodeIds = new Set(hiddenInfrastructureIds);
    for (const node of graph.nodes) {
      const pending = [...(parentByChild.get(node.id) ?? [])];
      const visited = new Set<string>();
      while (pending.length > 0) {
        const parentId = pending.pop();
        if (!parentId || visited.has(parentId)) continue;
        visited.add(parentId);
        if (hiddenInfrastructureIds.has(parentId)) {
          hiddenNodeIds.add(node.id);
          break;
        }
        pending.push(...(parentByChild.get(parentId) ?? []));
      }
    }

    return {
      ...graph,
      nodes: graph.nodes.filter((node) => !hiddenNodeIds.has(node.id)),
      edges: graph.edges.filter(
        (edge) =>
          !hiddenNodeIds.has(edge.from) && !hiddenNodeIds.has(edge.to),
      ),
    };
  }

  private reachableFromRoute(routeId: string): Set<string> {
    const graph = this.graph();
    const ids = new Set([routeId]);
    if (!graph) return ids;

    let changed = true;
    while (changed) {
      changed = false;
      for (const edge of graph.edges) {
        if (
          ids.has(edge.from) &&
          EDGE_KINDS.includes(edge.kind) &&
          !ids.has(edge.to)
        ) {
          ids.add(edge.to);
          changed = true;
        }
      }
    }
    return ids;
  }
}
