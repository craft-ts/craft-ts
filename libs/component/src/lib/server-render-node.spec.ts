// @vitest-environment node
import {
  craftService,
  craftComputed,
  query,
  settled,
  state,
} from '@craft-ts/core';
import { describe, expect, it } from 'vitest';
import {
  craftComponent,
  div,
  p,
  pendingNode,
  provideCraftRootComponent,
  renderCraft,
  span,
} from '../index';

describe('Craft server renderer without browser globals', () => {
  it('renders state, styles and a blocking query in a Node environment', async () => {
    const { NodeSsrAppView, provideNodeSsrAppView } = craftService(
      { name: 'nodeSsrAppView', providedIn: 'toProvide' },
      function* () {
        const title = yield* state('title', 'server');
        const result = yield* query('nodeQuery', {
          params: () => true,
          loader: async () => 'resolved in node',
        });
        const resolved = craftComputed('resolved', function* () {
          return yield* settled(result);
        });
        return { title, resolved };
      },
    );

    const app = craftComponent(
      'NodeSsrApp',
      {
        providers: [provideNodeSsrAppView()],
        styles: ':scope { display: block; }',
      },
      function* () {
        const { title, resolved } = yield* NodeSsrAppView();
        return div([
          p(title),
          span(function* () {
            return String(yield* resolved());
          }),
        ]).pipe(pendingNode({ ssr: 'block', fallback: () => p('pending') }));
      },
    );

    expect(globalThis.document).toBeUndefined();
    const rendered = await renderCraft({
      config: { providers: [provideCraftRootComponent(app)] },
    });

    expect(rendered.rootHtml).toContain('server');
    expect(rendered.rootHtml).toContain('resolved in node');
    expect(rendered.styles).toContain('display: block');
  });
});
