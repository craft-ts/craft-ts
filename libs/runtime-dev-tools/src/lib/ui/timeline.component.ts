import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DEV_TOOLS_BUFFER } from '../buffer/ring-buffer';
import {
  type CallEndEvent,
  type CallErrorEvent,
  type CallStartEvent,
  type PrimitiveKind,
} from '../event-types';
import { formatDuration, formatJson, formatTime } from './format';

type CallStatus = 'running' | 'success' | 'error';

interface CallRow {
  readonly id: string;
  readonly primitiveKind: PrimitiveKind;
  readonly name: string;
  readonly hostTag: readonly string[];
  readonly startedAt: number;
  readonly endedAt: number | null;
  readonly durationMs: number | null;
  readonly status: CallStatus;
  readonly correlationId: string | null;
  readonly startEvent: CallStartEvent;
  readonly endEvent: CallEndEvent | CallErrorEvent | null;
}

@Component({
  selector: 'lib-craft-devtools-timeline',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="filters">
      <label>
        <input
          type="text"
          placeholder="filter by name…"
          [value]="nameFilter()"
          (input)="onNameFilter($event)"
        />
      </label>
      @for (kind of allKinds; track kind) {
        <button
          type="button"
          class="kind-toggle"
          [class.active]="activeKinds().has(kind)"
          (click)="toggleKind(kind)"
        >
          {{ kind }}
        </button>
      }
      <button type="button" class="clear" (click)="clearBuffer()">Clear</button>
    </div>
    <div class="rows">
      @for (row of rows(); track row.id) {
        <button
          type="button"
          class="row"
          [class.is-error]="row.status === 'error'"
          [class.is-running]="row.status === 'running'"
          [class.is-selected]="selectedId() === row.id"
          (click)="select(row)"
        >
          <span class="time">{{ formatTime(row.startedAt) }}</span>
          <span class="badge badge-{{ row.primitiveKind }}">{{ row.primitiveKind }}</span>
          <span class="name">{{ row.name }}</span>
          <span class="status status-{{ row.status }}">{{ row.status }}</span>
          @if (row.durationMs !== null) {
            <span class="duration">{{ formatDuration(row.durationMs) }}</span>
          } @else {
            <span class="duration">—</span>
          }
          @if (row.correlationId) {
            <span class="correlation" [title]="row.correlationId">⛓</span>
          }
        </button>
      } @empty {
        <div class="empty">No calls recorded yet — interact with the app.</div>
      }
    </div>
    @if (selectedRow(); as row) {
      <div class="detail">
        <h4>{{ row.primitiveKind }}:{{ row.name }} — {{ row.status }}</h4>
        <div class="meta">
          <span>HostTag: {{ row.hostTag.join(' › ') }}</span>
          @if (row.correlationId) {
            <span>Correlation: {{ row.correlationId }}</span>
          }
          @if (row.durationMs !== null) {
            <span>Duration: {{ formatDuration(row.durationMs) }}</span>
          }
        </div>
        <h5>Args</h5>
        <pre>{{ jsonOf(row.startEvent.args) }}</pre>
        @if (row.endEvent; as ev) {
          @if (ev.kind === 'call:end') {
            <h5>Result</h5>
            <pre>{{ jsonOf(ev.result) }}</pre>
            <h5>State snapshot</h5>
            <pre>{{ jsonOf(ev.stateSnapshot) }}</pre>
            @if (ev.insertions) {
              <h5>Insertions</h5>
              <pre>{{ jsonOf(ev.insertions) }}</pre>
            }
          }
          @if (ev.kind === 'call:error') {
            <h5>Error</h5>
            <pre class="error-pre">{{ jsonOf(ev.error) }}</pre>
            <h5>State snapshot</h5>
            <pre>{{ jsonOf(ev.stateSnapshot) }}</pre>
          }
        } @else {
          <h5>Still running…</h5>
        }
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        font-family: monospace;
        font-size: 11px;
      }
      .filters {
        display: flex;
        gap: 4px;
        padding: 4px 8px;
        border-bottom: 1px solid #2d3748;
        background: #1a202c;
        align-items: center;
      }
      .filters input[type='text'] {
        background: #2d3748;
        color: #e2e8f0;
        border: 1px solid #4a5568;
        padding: 2px 6px;
        border-radius: 3px;
        font: inherit;
        flex: 1;
      }
      .kind-toggle {
        padding: 2px 6px;
        background: #2d3748;
        color: #a0aec0;
        border: 1px solid #4a5568;
        border-radius: 3px;
        cursor: pointer;
        font: inherit;
      }
      .kind-toggle.active {
        background: #4299e1;
        color: white;
        border-color: #4299e1;
      }
      .clear {
        margin-left: auto;
        padding: 2px 8px;
        background: #742a2a;
        color: #fed7d7;
        border: none;
        border-radius: 3px;
        cursor: pointer;
        font: inherit;
      }
      .rows {
        flex: 1;
        overflow-y: auto;
        background: #171923;
      }
      .row {
        display: flex;
        gap: 6px;
        padding: 3px 8px;
        border: none;
        border-bottom: 1px solid #2d3748;
        background: transparent;
        cursor: pointer;
        align-items: center;
        color: #e2e8f0;
        width: 100%;
        text-align: left;
        font: inherit;
      }
      .row:hover {
        background: #2d3748;
      }
      .row.is-selected {
        background: #2c5282;
      }
      .row.is-error {
        background: #742a2a;
        color: #fed7d7;
      }
      .row.is-running {
        color: #f6e05e;
      }
      .time {
        color: #718096;
        min-width: 90px;
      }
      .badge {
        padding: 1px 6px;
        border-radius: 3px;
        font-size: 10px;
        min-width: 70px;
        text-align: center;
        text-transform: uppercase;
      }
      .badge-method { background: #4299e1; color: white; }
      .badge-mutation { background: #ed8936; color: white; }
      .badge-query { background: #38b2ac; color: white; }
      .badge-asyncProcess { background: #9f7aea; color: white; }
      .badge-computed { background: #d69e2e; color: white; }
      .badge-service { background: #718096; color: white; }
      .badge-component { background: #48bb78; color: white; }
      .badge-unknown { background: #2d3748; color: #a0aec0; }
      .name {
        flex: 1;
        color: #e2e8f0;
      }
      .status {
        font-size: 10px;
        text-transform: uppercase;
        min-width: 60px;
      }
      .status-success { color: #68d391; }
      .status-error { color: #fc8181; }
      .status-running { color: #f6e05e; }
      .duration {
        color: #f6ad55;
        min-width: 60px;
        text-align: right;
      }
      .correlation {
        color: #fbb6ce;
      }
      .empty {
        padding: 24px;
        color: #718096;
        text-align: center;
      }
      .detail {
        border-top: 1px solid #2d3748;
        background: #1a202c;
        padding: 8px 12px;
        max-height: 40%;
        overflow-y: auto;
        color: #e2e8f0;
      }
      .detail h4 {
        margin: 0 0 4px 0;
        color: #f6ad55;
      }
      .detail h5 {
        margin: 8px 0 2px 0;
        color: #a0aec0;
        font-size: 11px;
        text-transform: uppercase;
      }
      .detail pre {
        background: #171923;
        padding: 6px 8px;
        border-radius: 3px;
        overflow: auto;
        max-height: 220px;
        margin: 0;
        color: #e2e8f0;
        white-space: pre-wrap;
        word-break: break-all;
      }
      .detail .error-pre {
        color: #fed7d7;
        background: #2d1b1b;
      }
      .meta {
        color: #a0aec0;
        font-size: 10px;
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
      }
    `,
  ],
})
export class CraftDevToolsTimelineComponent {
  private readonly buffer = inject(DEV_TOOLS_BUFFER);
  protected readonly nameFilter = signal('');
  protected readonly allKinds: readonly PrimitiveKind[] = [
    'method',
    'mutation',
    'query',
    'asyncProcess',
    'computed',
    'service',
    'component',
  ];
  protected readonly activeKinds = signal<Set<PrimitiveKind>>(
    new Set(this.allKinds),
  );
  protected readonly selectedId = signal<string | null>(null);

  protected readonly rows = computed<readonly CallRow[]>(() => {
    const filter = this.nameFilter().toLowerCase();
    const kinds = this.activeKinds();
    const byId = new Map<string, MutableRow>();

    for (const ev of this.buffer.events()) {
      if (!kinds.has(ev.primitiveKind)) continue;
      if (filter && !ev.name.toLowerCase().includes(filter)) continue;
      let row = byId.get(ev.id);
      if (!row) {
        if (ev.kind !== 'call:start') continue; // ignore orphan end without start
        row = {
          id: ev.id,
          primitiveKind: ev.primitiveKind,
          name: ev.name,
          hostTag: ev.hostTag,
          startedAt: ev.startedAt,
          endedAt: null,
          durationMs: null,
          status: 'running',
          correlationId: ev.correlation?.startCorrelationId ?? null,
          startEvent: ev,
          endEvent: null,
        };
        byId.set(ev.id, row);
        continue;
      }
      if (ev.kind === 'call:end') {
        row.endedAt = ev.endedAt;
        row.durationMs = ev.durationMs;
        row.status = 'success';
        row.endEvent = ev;
      } else if (ev.kind === 'call:error') {
        row.endedAt = ev.endedAt;
        row.durationMs = ev.durationMs;
        row.status = 'error';
        row.endEvent = ev;
      }
    }

    return [...byId.values()].sort((a, b) => b.startedAt - a.startedAt);
  });

  protected readonly selectedRow = computed<CallRow | null>(() => {
    const id = this.selectedId();
    if (!id) return null;
    return this.rows().find((r) => r.id === id) ?? null;
  });

  protected onNameFilter(event: Event): void {
    this.nameFilter.set((event.target as HTMLInputElement).value);
  }

  protected toggleKind(kind: PrimitiveKind): void {
    this.activeKinds.update((current) => {
      const next = new Set(current);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }

  protected select(row: CallRow): void {
    this.selectedId.set(row.id);
  }

  protected clearBuffer(): void {
    this.buffer.clear();
    this.selectedId.set(null);
  }

  protected formatDuration(ms: number): string {
    return formatDuration(ms);
  }

  protected formatTime(t: number): string {
    return formatTime(t);
  }

  protected jsonOf(value: unknown): string {
    return formatJson(value);
  }
}

interface MutableRow {
  id: string;
  primitiveKind: PrimitiveKind;
  name: string;
  hostTag: readonly string[];
  startedAt: number;
  endedAt: number | null;
  durationMs: number | null;
  status: CallStatus;
  correlationId: string | null;
  startEvent: CallStartEvent;
  endEvent: CallEndEvent | CallErrorEvent | null;
}
