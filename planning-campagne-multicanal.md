# Campagne de contenu @craft-ng/core — plan multicanal (dev.to · Medium · LinkedIn FR)

> Objectif : faire connaître craft-ng à la communauté Angular, assumer le statut beta/expérimental,
> et créer un flux régulier de « regards » vers la doc et le repo.

---

## 1. Mon avis sur la cadence de 2 articles / semaine

**Honnêtement : trop, si « article » veut dire 2 articles originaux et fouillés.**

Trois raisons concrètes :

1. **Tu es seul et tu développes aussi la lib.** 2 articles techniques de qualité = 8 à 12 h/semaine
   (rédaction + snippets qui compilent + relecture + visuels). C'est un demi-jour à un jour de dev en
   moins, toutes les semaines. La lib est en beta : le contenu ne doit pas cannibaliser la stabilisation
   de l'API — sinon tu attires des gens sur une API qui bouge encore.
2. **La communauté Angular juge sur la profondeur, pas sur le volume.** Un article vraiment bon par
   mois sur dev.to fait plus pour ta crédibilité que 8 articles moyens. Le risque du rythme 2×/semaine
   c'est le « tour des features » : une primitive par article, sans problème réel raconté derrière.
3. **Tu vas épuiser le stock de sujets « faciles » en 6 semaines** et te retrouver à écrire pour tenir
   la cadence. C'est le moment où les gens décrochent.

**Ce que je recommande à la place — et qui tient quand même la promesse « 2 publications/semaine » :**

