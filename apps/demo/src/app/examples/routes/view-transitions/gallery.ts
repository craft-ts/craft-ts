import {
  a,
  craftComponent,
  each,
  h2,
  header,
  li,
  p,
  span,
  ul,
} from '@craft-ng/component';
import {
  craftMethod,
  CraftRouter,
} from '@craft-ng/core';
import { PHOTOS } from './photos';

const ViewTransitionsGalleryComponent = craftComponent(
  'ViewTransitionsGalleryComponent',
  {
    styles: `
      .vt-intro{margin-bottom:1.75rem}.vt-grid{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:1.25rem}
      .vt-tile{display:grid;gap:.75rem;text-decoration:none;color:inherit}.vt-art{display:grid;place-items:center;aspect-ratio:4/3;border-radius:16px;box-shadow:0 12px 30px #0f172a2e}
      .vt-emoji{font-size:3rem}.vt-meta{display:grid;gap:.15rem}.vt-title{font-weight:700}.vt-subtitle{font-size:.85rem;color:#64748b}
    `,
  },
  function* () {
    const router = yield* CraftRouter(undefined, ({ navigate }) => ({
      navigate,
    })); // todo move directly on open
    const open = craftMethod('open', function* (photoId: string) {
      void router.navigate({
        to: 'view-transitions/:photoId',
        params: { photoId },
        viewTransition: { name: `photo-${photoId}`, image: null },
      });
    });
    return { open };
  },
  ({ open }) => [
    header({ class: 'vt-intro' }, [
      h2('View Transitions'),
      p('Click a tile to morph it into the detail hero.'),
    ]),
    ul(
      { class: 'vt-grid' },
      each(PHOTOS, { track: (photo) => photo.id }, (photo) =>
        li(
          a(
            {
              class: 'vt-tile',
              href: `/view-transitions/${photo.id}`,
              *click(event) {
                event.preventDefault();
                yield* open(photo.id);
              },
            },
            [
              span(
                {
                  class: 'vt-art',
                  style: {
                    background: photo.gradient,
                    viewTransitionName: `photo-${photo.id}`,
                  },
                },
                span({ class: 'vt-emoji' }, photo.emoji),
              ),
              span({ class: 'vt-meta' }, [
                span({ class: 'vt-title' }, photo.title),
                span({ class: 'vt-subtitle' }, photo.subtitle),
              ]),
            ],
          ),
        ),
      ),
    ),
  ],
);

export default ViewTransitionsGalleryComponent;
