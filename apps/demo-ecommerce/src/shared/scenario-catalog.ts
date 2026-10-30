import { Schema } from 'effect';
import type {
  CartLine,
  Catalog,
  Category,
  Order,
  Product,
  ServerCart,
  StoreData,
} from './model.ts';
import type { AccountSession } from './accounts.ts';
import { initialStore } from './model.ts';

/** A bidirectional contract between a business value and the JSON text sent by
 * this demo's server functions. The outer server-function protocol transports
 * this text as a JSON string, so mocks must use `encode`, not a raw object. */
export type JsonTextCodec<Value> = Readonly<{
  encode(value: Value): string;
  decode(transport: string): Value;
}>;

function jsonTextCodec<Value>(schema: Schema.Schema<Value>): JsonTextCodec<Value> {
  const encode = Schema.encodeSync(schema as never) as unknown as (value: Value) => unknown;
  const decode = Schema.decodeUnknownSync(schema as never) as unknown as (value: unknown) => Value;
  return {
    encode: (value) => JSON.stringify(encode(value)),
    decode: (value) => decode(JSON.parse(value) as unknown),
  };
}

const category = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.String,
}) satisfies Schema.Schema<Category>;
const choiceGroup = Schema.Struct({
  id: Schema.String,
  categoryId: Schema.String,
  min: Schema.Number,
  max: Schema.Number,
});
const simpleProduct = Schema.Struct({
  kind: Schema.Literal('simple'),
  id: Schema.String,
  name: Schema.String,
  description: Schema.String,
  categoryId: Schema.String,
  price: Schema.Number,
  stock: Schema.Number,
  emoji: Schema.optional(Schema.String),
}) satisfies Schema.Schema<Extract<Product, { kind: 'simple' }>>;
const formulaProduct = Schema.Struct({
  kind: Schema.Literal('formule'),
  id: Schema.String,
  name: Schema.String,
  description: Schema.String,
  categoryId: Schema.String,
  price: Schema.Number,
  groups: Schema.Array(choiceGroup),
  emoji: Schema.optional(Schema.String),
}) satisfies Schema.Schema<Extract<Product, { kind: 'formule' }>>;
const product = Schema.Union([simpleProduct, formulaProduct]);
const selection = Schema.Struct({
  groupId: Schema.String,
  productIds: Schema.Array(Schema.String),
});
const cartLine = Schema.Struct({
  productId: Schema.String,
  quantity: Schema.Number,
  selections: Schema.optional(Schema.Array(selection)),
}) satisfies Schema.Schema<CartLine>;
const order = Schema.Struct({
  id: Schema.String,
  createdAt: Schema.String,
  lines: Schema.Array(cartLine),
  total: Schema.Number,
}) satisfies Schema.Schema<Order>;
const serverCart = Schema.Struct({
  id: Schema.String,
  lines: Schema.Array(cartLine),
}) satisfies Schema.Schema<ServerCart>;
const storeData = Schema.Struct({
  categories: Schema.Array(category),
  products: Schema.Array(product),
  orders: Schema.Array(order),
  carts: Schema.optional(Schema.Array(serverCart)),
}) satisfies Schema.Schema<StoreData>;
const catalog = Schema.Struct({
  categories: Schema.Array(category),
  products: Schema.Array(product),
}) satisfies Schema.Schema<Catalog>;
const accountSession = Schema.Struct({
  token: Schema.String,
  user: Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    email: Schema.String,
    role: Schema.Literals(['admin', 'product-manager', 'client']),
  }),
}) satisfies Schema.Schema<AccountSession>;
const okResult = Schema.Struct({ ok: Schema.Boolean });

export const ecommerceCodecs = {
  catalog: jsonTextCodec(catalog),
  products: jsonTextCodec<Product[]>(Schema.Array(product) as unknown as Schema.Schema<Product[]>),
  cart: jsonTextCodec(serverCart),
  accountSession: jsonTextCodec(accountSession),
  okResult: jsonTextCodec(okResult),
  order: jsonTextCodec(order),
  store: jsonTextCodec(storeData),
} as const;

