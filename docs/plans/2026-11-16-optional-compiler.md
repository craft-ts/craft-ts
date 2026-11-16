# Compilateur optionnel : première intégration et prochaines frontières

16 novembre 2026. Base : `claude/craft-ts-performance-16a01f`, commit
`55ca57929`. Implémentation : `libs/compiler`, ABI versionnée dans
`@craft-ts/component/compiler-runtime`. Mesures :
[rapport](../benchmarks/2026-11-16-optional-compiler.md).

## Contrat retenu

Le compilateur accélère une application qui fonctionne déjà sans lui. Il ne
corrige pas silencieusement un template non réactif, ne supprime pas le moteur
réactif et ne remplace pas les scopes de composants par une mise à jour globale.

- [x] Package de build indépendant `@craft-ts/compiler`, plugin Vite explicite.
- [x] Builds client uniquement ; aucun changement en serve, tests ou build SSR.
- [x] Source maps haute résolution et rapport compilé/repli avec motif.
- [x] AST TypeScript et liaison des symboles dans un module virtuel : aucune
      résolution des imports, aucun chargement des types du projet, aucune exécution
      du code applicatif. Les masquages par paramètres, `var`, `catch`, boucles et
      déclarations locales ne deviennent pas des appels de helpers DOM.
- [x] Fabriques DOM partagées, références directes aux nœuds, bindings indépendants.
- [x] Suppression de l'effet propre d'une factory de liste **seulement** lorsque
      l'AST prouve un appel à un composant local constant, avec transmission directe
      de l'item/index. Plage à racine unique, identités de liste inchangées.
- [x] Clonage natif optionnel de blueprints construits avec l'adapter : aucun
      `innerHTML`, aucun cache de nœuds vivants ou de valeurs d'inputs. Cache faible
      par adapter et par plan ; adapter sans clone = création ordinaire.
- [x] Injecteur natif par composant, mêmes shells d'inputs, attributs de scope CSS,
      ownership de destruction et adresses des éléments pour le replay.
- [x] Repli en développement, SSR/hydratation, boundaries, composition, providers,
      styles/événements non pris en charge, host props, instrumentation, remplacement
      du template et inputs textuels directs dont la forme serait structurelle.
- [x] Benchmarks différentiels, petits et grands cas, mises à jour, mémoire, octets
      JS/gzip et temps complet local jusqu'au DOM prêt.

Les génératrices auteur sont conservées et exécutées par le même driver.
La première version ne généralise pas le lowering expérimental des anciennes
recherches. TypeScript est déjà disponible dans le dépôt et permet de livrer
une transformation vérifiable sans dépendance native supplémentaire. Passer
le parse/emit à OXC reste possible si le coût du build le justifie ; changer de
langage ne réduit pas à lui seul le travail exécuté dans le navigateur.

## Regrouper des composants connus à la compilation

L'idée a deux variantes très différentes.

**Assembler une fabrique DOM commune en gardant les propriétaires logiques**
pourrait supprimer les descriptions et les montages intermédiaires. Chaque
composant garderait ses inputs, effets, scope CSS, adresse de replay et cycle de
vie. Le compilateur aurait besoin d'un graphe de plans avec des emplacements de
sous-composants et des connexions d'inputs. C'est la direction recommandée pour
une deuxième étape : fusion du travail de création, pas effacement des identités.

**Effacer les frontières de composants** économiserait aussi injecteurs,
registrations, shells et nettoyages. Le contrôle `nested`/`flat` mesure ce plafond
sur un DOM natif identique. Il ne prouve pas une réécriture équivalente :
`Injector`, `skipSelf`, `DestroyRef`, `ElementRef`, les wrappers, les scopes CSS
et les identités de replay peuvent observer ces frontières, même si la metadata
source est `{}`. Aucun résultat de ce contrôle n'est compté comme gain du plugin.

Une future version pourrait employer des propriétaires légers avec
matérialisation paresseuse de l'injecteur. Il faudrait préserver les recherches
parent/skipSelf, l'ordre de résolution, la destruction directe d'un propriétaire,
les erreurs de cleanup et l'instrumentation. Aucun contrat de ce type n'est
introduit par cette première version.

## Priorités après cette version

| Piste                                                   | Intérêt                                | Preuve nécessaire avant intégration                                                                                                     |
| ------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Étendre événements, styles, `attrs` et petits helpers   | Couverture des vraies pages            | Extraire/réutiliser le moteur actuel des propriétés ; mêmes hooks, actions, validation et normalisation                                 |
| Plans partiels avec emplacements de composants          | Gros arbres connus, sans changer la DI | DOM, scopes et replay identiques après insertion, suppression et remount ; mesure sur la page réaliste                                  |
| Fabrique commune parent/enfants                         | Réduire les montages intermédiaires    | Graphe acyclique ou cycles traités ; limites lazy conservées ; plafonnement de la croissance du bundle                                  |
| Lecture synchrone d'inputs internes connus              | Éviter les objets de génératrice       | Provenance runtime prouvée ; pas d'hypothèse de pureté issue du seul type `Input<number>` ; repli pour wrappers et lecteurs arbitraires |
| Fusion de bindings d'une même source scalaire           | Réduire effets et lectures répétées    | Lecteur interne stable et pur ; pas de fusion de getters ou fonctions utilisateur ; un champ indépendant reste indépendant              |
| Hydratation compilée                                    | Diminuer le coût client après SSR      | Même politique de mismatch, mêmes clés et récupération locale ; cohortes SSR séparées                                                   |
| Réduction du template de repli dans un build spécialisé | Poids et préparation des modules       | Préserver une voie de diagnostic/replay ou rendre la restriction explicite ; mesurer transfert et parse sur réseau contraint            |
| OXC pour le transformateur                              | Temps de build                         | Profil du parse/bind/emit sur une application suffisamment grande ; mêmes goldens et source maps                                        |

L'approche « structure statique + cibles dynamiques explicites » a aussi des
précédents documentés dans le [renderer de Vue](https://vuejs.org/guide/extras/rendering-mechanism.html).
Ces descriptions orientent les expériences ; elles ne prédisent pas les gains de
Craft. L'activation par build utilise les mécanismes publics
[`apply` et `enforce` de Vite](https://vite.dev/guide/api-plugin.html#conditional-application).

## Problème indépendant trouvé pendant les mesures

Une large file d'effets fermant chacun un `craftBatch` rentrait récursivement
dans la publication d'Alien. Un test de 6 000 cellules et le cas navigateur à
5 000 lignes/quatre niveaux reproduisent le dépassement de pile sans compilateur.
Les fins de batches imbriqués sont maintenant équilibrées après le drain actif,
sans reporter le travail au prochain tick. La correction est appliquée à toutes
les variantes de la campagne : son bénéfice n'est pas attribué au compilateur.
