import {
  craftComponent,
  span,
  withComponentProviders,
  type Input,
} from '@craft-ts/component';
import { type CraftResourceStatus } from '@craft-ts/core';
import { status as styles } from './status.style';
import { StatusView, provideStatusView } from './status-view';

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
  (_inputs: { readonly status: Input<CraftResourceStatus> }) =>
    span({ class: styles.container }, [
      span({ class: styles.emoji }, StatusView.statusEmoji),
      span(
        {
          class: styles.badge,
          'data-status': StatusView.statusTone,
        },
        StatusView.statusLabel,
      ),
    ]),
).pipe(withComponentProviders(({ status }) => [provideStatusView({ status })]));

export type StatusComponent = typeof StatusComponent;
