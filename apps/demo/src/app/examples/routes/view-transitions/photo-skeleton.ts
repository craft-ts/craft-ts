import {
  article,
  craftComponent,
  div,
  img,
  ifNode,
  safeResourceUrl,
  span,
  type Input,
} from '@craft-ts/component';
import { craftComputed, injectCraftViewTransition } from '@craft-ts/core';
import { findPhoto } from './photos';
import { assign } from '@craft-ts/style';
import {
  photoArt,
  photoTransitionName,
  vt,
  vtPhoto,
} from './view-transitions.style';

type TransitionPayload = {
  readonly name: string;
  readonly image: string | null;
};

function isTransitionPayload(value: unknown): value is TransitionPayload {
  return (
    value !== null &&
    typeof value === 'object' &&
    'name' in value &&
    typeof value.name === 'string' &&
    'image' in value &&
    (value.image === null || typeof value.image === 'string')
  );
}

const ViewTransitionsSkeletonComponent = craftComponent(
  'ViewTransitionsSkeletonComponent',
  {},
  function* ({ photoId }: { readonly photoId: Input<string> }) {
    const rawViewTransition = injectCraftViewTransition();
    const viewTransition = yield* craftComputed('viewTransition', function* () {
      // The generic inject helper is an untyped transport boundary.
      const value = rawViewTransition();
      return isTransitionPayload(value) ? value : null;
    });
    const hasImage = yield* craftComputed('hasImage', function* () {
      return (yield* viewTransition())?.image !== null;
    });
    const imageSrc = yield* craftComputed('imageSrc', function* () {
      return (yield* viewTransition())?.image ?? '';
    });
    const heroArt = yield* craftComputed('heroArt', function* () {
      return photoArt(yield* photoId());
    });
    const heroTransitionName = yield* craftComputed(
      'heroTransitionName',
      function* () {
        return photoTransitionName(yield* photoId());
      },
    );
    const heroEmoji = yield* craftComputed('heroEmoji', function* () {
      return findPhoto(yield* photoId())?.emoji;
    });
    return [
      span('← Back to gallery'),
      article({ class: vt.detail }, [
        span(
          {
            class: vt.hero,
            style: function* () {
              return {
                ...assign(vtPhoto.art, yield* heroArt()),
                ...assign(vtPhoto.name, yield* heroTransitionName()),
              };
            },
          },
          [
            ifNode(
              hasImage,
              () =>
                img({
                  class: vt.heroImage,
                  src: function* () {
                    return safeResourceUrl(yield* imageSrc());
                  },
                  alt: '',
                }),
              () => span({ class: vt.heroEmoji }, heroEmoji),
            ),
          ],
        ),
        div({ class: vt.body }, [
          span({ class: vt.bar, 'data-testid': 'vt-bar' }),
          span({ class: vt.bar, 'data-testid': 'vt-bar' }),
          span({ class: vt.bar, 'data-testid': 'vt-bar' }),
        ]),
      ]),
    ];
  },
);

export default ViewTransitionsSkeletonComponent;
