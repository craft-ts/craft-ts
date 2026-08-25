# MCP page de développement — agent ↔ onglet local

## Problème

Un agent Cursor qui travaille sur la demo locale a aujourd’hui trois canaux
mal alignés :

- Playwright MCP pilote **un autre** navigateur.
- Chrome DevTools MCP n’est pas fiable ici (souvent déconnecté) et exige un
  Chrome lancé avec le debug distant.
- Le MCP `function-registry` sait muter les primitives Craft, mais pas
  « cliquer / saisir comme un utilisateur » sur l’onglet déjà ouvert. La
  découverte y est chère (plusieurs tools, clés d’ancestry, pas de valeurs).

Le besoin : un canal **rapide**, collé à la page que le développeur a sous
les yeux (`ng serve`), pour agir et inspecter. Les primitives restent un
second canal, volontairement moins « standard ».

## Objectif

Sur une page déjà ouverte en développement :

1. Un outil MCP **`page`** : lire l’état visible et agir (saisie, clic,
   navigation interne). Un aller-retour : l’action, s’il y en a une, est
   suivie du nouvel état.
2. Le MCP **registry** existant : lire / muter / overrider les primitives
   (`query`, `state`, `mutation`, …). Pas de DOM.
3. Le raconter : carte en tête de la home docs, page Guide, `llms.txt`
   régénéré au build, skill local. Pas d’outil `page` dans `@craft-ng/mcp`.

Le bus reste le WebSocket actuel (`ws://127.0.0.1:3333`), le même `clientId`
`sessionStorage` que le registre et les logs.

## Non-objectifs

- Playwright, Chrome DevTools, ou `--remote-debugging-port` sur le chemin
  critique.
- Un second navigateur, un screenshot comme source d’action, une frappe
  touche par touche, une intention en langage naturel (`"clique le bouton
  vert"`).
- Composer `data-craft-name` en `Component:tag:localName`. L’unicité
  architecture porte déjà sur le **nom local** (`assertInteractiveElementNamed`).
  Le runtime continue d’écrire `data-craft-name="<localName>"`.
- Changer le contrat des tools `registry.*` (hors ce qui est nécessaire pour
  cohabiter sur le même broker).
- Production. Compilation `new Function`, acteur in-page, dump de styles :
  **dev only**, listener localhost.
- Ajouter l’outil `page` (ou un socket WS) au MCP **publié** `@craft-ng/mcp`.
  Ce serveur est docs + skills pour **écrire** du Craft, sans navigateur.
  `page` a besoin d’un onglet local : il reste sur
  `@ng-craft/function-registry-mcp`.

## Deux canaux

| | MCP `page` (standard) | MCP `registry` (natif Craft) |
|---|---|---|
| Job | Interagir avec l’UI, inspecter | Muter le modèle Craft |
| Cible | `data-craft-name` | clé d’entrée / primitive |
| Retour | surface de contrôles, ou DOM+styles | valeurs / sources / logs |
| Quand | l’agent se comporte comme un user | l’agent bypass l’UI |

Même processus Node, même broker, deux familles d’outils. Un seul connecteur
MCP à brancher dans Cursor. Les noms d’outils ne se mélangent pas :
`page` vs `registry.clients`, `registry.query.update`, …

## Outil `page`

Un seul tool MCP. Discriminant :

- pas de `act` → lecture ;
- `act` présent → exécute le batch, **puis** renvoie l’état.

```ts
type PageParams = {
  readonly clientId?: string;
  readonly act?: readonly PageAction[];
  readonly detail?: 'controls' | 'dom-styles';
  readonly styles?: readonly string[];
  readonly timeoutMs?: number; // défaut 20_000
};

type PageAction =
  | { readonly id: string; readonly fill: unknown; readonly match?: PageMatch }
  | { readonly id: string; readonly press?: string; readonly match?: PageMatch }
  | { readonly id: string; readonly match?: PageMatch }; // clic / activate
```

