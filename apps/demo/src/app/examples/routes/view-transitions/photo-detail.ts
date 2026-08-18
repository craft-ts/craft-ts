/* eslint-disable craft-ng/no-hardcoded-design-values -- Demo UI colours are intentionally local to this example. */
import {
  a,
  article,
  craftComponent,
  div,
  ifBlock,
  p,
  span,
  type Input,
  heading,
} from '@craft-ng/component';
import { craftComputed, craftMethod, CraftRouter } from '@craft-ng/core';
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
    const router = yield* CraftRouter(undefined, ({ navigate }) => ({
      navigate,
    }));
    const back = craftMethod('back', function* () {
      void router.navigate({ to: 'view-transitions' });
    });
    const currentPhoto = craftComputed('currentPhoto', function* () {
      return findPhoto(yield* photoId()) ?? MISSING_PHOTO;
    });
    const hasPhoto = craftComputed('hasPhoto', function* () {
      return (yield* currentPhoto()).id !== MISSING_PHOTO.id;
    });
    return { photoId, back, currentPhoto, hasPhoto };
  },
  ({ photoId, back, currentPhoto, hasPhoto }) => {
    return [
      a('back',
        {
          class: 'vt-back',
          href: '/view-transitions',
          *click(event: MouseEvent) {
            event.preventDefault();
            yield* back();
          },
        },
        '← Back to gallery',
      ),
      ifBlock(
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
              heading(function* () {
                return (yield* currentPhoto()).title;
              }),
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
