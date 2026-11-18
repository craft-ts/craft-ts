import {
  a,
  craftComponent,
  forNode,
  header,
  li,
  p,
  span,
  ul,
  heading,
} from '@craft-ts/component';
import { CraftRouterLink } from '@craft-ts/core';
import { PHOTOS } from './photos';
import { assign } from '@craft-ts/style';
import {
  photoArt,
  photoTransitionName,
  vt,
  vtPhoto,
} from './view-transitions.style';
import { example } from '../../shared/example.style';

const GALLERY_PHOTOS = PHOTOS.map((photo) => ({
  ...photo,
  art: photoArt(photo.id),
  transitionName: photoTransitionName(photo.id),
}));

const ViewTransitionsGalleryComponent = craftComponent(
  'ViewTransitionsGalleryComponent',
  {},
  () => [
    header({ class: vt.intro }, [
      heading({ class: example.title }, 'View Transitions'),
      p('Click a tile to morph it into the detail hero.'),
    ]),
    ul(
      { class: vt.grid },
      forNode(GALLERY_PHOTOS, { track: (photo) => photo.id }, (photo) =>
        li(
          a('photo', { class: vt.tile }, [
            span(
              {
                class: vt.art,
                style: function* () {
                  const item = yield* photo();
                  return {
                    ...assign(vtPhoto.art, item.art),
                    ...assign(
                      vtPhoto.name,
                      item.transitionName,
                    ),
                  };
                },
              },
              span({ class: vt.emoji }, function* () {
                return (yield* photo()).emoji;
              }),
            ),
            span({ class: vt.meta }, [
              span({ class: vt.title }, function* () {
                return (yield* photo()).title;
              }),
              span({ class: vt.subtitle }, function* () {
                return (yield* photo()).subtitle;
              }),
            ]),
          ]).pipe(
            CraftRouterLink(function* () {
              return {
                to: 'view-transitions/:photoId',
                params: { photoId: (yield* photo()).id },
                viewTransition: {
                  name: `photo-${(yield* photo()).id}`,
                  image: null,
                },
              };
            }),
          ),
        ),
      ),
    ),
  ],
);

export default ViewTransitionsGalleryComponent;
