import { button, craftComponent, div, forNode, form, heading, ifNode, input, label, p, section, span, strong, textarea } from '@craft-ts/component';
import { craftComputed, craftService, craftUse, isCraftException, query } from '@craft-ts/core';
import { categoryDelete, categorySave, catalog, productDelete, productSave, reset } from './api';
import type { Category, Product, ChoiceGroup, StoreData } from '../shared/model';
import { initialStore } from '../shared/model';

const formValue = (data: FormData, key: string) => String(data.get(key) ?? '').trim();
function setField(id: string, value: string) {
  const field = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null;
  if (field) field.value = value;
}
function errorMessage(value: unknown, fallback: string): string {
  if (!isCraftException(value) || typeof value.payload !== 'object' || value.payload === null || !('message' in value.payload)) return fallback;
  return String(value.payload.message);
}
const loadStore = function* (): Generator<unknown, StoreData, unknown> {
  try { return yield* catalog({}); }
  catch { return structuredClone(initialStore); }
};
type AdminAction =
  | { readonly type: 'category-save'; readonly category: Category }
  | { readonly type: 'category-delete'; readonly id: string }
  | { readonly type: 'product-save'; readonly product: Product }
  | { readonly type: 'product-delete'; readonly id: string }
  | { readonly type: 'reset' };

export const { AdminView, provideAdminView } = craftService({ name: 'adminView', providedIn: 'toProvide' }, function* () {
  const storeQuery = yield* query('storeQuery', { method: (revision: number) => revision, loader: function* () { return yield* loadStore(); } }, ({ resource }) => ({
    categories: craftUse(craftComputed('adminCategories', function* () { return (yield* resource.value())?.categories ?? []; })),
    products: craftUse(craftComputed('adminProducts', function* () { return (yield* resource.value())?.products ?? []; })),
    orders: craftUse(craftComputed('adminOrders', function* () { return (yield* resource.value())?.orders ?? []; })),
  }));
  yield* storeQuery.call(0);
  const adminAction = yield* query('adminAction', {
    method: (action: AdminAction) => action,
    loader: function* ({ params: action }) {
      let result: StoreData | unknown;
      switch (action.type) {
        case 'category-save': result = yield* categorySave({ category: action.category }); break;
        case 'category-delete': result = yield* categoryDelete({ id: action.id }); break;
        case 'product-save': result = yield* productSave({ product: action.product }); break;
        case 'product-delete': result = yield* productDelete({ id: action.id }); break;
        case 'reset': result = yield* reset({}); break;
      }
      if (!isCraftException(result)) yield* storeQuery.call(Date.now());
      return result;
    },
  });
});

