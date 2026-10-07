import {
  a,
  craftComponent,
  li,
  nav,
  p,
  ul,
  type CraftNodeChild,
  type Input,
} from '@craft-ts/component';
import type { Outline } from '../markdown/tree.ts';
import { outlineUi } from './nav.style.ts';

export interface OutlineInput {
  readonly entries: Input<readonly Outline[]>;
  /** The id of the heading in view. Empty when none is. */
  readonly current: Input<string>;
  /** Named `heading`, not `title`: an input named like an HTML attribute is
   * swallowed as the host's attribute and shifts every input after it. */
  readonly heading: Input<string>;
}

/**
 * "On this page": the `h2` and `h3` of the page, from `parsePage().outline`.
 * The heading in view is `aria-current="true"`; who decides which one is in
 * view is the layout, so this component stays a pure function of its inputs.
 */
export const DocOutline = craftComponent('DocOutline', {}, function* (
  input: OutlineInput,
) {
  const entries = yield* input.entries();
  const current = yield* input.current();
  const heading = yield* input.heading();

  const items = entries.map(
    (entry): CraftNodeChild =>
      li([
        a(
          'docOutlineLink',
          {
            class: outlineUi.link,
            href: `#${entry.id}`,
            ...(entry.id === current ? { 'aria-current': 'true' as const } : {}),
            ...(entry.level > 2 ? { 'data-nested': 'true' } : {}),
          },
          entry.text,
        ),
      ]),
  );
  return nav({ class: outlineUi.root, 'aria-label': heading }, [
    p({ class: outlineUi.title }, heading),
    ul({ class: outlineUi.list }, items),
  ]);
});