/** Complete boundary inventory for the e-commerce pilot. These ids are the
 * same ids used by serverFunction declarations and recipe network matching. */
export const ecommerceOperations = [
  { operationId: 'ecommerce.catalog', title: 'Lire le catalogue public', route: '/', codec: 'catalog', mutates: false, exposedErrors: ['StoreError'] },
  { operationId: 'ecommerce.catalog.search', title: 'Rechercher des produits', route: '/', codec: 'products', mutates: false, exposedErrors: ['StoreError'] },
  { operationId: 'ecommerce.cart.create', title: 'Créer un panier serveur', route: '/cart', codec: 'cart', mutates: true, exposedErrors: [] },
  { operationId: 'ecommerce.cart.addLine', title: 'Modifier une ligne du panier', route: '/cart', codec: 'cart', mutates: true, exposedErrors: ['StoreError'] },
  { operationId: 'ecommerce.cart.get', title: 'Lire un panier serveur', route: '/cart', codec: 'cart', mutates: false, exposedErrors: ['StoreError'] },
  { operationId: 'ecommerce.auth.login', title: 'Ouvrir une session', route: '/login', codec: 'accountSession', mutates: true, exposedErrors: ['AuthError'] },
  { operationId: 'ecommerce.auth.me', title: 'Lire la session courante', route: '/account', codec: 'accountSession', mutates: false, exposedErrors: ['AuthError'] },
  { operationId: 'ecommerce.auth.logout', title: 'Fermer une session', route: '/account', codec: 'okResult', mutates: true, exposedErrors: [] },
  { operationId: 'ecommerce.admin.overview', title: 'Lire l’administration', route: '/admin', codec: 'store', mutates: false, exposedErrors: ['AuthError', 'StoreError'] },
  { operationId: 'ecommerce.product.save', title: 'Enregistrer un produit', route: '/admin', codec: 'store', mutates: true, exposedErrors: ['AuthError', 'StoreError'] },
  { operationId: 'ecommerce.product.delete', title: 'Supprimer un produit', route: '/admin', codec: 'store', mutates: true, exposedErrors: ['AuthError', 'StoreError'] },
  { operationId: 'ecommerce.category.save', title: 'Enregistrer une catégorie', route: '/admin', codec: 'store', mutates: true, exposedErrors: ['AuthError', 'StoreError'] },
  { operationId: 'ecommerce.category.delete', title: 'Supprimer une catégorie', route: '/admin', codec: 'store', mutates: true, exposedErrors: ['AuthError', 'StoreError'] },
  { operationId: 'ecommerce.checkout', title: 'Valider une commande fictive', route: '/checkout', codec: 'order', mutates: true, exposedErrors: ['StoreError'] },
  { operationId: 'ecommerce.reset', title: 'Réinitialiser le magasin de démo', route: '/admin', codec: 'store', mutates: true, exposedErrors: ['AuthError', 'StoreError'] },
] as const;

export type ScenarioCategory =
  | 'success'
  | 'business-error'
  | 'craft-exception'
  | 'transport-failure';

export type EcommerceScenario<Value = unknown> = Readonly<{
  operationId: string;
  scenarioId: string;
  title: string;
  intent: string;
  category: ScenarioCategory;
  codec: keyof typeof ecommerceCodecs;
  build: () => Value;
  failure?: Readonly<{ tag?: string; code?: string; message: string }>;
}>;

const catalogData: Catalog = {
  categories: initialStore.categories,
  products: initialStore.products,
};
const staffOverview: StoreData = structuredClone(initialStore);
const cart: ServerCart = {
  id: 'recipe-cart-atelier',
  lines: [{ productId: 'croissant', quantity: 2 }],
};
const staffSession: AccountSession = {
  token: 'synthetic-recipe-token-staff',
  user: {
    id: 'recipe-staff',
    name: 'Mina Démo',
    email: 'staff@example.test',
    role: 'product-manager',
  },
};

