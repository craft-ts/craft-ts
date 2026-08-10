# 1. state

La primitive de base pour gérer votre état local

**Pourquoi ?** Un Signal amélioré avec méthodes et computed intégrés

```typescript
import { state } from '@craft-ng/core';

const counter = state(
  0,
  ({ update, set }) => ({
    increment: () => update((v) => v + 1),
    decrement: () => update((v) => v - 1),
    reset: () => set(0),
  }),
  ({ state }) => ({
    isEven: computed(() => state() % 2 === 0),
  }),
);

// Utilisation
counter(); // 0
counter.increment();
counter(); // 1
counter.isEven(); // false
```

**100% composable** avec le système d'insertions

---

# 2. query

Gérez vos appels serveur de façon déclarative

**Pourquoi ?** Cache, loading states, error handling... tout est intégré

```typescript
import { query } from '@craft-ng/core';

const userUserId = signal(1);

const userQuery = query({
  params: userUserId,
  loader: async ({ params }) => {
    const response = await fetch(`/api/users/${params.id}`);
    return response.json() as User;
  },
});

// Accès à l'état
userQuery.isLoading(); // true/false
userQuery.error(); // Error ou undefined
userQuery.value(); // User data ou undefined
```

**Support des queries en parallèle** avec identifier

---

# 3. mutation

Gérez vos POST, PUT, DELETE avec élégance

**Pourquoi ?** Optimistic update et reload automatique

```typescript
import { mutation } from '@craft-ng/core';

const updateUser = mutation({
  method: (data: { id: string; name: string }) => data,
  loader: async ({ params }) => {
    const response = await fetch(`/api/users/${params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return response.json();
  },
});

// Exécution
updateUser.mutate({ id: '1', name: 'John' });
```

**Se connecte aux queries** pour optimistic update

---

# 3.1 insertReactOnMutation

Connectez automatiquement vos queries à vos mutations

**Pourquoi ?** Optimistic updates et reloads sans code boilerplate

```typescript
import { query, mutation, insertReactOnMutation } from '@craft-ng/core';

const updateUserName = mutation({
  method: (data: { id: string; name: string }) => data,
  loader: async ({ params }) => {
    const response = await fetch(`/api/users/${params.id}`, {
      method: 'PATCH',
      body: JSON.stringify(params),
    });
    return response.json() as User;
  },
});

const userQuery = query(
  {
    params: () => ({ userId: '1' }),
    loader: async ({ params }) => {
      const response = await fetch(`/api/users/${params.userId}`);
      return response.json();
    },
  },
  insertReactOnMutation(updateUserName, {
    optimisticPatch: {
      name: ({ mutationParams }) => mutationParams.name,
    },
    reload: { onMutationError: true },
  }),
);

// L'UI se met à jour instantanément puis se synchronise
updateUserName.mutate({ id: '1', name: 'John' });
```

**Update immédiat + rollback automatique** en cas d'erreur

---

# 4. queryParam

Synchronisez votre état avec l'URL

**Pourquoi ?** Parfait pour filtres, pagination, recherches

```typescript
import { queryParam } from '@craft-ng/core';

const filters = queryParam(
  {
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
  },
  ({ patch }) => ({ patch }),
);

// Utilisation
filters.patch({ page: 2, search: 'angular' });
// URL: ?page=2&search=angular
```

**Parse et serialize** automatiques

---

# 5. asyncProcess

Encapsulez n'importe quelle opération async

**Pourquoi ?** Track automatiquement le status et les erreurs

```typescript
import { asyncProcess } from '@craft-ng/core';

const delay = asyncProcess({
  method: (result: string) => result,
  loader: async ({ params: result }) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return result;
  },
});

// Trigger
delay.method('success');

// Track state
delay.status(); // 'loading' | 'resolved' | 'error'
delay.isLoading(); // true/false
delay.value(); // 'success' (after completion)
```

**Support des opérations en parallèle** avec identifier

---

# Le pattern commun

Toutes les primitives suivent la même structure

**Premier paramètre** = Configuration de base

**Paramètres suivants** = Insertions

```typescript
primitive(
  config, // Configuration
  insertion1, // Méthodes
  insertion2, // Computed
  insertion3, // Side effects
  // ...
);
```

Cette approche rend la composition **triviale**

✅ Persister dans le localStorage ? → Insertion
✅ Réagir à une mutation ? → Insertion
✅ Ajouter des méthodes custom ? → Insertion

---

# Exemple réel

Combinons query + mutation + insertions

```typescript
const userQuery = query(
  {
    params: currentUserId, // Signal<number>
    loader: async ({ params: userId }) => {
      const response = await fetch(`/api/users/${userId}`);
      return response.json() as User;
    },
  },
  insertReactOnMutation(updateUserName, {
    optimisticPatch: {
      name: ({ mutationParams: { name: newName } }) => newName,
    },
    reload: { onMutationError: true },
  }),
  insertStoragePersister({
    storeName: 'demo-app',
    key: 'user-query',
  }),
);
```

**Code 100% déclaratif** avec une DX incroyable
