import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect } from 'effect';
import { afterEach, describe, expect, it } from 'vitest';
import { createStoreLayer, StoreRepository, StoreError } from './database';
import type { CartLine } from '../shared/model';

const directories: string[] = [];
async function withStore<A>(run: (path: string) => Promise<A>): Promise<A> {
  const directory = await mkdtemp(join(tmpdir(), 'craft-ecommerce-'));
  directories.push(directory);
  return run(join(directory, 'store.json'));
}
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });

const execute = <A>(path: string, run: (repository: StoreRepository['Service']) => Effect.Effect<A, StoreError>) =>
  Effect.runPromise(Effect.gen(function* () { return yield* run(yield* StoreRepository); }).pipe(Effect.provide(createStoreLayer(path))));

describe('ecommerce Effect repository', () => {
  it('persists category and product CRUD and resets to the seed catalog', async () => withStore(async (path) => {
    await execute(path, (repository) => repository.saveCategory({ id: 'seasonal', name: 'Saison', description: 'Temporaire' }));
    await execute(path, (repository) => repository.saveProduct({ kind: 'simple', id: 'muffin', name: 'Muffin', description: 'Myrtille', categoryId: 'seasonal', price: 4, stock: 7 }));
    expect(JSON.parse(await readFile(path, 'utf8')).products.some((product: { id: string }) => product.id === 'muffin')).toBe(true);
    await execute(path, (repository) => repository.saveProduct({ kind: 'simple', id: 'muffin', name: 'Muffin maison', description: 'Myrtille et citron', categoryId: 'seasonal', price: 4.5, stock: 6 }));
    expect((await execute(path, (repository) => repository.read())).products.find((product) => product.id === 'muffin')?.name).toBe('Muffin maison');
    await expect(execute(path, (repository) => repository.deleteCategory('seasonal'))).rejects.toThrow('utilisée');
    await execute(path, (repository) => repository.deleteProduct('muffin'));
    await execute(path, (repository) => repository.deleteCategory('seasonal'));
    await execute(path, (repository) => repository.saveCategory({ id: 'seasonal', name: 'Saison', description: 'Temporaire' }));
    await execute(path, (repository) => repository.saveProduct({ kind: 'formule', id: 'season-box', name: 'Boîte saison', description: 'Formule saisonnière', categoryId: 'coffee', price: 9, groups: [{ id: 'season-group', categoryId: 'seasonal', min: 0, max: 1 }] }));
    await expect(execute(path, (repository) => repository.deleteCategory('seasonal'))).rejects.toThrow('utilisée');
    await execute(path, (repository) => repository.reset());
    const data = await execute(path, (repository) => repository.read());
    expect(data.categories.map((category) => category.id)).toContain('coffee');
    expect(data.products.some((product) => product.id === 'muffin')).toBe(false);
  }));

  it('validates distinct formula choices, checks stock, records an order and decrements components', async () => withStore(async (path) => {
    const valid: CartLine[] = [{ productId: 'pause-cafe', quantity: 2, selections: [{ groupId: 'pause-pastry', productIds: ['croissant'] }, { groupId: 'pause-drink', productIds: ['iced-tea'] }] }];
    const invalid: CartLine[] = [{ productId: 'pause-cafe', quantity: 1, selections: [{ groupId: 'pause-pastry', productIds: [] }, { groupId: 'pause-drink', productIds: [] }] }];
    await expect(execute(path, (repository) => repository.checkout(invalid))).rejects.toThrow('bornes');
    await expect(execute(path, (repository) => repository.checkout([{ ...valid[0], selections: [{ groupId: 'pause-pastry', productIds: ['croissant', 'croissant'] }, valid[0].selections![1]] }]))).rejects.toThrow('bornes');
    const order = await execute(path, (repository) => repository.checkout(valid));
    expect(order.total).toBe(16);
    const data = await execute(path, (repository) => repository.read());
    expect(data.orders).toHaveLength(1);
    const croissant = data.products.find((product) => product.id === 'croissant');
    const icedTea = data.products.find((product) => product.id === 'iced-tea');
    expect(croissant?.kind === 'simple' ? croissant.stock : undefined).toBe(10);
    expect(icedTea?.kind === 'simple' ? icedTea.stock : undefined).toBe(13);
    await expect(execute(path, (repository) => repository.checkout([{ productId: 'croissant', quantity: 99 }]))).rejects.toThrow('Stock insuffisant');
    await expect(execute(path, (repository) => repository.checkout([{ productId: 'pause-cafe', quantity: 1, selections: [{ groupId: 'pause-pastry', productIds: ['iced-tea'] }, { groupId: 'pause-drink', productIds: [] }] }]))).rejects.toThrow('catégorie');
  }));
});
