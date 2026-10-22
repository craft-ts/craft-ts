import { craftExpose, craftService, state } from '@craft-ts/core';

/**
 * The point of the timeline whose picture is open: hovered, or focused from the
 * keyboard. It lives here and not in the points' component: a component's body
 * runs again when what it reads changes, and a state declared in it starts over
 * each time — the picture would close the moment it opened.
 */
export const { ThumbnailPreview } = craftService(
  { name: 'thumbnailPreview', providedIn: 'global' },
  function* () {
    const openEntryIndex = yield* state(
      'openEntryIndex',
      undefined as number | undefined,
      ({ set }) => ({
        setOpen: (index: number | undefined) => set(index),
      }),
    );

    yield* craftExpose('show', function* (index: number | undefined) {
      yield* openEntryIndex.setOpen(index);
    });
  },
);
