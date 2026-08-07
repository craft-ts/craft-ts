# 𝐋𝐞𝐬 𝟓 𝐩𝐫𝐢𝐦𝐢𝐭𝐢𝐯𝐞𝐬 𝐪𝐮𝐢 𝐯𝐨𝐧𝐭 𝐭𝐫𝐚𝐧𝐬𝐟𝐨𝐫𝐦𝐞𝐫 𝐭𝐨𝐧 𝐜𝐨𝐝𝐞 𝐀𝐧𝐠𝐮𝐥𝐚𝐫

Tu galères avec la gestion d'état dans Angular ?
Tu te perds entre RxJS et les Signals ?
Tu ne sais plus comment gérer tes appels API proprement ?

**J'ai créé 5 primitives qui vont tout changer.**

---

## 1️⃣ 𝐬𝐭𝐚𝐭𝐞 - L'état synchrone, simplifié

C'est la **𝐛𝐚𝐬𝐞 𝐝𝐞 𝐭𝐨𝐮𝐭**.

Un Signal amélioré qui te permet d'ajouter des méthodes et des computed properties.

```typescript
const counter = state(
  0,
  ({ update, set }) => ({
    increment: () => update((current) => current + 1),
    reset: () => set(0),
  }),
  ({ state }) => ({
    isOdd: computed(() => state() % 2 === 1),
  }),
);

counter.increment();
console.log(counter.isOdd()); // true
```

![Exemple state](./assets/state-example.png)

✅ **Type-safe**
✅ **Composable**
✅ **100 % déclaratif**

> Fini de créer des classes de service juste pour encapsuler un signal.

Avec `state`, tu ajoutes directement les méthodes dont tu as besoin.

**C'est ce qui me manquait depuis le début.**

---

## 2️⃣ 𝐪𝐮𝐞𝐫𝐲 - Le fetch de données qui gère tout

Fini les `useEffect` qui se déclenchent partout.
Fini les states pour `isLoading`, `error`, `data`.

**𝐓𝐨𝐮𝐭 𝐞𝐬𝐭 𝐠é𝐫é 𝐚𝐮𝐭𝐨𝐦𝐚𝐭𝐢𝐪𝐮𝐞𝐦𝐞𝐧𝐭.**

```typescript
const userQuery = query({
  params: userId, // signal
  loader: async ({ params: userId }) => {
    const response = await fetch(`/api/users/${userId}`);
    return response.json() as User;
  },
});

// Accède directement à tes données
console.log(userQuery.value()); // User | undefined
console.log(userQuery.isLoading()); // boolean
console.log(userQuery.status()); // 'idle' | 'loading' | 'success' | 'error'
```

![Exemple query](./assets/query-example.png)

Le **𝐜𝐚𝐜𝐡𝐞** est géré automatiquement.
Les **𝐫𝐞𝐪𝐮ê𝐭𝐞𝐬 𝐩𝐚𝐫𝐚𝐥𝐥è𝐥𝐞𝐬** ? Pas de problème.

👉 Tu peux même 𝐩𝐞𝐫𝐬𝐢𝐬𝐭𝐞𝐫 𝐝𝐚𝐧𝐬 𝐥𝐞 𝐥𝐨𝐜𝐚𝐥𝐒𝐭𝐨𝐫𝐚𝐠𝐞
👉 Ou 𝐫é𝐚𝐠𝐢𝐫 𝐚𝐮𝐱 𝐦𝐮𝐭𝐚𝐭𝐢𝐨𝐧𝐬 avec mise à jour optimiste

### Exemple avec localStorage et optimistic update

```typescript
const userQuery = query(
  {
    params: currentUserId,
    loader: async ({ params: currentUserId }) => {
      const response = await fetch(`/api/users/${currentUserId}`);
      return response.json() as User;
    },
  },
  insertReactOnMutation(updateUserMutation, {
    // Mise à jour optimiste
    optimisticUpdate: ({ mutationParams }) => mutationParams, // User
    // Reload si échec
    reload: { onMutationError: true },
  }),
  insertLocalStoragePersister({
    storeName: 'demo-app',
    key: 'user-query',
  }),
);
```

