import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { craftException, executeGeneratorCompatibleFactoryAsync, isCraftException, provideServerFunctionTransport, readServerFunctionFailure, CraftTestBed } from '@craft-ts/core';
import { adminOverview, catalog, categoryDelete, categorySave, placeOrder, productDelete, productSave, reset, signIn } from '../client/api';
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

async function adminToken(): Promise<string> {
  const session = await invoke(signIn, { email: 'camille@atelier.demo', password: 'atelier-admin' });
  if (isCraftException(session)) throw new Error('demo admin sign-in failed');
  return session.token;
}

describe('e-commerce authentication', () => {
  it('signs in the demo accounts and rejects a wrong password', async () => {
    const admin = await invoke(signIn, { email: 'Camille@atelier.demo ', password: 'atelier-admin' });
    expect(admin).toMatchObject({ user: { id: 'camille', role: 'admin' } });
    expect(await invoke(signIn, { email: 'camille@atelier.demo', password: 'nope' })).toMatchObject({ _tag: 'AuthError', payload: { code: 'AUTH_REQUIRED' } });
    expect(await invoke(signIn, { email: 'personne@atelier.demo', password: 'atelier-admin' })).toMatchObject({ _tag: 'AuthError' });
  });

  it('refuses admin functions without an admin session, whatever the browser claims', async () => {
    const client = await invoke(signIn, { email: 'leo@atelier.demo', password: 'atelier-client' });
    if (isCraftException(client)) throw new Error('demo client sign-in failed');
    const product = { kind: 'simple', id: 'intrus', name: 'Intrus', description: '', categoryId: 'coffee', price: 1, stock: 1 } satisfies Product;
    expect(await invoke(productSave, { token: 'forged', product })).toMatchObject({ payload: { code: 'AUTH_REQUIRED' } });
    expect(await invoke(productSave, { token: client.token, product })).toMatchObject({ payload: { code: 'FORBIDDEN' } });
    expect(await invoke(adminOverview, { token: client.token })).toMatchObject({ payload: { code: 'FORBIDDEN' } });
    expect((await invoke(catalog, {})).products.some((row) => row.id === 'intrus')).toBe(false);
  });

  it('lets a product manager open the administration but not modify a product', async () => {
    const manager = await invoke(signIn, { email: 'ines@atelier.demo', password: 'atelier-produit' });
    if (isCraftException(manager)) throw new Error('demo product manager sign-in failed');
    expect(manager.user.role).toBe('product-manager');
    const overview = await invoke(adminOverview, { token: manager.token });
    expect(isCraftException(overview)).toBe(false);
    const croissant = overview.products.find((product) => product.id === 'croissant');
    if (croissant?.kind !== 'simple') throw new Error('seed croissant missing');
    expect(await invoke(productSave, { token: manager.token, product: { ...croissant, price: 9 } })).toMatchObject({ payload: { code: 'FORBIDDEN' } });
    expect(await invoke(productDelete, { token: manager.token, id: 'croissant' })).toMatchObject({ payload: { code: 'FORBIDDEN' } });
    expect((await invoke(catalog, {})).products.find((product) => product.id === 'croissant')?.price).toBe(3);
  });

  it('keeps orders out of the public catalogue', async () => {
    await invoke(placeOrder, { lines: [{ productId: 'croissant', quantity: 1 }] });
    expect(await invoke(catalog, {})).not.toHaveProperty('orders');
    expect((await invoke(adminOverview, { token: await adminToken() })).orders).toHaveLength(1);
  });
});

describe('e-commerce server functions', () => {
  it('supports typed category and product CRUD with persistence and category protection', async () => {
    const token = await adminToken();
    await invoke(categorySave, { token, category: { id: 'seasonal', name: 'Saison', description: 'Édition limitée' } });
    const muffin = { kind: 'simple', id: 'muffin', name: 'Muffin', description: 'Myrtille', categoryId: 'seasonal', price: 4, stock: 7 } satisfies Product;
    await invoke(productSave, { token, product: muffin });
    const saved = await invoke(catalog, {});
    expect(saved.categories.some((category) => category.id === 'seasonal')).toBe(true);
    expect(saved.products.find((product) => product.id === 'muffin')).toEqual(muffin);

    const updated = { ...muffin, name: 'Muffin maison', price: 4.5, stock: 6 };
    await invoke(productSave, { token, product: updated });
    expect((await invoke(catalog, {})).products.find((product) => product.id === 'muffin')).toEqual(updated);
    expect(isCraftException(await invoke(categoryDelete, { token, id: 'seasonal' }))).toBe(true);

    await invoke(productDelete, { token, id: 'muffin' });
    await invoke(categoryDelete, { token, id: 'seasonal' });
    const reloaded = await invoke(catalog, {});
    expect(reloaded.categories.some((category) => category.id === 'seasonal')).toBe(false);
    expect(reloaded.products.some((product) => product.id === 'muffin')).toBe(false);
  });

  it('persists checkout, component stock changes and reset through the client/server registry', async () => {
    const initial = await invoke(catalog, {});
    const order = await invoke(placeOrder, { lines: [{ productId: 'pause-cafe', quantity: 2, selections: [{ groupId: 'pause-pastry', productIds: ['croissant'] }, { groupId: 'pause-drink', productIds: ['iced-tea'] }] }] satisfies readonly CartLine[] });
    expect(order.total).toBe(16);
    const token = await adminToken();
    const reloaded = await invoke(adminOverview, { token });
    expect(reloaded.orders).toHaveLength(1);
    const croissant = reloaded.products.find((product) => product.id === 'croissant');
    const icedTea = reloaded.products.find((product) => product.id === 'iced-tea');
    expect(croissant?.kind === 'simple' ? croissant.stock : undefined).toBe(10);
    expect(icedTea?.kind === 'simple' ? icedTea.stock : undefined).toBe(13);
    expect(await invoke(reset, { token })).toMatchObject({ products: initial.products, orders: [] });
  });

  it('returns a typed failure and leaves the order list unchanged when stock is too low', async () => {
    const result = await invoke(placeOrder, { lines: [{ productId: 'croissant', quantity: 999 }] });
    expect(isCraftException(result)).toBe(true);
    expect(result).toMatchObject({ _tag: 'StoreError' });
    expect((await invoke(adminOverview, { token: await adminToken() })).orders).toHaveLength(0);
  });
});
