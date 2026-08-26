/* eslint-disable craft-ts/no-hardcoded-design-values -- Demo UI colours are intentionally local to this example. */
import {
  Signal,
} from '@craft-ts/core';
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
import {
  craftComputed,
  injectCraftViewTransition,
} from '@craft-ts/core';
import { findPhoto, type Photo } from './photos';

type TransitionPayload = {
  readonly name: string;
  readonly image: string | null;
};

const photoGradient = (photo: Photo | undefined) =>
  photo?.gradient ?? '#e2e8f0';

const ViewTransitionsSkeletonComponent = craftComponent(
  'ViewTransitionsSkeletonComponent',
  {
    styles: `
      .vt-detail{display:grid;gap:1.75rem}.vt-hero{display:grid;place-items:center;aspect-ratio:4/3;border-radius:24px;background:#e2e8f0;overflow:hidden}
      .vt-hero-image{width:100%;height:100%;object-fit:cover}.vt-emoji{font-size:6rem}.vt-body{display:grid;gap:.85rem}.vt-bar{height:1rem;border-radius:.5rem;background:#e2e8f0}
      @media(min-width:720px){.vt-detail{grid-template-columns:minmax(0,380px) 1fr;align-items:center}}
    `,
  },
  (photoId: Input<string>) => {
    const viewTransition = injectCraftViewTransition() as unknown as Signal<
      TransitionPayload | null
    >;
    const hasImage = craftComputed(
      'hasImage',
      () =>
        viewTransition()?.image !== null &&
        viewTransition()?.image !== undefined,
    );
    const imageSrc = craftComputed(
      'imageSrc',
      () => viewTransition()?.image ?? '',
    );
    return { photoId, viewTransition, hasImage, imageSrc };
  },
  ({ photoId, hasImage, imageSrc }) => [
    span('← Back to gallery'),
    article({ class: 'vt-detail' }, [
      span(
        {
          class: 'vt-hero',
          style: function* () {
            return {
              background: photoGradient(findPhoto(yield* photoId())),
              viewTransitionName: `photo-${yield* photoId()}`,
            };
          },
        },
        [
          ifNode(
            hasImage,
            () =>
              img({
                class: 'vt-hero-image',
                src: function* () {
                  return safeResourceUrl(yield* imageSrc());
                },
                alt: '',
              }),
            () =>
              span({ class: 'vt-emoji' }, function* () {
                return findPhoto(yield* photoId())?.emoji;
              }),
          ),
        ],
      ),
      div({ class: 'vt-body' }, [
        span({ class: 'vt-bar' }),
        span({ class: 'vt-bar' }),
        span({ class: 'vt-bar' }),
      ]),
    ]),
  ],
);

export default ViewTransitionsSkeletonComponent;
