// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { craftSignal } from '@craft-ts/core';
import { craftComponent } from './component';
import { circle, div, foreignObject, g, h, path, svg } from './hyperscript';
import { renderCraftComponent } from './testing';
import { hydrateCraft, provideCraftRootComponent, renderCraft } from '../index';

const namespace = 'http://www.w3.org/2000/svg';

it('renders typed SVG shapes and updates their attributes (#27)', async () => {
  const radius = craftSignal(2);
  const Shape = craftComponent('Shape', {}, () =>
    circle({ cx: 12, cy: 12, r: () => radius() }),
  );
  const Icon = craftComponent('SvgShapesIcon', {}, () =>
    svg({ viewBox: '0 0 24 24', 'aria-hidden': true }, [
      g([path({ d: 'M5 12h14' }), Shape({})]),
      h('ellipse', { cx: 12, cy: 12, rx: 3, ry: 2 }),
    ]),
  );
  const view = await renderCraftComponent(Icon);
  try {
    for (const element of view.element.querySelectorAll(
      'svg, g, path, circle, ellipse',
    )) {
      expect(element.namespaceURI).toBe(namespace);
      expect(element).toBeInstanceOf(SVGElement);
    }
    radius.set(4);
    await view.flush();
    expect(view.element.querySelector('circle')?.getAttribute('r')).toBe('4');
  } finally {
    view.destroy();
  }
});

it('switches to HTML inside foreignObject and back for nested SVG', async () => {
  const Icon = craftComponent('SvgForeignObjectIcon', {}, () =>
    svg([
      foreignObject({ width: 24, height: 24 }, div([svg([circle({ r: 1 })])])),
    ]),
  );
  const view = await renderCraftComponent(Icon);
  try {
    expect(view.element.querySelector('foreignObject')?.namespaceURI).toBe(
      namespace,
    );
    expect(view.element.querySelector('div div')?.namespaceURI).toBe(
      'http://www.w3.org/1999/xhtml',
    );
    expect(view.element.querySelector('circle')?.namespaceURI).toBe(namespace);
  } finally {
    view.destroy();
  }
});

it('preserves SVG case and namespaces through SSR and hydration', async () => {
  const Icon = craftComponent('SvgHydrationIcon', {}, () =>
    svg({ viewBox: '0 0 24 24' }, [
      h('linearGradient', { id: 'gradient' }),
      foreignObject({ width: 24, height: 24 }, div('label')),
      path({ d: 'M5 12h14' }),
    ]),
  );
  const config = { providers: [provideCraftRootComponent(Icon)] };
  const rendered = await renderCraft({ config });
  expect(rendered.html).toContain('<linearGradient');
  expect(rendered.html).toContain('<foreignObject');
  const container = document.createElement('div');
  container.innerHTML = rendered.rootHtml;
  const host = container.firstElementChild!;
  document.body.append(host);
  const original = host.querySelector('path');
  const hydrated = hydrateCraft({ config, host });
  try {
    expect(host.querySelector('path')).toBe(original);
    expect(original?.namespaceURI).toBe(namespace);
    expect(host.querySelector('foreignObject div')?.namespaceURI).toBe(
      'http://www.w3.org/1999/xhtml',
    );
  } finally {
    hydrated.destroy();
    host.remove();
  }
});

it('retains URL security checks for SVG links', async () => {
  const Icon = craftComponent('SvgUrlSecurityIcon', {}, () =>
    svg([h('use', { href: 'javascript:alert(1)' })]),
  );
  await expect(renderCraftComponent(Icon)).rejects.toThrow(/scheme|URL/);
});
