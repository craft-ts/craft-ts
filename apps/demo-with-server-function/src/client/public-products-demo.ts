import {
  article,
  craftComponent,
  div,
  forNode,
  footer,
  heading,
  header,
  ifNode,
  main,
  p,
  section,
  small,
  span,
  strong,
  ul,
} from '@craft-ts/component';
import { craftComputed, query } from '@craft-ts/core';
import { getPublicProducts } from '../products/public-products.fn-client';
import { demoPage } from './demo.style';

/**
 * The first demo case is deliberately boring: it shows the smallest possible
 * server-function path before any middleware, context, or authorization is
 * introduced by the other examples.
 */
const PublicProductsDemo = craftComponent(
  'PublicProductsDemo',
  {},
  function* () {
    const productsQuery = yield* query(
      'publicProductsQuery',
      {
        params: () => true,
        loader: function* () {
          return yield* getPublicProducts({});
        },
      },
      ({ resource }) => ({
        hasProducts: craftComputed('hasProducts', () => resource.hasValue()),
        isEmpty: craftComputed('productsIsEmpty', function* () {
          const currentStatus = yield* resource.status();
          return (
            currentStatus !== 'loading' &&
            currentStatus !== 'reloading' &&
            !resource.hasValue()
          );
        }),
        requestTitle: craftComputed('productsRequestTitle', function* () {
          const currentStatus = yield* resource.status();
          return currentStatus === 'loading' || currentStatus === 'reloading'
            ? 'Calling demo.products.list…'
            : 'Public response ready';
        }),
        requestDetail: craftComputed('productsRequestDetail', function* () {
          const currentStatus = yield* resource.status();
          return currentStatus === 'loading' || currentStatus === 'reloading'
            ? 'POST /__server-functions · no middleware'
            : `Status: ${currentStatus}`;
        }),
        resultCount: craftComputed('productsResultCount', function* () {
          const value = yield* resource.value();
          return Array.isArray(value) ? value.length.toString() : '—';
        }),
      }),
    );

    return { productsQuery };
  },
  ({ productsQuery }) =>
    main({ class: demoPage.shell }, [
      header({ class: demoPage.hero }, [
        div({ class: demoPage.eyebrow }, [
          span({ class: demoPage.pulse }),
          ' first runnable example',
        ]),
        heading({ class: demoPage.title }, 'A public server function'),
        p(
          { class: demoPage.heroCopy },
          'The smallest path from a browser call to a server response: no middleware, no client context, and no authorization step.',
        ),
      ]),
      section({ class: demoPage.panel }, [
        div({ class: demoPage.panelHeading }, [
          div([
            span({ class: demoPage.kicker }, 'Public server function'),
            heading({ class: demoPage.panelTitle }, 'Available products'),
          ]),
          span({ class: demoPage.mono }, 'demo.products.list'),
        ]),
        p(
          { class: demoPage.copy },
          'This request is safe to expose publicly: it carries no user identity and reads no client-provided context.',
        ),
        div({ class: demoPage.requestCard }, [
          span({ class: demoPage.requestDot }),
          div([
            strong({ class: demoPage.requestTitle }, function* () {
              return yield* productsQuery.requestTitle();
            }),
            small({ class: demoPage.requestDetail }, function* () {
              return yield* productsQuery.requestDetail();
            }),
          ]),
        ]),
        ifNode(productsQuery.isLoading, () =>
          p({ class: demoPage.loading }, '⏳ Loading public products…'),
        ),
        ifNode(productsQuery.hasProducts, () =>
          ul(
            { class: demoPage.results },
            forNode(
              productsQuery.value,
              { track: (product) => product.id },
              (product) =>
                article({ class: demoPage.row }, [
                  div({ class: demoPage.avatar }, function* () {
                    return (yield* product()).name.slice(0, 1);
                  }),
                  div({ class: demoPage.rowInfo }, [
                    strong({ class: demoPage.rowName }, function* () {
                      return (yield* product()).name;
                    }),
                    span({ class: demoPage.rowMeta }, function* () {
                      const value = yield* product();
                      return `${value.category} · ${value.description}`;
                    }),
                  ]),
                  span({ class: demoPage.price }, function* () {
                    const value = yield* product();
                    return value.available ? `€${value.price}` : 'Unavailable';
                  }),
                ]),
            ),
          ),
        ),
        ifNode(productsQuery.isEmpty, () =>
          div({ class: demoPage.empty }, [
            strong({ class: demoPage.emptyTitle }, 'No products loaded'),
            span(
              { class: demoPage.emptyText },
              'The public server function returned no products.',
            ),
          ]),
        ),
        div({ class: demoPage.requestCard }, [
          span({ class: demoPage.countBadge }, function* () {
            return yield* productsQuery.resultCount();
          }),
          small(
            { class: demoPage.requestDetail },
            'products returned by the server',
          ),
        ]),
      ]),
      footer({ class: demoPage.footer }, [
        span('The first case has no middleware at all.'),
        span(
          { class: demoPage.footerFile },
          'products/public-products.fn-serveur.ts',
        ),
      ]),
    ]),
);

export { PublicProductsDemo };