`clientId` : même règle que le registry. Un seul client connecté → omis.
Plusieurs → obligatoire, sinon erreur d’ambiguïté. Jamais « le plus récent »
implicitement.

`detail` défaut : `'controls'`. `'dom-styles'` est l’opt-in debug.

Après `act`, le `detail` demandé s’applique au **nouvel** état (post-ready).

### Protocole WebSocket

Méthode unique côté broker, pour coller à l’outil unique :

```text
page
```

Requête / réponse corrélées par `callId`, comme `registry/*`. Le navigateur
exécute, le broker n’interprète pas le DOM.

## Surface `controls`

C’est le retour par défaut. Poussée vers le broker à chaque changement
pertinent (même rythme que le snapshot registry actuel), pour que la lecture
sans `act` soit une **lecture mémoire** du broker quand le client est
`ready`. Si le broker n’a pas encore de surface à jour, il demande la page.

```ts
type PageControls = {
  readonly generation: number;
  readonly surfaceRev: number;
  readonly url: string;
  readonly title?: string;
  readonly status: 'ready';
  readonly controls: readonly PageControl[];
};

type PageControl = {
  readonly id: string; // data-craft-name
  readonly role: string; // textbox, button, checkbox, link, combobox, …
  readonly name: string; // nom accessible
  readonly value?: unknown;
  readonly enabled: boolean;
  readonly index: number; // 0..n-1 parmi les nœuds qui partagent id
  readonly track?: string; // si le nœud est dans un each
};
```

`id` est le littéral du helper (`input('email', …)` → `"email"`). Il est
unique **statiquement** dans l’app (`assertInteractiveElementNamed`). Au
runtime, un `forNode` peut répéter le même `id` : `index` (et `track` si
disponible) départage. `act` sans `match` sur un id répété est une erreur
d’ambiguïté ; le retour liste les `index` / `track` possibles.

Pas de dump de primitives dans cette surface. Pas de 500 logs.

## Saisie et activation

Un `fill` n’est pas une frappe. Selon le nœud :

1. **`CraftFieldDirective`** — `field.set(value)` puis `markTouched` (équivalent
   blur). Le DOM suit via le binding existant. Validation comprise.
2. **Contrôlé** (`value:` + handler `input` / `change`) — poser `el.value`
   (ou `checked` / `selected`) et dispatcher **un** `InputEvent` ou `change`.
   Le handler Craft déjà enregistré tourne.
3. **Non contrôlé** — poser `el.value`. Un `press: "Enter"` éventuel est une
   action suivante du même batch.

Checkbox / radio / select : `fill` booléen ou valeur d’option, via `field.set`
ou un seul `change`.

Clic (`act` avec `id` seul) : appeler le handler Craft du nœud si c’est un
bouton / lien / contrôle ; sinon `click()` natif. Pas de hit-test CDP.

Le batch s’exécute **dans l’ordre**, un seul message WS. Échec d’une étape :
stop, erreur avec l’`id` fautif, snapshot `controls` quand même renvoyé si
la page est encore `ready`.

## Ready / reload

Le `ng serve` rebuild casse le socket. Aujourd’hui le broker **efface** le
client : l’agent croit que la page n’existe plus. Contrat nouveau :

| Phase | Socket | Fiche client | `page` |
|---|---|---|---|
| `reloading` | fermé | **conservée** (url, dernière generation) | attend `ready` jusqu’à `timeoutMs` |
| `connecting` | `hello` reçu | snapshot / surface encore vide ou generation pas incrémentée | attend |
| `ready` | ouvert | surface publiée, `generation` > précédente (full load) ou `surfaceRev` bump (HMR) | exécute |

`generation` : entier, +1 à chaque chargement complet (au `hello`).
`surfaceRev` : entier, +1 à chaque publication de surface (HMR, navigation
interne, re-render qui change les contrôles). Navigation interne Angular :
socket vivant, on attend seulement que les `id` du batch soient dans la
nouvelle surface — pas un wait réseau.

Timeout dépassé :

```text
page reloading since 12s, last url /login-form, generation 4 → still 4
```

