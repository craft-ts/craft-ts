import {
  craftComponent,
  forNode,
  li,
  small,
  strong,
  ul,
  type Input,
} from '@craft-ts/component';
import type { Messages } from './messages';

export interface VisualAssetEntry {
  readonly evidence: string;
  readonly scenarios: readonly unknown[];
}

const scenarioCountText = (value: VisualAssetEntry): string =>
  `${value.scenarios.length} scenario${value.scenarios.length === 1 ? '' : 's'}`;

/** The flat list of visual-evidence assets, one row per screenshot family. */
export const AssetsInventoryList = craftComponent(
  'AssetsInventoryList',
  {},
  (assets: Input<readonly VisualAssetEntry[]>, t: Input<Messages>) => ({
    assets,
    t,
  }),
  ({ assets, t }) =>
    ul(
      { class: 'inventory-list' },
      forNode(
        assets,
        {
          track: (asset) => asset.evidence,
          empty: () =>
            li(function* () {
              return (yield* t()).noInventory;
            }),
        },
        (asset) =>
          li([
            strong(function* () {
              return (yield* asset()).evidence;
            }),
            small(function* () {
              return scenarioCountText(yield* asset());
            }),
          ]),
      ),
    ),
);
