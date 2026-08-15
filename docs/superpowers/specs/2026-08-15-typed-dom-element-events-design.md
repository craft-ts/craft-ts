# Typage des events DOM sur les helpers hyperscript

## Problème

Les handlers d'events des helpers hyperscript (`input()`, `select()`, `button()`,
…) reçoivent aujourd'hui un `Event` générique. `event.target` est
`EventTarget | null`, donc le code applicatif annote et caste :

```ts
input({
  input: (event: Event) => {
    field = event.target as HTMLInputElement;
  },
  *keydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && field) yield* add(field);
  },
});
```

Deux causes se cumulent :

1. `DomEvents` mappe `GlobalEventHandlersEventMap` sans lier `target` /
   `currentTarget` à l'élément du helper. `keydown` est déjà un `KeyboardEvent`,
   mais `input` est un `Event` dont `target` n'est pas un `HTMLInputElement`.
2. `ElementPropsContext<_Tag>` ignore le tag (`_Tag`). `TagHelper` infère
   `const Props extends object` puis intersecte avec ce contexte : TypeScript
   n'injecte pas le type du paramètre dans `(event) =>` ni dans `*keydown(event)`.

Le type DOM de l'event (`KeyboardEvent`, `MouseEvent`, `SubmitEvent`, …) dépend
du **nom** du handler, pas de `type="checkbox"`. Ce que `type` change, c'est la
surface de l'élément (`value` / `checked` / `files`). `HTMLInputElement` expose
ces propriétés pour tous les `type`, donc sans restriction
`event.target.checked` type-checke sur un `type="text"`.

## Objectif

Un handler inline n'a plus besoin d'annotation ni de cast :

```ts
input({
  type: 'text',
  input: (event) => {
    field = event.target; // HTMLInputElement restreint texte
  },
  *keydown(event) {
    if (event.key === 'Enter' && field) yield* add(field); // KeyboardEvent
  },
});
```

`event.target.value` compile. `event.target.checked` sur ce même input est une
erreur de type. `event.key` compile sur `keydown`.

## Non-objectifs

- Pas de règle ESLint interdisant `(event: Event)` ou `as HTMLInputElement`.
  Une annotation explicite gagne sur l'inférence ; le code existant compile.
- Pas de changement de `sourceFromEvent` / `fromEventToSource$`.
- Pas de second argument `(event, el)` sur les handlers.
- Pas de changement de la **classe** d'event selon `type` (un `file` garde
  `input` et `change` comme events `Event`).
- Pas de migration massive des demos et docs. Seul le playground sert de
  preuve applicative.

## Design

Trois couches, dans cet ordre. Chaque couche affine la précédente.

### 1. Nom d'event → classe DOM

Conserver `GlobalEventHandlersEventMap` :

