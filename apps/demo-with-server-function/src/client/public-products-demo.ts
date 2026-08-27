/* eslint-disable craft-ts/no-hardcoded-design-values -- Dedicated demo UI styles. */
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

/**
 * The first demo case is deliberately boring: it shows the smallest possible
 * server-function path before any middleware, context, or authorization is
 * introduced by the other examples.
 */
const PublicProductsDemo = craftComponent(
  'PublicProductsDemo',
  {
    styles: `
      :scope { display: block; min-height: 100vh; color: #e8edf8; background: radial-gradient(circle at 85% 5%, #244534 0, #0b1020 38rem); }
      .shell { width: min(1120px, calc(100% - 40px)); margin: 0 auto; padding: 70px 0 34px; }
      .hero { max-width: 760px; }
      .eyebrow, .panel-kicker { color: #70e0ad; font-size: .72rem; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
      .eyebrow { display: flex; align-items: center; gap: 9px; }
      .pulse { width: 8px; height: 8px; border-radius: 50%; background: #52e2ae; box-shadow: 0 0 0 5px #52e2ae20; }
      h1 { max-width: 760px; margin: 16px 0 15px; color: #fff; font-size: clamp(2.5rem, 6vw, 4.8rem); letter-spacing: -.065em; line-height: .98; }
      .hero-copy { max-width: 650px; margin: 0; color: #aab6cf; font-size: 1.08rem; }
      .flow { display: flex; align-items: stretch; margin: 52px 0 24px; padding: 10px; border: 1px solid #273351; border-radius: 18px; background: #111a30b3; }
      .flow-step { display: grid; flex: 1; grid-template-columns: auto 1fr; column-gap: 10px; align-items: center; padding: 13px 15px; }
      .flow-step strong { color: #f7f9ff; font-size: .9rem; }
      .flow-step small { grid-column: 2; color: #73809e; font-size: .7rem; white-space: nowrap; }
      .step-number { grid-row: span 2; color: #5eac87; font: 700 .7rem/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
      .flow-arrow { align-self: center; color: #526389; font-size: 1.4rem; }
      .panel { min-height: 340px; padding: 28px; border: 1px solid #293655; border-radius: 22px; background: linear-gradient(145deg, #182f2b, #11192d); box-shadow: 0 20px 80px #00000020; }
      .panel-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }
      h2 { margin: 5px 0 0; color: #fff; font-size: 1.2rem; letter-spacing: -.025em; }
      .mono { padding: 6px 8px; border: 1px solid #3b725d; border-radius: 7px; color: #8fe8bd; font: .68rem ui-monospace, SFMono-Regular, Menlo, monospace; white-space: nowrap; }
      .panel-copy { margin: 14px 0 27px; color: #8996b1; font-size: .88rem; }
      .request-card { display: flex; gap: 11px; align-items: flex-start; margin-top: 42px; padding: 13px; border: 1px solid #2d3d61; border-radius: 11px; background: #0d162a; }
      .request-dot { flex: 0 0 auto; width: 8px; height: 8px; margin-top: 6px; border-radius: 50%; background: #52e2ae; }
      .request-card strong, .request-card small { display: block; }
      .request-card strong { color: #dce5f8; font-size: .78rem; }
      .request-card small { margin-top: 3px; color: #7483a1; font-size: .7rem; }
      .loading { margin: 29px 0 9px; padding: 11px 12px; border: 1px solid #3b725d; border-radius: 10px; color: #b7e8ce; background: #1b4938; font-size: .78rem; }
      .count-badge { min-width: 27px; padding: 4px 8px; border-radius: 20px; color: #a9e8c4; background: #285f49; font: 700 .75rem ui-monospace, SFMono-Regular, Menlo, monospace; text-align: center; }
      .results { display: grid; gap: 9px; margin: 29px 0 0; padding: 0; list-style: none; }
      .product-row { display: flex; align-items: center; gap: 12px; padding: 14px; border: 1px solid #2c4d43; border-radius: 12px; background: #101f2d; }
      .product-mark { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 11px; color: #10251d; background: #70e0ad; font-weight: 900; }
      .product-info { flex: 1; min-width: 0; }
      .product-info strong, .product-info span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .product-info strong { color: #f5f7ff; font-size: .88rem; }
      .product-info span { margin-top: 4px; color: #8290ae; font-size: .75rem; }
      .product-price { color: #b5f0d0; font: 700 .8rem ui-monospace, SFMono-Regular, Menlo, monospace; }
      .unavailable { color: #dd9a9a; }
      .empty { display: grid; place-items: center; min-height: 180px; border: 1px dashed #334262; border-radius: 13px; color: #8492ad; text-align: center; }
      .empty strong, .empty span { display: block; }
      .empty strong { color: #cdd7ec; font-size: .88rem; }
      .empty span { margin-top: 4px; font-size: .75rem; }
      .demo-footer { display: flex; justify-content: space-between; gap: 12px; margin-top: 22px; color: #63708c; font-size: .72rem; }
      .footer-file { color: #7f8fb2; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
      @media (max-width: 780px) { .shell { width: min(100% - 28px, 600px); padding-top: 40px; } .flow { display: grid; grid-template-columns: 1fr 1fr; } .flow-arrow { display: none; } }
      @media (max-width: 470px) { .panel { padding: 21px; } .panel-heading { display: block; } .mono { display: inline-block; margin-top: 14px; } .demo-footer { display: block; } .footer-file { display: block; margin-top: 5px; } }
      :scope { color: #172033; background: #f6f7fb; }
      .shell { width: min(1060px, calc(100% - 40px)); padding: 52px 0 30px; }
      .eyebrow, .panel-kicker { color: #5570c7; }
      .pulse { background: #4a9b73; box-shadow: none; }
      h1, h2 { color: #172033; }
      h1 { margin: 12px 0; font-size: clamp(2.1rem, 5vw, 3.7rem); line-height: 1.02; }
      .hero-copy, .panel-copy { color: #68738a; line-height: 1.55; }
      .flow { display: none; }
      .panel { min-height: 320px; padding: 25px; border: 1px solid #e2e6ef; border-radius: 16px; background: #fff; box-shadow: 0 10px 28px #25345a0a; }
      .mono { border-color: #d8e0f7; color: #5570c7; background: #f5f7ff; }
      .request-card { border-color: #e3e7ef; background: #fafbfc; }
      .request-dot { background: #4a9b73; }
      .request-card strong { color: #344057; }
      .request-card small { color: #7a8498; }
      .loading { border-color: #d8e0f7; color: #5570c7; background: #f5f7ff; }
      .count-badge { color: #4665c4; background: #edf2ff; }
      .product-row { border-color: #e5e8ef; background: #fff; }
      .product-mark { color: #3159c8; background: #edf2ff; }
      .product-info strong { color: #263149; }
      .product-info span { color: #7a8498; }
      .product-price { color: #4a9b73; }
      .empty { border-color: #d7dce7; color: #7a8498; }
      .empty strong { color: #344057; }
      .demo-footer { color: #8a94a6; }
      .footer-file { color: #7a8498; }
      @media (max-width: 780px) { .shell { width: min(100% - 28px, 600px); padding-top: 38px; } }
    `,
  },
  function* () {
    const productsQuery = yield* query(
      'publicProductsQuery',
      {
        params: () => true,
        loader: () => getPublicProducts({}),
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
    main({ class: 'shell' }, [
      header({ class: 'hero' }, [
        div({ class: 'eyebrow' }, [
          span({ class: 'pulse' }),
          ' first runnable example',
        ]),
        heading('A public server function'),
        p(
          { class: 'hero-copy' },
          'The smallest path from a browser call to a server response: no middleware, no client context, and no authorization step.',
        ),
      ]),
      section({ class: 'flow', attrs: { 'aria-label': 'Demo flow' } }, [
        flowStep('01', 'Client call', 'getPublicProducts({})'),
        span({ class: 'flow-arrow' }, '→'),
        flowStep('02', 'HTTP', 'POST /__server-functions'),
        span({ class: 'flow-arrow' }, '→'),
        flowStep('03', 'Server function', 'no middleware'),
        span({ class: 'flow-arrow' }, '→'),
        flowStep('04', 'Public data', 'products'),
      ]),
      section({ class: 'panel' }, [
        div({ class: 'panel-heading' }, [
          div([
            span({ class: 'panel-kicker' }, 'Public server function'),
            heading('Available products'),
          ]),
          span({ class: 'mono' }, 'demo.products.list'),
        ]),
        p(
          { class: 'panel-copy' },
          'This request is safe to expose publicly: it carries no user identity and reads no client-provided context.',
        ),
        div({ class: 'request-card' }, [
          span({ class: 'request-dot' }),
          div([
            strong(function* () {
              return yield* productsQuery.requestTitle();
            }),
            small(function* () {
              return yield* productsQuery.requestDetail();
            }),
          ]),
        ]),
        ifNode(productsQuery.isLoading, () =>
          p({ class: 'loading' }, '⏳ Loading public products…'),
        ),
        ifNode(productsQuery.hasProducts, () =>
          ul(
            { class: 'results' },
            forNode(
              productsQuery.value,
              { track: (product) => product.id },
              (product) =>
                article({ class: 'product-row' }, [
                  div({ class: 'product-mark' }, function* () {
                    return (yield* product()).name.slice(0, 1);
                  }),
                  div({ class: 'product-info' }, [
                    strong(function* () {
                      return (yield* product()).name;
                    }),
                    span(function* () {
                      const value = yield* product();
                      return `${value.category} · ${value.description}`;
                    }),
                  ]),
                  span({ class: 'product-price' }, function* () {
                    const value = yield* product();
                    return value.available ? `€${value.price}` : 'Unavailable';
                  }),
                ]),
            ),
          ),
        ),
        ifNode(productsQuery.isEmpty, () =>
          div({ class: 'empty' }, [
            strong('No products loaded'),
            span('The public server function returned no products.'),
          ]),
        ),
        div({ class: 'request-card' }, [
          span({ class: 'count-badge' }, function* () {
            return yield* productsQuery.resultCount();
          }),
          small('products returned by the server'),
        ]),
      ]),
      footer({ class: 'demo-footer' }, [
        span('The first case has no middleware at all.'),
        span(
          { class: 'footer-file' },
          'products/public-products.fn-serveur.ts',
        ),
      ]),
    ]),
);

function flowStep(number: string, title: string, description: string) {
  return div({ class: 'flow-step' }, [
    span({ class: 'step-number' }, number),
    strong(title),
    small(description),
  ]);
}

export { PublicProductsDemo };
