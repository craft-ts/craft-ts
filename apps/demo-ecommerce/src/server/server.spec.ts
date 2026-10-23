import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { craftException, executeGeneratorCompatibleFactoryAsync, isCraftException, provideServerFunctionTransport, readServerFunctionFailure, CraftTestBed } from '@craft-ts/core';
import { catalog, categoryDelete, categorySave, placeOrder, productDelete, productSave, reset } from '../client/api';
import { createDemoApplication } from './server';
import type { CartLine, Product } from '../shared/model';

const directories: string[] = [];
let directory: string;

beforeEach(async () => {
  CraftTestBed.resetTestingModule();
  directory = await mkdtemp(join(tmpdir(), 'craft-ecommerce-http-'));
  directories.push(directory);
  const application = createDemoApplication(join(directory, 'store.json'));
  CraftTestBed.configureTestingModule({
    providers: [provideServerFunctionTransport(async (request) => {
      const response = await application.handle(new Request('http://ecommerce.test/__server-functions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
      }));
      const body: unknown = await response.json();
      if (response.ok) return body;
      const failure = readServerFunctionFailure(body);
      if (failure) return craftException({ _tag: failure._tag, scope: 'ServerFunction', identifier: request.id }, failure);
      return craftException({ _tag: 'HttpError', scope: 'ServerFunctionClient', identifier: request.id }, { status: response.status });
    })],
  });
});

afterEach(async () => {
  CraftTestBed.resetTestingModule();
  await Promise.all(directories.splice(0).map((item) => rm(item, { recursive: true, force: true })));
});

async function invoke<Input, Output>(client: (input: Input) => Generator<unknown, Output, unknown>, input: Input): Promise<Output> {
  const invocation = CraftTestBed.runInInjectionContext(() => client(input));
  const result = await executeGeneratorCompatibleFactoryAsync({ factory: () => invocation, thisArg: undefined, getInjector: () => CraftTestBed.rootInjector, args: [], invalidYieldErrorMessage: 'invalid e-commerce server function yield' });
  if (result.kind !== 'done') throw new Error(`server function did not settle: ${result.kind}`);
  return result.value as Output;
}

describe('e-commerce server functions', () => {
  it('supports typed category and product CRUD with persistence and category protection', async () => {
    await invoke(categorySave, { category: { id: 'seasonal', name: 'Saison', description: 'Édition limitée' } });
    const muffin = { kind: 'simple', id: 'muffin', name: 'Muffin', description: 'Myrtille', categoryId: 'seasonal', price: 4, stock: 7 } satisfies Product;
    await invoke(productSave, { product: muffin });
    const saved = await invoke(catalog, {});
    expect(saved.categories.some((category) => category.id === 'seasonal')).toBe(true);
    expect(saved.products.find((product) => product.id === 'muffin')).toEqual(muffin);

    const updated = { ...muffin, name: 'Muffin maison', price: 4.5, stock: 6 };
    await invoke(productSave, { product: updated });
    expect((await invoke(catalog, {})).products.find((product) => product.id === 'muffin')).toEqual(updated);
    expect(isCraftException(await invoke(categoryDelete, { id: 'seasonal' }))).toBe(true);

    await invoke(productDelete, { id: 'muffin' });
    await invoke(categoryDelete, { id: 'seasonal' });
    const reloaded = await invoke(catalog, {});
    expect(reloaded.categories.some((category) => category.id === 'seasonal')).toBe(false);
    expect(reloaded.products.some((product) => product.id === 'muffin')).toBe(false);
  });

  it('persists checkout, component stock changes and reset through the client/server registry', async () => {
    const initial = await invoke(catalog, {});
    const order = await invoke(placeOrder, { lines: [{ productId: 'pause-cafe', quantity: 2, selections: [{ groupId: 'pause-pastry', productIds: ['croissant'] }, { groupId: 'pause-drink', productIds: ['iced-tea'] }] }] satisfies readonly CartLine[] });
    expect(order.total).toBe(16);
    const reloaded = await invoke(catalog, {});
    expect(reloaded.orders).toHaveLength(1);
    const croissant = reloaded.products.find((product) => product.id === 'croissant');
    const icedTea = reloaded.products.find((product) => product.id === 'iced-tea');
    expect(croissant?.kind === 'simple' ? croissant.stock : undefined).toBe(10);
    expect(icedTea?.kind === 'simple' ? icedTea.stock : undefined).toBe(13);
    expect(await invoke(reset, {})).toMatchObject({ products: initial.products, orders: [] });
  });

  it('returns a typed failure and leaves the order list unchanged when stock is too low', async () => {
    const result = await invoke(placeOrder, { lines: [{ productId: 'croissant', quantity: 999 }] });
    expect(isCraftException(result)).toBe(true);
    expect(result).toMatchObject({ _tag: 'StoreError' });
    expect((await invoke(catalog, {})).orders).toHaveLength(0);
  });
});
