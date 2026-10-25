import {
  a,
  aside,
  button,
  craftComponent,
  div,
  forNode,
  form,
  heading,
  headingSection,
  ifNode,
  input,
  label,
  main,
  option,
  p,
  section,
  select,
  span,
  strong,
  textarea,
} from '@craft-ts/component';
import {
  CraftRouterLink,
  CraftTemporalRuntime,
  craftComputed,
  craftEffect,
  craftResume,
  craftService,
  craftUse,
  executeGeneratorCompatibleFactoryAsync,
  getCurrentCraftInjector,
  isCraftException,
  query,
} from '@craft-ts/core';
import {
  AdminDesk,
  draftFromProduct,
  emptyProductDraft,
  productFromDraft,
  type AdminTab,
} from './admin-desk';
import { LoginPanel } from './account-pages';
import {
  adminOverview,
  categoryDelete,
  categorySave,
  productDelete,
  productSave,
  reset,
} from './api';
import {
  categoryName,
  categoryTone,
  euros,
  eventValue,
  failureOf,
  productEmoji,
  slugFrom,
} from './shop-format';
import { Session } from './shop-state';
import type { Category, Order, Product, StoreData } from '../shared/model';

type AdminAction =
  | { readonly type: 'category-save'; readonly category: Category }
  | {
      readonly type: 'category-delete';
      readonly id: string;
      readonly label: string;
    }
  | {
      readonly type: 'product-save';
      readonly product: Product;
      readonly quiet?: boolean;
    }
  | {
      readonly type: 'product-delete';
      readonly id: string;
      readonly label: string;
    }
  | { readonly type: 'reset' };

function successText(action: AdminAction): string {
  switch (action.type) {
    case 'category-save':
      return `Catégorie « ${action.category.name} » enregistrée.`;
    case 'category-delete':
      return `Catégorie « ${action.label} » supprimée.`;
    case 'product-save':
      return action.quiet
        ? `Stock de « ${action.product.name} » mis à jour.`
        : `« ${action.product.name} » est en ligne dans la boutique.`;
    case 'product-delete':
      return `« ${action.label} » a été retiré du catalogue.`;
    case 'reset':
      return 'Les données de démonstration ont été réinstallées.';
  }
}
const storeOf = (value: StoreData | undefined) =>
  value && !isCraftException(value) ? value : undefined;
const orderSummary = (order: Order, products: readonly Product[]) =>
  order.lines
    .map(
      (line) =>
        `${line.quantity} × ${products.find((product) => product.id === line.productId)?.name ?? line.productId}`,
    )
    .join(', ');