const AdminPage = craftComponent('EcommerceAdminPage', { providers: [provideAdminView()] }, function* () {
  const { storeQuery, adminAction } = yield* AdminView();
  const hasAdminActionValue = craftUse(craftComputed('hasAdminActionValue', () => adminAction.hasValue()));
  return section([
    span({ class: 'eyebrow' }, 'Atelier · gestion'), heading({ class: 'page-title' }, 'Administration'),
    p({ class: 'subtitle' }, 'Gérez le catalogue, les catégories et les stocks. Les catégories liées à un produit ou à une formule sont protégées.'),
    div({ class: 'admin-layout' }, [
      div({ class: 'panel' }, [heading({ level: 2 }, 'Créer / modifier une catégorie'),
        form('category-form', { *submit(event) {
          event.preventDefault(); const data = new FormData(event.target as HTMLFormElement);
          const category: Category = { id: formValue(data, 'id') || `cat-${Date.now()}`, name: formValue(data, 'name'), description: formValue(data, 'description') };
          yield* adminAction.call({ type: 'category-save', category });
        } }, [
          label({ class: 'field' }, ['Identifiant', input('category-id', { name: 'id', placeholder: 'vide pour en créer un' })]),
          label({ class: 'field' }, ['Nom', input('category-name', { name: 'name', required: true })]),
          label({ class: 'field' }, ['Description', input('category-description', { name: 'description' })]),
          button('save-category', { type: 'submit', class: 'button' }, 'Enregistrer la catégorie'),
        ]),
        heading({ level: 3 }, 'Catégories'),
    forNode(storeQuery.categories, { track: (category) => category.id }, (category) => div({ class: 'row' }, [div([strong(function* () { return (yield* category()).name; }), p({ class: 'muted' }, function* () { return (yield* category()).id; })]), button('edit-category', { type: 'button', class: 'button-secondary', *click() { const value = yield* category(); setField('category-id', value.id); setField('category-name', value.name); setField('category-description', value.description); } }, 'Modifier'), button('delete-category', { type: 'button', class: 'button-secondary', *click() { yield* adminAction.call({ type: 'category-delete', id: (yield* category()).id }); } }, 'Supprimer')])),
      ]),
      div({ class: 'panel' }, [heading({ level: 2 }, 'Créer ou modifier un produit'),
        form('product-form', { *submit(event) {
          event.preventDefault(); const data = new FormData(event.target as HTMLFormElement);
          const kind = formValue(data, 'kind');
          const base = { id: formValue(data, 'id') || `product-${Date.now()}`, name: formValue(data, 'name'), description: formValue(data, 'description'), categoryId: formValue(data, 'categoryId'), price: Number(formValue(data, 'price')) };
          try {
            let product: Product;
            if (kind === 'formule') {
              const groups = JSON.parse(formValue(data, 'groups') || '[]') as ChoiceGroup[];
              product = { ...base, kind: 'formule', groups };
            } else product = { ...base, kind: 'simple', stock: Number(formValue(data, 'stock')) };
            yield* adminAction.call({ type: 'product-save', product });
          } catch { window.alert('Vérifiez la syntaxe JSON des groupes de formule.'); }
        } }, [
          div({ class: 'form-grid' }, [label({ class: 'field' }, ['Identifiant', input('product-id', { name: 'id', placeholder: 'vide pour en créer un' })]), label({ class: 'field' }, ['Nom', input('product-name', { name: 'name', required: true })]), label({ class: 'field' }, ['Catégorie principale (id)', input('product-category', { name: 'categoryId', required: true, placeholder: 'coffee' })]), label({ class: 'field' }, ['Prix (€)', input('product-price', { name: 'price', type: 'number', min: '0', step: '0.01', required: true })]), label({ class: 'field' }, ['Type', input('product-kind', { name: 'kind', value: 'simple', placeholder: 'simple ou formule' })]), label({ class: 'field' }, ['Stock (produit simple)', input('product-stock', { name: 'stock', type: 'number', min: '0', value: '0' })])]),
          label({ class: 'field' }, ['Description', textarea('product-description', { name: 'description' })]),
          label({ class: 'field' }, ['Groupes de formule (JSON)', textarea('product-groups', { name: 'groups', placeholder: '[{"id":"g1","categoryId":"pastries","min":1,"max":2}]' })]),
          p({ class: 'muted' }, 'Pour créer une formule, saisissez formule dans Type et un tableau JSON de groupes. Chaque groupe référence une catégorie et ses bornes de choix.'),
          button('save-product', { type: 'submit', class: 'button' }, 'Enregistrer le produit'),
        ]),
      ]),
    ]),
    div({ class: 'section-head' }, [heading({ level: 2 }, 'Catalogue actuel'), button('reset-store', { type: 'button', class: 'button-secondary', *click() { if (window.confirm('Réinstaller les données de démonstration ?')) yield* adminAction.call({ type: 'reset' }); } }, 'Réinitialiser les données')]),
    div({ class: 'panel' }, forNode(storeQuery.products, { track: (product) => product.id }, (product) => div({ class: 'row' }, [div([strong(function* () { return (yield* product()).name; }), p({ class: 'muted' }, function* () { const value = yield* product(); return `${value.kind} · ${value.categoryId} · €${value.price.toFixed(2)}${value.kind === 'simple' ? ` · stock ${value.stock}` : ` · ${value.groups.length} groupe(s)`}`; })]), button('edit-product', { type: 'button', class: 'button-secondary', *click() { const value = yield* product(); setField('product-id', value.id); setField('product-name', value.name); setField('product-description', value.description); setField('product-category', value.categoryId); setField('product-price', String(value.price)); setField('product-kind', value.kind); setField('product-stock', value.kind === 'simple' ? String(value.stock) : '0'); setField('product-groups', value.kind === 'formule' ? JSON.stringify(value.groups, null, 2) : ''); } }, 'Modifier'), button('delete-product', { type: 'button', class: 'button-secondary', *click() { yield* adminAction.call({ type: 'product-delete', id: (yield* product()).id }); } }, 'Supprimer')]))),
    ifNode(hasAdminActionValue, () => div({ class: 'notice' }, [p(function* () { const result = yield* adminAction.value(); return isCraftException(result) ? errorMessage(result, 'La modification a échoué.') : 'Modifications enregistrées.'; }), button('refresh-admin', { type: 'button', class: 'button-secondary', *click() { window.location.reload(); } }, 'Actualiser la liste')])),
    span({ class: 'notice' }, function* () { return `${(yield* storeQuery.orders()).length} commande(s) enregistrée(s) dans le fichier de données.`; }),
  ]);
});

export { AdminPage };