**C'est exactement ce que j'attendais.**

---

## 3️⃣ 𝐦𝐮𝐭𝐚𝐭𝐢𝐨𝐧 - Les mutations serveur sans friction

POST, PUT, DELETE... tout est simplifié.

```typescript
const createUser = mutation({
  method: (data: { name: string; email: string }) => data,
  loader: async ({ params }) => {
    const response = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return response.json() as User;
  },
});

// C'est tout !
createUser.mutate({
  name: 'John',
  email: 'john@example.com',
});

console.log(createUser.isLoading());
console.log(createUser.value()); // User | undefined
```

![Exemple mutation](./assets/mutation-example.png)

✅ **Gestion automatique du loading**
✅ **Gestion automatique des erreurs**
✅ **Mutations parallèles** avec identifiers

Et si tu veux faire des **𝐦𝐢𝐬𝐞𝐬 à 𝐣𝐨𝐮𝐫 𝐨𝐩𝐭𝐢𝐦𝐢𝐬𝐭𝐞𝐬** ?
Combine-le avec `query` et `insertReactOnMutation`.

**Magique.**

> De mon point de vue, c'est ce qui manquait cruellement dans l'écosystème Angular.

---

## 4️⃣ 𝐚𝐬𝐲𝐧𝐜𝐏𝐫𝐨𝐜𝐞𝐬𝐬 - Les opérations async simples

Pas besoin d'une query complète ?
Tu veux juste tracker un processus async ?

**𝐚𝐬𝐲𝐧𝐜𝐏𝐫𝐨𝐜𝐞𝐬𝐬** est là pour ça.

```typescript
const delay = asyncProcess({
  method: (text: string) => text,
  loader: async ({ params }) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return params;
  },
});

delay.method('Hello!');

console.log(delay.isLoading()); // true
// Après 300ms
console.log(delay.value()); // 'Hello!'
```

![Exemple asyncProcess](./assets/async-process-example.png)

👉 **Débounce une recherche**
👉 **Tracker le statut d'une API JS native** (`navigator.share`, etc.)
👉 **Gérer des opérations parallèles** avec identifiers

**Simple. Efficace. Déclaratif.**

### Exemple concret : débounce d'une recherche

```typescript
const searchSource = signal<string>();
const delayedSearch = asyncProcess({
  params: searchSource,
  loader: async ({ params: term }) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return term;
  },
});
```

---

## 5️⃣ 𝐪𝐮𝐞𝐫𝐲𝐏𝐚𝐫𝐚𝐦 - Synchronise ton état avec l'URL

Tu veux gérer **𝐥𝐚 𝐩𝐚𝐠𝐢𝐧𝐚𝐭𝐢𝐨𝐧** ?
Des **𝐟𝐢𝐥𝐭𝐫𝐞𝐬 𝐝𝐞 𝐫𝐞𝐜𝐡𝐞𝐫𝐜𝐡𝐞** ?
Et tout garder dans l'URL ?

**𝐪𝐮𝐞𝐫𝐲𝐏𝐚𝐫𝐚𝐦** fait tout automatiquement.

```typescript
const filters = queryParam({
  state: {
    page: {
      fallbackValue: 1,
      codec: {
        decode: (v) => parseInt(v, 10),
        encode: (v) => String(v),
      },
    },
    search: {
      fallbackValue: '',
      codec: { decode: String, encode: String },
    },
  },
});

// Accède à tes paramètres
console.log(filters.page()); // 1
console.log(filters.search()); // ''

// Mets à jour (URL synchronisée automatiquement)
filters.patch({ page: 2 });
filters.patch({ search: 'angular' });
```

![Exemple queryParam](./assets/query-param-example.png)

✅ **Type-safe**
✅ **Synchronisation automatique avec l'URL**
✅ **Parse & serialize personnalisables**

Parfait pour :

- La pagination
- Les filtres de recherche
- Les paramètres de tri
- Les tableaux et booléens

> Combiné avec `query`, ça devient 𝐞𝐱𝐭𝐫ê𝐦𝐞𝐦𝐞𝐧𝐭 𝐩𝐮𝐢𝐬𝐬𝐚𝐧𝐭.

