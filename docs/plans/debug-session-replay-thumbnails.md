# Miniatures sur la timeline du replay

## Objectif

Afficher des aperçus visuels de la session à des moments importants, puis permettre
de cliquer sur un aperçu pour rejoindre rapidement cette étape dans le replay.
Les aperçus doivent se préparer en arrière-plan à l’ouverture d’une session, sans
bloquer le dashboard ni ralentir le replay visible.

## Contexte existant

- Le dashboard est dans `apps/debug-session-dashboard/`.
- Les sessions archivées contiennent des événements horodatés et peuvent contenir
  plusieurs participants (onglets).
- Le replay sait avancer action par action sans respecter les délais enregistrés.
  Il possède aussi un mécanisme de progression accélérée pour rejoindre une cible.
- La barre de progression actuelle est dans `src/replay-stage.ts`.
- Le chargement des sessions archivées est dans `src/session-archive.service.ts`.
- Le moteur de replay est principalement dans `src/replay-session.ts` et
  `src/replay-playback.ts`.
- Les événements disponibles incluent les actions, changements de route, appels
  Craft et snapshots de reprise. Les snapshots existants décrivent l’état Craft ;
  ils ne contiennent pas d’image du rendu.
- Le runtime n’enregistre pas actuellement chaque mutation visuelle du DOM.
- Le navigateur de la page ne peut pas prendre librement une capture pixel par
  pixel d’une iframe d’une autre origine. Un Chromium piloté de l’extérieur peut
  capturer son contenu.

## Approche recommandée

À l’ouverture d’une session terminée, démarrer un Chromium caché dans un contexte
isolé. Il charge le replay, avance aussi vite que les actions et l’application le
permettent, attend que chaque étape importante soit stable, puis prend une capture.
Le dashboard affiche les aperçus progressivement pendant que le pré-calcul continue.

Utiliser les événements DOM comme signaux de stabilité, pas comme une liste de
captures à produire. Une action peut déclencher de nombreuses mutations DOM qui
ne représentent pas des étapes d’analyse utiles.

## Étapes de réalisation

### 1. Prototype technique

1. Choisir une session archivée représentative.
2. Lancer un Chromium caché avec le dashboard et le replay.
3. Faire progresser le replay par actions immédiates, sans délais enregistrés.
4. Choisir quelques points candidats : début, fin de navigation, fin d’une
   mutation/appel Craft important, snapshot stable, et quelques interactions.
5. Après chaque point, attendre la fin du travail de replay puis une courte période
   sans mutation visuelle.
6. Capturer l’écran avec Playwright/Chromium et mesurer durée, stabilité et poids.

Le prototype doit déterminer si le replay peut être piloté de façon fiable sans
cliquer sur des sélecteurs fragiles de l’interface. Si nécessaire, ajouter une
interface de contrôle dédiée au worker plutôt que dépendre des détails visuels du
dashboard.

### 2. Définir les points de capture

Créer une sélection de points à partir des événements déjà enregistrés :

- état initial après préparation du replay ;
- fin de changement de route ou de chargement de route ;
- fin d’une mutation ou invocation Craft pertinente ;
- snapshot/checkpoint stable ;
- interaction importante suivie d’un changement visuel stable.

Fusionner les candidats rapprochés afin de ne produire qu’une image par transition
visuelle utile. Mettre une limite configurable au nombre d’images par session.

Pour chaque capture :

- attendre l’accusé de fin de l’action/replay ;
- attendre que les opérations pertinentes soient terminées ;
- attendre une période de calme DOM (valeur de départ à expérimenter : environ
  300–500 ms) ;
- imposer un délai maximum d’attente pour les animations et écrans qui bougent en
  continu ;
- ignorer les images quasi identiques si une comparaison visuelle légère est
  disponible à coût raisonnable.

Ne pas enregistrer chaque mutation DOM dans l’archive. Un `MutationObserver` dans
le Chromium de capture peut servir à détecter la stabilité, avec les événements
Craft et route comme principaux déclencheurs.

### 3. Implémenter le worker local

1. Ajouter au serveur local d’archive une gestion de tâches de pré-calcul, ou créer
   un worker local dédié si l’isolation le justifie.
2. Le worker lance Chromium/Playwright dans un contexte séparé pour chaque tâche.
3. Il charge la session, avance le replay et capture les points candidats.
4. Il publie progression, réussite, annulation et erreur au dashboard.
5. Il ferme systématiquement le contexte Chromium à la fin de la tâche.
6. Limiter la concurrence à une tâche par défaut pour protéger le CPU et la
   mémoire de la machine.

