craftService + setupCraftServiceTest : des services Angular composables et testables

Quand j'ai conçu @craft-ng, j'avais une obsession :
ne pas réinventer l'injection de dépendances d'Angular.

Tout repose sur le DI natif. Pas de runtime custom. Pas de magie. 🎯

`craftService` ajoute une couche déclarative par-dessus :
un nom, un scope, une factory → et vous récupérez `injectCounter()`, `provideCounter()`, `CounterToYield()`.

Le scope `global` = providedIn: 'root'.
Le scope `toProvide` = provider explicite.

Derrière, c'est du pur Angular.

La composition se fait via `yield*` dans une fonction génératrice.
Mais pas besoin d'en savoir plus sur les générateurs.

Retenez juste ça 👇

```ts
// Angular classique
const api = inject(ApiService);

// Avec @craft-ng
const api = yield * ApiServiceToYield();
```

C'est la même chose. `yield*` injecte un craftService dans un autre. Le système de types traque automatiquement l'arbre de dépendances.

Et c'est là que `setupCraftServiceTest` entre en jeu.

L'arbre inféré par `yield*` sert directement au testing :

- le typage **force** la couverture de chaque dépendance `toProvide`
- un `mock(...)` coupe la branche et ses sous-dépendances
- un vrai provider garde l'arbre vivant
- les dépendances `global` restent optionnelles

```ts
const { sut, mocks } = setupCraftServiceTest(CounterFacade, {
  Counter: mock({
    $self: vi.fn(() => 42),
    increment: vi.fn(),
  }),
});
```

Oubliez un mock ? Erreur de compilation. Pas de surprise au runtime. 🔒

Le carrousel détaille chaque étape avec des exemples.

📚 Doc : https://ng-angular-stack.github.io/craft/

Je suis Romain Geffrault.
Développeur Angular et créateur de @craft-ng
Suis-moi pour plus de contenu sur Angular
