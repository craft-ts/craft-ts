import {
  a,
  content,
  craftComponent,
  div,
  li,
  p,
  span,
  ul,
  type CraftNodeChild,
  type Input,
  type Output,
} from '@craft-ts/component';
import { craftExpose, craftService, state } from '@craft-ts/core';
import { DocDialog } from '../dialog/dialog.ts';
import { DocField } from '../field/field.ts';
import { searchEntries, type SearchEntry } from '../site/search.ts';
import { withBase } from '../site/site.ts';
import { searchUi } from './search.style.ts';

export interface SearchResultsInput {
  readonly query: Input<string>;
  readonly index: Input<readonly SearchEntry[]>;
  readonly base: Input<string>;
  readonly emptyText: Input<string>;
}

/**
 * The list under the field. It is its own component so that a new query
 * rebuilds this list and not the field above it: typing never loses the caret.
 */
export const DocSearchResults = craftComponent('DocSearchResults', {}, function* (
  props: SearchResultsInput,
) {
  const query = yield* props.query();
  const index = yield* props.index();
  const base = yield* props.base();
  if (!query.trim()) return div();

  const hits = searchEntries(index, query);
  if (hits.length === 0) {
    return p({ class: searchUi.empty, role: 'status' }, yield* props.emptyText());
  }
  return ul(
    { class: searchUi.results },
    hits.map(
      (hit): CraftNodeChild =>
        li([
          a({ class: searchUi.hit, href: withBase(base, hit.entry.href) }, [
            span({ class: searchUi.title }, hit.entry.title),
            ...(hit.heading ? [span({ class: searchUi.where }, hit.heading)] : []),
          ]),
        ]),
    ),
  );
});

/** What the person has typed: the one piece of state the search owns. */
export const { DocSearchView, provideDocSearchView } = craftService(
  { name: 'docSearchView', providedIn: 'toProvide' },
  function* () {
    const query = yield* state('query', '', ({ update }) => ({
      type: (value: string) => update(() => value),
    }));
    yield* craftExpose('type', query.type);
  },
);

export interface SearchInput {
  readonly open: Input<boolean>;
  readonly index: Input<readonly SearchEntry[]>;
  readonly base: Input<string>;
  readonly heading: Input<string>;
  readonly fieldLabel: Input<string>;
  readonly placeholder: Input<string>;
  readonly emptyText: Input<string>;
  readonly dismiss: Output<() => void>;
}

/** The search: a dialog with one field and the pages that answer it. */
export const DocSearch = craftComponent(
  'DocSearch',
  { providers: [provideDocSearchView()] },
  function* (props: SearchInput) {
    const view = yield* DocSearchView();
    return DocDialog({
      heading: props.heading,
      dialogId: function* () {
        return 'doc-search';
      },
      open: props.open,
      dismiss: props.dismiss,
      body: content(() => [
        DocField({
          label: props.fieldLabel,
          fieldId: function* () {
            return 'doc-search-field';
          },
          value: view.query,
          placeholder: props.placeholder,
          hint: function* () {
            return '';
          },
          invalid: function* () {
            return false;
          },
          disabled: function* () {
            return false;
          },
          edit: view.type as never,
        }),
        DocSearchResults({
          query: view.query,
          index: props.index,
          base: props.base,
          emptyText: props.emptyText,
        }),
      ]),
    });
  },
);
