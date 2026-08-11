import type { Signal } from '@angular/core';
import {
  article,
  craftComponent,
  div,
  img,
  ifBlock,
  span,
  type Input,
} from '@craft-ng/component';
import {
  craftComputed,
  injectCraftViewTransition,
} from '@craft-ng/core';
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
    const viewTransition = injectCraftViewTransition() as Signal<
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
  ({ photoId, hasImage, imageSrc }) => {
    const heroContent = ifBlock(
      hasImage,
      () =>
        img({
          class: 'vt-hero-image',
          src: imageSrc,
          alt: '',
        }),
      () => span({ class: 'vt-emoji' }, () => findPhoto(photoId())?.emoji),
    );
    return [
      span('← Back to gallery'),
      article({ class: 'vt-detail' }, [
        span(
          {
            class: 'vt-hero',
            style: () => ({
              background: photoGradient(findPhoto(photoId())),
              viewTransitionName: `photo-${photoId()}`,
            }),
          },
          [heroContent],
        ),
        div({ class: 'vt-body' }, [
          span({ class: 'vt-bar' }),
          span({ class: 'vt-bar' }),
          span({ class: 'vt-bar' }),
        ]),
      ]),
    ];
  },
);

export default ViewTransitionsSkeletonComponent;
