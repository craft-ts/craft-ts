import {
  article,
  craftComponent,
  div,
  img,
  ifNode,
  safeResourceUrl,
  span,
  withComponentProviders,
  type Input,
} from '@craft-ts/component';
import {
  craftComputed,
  craftService,
  injectCraftViewTransition,
  type CraftServiceInput,
} from '@craft-ts/core';
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

const { PhotoSkeletonView, providePhotoSkeletonView } = craftService(
  { name: 'photoSkeletonView', providedIn: 'toProvide' },
  function* (inputs: {
    readonly $provided: { readonly photoId: CraftServiceInput<string> };
  }) {
    const rawViewTransition = injectCraftViewTransition();
    const viewTransition = yield* craftComputed('viewTransition', function* () {
      // The generic inject helper is an untyped transport boundary.
      const value = rawViewTransition();
      return isTransitionPayload(value) ? value : null;
    });
    yield* craftComputed('hasImage', function* () {
      return (yield* viewTransition())?.image !== null;
    });
    yield* craftComputed('imageSrc', function* () {
      return (yield* viewTransition())?.image ?? '';
    });
    yield* craftComputed('heroArt', function* () {
      return photoArt(yield* inputs.$provided.photoId());
    });
    yield* craftComputed('heroTransitionName', function* () {
      return photoTransitionName(yield* inputs.$provided.photoId());
    });
    yield* craftComputed('heroEmoji', function* () {
      return findPhoto(yield* inputs.$provided.photoId())?.emoji;
    });
  },
);

const ViewTransitionsSkeletonComponent = craftComponent(
  'ViewTransitionsSkeletonComponent',
  {},
  (_inputs: { readonly photoId: Input<string> }) => [
    span('← Back to gallery'),
    article({ class: vt.detail }, [
      span(
        {
          class: vt.hero,
          style: function* () {
            const { heroArt, heroTransitionName } = yield* PhotoSkeletonView();
            return {
              ...assign(vtPhoto.art, yield* heroArt()),
              ...assign(vtPhoto.name, yield* heroTransitionName()),
            };
          },
        },
        [
          ifNode(
            'hasImage',
            function* () {
              const { hasImage } = yield* PhotoSkeletonView();
              return yield* hasImage();
            },
            () =>
              img({
                class: vt.heroImage,
                src: function* () {
                  const { imageSrc } = yield* PhotoSkeletonView();
                  return safeResourceUrl(yield* imageSrc());
                },
                alt: '',
              }),
            () =>
              span({ class: vt.heroEmoji }, PhotoSkeletonView.heroEmoji),
          ),
        ],
      ),
      div({ class: vt.body }, [
        span({ class: vt.bar, 'data-testid': 'vt-bar' }),
        span({ class: vt.bar, 'data-testid': 'vt-bar' }),
        span({ class: vt.bar, 'data-testid': 'vt-bar' }),
      ]),
    ]),
  ],
).pipe(
  withComponentProviders(({ photoId }) => [
    providePhotoSkeletonView({ photoId }),
  ]),
);

export default ViewTransitionsSkeletonComponent;