Les `act` en vol au disconnect sont rejetés avec cette sémantique, pas avec
« client unknown ». `page` sans `act` pendant `reloading` attend aussi ;
ce n’est pas à l’agent de poller.

## `detail: "dom-styles"`

Équivalent informationnel de `DOMSnapshot.captureSnapshot` (CDP) :
arbre DOM aplati + layout (rects) + computed styles **whitelistés**.

V1 : calculé **dans la page** (`getComputedStyle` + `getBoundingClientRect`),
parce que l’onglet est déjà le client WS et n’a pas de session CDP. Pas de
`--remote-debugging-port`. Le payload vise la même utilité debug (overflow
caché, `display:none`, couleur, taille), pas une copie bit-à-bit du CDP.

- `styles` omis → whitelist courte : `display`, `visibility`, `opacity`,
  `color`, `background-color`, `font-size`, `overflow`, `position`.
- `styles: []` → arbre + rects, **sans** styles.
- Nœuds `display: none` inclus, marqués. Pas de feuilles de style brutes,
  pas de `outerHTML` géant.

Interdit comme défaut : trop gros, trop lent. L’agent ne le demande que pour
un bug visuel / CSS.

## Ciblage et lint

Déjà en place, le spec s’y appuie, il ne les redéfinit pas :

- `craft-ng/require-interactive-local-name` : tout contrôle interactif a un
  premier argument littéral (`button('submit', { type: 'submit' }, 'Sign in')`).
- `assertInteractiveElementNamed` : ce nom est unique dans le graphe app.
- `craft-ng/template-element-name-unique` : pas deux `tag:localName` dans le
  même template de composant.

L’auteur n’écrit **pas** le nom du composant dans le littéral. Le renderer
n’a pas à le préfixer.

## Erreurs

Messages stables, actionnables, sans dump interne :

- `page client is not connected` / ambiguïté multi-onglets (même texte que
  le registry, famille `page`).
- `control "email" is not available` — id absent de la surface `ready`.
- `control "remove" is ambiguous (3 instances); pass match.index or match.track`.
- `control "email" is disabled`.
- `fill is not supported on role "button"`.
- `page reloading since …` (timeout ready).
- `dom-styles exceeds size cap` — si le payload dépasse une limite (256 KiB
  JSON) : erreur, pas un dump tronqué silencieux.

## Tests

- Broker : fiche conservée au disconnect ; `hello` incrémente `generation` et
  remet `connecting` → `ready` à la première surface ; timeout ; ambiguïté
  `clientId`.
- Acteur in-page : `fill` sur champ `CraftFieldDirective` (valeur + touched) ;
  `fill` + un `input` sur contrôle `*input` ; clic bouton nommé ; batch
  stop-on-error.
- Ready : `page` pendant un reload simulé (close socket, `hello` + surface)
  réussit sans sleep côté client MCP.
- `forNode` : `act` sans `match` → ambiguïté ; avec `index` → la bonne ligne.
- `dom-styles` : whitelist respectée ; nœud `display:none` présent ; défaut
  `controls` ne contient pas d’arbre DOM.
- E2E demo login : `fill` email + password + `submit`, sans reload de page,
  formulaire soumis.

## Documentation, skills, `llms.txt`, MCP publié

La fonctionnalité se vend et s’enseigne. Elle ne se **télécharge** pas dans
le MCP docs.

### Page d’accueil

Dans `apps/docs/index.md`, ajouter une carte `features` **en tête de liste**
(c’est le différenciateur). Docs en anglais :

```yaml
- title: Agents drive the tab you already have open
  details: In development the running app publishes its named controls. A coding agent fills, clicks and inspects that page — no second browser, no DOM reverse-engineering. Unique among frontend frameworks.
  link: /guide/ai/dev-page
```

Le hero (`name` / `text` / `tagline`) ne change pas.

### Guide

Nouvelle page `apps/docs/guide/ai/dev-page.md` (English, forme Guide du skill
doc-update) :

- **Use it when** un agent Cursor doit piloter ou inspecter la page `ng serve`
  déjà ouverte.
