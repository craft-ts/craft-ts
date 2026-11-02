import {
  content,
  craftComponent,
  div,
  heading,
  headingRoot,
} from '@craft-ts/component';
import { craftComputed, rawReactiveValue } from '@craft-ts/core';
import { ui } from '../../shared/ui/dashboard.style';
import { ReplayHead, replaySessionTitle } from './replay-head';
import { ReplayNotices } from './replay-notices';
import { ReplayRail, ReplaySidePanel } from './side-panel/replay-side-panel';
import { ReplayPlaybar, ReplayStage } from './stage/replay-stage';
import { ReplayRoute } from '../../shared/state/replay-route.service';
import { page, replayState, routeSessionId, session } from '../../shared/state/replay-state';
import { SessionArchive } from '../../shared/data-access/session-archive.service';
import { ResumeDialog } from './resume-dialog';

/**
 * Page 2: the replay of one session. The head says which one and opens the
 * live app at the moment shown; the stage and its timeline take the rest; the
 * rail at the edge opens the journal, the gaps, the resumes and the details.
 */
export const ReplayPage = craftComponent('ReplayPage', {}, function* () {
  const route = yield* ReplayRoute();
  const archive = yield* SessionArchive();
  const savedSessions = rawReactiveValue(archive.savedSessions);
  const titleText = yield* craftComputed('titleText', () =>
    replaySessionTitle(
      savedSessions().find((item) => item.id === routeSessionId()),
      session(),
    ),
  );
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
      // The session's name is the page's own title: it starts the outline at `h1`.
      headingRoot([
        ReplayHead({
          pageTitle: content(() => heading({ class: ui.headName }, titleText)),
        }),
      ]),
      div({ class: ui.workspace }, [
        div({ class: ui.main }, [
          ReplayNotices({}),
          ReplayStage({
            retryThumbnails: route.retryThumbnails,
          }),
          ReplayPlaybar({}),
        ]),
        headingRoot([ReplaySidePanel({})]),
        ReplayRail({}),
      ]),
      ResumeDialog({}),
    ],
  );
});