- `keydown` / `keyup` / `keypress` → `KeyboardEvent`
- `click` / `mousedown` / … → `MouseEvent`
- `submit` → `SubmitEvent`
- `input` / `change` → `Event` (c'est le contrat TypeScript du DOM)

Les deux formes de nom restent valides : `click` et `onClick`.

Le handler accepte une fonction ou un générateur, pour que `click: (event) =>`
et `*keydown(event)` reçoivent le même typage contextuel. Le type de retour du
générateur reste large (`Generator<any, any, any>`) : les méthodes existantes
qui `yield*` des valeurs brandées doivent rester assignables.

### 2. Tag → élément hôte

`target` et `currentTarget` sont tous les deux typés comme l'élément du helper
(compromis Solid : pratique, légèrement inexact si l'event bubble depuis un
enfant).

```ts
type TypedDomEvent<El extends EventTarget, EventName extends keyof GlobalEventHandlersEventMap> =
  GlobalEventHandlersEventMap[EventName] & {
    readonly target: El;
    readonly currentTarget: El;
  };
```

Exemples :

- `select({ change: (event) => event.target.value })` → `HTMLSelectElement`
- `textarea({ input: (event) => event.target.value })` → `HTMLTextAreaElement`
- `button({ click: (event) => event.currentTarget })` → `HTMLButtonElement`
- `form({ submit: (event) => event.target })` → `HTMLFormElement` et `SubmitEvent`
- `div({ click: (event) => event.target })` → `HTMLDivElement`

`h('input', props)` applique les couches 1 et 2 (`target` est
`HTMLInputElement`, `keydown` est `KeyboardEvent`) mais **pas** la couche 3 :
la table `type` est un contrat du helper `input()`, pas de `h()`.
`customElement('x-foo', props)` n'a pas d'entrée dans `HTMLElementTagNameMap` :
`El` retombe sur `HTMLElement`.

Le même `El` pilote les props primitives **et** les events. Conséquence
volontaire : `input({ type: 'text', checked: true })` est une erreur de type,
parce que `checked` est retiré de l'élément texte.

### 3. `input()` seulement : `type` littéral → élément restreint

`input` devient un helper spécialisé, sur le même levier que `img` (alt
obligatoire). Les autres tags n'ont pas de table `type`.

`type` omis vaut `'text'` (défaut HTML).

Si `type` n'est pas un littéral (fonction, yieldable, `string` large), `El`
est `HTMLInputElement` complet : aucune propriété n'est retirée.

Les familles reprennent le grouping de `craft-field` :

| `type` littéral | `El` se comporte comme | Propriétés retirées |
|---|---|---|
| omis, `'text'`, `'search'`, `'email'`, `'password'`, `'tel'`, `'url'`, `'color'`, `'hidden'`, `'submit'`, `'button'`, `'reset'`, `'image'` | `.value: string` | `checked`, `files`, `indeterminate` |
| `'checkbox'` | `.checked`, `.value`, `.indeterminate` | `files`, `valueAsNumber`, `valueAsDate` |
| `'radio'` | `.checked`, `.value` | `files`, `valueAsNumber`, `valueAsDate`, `indeterminate` |
| `'file'` | `.files: FileList` (pas `null`), `.value` | `checked`, `indeterminate`, `valueAsNumber`, `valueAsDate` |
| `'number'`, `'range'` | `.value`, `.valueAsNumber` | `checked`, `files`, `indeterminate`, `valueAsDate` |
| `'date'`, `'time'`, `'datetime-local'`, `'month'`, `'week'` | `.value`, `.valueAsDate` | `checked`, `files`, `indeterminate` |
| dynamique | `HTMLInputElement` complet | aucune |

Une union de littéraux (`type: 'checkbox' | 'text'`) distribue : `El` devient
l'union des deux éléments restreints. `.value` reste accessible. `.checked`
n'est accessible que si chaque membre de l'union le possède.

### Inférence

Aujourd'hui :

```ts
<const Props extends object>(
  props: (Props & ElementPropsContext<Tag>) | null,
  ...
)
```

Cible :

```ts
<const Props extends ElementPropsContext<Tag, El>>(
  props: Props | null,
  ...
)
```

Pour `input()`, `El` est calculé depuis le littéral `Props['type']` du même
objet (voir table). Pour les autres tags, `El = HTMLElementTagNameMap[Tag]`.

Si la contrainte circulaire `El` dépend de `Props` qui contient les handlers
typés par `El` fait exploser l'instanciation TypeScript, le recours est un jeu
d'overloads par famille (`checkbox`, `radio`, `file`, numeric, temporal, text),
pas l'abandon de `const Props`.

`const Props` est conservé : les littéraux de handlers restent capturés pour le
template contract. La contrainte n'est plus `object` : c'est le contexte
d'élément, pour que TypeScript contextually-type les callbacks.

`ElementPropsContext` utilise vraiment son paramètre de tag (plus `_Tag`).

Les surcharges nommées restent valides :

```ts
input('TodoNameToAddInput', { placeholder: 'New todo', *input(event) { ... } });
```

## Tests

Dans `libs/component/src/lib/hyperscript.spec.ts`, contrats de types
(`expectTypeOf` / `@ts-expect-error`) :

- `input({ input: (event) => event.target })` : élément texte (type omis).
- `*keydown(event) { event.key }` : `KeyboardEvent`, sans annotation.
- `input({ type: 'checkbox', change: (e) => e.target.checked })` compile ;
  `e.target.files` est une erreur de type.
- `input({ type: 'text', input: (e) => e.target.checked })` est une erreur de type.
- `input({ type: 'file', change: (e) => e.target.files })` : `FileList`, pas `FileList | null`.
- `input({ type: 'number', input: (e) => e.target.valueAsNumber })` compile.
- `type: () => 'checkbox'` : `HTMLInputElement` complet, `.checked` et `.files` compilent.
- `select({ change: (e) => e.target })` : `HTMLSelectElement`.
- `button({ click: (e) => e })` : `MouseEvent` avec `target: HTMLButtonElement`.

Preuve applicative : dans
`apps/demo/src/app/examples/playground/playground.ts`, retirer
`(event: Event)`, `(event: KeyboardEvent)` et `as HTMLInputElement`. Le fichier
doit type-checker.

## Fichiers

- `libs/component/src/lib/hyperscript.ts` — `TypedDomEvent`, `DomEvents<El>`,
  `ElementPropsContext<Tag, El>`, contrainte de `TagHelper`, helper `input`
  spécialisé.
- `libs/component/src/lib/hyperscript.spec.ts` — contrats de types.
- `apps/demo/src/app/examples/playground/playground.ts` — preuve, casts retirés.

Pas de changement runtime : uniquement des types et des tests de types.
