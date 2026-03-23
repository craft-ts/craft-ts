injectService (de @craft-ng) : créer des variables réactives et déclaratives dans ton composant, à partir d'un service Angular

Tu injectes un service Angular. Tu utilises 3 méthodes sur 15. Tu exposes tout le service au template. 🤷

Et si tu ne montrais que ce dont tu as besoin ?

C'est exactement ce que fait `injectService` dans @craft-ng.

Le principe est simple 👇

Tu injectes un service, et tu choisis explicitement ce que tu exposes. Tu peux renommer, dériver, composer. Le reste est masqué.

Prenons un exemple concret : créer une façade de navigation à partir du `Router` Angular.

```ts
readonly navigation = injectService(
  Router,
  ({ navigateByUrl, currentNavigation }) => ({
    decline: () => navigateByUrl('/terms/declined'),
    isNavigating: computed(() => currentNavigation() !== null),
  }),
);
```

3 lignes. Une API claire. Zéro fuite d'implémentation.

Ce qui me plaît beaucoup avec cette approche :

- les méthodes du service sont déjà bindées automatiquement
- les insertions sont chaînables : chaque callback accède aux résultats des précédentes via `context.insertions`
- les bindings internes (type `on$` / `afterRecomputation`) sont filtrés du résultat final
- c'est le même pattern que les primitives `state`, `query`, `mutation`…

Personnellement, je trouve ça très pratique pour rendre le composant orchestrateur de logique.

Avec l'utilisation de source$ et on$, on rend le service réactif.

Et aussi, déclaratif, on expose que ce qui va être utilisé par le composant.

Et ça rend aussi le composant beaucoup plus lisible. 💡

Ce qu'il faut savoir :

- ce sera disponible dans la prochaine version de @craft-ng (dès que j'ai finalisé le wrapping du signalForm)
- pour l'instant, la gestion des options d'injection (`optional`, `host`, `self`…) n'est pas encore implémentée — ça viendra

C'est un petit pas de plus vers l'esprit de variables déclaratives et réactives.

J'ai aussi une idée dans ce même état d'esprit qui viendra simplifier une partie des tests.

Ca reste une première version, ça peut toujours évoluer par rapport à vos retours.

📚 Doc @craft-ng : https://ng-angular-stack.github.io/craft/

Je suis Romain Geffrault.
Développeur Angular et créateur de @craft-ng
Suis-moi pour plus de contenu sur Angular
