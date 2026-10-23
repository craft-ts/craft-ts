# Démo e-commerce CraftTS + Effect

Application Nx de démonstration : vitrine CraftTS, fonctions serveur typées et opérations métier Effect. Le paiement est fictif et ne demande aucune donnée bancaire.

## Lancer

Depuis la racine du dépôt :

```bash
npx nx serve demo-ecommerce --skipSync
```

Ouvrir [http://localhost:4204](http://localhost:4204). La boutique, le panier, la composition des formules et l’administration sont accessibles depuis la navigation. L’administration est volontairement ouverte, car cette démo n’implémente pas d’authentification.

## Données et règles

Le magasin sauvegarde les catégories, les produits et les commandes dans `apps/demo-ecommerce/data/store.json`. Le bouton **Réinitialiser les données** réinstalle le catalogue initial défini dans le code et efface les commandes de démonstration. Les produits simples portent le stock; les formules ont un prix propre et consomment les composants choisis à la validation. Le serveur contrôle les groupes, catégories, bornes, choix distincts et quantités disponibles avant d’enregistrer une commande.

Dans l’administration, un groupe de formule utilise cette forme JSON :

```json
[{"id":"g1","categoryId":"pastries","min":1,"max":2}]
```

## Vérifications

```bash
npx nx typecheck demo-ecommerce --skipSync
npx nx effect-check demo-ecommerce --skipSync
npx nx lint demo-ecommerce --skipSync
npx nx test demo-ecommerce --skipSync
npx nx build demo-ecommerce --skipSync
```
