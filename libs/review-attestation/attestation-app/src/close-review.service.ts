import {
  CraftHttpClient,
  craftComputed,
  craftMethod,
  craftService,
  mutation,
  source$,
  craftUse,
  craftExpose,
} from '@craft-ts/core';
import type { ReviewCloseResponse } from '@craft-ts/style-testing/review';

/**
 * Closing the review session: its own request counter, its own mutation.
 *
 * Unlike `decision`, `regenerate`, and `iterationHandoff`, nothing reacts to
 * this mutation through `insertReactOnMutation` on the page's `review`
 * query — closing the session does not change the queue — so it carries no
 * cross-file coupling and is free to live in its own file.
 */
export const { CloseReview } = craftService(
  { name: 'CloseReview', providedIn: 'global' },
  function* () {
    let closeReviewRequest = 0;
    const closeReviewRequested$ = source$<number>('closeReviewRequested$');

    const closeReview = yield* mutation(
      'closeReview',
      {
        method: closeReviewRequested$.value,
        loader: function* () {
          return yield* CraftHttpClient.post(({ response }) => ({
            url: '/api/close-review',
            payload: {},
            success: response<ReviewCloseResponse>(),
          }));
        },
      },
      ({ hasException }) => ({
        failed: craftUse(craftComputed('failed', function* () {
          return yield* hasException();
        })),
      }),
    );

    yield* craftMethod(
      'closeReviewSession',
      function* () {
        closeReviewRequested$.emit(++closeReviewRequest);
      },
    );

    yield* craftExpose('closeReviewFailed', closeReview.failed);
  },
);
