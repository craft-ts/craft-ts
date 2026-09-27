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
import { projectionDemo } from './component-demos.style';

type CardInput = {
  readonly header?: ContentSlot;
  readonly body: RequiredContent<{
    readonly selector: {
      readonly tag: 'p';
      readonly 'data-projection': 'content';
    };
  }>;
};

export const { CardView, provideCardView } = craftService(
  { name: 'cardView', providedIn: 'toProvide' },
  (input: CardInput) => {
    return {
      header:
        input.header ??
        content(() =>
          heading({ class: projectionDemo.fallback }, 'Default title'),
        ),
      body: input.body,
    };
  },
);

export const card = craftComponent(
  'card',
  { providers: [provideCardView()] },
  function* (input: CardInput) {
    const { header, body } = yield* CardView(input);
    return section({ class: projectionDemo.card }, [
      renderContent('header', header),
      section({ class: projectionDemo.body }, renderContent('body', body)),
    ]);
  },
);
