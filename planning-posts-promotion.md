# Planning de 40 Posts pour Promouvoir @ng-angular-stack/craft

## Semaine 1 : Introduction & Problématique

### Post 1 - Lancement Modeste

**Prompt:** "Crée un post LinkedIn annonçant sobrement le lancement de @ng-angular-stack/craft, une librairie de state management pour Angular basée sur les Signals. Mentionne qu'elle vise à simplifier la gestion d'état URL, Client et Serveur. Ton humble et ouvert aux retours."

- 📎 Lien vers le repo GitHub

### Post 2 - Le Problème des Boilerplates

**Prompt:** "Écris un post LinkedIn court partageant une frustration commune : passer trop de temps à écrire du code répétitif pour gérer les états de chargement, erreurs et succès dans Angular. Termine en mentionnant qu'on explore des solutions avec ng-craft. Ton conversationnel."

- 💡 Pas de lien, juste identification du problème

### Post 3 - Pourquoi les Signals

**Prompt:** "Rédige un post court expliquant pourquoi avoir choisi de baser ng-craft à 100% sur les Signals Angular plutôt que RxJS. Mentionne la simplicité, la performance et l'alignement avec la direction d'Angular."

- 📎 Lien vers la documentation Angular sur les Signals

### Post 4 - Mini Snippet : state()

**Prompt:** "Crée un post avec un snippet de code simple montrant comment créer un counter avec la primitive `state()`. Code de 5-7 lignes maximum. Souligne la simplicité."

```typescript
const counter = state(0, ({ update }) => ({
  increment: () => update((v) => v + 1),
}));
```

- 🔧 Code snippet inclus

## Semaine 2 : Primitives de Base

### Post 5 - La Primitive state

**Prompt:** "Écris un post expliquant la primitive `state` de ng-craft. Mentionne qu'elle combine Signal + méthodes + computed. Montre un cas d'usage avec un compteur qui a une propriété `isOdd`."

- 📎 Lien vers la doc de state
- 🔧 Snippet de code

### Post 6 - Question Ouverte

**Prompt:** "Pose une question à la communauté Angular : 'Comment gérez-vous actuellement vos query params dans vos apps Angular ?' Mentionne qu'on a créé quelque chose pour ça dans ng-craft et qu'on aimerait avoir des retours."

- 💬 Engagement communauté

### Post 7 - AsyncProcess Expliqué

**Prompt:** "Crée un post expliquant le cas d'usage de `AsyncProcess` : gérer une opération async avec tracking automatique du status (loading, error, success). Exemple : un debounced search."

- 📎 Lien vers la doc AsyncProcess

### Post 8 - Comparaison Modeste

**Prompt:** "Écris un post comparant brièvement ng-craft aux autres solutions (NgRx, Elf, Akita). Ton humble : 'ng-craft ne remplace pas tout, mais excelle pour les patterns courants de query/mutation'. Pas de dénigrement."

- 💡 Positionnement clair et respectueux

## Semaine 3 : Queries & Mutations

### Post 9 - Demo query avec Snippet

**Prompt:** "Crée un post montrant comment fetch des données avec la primitive `query`. Snippet simple de 8-10 lignes avec params, loader, et accès à value(), isLoading()."

- 🔧 Code snippet inclus
- 📎 Lien vers doc query

### Post 10 - Le Pouvoir de mutation

**Prompt:** "Rédige un post sur la primitive `mutation` pour gérer les POST/PUT/DELETE. Souligne la gestion automatique du loading state et des erreurs. Exemple : createUser mutation."

- 🔧 Code snippet inclus

### Post 11 - Parallel Queries

**Prompt:** "Post expliquant les identifier-based queries qui permettent de lancer plusieurs queries en parallèle et d'accéder à chacune via `.select()`. Use case : charger plusieurs users simultanément."

- 📎 Lien vers exemple
- 🎯 Créer un exemple StackBlitz

### Post 12 - Post Long Structuré

**Prompt:** "Crée un post LinkedIn structuré (avec sections numérotées) montrant le flow complet : 1) Définir une query 2) Définir une mutation 3) Les faire réagir ensemble 4) Mentionner qu'on verra les insertions plus tard. Format pédagogique avec émojis de numérotation."

- 📝 Format post long LinkedIn

## Semaine 4 : Query Params

### Post 13 - queryParam Introduction

**Prompt:** "Post introduisant `queryParam` : synchronisation bi-directionnelle entre state et URL. Cas d'usage : pagination, filtres, sorting. Snippet montrant page et pageSize."

- 🔧 Code snippet inclus
- 📎 Lien vers doc queryParam

### Post 14 - Typed Query Params

**Prompt:** "Post soulignant le type-safety de queryParam : parse et serialize explicites, fallbackValue. Exemple avec un type enum pour un filtre."

- 🔧 Code snippet inclus

### Post 15 - Real-World Use Case

**Prompt:** "Partage un use case réel : table de données avec tri, pagination et filtres synchronisés dans l'URL. Explique comment ng-craft simplifie ça. Pas de code, juste le cas d'usage."

