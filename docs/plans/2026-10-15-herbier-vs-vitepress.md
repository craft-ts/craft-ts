# docs-herbier face à VitePress — la comparaison

Date : 2026-10-15. Contexte : `apps/docs` (Markdown) était servi par VitePress ; `apps/docs-herbier`
dessine les mêmes pages avec `@craft-ts/docs-ui` (thème Herbier). VitePress a été supprimé le même
jour. Ce document garde la trace de ce qui a été comparé, de ce qui a changé et de ce qui n'a pas
été repris.

Ce qui est établi ici vient de la lecture du code et de commandes lancées le 2026-10-15 (tests,
build, lockfile). Le rendu visuel côte à côte n'a pas été refait ce jour-là ; les constats visuels
cités viennent du chantier d'octobre (voir « Limites »).

## 1. Même contenu, deux moteurs

| | VitePress | docs-herbier |
|---|---|---|
| Source des pages | `apps/docs/**/*.md` | les mêmes fichiers, lus **en place** (`DOCS_SRC`), aucune copie |
| Parseur Markdown | markdown-it embarqué dans VitePress | `markdown-it` + règles propres (`docs-ui/src/markdown/parse.ts`) : conteneurs `:::`, alertes GitHub, imports `<<<`, marqueurs `[!code …]` |
| Résultat du parse | HTML produit directement | un **arbre de données** (`Block` / `Inline`), sans HTML dedans |
| Rendu | composants Vue | composants craft (`DocPage`, `DocCallout`, `DocCode`…) |
| Hydratation | Vue | `startCraft` réclame le HTML du serveur |
| Navigation entre pages | SPA de VitePress | `DocsNavigation` : intercepte les liens internes, lit `page-data/<route>.json` |
| Thème | `.vitepress/theme` (CSS + Vue) | Herbier : système de style typé, jour/nuit et quatre saisons |
| Nombre de pages | — | 165 pages Markdown, plus `404.html` |

Le point de départ de la comparaison était d'obtenir **les mêmes pages sous les mêmes sections**.
C'est pour cela que le premier branchement lisait la configuration VitePress telle quelle
(`siteFromVitepress`).

## 2. Équivalences, une fonction à la fois

| Fonction VitePress | Équivalent docs-herbier |
|---|---|
| `themeConfig.nav` / `sidebar` | `apps/docs-herbier/src/server/site.ts` (données typées `SiteConfig`) |
| `themeConfig.outline: [2, 3]` | `outline` du parseur : entrées `h2` / `h3` |
| `search: { provider: 'local' }` | `search-index.json`, chargé au premier signe d'intention |
| `vitepress-plugin-llms` | `llms.txt` et `llms-full.txt` écrits par `prerender.ts` |
| Composants Vue du thème (`AuthorNote`, `CraftAgentPrompt`, `CraftTemplateMigrator`) | `src/components/*.ts`, en craft |
| `vite.plugins` (llms) | plus de plugin : le prérendu écrit les fichiers |
| `vitepress dev` | `nx serve docs-herbier` (:4420, rendu à la demande) |
| `vitepress build` | `nx build docs-herbier` : bundle navigateur, bundle Node, puis `prerender.mjs` |
| `base: '/craft/'` | `DOCS_BASE` (`/craft/` en build, `/` en dev) |

## 3. Ce qui a été fait pour sortir de VitePress

1. **Navigation** : copie de `config.mts` (les cinq sidebars et la barre du haut) dans `site.ts`,
   typée avec `SiteConfig`. Le titre et la description du site y sont aussi.
2. **`siteFromVitepress`** supprimé de `docs-ui` : plus personne ne lisait un config VitePress.
3. **Spec de navigation** : `libs/docs-ui/src/site/build.spec.ts` est devenue
   `apps/docs-herbier/src/server/site.spec.ts`. Elle vérifie que chaque lien de sidebar mène à un
   fichier, que chaque page a un fil d'Ariane et un précédent/suivant cohérents, que la recherche
   trouve ce qu'un lecteur taperait, et que `llms.txt` liste chaque page une fois.
4. **Dépendances fantômes** : `markdown-it`, `@types/markdown-it`, `shiki` et `yaml` étaient importés
   sans être déclarés (ils arrivaient par `vitepress`). Ils sont maintenant dans le `package.json`.
5. **Suppression** : `apps/docs/.vitepress/`, les paquets `vitepress` et `vitepress-plugin-llms`
   (169 paquets de moins dans le lockfile), les cibles nx `dev` / `build` / `serve` de `apps/docs`,
   et les listes d'exclusion qui nommaient `.vitepress`.
