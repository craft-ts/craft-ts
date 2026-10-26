import { craftService, state } from '@craft-ts/core';
import type { Category, Product } from '../shared/model';

export type AdminTab = 'products' | 'categories' | 'orders';

export interface GroupDraft {
  readonly id: string;
  readonly categoryId: string;
  readonly min: string;
  readonly max: string;
}

/**
 * Brouillon du formulaire produit. Les nombres restent des chaînes tant qu'on
 * tape : « 4, » ou un champ vidé ne doivent pas être réécrits sous les doigts.
 */
export interface ProductDraft {
  readonly isNew: boolean;
  readonly id: string;
  readonly kind: Product['kind'];
  readonly name: string;
  readonly description: string;
  readonly emoji: string;
  readonly categoryId: string;
  readonly price: string;
  readonly stock: string;
  readonly groups: readonly GroupDraft[];
}

export interface CategoryDraft extends Category {
  readonly isNew: boolean;
}

export interface DeskNotice {
  readonly tone: 'success' | 'error';
  readonly text: string;
}

export function draftFromProduct(product: Product): ProductDraft {
  return {
    isNew: false,
    id: product.id,
    kind: product.kind,
    name: product.name,
    description: product.description,
    emoji: product.emoji ?? '',
    categoryId: product.categoryId,
    price: String(product.price),
    stock: product.kind === 'simple' ? String(product.stock) : '0',
    groups: product.kind === 'formule' ? product.groups.map((group) => ({ id: group.id, categoryId: group.categoryId, min: String(group.min), max: String(group.max) })) : [],
  };
}

// L'identifiant ne dépend que des groupes déjà présents : le même brouillon
// donne le même identifiant, en direct comme au rejeu d'une session.
function nextGroupId(groups: readonly GroupDraft[]): string {
  const taken = new Set(groups.map((group) => group.id));
  let index = groups.length + 1;
  while (taken.has(`group-${index}`)) index += 1;
  return `group-${index}`;
}

export const emptyProductDraft =(categoryId: string): ProductDraft => ({ isNew: true, id: '', kind: 'simple', name: '', description: '', emoji: '', categoryId, price: '', stock: '10', groups: [] });

/** Brouillon → produit, ou le message qui explique pourquoi ce n'est pas encore possible. */
export function productFromDraft(draft: ProductDraft, id: string): Product | string {
  const price = Number(draft.price.replace(',', '.'));
  if (!draft.name.trim()) return 'Donnez un nom au produit.';
  if (!draft.price.trim() || !Number.isFinite(price) || price < 0) return 'Indiquez un prix positif.';
  const base = { id, name: draft.name.trim(), description: draft.description.trim(), categoryId: draft.categoryId, price: Math.round(price * 100) / 100, ...(draft.emoji.trim() ? { emoji: draft.emoji.trim() } : {}) };
  if (draft.kind === 'simple') {
    const stock = Number(draft.stock);
    if (!Number.isInteger(stock) || stock < 0) return 'Le stock doit être un nombre entier positif.';
    return { ...base, kind: 'simple', stock };
  }
  if (!draft.groups.length) return 'Ajoutez au moins un groupe de choix à la formule.';
  const groups = draft.groups.map((group) => ({ id: group.id, categoryId: group.categoryId, min: Number(group.min), max: Number(group.max) }));
  if (groups.some((group) => !Number.isInteger(group.min) || !Number.isInteger(group.max) || group.min < 0 || group.max < 1 || group.max < group.min)) return 'Chaque groupe demande un minimum ≤ maximum, et au moins 1 choix possible.';
  return { ...base, kind: 'formule', groups };
}

export const { AdminDesk } = craftService({ name: 'adminDesk', providedIn: 'global' }, function* () {
  yield* state('adminTab', 'products' as AdminTab, ({ set }) => ({
    select: (tab: AdminTab) => set(tab),
  }));
  yield* state('productDraft', undefined as ProductDraft | undefined, ({ set, update }) => ({
    open: (draft: ProductDraft) => set(draft),
    close: () => set(undefined),
    edit: (changes: Partial<ProductDraft>) => update((draft) => draft && { ...draft, ...changes }),
    addGroup: (categoryId: string) => update((draft) => draft && { ...draft, groups: [...draft.groups, { id: nextGroupId(draft.groups), categoryId, min: '1', max: '1' }] }),
    editGroup: (groupId: string, changes: Partial<GroupDraft>) => update((draft) => draft && { ...draft, groups: draft.groups.map((group) => group.id === groupId ? { ...group, ...changes } : group) }),
    removeGroup: (groupId: string) => update((draft) => draft && { ...draft, groups: draft.groups.filter((group) => group.id !== groupId) }),
  }));
  yield* state('categoryDraft', undefined as CategoryDraft | undefined, ({ set, update }) => ({
    open: (draft: CategoryDraft) => set(draft),
    close: () => set(undefined),
    edit: (changes: Partial<CategoryDraft>) => update((draft) => draft && { ...draft, ...changes }),
  }));
  yield* state('deskNotice', undefined as DeskNotice | undefined, ({ set }) => ({
    show: (notice: DeskNotice | undefined) => set(notice),
  }));
});