/** Application-owned scenario catalogue. Builders return business values;
 * the codec selected by each entry produces the exact transport response. */
export const ecommerceScenarios = [
  {
    operationId: 'ecommerce.catalog',
    scenarioId: 'catalog-with-seasonal-products',
    title: 'Vitrine avec son catalogue de démonstration',
    intent: 'Le visiteur voit les catégories et les six produits synthétiques.',
    category: 'success',
    codec: 'catalog',
    build: () => structuredClone(catalogData),
  },
  {
    operationId: 'ecommerce.catalog.search',
    scenarioId: 'search-espresso',
    title: 'Recherche espresso',
    intent: 'La recherche « espresso » retourne le double espresso du jour.',
    category: 'success',
    codec: 'products',
    build: () => catalogData.products.filter((product) => product.id === 'espresso'),
  },
  {
    operationId: 'ecommerce.catalog.search',
    scenarioId: 'search-no-result',
    title: 'Recherche sans résultat',
    intent: 'Une recherche sans correspondance affiche un état vide.',
    category: 'success',
    codec: 'products',
    build: () => [],
  },
  {
    operationId: 'ecommerce.cart.get',
    scenarioId: 'cart-with-croissants',
    title: 'Panier avec deux croissants',
    intent: 'Le panier serveur contient deux croissants liés au même identifiant.',
    category: 'success',
    codec: 'cart',
    build: () => structuredClone(cart),
  },
  {
    operationId: 'ecommerce.cart.create',
    scenarioId: 'new-empty-cart',
    title: 'Nouveau panier vide',
    intent: 'La vitrine reçoit un panier serveur synthétique sans ligne.',
    category: 'success',
    codec: 'cart',
    build: () => ({ id: 'recipe-cart-empty', lines: [] }),
  },
  {
    operationId: 'ecommerce.cart.addLine',
    scenarioId: 'cart-line-added',
    title: 'Croissants ajoutés au panier',
    intent: 'La ligne serveur est mise à jour avec deux croissants.',
    category: 'success',
    codec: 'cart',
    build: () => structuredClone(cart),
  },
  {
    operationId: 'ecommerce.auth.login',
    scenarioId: 'staff-signed-in',
    title: 'Session product manager de démonstration',
    intent: 'Une identité synthétique peut consulter les commandes, sans pouvoir modifier le catalogue.',
    category: 'success',
    codec: 'accountSession',
    build: () => structuredClone(staffSession),
  },
  {
    operationId: 'ecommerce.auth.me',
    scenarioId: 'current-staff-session',
    title: 'Session product manager active',
    intent: 'La session synthétique reste authentifiée comme product manager.',
    category: 'success',
    codec: 'accountSession',
    build: () => structuredClone(staffSession),
  },
  {
    operationId: 'ecommerce.auth.logout',
    scenarioId: 'session-closed',
    title: 'Session fermée',
    intent: 'La déconnexion confirme la fermeture sans exposer de donnée de compte.',
    category: 'success',
    codec: 'okResult',
    build: () => ({ ok: true }),
  },
  {
    operationId: 'ecommerce.admin.overview',
    scenarioId: 'staff-reads-store',
    title: 'Product manager consulte le magasin',
    intent: 'Le rôle product manager lit le catalogue et les commandes.',
    category: 'success',
    codec: 'store',
    build: () => structuredClone(staffOverview),
  },
  {
    operationId: 'ecommerce.product.save',
    scenarioId: 'staff-cannot-save-product',
    title: 'Modification refusée au product manager',
    intent: 'Le product manager peut lire les produits, mais seule la gérante peut les enregistrer.',
    category: 'craft-exception',
    codec: 'store',
    build: () => structuredClone(staffOverview),
    failure: { tag: 'AuthError', code: 'FORBIDDEN', message: 'Modification réservée à la gérante.' },
  },
  {
    operationId: 'ecommerce.product.save',
    scenarioId: 'admin-saves-espresso-price',
    title: 'Gérante modifie le prix de l’espresso',
    intent: 'Une gérante autorisée enregistre le prix de 3,75 € et reçoit le magasin actualisé.',
    category: 'success',
    codec: 'store',
    build: () => {
      const data = structuredClone(initialStore);
      return { ...data, products: data.products.map((item) => item.id === 'espresso' ? { ...item, price: 3.75 } : item) };
    },
  },
  {
    operationId: 'ecommerce.product.delete',
    scenarioId: 'admin-deletes-croissant',
    title: 'Gérante supprime le croissant',
    intent: 'Une gérante autorisée supprime le croissant et la vitrine reçoit le catalogue mis à jour.',
    category: 'success',
    codec: 'store',
    build: () => {
      const data = structuredClone(initialStore);
      return { ...data, products: data.products.filter((item) => item.id !== 'croissant') };
    },
  },
  {
    operationId: 'ecommerce.category.save',
    scenarioId: 'admin-adds-seasonal-category',
    title: 'Gérante ajoute une catégorie saisonnière',
    intent: 'La nouvelle catégorie vide apparaît dans le magasin retourné après enregistrement.',
    category: 'success',
    codec: 'store',
    build: () => ({ ...structuredClone(initialStore), categories: [...initialStore.categories, { id: 'seasonal', name: 'Saison', description: 'Sélection de saison' }] }),
  },
  {
    operationId: 'ecommerce.category.delete',
    scenarioId: 'admin-removes-empty-category',
    title: 'Gérante supprime une catégorie vide',
    intent: 'La gérante peut supprimer la catégorie saisonnière lorsqu’aucun produit ne la référence.',
    category: 'success',
    codec: 'store',
    build: () => ({ ...structuredClone(initialStore), categories: [...initialStore.categories, { id: 'seasonal', name: 'Saison', description: 'Sélection de saison' }].filter((item) => item.id !== 'seasonal') }),
  },
  {
    operationId: 'ecommerce.category.delete',
    scenarioId: 'category-delete-blocked-by-products',
    title: 'Suppression refusée tant que la catégorie contient des produits',
    intent: 'La catégorie Pâtisseries ne peut pas être supprimée tant que des produits y sont rattachés.',
    category: 'business-error',
    codec: 'store',
    build: () => structuredClone(initialStore),
    failure: { tag: 'StoreError', code: 'STORE_ERROR', message: 'La catégorie contient encore des produits.' },
  },
  {
    operationId: 'ecommerce.checkout',
    scenarioId: 'croissant-order-placed',
    title: 'Commande de croissants validée',
    intent: 'La commande fictive contient deux croissants et un total de 6 €.',
    category: 'success',
    codec: 'order',
    build: () => ({ id: 'recipe-order-1', createdAt: '2026-10-30T09:00:00.000Z', lines: [{ productId: 'croissant', quantity: 2 }], total: 6 }),
  },
  {
    operationId: 'ecommerce.reset',
    scenarioId: 'store-reset-to-demo',
    title: 'Magasin réinitialisé',
    intent: 'Le magasin revient à son catalogue synthétique initial.',
    category: 'success',
    codec: 'store',
    build: () => structuredClone(initialStore),
  },
  {
    operationId: 'ecommerce.checkout',
    scenarioId: 'checkout-business-rejection',
    title: 'Commande refusée pour une formule incomplète',
    intent: 'Une sélection qui ne respecte pas les groupes requis est refusée par le métier.',
    category: 'business-error',
    codec: 'order',
    build: () => ({ id: 'unused', createdAt: '2000-01-01T00:00:00.000Z', lines: [], total: 0 }),
    failure: { tag: 'StoreError', code: 'STORE_ERROR', message: 'La sélection de la formule ne respecte pas les groupes requis.' },
  },
  {
    operationId: 'ecommerce.catalog',
    scenarioId: 'catalog-transport-unavailable',
    title: 'Catalogue indisponible',
    intent: 'Le transport échoue et la vitrine présente son erreur de chargement.',
    category: 'transport-failure',
    codec: 'catalog',
    build: () => structuredClone(catalogData),
    failure: { message: 'Le service catalogue est momentanément indisponible.' },
  },
] as const satisfies readonly EcommerceScenario[];