6. **Tests de `apps/docs` rebranchés** : `ai-agents-docs.spec.ts` lit `agent-prompt.ts` et `site.ts`
   de docs-herbier ; `browser-boundaries-docs.spec.ts` lit `siteAt('/')`.

## 4. Ce que la comparaison a trouvé

**La navigation copiée dérive.** Le commit `6366abbdb` (2026-10-15) a ajouté « Page stability »
(`/guide/testing/page-stability`) à la sidebar VitePress seulement. Dans docs-herbier la page
existait mais n'avait aucune entrée de sidebar, donc ni surlignage ni précédent/suivant. Corrigé
dans `site.ts`. C'est la raison pour laquelle garder les deux sites en parallèle coûtait un double
entretien, et qu'on a supprimé VitePress plutôt que d'ajouter un test de dérive.

**Six pages sont dans aucune sidebar**, sur les deux sites (la liste est figée dans
`site.spec.ts`, un nouvel orphelin fait échouer le test) :

- `/guide/migration/wave-1-tag-and-provided-in`
- `/guide/routing/hash-location`
- `/guide/testing/architecture/primitive-method-usage`
- `/guide/testing/architecture/resource-params-query-state`
- `/guide/testing/architecture/unused-primitive-method`
- `/guide/testing/folder-layout`

## 5. Ce qui n'a pas été repris

- **Libellés français de la recherche.** La config VitePress avait « Rechercher », « Aucun resultat »,
  « Naviguer »… Les libellés de docs-herbier sont `defaultLabels` de `docs-ui` (« Search the docs »,
  en anglais). Je n'ai trouvé aucune traduction française dans `docs-ui` ni dans `docs-herbier`.
  Les pages sont en anglais ; c'est un choix à confirmer plutôt qu'un oubli établi.
- **`socialLinks`** : remplacés par `footerLinks` (GitHub, npm) dans `root.ts`, pas par des icônes
  dans la barre.
- **Lien `rel="describedby"` vers `llms.txt`** de la balise `head` VitePress : non repris tel quel
  (le prérendu écrit `llms.txt` et une copie `.md` par page, mais je n'ai pas vérifié que la balise
  `<link>` existe dans le `head`).
- **Mobile** : comportement non dessiné ni validé (noté dans le plan `herbier-docs-ui.md`).
- Particules ambiantes, grain et brume de la maquette : pas repris.

## 6. Mesures du build du 2026-10-15

| | |
|---|---|
| Pages écrites | 165 (+ `404.html`) |
| Fichiers `.html` / `.md` dans `dist/apps/docs-herbier` | 168 / 167 (un `.md` par page, plus `llms*.txt` en texte) |
| `llms-full.txt` | 1,3 Mo |
| `search-index.json` | 1,1 Mo |
| Taille du dossier construit | 120 Mo |
| Durée de `nx build docs-herbier` | ≈ 48 s sans cache |
| Tests `docs-herbier` | 30 passent |
| Tests `docs-ui` | 305 passent (une première exécution en avait un en échec, non identifié ; la relance est verte) |
| Tests `apps/docs` | 178 passent |
| Tests `tools/` | 38 passent |

Les 120 Mo viennent du HTML : les marqueurs d'hydratation alourdissent les pages (environ 1 Mo sur
les pages longues, d'après les notes du chantier), pas le thème.

## 7. Limites de cette comparaison

- Elle compare les **structures** (code, données, sorties de build). Une comparaison visuelle page
  par page entre les deux sites n'a pas été refaite au moment de la suppression ; les vérifications
  visuelles connues datent du chantier du 2026-10-07 (accueil, page de doc, jour/nuit, 375 px,
  recherche, « 0 écart d'hydratation en prod »).
- La navigation de VitePress a été supprimée avec le config : pour la relire telle qu'elle était,
  `git show 4f1187dde:apps/docs/.vitepress/config.mts` (ou tout commit antérieur à la suppression).
- `libs/docs-ui` a 6 erreurs ESLint `prefer-relative-heading` dans `markdown/render.ts` sur la branche
  `fix/loop-guard-remount`. Elles ne viennent pas de ce changement.

## 8. Reste à faire

- Vérifier le déploiement (CI / GitHub Pages) : il n'y a pas de `.github/workflows` dans le dépôt
  tel que je l'ai lu ; le script de release local construit déjà `docs-herbier`.
- Décider des libellés de recherche (anglais ou français).
- Ajouter les six pages orphelines à la sidebar, ou les assumer.
- Valider le comportement mobile.