Tu changes un paramètre, l'URL se met à jour, et la query se relance automatiquement.

**C'est ce genre de petits détails qui fait la différence.**

---

## 💎 𝐋𝐞 𝐦𝐞𝐢𝐥𝐥𝐞𝐮𝐫 𝐩𝐨𝐮𝐫 𝐥𝐚 𝐟𝐢𝐧

Ces 5 primitives sont **𝟏𝟎𝟎 % 𝐜𝐨𝐦𝐩𝐨𝐬𝐚𝐛𝐥𝐞𝐬**.

Tu peux les combiner entre elles.
Ajouter des **𝐢𝐧𝐬𝐞𝐫𝐭𝐢𝐨𝐧𝐬** pour étendre leurs fonctionnalités.

### Les insertions disponibles :

🔧 **insertLocalStoragePersister** - persiste tes queries
🔧 **insertReactOnMutation** - mise à jour optimiste automatique
🔧 **insertEntities** - gestion simplifiée de listes
🔧 **insertPaginationPlaceholderData** - données placeholder pour la pagination

**𝐓𝐨𝐮𝐭 𝐞𝐬𝐭 𝐩𝐞𝐧𝐬é 𝐩𝐨𝐮𝐫 𝐫é𝐝𝐮𝐢𝐫𝐞 𝐥𝐞𝐬 𝐟𝐫𝐢𝐜𝐭𝐢𝐨𝐧𝐬.**

Le code final est **𝐝é𝐜𝐥𝐚𝐫𝐚𝐭𝐢𝐟**.
**𝐓𝐲𝐩𝐞-𝐬𝐚𝐟𝐞**.
**𝐅𝐚𝐜𝐢𝐥𝐞 à 𝐜𝐨𝐦𝐩𝐫𝐞𝐧𝐝𝐫𝐞 𝐞𝐭 à 𝐦𝐚𝐢𝐧𝐭𝐞𝐧𝐢𝐫**.

### Exemple concret : une app complète en moins de 400 lignes

J'ai créé un exemple avec :

- Une liste d'utilisateurs
- Un cache automatique
- Suppression unitaire avec délai de rétractation
- Suppression en masse
- Mise à jour optimiste

**Tout tient dans moins de 400 lignes.**

Et c'est pratiquement 100 % déclaratif.

> C'est exactement le genre d'outil que j'aurais aimé avoir quand j'ai commencé à m'intéresser à la gestion d'état dans Angular.

---

## 🚀 𝐏𝐫ê𝐭 à 𝐞𝐬𝐬𝐚𝐲𝐞𝐫 ?

La doc complète arrive bientôt.
La lib sera sur npm sous peu.

Si tu veux être tenu au courant, envoie-moi un message !

**@𝐜𝐫𝐚𝐟𝐭-𝐧𝐠/𝐜𝐨𝐫𝐞** - Craft your Angular state with elegance.

---

## 𝐐𝐮𝐞𝐥𝐪𝐮𝐞𝐬 𝐛𝐨𝐧𝐧𝐞𝐬 𝐩𝐫𝐚𝐭𝐢𝐪𝐮𝐞𝐬

✅ **Utilise les insertions** - Elles permettent d'étendre les fonctionnalités sans sacrifier la simplicité

✅ **Compose tes primitives** - Combine state, query et mutation pour créer des patterns puissants

✅ **Reste déclaratif** - Évite les effects autant que possible

✅ **Pense composable** - Chaque primitive expose `set` et `state` pour faciliter la composition

> De mon point de vue, c'est ce qui manquait dans l'écosystème Angular.

Une solution qui 𝐬'𝐢𝐧𝐭è𝐠𝐫𝐞 𝐧𝐚𝐭𝐢𝐯𝐞𝐦𝐞𝐧𝐭 𝐚𝐯𝐞𝐜 𝐥𝐞𝐬 𝐒𝐢𝐠𝐧𝐚𝐥𝐬.

Sans avoir besoin d'aller chercher ailleurs.

hashtag#Angular hashtag#TypeScript hashtag#StateManagement hashtag#DX
