# Plan : projection basée sur le contrat logique d’un composant

## Objectif

Remplacer le système actuel de content projection par une API où un composant
peut être rendu directement ou fourni dans un slot projeté, sans changer sa
définition, tout en conservant les contrats DOM et le contrôle explicite des
styles du contenu libre.

La projection est un contexte d’utilisation, pas une catégorie différente de
composant.

```text
un même craftComponent
  ├─ rendu directement
  └─ rendu dans un ProjectionSlot compatible
```

Un composant devient compatible avec un slot lorsqu’il expose explicitement un
`contract` dans son `logicOutput`.

## Décisions d’API

### Un seul contrat de définition

`craftComponent` reste la primitive publique principale. Il conserve la forme
logique/template :

```ts
logicInput => logicOutput
logicOutput => template
```

Il n’y a pas de `craftProjection` séparé et aucune metadata `projection`.

### Contrat déclaré dans la logique

Le contrat est construit dans la factory logique et vérifié avec `satisfies` :

```ts
type ToolbarActionContract = {
  readonly kind: 'toolbar-action';
  readonly trigger: () => void;
  readonly disabled: () => boolean;
};

const ToolbarAction = craftComponent(
  'ToolbarAction',
  {},
  (input: ToolbarActionInput) => {
    const contract = {
      kind: 'toolbar-action',
      trigger: input.trigger,
      disabled: input.disabled ?? (() => false),
    } satisfies ToolbarActionContract;

    return {
      key: input.key,
      contract,
      content: input.content,
    };
  },
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
```

`projectionContract(...)` n’est pas nécessaire. Le type du contrat est extrait
directement depuis `logicOutput.contract`.

```ts
type ProjectionContractOf<Component> = /* extrait logicOutput.contract */;
type ProjectionOf<Component> = /* unité projetable de Component */;
```

Un composant ordinaire sans propriété `contract` reste utilisable normalement,
mais ne satisfait aucun `ProjectionSlot` contractuel.

### Collections explicites

La première version ne reproduit pas `contentChildren` avec un registre runtime.
Le composant consommateur reçoit explicitement une collection ordonnée et
typée :

```ts
type ProjectionSlot<Contract> = readonly ProjectionUnit<Contract>[];
```

Chaque unité possède une clé stable. Le renderer réutilise cette clé pour
l’ajout, la suppression, le déplacement et le nettoyage des projections.

### Contrats DOM du contenu libre

Les composants qui reçoivent du contenu DOM arbitraire peuvent déclarer une
contrainte structurelle indépendante du contrat logique des projections :

```ts
type CardBodyRequirement = {
  readonly selector: {
    readonly tag: 'div';
    readonly class: 'card-body';
    readonly 'data-slot': 'body';
  };
};

type CardInput = {
  readonly body: RequiredContent<CardBodyRequirement>;
};
```

Le type checker vérifie que le contenu fourni contient au moins un élément
correspondant au sélecteur. Les tableaux, conditions, boucles et templates
restent parcourus statiquement selon les règles actuelles. La contrainte ne
crée pas de wrapper et n’ajoute pas de validation runtime.

Les contrats DOM et les contrats logiques restent distincts :

```text
RequiredContent<Requirement>
  → forme du DOM fourni

ProjectionOf<Component>
  → capacités logiques exposées par un composant
```

### Styles exposés au contenu libre

`contentStyles` est conservé pour les slots de contenu DOM ordinaire. Le
composant conteneur expose ses styles par slot :

```ts
const Card = craftComponent(
  'Card',
  {
    contentStyles: {
      body: ':scope { color: #344054; }',
    },
  },
  (input: CardInput) => input,
  ({ body }) => renderContent('body', body),
);
```

L’appelant doit accepter explicitement ces styles :

```ts
Card({
  body: content(
    () => div({ class: 'card-body' }, 'Contenu'),
    { allowContainerStyles: true },
  ),
});
```

Sans `allowContainerStyles`, le contenu est rendu mais reste isolé des
`contentStyles` du conteneur. Les styles du conteneur ne traversent jamais le
template interne d’un composant Craft ou Angular projeté.

### Un seul rendu public

