import { craftException } from './craft-exception';
import { craftMethod } from './craft-method';
import { craftService } from './craft-service';
import { ɵprovideBehaviorMutant } from './behavior-mutant';
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

describe('behaviour mutant', () => {
  let unregister = () => undefined as void;
  afterEach(() => unregister());

  it('skips the invocation it targets, and only that one', () => {
    let applied = 0;
    unregister = ɵregisterCraftTestProviders([
      ɵprovideBehaviorMutant(
        { keys: ['invocation:service:basket / method:add'], mode: 'skip' },
        () => applied++,
      ),
    ]);
    const { sut } = setupCraftServiceTest(Basket, {});

    expect(sut.add('a')).toBeUndefined();
    expect(sut.reserve()).toMatchObject({ _tag: 'OutOfStock' });
    expect(applied).toBe(1);
  });

  it('turns an exception value or a throw into an empty success', () => {
    let applied = 0;
    unregister = ɵregisterCraftTestProviders([
      ɵprovideBehaviorMutant(
        {
          keys: [
            'invocation:service:basket / method:reserve',
            'invocation:service:basket / method:crash',
            'invocation:service:basket / method:add',
          ],
          mode: 'succeed',
        },
        () => applied++,
      ),
    ]);
    const { sut } = setupCraftServiceTest(Basket, {});

    expect(sut.reserve()).toBeUndefined();
    expect(sut.crash()).toBeUndefined();
    // A success stays what it was: there is nothing to turn into one.
    expect(sut.add('a')).toBe('a');
    expect(applied).toBe(2);
  });
});
