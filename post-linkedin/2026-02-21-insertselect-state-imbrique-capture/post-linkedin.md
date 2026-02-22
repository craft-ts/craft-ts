insertSelect avec state : piloter une logique complexe sans éclater son store

Quand le state grossit, on a souvent ce réflexe : découper en petits états dérivés.

Le problème ?

- risque de désynchronisation,
- persistance plus compliquée (notamment avec le local storage),
- logique métier dispersée.

De mon point de vue, `insertSelect` est une pièce maîtresse de @craft-ng pour éviter ça

L’idée : garder une seule source de vérité, tout en branchant la logique exactement là où elle doit vivre (merci la composition imbriquée !).

Pourquoi c’est utile en pratique :

- on pilote des enchaînements métier complexes sans multiplier les mini-stores,
- pas de logique délicate à gérer quand on doit traverser plusieurs niveaux de state,
  la logique de mise à jour est au plus proche de la donnée qu’elle modifie,
- on garde un state cohérent et plus simple à persister,
- on conserve une DX très lisible via la composition.

(Et je ne t'ai pas encore montré son utilisation avec source$ 🤯)

Note :

- ce sera disponible prochainement,
- je finalise aussi un mécanisme pour rendre les exceptions type-safe et inférer les différentes parties du state.

Et ensuite :
Le combo “logique complexe pilotable + erreurs type-safe” me fait penser que je peux tenter un truc avec les formulaires.

Une fois la partie exceptions terminée, je vais explorer la génération de `formField` (dans l’esprit du nouveau Signal Form d’Angular), avec une approche par composition.

J’ai déjà quelques idées simples à implémenter qui peuvent devenir un vrai atout pour gérer les formulaires les plus complexes. À suivre 👀

Doc : https://ng-angular-stack.github.io/craft/

Je suis Romain Geffrault.
Développeur Angular et créateur de @craft-ng
Suis-moi pour plus de contenu sur Angular
