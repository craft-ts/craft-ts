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

export const card = craftComponent(
  'card',
  {},
  (input: CardInput) => ({
    header:
      input.header ??
      content(() =>
        heading({ class: projectionDemo.fallback }, 'Default title'),
      ),
    body: input.body,
  }),
  ({ header, body }) =>
    section({ class: projectionDemo.card }, [
      renderContent('header', header),
      section({ class: projectionDemo.body }, renderContent('body', body)),
    ]),
);
