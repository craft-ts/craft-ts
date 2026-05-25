import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DEV_TOOLS_BUFFER } from '../buffer/ring-buffer';
import { CraftDevToolsErrorPanelComponent } from './error-panel.component';
import { CraftDevToolsQueryInspectorComponent } from './query-inspector.component';
import { CraftDevToolsStateTreeComponent } from './state-tree.component';
import { CraftDevToolsTimelineComponent } from './timeline.component';

type Tab = 'timeline' | 'state' | 'queries' | 'errors';

@Component({
  selector: 'lib-craft-devtools-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CraftDevToolsTimelineComponent,
    CraftDevToolsStateTreeComponent,
    CraftDevToolsQueryInspectorComponent,
    CraftDevToolsErrorPanelComponent,
  ],
  template: `
    @if (open()) {
      <div class="panel" [style.height.px]="height()">
        <div class="topbar">
          <span class="title">🛠 craft devtools</span>
          @for (tab of allTabs; track tab.id) {
            <button
              type="button"
              class="tab"
              [class.active]="activeTab() === tab.id"
              (click)="activeTab.set(tab.id)"
            >
              {{ tab.label }}
              @if (tab.id === 'errors' && errorCount() > 0) {
                <span class="badge-count">{{ errorCount() }}</span>
              }
            </button>
          }
          <span class="spacer"></span>
          <button type="button" class="close" (click)="toggle()">✕</button>
        </div>
        <div class="body">
          @switch (activeTab()) {
            @case ('timeline') {
              <lib-craft-devtools-timeline />
            }
            @case ('state') {
              <lib-craft-devtools-state-tree />
            }
            @case ('queries') {
              <lib-craft-devtools-query-inspector />
            }
            @case ('errors') {
              <lib-craft-devtools-error-panel />
            }
          }
        </div>
        <div class="resize-handle" (mousedown)="startResize($event)"></div>
      </div>
    } @else {
      <button type="button" class="fab" (click)="toggle()" [class.has-error]="errorCount() > 0">
        🛠
        @if (errorCount() > 0) {
          <span class="fab-badge">{{ errorCount() }}</span>
        }
      </button>
    }
  `,
  styles: [
    `
      :host {
        position: fixed;
        bottom: 0;
        right: 0;
        left: 0;
        z-index: 999999;
        pointer-events: none;
        font-family:
          -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      :host > * {
        pointer-events: auto;
      }
      .fab {
        position: fixed;
        bottom: 16px;
        right: 16px;
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: #1a202c;
        color: white;
        border: 2px solid #4299e1;
        font-size: 18px;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .fab.has-error {
        border-color: #f56565;
        animation: pulse-error 1.5s ease-in-out infinite;
      }
      @keyframes pulse-error {
        0%,
        100% {
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }
        50% {
          box-shadow: 0 0 0 8px rgba(245, 101, 101, 0.2);
        }
      }
      .fab-badge {
        position: absolute;
        top: -4px;
        right: -4px;
        background: #f56565;
        color: white;
        font-size: 10px;
        font-weight: bold;
        border-radius: 10px;
        padding: 1px 5px;
        min-width: 12px;
      }
      .panel {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        background: #171923;
        border-top: 1px solid #2d3748;
        box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.5);
        display: flex;
        flex-direction: column;
      }
      .topbar {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 8px;
        background: #0f1419;
        border-bottom: 1px solid #2d3748;
      }
      .title {
        color: #4299e1;
        font-weight: bold;
        font-size: 12px;
        margin-right: 8px;
      }
      .tab {
        background: transparent;
        color: #a0aec0;
        border: none;
        padding: 4px 12px;
        border-radius: 3px;
        font-size: 11px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .tab:hover {
        background: #2d3748;
      }
      .tab.active {
        background: #2d3748;
        color: #e2e8f0;
      }
      .badge-count {
        background: #f56565;
        color: white;
        border-radius: 8px;
        padding: 0 5px;
        font-size: 10px;
      }
      .spacer {
        flex: 1;
      }
      .close {
        background: transparent;
        color: #a0aec0;
        border: none;
        padding: 4px 8px;
        cursor: pointer;
        font-size: 14px;
      }
      .close:hover {
        color: #fed7d7;
      }
      .body {
        flex: 1;
        overflow: hidden;
        position: relative;
      }
      .body > * {
        position: absolute;
        inset: 0;
      }
      .resize-handle {
        position: absolute;
        top: -3px;
        left: 0;
        right: 0;
        height: 6px;
        cursor: ns-resize;
        background: transparent;
      }
      .resize-handle:hover {
        background: rgba(66, 153, 225, 0.3);
      }
    `,
  ],
})
export class CraftDevToolsPanelComponent {
  private readonly buffer = inject(DEV_TOOLS_BUFFER);

  protected readonly open = signal(false);
  protected readonly activeTab = signal<Tab>('timeline');
  protected readonly height = signal(360);

  protected readonly allTabs: readonly { id: Tab; label: string }[] = [
    { id: 'timeline', label: 'Timeline' },
    { id: 'state', label: 'State' },
    { id: 'queries', label: 'Queries' },
    { id: 'errors', label: 'Errors' },
  ];

  protected readonly errorCount = computed(
    () => this.buffer.events().filter((e) => e.kind === 'call:error').length,
  );

  protected toggle(): void {
    this.open.update((v) => !v);
  }

  protected startResize(event: MouseEvent): void {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = this.height();
    const onMove = (e: MouseEvent) => {
      const dy = startY - e.clientY;
      this.height.set(Math.max(120, Math.min(window.innerHeight - 40, startHeight + dy)));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }
}
