import {
  a,
  article,
  craftComponent,
  div,
  ifNode,
  p,
  span,
  withComponentProviders,
  type Input,
  heading,
} from '@craft-ts/component';
import {
  craftComputed,
  craftService,
  CraftRouterLink,
  type CraftServiceInput,
} from '@craft-ts/core';
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

const { PhotoDetailView, providePhotoDetailView } = craftService(
  { name: 'photoDetailView', providedIn: 'toProvide' },
  function* (inputs: {
    readonly $provided: { readonly photoId: CraftServiceInput<string> };
  }) {
    const currentPhoto = yield* craftComputed('currentPhoto', function* () {
      return findPhoto(yield* inputs.$provided.photoId()) ?? MISSING_PHOTO;
    });
    yield* craftComputed('hasPhoto', function* () {
      return (yield* currentPhoto()).id !== MISSING_PHOTO.id;
    });
    yield* craftComputed('currentPhotoTitle', function* () {
      return (yield* currentPhoto()).title;
    });
    yield* craftComputed('currentArt', function* () {
      return photoArt((yield* currentPhoto()).id);
    });
    yield* craftComputed('currentTransitionName', function* () {
      return photoTransitionName((yield* currentPhoto()).id);
    });
    yield* craftComputed('noPhotoMessage', function* () {
      return `No artwork matches “${yield* inputs.$provided.photoId()}”.`;
    });
  },
);

const ViewTransitionsDetailComponent = craftComponent(
  'ViewTransitionsDetailComponent',
  {},
  (_inputs: { readonly photoId: Input<string> }) => [
    a(
      'back',
      {
        class: vt.back,
        'data-testid': 'vt-back',
      },
      '← Back to gallery',
    ).pipe(CraftRouterLink({ to: 'view-transitions' })),
    ifNode(
      'hasPhoto',
      function* () {
        const { hasPhoto } = yield* PhotoDetailView();
        return yield* hasPhoto();
      },
      () =>
        article({ class: vt.detail }, [
          span(
            {
              class: vt.hero,
              style: function* () {
                const { currentArt, currentTransitionName } =
                  yield* PhotoDetailView();
                return {
                  ...assign(vtPhoto.art, yield* currentArt()),
                  ...assign(vtPhoto.name, yield* currentTransitionName()),
                };
              },
            },
            span({ class: vt.heroEmoji }, function* () {
              const { currentPhoto } = yield* PhotoDetailView();
              return (yield* currentPhoto()).emoji;
            }),
          ),
          div({ class: vt.body }, [
            p({ class: vt.subtitle }, function* () {
              const { currentPhoto } = yield* PhotoDetailView();
              return (yield* currentPhoto()).subtitle;
            }),
            heading({ class: example.title }, function* () {
              const { currentPhotoTitle } = yield* PhotoDetailView();
              return yield* currentPhotoTitle();
            }),
            p(function* () {
              const { currentPhoto } = yield* PhotoDetailView();
              return (yield* currentPhoto()).description;
            }),
          ]),
        ]),
      () =>
        p(PhotoDetailView.noPhotoMessage),
    ),
  ],
).pipe(
  withComponentProviders(({ photoId }) => [
    providePhotoDetailView({ photoId }),
  ]),
);

export default ViewTransitionsDetailComponent;
