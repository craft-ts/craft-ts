import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { APP_SNAPSHOT_REGISTRY, type SnapshotReport } from '@craft-ng/core';
import { DEV_TOOLS_BUFFER } from '../buffer/ring-buffer';
import { collectSnapshot } from '../buffer/snapshot-collector';
import { formatJson, formatTime } from './format';

interface TreeNode {
  readonly hostTagChain: string;
  readonly reports: readonly SnapshotReport[];
}

/**
 * The wrapper attaches a fresh `stateSnapshot` to every `call:end` /
 * `call:error` event. We derive the live tree from the most recent event that
 * carries one — so any tracked method/mutation/query causes the tree to
 * refresh automatically. A manual Refresh button stays available for cases
 * where state was changed outside any tracked call (direct signal writes).
 */
@Component({
  selector: 'lib-craft-devtools-state-tree',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="header">
      <button type="button" (click)="refresh()">Refresh snapshot</button>
      <span class="count">{{ tree().length }} node(s)</span>
      <span class="source">
        @if (sourceLabel(); as label) {
          source: {{ label }}
        }
      </span>
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
        <div class="empty">No state captured yet.</div>
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
      .source {
        color: #4a5568;
        font-size: 10px;
        margin-left: auto;
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
      .report .source {
        color: #4299e1;
        margin-bottom: 2px;
        margin-left: 0;
        font-size: inherit;
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
  private readonly buffer = inject(DEV_TOOLS_BUFFER);
  private readonly _manualSnapshot = signal<readonly SnapshotReport[]>([]);
  private readonly _manualPulledAt = signal<number | null>(null);

  /**
   * Latest snapshot captured automatically by the FnWrapper at the end of a
   * tracked call. Tracks `buffer.events` so the tree refreshes whenever a
   * method/mutation/query completes.
   */
  private readonly _autoSnapshot = computed<{
    reports: readonly SnapshotReport[];
    at: number;
    source: string;
  } | null>(() => {
    const events = this.buffer.events();
    for (let i = events.length - 1; i >= 0; i--) {
      const ev = events[i];
      if (ev.kind === 'call:end' || ev.kind === 'call:error') {
        return {
          reports: ev.stateSnapshot,
          at: ev.endedAt,
          source: `${ev.primitiveKind}:${ev.name}`,
        };
      }
    }
    return null;
  });

  protected readonly tree = computed<readonly TreeNode[]>(() => {
    const reports = this._autoSnapshot()?.reports ?? this._manualSnapshot();
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

  protected readonly sourceLabel = computed<string | null>(() => {
    const auto = this._autoSnapshot();
    if (auto) return `${auto.source} @ ${formatTime(auto.at)}`;
    const pulledAt = this._manualPulledAt();
    if (pulledAt !== null) return `manual @ ${formatTime(pulledAt)}`;
    return null;
  });

  constructor() {
    // Seed with a manual pull so the tree shows something before any events.
    this.refresh();
  }

  protected refresh(): void {
    this._manualSnapshot.set(collectSnapshot(this.registry));
    this._manualPulledAt.set(performance.now());
  }

  protected jsonOf(value: unknown): string {
    return formatJson(value);
  }
}
