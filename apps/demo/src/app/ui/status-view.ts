import {
  craftService,
  craftComputed,
  type CraftResourceStatus,
  type CraftServiceInput,
} from '@craft-ts/core';
import { TONE_OF_STATUS } from './status.style';

const STATUS_VIEW = {
  idle: ['🛌', 'Idle'],
  error: ['❌', 'Error'],
  loading: ['⏳', 'Loading'],
  reloading: ['🔄', 'Reloading'],
  resolved: ['✅', 'Loaded'],
  local: ['📦', 'Local'],
  exception: ['⚠️', 'Exception'],
} satisfies Record<string, readonly [string, string]>;

export const { StatusView, provideStatusView } = craftService(
  { name: 'statusView', providedIn: 'toProvide' },
  function* (inputs: {
    readonly $provided: {
      readonly status: CraftServiceInput<CraftResourceStatus>;
    };
  }) {
    const { status } = inputs.$provided;
    yield* craftComputed('statusEmoji', function* () {
      return STATUS_VIEW[yield* status()][0];
    });
    yield* craftComputed('statusTone', function* () {
      return TONE_OF_STATUS[yield* status()];
    });
    yield* craftComputed('statusLabel', function* () {
      return STATUS_VIEW[yield* status()][1];
    });
  },
);
