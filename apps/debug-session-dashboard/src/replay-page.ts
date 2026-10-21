import { craftComponent, div, headingRoot } from '@craft-ts/component';
import { ɵcomputed as computed } from '@craft-ts/core';
import { ui } from './dashboard.style';
import { ReplayHead } from './replay-head';
import { ReplayNotices } from './replay-notices';
import { ReplaySidePanel } from './replay-side-panel';
import { ReplayPlaybar, ReplayStage } from './replay-stage';
import { page } from './replay-state';

/** Page 2: the replay of one session, with its journal at the side. */
export const ReplayPage = craftComponent('ReplayPage', {}, () =>
  div(
    {
      class: ui.page,
      'data-lab': 'detail-page',
      hidden: computed(() => page() !== 'detail'),
    },
    [
      // The title is the page's own: it starts the outline at `h1` again.
      headingRoot([ReplayHead({})]),
      div({ class: ui.workspace }, [
        div({ class: ui.main }, [
          ReplayNotices({}),
          ReplayStage({}),
          ReplayPlaybar({}),
        ]),
        ReplaySidePanel({}),
      ]),
    ],
  ),
);