| Rythme | Contenu |
|---|---|
| **1 × / semaine** | **1 article original et substantiel** (1200–2000 mots), en anglais, publié sur dev.to |
| **1 × / semaine** | **1 format court dérivé** : deep-dive de 400–600 mots, « TIL », comparaison, ou un StackBlitz commenté |
| **3 × / semaine** | **posts LinkedIn en français** (dont 1 qui pousse l'article de la semaine) |
| toutes les 1–2 sem. | **republication Medium** de l'article de la semaine précédente, avec canonical |

Tu publies donc bien **2 choses par semaine**, mais une seule demande un vrai effort. La deuxième est
un sous-produit de la première (un chapitre coupé, une objection reçue en commentaire, un snippet
isolé). C'est ce qui rend la cadence tenable sur 6 mois au lieu de 6 semaines.

**Si tu tiens absolument à 2 articles originaux/semaine :** fais-le pendant **4 semaines de lancement
seulement**, puis retombe sur le rythme ci-dessus. Un burst initial est utile pour exister ; un burst
permanent est un piège.

---

## 2. Architecture de distribution (important — à faire une fois)

Ne poste **jamais** le même article le même jour sur dev.to et Medium : Google en indexe un et
déclasse l'autre, et tu dilues les commentaires sur deux endroits.

**Cascade recommandée :**

```
Jour J     → dev.to (source canonique de l'article)
Jour J     → post LinkedIn FR qui renvoie vers dev.to
Jour J+5/7 → Medium, via « Import a story » (le canonical vers dev.to est posé automatiquement)
Jour J+10  → si l'article marche : version condensée en post LinkedIn natif (sans lien sortant)
```

**Pourquoi dev.to en premier :**
- La communauté Angular y est réellement active (tags `#angular`, `#typescript`, `#webdev`).
- Les commentaires y sont techniques et utiles pour ton API en beta.
- Champ `canonical_url` natif → tu peux même pointer vers ta doc si tu préfères la faire remonter.

**Pourquoi Medium quand même :**
- L'audience Medium Angular passe par les **publications**. Poste en solo = ~0 vue.
  → **Candidate à ITNEXT et Angular In Depth dès l'article 2 ou 3.** C'est le seul vrai levier Medium.
  Un article accepté dans ITNEXT peut faire plus de vues que tes 10 précédents cumulés.

**Réglages à faire maintenant :**
- [ ] Profil dev.to complet : bio + lien doc + lien GitHub + bannière
- [ ] Medium : demander l'accès writer à ITNEXT et Angular In Depth (ça prend des jours)
- [ ] Série dev.to « Building craft-ng » (les séries créent de la rétention lecteur)
- [ ] Bannière LinkedIn + section « Sélection » avec le lien de la doc
- [ ] UTM sur tous les liens (`?utm_source=devto&utm_campaign=<slug>`) pour savoir ce qui convertit

---

## 3. Ligne éditoriale : le positionnement

La lib est en beta. **Assume-le, c'est un atout narratif, pas une faiblesse à cacher.**

Le fil rouge de toute la campagne : **« build in public »**.
Pas « voici ma lib parfaite, adoptez-la » — mais « voici un problème Angular réel, voici comment j'ai
essayé de le résoudre, dites-moi où je me trompe ».

Trois règles de ton, valables sur les 3 plateformes :

1. **Problème d'abord, primitive ensuite.** Jamais un article qui commence par « `query()` permet de… ».
   Toujours : « voilà le code que je croise dans toutes les codebases, et pourquoi ça me gêne ».
   ⚠️ Reste factuel sur ton vécu : tu avais tes utilitaires RxJS, tu n'as pas subi ce boilerplate
   pendant des années. Le vrai angle, c'est « je l'ai lu/revu partout », pas « je l'ai écrit 40 fois ».
2. **Zéro dénigrement de NgRx / Signal Store / TanStack Query.** Tu te positionnes *à côté*, pas
   *contre*. La communauté Angular sanctionne très vite le ton « j'ai fait mieux que ».
3. **Une question ouverte en fin d'article.** Tu es en beta : chaque article est aussi une session de
   design feedback gratuite.

**Angle différenciant à marteler** (c'est ce qui te rend intéressant, pas les primitives elles-mêmes) :
le **typage** et le **graphe de dépendances visible par le compilateur**. C'est ton territoire, tu as
déjà une conf dessus. Les gens viendront pour « type-safety poussée à l'extrême en Angular » avant de
venir pour « encore un state manager ».

---

## 4. Calendrier éditorial — 12 semaines

**Comment lire les colonnes.** Elles correspondent aux 2 publications + 3 posts hebdo de la section 1 :

| Colonne | Quoi | Où | Langue | Effort |
|---|---|---|---|---|
| **A — article dev.to** | L'article original de la semaine, 1200–2000 mots | dev.to (puis Medium à J+5) | anglais | ~6 h |
| **B — format court** | La 2ᵉ publication, **dérivée de A** : un chapitre coupé, une objection reçue en commentaire, un snippet isolé, un StackBlitz commenté. 400–600 mots | dev.to | anglais | ~45 min |
| **LI (FR)** | Le **thème** des 3 posts LinkedIn de la semaine (voir le rythme mardi/jeudi/week-end en section 5) — pas un post unique | LinkedIn | français | ~1 h |

Le B n'est jamais un second sujet : c'est de la matière que l'écriture de A a produite en trop.
C'est ce qui rend la promesse « 2 publications/semaine » tenable.

**Exemple, semaine 1 :** A = l'article « the problem I kept running into » · B = un post court
« `state()` en 7 lignes » · LI = 3 posts FR (lancement, snippet, coulisses).

### Phase 1 — Exister (S1–S4) : « pourquoi »

| Sem | A — article dev.to | B — format court | LI (FR) |
|---|---|---|---|
| S1 | **I built a Signals-first toolkit for Angular. Here's the problem I couldn't stop hitting.** — le boilerplate loading/error/success, l'état dispersé entre URL / client / serveur. Annonce craft-ng en beta, honnêtement. | Snippet : `state()` en 7 lignes | Post de lancement, ton humble + lien dev.to |
| S2 | **Declare. Yield. Derive. — why craft-ng primitives are generators** — le choix de `function*` / `yield*`, ce que ça débloque en inférence. C'est ton sujet le plus singulier, sors-le tôt. | « Why not RxJS? » — 500 mots, réponse à l'objection n°1 | 2 posts : le choix des generators + 1 question ouverte à la commu |
| S3 | **Typed dependency injection in Angular: making the graph visible to the compiler** — `craftService`, `toCraftService`, `injectX`. | StackBlitz commenté : compteur → service | Post « comment tu gères tes services aujourd'hui ? » |
| S4 | **Fetching data without the ceremony: `query()` and typed exceptions** — le typage des erreurs, `handleExceptions`. | Comparaison honnête craft-ng / TanStack Query Angular | Post snippet `query()` + retour sur les 1ers commentaires reçus |

→ **Fin S4 : candidature ITNEXT avec le meilleur des 4.**

### Phase 2 — Convaincre (S5–S8) : « comment »

| Sem | A — article dev.to | B — format court | LI (FR) |
|---|---|---|---|
| S5 | **Mutations that don't lie: granular, identifier-based, optimistic** — `mutation`, mutations par id, optimistic updates. | Snippet mutation + query qui réagissent ensemble | Post cas d'usage réel |
| S6 | **Insertions: composition without inheritance** — `insertEntities`, `insertPagination`, `insertSelect`, `insertPipe`. **Article pilier**, le concept le plus vendeur. | « The bug that made me rewrite insertPipe » — build in public | 2 posts : concept insertions + coulisses |
| S7 | **URL is state: typed query params in Angular** — `queryParams`, parse/serialize, fallback, pagination+tri+filtres. | Recette : data table triable/paginée URL-synced | Post « pattern préféré pour les query params ? » |
| S8 | **Type-safe routing: route inputs, providers, and guards as plain generators** — `route().withProviders()`, guards, navigation non bloquante. | Snippet guard async `untilSettled` | Post routing + sondage LinkedIn |

### Phase 3 — Crédibiliser (S9–S12) : « ça tient en vrai »

| Sem | A — article dev.to | B — format court | LI (FR) |
|---|---|---|---|
| S9 | **Testing Angular state without mocking the world** — les tests décrivent le vrai graphe de dépendances. | Un test avant/après | Post testing |
| S10 | **Observability by design: correlation IDs and exception capture in the reactive graph** | Screenshot du dependency graph généré | Post visuel (le graphe = ton meilleur asset visuel) |
| S11 | **Craft programs: `.pipe`, `catchTag`, `retry` — exhaustive error handling checked at compile time** — le sommet du typage. | « TS2589 et moi » — anecdote type-level | Post typage avancé (relie à ta conf) |
| S12 | **Forms, derived** + bilan trimestre : ce que la beta a changé grâce aux retours. | Récap série dev.to | Post bilan + appel à contributeurs / early adopters |

**Réserve de sujets** (pour S13+ ou remplacement) : `@craft-ng/component` selectorless, les règles
ESLint + codemods de `@craft-ng/dev-tools`, `asyncProcess` / debounced search, migration progressive
d'une app existante, `schema-effect`, retour d'expérience NgBaguetteConf.

---

## 5. LinkedIn (FR) — le rythme séparé

LinkedIn ne suit pas le rythme des articles : c'est un canal **quotidien-ish**, français, personnel.
Tu as déjà 40 prompts de posts dans `planning-posts-promotion.md` — garde-les, ils s'intègrent ici.

**3 posts / semaine, répartition type :**

- **Mardi — post « valeur »** : un concept, un snippet, une leçon. Pas de lien sortant.
- **Jeudi — post « article »** : celui qui pousse l'article dev.to de la semaine.
  ⚠️ **Mets le lien en premier commentaire**, pas dans le corps du post — LinkedIn dégrade la portée
  des posts avec lien sortant.
- **Samedi/Dimanche — post « humain »** : coulisses, doute, bug résolu, décision d'API regrettée.
  Ce sont statistiquement tes meilleurs posts, et ils servent la narration « beta assumée ».

**Formats qui marchent chez toi** (vu tes posts existants) : le format numéroté `1️⃣2️⃣3️⃣`, le gras
unicode pour les mots-clés, la question finale. Continue, mais **limite le gras unicode** : il casse
les lecteurs d'écran et certains recruteurs/devs le trouvent bruyant.

**Une chose à ajouter :** poste au moins 1 fois/mois un **carrousel PDF** (code avant/après en 6
slides). C'est le format le plus poussé par l'algo LinkedIn en ce moment et tu n'en fais pas.

---

## 6. Checklist par article (30 min, à ne pas sauter)

- [ ] Tous les snippets **compilent** contre la version publiée sur npm (pas contre `main`)
- [ ] Mention explicite « beta, l'API peut évoluer » + version exacte (`@craft-ng/core@beta`, Angular 21)
- [ ] 1 lien doc + 1 lien GitHub + 1 lien StackBlitz jouable
- [ ] Cover image cohérente (même template pour toute la série → effet de marque)
- [ ] Tags dev.to : `#angular #typescript #webdev` + 1 spécifique
- [ ] Question ouverte en conclusion
- [ ] Ajouté à la série dev.to « Building craft-ng »
- [ ] Programmé : republication Medium à J+5

---

## 7. Amplification hors-plateforme (le multiplicateur oublié)

Écrire ne suffit pas — sur une lib inconnue, la distribution vaut plus que le contenu. À chaque article :

- **Reddit r/angular** — poste l'article, mais réponds dans les commentaires en tant qu'auteur, sans
  langue de bois. C'est la source n°1 de premiers utilisateurs pour une lib Angular.
- **Discord Angular officiel** + Discord/Slack communautaires FR
- **Newsletters** : soumets à *Angular Weekly* / *Ng-News* / *This Week in Angular*. Une inclusion =
  plusieurs milliers de devs Angular en une fois. Gratuit, sous-utilisé.
- **X/Bluesky** : thread court avec le snippet clé, tag les comptes Angular actifs (sans spam)
- **Toutes les 4–6 semaines** : proposer un talk / lightning talk meetup Angular FR. Tu as déjà
  NgBaguetteConf — capitalise, chaque talk = 3 posts LinkedIn + 1 article.

---

## 8. Ce qu'on mesure (mensuel, 10 min)

| Indicateur | Pourquoi | Objectif M+3 |
|---|---|---|
| npm downloads hebdo `@craft-ng/core` | le seul vrai signal d'adoption | 200/sem |
| GitHub stars + **issues ouvertes par des tiers** | les issues > les stars : ça prouve un usage réel | 10 issues externes |
| Visiteurs uniques doc | intention réelle | — |
| Vues dev.to / article | portée | 1500 sur le meilleur |
| Commentaires de fond (pas « nice! ») | qualité de l'audience | 5/article |

**Règle de pilotage :** au bout de 6 semaines, regarde quel **angle** a marché (typage ? DI ?
insertions ?) et réécris le calendrier des 6 suivantes autour de cet angle. Ne suis pas ce plan à la
lettre jusqu'à S12 si S3 fait 10× S1.

---

## 9. Le vrai risque de cette campagne

Ce n'est pas de ne pas tenir la cadence. C'est **d'attirer l'attention trop tôt sur une API qui bouge
encore**, et de brûler la première impression. Un dev qui essaie craft-ng en S4, se heurte à un
breaking change en S7 et abandonne ne reviendra pas en v1.

Deux garde-fous :

1. **Gèle l'API des primitives de base** (`state`, `query`, `mutation`) avant S1. Le reste peut bouger.
2. **Un CHANGELOG lisible et une note de migration à chaque breaking change**, mentionnés dans les
   articles. « Beta assumée + migrations soignées » = crédible. « Beta assumée + ça casse en silence »
   = mort de la lib.
