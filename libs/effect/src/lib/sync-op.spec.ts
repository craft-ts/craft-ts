// The synchronous half of the bridge: an Effect its author declared
// synchronous, run in place inside a host the synchronous driver owns.
import {
  createCraftInjector,
  executeGeneratorCompatibleFactory,
  isCraftGenShortCircuit,
  type AnyCraftException,
} from '@craft-ts/core';
import { Context, Data, Effect, Layer } from 'effect';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { provideLayer } from './effect-level';
import { installCraftEffectBridge, runEffect } from './run-effect';
import { CraftEffectNotSynchronous, SyncOp, syncEffect } from './sync-op';

class PriceUnavailable extends Data.TaggedError('PriceUnavailable')<{
  readonly sku: string;
}> {}

type PricingShape = {
  readonly lineTotal: (qty: number) => Effect.Effect<number, never, SyncOp>;
  readonly reject: (sku: string) => Effect.Effect<never, PriceUnavailable, SyncOp>;
};

class Pricing extends Context.Service<Pricing, PricingShape>()(
  'sync-op-spec/Pricing',
) {}

const pricingLayer = Layer.sync(Pricing)(() => ({
  lineTotal: (qty: number) => Effect.succeed(qty * 250),
  reject: (sku: string) => Effect.fail(new PriceUnavailable({ sku })),
}));

// ---------------------------------------------------------------------------
// Type-level half. The runtime cannot observe these: an Effect nobody declared
// synchronous must be refused AT THE CALL, before anything runs.
// ---------------------------------------------------------------------------

const asyncMember = (sku: string) =>
  Effect.gen(function* () {
    yield* Effect.sleep('5 millis');
    return sku;
  });

function* _typeChecks() {
  // ✅ declared synchronous — accepted in a synchronous host.
  yield* syncEffect(
    Effect.gen(function* () {
      yield* SyncOp;
      return 1;
    }),
  );

  // ✅ requirements left for the level to satisfy travel through untouched, as
  // long as SyncOp is among them.
  yield* syncEffect(
    Effect.gen(function* () {
      yield* SyncOp;
      const service = yield* Pricing;
      return yield* service.lineTotal(1);
    }),
  );

  // ❌ nobody declared it synchronous.
  // @ts-expect-error NotDeclaredSynchronous
  yield* syncEffect(asyncMember('sku-1'));

  // ❌ a bare pure Effect is not a declaration either — say so explicitly.
  // @ts-expect-error NotDeclaredSynchronous
  yield* syncEffect(Effect.succeed(1));
}

// A member declared synchronous stays usable from an asynchronous host too:
// `runEffect` tolerates phantom requirements, real ones it still refuses.
// (The effects are hoisted so each directive sits on the line tsc blames.)
const declaredSync = Effect.gen(function* () {
  yield* SyncOp;
  return 'still fine in a loader';
});

const needsPricing = Effect.gen(function* () {
  const service = yield* Pricing;
  return yield* service.lineTotal(1);
});

function* _phantomRequirementsAreNotRealOnes() {
  yield* runEffect(declaredSync);

  // @ts-expect-error MissingRequirements<Pricing>
  yield* runEffect(needsPricing);
}

describe('syncEffect', () => {
  let dispose: () => void;

  beforeEach(() => {
    dispose = installCraftEffectBridge();
  });

  afterEach(() => {
    dispose();
  });

  const drive = (
    factory: () => unknown,
    providers: readonly unknown[] = [],
  ) => {
    const injector = createCraftInjector(providers as never);
    return executeGeneratorCompatibleFactory({
      factory,
      thisArg: undefined,
      getInjector: () => injector,
      args: [],
      invalidYieldErrorMessage: 'invalid yield',
      multipleAppStartErrorMessage: 'multiple app start',
    });
  };

  it('resolves on the same tick, inside a synchronous host', () => {
    const double = Effect.gen(function* () {
      yield* SyncOp;
      return 21 * 2;
    });

    const value = drive(function* () {
      return yield* syncEffect(double);
    });

    expect(value).toBe(42);
  });

  it('satisfies the requirements from the level in force', () => {
    const value = drive(
      function* () {
        const pricing = yield* syncEffect(
          Effect.gen(function* () {
            yield* SyncOp;
            const service = yield* Pricing;
            return yield* service.lineTotal(3);
          }),
        );
        return pricing;
      },
      [provideLayer(pricingLayer)],
    );

    expect(value).toBe(750);
  });

  it('routes a typed failure to the craft exception channel', () => {
    let caught: unknown;
    try {
      drive(
        function* () {
          yield* syncEffect(
            Effect.gen(function* () {
              yield* SyncOp;
              const service = yield* Pricing;
              return yield* service.reject('sku-1');
            }),
          );
          return 'unreachable';
        },
        [provideLayer(pricingLayer)],
      );
    } catch (error) {
      caught = error;
    }

    expect(isCraftGenShortCircuit(caught)).toBe(true);
    const exception = (caught as { exception: AnyCraftException }).exception;
    expect(exception._tag).toBe('PriceUnavailable');
  });

  it('fails loudly when a declared-synchronous Effect suspends', () => {
    expect(() =>
      drive(function* () {
        yield* syncEffect(
          Effect.gen(function* () {
            yield* SyncOp;
            yield* Effect.sleep('5 millis');
            return 'too late';
          }),
          { label: 'Pricing.lineTotal' },
        );
        return 'unreachable';
      }),
    ).toThrow(CraftEffectNotSynchronous);
  });

  it('names the offending member in the failure message', () => {
    expect(() =>
      drive(function* () {
        yield* syncEffect(
          Effect.gen(function* () {
            yield* SyncOp;
            yield* Effect.promise(() => Promise.resolve(1));
            return 'too late';
          }),
          { label: 'Pricing.lineTotal' },
        );
        return 'unreachable';
      }),
    ).toThrow(/"Pricing\.lineTotal" is declared synchronous/);
  });

  it('rethrows a defect untouched — a bug is not a business outcome', () => {
    const boom = new Error('boom');

    expect(() =>
      drive(function* () {
        yield* syncEffect(
          Effect.gen(function* () {
            yield* SyncOp;
            return yield* Effect.die(boom);
          }),
        );
        return 'unreachable';
      }),
    ).toThrow(boom);
  });
});
