import {
  craftComponent,
  figcaption,
  figure,
  h,
  img,
  p,
  section,
  span,
  strong,
  type Input,
} from '@craft-ts/component';
import { withBase } from '@craft-ts/docs-ui';
import { authorNoteUi } from './author-note.style.ts';

export interface AuthorNoteInput {
  readonly base: Input<string>;
}

/** A note from the author: what the project is for, in their own words. */
export const AuthorNote = craftComponent('AuthorNote', {}, function* (
  input: AuthorNoteInput,
) {
  const base = yield* input.base();
  return section({ class: authorNoteUi.root, 'aria-label': 'A note from the author' }, [
    span({ class: authorNoteUi.frame }, [
      img({
        class: authorNoteUi.photo,
        src: withBase(base, '/assets/romain-geffrault-original.png'),
        alt: 'Romain Geffrault, creator of @craft-ts',
        width: 132,
        height: 132,
      }),
    ]),
    figure({ class: authorNoteUi.body }, [
      h('blockquote', { class: authorNoteUi.quote }, [
        p(
          'I built @craft-ts around one priority: robustness. Applications that stay solid over time, composed from the smallest possible pieces — so the people who use them inherit a reliability they never have to think about.',
        ),
        p(
          'The project is open to every suggestion and improvement that can take that robustness further.',
        ),
      ]),
      figcaption({ class: authorNoteUi.caption }, [
        strong({ class: authorNoteUi.name }, 'Romain Geffrault'),
        span('creator of @craft-ts'),
      ]),
    ]),
  ]);
});
