import type { ResourceStatus } from '@angular/core';
import { craftComponent, span, type Input } from '@craft-ng/component';

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
      .badge-container { display:inline-flex; align-items:center; gap:4px; }
      .status-emoji { display:inline-block; font-size:14px; line-height:1; }
      .badge { padding:4px 8px; border-radius:6px; font-size:12px; font-weight:500; line-height:1; }
      .badge-gray { background:#e2e8f0; color:#4a5568; }
      .badge-red { background:#fed7d7; color:#c53030; }
      .badge-orange { background:#feebc8; color:#c05621; }
      .badge-green { background:#c6f6d5; color:#2f855a; }
      .badge-blue { background:#bee3f8; color:#2b6cb0; }
    `,
  },
  (status: Input<ResourceStatus | 'exception'>) => ({ status }),
  ({ status }) => {
    const [emoji, label, color] = STATUS_VIEW[status()];
    return span({ class: 'badge-container' }, [
      span({ class: 'status-emoji' }, emoji),
      span({ class: `badge badge-${color}` }, label),
    ]);
  },
);

export type StatusComponent = typeof StatusComponent;
