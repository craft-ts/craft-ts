# Tester les components et directives Craft

Les utilitaires de test sont disponibles dans le sous-module dédié :

```ts
import {
  setupCraftComponentLogicTest,
  setupCraftComponentTemplateTest,
  setupCraftDirectiveLogicTest,
  setupCraftDirectiveTemplateTest,
} from '@craft-ng/component/testing';
```

Ils complètent le setup Angular existant et séparent volontairement la factory
du rendu. Chaque utilitaire expose aussi la forme `.byRegister(...)`, qui rend
explicite l'enregistrement des services utilisés par la partie testée.

Le package réexporte également les setups historiques par registre :

```ts
import {
  setupCraftServiceTestingByRegister,
  setupCraftComponentTestingByRegister,
} from '@craft-ng/component/testing';
```

Ils restent compatibles avec le setup de test existant et peuvent être utilisés
dans le même fichier que les utilitaires logic/template.

## Logic d'un component

Le test de logic exécute uniquement la factory et retourne son contexte ainsi
que les mocks installés :

```ts
const { context, mocks, destroy } =
  await setupCraftComponentLogicTest.byRegister(FullDemoCraft, {
    register: {
      TodoStore: {
        todos: {
          status: () => 'resolved',
          safeValue: () => [],
        },
      },
    },
  });

expect(context.store.todos.safeValue()).toEqual([]);
expect(mocks.TodoStore).toBeDefined();
destroy();
```

Les arguments de factory peuvent être fournis avec `args` lorsque le component
déclare des inputs :

```ts
await setupCraftComponentLogicTest.byRegister(StatusComponent, {
  args: [statusInput],
  register: {},
});
```

## Template d'un component

Le test de template reçoit le contexte déjà construit. La logic du component
n'est donc pas exécutée :

```ts
const test = await setupCraftComponentTemplateTest.byRegister(StatusComponent, {
  context: { status: () => 'resolved' },
  register: {},
});

expect(test.nativeElement.textContent).toContain('Loaded');
test.detectChanges();
test.updateContext({ status: () => 'error' });
expect(test.nativeElement.textContent).toContain('Error');
test.destroy();
```

Le retour expose `nativeElement`, `element`, `mocks`, `detectChanges`,
`updateContext` et `destroy`. Les styles Craft, les components enfants, les
directives Craft et la réactivité sont rendus par le renderer normal.

## Contexte et dépendances de service

Le `context` est une valeur de la factory et ne constitue pas une dépendance
de registre. Dans cet exemple, `store` est fourni directement au template :

```ts
await setupCraftComponentTemplateTest.byRegister(FullDemoCraft, {
  context: { store: todoStoreMock },
  register: {},
});
```

À l'inverse, si `StatusComponent` ou un component enfant utilise un
`FormatterService`, le registre template contient `FormatterService`, jamais
le component enfant :

```ts
register: {
  FormatterService: formatterMock,
}
```

Les projections `CraftComponentLogicDepsOf<Component>` et
`CraftComponentTemplateDepsOf<Component>` gardent ces deux graphes séparés.
Un registre template n'accepte donc que des services ; les components enfants
ne sont jamais des entrées de `register`.

## Valeurs du registre et providers

Les règles de résolution sont les mêmes que pour les tests de services :

- un objet est un mock et est disponible dans `mocks` ;
- `'real'` conserve le service réel ;
- `'notReached'` documente une branche supprimée par un mock parent ;
- `'provided'` demande la valeur fournie par l'injecteur parent ;
- un provider `provideX(...)` permet de configurer explicitement un service.

Les providers déclarés dans `meta.providers` sont disponibles dans le scope du
component. Les providers amont se placent dans `providers` :

```ts
await setupCraftComponentLogicTest.byRegister(Component, {
  providers: [provideApiService({ baseUrl: '/test' })],
  register: {
    ApiService: 'provided',
  },
});
```

Les décisions `appStart` (`'run'` ou `'ignore'`) sont disponibles dans les
options lorsque le graphe testé contient un service avec `appStart: true`.

## Tester une directive

La logic d'une directive reçoit explicitement sa `baseLogic` et ses arguments :

```ts
const { context } = await setupCraftDirectiveLogicTest.byRegister(
  hasPermissionInput,
  {
    baseLogic,
    args: [userInput, permissionInput],
    register: {},
  },
);
```

Pour le template, fournissez `baseTemplate` et le contexte final :

```ts
const test = await setupCraftDirectiveTemplateTest.byRegister(whenDirective, {
  baseTemplate: (context) => p(context.message()),
  context: { when: () => true, message: () => 'ready' },
  register: {},
});

test.updateContext({ when: () => false, message: () => 'hidden' });
test.destroy();
```

Les directives structurelles suivent le même chemin et peuvent vérifier le
remplacement du rendu par `[]`. Le nettoyage de `destroy()` supprime les vues,
les injecteurs, les listeners et les feuilles de style acquises.
