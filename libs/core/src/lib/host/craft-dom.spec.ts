/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { createBrowserDomAdapter } from './craft-dom';

describe('createBrowserDomAdapter', () => {
  it('creates, patches and removes a text node', () => {
    const dom = createBrowserDomAdapter(document);
    const p = dom.createElement('p');
    const text = dom.createText('a');
    dom.appendChild(p, text);
    dom.setValue(text, 'b');
    expect(p.textContent).toBe('b');
    dom.removeChild(p, text);
    expect(p.textContent).toBe('');
  });
});
