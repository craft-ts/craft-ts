# Utilitaires de test pour components et directives Craft

## Objectif

Ajouter des utilitaires de test indépendants du setup de test actuel pour
tester séparément :

- la logic d’un component ou d’une directive ;
- le template d’un component ou d’une directive ;
- les dépendances réellement utilisées par chaque partie.

L’API sera publiée dans `@craft-ng/component/testing`.

## API proposée

```ts
setupCraftComponentLogicTest.byRegister(Component, {
  register: {
    TodoStore: todoStoreMock,
  },
});

setupCraftComponentTemplateTest.byRegister(Component, {
  context,
  register: {},
});

setupCraftDirectiveLogicTest.byRegister(Directive, {
  baseLogic,
  args,
  register: {},
});

setupCraftDirectiveTemplateTest.byRegister(Directive, {
  baseTemplate,
  context,
  register: {},
});
```

Le test de logic retourne notamment le contexte produit par la factory et les
mocks utilisés. Le test de template monte le rendu Craft et expose le DOM,
`detectChanges`, la mise à jour du contexte et `destroy`.

## Règles de dépendances

Les dépendances de logic et de template sont projetées séparément.

Le `register` contient uniquement des dépendances de type service Craft. Il ne
contient jamais de composants enfants :

```ts
setupCraftComponentTemplateTest.byRegister(FullDemoCraft, {
  context,
  register: {},
});
```

`StatusComponent` est une dépendance de rendu, pas une entrée du registre. Si
ce composant utilise `FormatterService`, le registre contient
`FormatterService`, et non `StatusComponent` :

```ts
register: {
  FormatterService: formatterMock,
}
```

Les dépendances des composants enfants sont aplaties en dépendances de
services. Les valeurs du contexte (`store`, `user`, etc.) ne sont pas des
dépendances et sont fournies directement via `context`.

## Providers `toProvide`

- un provider déclaré dans `meta.providers` est disponible localement par
  défaut ;
- un provider amont est déclaré dans `providers` ou provient du setup Angular
  existant ;
- le registre utilise la valeur `'provided'` pour documenter une dépendance
  résolue depuis l’injecteur parent ;
- un mock dans le registre remplace le provider local ou amont ;
- un provider explicite dans le registre permet de modifier la configuration
  du service pour le test.

Exemple :

```ts
setupCraftComponentLogicTest(Component, {
  providers: [provideApiService({ baseUrl: '/test' })],
  register: {
    ApiService: 'provided',
  },
});
```

## Types et runtime

Ajouter des projections dédiées :

- `CraftComponentLogicDepsOf<Component>` ;
- `CraftComponentTemplateDepsOf<Component>` ;
- `CraftDirectiveLogicDepsOf<Directive>` ;
- `CraftDirectiveTemplateDepsOf<Directive>`.

Préserver `ComponentDepsOf<Component>` et les helpers existants. Réutiliser les
règles de registre actuelles (`real`, provider, mock, `notReached`, `appStart`)
pour les services, sans modifier le setup de test existant.

Le renderer de template doit également gérer les styles, les composants Craft
enfants, les directives Craft et le nettoyage des vues/injecteurs.

## Documentation à ajouter

Ajouter une documentation dédiée dans `apps/docs/component/`, couvrant :

- l’installation et l’import depuis `@craft-ng/component/testing` ;
- les tests séparés de logic et de template ;
- les exemples `StatusComponent` et `FullDemoCraft` ;
- la différence entre contexte de template et dépendance de service ;
- le fait que les composants enfants ne figurent jamais dans `register` ;
- les providers locaux, amont et `toProvide` ;
- les mocks et providers de test ;
- les tests de directives ;
- la compatibilité avec le setup de test existant.

## Validation

- Tests de typage confirmant qu’un registre template n’accepte que des
  services.
- Tests confirmant que les dépendances de logic n’imposent pas celles du
  template, et inversement.
- Tests DOM pour `StatusComponent` et `FullDemoCraft`.
- Tests de composants enfants ayant des services réels, mockés ou fournis en
  amont.
- Tests de directives de logic, de template et structurelles.
- Tests de nettoyage et de réactivité.
