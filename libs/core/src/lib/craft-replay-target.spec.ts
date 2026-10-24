import { describe, expect, it } from 'vitest';
import {
  ɵcaptureCraftReplayTarget,
  ɵregisterCraftReplayTarget,
  ɵresolveCraftReplayTarget,
} from './craft-replay-target';

describe('Craft replay target runtime index', () => {
  it('captures an opaque address and resolves the live Craft node', () => {
    document.body.innerHTML = '<button id="target">private label</button>';
    const element = document.querySelector('button')!;
    const unregister = ɵregisterCraftReplayTarget(element, [
      'Account',
      'for:secret-email@example.test',
      'button',
    ]);

    const target = ɵcaptureCraftReplayTarget(element, {
      selector: '#target',
      clientX: 12,
      clientY: 34,
    })!;

    expect(JSON.stringify(target)).not.toContain('secret-email@example.test');
    expect(JSON.stringify(target)).not.toContain('private label');
    expect(ɵresolveCraftReplayTarget(target)).toEqual({
      status: 'resolved',
      element,
    });

    unregister();
    expect(ɵresolveCraftReplayTarget(target)).toEqual({ status: 'missing' });
  });

  it('resolves an unregistered DOM descendant through its Craft render parent', () => {
    document.body.innerHTML = '<button><span><strong>label</strong></span></button>';
    const button = document.querySelector('button')!;
    const strong = document.querySelector('strong')!;
    const unregister = ɵregisterCraftReplayTarget(button, ['Account', 'button']);

    const target = ɵcaptureCraftReplayTarget(strong)!;

    expect(target.localTargetPath).toEqual([0, 0]);
    expect(ɵresolveCraftReplayTarget(target)).toEqual({
      status: 'resolved',
      element: strong,
    });
    unregister();
  });

  it('keeps a remounted keyed target resolvable without retaining a stale node', () => {
    const first = document.createElement('button');
    document.body.append(first);
    const unregisterFirst = ɵregisterCraftReplayTarget(first, ['List', 'item:k1', 'button']);
    const target = ɵcaptureCraftReplayTarget(first)!;
    unregisterFirst();
    first.remove();

    const remounted = document.createElement('button');
    document.body.append(remounted);
    const unregisterRemounted = ɵregisterCraftReplayTarget(remounted, [
      'List',
      'item:k1',
      'button',
    ]);
    expect(ɵresolveCraftReplayTarget(target)).toEqual({
      status: 'resolved',
      element: remounted,
    });
    unregisterRemounted();
  });

  it('reports duplicate live render addresses as ambiguous', () => {
    const first = document.createElement('button');
    const second = document.createElement('button');
    document.body.append(first, second);
    const unregisterFirst = ɵregisterCraftReplayTarget(first, ['Repeated', 'same']);
    const target = ɵcaptureCraftReplayTarget(first)!;
    const unregisterSecond = ɵregisterCraftReplayTarget(second, ['Repeated', 'same']);

    expect(ɵresolveCraftReplayTarget(target)).toEqual({ status: 'ambiguous' });
    unregisterFirst();
    unregisterSecond();
  });

  it('marks position-derived collection addresses as unstable', () => {
    const element = document.createElement('button');
    document.body.append(element);
    const unregister = ɵregisterCraftReplayTarget(
      element,
      ['List', 'item:2', 'button'],
      false,
    );
    const target = ɵcaptureCraftReplayTarget(element)!;

    expect(target.stability).toBe('unstable');
    expect(ɵresolveCraftReplayTarget(target)).toEqual({
      status: 'unstable-identity',
    });
    unregister();
  });
});
