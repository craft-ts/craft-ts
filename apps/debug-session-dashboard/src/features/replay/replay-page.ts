import {
  content,
  craftComponent,
  type CraftComponent,
  type CraftNodeChildren,
  div,
  heading,
  headingRoot,
  type Input,
} from '@craft-ts/component';
import { ReplayRoute } from '../../shared/state/replay-route.service';
import { ReplayState } from '../../shared/state/replay-state';
import { ui } from '../../shared/ui/dashboard.style';
import { ReplayHead } from './replay-head';
import { ReplayNotices } from './replay-notices';
import { ReplayPageViewModel } from './replay-page-view-model.service';
import { ResumeDialog } from './resume-dialog';
import { ReplayRail, ReplaySidePanel } from './side-panel/replay-side-panel';
import { ReplayPlaybar, ReplayStage } from './stage/replay-stage';

function replayPageChildren(
  titleText: Input<string>,
  retryThumbnails: Input<() => void>,
): CraftNodeChildren {
  return [
    headingRoot([
      ReplayHead({
        pageTitle: content(() => heading({ class: ui.headName }, titleText)),
      }),
    ]),
    div({ class: ui.workspace }, [
      div({ class: ui.main }, [
        ReplayNotices({}),
        ReplayStage({
          retryThumbnails: function* () {
            return yield* retryThumbnails();
          },
        }),
        ReplayPlaybar({}),
      ]),
      headingRoot([ReplaySidePanel({})]),
      ReplayRail({}),
    ]),
    ResumeDialog({}),
  ];
}

/**
 * Page 2: the replay of one session. The head says which one and opens the
 * live app at the moment shown; the stage and its timeline take the rest; the
 * rail at the edge opens the journal, the gaps, the resumes and the details.
 */
// The explicit boundary avoids a TS2589 in this composed page template.
// eslint-disable-next-line craft-ts/no-craft-component-return-type
export const ReplayPage: CraftComponent = craftComponent(
  'ReplayPage',
  {},
  function* () {
    // This page fans the active replay state into child panels and the title slot.
    // eslint-disable-next-line craft-ts/no-component-service-binding
    const view = yield* ReplayPageViewModel();
    // eslint-disable-next-line craft-ts/no-component-service-binding
    const route = yield* ReplayRoute();
    return div(
      {
        class: ui.page,
        'data-lab': 'detail-page',
        'data-replay-state': function* () {
          return yield* (yield* ReplayState()).imperative.replayState();
        },
        hidden: view.pageIsHidden,
      },
      replayPageChildren(view.titleText, function* () {
        return route.retryThumbnails;
      }),
    );
  },
);
