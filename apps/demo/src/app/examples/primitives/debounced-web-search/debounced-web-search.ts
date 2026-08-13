import { computed } from '@angular/core';
import {
  a,
  article,
  catchTag,
  craftComponent,
  div,
  each,
  h2,
  h3,
  ifBlock,
  img,
  input,
  p,
  section,
  small,
  span,
  ul,
} from '@craft-ng/component';
import {
  asyncProcess,
  CraftHttpClient,
  craftComputed,
  craftException,
  craftGen,
  craftSleep,
  query,
  retry,
  state,
  insertStatePipe, craftUse } from '@craft-ng/core';
import styles from './debounced-web-search.css' with { loader: 'text' };
import { StatusComponent } from '../../../ui/status.component';

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
  const response = input as OpenLibraryResponse;

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
              code: 'TransientHttpError',
              scope: 'OpenLibrarySearch',
            },
            { status: httpStatus },
          );
        }

        return craftException(
          {
            code: 'SearchHttpError',
            scope: 'OpenLibrarySearch',
          },
          { status: httpStatus },
        );
      },
    ],
  }));
});

const DebouncedWebSearch = craftComponent(
  'DebouncedWebSearch',
  { stylesUrl: styles },
  function* () {
    const searchInput = yield* state(
      'searchInput',
      '',
      insertStatePipe(
        ({ set }) => ({
          setSearchInput: (value: string) => set(value),
        }),
        ({ state }) => ({
          currentTerm: computed(() => craftUse(state())?.trim() ?? ''),
          tooShort: computed(() => craftUse(state()).trim().length < 2),
        }),
      ),
    );

    // asyncProcess owns the debounce. The new temporal runtime makes the wait
    // cancellable and replaceable by a virtual clock in tests.
    const debouncedSearch = yield* asyncProcess(
      'debouncedSearch',
      {
        params: function* () {
              const _searchInput = yield* searchInput(); return _searchInput.trim(); },
        loader: function* ({ params }) {
          if (!params) return { term: '' };

          yield* craftSleep(350, { owner: 'open-library-search-debounce' });
          return { term: params };
        },
      },
      ({ resource }) => ({
        isDebouncing: computed(() => craftUse(resource.isLoading())),
      }),
    );

    // query owns the server state. It only sees values emitted after the
    // debounce and retries transient CraftHttpClient failures.
    const searchQuery = yield* query(
      'openLibrarySearch',
      {
        params: function* () {
              const _debouncedSearchvalue = yield* debouncedSearch.value(); return _debouncedSearchvalue?.term; },
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
        const hasResults = computed(
          () => (craftUse(resource.value())?.books.length ?? 0) > 0,
        );

        return {
          hasResults,
          resultCount: computed(() =>
            String(craftUse(resource.value())?.total ?? 0),
          ),
          resultBooks: computed(
            () => craftUse(resource.value())?.books ?? [],
          ),
          hasSearchError: computed(() => craftUse(hasException())),
          showResults: computed(
            () =>
              !craftUse(resource.isLoading()) &&
              !craftUse(hasException()) &&
              hasResults(),
          ),
          showEmpty: computed(
            () =>
              craftUse(searchInput.currentTerm()).length >= 2 &&
              !craftUse(resource.isLoading()) &&
              !craftUse(hasException()) &&
              !hasResults(),
          ),
        };
      },
    );

    const showDebouncing = craftComputed(
      'showDebouncing',
      function* () {
          const _debouncedSearchisDebouncing = yield* debouncedSearch.isDebouncing();
          const _searchInput = yield* searchInput(); return _searchInput.trim().length >= 2 &&
                _debouncedSearchisDebouncing; },
    );

    return {
      searchInput,
      setSearchInput: searchInput.setSearchInput,
      debouncedSearch,
      searchQuery,
      showDebouncing,
    };
  },
  ({
    searchInput,
    debouncedSearch,
    searchQuery,
    showDebouncing,
    setSearchInput,
  }) => {
    return section([
      h2('Debounced web search'),
      p(
        'Type a book title. The input waits 350 ms in an asyncProcess before the query calls the public Open Library API.',
      ),
      input({
        type: 'search',
        value: () => craftUse(searchInput()),
        placeholder: 'Try “angular”, “dune” or “design patterns”…',
        'aria-label': 'Search books',
        *input(event) {
          yield* setSearchInput((event.target as HTMLInputElement).value);
        },
      }),
      div({ class: 'pipeline-status' }, [
        span([
          'Debounce: ',
          StatusComponent({
            status: () => craftUse(debouncedSearch.status()),
          }),
        ]),
        span([
          'HTTP query: ',
          StatusComponent({ status: () => craftUse(searchQuery.status()) }),
        ]),
      ]),
      ifBlock(searchInput.tooShort, () =>
        p({ class: 'hint' }, 'Enter at least two characters to search.'),
      ),
      ifBlock(showDebouncing, () =>
        p({ class: 'hint' }, 'Waiting for the debounce window…'),
      ),
      ifBlock(searchQuery.hasSearchError, () =>
        p(
          { class: 'error' },
          'The search failed. Transient HTTP errors are retried up to three times.',
        ),
      ),
      ifBlock(searchQuery.showResults, () => [
        h3([
          () => craftUse(searchQuery.resultCount()),
          ' results for “',
          () => craftUse(searchInput()),
          '”',
        ]),
        ul(
          { class: 'results' },
          each(
            () => craftUse(searchQuery.resultBooks()),
            { track: (book) => book.key },
            (book) =>
              article({ class: 'book' }, [
                img({ src: book.coverUrl, alt: '' }),
                div({ class: 'book__content' }, [
                  a(
                    { href: book.url, target: '_blank', rel: 'noreferrer' },
                    book.title,
                  ),
                  small(book.metadata),
                ]),
              ]),
          ),
        ),
      ]),
      ifBlock(searchQuery.showEmpty, () =>
        p({ class: 'hint' }, 'No books found.'),
      ),
    ]);
  },
).pipe(
  catchTag.exhaustive({
    TransientHttpError: function* () {
      return;
    },
    HttpError: function* () {
      return;
    },
    HttpResponseDecodeError: function* () {
      return;
    },
    SearchHttpError: function* () {
      return;
    },
  }),
);

export default DebouncedWebSearch;
