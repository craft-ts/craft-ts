# Directives fonctionnelles et `.pipe(...)`

Cette page décrit la composition proposée pour les composants fonctionnels Craft et leurs directives.

> API expérimentale : les exemples décrivent la cible d'architecture et pourront évoluer pendant l'implémentation.

## Composition de base

Une directive transforme la logique et le template existants :

```ts
const Card = component(
  {},
  (user: Input<User>) => ({ user }),
  ({ user }) => div(user().name),
).pipe(InteractivePermissions);
```

Le résultat de `InteractivePermissions` devient la logique réellement exécutée par `Card` :

```text
inputs du composant
        ↓
logic originale
        ↓
logic de la directive
        ↓
contexte final
        ↓
template final
```

## Input de configuration de la directive

Une configuration fixe peut être fournie au moment de créer la directive :

```ts
const hasPermission = (permission: Permission) =>
  craftDirective(
    (baseLogic: HostRequiredLogic<RequiresUser>) =>
      (user: Input<User>) => {
        const context = baseLogic(user);

        return {
          ...context,
          permissions: {
            canAccess: () =>
              user().permissions.includes(permission),
          },
        };
      },

    (baseTemplate: HostTemplate<ProvidesPermissions>) =>
      (context) =>
        context.permissions.canAccess()
          ? baseTemplate(context)
          : [],
  );

const Card = component(
  {},
  (user: Input<User>) => ({ user }),
  ({ user }) => div(user().name),
).pipe(hasPermission('edit'));
```

`edit` est une configuration interne. L'appelant de `Card` ne doit pas la fournir.

## Input fourni par l'appelant du composant

Une directive peut ajouter un input aux props publiques du composant :

```ts
const hasPermissionInput = craftDirective(
  (baseLogic: HostRequiredLogic<RequiresUser>) =>
    (
      user: Input<User>,
      permission: Input<Permission>,
    ) => {
      const context = baseLogic(user);

      return {
        ...context,
        permission,
        permissions: {
          canAccess: () =>
            user().permissions.includes(permission()),
        },
      };
    },

  (baseTemplate: HostTemplate<{
    user: Input<User>;
    permission: Input<Permission>;
    permissions: {
      canAccess: () => boolean;
    };
  }>) =>
    (context) =>
      context.permissions.canAccess()
        ? baseTemplate(context)
        : [],
);

const Card = component(
  {},
  (user: Input<User>) => ({ user }),
  ({ user }) => div(user().name),
).pipe(hasPermissionInput);

Card({
  user: () => currentUser,
  permission: () => 'edit',
});
```

La directive ajoute `permission` à la logique finale. Le renderer transmet les arguments dans l'ordre des props, selon la convention actuelle des factories fonctionnelles.

## Directive structurelle

Une directive structurelle décide si le template produit des nœuds :

```ts
const whenDirective = craftDirective(
  (baseLogic: HostRequiredLogic<{
    when: Input<boolean>;
  }>) => baseLogic,

  (baseTemplate: HostTemplate<{
    when: Input<boolean>;
  }>) =>
    (context) =>
      context.when()
        ? baseTemplate(context)
        : [],
);

const Panel = component(
  {},
  (when: Input<boolean>) => ({ when }),
  () => div(
    p('Contenu conditionnel'),
  ),
).pipe(whenDirective);

Panel({
  when: () => isVisible(),
});
```

Quand `when()` devient faux, le renderer supprime le rendu du template. Quand il redevient vrai, le template est rendu à nouveau.

Une directive structurelle peut consommer le contexte fourni par une directive précédente :

```ts
const onlyEditable = craftDirective(
  (baseLogic: HostRequiredLogic<{
    permissions: {
      canEdit: () => boolean;
    };
  }>) => baseLogic,

  (baseTemplate: HostTemplate<{
    permissions: {
      canEdit: () => boolean;
    };
  }>) =>
    (context) =>
      context.permissions.canEdit()
        ? baseTemplate(context)
        : [],
);

const EditableCard = component(
  {},
  (user: Input<User>) => ({ user }),
  ({ user }) => div(user().name),
).pipe(
  InteractivePermissions,
  onlyEditable,
);
```

Le contexte circule de gauche à droite :

```text
logic originale
  → InteractivePermissions
  → { user, permissions }
  → onlyEditable
  → template ou []
```

## Directives sur les éléments

Le même principe doit être disponible sur les nœuds hyperscript :

```ts
const message = p('Message').pipe(whenDirective);
```

Les directives Craft structurelles transforment le rendu Craft. Les directives Angular host sont également appliquées via `.pipe(...)`, sans propriété `directives` dans les props :

```ts
button({ craftRouterLink: link })
  .pipe(CraftRouterLink);
```