Le renderer expose une primitive unique :

```ts
renderContent(value)
```

Elle accepte à la fois :

- du contenu différé ordinaire (`RenderableContent`) ;
- une unité issue d’un composant avec un contrat compatible.

L’implémentation peut conserver deux chemins internes, mais l’utilisateur ne
doit pas choisir entre plusieurs fonctions de rendu.

## Exemple final : Toolbar

```ts
type RenderableContent = () => CraftNodeChildren;

type ToolbarActionInput = {
  readonly key: string;
  readonly content: RenderableContent;
  readonly trigger: () => void;
  readonly disabled?: () => boolean;
};

const ToolbarAction = craftComponent(
  'ToolbarAction',
  {},
  (input: ToolbarActionInput) => {
    const contract = {
      kind: 'toolbar-action',
      trigger: input.trigger,
      disabled: input.disabled ?? (() => false),
    } satisfies ToolbarActionContract;

    return {
      key: input.key,
      contract,
      content: input.content,
    };
  },
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

const Toolbar = craftComponent(
  'Toolbar',
  {},
  (input: {
    readonly actions: readonly ProjectionOf<typeof ToolbarAction>[];
  }) => input,
  ({ actions }) =>
    div(
      { role: 'toolbar' },
      forNode(
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
      content: () => span('Save'),
      trigger: () => save(),
    }),
    ToolbarAction({
      key: 'cancel',
      content: () => span('Cancel'),
      trigger: () => cancel(),
    }),
  ],
});
```

## Exemple final : Card avec contrainte DOM et styles opt-in

```ts
type CardInput = {
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
  {
    contentStyles: {
      body: `
        :scope {
          display: block;
          color: #344054;
        }
      `,
    },
  },
  (input: CardInput) => input,
  ({ body }) =>
    section([
      h2('Titre'),
      renderContent('body', body),
    ]),
);

Card({
  body: content(
    () =>
      div(
        {
          class: 'card-body',
          'data-slot': 'body',
        },
        p('Contenu de la carte'),
      ),
    { allowContainerStyles: true },
  ),
});
```

Ce contenu est refusé statiquement :

```ts
Card({
  body: content(() => p('Mauvaise structure')),
  // Erreur TypeScript : le contenu ne contient pas
  // div.card-body[data-slot="body"].
});
```

Un composant sans le contrat attendu est refusé :

```ts
const Card = craftComponent(
  'Card',
  {},
  () => ({ title: 'Card' }),
  ({ title }) => div(title),
);

Toolbar({
  actions: [
    Card({}), // Erreur TypeScript : aucun ToolbarActionContract.
  ],
});
```

## Exemple final : Dialog

```ts
type DialogActionContract = {
  readonly kind: 'dialog-action';
  readonly trigger: () => void;
  readonly disabled: () => boolean;
};

const DialogAction = craftComponent(
  'DialogAction',
  {},
  (input: {
    readonly key: string;
    readonly content: RenderableContent;
    readonly trigger: () => void;
    readonly disabled?: () => boolean;
  }) => {
    const contract = {
      kind: 'dialog-action',
      trigger: input.trigger,
      disabled: input.disabled ?? (() => false),
    } satisfies DialogActionContract;

    return {
      key: input.key,
      contract,
      content: input.content,
    };
  },
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

const Dialog = craftComponent(
  'Dialog',
  {},
  (input: {
    readonly body?: RenderableContent;
    readonly actions: readonly ProjectionOf<typeof DialogAction>[];
  }) => input,
  ({ body, actions }) =>
    section(
      { role: 'dialog' },
      [
        body ? renderContent(body) : [],
        footer(
          forNode(
            actions,
            { track: (action) => action.key },
            (action) => renderContent(action),
          ),
        ),
      ],
    ),
);

Dialog({
  body: () =>
    div([
      h2('Supprimer le compte'),
      p('Cette action est irréversible.'),
    ]),
  actions: [
    DialogAction({
      key: 'cancel',
      content: () => span('Annuler'),
      trigger: closeDialog,
    }),
    DialogAction({
      key: 'delete',
      content: () => span('Supprimer'),
      trigger: deleteAccount,
    }),
  ],
});
```

