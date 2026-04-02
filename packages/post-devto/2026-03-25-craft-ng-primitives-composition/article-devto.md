---
title: '@craft-ng: Associer l’art de la composition & du state management dans Angular'
published: true
description: 'Un tour complet des primitives, insertions et sources de @craft-ng pour écrire un code composable, déclaratif et réactif en Angular.'
tags: angular, typescript, signals, state
cover_image: https://dev-to-uploads.s3.amazonaws.com/uploads/articles/fu5ophzxv8l1o1ucmu4f.png
---

Quand je construis une feature Angular un peu sérieuse, je veux toujours la même chose:

- une seule source de vérité
- un flux de données clair
- un code composable
- une DX solide
- et surtout une type-safety qui m'évite de jouer aux devinettes
- des outils pour pensés pour simplifier l'UX/UI

C'est exactement l'objectif de @craft-ng.

Une lib complète de state management pour tous les types d'état d'une application:

- **client state**: états locaux, listes, UI, sélection...
- **server state**: chargement, cache, mutation, pagination, optimistic update...
- **URL state**: query params synchronisés, type-safe, avec fallback

Des utilitaires prêts à l'emploi pour se rendre la vie plus facile.

Une approche Method-based ou Event-based pour s'adapter à tous les styles de code.

Qu'ils soient simples ou complexes, le principe reste toujours le même.

1. Les « primitives », basées sur les signals, ont chacune leur rôle et portent un state et sa logique.
2. Elles sont utilisables directement dans les composants et les services.
3. Elles suivent toutes le même principe : primitive(config, insertion1, insertion2, ...).
4. Les insertions servent à ajouter de la logique (modifiers, réactions, états dérivés, method-based/event-based...).
5. Ce pattern, combiné aux utilitaires de craft-ng insert..., permet d'obtenir un niveau inégalé de composition, offrant une gestion fluide aussi bien pour les cas simples que complexes.
6. Un store craft est disponible pour orchestrer ces primitives. Il peut être composé par d'autres stores, et être lui-même composable.

Dans cet article, je vais:

- présenter la structure commune des primitives
- montrer comment exposer méthodes, état dérivés, et réagir à un événement via les insertions
- donner un exemple concret pour chaque primitive
- faire un tour rapide des insertions utiles
- expliquer pourquoi source$ (event-based) change vraiment la façon de structurer le state
- terminer avec injectService et le store craft

> ⚠️ **@craft-ng est une librairie experimentale.** Je ne recommande pas de l'utiliser en production pour le moment. Cet article est avant tout un partage des concepts.

La doc: https://ng-angular-stack.github.io/craft/

## 1) Une structure commune à toutes les primitives

Que tu utilises state, query, mutation, asyncProcess ou queryParam, la logique de composition reste la même:

1. une configuration de base
2. des insertions pour exposer des méthodes / des états dérives / des réactions

```typescript
import { computed } from '@angular/core';

const counter = state(
  0, // config
  // insertion 1
  ({ set, update }) => ({
    increment: () => update((current) => current + 1),
    reset: () => set(0),
  }),
  // insertion 2
  ({ state }) => ({
    isOdd: computed(() => state() % 2 === 1),
  }),
);

counter.increment();
counter.isOdd();
```

Ce point est clé: tu n'apprends pas 5 APIs différentes, tu apprends un modèle mental unique.

## 2) Les primitives: fonctionnement + exemples concrets

Dans la pratique, chaque primtive apporte ses fonctionnalités qui lui sont propres, et le composant/service/store m'aide à les orchestrer.

### state

state gère le client state synchrone.
C'est la base pour modéliser un état client, global ou local, le composer, et le spécialiser.

Combiné à `insertSelect`, le state devient redoutable pour gérer des structures imbriquées de manière fluide et type-safe.

```typescript
type User = { id: string; name: string; selected: boolean };

const usersState = state(
  {
    filters: { search: '' },
    users: [] as User[],
  },
  insertSelect('filters', ({ set }) => ({
    set,
  })),
);

usersState.selectFilters().set('@craft-ng');
```

Ce que j'aime ici:

- les méthodes suivent la structure du state
- la lecture du code reste directe

Pourquoi avoir créé un `state` alors qu'il y a déjà les signals d'Angular ?

- pour bénéficier du système de composition via les insertions
- exposer les méthodes qui modifient l'état pour le rendre prédictif
- encapsuler toute la logique qui lui est associée

### mutation

