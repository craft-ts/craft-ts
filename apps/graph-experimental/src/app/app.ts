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
} from '@angular/core';
import { JsonPipe } from '@angular/common';
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
  filePath?: string;
  line?: number;
  externalRouteUses: string[];
  memberCount?: number;
  sourceNodeId?: string;
  groupRole?: 'host' | 'primitive';
  collapsed?: boolean;
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

type DiagramProjection = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  collapsedGroupIds: ReadonlySet<string>;
  collapsedMemberCountByGroupId: ReadonlyMap<string, number>;
};

type GraphSearchResult = {
  node: GraphNode;
  displayLabel: string;
  sourceLabel: string;
};

const DIAGRAM_NODE_WIDTH = 260;
const DIAGRAM_NODE_HEIGHT = 92;
const GROUP_WIDTH = 330;
const GROUP_HEADER_HEIGHT = 54;
const GROUP_PADDING = 16;
const GROUP_CHILD_GAP = 12;
const PRIMITIVE_GROUP_HEADER_HEIGHT = 46;
const COLUMN_WIDTH = 380;
const ROW_GAP = 32;
const DIAGRAM_ORIGIN_X = 40;
const DIAGRAM_ORIGIN_Y = 40;

@Injectable({ providedIn: 'root' })
class GraphHoverState {
  private edges: GraphEdge[] = [];
  protected readonly hoveredNodeId = signal<string | null>(null);
  private readonly activeNodeIds = signal<ReadonlySet<string>>(new Set());
  private readonly activeEdgeKeys = signal<ReadonlySet<string>>(new Set());

  setEdges(edges: GraphEdge[]): void {
    this.edges = edges;
    this.clear();
  }

  hoverNode(nodeId: string): void {
    const activeNodes = new Set([nodeId]);
    const activeEdgeKeys = new Set<string>();

    for (const edge of this.edges) {
      if (edge.from !== nodeId && edge.to !== nodeId) continue;
      activeNodes.add(edge.from);
      activeNodes.add(edge.to);
      activeEdgeKeys.add(this.edgeKey(edge));
    }

    this.hoveredNodeId.set(nodeId);
    this.activeNodeIds.set(activeNodes);
    this.activeEdgeKeys.set(activeEdgeKeys);
  }

  clearNode(nodeId: string): void {
    if (this.hoveredNodeId() === nodeId) this.clear();
  }

  isNodeDimmed(nodeId: string): boolean {
    return (
      this.hoveredNodeId() !== null && !this.activeNodeIds().has(nodeId)
    );
  }

  isEdgeDimmed(edgeId: string): boolean {
    return (
      this.hoveredNodeId() !== null && !this.activeEdgeKeys().has(edgeId)
    );
  }

  private clear(): void {
    this.hoveredNodeId.set(null);
    this.activeNodeIds.set(new Set());
    this.activeEdgeKeys.set(new Set());
  }

  private edgeKey(edge: GraphEdge): string {
    return `${edge.from}|${edge.kind}|${edge.to}`;
  }
}

@Injectable({ providedIn: 'root' })
class GraphCollapseState {
  readonly collapsedIds = signal<ReadonlySet<string>>(new Set());

  isCollapsed(nodeId: string): boolean {
    return this.collapsedIds().has(nodeId);
  }

  toggle(nodeId: string): void {
    const next = new Set(this.collapsedIds());
    if (next.has(nodeId)) next.delete(nodeId);
    else next.add(nodeId);
    this.collapsedIds.set(next);
  }

  setCollapsed(nodeIds: Iterable<string>): void {
    this.collapsedIds.set(new Set(nodeIds));
  }

  expandAll(): void {
    this.collapsedIds.set(new Set());
  }
}

