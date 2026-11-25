// @vitest-environment jsdom
import { craftNodeDirective } from '@craft-ts/core';
import { afterEach, describe, expect, it } from 'vitest';
import { craftComponent, div, forNode, span } from '../index';
import { renderCraftComponent } from './testing';

afterEach(() => document.body.replaceChildren());

// Regression for craft-ts/craft-ts#38: a node directive piped onto anything but
// an element used to be dropped without a trace.
describe('node directive target', () => {
  const mark = craftNodeDirective('mark', [], ({ element }) => {
    element.setAttribute('data-marked', '');
  });
  const Inner = craftComponent('Inner', {}, () => span('inner'));

  it('mounts a node directive piped onto an element', async () => {
    const View = craftComponent('OnElement', {}, () =>
      div([span('inner').pipe(mark)]),
    );
    const view = await renderCraftComponent(View);

    expect(view.element.querySelector('[data-marked]')).not.toBeNull();
  });

  it('mounts a node directive piped onto an element that wraps a component call', async () => {
    const View = craftComponent('OnWrapper', {}, () =>
      div([div([Inner({})]).pipe(mark)]),
    );
    const view = await renderCraftComponent(View);

    expect(view.element.querySelector('[data-marked]')?.textContent).toBe(
      'inner',
    );
  });

  it('rejects a node directive piped onto a component call, naming the directive and the component', () => {
    expect(() => Inner({}).pipe(mark)).toThrowError(TypeError);
    expect(() => Inner({}).pipe(mark)).toThrowError(
      /Node directive "mark" cannot be piped onto component "Inner".*Pipe it onto an element instead/,
    );
  });

  it('fails the render instead of rendering the component without the directive', async () => {
    const View = craftComponent('OnComponent', {}, () =>
      div([Inner({}).pipe(mark)]),
    );

    await expect(renderCraftComponent(View)).rejects.toThrowError(
      /Node directive "mark" cannot be piped onto component "Inner"/,
    );
  });

  it('rejects a node directive piped onto a non-element block', () => {
    const items = () => ['a'];
    expect(() =>
      forNode(items, { track: (item) => item }, (item) => span(item)).pipe(
        mark,
      ),
    ).toThrowError(
      /Node directive "mark" cannot be piped onto a "for" node.*Pipe it onto an element instead/,
    );
  });
});
