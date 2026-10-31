import {
  craftComponent,
  div,
  heading,
  headingRoot,
} from '@craft-ts/component';
import { craftComputed } from '@craft-ts/core';
import { ui } from './dashboard.style';
import { ReplayHead } from './replay-head';
import { ReplayNotices } from './replay-notices';
import { ReplaySidePanel } from './replay-side-panel';
import { ReplayPlaybar, ReplayStage } from './replay-stage';
import { ReplayRoute } from './replay-route.service';
import { page, replayState } from './replay-state';

/** Page 2: the replay of one session, with its journal at the side. */
export const ReplayPage = craftComponent('ReplayPage', {}, function* () {
  const route = yield* ReplayRoute();
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
      headingRoot([heading('Replay'), ReplayHead({})]),
      div({ class: ui.workspace }, [
        div({ class: ui.main }, [
          ReplayNotices({}),
          ReplayStage({
            retryThumbnails: route.retryThumbnails,
          }),
          ReplayPlaybar({}),
        ]),
        ReplaySidePanel({}),
      ]),
    ],
  );
});
