import { it, expect } from 'vitest';
import {
  ɵsettledValueReader,
  ɵsettledReader,
  ɵreadSettledScalar,
  ɵSCALAR_UNPROVEN,
} from './yieldable';
import { craftSignal } from './host/craft-signal';
it('proves all primitive constants without conflating undefined with a miss', () => {
  for (const value of [
    undefined,
    null,
    false,
    0,
    NaN,
    1n,
    'label',
    Symbol('value'),
  ])
    expect(ɵreadSettledScalar(ɵsettledValueReader(value))).toBe(value);
});
it('never probes arbitrary readers, reactive readers, object values or proxies', () => {
  let calls = 0;
  const dynamic = craftSignal(1);
  const unknown = new Proxy(
    () => {
      calls++;
      return 1;
    },
    {
      get() {
        throw Error('unexpected proxy read');
      },
    },
  );
  const object = new Proxy(
    { label: 1 },
    {
      get() {
        throw Error('unexpected object read');
      },
      getOwnPropertyDescriptor() {
        throw Error('unexpected descriptor');
      },
    },
  );
  for (const reader of [
    unknown,
    ɵsettledReader(() => dynamic()),
    ɵsettledValueReader(object),
    ɵsettledValueReader(() => 1),
  ])
    expect(ɵreadSettledScalar(reader)).toBe(ɵSCALAR_UNPROVEN);
  expect(calls).toBe(0);
});