Le replay visible doit rester indépendant du worker. L’utilisateur doit pouvoir
continuer à consulter la session pendant le pré-calcul.

### 4. Réduire le coût des images

- Respecter le viewport CSS enregistré pour préserver le responsive layout.
- Utiliser un device scale factor de 1 pour éviter les images Retina coûteuses.
- Prendre d’abord le viewport entier puis le réduire à environ 320 px de large.
- Encoder en WebP avec une qualité initiale à mesurer (par exemple 65–75).
- Éviter le recadrage par zone dans la première version : le contenu utile peut se
  déplacer dans l’application.
- Mesurer le poids moyen et le temps de capture sur plusieurs sessions réelles.

La baisse de résolution réduit l’encodage, le stockage et le transfert, mais ne
réduit pas beaucoup le temps nécessaire à l’application pour exécuter le replay.

### 5. Ajouter le cache et l’API

- Stocker les images en fichiers WebP séparés de l’export JSON de la session.
- Associer chaque image à l’identifiant de session, au participant, à l’événement
  cible et au temps/indice correspondant.
- Stocker un manifeste de tâche avec son état (`pending`, `running`, `ready`,
  `failed`), la progression et les erreurs récupérables.
- Invalider le cache si le contenu de la session change. Un hash de la session,
  combiné à la version du replay, du navigateur, du viewport et des paramètres de
  capture, peut servir de clé.
- Garder les données sur la machine locale, conformément au fonctionnement actuel
  de l’archive.
- Permettre de relancer un pré-calcul échoué et de supprimer le cache avec la
  session archivée.

### 6. Intégrer les miniatures à l’interface

- Afficher des repères/miniatures sur la timeline du replay.
- Afficher progressivement les images déjà prêtes et un état de préparation pour
  les autres.
- Ajouter un indicateur compact de progression du pré-calcul.
- Au clic sur une miniature, demander au replay visible de rejoindre l’événement
  correspondant. Ajouter une opération générale `seekReplayToEvent(...)` si le
  mécanisme actuel de seek n’est pas réutilisable directement.
- Pour les sessions multi-onglets, rattacher chaque aperçu au participant qui l’a
  produit et définir clairement quel participant est affiché au clic.

### 7. Gérer les cas limites

- Ne pas lancer automatiquement le worker pour une session encore en cours
  d’enregistrement ; commencer après sa finalisation.
- Gérer les sessions tronquées ou non rejouables en désactivant la préparation
  avec une explication visible.
- Si le replay diverge ou échoue, conserver les miniatures déjà capturées et
  signaler l’étape où le worker s’est arrêté.
- Éviter de capturer pendant un écran de chargement, un écran d’erreur du worker
  ou une frame absente.
- Appliquer les mêmes précautions de confidentialité que pour les sessions : les
  images peuvent contenir des données affichées par l’application.

## Critères de réussite

- L’ouverture d’une session ne bloque pas l’interface pendant le pré-calcul.
- Les miniatures apparaissent progressivement dans la timeline.
- Cliquer sur une miniature amène le replay visible à l’étape correspondante.
- La résolution et la compression sont suffisantes pour lire le contenu d’une
  card sans stocker de captures pleine résolution.
- Le cache est réutilisé lors d’une réouverture et invalidé si la session change.
- Le worker ne modifie pas l’état du replay visible et se termine proprement en
  cas d’erreur ou d’annulation.
- La préparation respecte les sessions multi-onglets et indique les échecs sans
  faire disparaître les miniatures déjà obtenues.

## Découpage et estimation

| Phase | Résultat | Estimation indicative |
| --- | --- | ---: |
| Prototype | Chromium caché, replay accéléré, quelques captures et mesures | 1 jour |
| Points de capture et worker | Candidats sémantiques, attente de stabilité, progression | 2–3 jours |
| Cache/API et interface | Stockage local, états de préparation, miniatures cliquables | 2–3 jours |
| Durcissement | Multi-onglets, erreurs, sessions incomplètes, invalidation | 2–4 jours |

Estimation globale initiale : environ 1 à 2 semaines, à réviser après le prototype.

## Questions à trancher pendant le prototype

- Le worker pilote-t-il le dashboard existant ou utilise-t-il une page de contrôle
  dédiée ? Préférer une API de contrôle stable si piloter l’interface devient
  fragile.
- Quel nombre maximal d’aperçus donne une timeline utile sans allonger fortement
  le pré-calcul ?
- Quel délai de calme DOM et quel délai maximum donnent des captures fiables pour
  les pages du projet ?
- Quelle version/environnement Chromium doit être utilisée pour la fidélité des
  captures ?
- Où le serveur local d’archive doit-il conserver les fichiers de cache ?
