import { craftService } from '@craft-ts/core';
import {
  content,
  craftComponent,
  heading,
  renderContent,
  section,
  type ContentSlot,
  type RequiredContent,
} from '@craft-ts/component';

type CardInput = {
  readonly header?: ContentSlot;
  readonly body: RequiredContent<{
    readonly selector: {
      readonly tag: 'p';
      readonly class: 'projection-demo__content';
    };
  }>;
};

const { CardView, provideCardView } = craftService(
  { name: 'cardView', providedIn: 'toProvide' },
  (input: CardInput) => {
    return {
      header:
        input.header ??
        content(() =>
          heading({ class: 'projection-demo__fallback' }, 'Default title'),
        ),
      body: input.body,
    };
  },
);

export const card = craftComponent(
  'card',
  {
    providers: [provideCardView()],
    contentStyles: {
      header: ':scope { display: block; margin-block-end: 0.5rem; }',
      body: ':scope { display: block; color: #334155; }',
    },
  },
  function* (input: CardInput) {
    const { header, body } = yield* CardView(input);
    return section({ class: 'projection-demo__card' }, [
      renderContent('header', header),
      section({ class: 'projection-demo__body' }, renderContent('body', body)),
    ]);
  },
);
