import {
  Console,
  craftComputed,
  craftMethod,
  craftService,
  state,
} from '@craft-ts/core';
import type { CartLine, Product } from '../shared/model';
import { initialStore } from '../shared/model';

const products = initialStore.products.filter(
  (product): product is Extract<Product, { kind: 'simple' }> =>
    product.kind === 'simple',
);

function* logAction(
  name: string,
  args: Readonly<Record<string, unknown>>,
): Generator<unknown, void, unknown> {
  yield* Console.info('[métier panier]', { event: name, args });
}

/** A route-scoped cart used to generate business logs for replay sessions. */
export const { CartLogsPageState, provideCartLogsPageState } = craftService(
  { name: 'cartLogsPageState', providedIn: 'toProvide' },
  function* () {
    const lines = yield* state(
      'lines',
      [] as readonly CartLine[],
      ({ set, update }) => ({
        add: function* (productId: string) {
          yield* logAction('cart.lines.add', { productId });
          yield* update((current) => {
            const existing = current.find((line) => line.productId === productId);
            return existing
              ? current.map((line) =>
                  line.productId === productId
                    ? { ...line, quantity: line.quantity + 1 }
                    : line,
                )
              : [...current, { productId, quantity: 1 }];
          });
        },
        adjust: function* (productId: string, delta: number) {
          yield* logAction('cart.lines.adjust', { productId, delta });
          yield* update((current) =>
            current.flatMap((line) => {
              if (line.productId !== productId) return [line];
              const quantity = line.quantity + delta;
              return quantity > 0 ? [{ ...line, quantity }] : [];
            }),
          );
        },
        remove: function* (productId: string) {
          yield* logAction('cart.lines.remove', { productId });
          yield* update((current) =>
            current.filter((line) => line.productId !== productId),
          );
        },
        clear: function* () {
          yield* logAction('cart.lines.clear', { previousLineCount: (yield* lines()).length });
          yield* set([]);
        },
      }),
    );

    yield* craftMethod('addProduct', function* (productId: string) {
      yield* logAction('cart.addProduct', { productId });
      const product = products.find((item) => item.id === productId);
      if (product && product.stock > 0) yield* lines.add(productId);
    });
    yield* craftMethod(
      'changeQuantity',
      function* (productId: string, delta: number) {
        yield* logAction('cart.changeQuantity', { productId, delta });
        if (delta !== 0) yield* lines.adjust(productId, delta);
      },
    );
    yield* craftMethod('removeProduct', function* (productId: string) {
      yield* logAction('cart.removeProduct', { productId });
      yield* lines.remove(productId);
    });
    yield* craftMethod('emptyCart', function* () {
      yield* logAction('cart.emptyCart', {});
      yield* lines.clear();
    });

    yield* craftComputed('products', () => products);
    yield* craftComputed('total', function* () {
      const current = yield* lines();
      return current.reduce((sum, line) => {
        const product = products.find((item) => item.id === line.productId);
        return sum + (product?.price ?? 0) * line.quantity;
      }, 0);
    });
    yield* craftComputed('itemCount', function* () {
      return (yield* lines()).reduce((count, line) => count + line.quantity, 0);
    });
  },
);
