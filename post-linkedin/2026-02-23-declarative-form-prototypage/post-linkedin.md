Le signal form d'Angular sous stéroïdes, merci craft-ng

Je réfléchis à une API de formulaire **déclarative** basée sur le signal form d’Angular.

Objectif : garder une DX simple, mais ajouter ce qui me manque aujourd’hui dans les formulaires complexes 👇

- validations type-safe (erreurs + warnings)
- logique métier directement dans le form
- intégration naturelle avec `query` / `mutation`
- gestion de formulaires en parallèle

Dans le carrousel, je partage une première ébauche concrète :

- cas simple
- validations imbriquées
- submit typé
- formulaires parallèles
- form tree pour les tableaux
- logique interdépendante entre champs

Je pense qu’il y a un vrai potentiel pour composer la logique de formulaire aussi facilement que l’état.

Tu vois des trous dans cette approche ?

Doc @craft-ng : https://ng-angular-stack.github.io/craft/

Ps: désolé pour les bouts de codes coupés dans le carrousel, c’est pour garder un peu de suspense 😅

Je suis Romain Geffrault.
Développeur Angular et créateur de @craft-ng
Suis-moi pour plus de contenu sur Angular