const orderDate = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export const { AdminView, provideAdminView } = craftService(
  { name: 'adminView', providedIn: 'toProvide' },
  function* () {
    const temporalRuntime = yield* CraftTemporalRuntime();
    const session = yield* Session();
    const desk = yield* AdminDesk();
    const tokenOf = function* () {
      return (yield* session.currentSession())?.token ?? '';
    };
    // Le serveur a le dernier mot : une session expirée renvoie à l'écran de
    // connexion avec la raison ; un refus de droits s'affiche comme une erreur.
    const leaveOnAuthFailure = function* (result: unknown) {
      const failure = failureOf(result);
      if (failure?.code !== 'AUTH_REQUIRED') return false;
      yield* session.currentSession.close();
      yield* session.sessionNotice.show(failure.message);
      return true;
    };
    const adminStore = yield* query(
      'adminStore',
      {
        resume: craftResume({
          resource: 'session',
          role: 'requires',
          identity: true,
          calls: ['ecommerce.admin.overview'],
        }),
        method: (revision: number) => revision,
        loader: function* () {
          const result = yield* adminOverview({ token: yield* tokenOf() });
          yield* leaveOnAuthFailure(result);
          return result;
        },
      },
      ({ resource }) => ({
        categories: craftUse(
          craftComputed('adminCategories', function* () {
            return storeOf(yield* resource.value())?.categories ?? [];
          }),
        ),
        products: craftUse(
          craftComputed('adminProducts', function* () {
            return storeOf(yield* resource.value())?.products ?? [];
          }),
        ),
        orders: craftUse(
          craftComputed('adminOrders', function* () {
            return [
              ...(storeOf(yield* resource.value())?.orders ?? []),
            ].reverse();
          }),
        ),
      }),
    );
    yield* adminStore.call(0);
    const injector = getCurrentCraftInjector();
    yield* craftEffect('adminOverviewPoll', function* () {
      return (onCleanup) => {
        const controller = new AbortController();
        let active = true;
        const poll = async (): Promise<void> => {
          try {
            await temporalRuntime.sleep(5_000, {
              owner: 'admin-overview-poll',
              signal: controller.signal,
            });
            if (!active) return;
            const result = await executeGeneratorCompatibleFactoryAsync({
              factory: function* () {
                yield* adminStore.call(temporalRuntime.now());
              },
              thisArg: undefined,
              getInjector: () => injector,
              args: [],
              invalidYieldErrorMessage:
                'admin overview poll yielded an unsupported value',
            });
            if (result.kind === 'shortCircuit')
              throw new Error(String(result.exception));
            if (active) void poll();
          } catch {
            if (active && !controller.signal.aborted) void poll();
          }
        };
        void poll();
        onCleanup(() => {
          active = false;
          controller.abort();
        });
      };
    });
    yield* query('adminAction', {
      method: (action: AdminAction) => action,
      loader: function* ({ params: action }) {
        const token = yield* tokenOf();
        let result: unknown;
        switch (action.type) {
          case 'category-save':
            result = yield* categorySave({ token, category: action.category });
            break;
          case 'category-delete':
            result = yield* categoryDelete({ token, id: action.id });
            break;
          case 'product-save':
            result = yield* productSave({ token, product: action.product });
            break;
          case 'product-delete':
            result = yield* productDelete({ token, id: action.id });
            break;
          case 'reset':
            result = yield* reset({ token });
            break;
        }
        if (yield* leaveOnAuthFailure(result)) return result;
        const failure = failureOf(result);
        if (failure) {
          yield* desk.deskNotice.show({ tone: 'error', text: failure.message });
          return result;
        }
        yield* desk.deskNotice.show({
          tone: 'success',
          text: successText(action),
        });
        if (action.type === 'product-save' && !action.quiet)
          yield* desk.productDraft.close();
        if (action.type === 'category-save') yield* desk.categoryDraft.close();
        yield* adminStore.call(temporalRuntime.now());
        return result;
      },
    });
  },
);

