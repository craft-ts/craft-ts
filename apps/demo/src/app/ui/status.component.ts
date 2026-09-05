import { craftComponent, span, type Input } from '@craft-ts/component';
import type { CraftResourceStatus } from '@craft-ts/core';
import { status as styles, TONE_OF_STATUS } from './status.style';

const STATUS_VIEW = {
  idle: ['🛌', 'Idle'],
  error: ['❌', 'Error'],
  loading: ['⏳', 'Loading'],
  reloading: ['🔄', 'Reloading'],
  resolved: ['✅', 'Loaded'],
  local: ['📦', 'Local'],
  exception: ['⚠️', 'Exception'],
} satisfies Record<string, readonly [string, string]>;

/**
 * The witness component for level 1.
 *
 * What changed, and why it matters more than the CSS moving house:
 *
 * - The `styles` block is gone. The rules are emitted once at build time and
 *   deduplicated with every other component's, so nothing here injects CSS at
 *   runtime and nothing here can write an invalid declaration.
 * - The class is **static**. It used to be `` `badge badge-${colour}` ``, a
 *   string assembled per render, which meant the set of visual states was not
 *   something anyone could enumerate. It is now one class plus a `data-status`
 *   attribute, and the five tones are five rules the emitter already knows
 *   about — which is what will let the matrix count them in wave 2.
 */
export const StatusComponent = craftComponent(
  'StatusComponent',
  {},
  (status: Input<CraftResourceStatus>) => ({ status }),
  ({ status: resourceStatus }) =>
    span({ class: styles.container }, [
      span({ class: styles.emoji }, function* () {
        return STATUS_VIEW[yield* resourceStatus()][0];
      }),
      span(
        {
          class: styles.badge,
          'data-status': function* () {
            return TONE_OF_STATUS[yield* resourceStatus()];
          },
        },
        function* () {
          return STATUS_VIEW[yield* resourceStatus()][1];
        },
      ),
    ]),
);

export type StatusComponent = typeof StatusComponent;
