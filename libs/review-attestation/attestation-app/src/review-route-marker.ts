import { craftComponent, div } from '@craft-ts/component';

/** Matches review-section paths; the root review component renders the view. */
export const ReviewRouteMarker = craftComponent(
  'ReviewRouteMarker',
  {},
  () => ({}),
  () => div({ hidden: true, 'aria-hidden': 'true' }),
);