const AdminDashboard = craftComponent(
  'EcommerceAdminDashboard',
  { providers: [provideAdminView()] },
  function* () {
    const { adminStore, adminAction } = yield* AdminView();
    const session = yield* Session();
    const desk = yield* AdminDesk();
    const draft = desk.productDraft;
    const draftGroups = function* () {
      return (yield* draft())?.groups ?? [];
    };
    const tab = (
      id: AdminTab,
      text: string,
      count: () => Generator<unknown, number, unknown>,
    ) =>
      button(
        'admin-tab',
        {
          type: 'button',
          class: 'tab',
          role: 'tab',
          'aria-selected': function* () {
            return (yield* desk.adminTab()) === id ? 'true' : 'false';
          },
          *click() {
            yield* desk.adminTab.select(id);
          },
        },
        [
          span(text),
          span({ class: 'tab-count' }, function* () {
            return String(yield* count());
          }),
        ],
      );
    const stat = (
      text: string,
      value: () => Generator<unknown, string, unknown>,
      tone?: string,
    ) =>
      div({ class: 'stat', 'data-tone': tone }, [
        span({ class: 'stat-label' }, text),
        strong({ class: 'stat-value' }, value),
      ]);

    const productsPanel = section({ class: 'panel admin-panel' }, [
      div({ class: 'panel-toolbar' }, [
        p(
          { class: 'muted' },
          'Les modifications sont visibles dans la boutique dès l’enregistrement.',
        ),
        button(
          'new-product',
          {
            type: 'button',
            class: 'button',
            *click() {
              const categories = yield* adminStore.categories();
              yield* desk.deskNotice.show(undefined);
              yield* draft.open(emptyProductDraft(categories[0]?.id ?? ''));
            },
          },
          '＋ Nouveau produit',
        ),
      ]),
      div(
        { class: 'admin-table' },
        forNode(
          adminStore.products,
          {
            track: (product) => product.id,
            empty: () =>
              p(
                { class: 'empty-note' },
                'Le catalogue est vide. Créez un premier produit.',
              ),
          },
          (product) =>
            div({ class: 'admin-row' }, [
              div(
                {
                  class: 'visual',
                  'data-size': 'mini',
                  'data-tone': function* () {
                    return categoryTone((yield* product()).categoryId);
                  },
                },
                span(
                  { class: 'visual-emoji', 'aria-hidden': 'true' },
                  function* () {
                    return productEmoji(yield* product());
                  },
                ),
              ),
              div({ class: 'admin-row-main' }, [
                strong(function* () {
                  return (yield* product()).name;
                }),
                span({ class: 'muted' }, function* () {
                  const value = yield* product();
                  return `${categoryName(yield* adminStore.categories(), value.categoryId)} · ${value.kind === 'formule' ? `formule, ${value.groups.length} groupe(s)` : 'produit simple'}`;
                }),
              ]),
              span({ class: 'price' }, function* () {
                return euros((yield* product()).price);
              }),
              ifNode(
                'row-simple',
                function* () {
                  return (yield* product()).kind === 'simple';
                },
                () =>
                  div(
                    {
                      class: 'stock-control',
                      'data-level': function* () {
                        const value = yield* product();
                        return value.kind === 'simple' && value.stock <= 3
                          ? 'low'
                          : undefined;
                      },
                    },
                    [
                      button(
                        'stock-down',
                        {
                          type: 'button',
                          class: 'stepper-button',
                          'aria-label': 'Retirer une unité du stock',
                          disabled: function* () {
                            const value = yield* product();
                            return (
                              (yield* adminAction.isLoading()) ||
                              (value.kind === 'simple' && value.stock <= 0)
                            );
                          },
                          *click() {
                            const value = yield* product();
                            if (value.kind === 'simple' && value.stock > 0)
                              yield* adminAction.call({
                                type: 'product-save',
                                product: { ...value, stock: value.stock - 1 },
                                quiet: true,
                              });
                          },
                        },
                        '−',
                      ),
                      span({ class: 'stock-value' }, function* () {
                        const value = yield* product();
                        return value.kind === 'simple'
                          ? `${value.stock} en stock`
                          : '';
                      }),
                      button(
                        'stock-up',
                        {
                          type: 'button',
                          class: 'stepper-button',
                          'aria-label': 'Ajouter une unité au stock',
                          disabled: adminAction.isLoading,
                          *click() {
                            const value = yield* product();
                            if (value.kind === 'simple')
                              yield* adminAction.call({
                                type: 'product-save',
                                product: { ...value, stock: value.stock + 1 },
                                quiet: true,
                              });
                          },
                        },
                        '+',
                      ),
                    ],
                  ),
                () => span({ class: 'kind-tag' }, 'Formule'),
              ),
              div({ class: 'row-actions' }, [
                button(
                  'edit-product',
                  {
                    type: 'button',
                    class: 'button button-soft small',
                    *click() {
                      yield* desk.deskNotice.show(undefined);
                      yield* draft.open(draftFromProduct(yield* product()));
                    },
                  },
                  'Modifier',
                ),
                button(
                  'delete-product',
                  {
                    type: 'button',
                    class: 'icon-button danger',
                    'aria-label': function* () {
                      return `Supprimer ${(yield* product()).name}`;
                    },
                    *click() {
                      const value = yield* product();
                      if (
                        window.confirm(
                          `Supprimer « ${value.name} » du catalogue ?`,
                        )
                      )
                        yield* adminAction.call({
                          type: 'product-delete',
                          id: value.id,
                          label: value.name,
                        });
                    },
                  },
                  '🗑',
                ),
              ]),
            ]),
        ),
      ),
    ]);

    const categoriesPanel = div({ class: 'admin-split' }, [
      section({ class: 'panel admin-panel' }, [
        div({ class: 'panel-toolbar' }, [
          p(
            { class: 'muted' },
            'Une catégorie utilisée par un produit ou une formule ne peut pas être supprimée.',
          ),
          button(
            'new-category',
            {
              type: 'button',
              class: 'button',
              *click() {
                yield* desk.deskNotice.show(undefined);
                yield* desk.categoryDraft.open({
                  isNew: true,
                  id: '',
                  name: '',
                  description: '',
                });
              },
            },
            '＋ Nouvelle catégorie',
          ),
        ]),
        div(
          { class: 'admin-table' },
          forNode(
            adminStore.categories,
            { track: (category) => category.id },
            (category) =>
              div({ class: 'admin-row' }, [
                div(
                  {
                    class: 'visual',
                    'data-size': 'mini',
                    'data-tone': function* () {
                      return categoryTone((yield* category()).id);
                    },
                  },
                  span(
                    { class: 'visual-emoji', 'aria-hidden': 'true' },
                    function* () {
                      return productEmoji({
                        categoryId: (yield* category()).id,
                      });
                    },
                  ),
                ),
                div({ class: 'admin-row-main' }, [
                  strong(function* () {
                    return (yield* category()).name;
                  }),
                  span({ class: 'muted' }, function* () {
                    return (
                      (yield* category()).description || 'Sans description'
                    );
                  }),
                ]),
                span({ class: 'kind-tag' }, function* () {
                  const id = (yield* category()).id;
                  return `${(yield* adminStore.products()).filter((product) => product.categoryId === id).length} produit(s)`;
                }),
                div({ class: 'row-actions' }, [
                  button(
                    'edit-category',
                    {
                      type: 'button',
                      class: 'button button-soft small',
                      *click() {
                        yield* desk.deskNotice.show(undefined);
                        yield* desk.categoryDraft.open({
                          ...(yield* category()),
                          isNew: false,
                        });
                      },
                    },
                    'Modifier',
                  ),
                  button(
                    'delete-category',
                    {
                      type: 'button',
                      class: 'icon-button danger',
                      'aria-label': function* () {
                        return `Supprimer ${(yield* category()).name}`;
                      },
                      *click() {
                        const value = yield* category();
                        if (
                          window.confirm(
                            `Supprimer la catégorie « ${value.name} » ?`,
                          )
                        )
                          yield* adminAction.call({
                            type: 'category-delete',
                            id: value.id,
                            label: value.name,
                          });
                      },
                    },
                    '🗑',
                  ),
                ]),
              ]),
          ),
        ),
      ]),
      ifNode(
        'category-editor',
        function* () {
          return (yield* desk.categoryDraft()) !== undefined;
        },
        () =>
          form(
            'category-form',
            {
              class: 'panel editor-card',
              *submit(event) {
                event.preventDefault();
                const current = yield* desk.categoryDraft();
                if (!current) return;
                const id = current.isNew
                  ? slugFrom(
                      current.name,
                      (yield* adminStore.categories()).map(
                        (category) => category.id,
                      ),
                      'categorie',
                    )
                  : current.id;
                yield* adminAction.call({
                  type: 'category-save',
                  category: {
                    id,
                    name: current.name.trim(),
                    description: current.description.trim(),
                  },
                });
              },
            },
            [
              strong({ class: 'editor-title' }, function* () {
                const current = yield* desk.categoryDraft();
                return current?.isNew
                  ? 'Nouvelle catégorie'
                  : `Modifier « ${current?.name ?? ''} »`;
              }),
              label({ class: 'field' }, [
                'Nom',
                input('category-name', {
                  name: 'name',
                  required: true,
                  value: function* () {
                    return (yield* desk.categoryDraft())?.name ?? '';
                  },
                  *input(event) {
                    yield* desk.categoryDraft.edit({ name: eventValue(event) });
                  },
                }),
              ]),
              label({ class: 'field' }, [
                'Description',
                input('category-description', {
                  name: 'description',
                  value: function* () {
                    return (yield* desk.categoryDraft())?.description ?? '';
                  },
                  *input(event) {
                    yield* desk.categoryDraft.edit({
                      description: eventValue(event),
                    });
                  },
                }),
              ]),
              div({ class: 'editor-actions' }, [
                button(
                  'cancel-category',
                  {
                    type: 'button',
                    class: 'button button-soft',
                    *click() {
                      yield* desk.categoryDraft.close();
                    },
                  },
                  'Annuler',
                ),
                button(
                  'save-category',
                  {
                    type: 'submit',
                    class: 'button',
                    disabled: adminAction.isLoading,
                  },
                  'Enregistrer',
                ),
              ]),
            ],
          ),
      ),
    ]);

    const ordersPanel = section({ class: 'panel admin-panel' }, [
      div(
        { class: 'admin-table' },
        forNode(
          adminStore.orders,
          {
            track: (order) => order.id,
            empty: () =>
              p(
                { class: 'empty-note' },
                'Aucune commande pour l’instant. Passez-en une depuis la boutique, elle apparaîtra ici.',
              ),
          },
          (order) =>
            div({ class: 'admin-row' }, [
              span({ class: 'order-id mono' }, function* () {
                return `#${(yield* order()).id.slice(-5).toUpperCase()}`;
              }),
              div({ class: 'admin-row-main' }, [
                strong(function* () {
                  return orderSummary(
                    yield* order(),
                    yield* adminStore.products(),
                  );
                }),
                span({ class: 'muted' }, function* () {
                  return orderDate.format(new Date((yield* order()).createdAt));
                }),
              ]),
              span({ class: 'price' }, function* () {
                return euros((yield* order()).total);
              }),
            ]),
        ),
      ),
    ]);

    const productEditor = div({ class: 'drawer-layer' }, [
      div({
        class: 'drawer-backdrop',
        *click() {
          yield* draft.close();
        },
      }),
      aside(
        {
          class: 'drawer',
          role: 'dialog',
          'aria-modal': 'true',
          'aria-label': 'Éditeur de produit',
        },
        [
          div({ class: 'drawer-head' }, [
            div(
              {
                class: 'visual',
                'data-size': 'mini',
                'data-tone': function* () {
                  return categoryTone((yield* draft())?.categoryId ?? '');
                },
              },
              span(
                { class: 'visual-emoji', 'aria-hidden': 'true' },
                function* () {
                  const current = yield* draft();
                  return current ? productEmoji(current) : '';
                },
              ),
            ),
            strong({ class: 'editor-title' }, function* () {
              const current = yield* draft();
              return current?.isNew
                ? 'Nouveau produit'
                : `Modifier « ${current?.name ?? ''} »`;
            }),
            button(
              'close-editor',
              {
                type: 'button',
                class: 'icon-button',
                'aria-label': 'Fermer l’éditeur',
                *click() {
                  yield* draft.close();
                },
              },
              '✕',
            ),
          ]),
          form(
            'product-form',
            {
              class: 'drawer-body',
              *submit(event) {
                event.preventDefault();
                const current = yield* draft();
                if (!current) return;
                const id = current.isNew
                  ? slugFrom(
                      current.name,
                      (yield* adminStore.products()).map(
                        (product) => product.id,
                      ),
                      'produit',
                    )
                  : current.id;
                const product = productFromDraft(current, id);
                if (typeof product === 'string')
                  yield* desk.deskNotice.show({ tone: 'error', text: product });
                else yield* adminAction.call({ type: 'product-save', product });
              },
            },
            [
              div(
                {
                  class: 'segmented',
                  role: 'group',
                  'aria-label': 'Type de produit',
                },
                [
                  button(
                    'kind-simple',
                    {
                      type: 'button',
                      'aria-pressed': function* () {
                        return (yield* draft())?.kind === 'simple'
                          ? 'true'
                          : 'false';
                      },
                      *click() {
                        yield* draft.edit({ kind: 'simple' });
                      },
                    },
                    'Produit simple',
                  ),
                  button(
                    'kind-formula',
                    {
                      type: 'button',
                      'aria-pressed': function* () {
                        return (yield* draft())?.kind === 'formule'
                          ? 'true'
                          : 'false';
                      },
                      *click() {
                        const current = yield* draft();
                        yield* draft.edit({ kind: 'formule' });
                        if (current && !current.groups.length)
                          yield* draft.addGroup(
                            (yield* adminStore.categories())[0]?.id ?? '',
                          );
                      },
                    },
                    'Formule à composer',
                  ),
                ],
              ),
              div({ class: 'form-grid' }, [
                label({ class: 'field' }, [
                  'Nom',
                  input('product-name', {
                    name: 'name',
                    required: true,
                    placeholder: 'Pain au chocolat',
                    value: function* () {
                      return (yield* draft())?.name ?? '';
                    },
                    *input(event) {
                      yield* draft.edit({ name: eventValue(event) });
                    },
                  }),
                ]),
                label({ class: 'field' }, [
                  'Visuel (emoji)',
                  input('product-emoji', {
                    name: 'emoji',
                    placeholder: '🥐',
                    maxLength: 4,
                    value: function* () {
                      return (yield* draft())?.emoji ?? '';
                    },
                    *input(event) {
                      yield* draft.edit({ emoji: eventValue(event) });
                    },
                  }),
                ]),
              ]),
              label({ class: 'field' }, [
                'Description',
                textarea('product-description', {
                  name: 'description',
                  placeholder: 'Ce qui le rend bon, en une phrase.',
                  value: function* () {
                    return (yield* draft())?.description ?? '';
                  },
                  *input(event) {
                    yield* draft.edit({ description: eventValue(event) });
                  },
                }),
              ]),
              div({ class: 'form-grid' }, [
                label({ class: 'field' }, [
                  'Catégorie',
                  select(
                    'product-category',
                    {
                      name: 'categoryId',
                      value: function* () {
                        return (yield* draft())?.categoryId ?? '';
                      },
                      *change(event) {
                        yield* draft.edit({ categoryId: eventValue(event) });
                      },
                    },
                    forNode(
                      adminStore.categories,
                      { track: (category) => category.id },
                      (category) =>
                        option(
                          {
                            value: function* () {
                              return (yield* category()).id;
                            },
                            selected: function* () {
                              return (
                                (yield* draft())?.categoryId ===
                                (yield* category()).id
                              );
                            },
                          },
                          function* () {
                            return (yield* category()).name;
                          },
                        ),
                    ),
                  ),
                ]),
                label({ class: 'field' }, [
                  'Prix (€)',
                  input('product-price', {
                    name: 'price',
                    type: 'number',
                    min: '0',
                    step: '0.1',
                    inputMode: 'decimal',
                    required: true,
                    value: function* () {
                      return (yield* draft())?.price ?? '';
                    },
                    *input(event) {
                      yield* draft.edit({ price: eventValue(event) });
                    },
                  }),
                ]),
              ]),
              ifNode(
                'draft-simple',
                function* () {
                  return (yield* draft())?.kind === 'simple';
                },
                () =>
                  label({ class: 'field' }, [
                    'Stock disponible',
                    input('product-stock', {
                      name: 'stock',
                      type: 'number',
                      min: '0',
                      step: '1',
                      value: function* () {
                        return (yield* draft())?.stock ?? '0';
                      },
                      *input(event) {
                        yield* draft.edit({ stock: eventValue(event) });
                      },
                    }),
                  ]),
                () =>
                  div({ class: 'groups-editor' }, [
                    div([
                      strong('Groupes de choix'),
                      p(
                        { class: 'muted' },
                        'Pour chaque groupe, le client choisit entre min et max produits de la catégorie. Les éléments sont inclus dans le prix.',
                      ),
                    ]),
                    forNode(
                      draftGroups,
                      {
                        track: (group) => group.id,
                        empty: () =>
                          p(
                            { class: 'empty-note' },
                            'Aucun groupe pour l’instant.',
                          ),
                      },
                      (group) =>
                        div({ class: 'group-row' }, [
                          label({ class: 'field' }, [
                            'Catégorie',
                            select(
                              'group-category',
                              {
                                value: function* () {
                                  return (yield* group()).categoryId;
                                },
                                *change(event) {
                                  yield* draft.editGroup((yield* group()).id, {
                                    categoryId: eventValue(event),
                                  });
                                },
                              },
                              forNode(
                                adminStore.categories,
                                { track: (category) => category.id },
                                (category) =>
                                  option(
                                    {
                                      value: function* () {
                                        return (yield* category()).id;
                                      },
                                      selected: function* () {
                                        return (
                                          (yield* group()).categoryId ===
                                          (yield* category()).id
                                        );
                                      },
                                    },
                                    function* () {
                                      return (yield* category()).name;
                                    },
                                  ),
                              ),
                            ),
                          ]),
                          label({ class: 'field' }, [
                            'Min',
                            input('group-min', {
                              type: 'number',
                              min: '0',
                              step: '1',
                              value: function* () {
                                return (yield* group()).min;
                              },
                              *input(event) {
                                yield* draft.editGroup((yield* group()).id, {
                                  min: eventValue(event),
                                });
                              },
                            }),
                          ]),
                          label({ class: 'field' }, [
                            'Max',
                            input('group-max', {
                              type: 'number',
                              min: '1',
                              step: '1',
                              value: function* () {
                                return (yield* group()).max;
                              },
                              *input(event) {
                                yield* draft.editGroup((yield* group()).id, {
                                  max: eventValue(event),
                                });
                              },
                            }),
                          ]),
                          button(
                            'remove-group',
                            {
                              type: 'button',
                              class: 'icon-button danger',
                              'aria-label': 'Retirer ce groupe',
                              *click() {
                                yield* draft.removeGroup((yield* group()).id);
                              },
                            },
                            '✕',
                          ),
                        ]),
                    ),
                    button(
                      'add-group',
                      {
                        type: 'button',
                        class: 'button button-soft small',
                        *click() {
                          yield* draft.addGroup(
                            (yield* adminStore.categories())[0]?.id ?? '',
                          );
                        },
                      },
                      '＋ Ajouter un groupe',
                    ),
                  ]),
              ),
              ifNode(
                'editor-error',
                function* () {
                  return (yield* desk.deskNotice())?.tone === 'error';
                },
                () =>
                  p({ class: 'notice error' }, function* () {
                    return (yield* desk.deskNotice())?.text ?? '';
                  }),
              ),
              div({ class: 'drawer-foot' }, [
                button(
                  'cancel-product',
                  {
                    type: 'button',
                    class: 'button button-soft',
                    *click() {
                      yield* draft.close();
                    },
                  },
                  'Annuler',
                ),
                button(
                  'save-product',
                  {
                    type: 'submit',
                    class: 'button',
                    disabled: adminAction.isLoading,
                  },
                  function* () {
                    return (yield* adminAction.isLoading())
                      ? 'Enregistrement…'
                      : (yield* draft())?.isNew
                        ? 'Créer le produit'
                        : 'Enregistrer';
                  },
                ),
              ]),
            ],
          ),
        ],
      ),
    ]);

    return div({ class: 'admin' }, [
      div({ class: 'admin-head' }, [
        div([
          span({ class: 'eyebrow' }, 'Atelier · gestion'),
          heading({ class: 'page-title' }, 'Administration'),
          p({ class: 'subtitle' }, function* () {
            return `Session de ${(yield* session.currentSession())?.user.name ?? ''} · le serveur vérifie les droits à chaque action.`;
          }),
        ]),
        div({ class: 'admin-head-actions' }, [
          a(
            'admin-to-shop',
            { class: 'button button-soft' },
            'Voir la boutique ↗',
          ).pipe(CraftRouterLink({ to: 'catalogue' })),
          button(
            'reset-store',
            {
              type: 'button',
              class: 'button button-soft',
              *click() {
                if (
                  window.confirm(
                    'Réinstaller le catalogue de démonstration et effacer les commandes ?',
                  )
                )
                  yield* adminAction.call({ type: 'reset' });
              },
            },
            'Réinitialiser la démo',
          ),
          button(
            'admin-sign-out',
            {
              type: 'button',
              class: 'text-link',
              *click() {
                const current = yield* session.currentSession();
                if (current) yield* session.signOutProcess.call(current.token);
              },
            },
            'Se déconnecter',
          ),
        ]),
      ]),
      div({ class: 'stats' }, [
        stat('Produits en ligne', function* () {
          return String((yield* adminStore.products()).length);
        }),
        stat(
          'Stock faible (≤ 3)',
          function* () {
            return String(
              (yield* adminStore.products()).filter(
                (product) => product.kind === 'simple' && product.stock <= 3,
              ).length,
            );
          },
          'warn',
        ),
        stat('Commandes', function* () {
          return String((yield* adminStore.orders()).length);
        }),
        stat(
          'Chiffre d’affaires',
          function* () {
            return euros(
              (yield* adminStore.orders()).reduce(
                (sum, order) => sum + order.total,
                0,
              ),
            );
          },
          'accent',
        ),
      ]),
      ifNode(
        'desk-success',
        function* () {
          return (yield* desk.deskNotice())?.tone === 'success';
        },
        () =>
          div({ class: 'toast', role: 'status' }, [
            span(function* () {
              return (yield* desk.deskNotice())?.text ?? '';
            }),
            button(
              'dismiss-notice',
              {
                type: 'button',
                class: 'icon-button',
                'aria-label': 'Masquer',
                *click() {
                  yield* desk.deskNotice.show(undefined);
                },
              },
              '✕',
            ),
          ]),
      ),
      ifNode(
        'desk-error',
        function* () {
          return (
            (yield* desk.deskNotice())?.tone === 'error' &&
            (yield* draft()) === undefined
          );
        },
        () =>
          p({ class: 'notice error' }, function* () {
            return (yield* desk.deskNotice())?.text ?? '';
          }),
      ),
      div({ class: 'tabs', role: 'tablist' }, [
        tab('products', 'Produits', function* () {
          return (yield* adminStore.products()).length;
        }),
        tab('categories', 'Catégories', function* () {
          return (yield* adminStore.categories()).length;
        }),
        tab('orders', 'Commandes', function* () {
          return (yield* adminStore.orders()).length;
        }),
      ]),
      ifNode(
        'tab-products',
        function* () {
          return (yield* desk.adminTab()) === 'products';
        },
        () => productsPanel,
        () =>
          ifNode(
            'tab-categories',
            function* () {
              return (yield* desk.adminTab()) === 'categories';
            },
            () => categoriesPanel,
            () => ordersPanel,
          ),
      ),
      ifNode(
        'product-editor',
        function* () {
          return (yield* draft()) !== undefined;
        },
        () => productEditor,
      ),
    ]);
  },
);

