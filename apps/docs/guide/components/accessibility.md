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
   (modale native + focus), `liveRegion` (toasts). Pas de bouton **stylé** :
   `buttonControl` / `fieldControl` / `disclosureControl` injectent les props
   d’accessibilité dans vos éléments natifs.
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

Un template Craft est du TypeScript, pas un fichier `.html` : les règles
d’accessibilité marchent les appels hyperscript eux-mêmes — `button(...)`,
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
- `headingRoot(...)` repart à `h1` (dialog, reset explicite). Un `dialog` pose
  aussi sa propre racine d’outline (titre du dialogue = niveau 1 **dans** le
  dialog). Les SFC `loadComponent` restent sur `heading()`.
- `h1()`…`h6()` restent pour le HTML brut. La règle `prefer-relative-heading`
  les interdit dans un `craftComponent` (hors specs).

Un composant réutilisable expose `heading()` sans `headingSection` local : le
besoin d’outline **remonte** au parent. Appeler ce composant hors d’un
`headingSection` **ne compile pas** (même ADN que `pendingBlock`).

Toute SFC montée via `loadComponent` / `loadCraftComponent` appelle
`heading()` — pas `headingRoot()`. Le rang (h1 vs h2+) vient du parent :

- **Page** (sœur sous le shell) : `heading()` est le h1.
- **Layout** (SFC avec `CraftRouterOutlet`) : `heading()` +
  `headingSection([…, CraftRouterOutlet()])` pour que l’enfant hérite h2+.
- **Shell** (`App`) : `skipLink` + `main` + `CraftRouterOutlet`, **sans**
  `heading()` au-dessus de l’outlet. Sinon deux h1, ou des enfants coincés
  au même niveau que le titre du chrome.

`require-route-heading-outline` lit la cible lazy. `require-outlet-heading-section`
distingue layout et shell. Les types ne relient pas l’outlet à l’enfant routé.

```ts
// Shell — pas de heading() au-dessus de l’outlet
skipLink('main', 'Aller au contenu');
main({ id: 'main', tabIndex: -1 }, CraftRouterOutlet());

// Layout — titre + outlet dans headingSection
heading('Équipe');
headingSection([CraftRouterOutlet()]);

// Page (loadComponent) — heading() seulement ; h1 ou h2+ selon le parent
heading('Liste des tâches');
headingSection([
  heading('Détail'),
  TaskCard(),
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

## Helpers de contrôle (props à merger)

Les helpers sont renderless : ils fournissent les attributs à merger sur vos
éléments HTML, sans imposer de widget visuel.

```ts
const email = fieldControl('email');
label(email.label, 'Email');
input({ ...email.input, type: 'email' });
p(email.description, 'We never share your email.');

const faq = disclosureControl('faq-1', isOpen);
button({ ...faq.button, click: toggle }, 'What is Craft?');
div(faq.panel, '…');

button(buttonControl({ disabled: isSaving, keepFocusable: true }), 'Save');
```

Un panneau fermé reçoit `hidden` et `aria-hidden`, pour qu’aucun focus ne
reste à l’intérieur. `keepFocusable` pose `aria-disabled` sans `disabled` :
le clic n’est pas coupé, l’auteur doit no-op le handler.

Les états sont aussi exposés en `data-*`, ce qui permet une convention CSS
simple et indépendante du composant :

```css
button[data-disabled] { opacity: 0.5; }
input[data-invalid] { border-color: var(--danger); }
button[data-open] { font-weight: 600; }
```

Une live region doit être montée dès le premier rendu : ne conditionnez
jamais son nœud sur le message. Le lecteur d’écran peut ainsi s’y abonner
avant qu’un événement survienne.

```ts
// correct — region exists at first paint
liveRegion({ label: 'Notifications' }, copied() ? 'Copied' : '');

// incorrect — SR never subscribes
ifBlock(copied, () => liveRegion('Copied'));
```

## Navigation

`provideCraftRouter` enregistre `CraftTitleStrategy` : le `title` Angular de la
route est écrit via `BrowserDocument.setTitle`.

`withA11yNavigationFocus()` (opt-in, passé à `provideCraftRouter`) déplace le
focus vers `#main` / `<main>` après chaque navigation interne — pas au premier
chargement, le skip-link s’en charge.

`skipLink('main', 'Aller au contenu')` en tête du shell, avec
`main({ id: 'main', tabIndex: -1 }, …)`.

Pour synchroniser la langue et la direction du document depuis un générateur :

```ts
yield* BrowserDocument.setLang('fr');
yield* BrowserDocument.setDir('ltr');
```

`clickFocus` place le focus avant d’exécuter le handler, utile pour les
contrôles qui ouvrent une recherche ou un dialogue :

```ts
button({
  type: 'button',
  click: clickFocus('#search-warmup', openSearch),
}, 'Search');
```

## Tests

```ts
const { getByRole, getByLabel, toBeAccessible } =
  await setupCraftComponentTemplateTest(
    Page,
    { context },
  );
await toBeAccessible();
getByRole('button', { name: 'Save' });
getByLabel('Email');
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
