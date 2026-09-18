import { craftService } from '@craft-ts/core';
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
export const { AssetsInventoryListView, provideAssetsInventoryListView } =
  craftService(
    { name: 'assetsInventoryListView', providedIn: 'toProvide' },
    (inputs: {
      readonly assets: Input<readonly VisualAssetEntry[]>;
      readonly t: Input<Messages>;
    }) => {
      const { assets, t } = inputs;
      return {
        assets,
        t,
      };
    },
  );

export const AssetsInventoryList = craftComponent(
  'AssetsInventoryList',
  { providers: [provideAssetsInventoryListView()] },
  function* (inputs: {
    readonly assets: Input<readonly VisualAssetEntry[]>;
    readonly t: Input<Messages>;
  }) {
    const { assets, t } = yield* AssetsInventoryListView(inputs);
    return ul(
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
    );
  },
);
