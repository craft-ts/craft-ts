# Personnaliser les composants et les directives

Craft sépare la personnalisation du composant en trois niveaux : les
propriétés de l’élément racine, les styles encapsulés et les directives
composables.

## Personnaliser l’élément racine

Les propriétés `host` de la meta définissent les valeurs par défaut de
l’élément racine du composant. Le caller peut les compléter ou les remplacer :

```ts
const Card = craftComponent(
  'Card',
  {
    host: {
      class: 'card card--default',
      attrs: { role: 'article' },
    },
  },
  () => ({}),
  () => div([h2('A card')]),
);

Card({
  class: 'card--featured',
  attrs: { 'data-testid': 'featured-card' },
});
```

Les classes, attributs, styles et événements reconnus comme propriétés d’hôte
sont appliqués sur la racine du composant. Les autres propriétés restent des
props de la factory.

Les valeurs peuvent être réactives :

```ts
const active = state(false, ({ set }) => ({ set }));

Card({
  class: () => (active() ? 'is-active' : 'is-idle'),
  style: () => ({ opacity: active() ? 1 : 0.6 }),
});
```

## Personnaliser avec les styles

Les styles déclarés dans `meta.styles` sont partagés entre les instances et
encapsulés avec `@scope`. La racine du template s’écrit `:scope` :

```ts
const Panel = craftComponent(
  'Panel',
  {
    styles: `
      :scope { padding: 1rem; border: 1px solid #ddd; }
      .title { font-weight: 700; }
      button { cursor: pointer; }
    `,
  },
  () => ({}),
  () => div([h2({ class: 'title' }, 'Panel'), button('Save')]),
);
```

Les styles ne fuient pas dans les composants descendants. Les règles globales
comme `@keyframes`, `@font-face` et `@import` sont conservées hors du bloc
scopé ; les règles `@media`, `@supports` et `@container` restent composables
dans le scope.

## Ajouter une personnalisation réutilisable avec une directive

Une directive transforme la factory et le template d’un composant. Elle est
appliquée avec `.pipe(...)`, de gauche à droite :

```ts
const Highlight = craftDirective(
  'Highlight',
  {
    styles: '.highlight { background: #fff3bf; }',
  },
  (baseLogic) => baseLogic,
  (baseTemplate) => (context) => baseTemplate(context, { class: 'highlight' }),
);

const HighlightedPanel = Panel.pipe(Highlight);
```

Une directive peut aussi ajouter du contexte et des props publics :

```ts
const WithPermission = craftDirective(
  'WithPermission',
  {},
  (baseLogic) => (user: Input<User>) => ({
    ...baseLogic(user),
    canEdit: () => user().permissions.includes('edit'),
  }),
  (baseTemplate) => (context) =>
    context.canEdit() ? baseTemplate(context) : [],
);

const EditablePanel = Panel.pipe(WithPermission);
```

Les styles d’une directive sont enregistrés dans le scope du composant qui la
porte. Une même directive utilisée par plusieurs composants reste donc
composable sans introduire de wrapper HTML.

## Ce que Craft gère directement

Craft prend en charge des compositions qui ne correspondent pas à une
propriété native d’un composant ou d’une directive Angular standard :

- une directive Craft peut déclarer `meta.styles` et contribuer à la feuille
  de styles du composant qui l’utilise ; Angular associe les styles à un
  composant, pas à une directive `@Directive` ;
- les styles d’une directive restent encapsulés avec `@scope`, sans réécrire
  les sélecteurs et sans ajouter de wrapper ;
- plusieurs directives peuvent composer leur logique, leur template, leurs
  classes d’hôte et leurs styles avec `.pipe(...)` ;
- les styles sont dédupliqués et refcomptés entre les instances, puis retirés
  lorsque la dernière instance disparaît.

Avec Angular standard, ce comportement demande généralement de déplacer les
styles dans un composant, d’ajouter manuellement des classes sur l’hôte ou de
gérer soi-même l’injection et le nettoyage d’une feuille de styles. Craft
conserve ces responsabilités dans le runtime de la directive.

## Choisir le bon niveau

- `host` : identité, attributs, classes ou comportement de la racine ;
- `styles` : apparence locale et réutilisable du composant ;
- `craftDirective` : comportement ou personnalisation réutilisable entre
  plusieurs composants ;
- la factory : état et dépendances propres au composant.

Les noms passés à `craftComponent` et `craftDirective` doivent être uniques et
correspondre au nom de leur déclaration. Les règles ESLint dédiées détectent
les noms manquants ou incohérents.