const EDGE_KINDS: GraphEdgeKind[] = [
  'loads',
  'renders',
  'contains',
  'depends-on',
  'uses-property',
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
      [class.is-dimmed]="hoverState.isNodeDimmed(node().id)"
      (mouseenter)="hoverState.hoverNode(node().id)"
      (mouseleave)="hoverState.clearNode(node().id)"
    >
      <ng-diagram-port id="in" type="both" side="left" />
      <ng-diagram-port id="top" type="both" side="top" />
      <div class="node-kicker">{{ node().data.kind }}</div>
      <div class="node-label">{{ node().data.label }}</div>
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
        width: 260px;
        height: 92px;
      }

      .graph-node {
        position: relative;
        box-sizing: border-box;
        width: 260px;
        height: 92px;
        overflow: hidden;
        border: 2px solid #cbd5e1;
        border-radius: 10px;
        padding: 11px 15px;
        background: #fff;
        box-shadow: 0 5px 16px #0f172a22;
      }

      .graph-node.node-route { border-color: #64748b; background: #f8fafc; }
      .graph-node.node-component { border-color: #8b5cf6; background: #faf5ff; }
      .graph-node.node-service { border-color: #14b8a6; background: #f0fdfa; }
      .graph-node.node-property { border-color: #60a5fa; background: #eff6ff; }
      .graph-node.node-primitive { border-color: #f59e0b; background: #fffbeb; }
      .graph-node.node-source { border-color: #06b6d4; background: #ecfeff; }

      .graph-node { transition: opacity .15s ease, filter .15s ease; }
      .graph-node.is-dimmed { opacity: .16; filter: grayscale(.8); }

      .node-kicker,
      .node-source {
        color: #64748b;
        font-size: 10px;
        font-weight: 800;
        letter-spacing: .08em;
        text-transform: uppercase;
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

      .node-source { margin-top: 7px; font-size: 9px; }

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
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class GraphNodeTemplate implements NgDiagramNodeTemplate<DiagramNodeData> {
  readonly node = input.required<DiagramGraphNode>();
  protected readonly hoverState = inject(GraphHoverState);
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
            <button
              type="button"
              class="collapse-button"
              [attr.aria-label]="isCollapsed ? 'Ouvrir le bloc' : 'Replier le bloc'"
              (pointerdown)="stopEvent($event)"
              (click)="toggle($event)"
            >
              {{ isCollapsed ? '▸' : '▾' }}
            </button>
          </div>
          <strong>{{ node().data.label }}</strong>
          <span class="group-count">
            @if (isCollapsed) {
              replié · {{ node().data.memberCount ?? 0 }} éléments masqués
            } @else {
              {{ node().data.memberCount ?? 0 }} éléments internes
            }
          </span>
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
        transition: opacity .15s ease, filter .15s ease;
      }

      .graph-group.is-dimmed { opacity: .16; filter: grayscale(.8); }

      .group-component {
        border-color: #8b5cf6;
        background: #faf5ffeb;
      }

      .group-service {
        border-color: #14b8a6;
        background: #f0fdfaec;
      }

      .group-primitive {
        border-color: #f59e0b;
        border-radius: 11px;
        background: #fffbebee;
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
        letter-spacing: .08em;
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

      .graph-group.ng-diagram-node-selected,
      .graph-group.ng-diagram-group-highlight {
        box-shadow: 0 0 0 3px #38bdf855, 0 8px 22px #0f172a18;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class GraphGroupTemplate implements NgDiagramGroupNodeTemplate<DiagramNodeData> {
  readonly node = input.required<DiagramGraphGroup>();
  protected readonly hoverState = inject(GraphHoverState);
  protected readonly collapseState = inject(GraphCollapseState);

  protected get isCollapsed(): boolean {
    return this.collapseState.isCollapsed(this.node().id);
  }

  protected stopEvent(event: Event): void {
    event.stopPropagation();
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
        [class.is-dimmed]="hoverState.isNodeDimmed(node().data.sourceNodeId ?? node().id)"
        ngDiagramNodeSelected
        ngDiagramGroupHighlighted
        [node]="node()"
        (mouseenter)="hoverState.hoverNode(node().data.sourceNodeId ?? node().id)"
        (mouseleave)="hoverState.clearNode(node().data.sourceNodeId ?? node().id)"
      >
        <ng-diagram-port id="in" type="both" side="left" />
        <ng-diagram-port id="top" type="both" side="top" />
        <span class="template-kicker">component</span>
        <strong>template</strong>
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
        transition: opacity .15s ease, filter .15s ease;
      }

      .graph-template-group.is-dimmed {
        opacity: .16;
        filter: grayscale(.8);
      }

      .template-kicker {
        color: #8b5cf6;
        font-size: 9px;
        font-weight: 800;
        letter-spacing: .1em;
        text-transform: uppercase;
      }

      strong {
        font-size: 13px;
        letter-spacing: .02em;
      }

      .graph-template-group.ng-diagram-node-selected,
      .graph-template-group.ng-diagram-group-highlight {
        box-shadow: 0 0 0 3px #8b5cf655, inset 0 0 0 1px #ffffffaa;
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
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class GraphEdgeTemplate implements NgDiagramEdgeTemplate<DiagramEdgeData> {
  readonly edge = input.required<DiagramGraphEdge>();
  private readonly hoverState = inject(GraphHoverState);

  get strokeOpacity(): number {
    return this.hoverState.isEdgeDimmed(this.edge().id) ? 0.08 : 0.82;
  }

  get stroke(): string {
    return {
      loads: '#64748b',
      renders: '#8b5cf6',
      contains: '#94a3b8',
      'depends-on': '#00a884',
      'uses-property': '#ae70c7',
      reads: '#38bdf8',
      writes: '#f97316',
      subscribes: '#06b6d4',
      triggers: '#eab308',
    }[this.edge().data.kind];
  }

  get strokeWidth(): number {
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
  protected readonly graph = signal<DependencyGraph | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly selectedRouteId = signal('');
  protected readonly showAll = signal(false);
  protected readonly selectedNodeId = signal<string | null>(null);
  protected readonly selectedEdgeKey = signal<string | null>(null);
  private readonly injector = inject(Injector);
  private readonly viewportService = inject(NgDiagramViewportService);
  private readonly hoverState = inject(GraphHoverState);
  private readonly collapseState = inject(GraphCollapseState);
  private dragStartPositions = new Map<string, { x: number; y: number }>();
  private readonly collapseRebuildEffect = effect(() => {
    this.collapseState.collapsedIds();
    if (!this.loading() && this.graph()) {
      queueMicrotask(() => this.rebuildModel());
    }
  });
  protected readonly model = signal<ModelAdapter>(
    this.createModel([], []),
  );

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
    this.buildVisibleGraph(this.graph(), this.selectedRouteId(), this.showAll()),
  );

  protected readonly searchOpen = signal(false);
  protected readonly searchQuery = signal('');
  protected readonly searchActiveIndex = signal(0);

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
      .sort((left, right) =>
        `${left.label}|${left.filePath}|${left.line}`.localeCompare(
          `${right.label}|${right.filePath}|${right.line}`,
        ),
      )
      .map((node) => ({
        node,
        displayLabel: this.nodeDisplayLabel(node),
        sourceLabel: `${this.displayPath(node.filePath)}${
          node.line ? ` · L${node.line}` : ''
        }`,
      }));
  });

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
    return nodeId
      ? (this.graph()?.nodes.find((node) => node.id === nodeId) ?? null)
      : null;
  });

  protected readonly selectedEdge = computed(() => {
    const edgeKey = this.selectedEdgeKey();
    if (!edgeKey) return null;
    const [from, kind, to] = edgeKey.split('|');
    return (
      this.graph()?.edges.find(
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
    this.searchOpen.set(true);
    this.searchActiveIndex.set(0);
    queueMicrotask(() => {
      document.querySelector<HTMLInputElement>('[data-search-input]')?.focus();
    });
  }

  protected closeSearch(): void {
    this.searchOpen.set(false);
  }

  protected updateSearchQuery(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
    this.searchActiveIndex.set(0);
  }

  protected onSearchKeydown(event: KeyboardEvent): void {
    const results = this.searchResults();
    if (event.key === 'ArrowDown' && results.length > 0) {
      event.preventDefault();
      this.searchActiveIndex.update((index) =>
        Math.min(index + 1, results.length - 1),
      );
    } else if (event.key === 'ArrowUp' && results.length > 0) {
      event.preventDefault();
      this.searchActiveIndex.update((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && results.length > 0) {
      event.preventDefault();
      this.selectSearchResult(results[this.searchActiveIndex()] ?? results[0]);
    }
  }

  protected selectSearchResult(result: GraphSearchResult): void {
    this.expandCollapsedAncestors(result.node.id);
    this.selectedNodeId.set(result.node.id);
    this.selectedEdgeKey.set(null);
    this.closeSearch();
    setTimeout(() => this.focusNode(result.node.id), 180);
  }

  async ngOnInit(): Promise<void> {
    try {
      const response = await fetch('craft-dependency-graph.json');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const graph = (await response.json()) as DependencyGraph;
      this.graph.set(graph);
      this.selectedRouteId.set(
        graph.nodes.find((node) => node.label === 'demo:craft/granular-mutation')
          ?.label ?? graph.nodes.find((node) => node.kind === 'route')?.label ?? '',
      );
      this.rebuildModel();
    } catch (loadError) {
      this.error.set(
        loadError instanceof Error
          ? loadError.message
          : 'Impossible de charger le graphe.',
      );
    } finally {
      this.loading.set(false);
    }
  }

  protected selectRoute(label: string): void {
    this.showAll.set(false);
    this.selectedRouteId.set(label);
    this.selectedNodeId.set(null);
    this.selectedEdgeKey.set(null);
    this.rebuildModel();
  }

  protected toggleAll(): void {
    this.showAll.update((value) => !value);
    this.selectedNodeId.set(null);
    this.selectedEdgeKey.set(null);
    this.rebuildModel();
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

  protected onSelectionChanged(event: SelectionChangedEvent): void {
    const node = event.selectedNodes[0];
    const edge = event.selectedEdges[0];
    const nodeData = node?.data as { sourceNodeId?: string } | undefined;
    this.selectedNodeId.set(nodeData?.sourceNodeId ?? node?.id ?? null);
    this.selectedEdgeKey.set(edge?.id ?? null);
  }

  protected onNodeDragStarted(_event: NodeDragStartedEvent): void {
    const startPositions = new Map<string, { x: number; y: number }>();
    for (const node of this.model().getNodes()) {
      if (node.position) startPositions.set(node.id, node.position);
    }
    this.dragStartPositions = startPositions;
  }

  protected onNodeDragEnded(_event: NodeDragEndedEvent): void {
    this.dragStartPositions.clear();
  }

  protected onSelectionMoved(event: SelectionMovedEvent): void {
    const projected = this.getDiagramProjection();
    const baseLayout = this.createLayout(
      projected.nodes,
      projected.edges,
      projected.collapsedGroupIds,
      projected.collapsedMemberCountByGroupId,
    );
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

    if (parentDeltas.length > 0) {
      const nodesById = new Map(currentNodes.map((node) => [node.id, node]));
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

    this.model().updateEdges(
      projected.edges.map((edge) =>
        this.toDiagramEdge(edge, {
          ...baseLayout,
          layout: movedLayout,
        }),
      ),
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

  protected onDiagramInit(): void {
    this.scheduleZoomToFit();
  }

  protected clearSelection(): void {
    this.selectedNodeId.set(null);
    this.selectedEdgeKey.set(null);
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

  private primitiveUsage(node: GraphNode): string | undefined {
    return node.kind === 'primitive' && typeof node.details?.['usage'] === 'string'
      ? node.details['usage']
      : undefined;
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
        pending.push(...(completeLayout.childrenByPrimitive.get(child.id) ?? []));
      }

      hiddenByGroup.forEach((nodeId) => hiddenNodeIds.add(nodeId));
      collapsedMemberCountByGroupId.set(groupId, hiddenByGroup.size);
    }

    return {
      nodes: graph.nodes.filter((node) => !hiddenNodeIds.has(node.id)),
      edges: graph.edges.filter(
        (edge) =>
          !hiddenNodeIds.has(edge.from) && !hiddenNodeIds.has(edge.to),
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
    this.hoverState.setEdges(projected.edges);
    const templateNodes = Array.from(layout.templateIdByComponent.entries())
      .map(([componentId, templateId], index) => {
        const component = projected.nodes.find((node) => node.id === componentId);
        return component && !layout.collapsedGroupIds.has(component.id)
          ? this.toTemplateGroupNode(component, templateId, index, layout)
          : null;
      })
      .filter((node): node is DiagramGraphGroup => node !== null);
    this.model.set(
      this.createModel(
        [
          ...projected.nodes.map((node, index) =>
            this.toDiagramNode(node, index, layout),
          ),
          ...templateNodes,
        ],
        projected.edges.map((edge) => this.toDiagramEdge(edge, layout)),
      ),
    );
    this.scheduleZoomToFit();
  }

  private scheduleZoomToFit(): void {
    setTimeout(() => {
      this.viewportService.setViewport(0, 0, 1);
      document.querySelector<HTMLElement>('.diagram-canvas')?.scrollTo(0, 0);
    }, 120);
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
      node.kind === 'primitive' && (Boolean(primitiveMembers?.length) || isCollapsed);
    const externalRouteUses = this.routes()
      .filter((route) => route.label !== this.selectedRouteId())
      .filter((route) => this.reachableFromRoute(route.id).has(node.id))
      .map((route) => route.label);

    const data: DiagramNodeData = {
      label: layoutResult.displayLabelByNodeId.get(node.id) ?? node.label,
      kind: node.kind,
      filePath: node.filePath,
      line: node.line,
      externalRouteUses,
      memberCount: isCollapsed
        ? layoutResult.collapsedMemberCountByGroupId.get(node.id) ?? 0
        : primitiveMembers?.length ?? members?.length,
      groupRole: isPrimitiveGroup || node.kind === 'primitive' ? 'primitive' : 'host',
      collapsed: isCollapsed,
    };

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
      throw new Error(`Position introuvable pour le template de ${component.id}`);
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
        sourceNodeId: component.id,
        externalRouteUses: [],
      },
      zOrder: -500 + index,
    };
  }

  private toDiagramEdge(
    edge: GraphEdge,
    layoutResult: DiagramLayoutResult,
  ): DiagramGraphEdge {
    const sourceId =
      edge.kind === 'renders'
        ? layoutResult.templateIdByComponent.get(edge.from) ?? edge.from
        : edge.from;
    const source =
      layoutResult.layout.get(sourceId) ?? this.fallbackLayoutPosition();
    const target =
      layoutResult.layout.get(edge.to) ?? this.fallbackLayoutPosition();
    let sourcePort = 'out';
    let targetPort = 'in';

    if (source.column > target.column) {
      sourcePort = 'in';
      targetPort = 'out';
    } else if (source.column === target.column) {
      sourcePort = source.row <= target.row ? 'bottom' : 'top';
      targetPort = source.row <= target.row ? 'top' : 'bottom';
    }

    const crossContainerSameColumn =
      source.column === target.column &&
      source.containerId !== target.containerId &&
      (source.containerId !== undefined || target.containerId !== undefined);
    const crossContainer =
      source.containerId !== target.containerId &&
      (source.containerId !== undefined || target.containerId !== undefined);
    const sameContainer =
      source.containerId !== undefined &&
      source.containerId === target.containerId;
    let manualPoints: Array<{ x: number; y: number }> | undefined;

    if (sameContainer) {
      sourcePort = 'out';
      targetPort = 'in';
      manualPoints = this.createInternalContainerPoints(
        source,
        target,
        layoutResult.layout.get(source.containerId ?? ''),
      );
    } else if (crossContainerSameColumn) {
      sourcePort = 'out';
      targetPort = 'out';
      manualPoints = this.createSameColumnBypassPoints(source, target);
    } else if (crossContainer || Math.abs(source.column - target.column) > 1) {
      manualPoints = this.createBypassPoints(
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
      sourcePort,
      targetPort,
      routing: manualPoints ? 'polyline' : 'orthogonal',
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

  private createBypassPoints(
    source: DiagramLayoutPosition,
    target: DiagramLayoutPosition,
    sourcePort: string,
    targetPort: string,
  ): Array<{ x: number; y: number }> {
    const sourcePoint = this.portPoint(source, sourcePort);
    const targetPoint = this.portPoint(target, targetPort);
    const direction = target.column > source.column ? 1 : -1;
    const laneY = 18;

    return [
      sourcePoint,
      { x: sourcePoint.x + direction * 36, y: laneY },
      { x: targetPoint.x - direction * 36, y: laneY },
      targetPoint,
    ];
  }

  private createSameColumnBypassPoints(
    source: DiagramLayoutPosition,
    target: DiagramLayoutPosition,
  ): Array<{ x: number; y: number }> {
    const sourcePoint = this.portPoint(source, 'out');
    const targetPoint = this.portPoint(target, 'out');
    const laneX = Math.max(
      source.x + source.width,
      target.x + target.width,
    ) + 56;

    return [
      sourcePoint,
      { x: laneX, y: sourcePoint.y },
      { x: laneX, y: targetPoint.y },
      targetPoint,
    ];
  }

  private portPoint(
    position: DiagramLayoutPosition,
    port: string,
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

  private createLayout(
    nodes: GraphNode[],
    edges: GraphEdge[],
    collapsedGroupIds: ReadonlySet<string> = new Set(),
    collapsedMemberCountByGroupId: ReadonlyMap<string, number> = new Map(),
  ): DiagramLayoutResult {
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
      const contextualLabel = usage
        ? `${node.label} · ${usage}`
        : node.label;
      labelCounts.set(
        contextualLabel,
        (labelCounts.get(contextualLabel) ?? 0) + 1,
      );
    }
    const displayLabelByNodeId = new Map(
      nodes.map((node) => {
        const usage =
          node.kind === 'primitive' && typeof node.details?.['usage'] === 'string'
            ? node.details['usage']
            : undefined;
        const contextualLabel = usage
          ? `${node.label} · ${usage}`
          : node.label;
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
        if (!children.some((item) => item.id === child.id)) children.push(child);
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
        }
        pending.push(...(containsChildrenByParent.get(child.id) ?? []));
      }

      if (members.length > 0) childrenByPrimitive.set(primitive.id, members);
    }

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
          child.kind === 'primitive' ||
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

    const childIds = new Set(
      [
        ...Array.from(childrenByHost.values()).flatMap((children) =>
          children.map((child) => child.id),
        ),
        ...Array.from(childrenByPrimitive.values()).flatMap((children) =>
          children.map((child) => child.id),
        ),
      ],
    );
    const topLevelNodes = nodes.filter((node) => !childIds.has(node.id));
    const rowByColumn = new Map<number, number>();
    const cursorYByColumn = new Map<number, number>();
    let maxColumn = 0;
    let maxBottom = DIAGRAM_ORIGIN_Y + DIAGRAM_NODE_HEIGHT;

    for (const node of topLevelNodes) {
      const column = NODE_COLUMNS[node.kind];
      const row = rowByColumn.get(column) ?? 0;
      const members = childrenByHost.get(node.id);
      const isCollapsed = collapsedGroupIds.has(node.id);
      const hasTemplate = node.kind === 'component' && !isCollapsed;
      const hasVisualChildren =
        node.kind === 'component' ||
        node.kind === 'service' ||
        Boolean(members?.length) ||
        isCollapsed;
      const width = hasVisualChildren ? GROUP_WIDTH : DIAGRAM_NODE_WIDTH;
      const templateHeight = 58;
      const memberSizes =
        members?.map((member) => {
          const primitiveMembers = childrenByPrimitive.get(member.id);
          return primitiveMembers?.length
            ? {
                width: GROUP_WIDTH - GROUP_PADDING * 2,
                height:
                  PRIMITIVE_GROUP_HEADER_HEIGHT +
                  GROUP_PADDING * 2 +
                  primitiveMembers.length * DIAGRAM_NODE_HEIGHT +
                  Math.max(0, primitiveMembers.length - 1) * GROUP_CHILD_GAP,
              }
            : { width: DIAGRAM_NODE_WIDTH, height: DIAGRAM_NODE_HEIGHT };
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
        ? GROUP_HEADER_HEIGHT + GROUP_PADDING * 2 + innerHeight
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

      let childY = y + GROUP_HEADER_HEIGHT + GROUP_PADDING;

      if (hasTemplate) {
        const templateId = `template:${node.id}`;
        templateIdByComponent.set(node.id, templateId);
        layout.set(templateId, {
          column,
          row: 0,
          x: x + GROUP_PADDING,
          y: childY,
          width: GROUP_WIDTH - GROUP_PADDING * 2,
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
          const memberY = childY +
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
            primitiveMembers.forEach((property, propertyIndex) => {
              layout.set(property.id, {
                column,
                row: propertyIndex,
                x: memberX + GROUP_PADDING + 11,
                y:
                  memberY +
                  PRIMITIVE_GROUP_HEADER_HEIGHT +
                  GROUP_PADDING +
                  propertyIndex * (DIAGRAM_NODE_HEIGHT + GROUP_CHILD_GAP),
                width: DIAGRAM_NODE_WIDTH,
                height: DIAGRAM_NODE_HEIGHT,
                groupId: child.id,
                containerId: child.id,
              });
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

  private buildVisibleGraph(
    graph: DependencyGraph | null,
    routeLabel: string,
    all: boolean,
  ): { nodes: GraphNode[]; edges: GraphEdge[] } {
    if (!graph) return { nodes: [], edges: [] };
    if (all) return { nodes: graph.nodes, edges: graph.edges };

    const route = graph.nodes.find(
      (node) => node.kind === 'route' && node.label === routeLabel,
    );
    if (!route) return { nodes: [], edges: [] };

    const ids = this.reachableFromRoute(route.id);
    return {
      nodes: graph.nodes.filter((node) => ids.has(node.id)),
      edges: graph.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to)),
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
        if (ids.has(edge.from) && EDGE_KINDS.includes(edge.kind) && !ids.has(edge.to)) {
          ids.add(edge.to);
          changed = true;
        }
      }
    }
    return ids;
  }
}
