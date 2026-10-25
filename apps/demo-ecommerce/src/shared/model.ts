export interface Category {
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

export interface ChoiceGroup {
  readonly id: string;
  readonly categoryId: string;
  readonly min: number;
  readonly max: number;
}

export interface SimpleProduct {
  readonly kind: 'simple';
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly categoryId: string;
  readonly price: number;
  readonly stock: number;
  /** Visuel affiché en vitrine ; à défaut, celui de la catégorie. */
  readonly emoji?: string;
}

export interface FormulaProduct {
  readonly kind: 'formule';
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly categoryId: string;
  readonly price: number;
  readonly groups: readonly ChoiceGroup[];
  readonly emoji?: string;
}

export type Product = SimpleProduct | FormulaProduct;

export interface FormulaSelection {
  readonly groupId: string;
  readonly productIds: readonly string[];
}

export interface CartLine {
  readonly productId: string;
  readonly quantity: number;
  readonly selections?: readonly FormulaSelection[];
}

export interface Order {
  readonly id: string;
  readonly createdAt: string;
  readonly lines: readonly CartLine[];
  readonly total: number;
}

export interface ServerCart {
  readonly id: string;
  readonly lines: readonly CartLine[];
}

export interface StoreData {
  readonly categories: readonly Category[];
  readonly products: readonly Product[];
  readonly orders: readonly Order[];
  readonly carts?: readonly ServerCart[];
}

/** Ce que la vitrine a le droit de lire : les commandes restent côté administration. */
export type Catalog = Pick<StoreData, 'categories' | 'products'>;

export const initialStore: StoreData = {
  categories: [
    { id: 'coffee', name: 'Café', description: 'Torréfactions de saison' },
    { id: 'pastries', name: 'Pâtisseries', description: 'Préparées chaque matin' },
    { id: 'drinks', name: 'Boissons', description: 'Fraîches et maison' },
  ],
  products: [
    { kind: 'simple', id: 'espresso', name: 'Espresso', description: 'Double espresso, grains du jour.', categoryId: 'coffee', price: 3.5, stock: 32, emoji: '☕' },
    { kind: 'simple', id: 'flat-white', name: 'Flat white', description: 'Espresso, lait velouté.', categoryId: 'coffee', price: 5, stock: 18, emoji: '🥛' },
    { kind: 'simple', id: 'croissant', name: 'Croissant pur beurre', description: 'Feuilletage croustillant, beurre AOP.', categoryId: 'pastries', price: 3, stock: 12, emoji: '🥐' },
    { kind: 'simple', id: 'cookie', name: 'Cookie chocolat', description: 'Chocolat noir et fleur de sel.', categoryId: 'pastries', price: 3.5, stock: 9, emoji: '🍪' },
    { kind: 'simple', id: 'iced-tea', name: 'Thé glacé pêche', description: 'Infusion maison, pêche blanche.', categoryId: 'drinks', price: 4.5, stock: 15, emoji: '🍑' },
    { kind: 'formule', id: 'pause-cafe', name: 'La pause café', description: 'Composez une pause gourmande.', categoryId: 'coffee', price: 8, groups: [{ id: 'pause-pastry', categoryId: 'pastries', min: 1, max: 2 }, { id: 'pause-drink', categoryId: 'drinks', min: 0, max: 1 }], emoji: '🧺' },
  ],
  orders: [],
  carts: [],
};
