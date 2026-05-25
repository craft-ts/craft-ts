import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { DEV_TOOLS_BUFFER } from '../buffer/ring-buffer';
import { type CallErrorEvent } from '../event-types';
import { formatJson, formatTime } from './format';

@Component({
  selector: 'lib-craft-devtools-error-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="header">
      <span class="count">{{ errors().length }} error(s)</span>
    </div>
    <div class="list">
      @for (err of errors(); track err.id) {
        <details class="entry">
          <summary>
            <span class="time">{{ formatTime(err.endedAt) }}</span>
            <span class="badge badge-{{ err.primitiveKind }}">{{ err.primitiveKind }}</span>
            <span class="name">{{ err.name }}</span>
            <span class="msg">{{ messageOf(err.error) }}</span>
          </summary>
          <div class="body">
            <div class="meta">
              <span>HostTag: {{ err.hostTag.join(' › ') }}</span>
              @if (err.correlation?.startCorrelationId; as cid) {
                <span>Correlation: {{ cid }}</span>
              }
            </div>
            <h5>Error</h5>
            <pre class="error-pre">{{ jsonOf(err.error) }}</pre>
            <h5>State at error</h5>
            <pre>{{ jsonOf(err.stateSnapshot) }}</pre>
          </div>
        </details>
      } @empty {
        <div class="empty">No errors recorded yet.</div>
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
      .list {
        flex: 1;
        overflow-y: auto;
      }
      .entry {
        border-bottom: 1px solid #2d3748;
      }
      summary {
        display: flex;
        gap: 8px;
        padding: 6px 10px;
        align-items: center;
        cursor: pointer;
        background: #2d1b1b;
        color: #fed7d7;
      }
      summary:hover {
        background: #3a2222;
      }
      .time {
        color: #a0aec0;
        min-width: 90px;
      }
      .badge {
        padding: 1px 6px;
        border-radius: 3px;
        font-size: 10px;
      }
      .badge-method {
        background: #4299e1;
        color: white;
      }
      .badge-mutation {
        background: #ed8936;
        color: white;
      }
      .badge-query {
        background: #38b2ac;
        color: white;
      }
      .badge-asyncProcess {
        background: #9f7aea;
        color: white;
      }
      .badge-computed {
        background: #d69e2e;
        color: white;
      }
      .badge-service {
        background: #718096;
        color: white;
      }
      .badge-component {
        background: #48bb78;
        color: white;
      }
      .badge-unknown {
        background: #2d3748;
        color: #a0aec0;
      }
      .name {
        color: #f6ad55;
        min-width: 120px;
      }
      .msg {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .body {
        padding: 8px 12px;
        background: #171923;
      }
      .meta {
        color: #a0aec0;
        font-size: 10px;
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
      }
      h5 {
        margin: 8px 0 2px 0;
        color: #a0aec0;
        font-size: 10px;
        text-transform: uppercase;
      }
      pre {
        background: #1a202c;
        padding: 6px 8px;
        border-radius: 3px;
        margin: 0;
        max-height: 240px;
        overflow: auto;
        white-space: pre-wrap;
        word-break: break-all;
      }
      .error-pre {
        background: #2d1b1b;
        color: #fed7d7;
      }
      .empty {
        padding: 24px;
        text-align: center;
        color: #718096;
      }
    `,
  ],
})
export class CraftDevToolsErrorPanelComponent {
  private readonly buffer = inject(DEV_TOOLS_BUFFER);

  protected readonly errors = computed<readonly CallErrorEvent[]>(() => {
    return this.buffer
      .events()
      .filter((ev): ev is CallErrorEvent => ev.kind === 'call:error')
      .reverse();
  });

  protected formatTime(t: number): string {
    return formatTime(t);
  }

  protected jsonOf(value: unknown): string {
    return formatJson(value);
  }

  protected messageOf(error: unknown): string {
    if (error && typeof error === 'object' && 'message' in error) {
      return String((error as { message: unknown }).message);
    }
    return String(error);
  }
}
