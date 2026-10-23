import { fileURLToPath } from 'node:url';
import { Context, Effect, Layer } from 'effect';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { initialStore, type Category, type CartLine, type Order, type Product, type StoreData } from '../shared/model';

export class StoreError extends Error {
  readonly _tag = 'StoreError';
}

export class StoreRepository extends Context.Service<StoreRepository, {
  readonly read: () => Effect.Effect<StoreData, StoreError>;
  readonly reset: () => Effect.Effect<StoreData, StoreError>;
  readonly saveProduct: (product: Product) => Effect.Effect<StoreData, StoreError>;
  readonly deleteProduct: (id: string) => Effect.Effect<StoreData, StoreError>;
  readonly saveCategory: (category: Category) => Effect.Effect<StoreData, StoreError>;
  readonly deleteCategory: (id: string) => Effect.Effect<StoreData, StoreError>;
  readonly checkout: (lines: readonly CartLine[]) => Effect.Effect<Order, StoreError>;
}>()('ecommerce/StoreRepository') {}

const databasePath = fileURLToPath(new URL('../../data/store.json', import.meta.url));
const cloneInitial = (): StoreData => structuredClone(initialStore);

export function createStoreLayer(path = databasePath) {
  let writes = Promise.resolve();
  const update = <A>(f: (data: StoreData) => { readonly data: StoreData; readonly value: A }): Effect.Effect<A, StoreError> =>
    Effect.tryPromise({
      try: async () => {
        let result!: A;
        const next = writes.then(async () => {
          let data: StoreData;
          try { data = JSON.parse(await readFile(path, 'utf8')) as StoreData; }
          catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            data = cloneInitial();
          }
          const updated = f(data);
          await mkdir(dirname(path), { recursive: true });
          await writeFile(path, `${JSON.stringify(updated.data, null, 2)}\n`, 'utf8');
          result = updated.value;
        });
        writes = next.catch(() => undefined);
        await next;
        return result;
      },
      catch: (cause) => new StoreError(String(cause)),
    });
  const read = () => update((data) => ({ data, value: data }));
  const service: StoreRepository['Service'] = {
    read,
    reset: () => update(() => ({ data: cloneInitial(), value: cloneInitial() })),
    saveProduct: (product) => update((data) => {
      if (!data.categories.some((category) => category.id === product.categoryId)) throw new StoreError('La catégorie du produit est introuvable.');
      if (!Number.isFinite(product.price) || product.price < 0) throw new StoreError('Le prix doit être positif.');
      if (product.kind === 'simple' && (!Number.isInteger(product.stock) || product.stock < 0)) throw new StoreError('Le stock doit être un entier positif.');
      if (product.kind === 'formule') for (const group of product.groups) {
        if (!data.categories.some((category) => category.id === group.categoryId)) throw new StoreError('La catégorie d’un groupe est introuvable.');
        if (!Number.isInteger(group.min) || !Number.isInteger(group.max) || group.min < 0 || group.max < group.min) throw new StoreError('Les bornes du groupe sont invalides.');
      }
      const products = [...data.products.filter((row) => row.id !== product.id), product];
      return { data: { ...data, products }, value: { ...data, products } };
    }),
    deleteProduct: (id) => update((data) => {
      const products = data.products.filter((product) => product.id !== id);
      return { data: { ...data, products }, value: { ...data, products } };
    }),
    saveCategory: (category) => update((data) => {
      const categories = [...data.categories.filter((row) => row.id !== category.id), category];
      return { data: { ...data, categories }, value: { ...data, categories } };
    }),
    deleteCategory: (id) => update((data) => {
      const usedByProduct = data.products.some((product) => product.categoryId === id || (product.kind === 'formule' && product.groups.some((group) => group.categoryId === id)));
      if (usedByProduct) throw new StoreError('Cette catégorie est utilisée par un produit ou une formule.');
      const categories = data.categories.filter((category) => category.id !== id);
      return { data: { ...data, categories }, value: { ...data, categories } };
    }),
    checkout: (lines) => update((data) => {
      if (!lines.length) throw new StoreError('Le panier est vide.');
      const products = new Map(data.products.map((product) => [product.id, product]));
      const consumption = new Map<string, number>();
      let total = 0;
      for (const line of lines) {
        if (!Number.isInteger(line.quantity) || line.quantity < 1) throw new StoreError('Quantité invalide.');
        const product = products.get(line.productId);
        if (!product) throw new StoreError('Un produit du panier n’existe plus.');
        total += product.price * line.quantity;
        if (product.kind === 'simple') consumption.set(product.id, (consumption.get(product.id) ?? 0) + line.quantity);
        else {
          const selections = line.selections ?? [];
          if (selections.length !== product.groups.length || new Set(selections.map((entry) => entry.groupId)).size !== product.groups.length) throw new StoreError('La composition de la formule est incomplète.');
          for (const group of product.groups) {
            const selection = selections.find((entry) => entry.groupId === group.id);
            const ids = selection?.productIds ?? [];
            if (new Set(ids).size !== ids.length || ids.length < group.min || ids.length > group.max) throw new StoreError('Les choix de la formule ne respectent pas les bornes.');
            for (const id of ids) {
              const component = products.get(id);
              if (!component || component.kind !== 'simple' || component.categoryId !== group.categoryId) throw new StoreError('Un composant ne correspond pas à la catégorie du groupe.');
              consumption.set(id, (consumption.get(id) ?? 0) + line.quantity);
            }
          }
        }
      }
      for (const [id, quantity] of consumption) {
        const product = products.get(id);
        if (!product || product.kind !== 'simple' || product.stock < quantity) throw new StoreError(`Stock insuffisant : ${product?.name ?? id}.`);
      }
      const updatedProducts = data.products.map((product) => {
        if (product.kind !== 'simple') return product;
        const used = consumption.get(product.id) ?? 0;
        return used > 0 ? { ...product, stock: product.stock - used } : product;
      });
      const order: Order = { id: `order-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, createdAt: new Date().toISOString(), lines, total };
      return { data: { ...data, products: updatedProducts, orders: [...data.orders, order] }, value: order };
    }),
  };
  return Layer.succeed(StoreRepository)(service);
}
