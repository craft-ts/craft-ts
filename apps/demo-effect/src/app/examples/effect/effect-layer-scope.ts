/* eslint-disable craft-ts/no-hardcoded-design-values -- Dedicated demo UI styles. */
import {
  craftComponent,
  div,
  heading,
  ifBlock,
  p,
  span,
  strong,
} from '@craft-ts/component';
import { craftComputed } from '@craft-ts/core';
import { queryEffect } from '@craft-ts/effect';
import { loadLayerScope } from '../../shared/layer-scope-services';

/**
 * Demonstrates Effect services split between the application and route
 * injector. The query represents an asynchronous server-state read; the
 * Layers are dependencies of that read, not the data being queried.
 */
const EffectLayerScopeComponent = craftComponent(
  'EffectLayerScopeComponent',
  {
    styles: `
      :scope {
        display: block;
        max-width: 880px;
        margin: 2rem auto;
        padding: 1.5rem;
        border: 1px solid #dcfce7;
        border-radius: 12px;
        color: #14532d;
        background: #f0fdf4;
      }
      :scope h1 { margin: 0 0 0.5rem; color: #14532d; }
      .intro { margin: 0 0 1.25rem; color: #166534; line-height: 1.55; }
      .panel {
        padding: 1rem 1.1rem;
        border: 1px solid #bbf7d0;
        border-radius: 8px;
        background: #fff;
      }
      .panel-title {
        margin: 0 0 0.65rem;
        color: #64748b;
        font-size: 0.72rem;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .row { margin: 0.65rem 0; line-height: 1.5; }
      .mono {
        padding: 0.05rem 0.3rem;
        border-radius: 3px;
        background: #dcfce7;
        font-family: ui-monospace, monospace;
        font-size: 0.8rem;
      }
      .note {
        margin-top: 1.25rem;
        padding: 0.95rem 1.1rem;
        border-left: 3px solid #22c55e;
        border-radius: 0 8px 8px 0;
        background: #f0fdf4;
        color: #166534;
        font-size: 0.85rem;
        line-height: 1.6;
      }
      button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid currentColor;outline-offset:2px}
    `,
  },
  function* () {
    const layerScopeQuery = yield* queryEffect('layerScopeQuery', {
      params: () => 'route',
      loader: () => loadLayerScope(),
    }, ({ resource }) => ({
      globalLabel: craftComputed(
        'globalLabel',
        function* () {
          return (yield* resource.value())?.global ?? '…';
        },
      ),
      routeLabel: craftComputed(
        'routeLabel',
        function* () {
          return (yield* resource.value())?.route ?? '…';
        },
      ),
    }));

    return {
      globalLabel: layerScopeQuery.globalLabel,
      routeLabel: layerScopeQuery.routeLabel,
      isLoading: layerScopeQuery.isLoading,
    };
  },
  ({ globalLabel, routeLabel, isLoading }) =>
    div([
      heading('Global and route-scoped Effect Layers'),
      p(
        { class: 'intro' },
        'This loader needs two services from shared domain code. The global service is provided once by app.config.ts; the route service is provided only by this route.',
      ),
      div({ class: 'panel' }, [
        p({ class: 'panel-title' }, 'Resolved dependencies'),
        ifBlock(isLoading, () => p('Loading server state…')),
        p({ class: 'row' }, [strong('Global: '), globalLabel]),
        p({ class: 'row' }, [strong('Route: '), routeLabel]),
        p({ class: 'note' }, [
          'The Effect keeps both requirements in its environment: ',
          span({ class: 'mono' }, 'GlobalLayerService | RouteLayerService'),
          '. The nearest route injector inherits the global Layer and adds its own.',
        ]),
      ]),
    ]),
);

export default EffectLayerScopeComponent;
