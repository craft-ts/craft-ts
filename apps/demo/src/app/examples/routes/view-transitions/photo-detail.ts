/* eslint-disable craft-ts/no-hardcoded-design-values -- Demo UI colours are intentionally local to this example. */
import {
  a,
  article,
  craftComponent,
  div,
  ifNode,
  p,
  span,
  type Input,
  heading,
} from '@craft-ts/component';
import { craftComputed, CraftRouterLink } from '@craft-ts/core';
import { findPhoto, type Photo } from './photos';

const MISSING_PHOTO: Photo = {
  id: '__missing__',
  title: '',
  subtitle: '',
  description: '',
  emoji: '',
  gradient: 'transparent',
};

const ViewTransitionsDetailComponent = craftComponent(
  'ViewTransitionsDetailComponent',
  {
    styles: `
      .vt-back{display:inline-block;margin-bottom:1.5rem;color:#2563eb;text-decoration:none;font-weight:600}.vt-detail{display:grid;gap:1.75rem}
      .vt-hero{display:grid;place-items:center;aspect-ratio:4/3;border-radius:24px;box-shadow:0 24px 60px #0f172a40}.vt-hero .emoji{font-size:6rem}
      @media(min-width:720px){.vt-detail{grid-template-columns:minmax(0,380px) 1fr;align-items:center}}
    `,
  },
  function* (photoId: Input<string>) {
    const currentPhoto = craftComputed('currentPhoto', function* () {
      return findPhoto(yield* photoId()) ?? MISSING_PHOTO;
    });
    const hasPhoto = craftComputed('hasPhoto', function* () {
      return (yield* currentPhoto()).id !== MISSING_PHOTO.id;
    });
    const currentPhotoTitle = craftComputed('currentPhotoTitle', function* () {
      return (yield* currentPhoto()).title;
    });
    return { photoId, currentPhoto, currentPhotoTitle, hasPhoto };
  },
  ({ photoId, currentPhoto, currentPhotoTitle, hasPhoto }) => {
    return [
      a(
        'back',
        {
          class: 'vt-back',
        },
        '← Back to gallery',
      ).pipe(CraftRouterLink({ to: 'view-transitions' })),
      ifNode(
        hasPhoto,
        () =>
          article({ class: 'vt-detail' }, [
            span(
              {
                class: 'vt-hero',
                style: function* () {
                  return {
                    background: (yield* currentPhoto()).gradient,
                    viewTransitionName: `photo-${(yield* currentPhoto()).id}`,
                  };
                },
              },
              span({ class: 'emoji' }, function* () {
                return (yield* currentPhoto()).emoji;
              }),
            ),
            div([
              p(function* () {
                return (yield* currentPhoto()).subtitle;
              }),
              heading(currentPhotoTitle),
              p(function* () {
                return (yield* currentPhoto()).description;
              }),
            ]),
          ]),
        () =>
          p(function* () {
            return `No artwork matches “${yield* photoId()}”.`;
          }),
      ),
    ];
  },
);

export default ViewTransitionsDetailComponent;