export function findEcommerceScenarios(query: {
  route?: string;
  operationId?: string;
  text?: string;
} = {}) {
  const needle = query.text?.trim().toLocaleLowerCase('fr-FR');
  return ecommerceScenarios
    .filter((scenario) => !query.operationId || scenario.operationId === query.operationId)
    .filter((scenario) => !needle || `${scenario.title} ${scenario.intent} ${scenario.operationId}`.toLocaleLowerCase('fr-FR').includes(needle))
    .filter((scenario) => !query.route || routeOwnsOperation(query.route, scenario.operationId))
    .map(({ operationId, scenarioId, title, intent, category, codec }) => ({ operationId, scenarioId, title, intent, category, codec }));
}

export function findEcommerceOperations(query: {
  route?: string;
  operationId?: string;
  text?: string;
} = {}) {
  const needle = query.text?.trim().toLocaleLowerCase('fr-FR');
  return ecommerceOperations.filter((operation) => !query.operationId || operation.operationId === query.operationId)
    .filter((operation) => !query.route || routeMatches(query.route, operation.route))
    .filter((operation) => !needle || `${operation.title} ${operation.operationId}`.toLocaleLowerCase('fr-FR').includes(needle));
}

export function getEcommerceScenario(operationId: string, scenarioId: string) {
  return ecommerceScenarios.find((scenario) => scenario.operationId === operationId && scenario.scenarioId === scenarioId);
}

