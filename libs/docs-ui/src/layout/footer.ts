import {
  a,
  craftComponent,
  div,
  footer,
  p,
  type CraftNodeChild,
  type Input,
} from '@craft-ts/component';
import { DocForest } from '../decor/decor.ts';
import { footerUi } from './footer.style.ts';

export interface FooterLink {
  readonly text: string;
  readonly href: string;
}

export interface FooterInput {
  readonly note: Input<string>;
  readonly links: Input<readonly FooterLink[]>;
}

/** Links and a note, with the forest along the bottom edge. */
export const DocFooter = craftComponent('DocFooter', {}, function* (
  props: FooterInput,
) {
  const note = yield* props.note();
  const links = yield* props.links();
  const items = links.map(
    (link): CraftNodeChild =>
      a({ class: footerUi.link, href: link.href }, link.text),
  );
  return footer({ class: footerUi.root }, [
    div({ class: footerUi.content }, [
      p({ class: footerUi.note }, note),
      div({ class: footerUi.links }, items),
    ]),
    div({ class: footerUi.forest }, [DocForest({})]),
  ]);
});
