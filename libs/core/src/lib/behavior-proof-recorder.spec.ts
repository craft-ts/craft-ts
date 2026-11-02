import { craftException } from './craft-exception';
import { craftMethod } from './craft-method';
import { craftService } from './craft-service';
import {
  ɵbehaviorTarget,
  ɵprovideBehaviorProofRecording,
  ɵstartBehaviorProofRecording,
  ɵstopBehaviorProofRecording,
} from './behavior-proof-recorder';
import { ɵregisterCraftTestProviders } from './craft-test-providers';
import { setupCraftServiceTest } from './setup-craft-service-test';

const { Basket } = craftService(
  { name: 'basket', providedIn: 'toProvide' },
  function* () {
    yield* craftMethod('add', function* (id: string) {
      return id;
    });
    yield* craftMethod('reserve', function* () {
      return craftException({ _tag: 'OutOfStock' });
    });
    yield* craftMethod('crash', function* () {
      throw new RangeError('boom');
    });
  },
);

describe('behaviour proof recording', () => {
  let unregister: () => void;
  beforeEach(() => {
    unregister = ɵregisterCraftTestProviders([ɵprovideBehaviorProofRecording()]);
  });
  afterEach(() => {
    ɵstopBehaviorProofRecording();
    unregister();
  });

  it('records each settled invocation once, by its address, never the host being built', () => {
    ɵstartBehaviorProofRecording();
    const { sut } = setupCraftServiceTest(Basket, {});
    sut.add('a');
    sut.add('b');

    expect(ɵstopBehaviorProofRecording().steps).toEqual([
      {
        key: 'invocation:service:basket / method:add',
        kind: 'invocation',
        detail: { outcome: 'succeeded', behavior: 'basket.add' },
      },
    ]);
  });

  it('counts an exception value and a throw as failures', () => {
    ɵstartBehaviorProofRecording();
    const { sut } = setupCraftServiceTest(Basket, {});
    sut.reserve();
    expect(() => sut.crash()).toThrow('boom');

    expect(ɵstopBehaviorProofRecording().steps).toEqual([
      {
        key: 'invocation:service:basket / method:reserve',
        kind: 'invocation',
        detail: { outcome: 'failed', exception: 'OutOfStock', behavior: 'basket.reserve' },
      },
      {
        key: 'invocation:service:basket / method:crash',
        kind: 'invocation',
        detail: { outcome: 'failed', exception: 'RangeError', behavior: 'basket.crash' },
      },
    ]);
  });

  it('tells the steps an assertion came after from those none did', () => {
    ɵstartBehaviorProofRecording({
      assertions: () => expect.getState().assertionCalls,
    });
    const { sut } = setupCraftServiceTest(Basket, {});
    expect(sut.add('a')).toBe('a');
    expect(sut.reserve()).toMatchObject({ _tag: 'OutOfStock' });
    // vitest counts an assertion at `expect(…)`, before its matcher runs:
    // a call made by the matcher itself has no assertion after it.
    expect(() => sut.crash()).toThrow('boom');

    const { steps, observedSteps } = ɵstopBehaviorProofRecording();
    expect(steps.map((step) => step.key)).toEqual([
      'invocation:service:basket / method:add',
      'invocation:service:basket / method:reserve',
      'invocation:service:basket / method:crash',
    ]);
    expect(observedSteps).toBe(2);
  });

  it('records nothing outside a recording, nor once its providers are gone', () => {
    setupCraftServiceTest(Basket, {}).sut.add('a');
    expect(ɵstopBehaviorProofRecording().steps).toEqual([]);

    unregister();
    ɵstartBehaviorProofRecording();
    setupCraftServiceTest(Basket, {}).sut.add('a');
    expect(ɵstopBehaviorProofRecording().steps).toEqual([]);
  });

  it('names what an invocation runs the way the catalog does', () => {
    expect(ɵbehaviorTarget(['service:cart#2', 'mutation:addLine'])).toBe('cart.addLine');
    expect(
      ɵbehaviorTarget(['route:shop', 'component:CartPage#1', 'method:checkout']),
    ).toBe('CartPage.checkout');
    expect(ɵbehaviorTarget(['service:cart'])).toBeUndefined();
    expect(ɵbehaviorTarget(['method:orphan'])).toBeUndefined();
  });
});
