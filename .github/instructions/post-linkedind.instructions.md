---
description: Create a Linkedin post
# applyTo: 'Create a Linkedin post' # when provided, instructions will automatically be added to the request context when the pattern matches an attached file
---

Crée un post pour LinkedIn en suivant les instructions demandées.

Voici les instructions à suivre pour créer un post LinkedIn :

- Le post doit être en français.
- Le style d'écriture doit être inspiré de `post-linkedin.md`.
- Le post doit être engageant et inciter les lecteurs à interagir.
- Le post doit inclure des emojis pertinents pour rendre le contenu plus attrayant.
- Pas d'emojis dans le titre du post.
- Génère un fichier .md avec le contenu du post, en utilisant le nom de fichier `post-linkedin.md`.
- Si un carroussel est demandé, il faut aussi générer un carrousel en PDF pour accompagner le post, avec des images pertinentes et attrayantes.
  - Utilise l'outil pdf-generator-mcp qui propose de générer le PDF à partir d'un format markdown. Utilise l'outil dédié pour LinkedIn.
  - Dans la payload envoyé pour génerer le PDF, la propriété `markdown` doit contenir le contenu du fichier `carrousel-content.md` associé, et la propriété `title` doit contenir le titre du carrousel et la propriété `body` doit contenir un aperçu du code, mais pas plus de 20 lignes et contenue dans une balise de code markdown.
- Les morceaux de code ne doivent pas dépasser 60 lignes, sinon il faut les découper en plusieurs morceaux.
- Le projet s'appelle `@craft-ng` et pas `ng-craft`.
- sauvegarde le post dans le dossier `post-linkedin` à la racine du projet, puis dans un sous-dossier avec un nom basé sur la date et le titre du post, par exemple

- Ne présente qu'un seul morceau de code par page du carrousel, et explique-le de manière claire et concise.
- Le poste linkedin ne doit pas dépasser 3000 caractères.
  - Evite de mettre trop d'emojis pour ne pas rendre le post trop lourd.
  - Ne met pas de titre en majuscules, pour ne pas donner l'impression d'un clickbait.
- Le lien de la documentation https://ng-angular-stack.github.io/craft/
- Ajoute ma signature à la fin du post : `Je suis Romain Geffrault.
Développeur Angular et créateur de @craft-ng
Suis-moi pour plus de contenu sur Angular`
- Il est possible de créer des exemples sur plusieurs pages pour illsutrer un cas d'usage.
- Si seulement une capture d'écran est demandé il faut utiliser l'outil mcp `code-screenshot-mcp`.
