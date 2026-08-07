import {
  a,
  article,
  craftComponent,
  div,
  h2,
  ifBlock,
  p,
  span,
  type Input,
} from '@craft-ng/component';
import {
  craftComputed,
  craftMethod,
  CraftRouter,
} from '@craft-ng/core';
import { findPhoto } from './photos';

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
    const hasPhoto = craftComputed(
      'hasPhoto',
      () => findPhoto(photoId()) !== undefined,
    );
    return { photoId, back, hasPhoto };
  },
  ({ photoId, back, hasPhoto }) => {
    return [
      a(
        {
          class: 'vt-back',
          href: '/view-transitions',
          click: (event) => {
            event.preventDefault();
            void back();
          },
        },
        '← Back to gallery',
      ),
      ifBlock(
        hasPhoto,
        () => {
          const photo = findPhoto(photoId()) as NonNullable<
            ReturnType<typeof findPhoto>
          >;
          return article({ class: 'vt-detail' }, [
            span(
              {
                class: 'vt-hero',
                style: {
                  background: photo.gradient,
                  viewTransitionName: `photo-${photo.id}`,
                },
              },
              span({ class: 'emoji' }, photo.emoji),
            ),
            div([p(photo.subtitle), h2(photo.title), p(photo.description)]),
          ]);
        },
        () => p(`No artwork matches “${photoId()}”.`),
      ),
    ];
  },
);

export default ViewTransitionsDetailComponent;
