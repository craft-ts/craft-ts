# Projection de contenu

La projection est un contexte de rendu, pas une catégorie particulière de
composant. Un même `craftComponent` peut donc être rendu directement ou être
fourni dans un slot logique compatible.

Les deux formes utilisent la même primitive :

```ts
renderContent(value);
```

Elle accepte soit du contenu DOM différé (`RenderableContent`), soit une unité
de composant qui expose un contrat logique. Il n'existe pas de registre runtime
de type `contentChildren` et aucun composant spécial de projection.

## Contenu DOM libre

`ContentSlot` décrit un contenu DOM optionnel ou libre. `RequiredContent` ajoute
un contrat structurel vérifié par TypeScript.

```ts
import {
  content,
  craftComponent,
  div,
  renderContent,
  section,
  type ContentSlot,
  type RequiredContent,
} from '@craft-ng/component';

type CardInput = {
  readonly header?: ContentSlot;
  readonly body: RequiredContent<{
    readonly selector: {
      readonly tag: 'div';
      readonly class: 'card-body';
      readonly 'data-slot': 'body';
    };
  }>;
};

const Card = craftComponent(
  'Card',
  {},
  (input: CardInput) => input,
  ({ header, body }) =>
    section([
      header ? renderContent('header', header) : 'Titre par défaut',
      renderContent('body', body),
    ]),
);

Card({
  header: content(() => div('Titre fourni par l’appelant')),
  body: content(() =>
    div(
      { class: 'card-body', 'data-slot': 'body' },
      'Contenu de la carte',
    ),
  ),
});
```

Le sélecteur est analysé statiquement. Le contenu suivant est refusé, car il
ne contient pas `div.card-body[data-slot="body"]` :

```ts
Card({
  // @ts-expect-error le contenu ne respecte pas le contrat DOM du slot.
  body: content(() => div({ class: 'wrong-class' })),
});
```

Le contenu peut être composé de tableaux, de conditions, de boucles et de
templates. L'analyse recherche le sélecteur dans chaque branche rendue :

```ts
const body = content(() => [
  showIntro() ? div({ class: 'card-body' }, 'Introduction') : undefined,
  each(
    rows(),
    { track: (row) => row.id },
    (row) => div({ class: 'card-body' }, row.label),
  ),
  renderTemplate(cardRowTemplate, { $implicit: selectedRow() }),
]);

Card({ body });
```

La contrainte ne crée aucun wrapper et n'ajoute aucune validation runtime.
Les contrats DOM et les contrats logiques sont indépendants :

```text
RequiredContent<Requirement>  → forme du DOM fourni
ProjectionOf<Component>       → capacités logiques d'un composant
```

## Styles de contenu par slot

`contentStyles` est indexé par les noms des slots de contenu déclarés par le
composant. Un nom de slot inconnu est refusé par TypeScript.

```ts
const StyledCard = craftComponent(
  'StyledCard',
  {
    contentStyles: {
      body: ':scope { display: block; color: #344054; }',
    },
  },
  (input: { readonly body: ContentSlot }) => input,
  ({ body }) => renderContent('body', body),
);
```

L'appelant choisit explicitement si le contenu accepte ces styles :

```ts
StyledCard({
  body: content(() => div('Contenu stylé'), {
    allowContainerStyles: true,
  }),
});
```

Sans `allowContainerStyles: true`, le contenu est rendu mais reste isolé :

```ts
StyledCard({
  body: content(() => div('Contenu rendu sans les styles du conteneur')),
});
```

Le style exposé s'applique aux nœuds DOM ordinaires du fragment. Il ne traverse
jamais la frontière d'un composant Craft ou Angular imbriqué :

```ts
StyledCard({
  body: content(() => [
    div('Ce nœud peut recevoir contentStyles.body'),
    NestedCraftComponent({}), // frontière de style indépendante
  ], { allowContainerStyles: true }),
});
```

`contentStyles` ne peut référencer que des slots de contenu :

```ts
craftComponent(
  'InvalidStyles',
  {
    // @ts-expect-error "footer" n'est pas un slot de contenu déclaré.
    contentStyles: { footer: ':scope { color: red; }' },
  },
  (input: { readonly body: ContentSlot }) => input,
  ({ body }) => renderContent('body', body),
);
```

## Projection logique par contrat

Un composant devient projetable lorsqu'il retourne une propriété `contract`
depuis sa factory logique. Le contrat est construit et vérifié avec
`satisfies`.

```ts
import {
  button,
  craftComponent,
  renderContent,
  type ContentSlot,
  type ProjectionContractOf,
  type ProjectionOf,
} from '@craft-ng/component';

type ToolbarActionContract = {
  readonly kind: 'toolbar-action';
  readonly trigger: () => void;
  readonly disabled: () => boolean;
};

const ToolbarAction = craftComponent(
  'ToolbarAction',
  {},
  (input: {
    readonly key: string;
    readonly content: ContentSlot;
    readonly trigger: () => void;
    readonly disabled?: () => boolean;
  }) => ({
    key: input.key,
    contract: {
      kind: 'toolbar-action',
      trigger: input.trigger,
      disabled: input.disabled ?? (() => false),
    } satisfies ToolbarActionContract,
    content: input.content,
  }),
  ({ contract, content }) =>
    button(
      {
        type: 'button',
        disabled: contract.disabled,
        click: contract.trigger,
      },
      renderContent(content),
    ),
);

type ExtractedContract = ProjectionContractOf<typeof ToolbarAction>;
type ToolbarActionUnit = ProjectionOf<typeof ToolbarAction>;
```

