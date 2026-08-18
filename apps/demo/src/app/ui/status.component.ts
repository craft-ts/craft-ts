/* eslint-disable craft-ts/no-hardcoded-design-values -- Demo UI colours are intentionally local to this example. */
import {
  craftComponent,
  span,
  type Input,
} from '@craft-ts/component';
import type { CraftResourceStatus } from '@craft-ts/core';

const STATUS_VIEW = {
  idle: ['🛌', 'Idle', 'gray'],
  error: ['❌', 'Error', 'red'],
  loading: ['⏳', 'Loading', 'orange'],
  reloading: ['🔄', 'Reloading', 'orange'],
  resolved: ['✅', 'Loaded', 'green'],
  local: ['📦', 'Local', 'blue'],
  exception: ['⚠️', 'Exception', 'red'],
} as const;

export const StatusComponent = craftComponent(
  'StatusComponent',
  {
    styles: `
      :scope {
        --status-gray-bg: #e2e8f0;
        --status-gray-ink: #4a5568;
        --status-red-bg: #fed7d7;
        --status-red-ink: #c53030;
        --status-orange-bg: #feebc8;
        --status-orange-ink: #c05621;
        --status-green-bg: #c6f6d5;
        --status-green-ink: #2f855a;
        --status-blue-bg: #bee3f8;
        --status-blue-ink: #2b6cb0;
      }
      .badge-container { display:inline-flex; align-items:center; gap:4px; }
      .status-emoji { display:inline-block; font-size:14px; line-height:1; }
      .badge { padding:4px 8px; border-radius:6px; font-size:12px; font-weight:500; line-height:1; }
      .badge-gray { background:var(--status-gray-bg); color:var(--status-gray-ink); }
      .badge-red { background:var(--status-red-bg); color:var(--status-red-ink); }
      .badge-orange { background:var(--status-orange-bg); color:var(--status-orange-ink); }
      .badge-green { background:var(--status-green-bg); color:var(--status-green-ink); }
      .badge-blue { background:var(--status-blue-bg); color:var(--status-blue-ink); }
    
      button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid currentColor;outline-offset:2px}
    `,
  },
  (status: Input<CraftResourceStatus>) => ({ status }),
  ({ status }) =>
    span({ class: 'badge-container' }, [
      span({ class: 'status-emoji' }, function* () {
        return STATUS_VIEW[yield* status()][0];
      }),
      span(
        {
          class: function* () {
            return `badge badge-${STATUS_VIEW[yield* status()][2]}`;
          },
        },
        function* () {
          return STATUS_VIEW[yield* status()][1];
        },
      ),
    ]),
);

export type StatusComponent = typeof StatusComponent;
