# Composition des directives Craft avec gestion des inputs

## Principe général

`.pipe(...)` transforme la définition du composant :

```ts
const Card = component(
  {},
  (user: Input<User>) => ({ user }),
  ({ user }) => div(user().name),
).pipe(InteractivePermissions);
```

Le pipeline produit une nouvelle logique :

```text
inputs du composant
        ↓
logic originale
        ↓
logic ajoutée par InteractivePermissions
        ↓
contexte final
        ↓
template final
```

Les inputs ajoutés par une directive sont exposés dans les props finales du composant.

## 1. Input de configuration de la directive

La configuration est fournie lors de la création de la directive.

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
```

Utilisation :

```ts
const Card = component(
  {},
  (user: Input<User>) => ({ user }),
  ({ user }) => div(user().name),
).pipe(
  hasPermission('edit'),
);
```

Ici, `edit` est une configuration fixe de la directive et n'est pas un input public de `Card`.

## 2. Input fourni par l'appelant du composant

Une directive peut aussi ajouter un input public au composant.

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
```

Utilisation :

```ts
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

La logique originale ne connaît que `user`. La directive ajoute `permission` à la logique finale et au contexte envoyé au template.

La compatibilité avec le renderer actuel repose sur la convention existante : les arguments de factory suivent l'ordre des props du composant.

## 3. Directive structurelle

Une directive structurelle transforme le résultat du template. Elle peut retourner le template original ou `[]`.

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
```

Utilisation :

```ts
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

Lorsque `when()` devient faux, le renderer supprime les nœuds rendus. Lorsqu'il redevient vrai, le template est rendu à nouveau.

Une directive structurelle peut aussi consommer la logique ajoutée par une directive précédente :

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
```

```ts
const Card = component(
  {},
  (user: Input<User>) => ({ user }),
  ({ user }) => div(user().name),
).pipe(
  InteractivePermissions,
  onlyEditable,
);
```

Le flux est alors :

```text
user
 ↓
logic originale
 ↓
InteractivePermissions
 ↓
{ user, permissions }
 ↓
onlyEditable
 ↓
template ou []
```

## API interne

Une directive est composée de deux décorateurs :

```ts
type LogicDecorator = (
  baseLogic: ComponentOrDirectiveLogic,
) => ComponentOrDirectiveLogic;

type TemplateDecorator = (
  baseTemplate: ComponentOrDirectiveTemplate,
) => ComponentOrDirectiveTemplate;
```

`.pipe(...)` compose les décorateurs de gauche à droite. Les factories génératrices, leurs `yield`, les dépendances Craft et la réactivité doivent être préservés.