`ProjectionContractOf<Component>` extrait le type de `logicOutput.contract`.
`ProjectionOf<Component>` ajoute la clé stable attendue par le renderer. Pour
les consommateurs génériques, `ProjectionSlot<Contract>` décrit directement
une collection d'unités compatibles.

## Collection explicite, ordre et clés stables

Le composant consommateur reçoit explicitement une collection typée. Chaque
unité doit fournir une clé stable utilisée par `each` pour réutiliser, déplacer
ou supprimer la bonne projection.

```ts
import {
  craftComponent,
  div,
  each,
  renderContent,
  type ProjectionOf,
} from '@craft-ng/component';

const Toolbar = craftComponent(
  'Toolbar',
  {},
  (input: {
    readonly actions: readonly ProjectionOf<typeof ToolbarAction>[];
  }) => input,
  ({ actions }) =>
    div(
      { role: 'toolbar' },
      each(
        actions,
        { track: (action) => action.key },
        (action) => renderContent(action),
      ),
    ),
);

Toolbar({
  actions: [
    ToolbarAction({
      key: 'save',
      content: () => 'Enregistrer',
      trigger: save,
    }),
    ToolbarAction({
      key: 'cancel',
      content: () => 'Annuler',
      trigger: close,
    }),
  ],
});
```

Le même `ToolbarAction` reste utilisable directement :

```ts
const Page = craftComponent(
  'Page',
  {},
  () => ({}),
  () => [
    ToolbarAction({
      key: 'standalone',
      content: () => 'Action directe',
      trigger: save,
    }),
    Toolbar({
      actions: [
        ToolbarAction({
          key: 'projected',
          content: () => 'Action projetée',
          trigger: save,
        }),
      ],
    }),
  ],
);
```

La définition du composant ne change pas selon le mode de rendu.

## Compatibilité et erreurs de typage

Un composant ordinaire reste parfaitement utilisable comme enfant direct, mais
ne satisfait pas un slot contractuel :

```ts
const PlainCard = craftComponent(
  'PlainCard',
  {},
  () => ({}),
  () => 'Carte sans contrat',
);

Toolbar({
  actions: [
    // @ts-expect-error PlainCard n'expose pas ToolbarActionContract.
    PlainCard({}),
  ],
});
```

Un contrat incomplet est refusé au moment de sa déclaration :

```ts
const invalidContract = {
  kind: 'toolbar-action',
  // @ts-expect-error trigger et disabled sont obligatoires.
} satisfies ToolbarActionContract;
```

La projection logique ne dépend donc ni du nom du composant, ni d'une
metadata `projection`, ni d'un registre runtime.

## Dialog : contenu optionnel et actions contractuelles

Un composant peut combiner du contenu DOM optionnel et plusieurs slots logiques
dans la même collection explicite.

```ts
import {
  button,
  craftComponent,
  div,
  each,
  footer,
  renderContent,
  section,
  type ContentSlot,
  type ProjectionOf,
} from '@craft-ng/component';

const Dialog = craftComponent(
  'Dialog',
  {},
  (input: {
    readonly body?: ContentSlot;
    readonly actions: readonly ProjectionOf<typeof ToolbarAction>[];
  }) => input,
  ({ body, actions }) =>
    section({ role: 'dialog' }, [
      body ? renderContent(body) : [],
      footer(
        each(
          actions,
          { track: (action) => action.key },
          (action) => renderContent(action),
        ),
      ),
    ]),
);

Dialog({
  body: content(() => div(['Supprimer le compte', 'Cette action est irréversible.'])),
  actions: [
    ToolbarAction({
      key: 'cancel',
      content: () => 'Annuler',
      trigger: closeDialog,
    }),
    ToolbarAction({
      key: 'delete',
      content: () => 'Supprimer',
      trigger: deleteAccount,
    }),
  ],
});
```

`closeDialog` et `deleteAccount` sont capturées par les closures de l'appelant.
La projection conserve donc le contexte lexical et l'injecteur du lieu où
l'unité ou le contenu a été déclaré.

## Conditions, réactivité et nettoyage

Les projections sont des nœuds Craft ordinaires. Elles peuvent donc être
placées dans des conditions et des templates, tout en conservant leur identité
par clé lorsqu'elles sont dans une collection. Ici, `visible` est une valeur
réactive callable fournie par l'appelant :

```ts
const OptionalToolbar = craftComponent(
  'OptionalToolbar',
  {},
  (input: {
    readonly visible: () => boolean;
    readonly actions: readonly ProjectionOf<typeof ToolbarAction>[];
  }) => input,
  ({ visible, actions }) =>
    visible()
      ? each(
          actions,
          { track: (action) => action.key },
          (action) => renderContent(action),
        )
      : [],
);
```

À la mise à jour, le renderer ajoute, supprime et déplace les projections par
leur clé. Au démontage, le contenu projeté, ses effets et ses styles sont
nettoyés avec le reste de l'arbre.

## API publique

Les principaux types et fonctions sont :

- `content(renderer, options?)` pour créer du contenu DOM différé ;
- `renderContent(value)` et `renderContent(slotName, value)` pour le rendre ;
- `RenderableContent` et `ContentSlot` pour les slots libres ;
- `RequiredContent<Requirement>` pour les contrats DOM statiques ;
- `ProjectionContractOf<Component>` pour extraire un contrat logique ;
- `ProjectionOf<Component>` et `ProjectionSlot<Contract>` pour typer les
  collections projetables.

Les anciennes primitives de fragments et de slots ne font plus partie de
l'API publique.
