// A module loaded lazily by `defer-node-pick.spec.ts`. Named `*.test.ts` so it
// stays out of the library build and is not collected as a test suite.
import { craftExpose, craftService } from '@craft-ts/core';
import { craftComponent, p } from '../index';
import type { Input } from './types';

const { DeferPickCounter, provideDeferPickCounter } = craftService(
  { name: 'DeferPickCounter', providedIn: 'toProvide' },
  function* () {
    yield* craftExpose('label', 'counted');
  },
);

export { provideDeferPickCounter };

/** Needs a service its parent must provide. */
export const DeferPickPanel = craftComponent(
  'DeferPickPanel',
  {},
  function* () {
    const counter = yield* DeferPickCounter();
    return p({ class: 'picked-panel' }, counter.label);
  },
);

/** Has a required input. */
export const DeferPickTitled = craftComponent(
  'DeferPickTitled',
  {},
  (inputs: { readonly title: Input<string> }) =>
    p({ class: 'picked-titled' }, inputs.title),
);

export const deferPickNotAComponent = 42;
