import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { DEV_TOOLS_BUFFER } from '../buffer/ring-buffer';
import { formatDuration, formatJson, formatTime } from './format';

interface QueryRow {
  readonly key: string;
  readonly name: string;
  readonly kind: 'query' | 'mutation' | 'asyncProcess';
  readonly status: 'pending' | 'success' | 'error';
  readonly lastDurationMs: number | null;
  readonly lastEndedAt: number | null;
  readonly callCount: number;
  readonly errorCount: number;
  readonly lastArgs: unknown;
  readonly lastResult: unknown;
  readonly lastError: unknown;
}

@Component({
  selector: 'lib-craft-devtools-query-inspector',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="header">
      <span class="count">{{ rows().length }} primitive(s)</span>
    </div>
    <table>
      <thead>
        <tr>
          <th>Kind</th>
          <th>Name</th>
          <th>Status</th>
          <th>Last duration</th>
          <th>Last run</th>
          <th>Calls</th>
          <th>Errors</th>
        </tr>
      </thead>
      <tbody>
        @for (row of rows(); track row.key) {
          <tr [class.status-pending]="row.status === 'pending'" [class.status-error]="row.status === 'error'">
            <td>
              <span class="badge badge-{{ row.kind }}">{{ row.kind }}</span>
            </td>
            <td class="name">{{ row.name }}</td>
            <td>{{ row.status }}</td>
            <td>{{ row.lastDurationMs !== null ? formatDuration(row.lastDurationMs) : '—' }}</td>
            <td>{{ row.lastEndedAt !== null ? formatTime(row.lastEndedAt) : '—' }}</td>
            <td>{{ row.callCount }}</td>
            <td class="errors">{{ row.errorCount }}</td>
          </tr>
          <tr class="detail-row">
            <td colspan="7">
              <details>
                <summary>details</summary>
                <div class="detail-grid">
                  <div>
                    <h5>Args</h5>
                    <pre>{{ jsonOf(row.lastArgs) }}</pre>
                  </div>
                  @if (row.status === 'error') {
                    <div>
                      <h5>Error</h5>
                      <pre class="error-pre">{{ jsonOf(row.lastError) }}</pre>
                    </div>
                  } @else {
                    <div>
                      <h5>Result</h5>
                      <pre>{{ jsonOf(row.lastResult) }}</pre>
                    </div>
                  }
                </div>
              </details>
            </td>
          </tr>
        } @empty {
          <tr>
            <td colspan="7" class="empty">No query/mutation/asyncProcess recorded yet.</td>
          </tr>
        }
      </tbody>
    </table>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
        overflow: auto;
        font-family: monospace;
        font-size: 11px;
        color: #e2e8f0;
        background: #171923;
      }
      .header {
        padding: 6px 8px;
        background: #1a202c;
        border-bottom: 1px solid #2d3748;
      }
      .count {
        color: #a0aec0;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      thead {
        position: sticky;
        top: 0;
        background: #1a202c;
      }
      th,
      td {
        text-align: left;
        padding: 4px 8px;
        border-bottom: 1px solid #2d3748;
      }
      th {
        color: #a0aec0;
        font-weight: normal;
        text-transform: uppercase;
        font-size: 10px;
      }
      tr.status-pending td {
        color: #f6ad55;
      }
      tr.status-error td {
        color: #fed7d7;
        background: #2d1b1b;
      }
      .name {
        color: #f6ad55;
      }
      .errors {
        color: #fc8181;
      }
      .badge {
        padding: 1px 6px;
        border-radius: 3px;
        font-size: 10px;
        text-transform: uppercase;
      }
      .badge-query {
        background: #38b2ac;
        color: white;
      }
      .badge-mutation {
        background: #ed8936;
        color: white;
      }
      .badge-asyncProcess {
        background: #9f7aea;
        color: white;
      }
      .detail-row td {
        padding: 0 8px 4px 8px;
        border-bottom: 1px solid #2d3748;
      }
      details summary {
        cursor: pointer;
        color: #4299e1;
        padding: 2px 0;
      }
      .detail-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }
      h5 {
        margin: 4px 0 2px 0;
        color: #a0aec0;
        font-size: 10px;
        text-transform: uppercase;
      }
      pre {
        background: #1a202c;
        padding: 4px 6px;
        border-radius: 3px;
        margin: 0;
        max-height: 160px;
        overflow: auto;
        white-space: pre-wrap;
        word-break: break-all;
      }
      .error-pre {
        background: #2d1b1b;
        color: #fed7d7;
      }
      .empty {
        text-align: center;
        color: #718096;
        padding: 24px;
      }
    `,
  ],
})
export class CraftDevToolsQueryInspectorComponent {
  private readonly buffer = inject(DEV_TOOLS_BUFFER);

  protected readonly rows = computed<readonly QueryRow[]>(() => {
    const byKey = new Map<string, MutableRow>();
    for (const ev of this.buffer.events()) {
      if (
        ev.primitiveKind !== 'query' &&
        ev.primitiveKind !== 'mutation' &&
        ev.primitiveKind !== 'asyncProcess'
      )
        continue;
      const key = `${ev.primitiveKind}:${ev.name}`;
      let row = byKey.get(key);
      if (!row) {
        row = {
          key,
          name: ev.name,
          kind: ev.primitiveKind,
          status: 'pending',
          lastDurationMs: null,
          lastEndedAt: null,
          callCount: 0,
          errorCount: 0,
          lastArgs: null,
          lastResult: null,
          lastError: null,
        };
        byKey.set(key, row);
      }
      if (ev.kind === 'call:start') {
        row.callCount += 1;
        row.status = 'pending';
        row.lastArgs = ev.args;
      } else if (ev.kind === 'call:end') {
        row.status = 'success';
        row.lastDurationMs = ev.durationMs;
        row.lastEndedAt = ev.endedAt;
        row.lastResult = ev.result;
        row.lastError = null;
      } else if (ev.kind === 'call:error') {
        row.status = 'error';
        row.errorCount += 1;
        row.lastDurationMs = ev.durationMs;
        row.lastEndedAt = ev.endedAt;
        row.lastError = ev.error;
      }
    }
    return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
  });

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
  key: string;
  name: string;
  kind: 'query' | 'mutation' | 'asyncProcess';
  status: 'pending' | 'success' | 'error';
  lastDurationMs: number | null;
  lastEndedAt: number | null;
  callCount: number;
  errorCount: number;
  lastArgs: unknown;
  lastResult: unknown;
  lastError: unknown;
}