- 💡 Cas d'usage concret

### Post 16 - Question Communauté

**Prompt:** "Pose la question : 'Quel est votre pattern préféré pour gérer les query params dans Angular?' Partage qu'avec ng-craft on utilise queryParam() et demande des retours."

- 💬 Engagement

## Semaine 5 : Insertions (Composition)

### Post 17 - Concept des Insertions

**Prompt:** "Écris un post expliquant le concept d'insertions dans ng-craft : ajouter des comportements réutilisables aux primitives. Analogie : plugins ou mixins. Mentionne insertLocalStorage, insertReactOnMutation."

- 📎 Lien vers doc insertions

### Post 18 - insertLocalStorage Demo

**Prompt:** "Post avec snippet montrant `insertLocalStorage` pour persister une query automatiquement. Souligne qu'il suffit d'une ligne pour avoir la persistence."

- 🔧 Code snippet inclus
- 🎯 Créer un exemple StackBlitz

### Post 19 - Optimistic Updates

**Prompt:** "Explique les optimistic updates avec `insertReactOnMutation`. Cas d'usage : update d'un profil user avec feedback immédiat. Snippet montrant optimisticPatch."

- 🔧 Code snippet inclus

### Post 20 - Custom Insertion

**Prompt:** "Post montrant comment créer une insertion custom. Exemple simple : insertion qui log chaque changement d'état. Encourage la créativité."

- 🔧 Code snippet inclus

## Semaine 6 : Patterns Avancés

### Post 21 - Composition de Multiple Insertions

**Prompt:** "Montre un exemple réel combinant 3 insertions : localStorage + reactOnMutation + pagination. Souligne la puissance de la composition."

- 🔧 Code snippet complet
- 🎯 Créer exemple StackBlitz

### Post 22 - Sources et afterRecomputation

**Prompt:** "Post expliquant les `source` et `afterRecomputation` pour lier des événements externes à vos primitives. Exemple : source d'un WebSocket."

- 📎 Lien vers doc sources

### Post 23 - craft() Global Store

**Prompt:** "Introduction à `craft()` pour créer un store global avec state, queries, mutations, etc. Pattern pour architecture plus large. Snippet d'un mini-store."

- 🔧 Code snippet inclus

### Post 24 - Video/GIF Demo

**Prompt:** "Crée un post avec une courte démo vidéo ou GIF montrant une app simple utilisant ng-craft : typing dans un input -> query param update -> URL change -> page reload conserve l'état."

- 🎬 Créer une vidéo/GIF (30 sec max)

## Semaine 7 : Cas d'Usage Réels

### Post 25 - Formulaire Multi-Step

**Prompt:** "Post décrivant comment utiliser ng-craft pour gérer un formulaire multi-étapes avec state() et queryParam() pour garder la progression dans l'URL."

- 📎 Lien vers exemple
- 🎯 Créer exemple StackBlitz

### Post 26 - Dashboard avec Multiple Queries

**Prompt:** "Cas d'usage dashboard : plusieurs queries parallèles pour différents widgets. Montre comment gérer ça proprement avec query() et identifier."

- 💡 Description du pattern

### Post 27 - Infinite Scroll

**Prompt:** "Post expliquant comment implémenter un infinite scroll avec query() et insertPaginationPlaceholder. Snippet ou lien vers doc."

- 📎 Lien vers doc pagination

### Post 28 - Real-Time Updates

**Prompt:** "Montre comment combiner query avec WebSocket updates via une source. Pattern pour données real-time."

- 🔧 Code snippet inclus

## Semaine 8 : Testing & Best Practices

### Post 29 - Testabilité

**Prompt:** "Post sur comment tester des composants utilisant ng-craft. Souligne que les primitives sont juste des Signals, donc faciles à tester. Snippet de test simple."

- 🔧 Code snippet test

### Post 30 - Best Practices #1

**Prompt:** "Partage 3 best practices pour utiliser ng-craft : 1) Garder le state granulaire 2) Utiliser TypeScript inference 3) Composer avec insertions. Format liste."

- 📋 Format liste

### Post 31 - Error Handling

**Prompt:** "Post sur la gestion d'erreur dans ng-craft : value() vs safeValue(), error() signal, pattern try-catch. Snippet montrant les deux approches."

- 🔧 Code snippet inclus

### Post 32 - Performance Tips

**Prompt:** "Conseils de performance : lazy loading de queries, computed memoization, quand utiliser identifier pour parallel queries. Ton pédagogique."

- 💡 Tips pratiques

## Semaine 9 : Intégration Écosystème

### Post 33 - Avec Angular Router

**Prompt:** "Post montrant l'intégration naturelle entre ng-craft queryParam et Angular Router. Snippet utilisant ActivatedRoute si besoin de lecture seule."

- 🔧 Code snippet inclus

### Post 34 - Standalone Components

**Prompt:** "ng-craft et standalone components Angular : inject craft stores dans des components, pattern DI. Exemple avec craft-inject."

- 🔧 Code snippet inclus
- 📎 Lien vers doc craft-inject

