import { describe, expect, it } from 'vitest';
import {
  craftComponent,
  p,
  provideCraftRootComponent,
  renderCraft,
} from '../src/index';

describe('SSR CSP nonce', () => {
  it('stamps the request nonce on the emitted stylesheet', async () => {
    const app = craftComponent(
      'NonceApp',
      { styles: () => '.a{color:red}' },
      function* () {
        return {};
      },
      () => p({ class: 'a' }, 'hello'),
    );
    const rendered = await renderCraft({
      config: { providers: [provideCraftRootComponent(app)] },
      cspNonce: 'abc123',
    });
    expect(rendered.styles).toContain('color:red');
    expect(rendered.html).toContain('<style data-craft-ssr nonce="abc123">');
  });
});
