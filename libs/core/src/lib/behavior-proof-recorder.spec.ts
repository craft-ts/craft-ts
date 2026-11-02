import { craftException } from './craft-exception';
import { craftMethod } from './craft-method';
import { craftService } from './craft-service';
import {
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

    expect(ɵstopBehaviorProofRecording()).toEqual([
      {
        key: 'invocation:service:basket / method:add',
        kind: 'invocation',
        detail: { outcome: 'succeeded' },
      },
    ]);
  });

  it('counts an exception value and a throw as failures', () => {
    ɵstartBehaviorProofRecording();
    const { sut } = setupCraftServiceTest(Basket, {});
    sut.reserve();
    expect(() => sut.crash()).toThrow('boom');

    expect(ɵstopBehaviorProofRecording()).toEqual([
      {
        key: 'invocation:service:basket / method:reserve',
        kind: 'invocation',
        detail: { outcome: 'failed', exception: 'OutOfStock' },
      },
      {
        key: 'invocation:service:basket / method:crash',
        kind: 'invocation',
        detail: { outcome: 'failed', exception: 'RangeError' },
      },
    ]);
  });

  it('records nothing outside a recording, nor once its providers are gone', () => {
    setupCraftServiceTest(Basket, {}).sut.add('a');
    expect(ɵstopBehaviorProofRecording()).toEqual([]);

    unregister();
    ɵstartBehaviorProofRecording();
    setupCraftServiceTest(Basket, {}).sut.add('a');
    expect(ɵstopBehaviorProofRecording()).toEqual([]);
  });
});