`closeDialog` est une fonction du composant appelant. Elle est capturée par la
fermeture `trigger` et conserve donc le contexte lexical du lieu où `Dialog`
est déclaré.

## Utilitaires à supprimer ou conserver

### À remplacer dans la réécriture de la projection

Ces éléments ne doivent pas être conservés tels quels, car ils mélangent le
contenu libre, les contraintes DOM et les unités projetées :

- `ContentInput` et les types `ContentInput*` associés, remplacés par des
  inputs de slots explicites (`RequiredContent`, `ContentSlot`,
  `ProjectionSlot`) ;
- `CraftFragment`, remplacé par `RenderableContent` ;
- `craftSlot(...)`, remplacé par `content(renderer, options)` ;
- `project(...)`, remplacé par `renderContent(slotName, value)` ;
- `ProjectionNode` basé uniquement sur un fragment, remplacé par le rendu d’un
  composant ou d’un contenu selon la valeur fournie ;
- `CraftFragmentStylePolicy`, remplacé par une politique portée par
  `RenderableContent` ;
- les contraintes DOM attachées exclusivement à `ContentInput`, déplacées vers
  `RequiredContent` et `ContentSlot`.

La suppression doit couvrir les exports publics, les types internes, le
renderer, les tests, la démo et la documentation correspondante.

### À conserver

Ces utilitaires ne sont pas spécifiques à la projection et restent utiles :

- `craftTemplate(...)` ;
- `renderTemplate(...)` ;
- `forNode(...)` ;
- `ifNode(...)` ;
- `deferNode(...)` ;
- les locators génériques et leurs contraintes DOM ;
- `contentStyles`, avec une nouvelle liaison typée aux noms des slots ;
- l’opt-in `allowContainerStyles`, porté par `content(...)` ;
- le pipeline `craftDirective(...)` pour les composants et les nœuds ordinaires.

Les templates paramétrés restent nécessaires pour les listes et le rendu de
contenu avec contexte. Les locators restent nécessaires aux tests et aux
contrats DOM de composants normaux et alimentent la vérification de
`RequiredContent`.

## Vérification du typage

Ajouter des tests TypeScript couvrant :

- l’extraction de `ProjectionContractOf` depuis `logicOutput.contract` ;
- l’acceptation d’un composant dans un slot compatible ;
- le refus d’un composant sans contrat ;
- le refus d’un contrat incomplet ;
- la vérification d’un sélecteur `RequiredContent` ;
- le refus d’un contenu DOM ne satisfaisant pas son slot ;
- l’acceptation des tableaux, conditions, boucles et templates dans un contenu
  contraint ;
- plusieurs projections homogènes dans un slot ;
- le tracking par clé ;
- la conservation des propriétés et méthodes ajoutées par les directives ;
- la composition d’un opérateur sur chaque projection.

Ajouter des tests runtime couvrant :

- le rendu normal et le rendu projeté du même composant ;
- l’ordre des projections ;
- l’ajout, la suppression et le déplacement par clé ;
- le déclenchement de `trigger` ;
- le nettoyage au démontage ;
- la conservation du contexte lexical ;
- les projections conditionnelles et réactives.

Tests de style :

- `contentStyles` accepte uniquement les slots déclarés ;
- `allowContainerStyles: true` active les styles exposés ;
- l’absence d’opt-in conserve l’isolation ;
- les styles ne traversent pas les composants Craft ou Angular imbriqués.

## Migration et périmètre

- La réécriture est une rupture volontaire de l’API actuelle de projection.
- Les changements non committés liés à `ContentInput`/`CraftFragment` peuvent
  être supprimés dans la branche de migration.
- Les composants et directives ordinaires ne changent pas de modèle public.
- Aucun registre runtime équivalent à `contentChildren` n’est livré en V1.
- Les contraintes DOM et `contentStyles` ne sont pas supprimés : ils sont
  généralisés pour fonctionner avec `RenderableContent` et les nouveaux slots.
- Le fichier utilisateur `apps/docs/component/content-projection.md` devra être
  réécrit après validation de cette spécification.
