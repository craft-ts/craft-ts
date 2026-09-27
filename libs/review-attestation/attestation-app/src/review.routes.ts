import { loadCraftComponent } from '@craft-ts/component';
import {
  assertExhaustiveRouteExceptions,
  craftRoutes,
  type CanRun,
  type ValidateCascadeRoutesFile,
} from '@craft-ts/core';

const loadReviewRouteMarker = () =>
  loadCraftComponent(({ withRetry }) =>
    withRetry(import('./review-route-marker')).then(
      ({ ReviewRouteMarker }) => ReviewRouteMarker,
    ),
  );

/** The review sections exposed as stable, refreshable hash routes. */
export const { reviewRoutes } = craftRoutes('review', [
  {
    path: '',
    ...loadReviewRouteMarker(),
  },
  {
    path: 'application',
    ...loadReviewRouteMarker(),
  },
  {
    path: 'assets',
    ...loadReviewRouteMarker(),
  },
  {
    path: 'visual',
    ...loadReviewRouteMarker(),
  },
  {
    path: 'template',
    ...loadReviewRouteMarker(),
  },
  {
    path: 'folder-layout',
    ...loadReviewRouteMarker(),
  },
  {
    path: 'bypasses',
    ...loadReviewRouteMarker(),
  },
  {
    path: 'review',
    ...loadReviewRouteMarker(),
  },
]);

assertExhaustiveRouteExceptions(reviewRoutes);

type _CheckReviewDI = ValidateCascadeRoutesFile<
  never,
  never,
  typeof reviewRoutes
>;
type _CanRunReview = CanRun<_CheckReviewDI>;
