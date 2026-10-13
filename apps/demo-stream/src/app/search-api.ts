import { craftException, craftExpose, craftService } from '@craft-ts/core';
import { map, timer } from '@craft-ts/stream';

const BOOKS = [
  'Dune',
  'Dune Messiah',
  'Neuromancer',
  'The Left Hand of Darkness',
  'A Wizard of Earthsea',
  'The Dispossessed',
];

/**
 * A pretend remote search. Its stream carries a TYPED exception: a term
 * containing "boom" makes the backend unavailable, and that shows up in the
 * type of every pipeline built on it.
 */
export const { SearchApi, provideSearchApi } = craftService(
  { name: 'SearchApi', providedIn: 'toProvide' },
  function* () {
    yield* craftExpose('search', (term: string) =>
      timer(400).pipe(
        map(() => {
          if (term.includes('boom')) {
            return craftException(
              { _tag: 'SearchUnavailable', scope: 'SearchApi' },
              { term },
            );
          }
          const needle = term.toLowerCase();
          return BOOKS.filter((book) => book.toLowerCase().includes(needle));
        }),
      ),
    );
  },
);