export function encodeEcommerceScenario(operationId: string, scenarioId: string) {
  const scenario = getEcommerceScenario(operationId, scenarioId);
  if (!scenario) throw new Error(`Scénario inconnu : ${operationId}/${scenarioId}.`);
  return {
    catalogVersion: ECOMMERCE_CATALOG_VERSION,
    operationId,
    scenarioId,
    category: scenario.category,
    ...(scenario.category === 'success'
      ? { response: ecommerceCodecs[scenario.codec].encode(scenario.build() as never) }
      : { failure: scenario.failure }),
  };
}

const catalogFingerprintInput = JSON.stringify({
  operations: ecommerceOperations,
  scenarios: ecommerceScenarios.map((scenario) => ({
    operationId: scenario.operationId,
    scenarioId: scenario.scenarioId,
    title: scenario.title,
    intent: scenario.intent,
    category: scenario.category,
    codec: scenario.codec,
    ...(scenario.category === 'success'
      ? { response: ecommerceCodecs[scenario.codec].encode(scenario.build() as never) }
      : { failure: scenario.failure }),
  })),
});
export const ECOMMERCE_CATALOG_VERSION = `ecommerce-${stableFingerprint(catalogFingerprintInput)}`;

function routeOwnsOperation(route: string, operationId: string): boolean {
  const domain = operationId.split('.')[1];
  if (route.startsWith('/admin')) return ['admin', 'product', 'category', 'reset'].includes(domain ?? '');
  if (route.startsWith('/catalog') || route === '/') return ['catalog'].includes(domain ?? '');
  if (route.startsWith('/cart') || route.startsWith('/checkout')) return ['cart', 'checkout'].includes(domain ?? '');
  if (route.startsWith('/account') || route.startsWith('/login')) return ['auth'].includes(domain ?? '');
  return false;
}

function routeMatches(requested: string, declared: string): boolean {
  if (declared === '/') return requested === '/' || requested === '/catalog';
  return requested === declared || requested.startsWith(`${declared}/`);
}

function stableFingerprint(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < value.length; index++) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, '0');
}
