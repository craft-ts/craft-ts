import {
  a,
  article,
  catchTag,
  craftComponent,
  div,
  forNode,
  ifNode,
  img,
  input,
  p,
  safeResourceUrl,
  safeUrl,
  section,
  small,
  span,
  ul,
  heading,
} from '@craft-ts/component';
import {
  craftService,
  asyncProcess,
  CraftHttpClient,
  craftComputed,
  craftException,
  craftGen,
  craftSleep,
  query,
  ɵcomputed as computed,
  rawReactiveFacade,
  rawReactiveValue,
  retry,
  state,
} from '@craft-ts/core';
import { StatusComponent } from '../../../ui/status.component';
import { eventValue } from '../../../event-value';
import { example } from '../../shared/example.style';
import { bookSearch } from './debounced-web-search.style';

type OpenLibraryDocument = {
  key?: string;
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
};

type OpenLibraryResponse = {
  numFound: number;
  docs: OpenLibraryDocument[];
};

type BookResult = {
  key: string;
  title: string;
  authors: string;
  year: number | undefined;
  coverUrl: string;
  metadata: string;
  url: string;
};

type SearchResults = {
  total: number;
  books: BookResult[];
};

const EMPTY_RESULTS: SearchResults = { total: 0, books: [] };

const RETRYABLE_HTTP_STATUS_CODES = [408, 429, 500, 502, 503, 504];

function decodeOpenLibraryResponse(input: unknown): SearchResults {
  if (!isOpenLibraryResponse(input)) return EMPTY_RESULTS;
  const response = input;

  return {
    total: response.numFound,
    books: response.docs.map((book, index) => {
      const key = book.key ?? `unknown-${index}`;
      const title = book.title ?? 'Untitled';

      return {
        key,
        title,
        authors: book.author_name?.join(', ') ?? 'Unknown author',
        year: book.first_publish_year,
        coverUrl: book.cover_i
          ? `https://covers.openlibrary.org/b/id/${book.cover_i}-M.jpg`
          : '',
        metadata: [
          book.author_name?.join(', ') ?? 'Unknown author',
          book.first_publish_year?.toString(),
        ]
          .filter(Boolean)
          .join(' · '),
        url: `https://openlibrary.org${key}`,
      };
    }),
  };
}

function isOpenLibraryResponse(input: unknown): input is OpenLibraryResponse {
  if (!input || typeof input !== 'object') return false;
  if (!('numFound' in input) || !('docs' in input)) return false;
  return typeof input.numFound === 'number' && Array.isArray(input.docs);
}

function isSearchResults(value: unknown): value is SearchResults {
  return (
    value !== null &&
    typeof value === 'object' &&
    'total' in value &&
    typeof value.total === 'number' &&
    'books' in value &&
    Array.isArray(value.books)
  );
}

const searchBooks = craftGen(function* (term: string) {
  if (term.length < 2) return EMPTY_RESULTS;

  return yield* CraftHttpClient.get(({ response }) => ({
    url: `https://openlibrary.org/search.json?q=${encodeURIComponent(term)}&limit=8&fields=key,title,author_name,first_publish_year,cover_i`,
    success: response({ decode: decodeOpenLibraryResponse }),
    exceptions: [
      function* ({ status }) {
        const httpStatus = yield* status();
        if (RETRYABLE_HTTP_STATUS_CODES.includes(httpStatus)) {
          return craftException(
            {
              _tag: 'TransientHttpError',
              scope: 'OpenLibrarySearch',
            },
            { status: httpStatus },
          );
        }

        return craftException(
          {
            _tag: 'SearchHttpError',
            scope: 'OpenLibrarySearch',
          },
          { status: httpStatus },
        );
      },
    ],
  }));
});

export const { DebouncedWebSearchView, provideDebouncedWebSearchView } =
  craftService(
    { name: 'debouncedWebSearchView', providedIn: 'toProvide' },
    function* () {
      const searchFailure = yield* state('searchFailure', '', ({ set }) => ({
        show: (message: string) => set(message),
      }));

      const searchInput = yield* state('searchInput', '', ({ state, set }) => ({
        setSearchInput: (value: string) => set(value),
        currentTerm: computed(() => rawReactiveValue(state)()?.trim() ?? ''),
        tooShort: computed(() => rawReactiveValue(state)().trim().length < 2),
      }));

      // asyncProcess owns the debounce. The new temporal runtime makes the wait
      // cancellable and replaceable by a virtual clock in tests.
      const debouncedSearch = yield* asyncProcess(
        'debouncedSearch',
        {
          params: function* () {
            const _searchInput = yield* searchInput();
            return _searchInput.trim();
          },
          loader: function* ({ params }) {
            if (!params) return { term: '' };

            yield* craftSleep(350, { owner: 'open-library-search-debounce' });
            return { term: params };
          },
        },
        ({ resource }) => ({
          isDebouncing: computed(() => rawReactiveValue(resource.isLoading)()),
          statusValue: computed(() => {
            const status = rawReactiveFacade(resource).status();
            return status === 'error' ? 'exception' : status;
          }),
        }),
      );

      // query owns the server state. It only sees values emitted after the
      // debounce and retries transient CraftHttpClient failures.
      yield* query(
        'searchQuery',
        {
          params: function* () {
            const _debouncedSearchvalue = yield* debouncedSearch.value();
            return _debouncedSearchvalue?.term;
          },
          loader: function* ({ params }) {
            if (!params) return EMPTY_RESULTS;

            return yield* searchBooks(params).pipe(
              retry({
                times: 3,
                while: ['TransientHttpError'],
                backoff: 'exponential',
                delayMs: 250,
              }),
            );
          },
        },
        ({ resource, hasException }) => {
          const rawResource = rawReactiveFacade(resource);
          const rawHasException = rawReactiveValue(hasException);
          const rawSearchFailure = rawReactiveValue(searchFailure);
          const hasResults = computed(() => {
            const value = rawResource.value();
            return isSearchResults(value) && value.books.length > 0;
          });

          return {
            hasResults,
            resultCount: computed(() => {
              const value = rawResource.value();
              return String(isSearchResults(value) ? value.total : 0);
            }),
            resultBooks: computed(() => {
              const value = rawResource.value();
              return isSearchResults(value) ? value.books : [];
            }),
            hasSearchError: computed(() => rawHasException()),
            searchFailureMessage: computed(() => rawSearchFailure()),
            showResults: computed(
              () =>
                !rawResource.isLoading() && !rawHasException() && hasResults(),
            ),
            showEmpty: computed(
              () =>
                rawReactiveValue(searchInput)().trim().length >= 2 &&
                !rawResource.isLoading() &&
                !rawHasException() &&
                !hasResults(),
            ),
          };
        },
      );

      yield* craftComputed('showDebouncing', function* () {
        const _debouncedSearchisDebouncing =
          yield* debouncedSearch.isDebouncing();
        const _searchInput = yield* searchInput();
        return _searchInput.trim().length >= 2 && _debouncedSearchisDebouncing;
      });
    },
  );