const AdminPage = craftComponent('EcommerceAdminPage', {}, function* () {
  const session = yield* Session();
  return main([
    ifNode(
      'admin-access',
      function* () {
        return yield* session.isStaff();
      },
      () => headingSection(AdminDashboard()),
      () =>
        ifNode(
          'signed-in-client',
          function* () {
            return (yield* session.currentSession()) !== undefined;
          },
          () =>
            div({ class: 'empty-state' }, [
              span({ class: 'empty-emoji', 'aria-hidden': 'true' }, '🔒'),
              heading({ class: 'page-title' }, 'Accès réservé à l’équipe'),
              p({ class: 'lead' }, function* () {
                return `La session ouverte est celle de ${(yield* session.currentSession())?.user.name ?? ''}, un compte client. Le serveur refuserait toute modification du catalogue.`;
              }),
              div({ class: 'hero-actions center' }, [
                button(
                  'switch-account',
                  {
                    type: 'button',
                    class: 'button',
                    *click() {
                      const current = yield* session.currentSession();
                      if (current)
                        yield* session.signOutProcess.call(current.token);
                    },
                  },
                  'Changer de compte',
                ),
                a(
                  'denied-shop',
                  { class: 'button button-soft' },
                  'Retour à la boutique',
                ).pipe(CraftRouterLink({ to: 'catalogue' })),
              ]),
            ]),
          () =>
            div([
              span({ class: 'eyebrow' }, 'Atelier · gestion'),
              heading({ class: 'page-title' }, 'Administration'),
              p(
                { class: 'subtitle' },
                'Connectez-vous avec un compte de l’équipe pour gérer le catalogue. Les identifiants de démonstration sont juste en dessous.',
              ),
              headingSection(LoginPanel()),
            ]),
        ),
    ),
  ]);
});

export { AdminPage };
