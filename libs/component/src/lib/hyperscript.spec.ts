import { describe, expect, it } from 'vitest';
import {
  area,
  caption,
  dialog,
  fieldset,
  figcaption,
  figure,
  h4,
  h5,
  h6,
  iframe,
  img,
  legend,
  svg,
  table,
  tbody,
  td,
  th,
  thead,
  tr,
} from './hyperscript';

describe('hyperscript a11y types', () => {
  it('requires alt on img, including an empty decorative value', () => {
    const decorative = img({ alt: '' });
    const named = img('hero', { alt: 'Product photo' });

    expect(decorative.tag).toBe('img');
    expect(named.localName).toBe('hero');

    // @ts-expect-error img requires alt, including '' for decorative images
    img({});
    // @ts-expect-error img cannot be called with children only — alt is required
    img();
  });

  it('requires alt on area', () => {
    const node = area({ alt: '', href: '#section' });
    expect(node.tag).toBe('area');

    // @ts-expect-error area requires alt
    area({ href: '#section' });
  });

  it('exposes the semantic helpers that used to require h()', () => {
    expect(dialog({}).tag).toBe('dialog');
    expect(fieldset([legend('Account')]).tag).toBe('fieldset');
    expect(legend('Account').tag).toBe('legend');
    expect(table([caption('Scores'), thead([tr([th('Name')])]), tbody([tr([td('Ada')])])]).tag).toBe(
      'table',
    );
    expect(figure([figcaption('Caption')]).tag).toBe('figure');
    expect(h4('Four').tag).toBe('h4');
    expect(h5('Five').tag).toBe('h5');
    expect(h6('Six').tag).toBe('h6');
    expect(iframe({ title: 'Preview', src: 'about:blank' }).tag).toBe('iframe');
    expect(svg({}).tag).toBe('svg');
  });
});