### Post 35 - Migration Path

**Prompt:** "Post aidant ceux qui veulent migrer d'une autre solution vers ng-craft. Approche incrémentale, pas besoin de tout réécrire. Encourageant."

- 💡 Guide migration

### Post 36 - TypeScript Tips

**Prompt:** "Post montrant des astuces TypeScript pour maximiser le type-safety avec ng-craft : typer les params, infer des génériques, branded types pour identifiers."

- 🔧 Code snippet TypeScript avancé

## Semaine 10 : Communauté & Wrap-Up

### Post 37 - Contribution Welcome

**Prompt:** "Post humble invitant à contribuer : issues, PRs, nouvelles insertions, docs. Partage qu'on cherche des retours. Lien vers CONTRIBUTING.md."

- 📎 Lien GitHub + Contributing guide
- 🤝 Appel à contribution

### Post 38 - Success Story

**Prompt:** "Partage un mini success story (anonyme ou fictif si pas encore de vrais cas) : 'Une équipe a réduit de 40% son boilerplate state management avec ng-craft'. Reste humble."

- 📊 Résultat concret

### Post 39 - Roadmap Preview

**Prompt:** "Post sur les futures features envisagées pour ng-craft (sans promettre de dates) : DevTools, plus d'insertions, intégrations... Demande l'avis de la communauté."

- 🗺️ Vision future
- 💬 Engagement communauté

### Post 40 - Merci & Récap

**Prompt:** "Post de remerciement pour ceux qui ont suivi cette série. Récap des 5 primitives principales (state, query, mutation, queryParam, AsyncProcess) avec un mini snippet pour chacune. Invitation à essayer."

- 🔧 Mega-snippet récap
- 📎 Lien vers Get Started
- 🎯 CTA vers docs complètes

---

## 📊 Récapitulatif des Actions Nécessaires

### Exemples StackBlitz à Créer (5)

1. **Post 11** - Parallel queries avec identifier
2. **Post 18** - insertLocalStorage persistence
3. **Post 21** - Composition multiple insertions
4. **Post 25** - Formulaire multi-step

### Vidéos/GIFs à Créer (1)

1. **Post 24** - Demo query param + URL sync (30 sec)

### Documentation à Compléter

1. **Post 37** - CONTRIBUTING.md si pas déjà fait
2. **Post 40** - Page Get Started bien complète

### Snippets de Code Préparés

- 22 posts incluent des snippets de code
- Préparer les exemples en avance pour gain de temps

### Liens Externes

- Toujours vérifier les liens GitHub/docs avant publication
- Préparer des liens courts/branded si besoin

## 🎯 Distribution - Tous sur LinkedIn

**40 posts LinkedIn** avec variation de format :

- **Posts courts** (2-4 lignes) : Posts 2, 3, 6, 15, 16, 26, 32
- **Posts avec code** (snippet formaté) : Posts 4, 5, 9, 10, 13, 14, 18, 19, 20, 22, 28, 29, 31, 33, 34, 36, 40
- **Posts moyens** (5-8 lignes) : Posts 1, 7, 8, 17, 23, 27, 30, 35, 37, 38, 39
- **Posts longs/storytelling** : Posts 11, 21, 24, 25 (utiliser carousel ou article LinkedIn si besoin)
- **Thread/série** : Post 12 peut devenir un long post avec sections numérotées

## 💡 Conseils de Publication LinkedIn

1. **Timing** :
   - Mardi-Jeudi : 8h-10h (avant le travail) ou 17h-19h (fin de journée)
   - Éviter lundi matin et vendredi après-midi

2. **Hashtags** (3-5 max) :
   - Principaux : #Angular #TypeScript #WebDev
   - Secondaires : #StateManagement #FrontendDevelopment #OpenSource

3. **Format du contenu** :
   - Premier ligne = hook accrocheur
   - Espaces entre paragraphes pour aération
   - Émojis avec parcimonie (1-3 par post max)
   - Code : utiliser le formatage code LinkedIn ou screenshot avec fond clair

4. **Engagement** :
   - Répondre à TOUS les commentaires dans les 2 premières heures
   - Poser des questions ouvertes en fin de post
   - Taguer des personnes pertinentes (avec permission)

5. **Visuels** :
   - Image/screenshot pour posts avec code (meilleure lisibilité que code inline)
   - GIF/vidéo pour post 24
   - Carousel LinkedIn pour posts longs (11, 21, 25)

6. **Ton LinkedIn** :
   - Professionnel mais accessible
   - Partager l'apprentissage, pas juste promouvoir
   - Storytelling > pure technique
   - Toujours humble et ouvert aux retours

7. **Fréquence** :
   - 3-4 posts par semaine recommandé
   - Espacer de 2-3 jours entre posts techniques similaires
   - Alterner posts code/concepts/engagement

8. **Boost naturel** :
   - Demander aux early adopters de commenter (pas juste liker)
   - Partager dans groupes Angular pertinents (après permission admins)
   - Cross-mention avec autres créateurs Angular (avec respect)
