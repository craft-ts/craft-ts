# Accessibilité

Craft force déjà les exceptions exhaustives, `pendingBlock`, et les templates
réactifs. L’accessibilité suit le même ADN : **un état illégal ne compile pas,
un oubli est une erreur ESLint, le runtime des blocs n’attend pas que l’auteur
s’en souvienne.**

Cible : **WCAG 2.2 niveau AA**.

## Les cinq couches

1. **Types** — `img` et `area` exigent `alt` (y compris `''` décoratif). Les
   helpers sémantiques (`dialog`, `fieldset`, `table`, `iframe`, `h4`–`h6`,
   `svg`…) existent pour que le lint s’applique sans passer par `h()`.
2. **ESLint `craft-ng/a11y`** — nom accessible, labels, ARIA, pas de click sur
   un `div`, `button` avec `type`, `h()` interdit quand un helper nommé existe.
3. **Runtime des blocs** — `pendingBlock` annonce le fallback (`aria-live`,
   `aria-busy`), `catchBlock` pose `role="alert"`, `defer` rend le placeholder
   clavier, `CraftRouterLink` pose `aria-current="page"`.
4. **Primitives** — `heading` / `headingSection` (outline relatif), `dialog`
   (modale native + focus), `liveRegion` (toasts). Pas de `craftButton`.
5. **Tests** — `toBeAccessible()` sur le helper de template.

```ts
import craftRules from '@craft-ng/dev-tools/eslint-rules';

export default [
  {
    files: ['**/*.ts'],
    plugins: { 'craft-ng': craftRules },
    rules: {
      ...craftRules.configs.a11y.rules,
    },
  },
];
```

Les règles sont en `error` dans le preset. Un disable est un écart documenté,
pas le chemin par défaut.

## Templates hyperscript

`@angular-eslint/template-accessibility` ne voit que `**/*.html`. Les templates
Craft sont du TypeScript. C’est le plugin `craft-ng` qui marche `button(...)`,
`img(...)` **et** `h('img', …)`.

```ts
img({ src: photo.url, alt: photo.title }); // décoratif : alt: ''
button({ type: 'button' }, 'Enregistrer');
a({ href: '/tasks' }, 'Tâches');
label({ htmlFor: 'email' }, 'Email');
input({ id: 'email', type: 'email' });
```

`h('button')` alors qu’un helper nommé existe est une erreur
(`prefer-named-html-helpers`) : c’est le bypass des types.

## Outline de titres

Un `h3` dans une Card est un faux positif classique : parfois sous un `h1`,
parfois sous un `h2`. Le titre ne choisit pas son rang. **Le parent le
fournit.**

```ts
heading('Liste des tâches');

headingSection([
  heading('Détail'),
  TaskCard(), // le heading() interne devient hN+1
]);
```

Le snippet ci-dessus est le cœur de l’API. Le skip-link et `main` appartiennent
au shell applicatif :

- `heading()` lit le niveau courant (1–6) et rend `h1`…`h6`.
- `headingSection(...)` incrémente d’un cran pour le sous-arbre — fragments
  commentaires, pas de wrapper DOM, comme `ifBlock`.
- `headingRoot(...)` repart à `h1` (page de route). Un `dialog` pose aussi sa
  propre racine d’outline (titre du dialogue = niveau 1 **dans** le dialog).
- `h1()`…`h6()` restent pour le HTML brut. La règle `prefer-relative-heading`
  les interdit dans un `craftComponent` (hors specs).

Un composant réutilisable expose `heading()` sans `headingSection` local : le
besoin d’outline **remonte** au parent. Appeler ce composant hors d’un
`headingSection` **ne compile pas** (même ADN que `pendingBlock`). La route
établit le niveau 1 avec `heading()` / `headingRoot()`.

```ts
skipLink('main', 'Aller au contenu');
main({ id: 'main', tabIndex: -1 }, [
  heading('Liste des tâches'),
  headingSection([
    heading('Détail'),
    TaskCard(), // le heading() interne devient hN+1
  ]),
]);
```

## Blocs

`pendingBlock` détache la source du document pendant le chargement (les nœuds
restent montés, ils ne sont pas `hidden` en CSS). Le fallback est enveloppé
dans `aria-live="polite"` `aria-atomic="true"` `aria-busy="true"`. Au reload,
la source reste visible ; `aria-busy` signale le rafraîchissement. Le focus
dans la source est restauré à la reprise.

`catchBlock` enveloppe le message d’erreur dans `role="alert"` si le fallback
n’est pas déjà une live region.

`defer` pose `aria-busy` pendant le chargement. Un trigger `interaction` sur un
placeholder qui n’est pas un contrôle reçoit `role="button"` et `tabIndex="0"`,
et ne se déclenche au clavier que sur Entrée / Espace.

## Dialog et live region

```ts
dialog(
  { labelledBy: 'title', open: true, onClose },
  [heading({ id: 'title' }, 'Confirmer'), button({ type: 'button', click: onClose }, 'Fermer')],
);

liveRegion({ politeness: 'polite' }, copied() ? 'Copié' : '');
```

`dialog` s’appuie sur `<dialog>` natif (`showModal`, Escape, `aria-modal`).
`liveRegion` est un `<span role="status">` (ou `alert` si `assertive`).

## Navigation

`provideCraftRouter` enregistre `CraftTitleStrategy` : le `title` Angular de la
route est écrit via `BrowserDocument.setTitle`.

`withA11yNavigationFocus()` (opt-in, passé à `provideCraftRouter`) déplace le
focus vers `#main` / `<main>` après chaque navigation interne — pas au premier
chargement, le skip-link s’en charge.

`skipLink('main', 'Aller au contenu')` en tête du shell, avec
`main({ id: 'main', tabIndex: -1 }, …)`.

## Tests

```ts
const { nativeElement, toBeAccessible } = await setupCraftComponentTemplateTest(
  Page,
  { context },
);
await toBeAccessible();
```

`assertAccessible` / `toBeAccessible()` couvrent les checks structurels (alt,
nom accessible, tabindex, iframe title). Le contraste réel et le reste de
WCAG 2.2 AA restent un job axe / AccessLint en CI applicative.

## CSS

Les règles `require-focus-visible` et `require-reduced-motion` s’appliquent aux
`styles` du `craftComponent` : si vous stylez `button` / `a` / `input`, définissez
`:focus-visible` ; si vous animez, gatez avec `prefers-reduced-motion`. Le
contraste passe par les tokens (`no-hardcoded-design-values`), pas par une
deuxième linter CSS.
