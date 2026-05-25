import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { APP_SNAPSHOT_REGISTRY, type SnapshotReport } from '@craft-ng/core';
import { collectSnapshot } from '../buffer/snapshot-collector';
import { formatJson } from './format';

interface TreeNode {
  readonly hostTagChain: string;
  readonly reports: readonly SnapshotReport[];
}

@Component({
  selector: 'lib-craft-devtools-state-tree',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="header">
      <button type="button" (click)="refresh()">Refresh snapshot</button>
      <span class="count">{{ tree().length }} node(s)</span>
    </div>
    <div class="tree">
      @for (node of tree(); track node.hostTagChain) {
        <details open>
          <summary>{{ node.hostTagChain }}</summary>
          @for (r of node.reports; track r.source) {
            <div class="report">
              <div class="source">{{ r.source }}</div>
              <pre>{{ jsonOf(r.state) }}</pre>
            </div>
          }
        </details>
      } @empty {
        <div class="empty">No state captured. Click Refresh.</div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        font-family: monospace;
        font-size: 11px;
        color: #e2e8f0;
      }
      .header {
        display: flex;
        gap: 8px;
        align-items: center;
        padding: 6px 8px;
        background: #1a202c;
        border-bottom: 1px solid #2d3748;
      }
      .header button {
        background: #4299e1;
        color: white;
        border: none;
        padding: 3px 10px;
        border-radius: 3px;
        font: inherit;
        cursor: pointer;
      }
      .count {
        color: #a0aec0;
      }
      .tree {
        flex: 1;
        overflow-y: auto;
        padding: 6px 8px;
        background: #171923;
      }
      details {
        margin-bottom: 6px;
      }
      summary {
        cursor: pointer;
        padding: 3px 6px;
        background: #2d3748;
        border-radius: 3px;
        color: #f6ad55;
      }
      .report {
        margin: 4px 0 4px 16px;
      }
      .source {
        color: #4299e1;
        margin-bottom: 2px;
      }
      pre {
        background: #1a202c;
        margin: 0;
        padding: 4px 6px;
        border-radius: 3px;
        max-height: 200px;
        overflow: auto;
        white-space: pre-wrap;
        word-break: break-all;
      }
      .empty {
        padding: 24px;
        color: #718096;
        text-align: center;
      }
    `,
  ],
})
export class CraftDevToolsStateTreeComponent {
  private readonly registry = inject(APP_SNAPSHOT_REGISTRY);
  private readonly _reports = signal<readonly SnapshotReport[]>([]);

  protected readonly tree = computed<readonly TreeNode[]>(() => {
    const reports = this._reports();
    const grouped = new Map<string, SnapshotReport[]>();
    for (const r of reports) {
      const key = r.from.length > 0 ? r.from.join(' › ') : '(root)';
      const list = grouped.get(key) ?? [];
      list.push(r);
      grouped.set(key, list);
    }
    return [...grouped.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([hostTagChain, reports]) => ({ hostTagChain, reports }));
  });

  constructor() {
    this.refresh();
  }

  protected refresh(): void {
    this._reports.set(collectSnapshot(this.registry));
  }

  protected jsonOf(value: unknown): string {
    return formatJson(value);
  }
}
