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
import { assign } from '@craft-ts/style';
import {
  photoArt,
  photoTransitionName,
  vt,
  vtPhoto,
} from './view-transitions.style';
import { example } from '../../shared/example.style';

const MISSING_PHOTO: Photo = {
  id: '__missing__',
  title: '',
  subtitle: '',
  description: '',
  emoji: '',
};

const ViewTransitionsDetailComponent = craftComponent(
  'ViewTransitionsDetailComponent',
  {},
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
    const currentArt = craftComputed('currentArt', function* () {
      return photoArt((yield* currentPhoto()).id);
    });
    const currentTransitionName = craftComputed(
      'currentTransitionName',
      function* () {
        return photoTransitionName((yield* currentPhoto()).id);
      },
    );
    return {
      photoId,
      currentPhoto,
      currentPhotoTitle,
      hasPhoto,
      currentArt,
      currentTransitionName,
    };
  },
  ({
    photoId,
    currentPhoto,
    currentPhotoTitle,
    hasPhoto,
    currentArt,
    currentTransitionName,
  }) => {
    return [
      a(
        'back',
        {
          class: vt.back,
          'data-testid': 'vt-back',
        },
        '← Back to gallery',
      ).pipe(CraftRouterLink({ to: 'view-transitions' })),
      ifNode(
        hasPhoto,
        () =>
          article({ class: vt.detail }, [
            span(
              {
                class: vt.hero,
                style: function* () {
                  return {
                    ...assign(vtPhoto.art, yield* currentArt()),
                    ...assign(vtPhoto.name, yield* currentTransitionName()),
                  };
                },
              },
              span({ class: vt.heroEmoji }, function* () {
                return (yield* currentPhoto()).emoji;
              }),
            ),
            div({ class: vt.body }, [
              p({ class: vt.subtitle }, function* () {
                return (yield* currentPhoto()).subtitle;
              }),
              heading({ class: example.title }, currentPhotoTitle),
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
