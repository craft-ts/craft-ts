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

type SpanStatus = 'running' | 'success' | 'error';

interface Span {
  readonly id: string;
  readonly primitiveKind: PrimitiveKind;
  readonly name: string;
  readonly hostTag: readonly string[];
  readonly startedAt: number;
  readonly endedAt: number;
  readonly durationMs: number;
  readonly status: SpanStatus;
  readonly startEvent: CallStartEvent;
  readonly endEvent: CallEndEvent | CallErrorEvent | null;
  /** Layout: 0-indexed lane number within its trace. */
  readonly lane: number;
  /** Layout: left position 0-100 (percent of trace width). */
  readonly leftPct: number;
  /** Layout: width 0-100 (percent of trace width), with a min for visibility. */
  readonly widthPct: number;
}

interface Trace {
  readonly correlationId: string;
  readonly startedAt: number;
  readonly endedAt: number;
  readonly durationMs: number;
  readonly spans: readonly Span[];
  readonly laneCount: number;
  readonly errorCount: number;
}

const LANE_HEIGHT_PX = 22;
const MIN_WIDTH_PCT = 0.4;
const NO_CORRELATION_KEY = '(no correlation)';

@Component({
  selector: 'lib-craft-devtools-spans',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="header">
      <span class="count">{{ traces().length }} trace(s)</span>
      <span class="hint">grouped by correlationId • click a span for details</span>
      <button type="button" class="clear" (click)="clearBuffer()">Clear</button>
    </div>
    <div class="traces">
      @for (trace of traces(); track trace.correlationId) {
        <details open class="trace">
          <summary>
            <span class="trace-id">{{ trace.correlationId }}</span>
            <span class="trace-meta">
              {{ trace.spans.length }} call(s) • {{ formatDuration(trace.durationMs) }}
              @if (trace.errorCount > 0) {
                <span class="trace-errors">• {{ trace.errorCount }} error(s)</span>
              }
            </span>
            <span class="trace-time">{{ formatTime(trace.startedAt) }}</span>
          </summary>
          <div class="trace-body" [style.height.px]="trace.laneCount * LANE_HEIGHT_PX">
            @for (span of trace.spans; track span.id) {
              <button
                type="button"
                class="span"
                [class]="'span-' + span.primitiveKind"
                [class.is-error]="span.status === 'error'"
                [class.is-selected]="selectedId() === span.id"
                [style.left.%]="span.leftPct"
                [style.width.%]="span.widthPct"
                [style.top.px]="span.lane * LANE_HEIGHT_PX"
                [title]="span.primitiveKind + ':' + span.name + ' — ' + formatDuration(span.durationMs)"
                (click)="select(span)"
              >
                <span class="span-label">{{ span.name }}</span>
                <span class="span-dur">{{ formatDuration(span.durationMs) }}</span>
              </button>
            }
          </div>
        </details>
      } @empty {
        <div class="empty">No spans yet — interact with the app.</div>
      }
    </div>
    @if (selectedSpan(); as span) {
      <div class="detail">
        <h4>{{ span.primitiveKind }}:{{ span.name }} — {{ span.status }}</h4>
        <div class="meta">
          <span>HostTag: {{ span.hostTag.join(' › ') }}</span>
          <span>Duration: {{ formatDuration(span.durationMs) }}</span>
          <span>Started: {{ formatTime(span.startedAt) }}</span>
        </div>
        <h5>Args</h5>
        <pre>{{ jsonOf(span.startEvent.args) }}</pre>
        @if (span.endEvent; as ev) {
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
          }
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
        color: #e2e8f0;
        background: #171923;
      }
      .header {
        display: flex;
        gap: 12px;
        align-items: center;
        padding: 6px 8px;
        background: #1a202c;
        border-bottom: 1px solid #2d3748;
      }
      .count {
        color: #a0aec0;
      }
      .hint {
        color: #4a5568;
        font-size: 10px;
        flex: 1;
      }
      .clear {
        padding: 2px 8px;
        background: #742a2a;
        color: #fed7d7;
        border: none;
        border-radius: 3px;
        cursor: pointer;
        font: inherit;
        font-size: 11px;
      }
      .traces {
        flex: 1;
        overflow-y: auto;
        padding: 6px 8px;
      }
      .trace {
        margin-bottom: 8px;
        border: 1px solid #2d3748;
        border-radius: 4px;
        overflow: hidden;
      }
      .trace summary {
        cursor: pointer;
        padding: 6px 10px;
        background: #1a202c;
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .trace summary:hover {
        background: #2d3748;
      }
      .trace-id {
        color: #fbb6ce;
        font-weight: bold;
      }
      .trace-meta {
        color: #a0aec0;
        font-size: 10px;
        flex: 1;
      }
      .trace-errors {
        color: #fc8181;
      }
      .trace-time {
        color: #718096;
        font-size: 10px;
      }
      .trace-body {
        position: relative;
        background: repeating-linear-gradient(
          to right,
          #171923,
          #171923 10%,
          #1a202c 10%,
          #1a202c 20%
        );
        padding: 2px 0;
      }
      .span {
        position: absolute;
        height: 18px;
        margin-top: 2px;
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 3px;
        padding: 0 4px;
        font: inherit;
        font-size: 10px;
        color: white;
        cursor: pointer;
        overflow: hidden;
        display: flex;
        align-items: center;
        gap: 4px;
        white-space: nowrap;
        min-width: 4px;
      }
      .span:hover {
        outline: 1px solid white;
        z-index: 2;
      }
      .span.is-selected {
        outline: 2px solid #f6e05e;
        z-index: 3;
      }
      .span.is-error {
        background: #c53030 !important;
        border-color: #fc8181 !important;
      }
      .span-label {
        overflow: hidden;
        text-overflow: ellipsis;
        flex: 1;
      }
      .span-dur {
        font-size: 9px;
        opacity: 0.85;
        flex-shrink: 0;
      }
      .span-method { background: #4299e1; }
      .span-mutation { background: #ed8936; }
      .span-query { background: #38b2ac; }
      .span-asyncProcess { background: #9f7aea; }
      .span-computed { background: #d69e2e; }
      .span-service { background: #718096; }
      .span-component { background: #48bb78; }
      .span-unknown { background: #4a5568; }
      .empty {
        padding: 24px;
        text-align: center;
        color: #718096;
      }
      .detail {
        border-top: 1px solid #2d3748;
        background: #1a202c;
        padding: 8px 12px;
        max-height: 40%;
        overflow-y: auto;
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
        max-height: 200px;
        margin: 0;
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
export class CraftDevToolsSpansComponent {
  private readonly buffer = inject(DEV_TOOLS_BUFFER);
  protected readonly selectedId = signal<string | null>(null);
  protected readonly LANE_HEIGHT_PX = LANE_HEIGHT_PX;

  protected readonly traces = computed<readonly Trace[]>(() => {
    // Pair up start/end events by id.
    interface RawSpan {
      id: string;
      primitiveKind: PrimitiveKind;
      name: string;
      hostTag: readonly string[];
      startedAt: number;
      endedAt: number;
      durationMs: number;
      status: SpanStatus;
      correlationId: string;
      startEvent: CallStartEvent;
      endEvent: CallEndEvent | CallErrorEvent | null;
    }
    const byId = new Map<string, RawSpan>();
    const now = performance.now();

    for (const ev of this.buffer.events()) {
      if (ev.kind === 'call:start') {
        if (byId.has(ev.id)) continue;
        byId.set(ev.id, {
          id: ev.id,
          primitiveKind: ev.primitiveKind,
          name: ev.name,
          hostTag: ev.hostTag,
          startedAt: ev.startedAt,
          endedAt: now,
          durationMs: now - ev.startedAt,
          status: 'running',
          correlationId: ev.correlation?.startCorrelationId ?? NO_CORRELATION_KEY,
          startEvent: ev,
          endEvent: null,
        });
      } else {
        const row = byId.get(ev.id);
        if (!row) continue;
        row.endedAt = ev.endedAt;
        row.durationMs = ev.durationMs;
        row.status = ev.kind === 'call:error' ? 'error' : 'success';
        row.endEvent = ev;
      }
    }

    // Group by correlation.
    const byCorrelation = new Map<string, RawSpan[]>();
    for (const span of byId.values()) {
      const list = byCorrelation.get(span.correlationId) ?? [];
      list.push(span);
      byCorrelation.set(span.correlationId, list);
    }

    // Build traces with layout.
    const traces: Trace[] = [];
    for (const [correlationId, rawSpans] of byCorrelation) {
      rawSpans.sort((a, b) => a.startedAt - b.startedAt);
      const traceStart = rawSpans[0].startedAt;
      const traceEnd = rawSpans.reduce((max, s) => Math.max(max, s.endedAt), traceStart);
      const traceDuration = Math.max(traceEnd - traceStart, 0.001);

      // Greedy lane assignment: place each span on the lowest lane whose last
      // span ended before this one starts. Lanes track each lane's last endedAt.
      const laneEnds: number[] = [];
      const laidOut: Span[] = [];
      let errorCount = 0;
      for (const s of rawSpans) {
        let lane = laneEnds.findIndex((end) => end <= s.startedAt);
        if (lane === -1) {
          lane = laneEnds.length;
          laneEnds.push(s.endedAt);
        } else {
          laneEnds[lane] = s.endedAt;
        }
        if (s.status === 'error') errorCount += 1;
        const leftPct = ((s.startedAt - traceStart) / traceDuration) * 100;
        const widthPct = Math.max(
          (s.durationMs / traceDuration) * 100,
          MIN_WIDTH_PCT,
        );
        laidOut.push({
          id: s.id,
          primitiveKind: s.primitiveKind,
          name: s.name,
          hostTag: s.hostTag,
          startedAt: s.startedAt,
          endedAt: s.endedAt,
          durationMs: s.durationMs,
          status: s.status,
          startEvent: s.startEvent,
          endEvent: s.endEvent,
          lane,
          leftPct,
          widthPct,
        });
      }

      traces.push({
        correlationId,
        startedAt: traceStart,
        endedAt: traceEnd,
        durationMs: traceEnd - traceStart,
        spans: laidOut,
        laneCount: Math.max(laneEnds.length, 1),
        errorCount,
      });
    }

    // Most-recent traces first.
    traces.sort((a, b) => b.startedAt - a.startedAt);
    return traces;
  });

  protected readonly selectedSpan = computed<Span | null>(() => {
    const id = this.selectedId();
    if (!id) return null;
    for (const trace of this.traces()) {
      const span = trace.spans.find((s) => s.id === id);
      if (span) return span;
    }
    return null;
  });

  protected select(span: Span): void {
    this.selectedId.set(span.id);
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
