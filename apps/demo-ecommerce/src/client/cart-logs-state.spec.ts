import { describe, expect, it } from 'vitest';
import { craftUse, setupCraftServiceTest } from '@craft-ts/core';
import { CartLogsPageState } from './cart-logs-state';

function cart() {
  return setupCraftServiceTest(CartLogsPageState, {}).sut;
}

describe('the replay cart', () => {
  it('adds a product in stock, and counts it once per unit', () => {
    const sut = cart();
    sut.addProduct('espresso');
    sut.addProduct('espresso');
    sut.addProduct('flat-white');

    expect(craftUse(sut.itemCount())).toBe(3);
    expect(craftUse(sut.total())).toBe(3.5 * 2 + 5);
  });

  it('ignores a product it does not sell', () => {
    const sut = cart();
    sut.addProduct('unknown');

    expect(craftUse(sut.itemCount())).toBe(0);
  });

  it('drops a line whose quantity reaches zero', () => {
    const sut = cart();
    sut.addProduct('croissant');
    sut.changeQuantity('croissant', 2);
    expect(craftUse(sut.itemCount())).toBe(3);

    sut.changeQuantity('croissant', -3);
    expect(craftUse(sut.itemCount())).toBe(0);
  });

  it('removes one product and empties the rest', () => {
    const sut = cart();
    sut.addProduct('cookie');
    sut.addProduct('iced-tea');

    sut.removeProduct('cookie');
    expect(craftUse(sut.total())).toBe(4.5);

    sut.emptyCart();
    expect(craftUse(sut.total())).toBe(0);
  });
});