const DebouncedWebSearch = craftComponent(
  'DebouncedWebSearch',
  {
    providers: [provideDebouncedWebSearchView()],
  },
  () =>
    section({ class: example.card }, [
      heading({ class: example.title }, 'Debounced web search'),
      p(
        { class: example.text, 'data-exampleText': 'muted' },
        'Type a book title. The input waits 350 ms in an asyncProcess before the query calls the public Open Library API.',
      ),
      input('search', {
        class: example.input,
        'data-exampleField': 'wide',
        type: 'search',
        value: function* () {
          return yield* DebouncedWebSearchView.searchInput();
        },
        placeholder: 'Try “angular”, “dune” or “design patterns”…',
        'aria-label': 'Search books',
        *input(event) {
          yield* DebouncedWebSearchView.searchInput.setSearchInput(
            eventValue(event),
          );
        },
      }),
      div({ class: example.row }, [
        span([
          'Debounce: ',
          StatusComponent({
            status: function* () {
              return yield* DebouncedWebSearchView.debouncedSearch.statusValue();
            },
          }),
        ]),
        span([
          'HTTP query: ',
          StatusComponent({
            status: function* () {
              return yield* DebouncedWebSearchView.searchQuery.status();
            },
          }),
        ]),
      ]),
      ifNode(
        'searchTooShort',
        () => DebouncedWebSearchView.searchInput.tooShort(),
        () =>
          p(
            { class: example.hint },
            'Enter at least two characters to search.',
          ),
      ),
      ifNode(
        'showDebouncing',
        () => DebouncedWebSearchView.showDebouncing(),
        () => p({ class: example.hint }, 'Waiting for the debounce window…'),
      ),
      ifNode(
        'hasSearchError',
        () => DebouncedWebSearchView.searchQuery.hasSearchError(),
        () =>
          p({ class: example.error, role: 'alert' }, function* () {
            return yield* DebouncedWebSearchView.searchQuery.searchFailureMessage();
          }),
      ),
      ifNode(
        'showResults',
        () => DebouncedWebSearchView.searchQuery.showResults(),
        () => [
          heading({ class: example.subtitle }, [
            function* () {
              return yield* DebouncedWebSearchView.searchQuery.resultCount();
            },
            ' results for “',
            function* () {
              return yield* DebouncedWebSearchView.searchInput();
            },
            '”',
          ]),
          ul(
            { class: example.list },
            forNode(
              function* () {
                return yield* DebouncedWebSearchView.searchQuery.resultBooks();
              },
              { track: (book) => book.key },
              (book) =>
                article({ class: bookSearch.book }, [
                  img({
                    class: bookSearch.cover,
                    src: function* () {
                      return safeResourceUrl((yield* book()).coverUrl, {
                        allowedOrigins: ['https://covers.openlibrary.org'],
                      });
                    },
                    alt: '',
                  }),
                  div({ class: bookSearch.content }, [
                    a(
                      'book',
                      {
                        class: bookSearch.link,
                        href: function* () {
                          // URL fournie par une API tierce : elle passe par le
                          // garde-fou avant d'atterrir dans le DOM.
                          return safeUrl((yield* book()).url);
                        },
                        target: '_blank',
                        rel: 'noreferrer',
                      },
                      function* () {
                        return (yield* book()).title;
                      },
                    ),
                    small({ class: example.hint }, function* () {
                      return (yield* book()).metadata;
                    }),
                  ]),
                ]),
            ),
          ),
        ],
      ),
      ifNode(
        'showEmpty',
        () => DebouncedWebSearchView.searchQuery.showEmpty(),
        () => p({ class: example.hint }, 'No books found.'),
      ),
    ]),
).pipe(
  catchTag.exhaustive({
    TransientHttpError: function* () {
      yield* DebouncedWebSearchView.searchFailure.show(
        'The search is still unavailable after three retries. Check your connection and try again.',
      );
    },
    HttpError: function* () {
      yield* DebouncedWebSearchView.searchFailure.show(
        'The HTTP request failed before the search service returned a response. Try again shortly.',
      );
    },
    HttpResponseDecodeError: function* () {
      yield* DebouncedWebSearchView.searchFailure.show(
        'The search service returned data we could not read. Try again later.',
      );
    },
    SearchHttpError: function* () {
      yield* DebouncedWebSearchView.searchFailure.show(
        'The search service rejected this request. Check the search term and try again.',
      );
    },
  }),
);

export default DebouncedWebSearch;