mutation: sert a modifier (UPDATE/PUT/PATCH/DELETE) des données cote serveur.

Version méthode directe avec `.mutate(...)`:

```ts
const updateUser = mutation({
  method: (payload: { id: string; name: string }) => payload,
  loader: async ({ params }) => {
    const response = await fetch(`/api/users/${params.id}`, {
      method: 'PATCH',
      body: JSON.stringify(params),
    });
    return response.json() as User;
  },
});

updateUser.mutate({ id: '42', name: 'Romain' });
```

> On peut aussi les appeler en parallèle, avec des identifiers, pour gérer des cas plus complexes (cf. l'exemple dans full-demo).

Pourquoi avoir créé une `mutation` alors qu'il y a déjà les resources d'Angular ?

- pour bénéficier du système de composition via les insertions
- permettre des appels api en parallèle via les identifiers
- retourner des `craftException` typés en cas d'erreur métier (ex: validation), pour ne pas perdre d'information et offrir la meilleure UX/UI à tes utilisateurs
- peut s'appeler comme une méthode directe `myMutationRef.mutate(...)`

### query

query: gère le server state (chargement, valeur, erreur, cache) et peut tourner en parallèle via identifier (ex: pour faire de la pagination).

C'est la primitive qui est faîte pour représenter une ressource distante, avec des utilitaires pour gérer le cache, les updates liés aux mutations, la pagination...

Avec insertPaginationPlaceholderData + insertReactOnMutation, on obtient:

- une pagination fluide
- des updates réactifs liés aux mutations (optimistic update/patch, auto reload).
- moins de code impératif

```typescript
import {
  insertPaginationPlaceholderData,
  insertReactOnMutation,
  mutation,
  query,
} from '@craft-ng/core';

const updateUser = mutation({
  method: (payload: { id: string; name: string }) => payload,
  loader: async ({ params }) => params,
});

const page = signal(1);
const usersQuery = query(
  {
    params: page,
    identifier: (page) => `${page}`,
    loader: async ({ params: currentPage }) =>
      fetch(`/api/users?page=${currentPage}`).then((r) => r.json()),
  },
  insertPaginationPlaceholderData,
  insertReactOnMutation(updateUser, {
    patch: {
      name: ({ mutationParams }) => mutationParams.name,
    },
  }),
);
```

Pourquoi avoir créé une `query` alors qu'il y a déjà les resources d'Angular ?

- pour bénéficier du système de composition via les insertions
- permettre des appels api en parallèle via les identifiers
- retourner des `craftException` typés en cas d'erreur métier (ex: validation), pour ne pas perdre d'information et offrir la meilleure UX/UI à tes utilisateurs

### asyncProcess

asyncProcess est idéal pour des traitements async qui ne sont pas strictement des queries/métiers CRUD (debounce, wrappers API natives, orchestration).

```typescript
import { asyncProcess } from '@craft-ng/core';

const delaySearch = asyncProcess({
  method: (term: string) => term,
  loader: async ({ params: term }) => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    return term;
  },
});

delaySearch.safeValue(); // undefined
delaySearch.status(); // 'idle'
delaySearch.method('@craft-ng');
delaySearch.status(); // 'loading' -> after 250ms -> 'resolved'
delaySearch.safeValue(); // '@craft-ng'
```

Pourquoi avoir créé un `asyncProcess` alors qu'il y a déjà les resources d'Angular ?

- permet de profiter du système de composition via les insertions
- retourner des `craftException` typés en cas d'erreur métier

### queryParam

queryParam synchronise l'état avec l'URL, tout en restant type-safe (parse/serialize/fallback).

```typescript
import { queryParam } from '@craft-ng/core';

const tableParams = queryParam(
  {
    state: {
      page: {
        fallbackValue: 1,
        parse: (v) => parseInt(v, 10),
        serialize: (v) => String(v),
      },
      search: {
        fallbackValue: '',
        parse: (v) => v,
        serialize: (v) => v,
      },
    },
  },
  ({ patch, reset }) => ({ patch, reset }),
);

tableParams.patch({ page: 2 });
```

Pourquoi avoir créé un `queryParam` alors qu'on peut utiliser `withComponentInputBinding`pour récupérer un query param dans un input ?

- `queryParam` peut être utilisé dans un service providé au niveau du composant
- possède une valeur de fallback en cas de non présence du query param ou d'une valeur invalide
- permet de modifier ce query param via les insertions
- profite du système de composition via les insertions
- permet de retourner des `craftException` typés en cas d'erreur métier au parse d'un query param

## Exemples de la doc qui m'ont inspiré

Si tu veux voir des versions plus complètes des patterns présentes ici, je te conseille particulièrement:

- les exemples primitives (query, mutation, full demo): https://ng-angular-stack.github.io/craft/examples
- l'approche list-with-pagination pour visualiser insertPaginationPlaceholderData en contexte
- les exemples Pixel Art / Pixel Art Matrix pour voir insertSelect sur des structures plus profondes
- la section exceptions pour les cas métier avec erreurs type-safe, pour ne pas perdre d'information et offrir la meilleure UX/UI à tes utilisateurs

Ces exemples m'ont servi de base pour structurer les snippets de cet article.

## 3) Exposer des méthodes et état dérivé avec les insertions (Method-based)

Tu peux partir simple, puis enrichir sans casser le contrat initial.

### Method-based insertions

```typescript
import { state } from '@craft-ng/core';
const counter = state(0, ({ update, set }) => ({
  increment: () => update((current) => current + 1),
  decrement: () => update((current) => current - 1),
  reset: () => set(0),
}));
console.log(counter()); // 0
counter.increment();
console.log(counter()); // 1
counter.reset();
console.log(counter()); // 0
```

### Source-based insertions (Event-based)

```typescript
import { source$, state, on$ } from '@craft-ng/core';

const incrementTrigger$ = source$<void>();
const resetTrigger$ = source$<void>();
const counter = state(0, ({ set }) => ({
  increment: on$(incrementTrigger$, () => set((v) => v + 1)),
  reset: on$(resetTrigger$, () => set(0)),
}));
console.log(counter()); // 0
incrementTrigger$.emit();
console.log(counter()); // 1
resetTrigger$.emit();
console.log(counter()); // 0
```

### Créer de la logique réutilisable est très simple

Tu peux extraire une insertion dans une fonction custom et la rebrancher partout:

```ts
const counter = state(0, (context) => myCustomFn(context));
```

Implémentation simple (dans cet esprit):

```ts
const myCustomFn = ({
  update,
  set,
  state,
}: {
  update: (updater: (v: number) => number) => void;
  set: (value: number) => void;
  state: Signal<number>;
}) => ({
  increment: () => update((current) => current + 1),
  decrement: () => update((current) => current - 1),
  reset: () => set(0),
  isOdd: computed(() => state() % 2 === 1),
});

const myState = state(0, (context) => myCustomFn(context));

myState.increment();
myState.isOdd();
```

Pour les cas plus poussés, j'étudie différents patterns pour que ca reste aussi simple que possible cote API et usage.

## 4) Tour rapide de quelques insertions utiles

Voici quelques insertions qui me semblent particulièrement utiles pour gérer des cas courants. Je ferai un focus dessus dans de prochains articles.

### insertPaginationPlaceholderData (query)

Pour garder les données de la page precedente pendant le chargement de la suivante.
Resultat: UX plus fluide, moins de flicker.

### insertReactOnMutation (query)

Pour synchroniser automatiquement le cache query avec le resultat d'une mutation (patch/optimistic/reload selon le besoin).

### insertLocalStoragePersister (state/query/asyncProcess)

Pour persister et rehydrater automatiquement avec localStorage.
Tres utile pour garder l'état entre sessions.

### insertEntities (state)

Pour manipuler des collections avec des utilitaires prets a l'emploi (add, set, update, remove, upsert...), en restant type-safe.

### insertSelect (state)

Pour cibler un sous-arbre d'état et exposer des méthodes/dérives au bon endroit.
Hyper utile sur des structures imbriquées. (Prochainement disponible)

## 5) Pourquoi source$ est un vrai levier d'architecture

source$ est l'outil que j'utilise pour garder des states granulaires sans perdre la simplicite d'orchestration.

Cela correspond grosso-modo à un subject dans RxJS.

### Cas 1: plusieurs states réagissent au même événement

Au lieu d'un gros state qui gère tout, plusieurs states petits et lisibles peuvent réagir au même trigger.

```typescript
import { on$, source$, state } from '@craft-ng/core';

const resetFilters$ = source$<void>();

const search = state('', ({ set }) => ({
  set,
  reset: on$(resetFilters$, () => set('')),
}));

const page = state(1, ({ set }) => ({
  set,
  reset: on$(resetFilters$, () => set(1)),
}));

resetFilters$.emit();
```

Ca donne:

- responsabilités claires
- meilleure DX
- flux de mise à jour plus facile à raisonner

Et surtout: tu peux commencer avec une méthode exposée, puis migrer vers une réaction on$ sans rearchitecture lourde.

### Cas 2: state imbriqué + insertSelect

Dans des structures profondes, insertSelect permet d'associer des méthodes et des états dérivés à une niveau plus profond.
Parfois, j'utilise source$ à un haut niveau, puis je réagis à cette source$ depuis des niveau imbriqués.
Cela me permet de modifier l'état au plus proche de l'endroit où il est modifié.

> Pour les states complexes avec des imbrications, le modèle mentale devient plus souple et plus facile à raisonner.

### Cas 3: event-driven (et pont avec Observable)

source$ + on$ permettent de réagir à des événements, y compris depuis un Observable.
Pour ceux qui aiment l'event-driven, c'est très naturel.

Et si tu veux rester dans un style state-driven et réagir à des changements d'état, il y a aussi:

- reactiveWritableSignal

Dans cet exemple, ce me permet de créer un linkedSignal, qui réagit à des changements d'états de d'autres signals.
Cela me permet retirer les ids qui ont été supprimés de la sélection, sans devoir faire du code impératif pour écouter les changements de page et de suppression.

```typescript
const selectedIds = reactiveWritableSignal([] as string[], (sync) => ({
  resetWhenCurrentPageIsResolved: sync(
    users.currentPageStatus,
    ({ params, current }) => (params === 'resolved' ? [] : current),
  ),
  resetWhenBulkDeleteIsResolved: sync(
    bulkDelete.status,
    ({ params, current }) => (params === 'resolved' ? [] : current),
  ),
})); // WritableSignal<string[]>
```

- `afterRecomputation` : qui déclenche son callBack si le résultat de sa source n'est pas `undefined`.
- `toSource`: transforme un signal en source. La première lecture d'une source renverra toujours `undefined`, puis dès que la source change, le résultat sera synchronisé.

## 6) La philosophie continue avec injectService

injectService permet de construire une facade typée au-dessus d'un service Angular .
Tu exposes uniquement ce qui est utile au cas d'usage, tu dérives proprement, et tu gardes la maitrise de l'API publique.

```typescript
import { computed } from '@angular/core';
import { injectService } from '@craft-ng/core';

const checkout = injectService(
  CheckoutService,
  ({ cart, total, submitOrder }) => ({
    total,
    itemCount: computed(() => cart().length),
    submit: submitOrder,
  }),
  ({ insertions }) => ({
    canSubmit: computed(() => insertions.itemCount() > 0),
  }),
);

checkout.canSubmit();
```

## 7) Et au-dessus: le store `craft`

La lib expose aussi un store `craft`, toujours basé sur la composition, la type-safety et le découplage.
Tu peux composer states, queries, mutations, sources, inputs et query params dans une architecture cohérente, sans perdre le contrôle fin.

Plus de détails dans un prochain article, sinon il y a la doc ;D

## Conclusion

Si je devais résumer @craft-ng en une phrase:
composer des briques simples pour gérer des logiques complexes, sans quitter un modèle déclaratif/reactif/type-safe.

Et la lib ne s'arrête pas là.
A l'heure où j'écris cet article, d'autres utilitaires arrivent dans la même philosophie.

Le prochain utilitaire, si je devais n'en partager qu'un :

- un formulaire à la pointe de la technologie (en plus de tout ce que permet le signal form d'Angular):
  - création de formulaire en parallèle
  - intégration avec les autres primitives (pour le submit, et les validations asynchrones)
  - gestion fine des erreurs (validation, submit, async validators), tout est inféré, permettant d'avoir la liste exhaustive des erreurs associées à un champ.
  - Gestion de la logique interdépendante grâce aux mécanismes de composition offerts par la lib.

(Actuellement, j'ai un wrapper du signalForm, mais j'ai 2 cas qui sont impossibles à gérer. J'attends un peu de voir si Angular permet d'étendre le signalForm, ou si je dois faire une implémentation custom pour garder la philosophie de composition et de type-safety.)

N'hésite pas à aller voir la doc ou à mettre une étoile sur le repo si tu veux suivre l'évolution de la lib, ou à me faire un retour si tu as des idées d'amélioration !

---

Je suis Romain Geffrault.
Développeur Angular et créateur de @craft-ng
Suis-moi pour plus de contenu sur Angular

Docs: https://ng-angular-stack.github.io/craft/
