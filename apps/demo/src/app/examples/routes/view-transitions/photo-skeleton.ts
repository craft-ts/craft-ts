import type { Signal } from '@angular/core';
import {
  article,
  craftComponent,
  div,
  img,
  span,
  type Input,
} from '@craft-ng/component';
import {
  injectCraftViewTransition,
} from '@craft-ng/core';
import { findPhoto } from './photos';

type TransitionPayload = {
  readonly name: string;
  readonly image: string | null;
};

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
    return { photoId, viewTransition };
  },
  ({ photoId, viewTransition }) => {
    const photo = findPhoto(photoId());
    const image = viewTransition()?.image;
    const heroContent = image
      ? img({ class: 'vt-hero-image', src: image, alt: '' })
      : span({ class: 'vt-emoji' }, photo?.emoji ?? '');
    return [
      span('← Back to gallery'),
      article({ class: 'vt-detail' }, [
        span(
          {
            class: 'vt-hero',
            style: {
              background: photo?.gradient ?? '#e2e8f0',
              viewTransitionName: `photo-${photoId()}`,
            },
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
