craftService, basé sur des fonctions génératrices, pour des services Angular composables et testables sans galère

Avant de tout te raconter :

- Tout repose sur le DI natif. Pas de runtime custom. Pas de magie. 🎯

Pourquoi j'ai créé craftService ?
Avec les services Angular actuels, j'ai rencontré plusieurs problèmes/frictions.

1- Dans des projets existants "complexes", tester un service était galère.

Beaucoup, voire énormément de dépendances à gérer (provider/mocker).

Il faut parfois lancer plusieurs fois les tests avant d'arriver à le faire fonctionner (seulement à cause de la configuration du test, pas de la logique métier).

2- Je trouvais chiant, d'un côté, d'injecter mon service, puis, dans le constructeur ou un effect, de passer des infos au service.

J'ai cherché à limiter cette friction en permettant de passer naturellement des "inputs" au service dès l'injection.

3- À l'instar du point précédent, je trouvais que les interactions avec le service étaient parfois dispersées dans le composant/service qui l'injecte.

J'ai donc cherché à rendre l'injection la plus déclarative possible.

C'est à partir de ces constats et de mes précédentes expérimentations que j'ai créé `craftService`.

`craftService` ajoute une couche déclarative par-dessus l'injection d'Angular:
`craftService` ajoute une couche déclarative par-dessus l'injection d'Angular :
un nom, un scope, une factory.

Les scopes couvrent `global`, `toProvide`, `manuallyProvidedAtRoot`, `function` et `abstract`.

On peut configurer des inputs liés à l'injection du service, des inputs liés aux providers, des "Requirements" (similaires à des interfaces).

Derrière, c'est du pur Angular.

La composition se fait via `yield*` dans une fonction génératrice.
Mais pas besoin d'en savoir plus sur les générateurs.

Retiens juste ça 👇

```ts
// Angular classique
const api = inject(ApiService);

// Avec @craft-ng
const api = yield * ApiServiceToYield();
```

C'est la même chose. `yield*` injecte un craftService dans un autre. Le système de types traque automatiquement l'arbre de dépendances.

Et c'est là que `setupCraftServiceTestingByRegister` entre en jeu.

L'arbre inféré par `yield*` sert directement à construire un registre de test exhaustif :

- le typage **force** chaque entrée du graphe atteignable
- un mock brut coupe la branche et ses sous-dépendances
- `'real'` garde une implémentation réelle
- un vrai provider garde l'arbre vivant
- `'notReached'` documente explicitement les branches élaguées

```ts
const { sut, mocks } = setupCraftServiceTestingByRegister(injectCounterFacade, {
  CounterFacade: provideCounterFacade(),
  Counter: {
    $self: vi.fn(() => 42),
    increment: vi.fn(),
  },
});
```

Oubliez un mock/une dépendance ? Erreur de compilation. Pas de surprise au runtime. 🔒

De même une dépendance supprimée ou modifiée dans l'implémentation ? Erreur de compilation. Pas de casse silencieuse. 🔒

Le carrousel détaille chaque étape avec des exemples.

J'ai hâte de tester ça sur des projets existants.

📚 Doc : https://ng-angular-stack.github.io/craft/

Je suis Romain Geffrault.
Développeur Angular et créateur de @craft-ng
Suis-moi pour plus de contenu sur Angular
