import { Component, input, ResourceStatus } from '@angular/core';
import {
    provideHostName,
    type ExtractDeps,
    type GetDeps,
    type GetPublicComponentProperties
} from '@craft-ng/core';

@Component({
  selector: 'app-status',
  standalone: true,
  styles: [
    `
      .badge-container {
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }

      .status-emoji {
        display: inline-block;
        font-size: 14px;
        line-height: 1;
      }

      .badge {
        padding: 4px 8px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 500;
        transition: all 0.3s ease;
        line-height: 1;
      }

      .badge-gray {
        background: #e2e8f0;
        color: #4a5568;
      }

      .badge-red {
        background: #fed7d7;
        color: #c53030;
        animation: shake 0.5s ease-in-out;
      }

      .badge-orange {
        background: #feebc8;
        color: #c05621;
      }

      .badge-green {
        background: #c6f6d5;
        color: #2f855a;
        animation: pulse 0.5s ease-in-out;
      }

      .badge-blue {
        background: #bee3f8;
        color: #2b6cb0;
      }

      .badge-darkgray {
        background: #cbd5e0;
        color: #4a5568;
      }

      @keyframes shake {
        0%,
        100% {
          transform: translateX(0);
        }
        25% {
          transform: translateX(-2px);
        }
        75% {
          transform: translateX(2px);
        }
      }

      @keyframes pulse {
        0%,
        100% {
          transform: scale(1);
        }
        50% {
          transform: scale(1.05);
        }
      }
    `,
  ],
  template: `
    @let _status = this.status();
    @switch (_status) {
      @case ('idle') {
        <span class="badge-container">
          <span class="status-emoji">🛌</span>
          <span class="badge badge-gray">Idle</span>
        </span>
      }
      @case ('error') {
        <span class="badge-container">
          <span class="status-emoji error">❌</span>
          <span class="badge badge-red">Error</span>
        </span>
      }
      @case ('loading') {
        <span class="badge-container">
          <span class="status-emoji loading">⏳</span>
          <span class="badge badge-orange">Loading</span>
        </span>
      }
      @case ('reloading') {
        <span class="badge-container">
          <span class="status-emoji loading">🔄</span>
          <span class="badge badge-orange">Reloading</span>
        </span>
      }
      @case ('resolved') {
        <span class="badge-container">
          <span class="status-emoji success">✅</span>
          <span class="badge badge-green">Loaded</span>
        </span>
      }
      @case ('local') {
        <span class="badge-container">
          <span class="status-emoji">📦</span>
          <span class="badge badge-blue">Local</span>
        </span>
      }
      @case ('exception') {
        <span class="badge-container">
          <span class="status-emoji error">⚠️</span>
          <span class="badge badge-red">Exception</span>
        </span>
      }
      @default never;
    }
  `,
  providers: [provideHostName('component:StatusComponent')],
})
export class StatusComponent {
  readonly status = input.required<ResourceStatus | 'exception'>();
}

export type GenDeps_StatusComponent = GetDeps<{
      deps: {};
      propertiesDeps: {
        status: ExtractDeps<StatusComponent["status"]>;
      };
      provided: {
        HostName: ReturnType<typeof provideHostName>;
      };
      publicProperties: GetPublicComponentProperties<StatusComponent>;
    }>;