- **Not when** on écrit du Craft hors runtime → `@craft-ng/mcp` ;
  quand on mute une primitive sans l’UI → tools `registry.*`.
- Brancher le MCP local (`registry:mcp` / function-registry-mcp).
- Un outil `page` : lecture vs `act` puis état ; `detail: "controls"` vs
  `"dom-styles"`.
- Ciblage = nom local (`button('submit', …)`), unicité
  `assertInteractiveElementNamed`.
- Ready pendant le rebuild.

Sidebar Guide : entrée sous une section courte « Coding agents » (ou à côté
d’observability si la sidebar n’a pas encore ce groupe). Lien depuis
`/resources/ai-agents` (tableau des couches : 4e ligne **Live page MCP**,
dev only). Ligne dans `/reference/index.md` → cette page.

Snippets testés seulement pour le hyperscript nommé (`button('save', …)`),
pas pour un dump MCP.

### `llms.txt`

Pas d’édition à la main. `vitepress-plugin-llms` régénère l’index au build
docs. La **page guide** doit y apparaître (titre + description). Vérifier
après build.

Le YAML `features` de la home n’est pas un article : si le plugin l’ignore,
ajouter **une phrase** dans `llmstxt({ details: … })` de
`apps/docs/.vitepress/config.mts` qui pointe vers `/guide/ai/dev-page`.
`llms-full.txt` suit le même build.

### Skills

- **Local** (ce repo, à côté de `craft-ng-runtime-change-web-mcp`) : skill
  opérationnel `page` — `clients` / `page` / `detail`, fill vs clic, ready,
  quand basculer vers `registry.*`.
- **Registry skill** : une ligne — l’UI se pilote avec `page`, pas avec
  `registry.call` sur un bouton.
- **`@craft-ng/mcp` skills publiés** : pas de skill qui appelle `page` (l’outil
  n’existe pas dans ce serveur). Une phrase dans `craft-ng` / `best-practices.md`
  / `content/agents.md` : en dev local, la page ouverte se pilote via le MCP
  function-registry (lien guide).

### MCP exposé (`@craft-ng/mcp`)

**Pas nécessaire d’y exposer `page`.** `search_documentation` / le bundle
`docs-index.json` suffisent une fois la page guide merge. Pas de nouveau tool,
pas de WS dans ce process.

Le MCP qui **expose** `page`, c’est `packages/function-registry-mcp`
(README, liste des tools, annotations). Même binaire, même port.

## Tests (docs / agent stack)

En plus des tests runtime :

- `apps/docs/index.md` contient la carte features ci-dessus et le lien
  `/guide/ai/dev-page`.
- La page guide existe, est dans la sidebar, et un spec
  `apps/docs/tests/` (comme `ai-agents-docs.spec.ts`) vérifie le split
  `page` vs `registry.*` vs `@craft-ng/mcp`.
- `resources/ai-agents.md` mentionne le live page MCP comme couche **locale**.
- Aucun tool `page` dans `packages/mcp/src/mcp-server.ts`.

## Fichiers probables

- `apps/demo/src/app/function-registry-bridge.ts` : hello / surface / `page`.
- `apps/demo/src/app/` acteur page (surface + fill + snapshot styles).
- `packages/function-registry-mcp/src/protocol.ts`, `bridge-broker.ts`,
  `mcp-server.ts` : méthode `page`, tool `page`, états client
  `reloading|connecting|ready`.
- Tests colocalisés aux couches actuelles (bridge, broker, e2e demo).
- `apps/docs/index.md`, `apps/docs/guide/ai/dev-page.md`, sidebar
  `.vitepress/config.mts`, `resources/ai-agents.md`, `reference/index.md`.
- `.agents/skills/` (skill `page` + pointeur registry).
- `packages/function-registry-mcp/README.md`.
- Phrase dans `packages/mcp/content/best-practices.md` et `content/agents.md`.

Pas de nouveau package npm. Pas de nouveau port. Pas de tool `page` dans
`@craft-ng/mcp`.
