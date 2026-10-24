import { craftComponent, div, headingRoot } from '@craft-ts/component';
import { craftComputed } from '@craft-ts/core';
import { ui } from './dashboard.style';
import { ReplayHead } from './replay-head';
import { ReplayNotices } from './replay-notices';
import { ReplaySidePanel } from './replay-side-panel';
import { ReplayPlaybar, ReplayStage } from './replay-stage';
import { page, replayState } from './replay-state';

/** Page 2: the replay of one session, with its journal at the side. */
export const ReplayPage = craftComponent('ReplayPage', {}, function* () {
  const pageIsHidden = yield* craftComputed(
    'pageIsHidden',
    () => page() !== 'detail',
  );
  return div(
    {
      class: ui.page,
      'data-lab': 'detail-page',
      'data-replay-state': function* () {
        return replayState();
      },
      hidden: pageIsHidden,
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
  );
});
