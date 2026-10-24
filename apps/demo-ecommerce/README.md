# Démo e-commerce CraftTS + Effect

Application Nx de démonstration : vitrine CraftTS, fonctions serveur typées et opérations métier Effect. Le paiement est fictif et ne demande aucune donnée bancaire.

## Lancer

Pour enregistrer une session et la rejouer, lance les trois processus depuis la racine du dépôt, chacun dans son terminal :

```bash
npm run logs:server
npx nx serve demo-ecommerce --skipSync
npx vite --config apps/debug-session-dashboard/vite.config.ts
```

Ouvrir le dashboard de replay sur [http://localhost:4210](http://localhost:4210), puis connecter la boutique sur [http://localhost:4204](http://localhost:4204) dans son iframe pour enregistrer les parcours. La boutique, le panier, la composition des formules et l’administration sont accessibles depuis sa navigation.

La capture et le pont de replay sont actifs en développement. La capture d’entrées, du stockage navigateur et des arguments de replay est activée uniquement quand le serveur de capture est configuré sur une adresse loopback. Les sessions sont archivées localement par le serveur de logs.

## Comptes de démonstration

L’administration demande une session. Les comptes sont affichés sur les pages **Administration** et **Connexion**, avec un bouton de connexion en un clic :

| Compte | E-mail | Mot de passe | Accès |
| --- | --- | --- | --- |
| Camille, gérante | `camille@atelier.demo` | `atelier-admin` | boutique + administration |
| Inès, product manager | `ines@atelier.demo` | `atelier-produit` | boutique + administration en lecture |
| Léo, client | `leo@atelier.demo` | `atelier-client` | boutique seule |

Le serveur délivre un jeton de session à la connexion et le vérifie dans chaque fonction d’administration : un compte client ou un jeton inventé reçoit un refus, quoi que dise le navigateur. Seuls les admins ont le droit de modifier un produit : un product manager ouvre l’administration et l’éditeur, mais l’enregistrement lui est refusé. Les sessions vivent en mémoire ; après un redémarrage du serveur, la page d’administration revient à l’écran de connexion avec le message « Session expirée ». Les comptes sont définis dans `src/shared/accounts.ts`.

## Parcours

- **Boutique** : filtres par catégorie ; le bouton « Ajouter » devient un sélecteur de quantité dès que le produit est dans le panier, et le compteur du panier, dans l’en-tête, suit.
- **Fiche produit** (`/produit/:productId`) et **composition de formule** (`/formule/:productId`) : choix par étapes, récapitulatif à jour et bouton actif seulement quand chaque groupe est complet.
- **Panier et paiement** : quantités modifiables sur place, confirmation affichée sur la page de paiement.
- **Administration** : produits (création, modification, suppression, stock ±1 sur la ligne), catégories et commandes. Les groupes d’une formule se règlent par ligne (catégorie, minimum, maximum).

## Données et règles

Le magasin sauvegarde les catégories, les produits et les commandes dans `apps/demo-ecommerce/data/store.json`. Le bouton **Réinitialiser la démo** de l’administration réinstalle le catalogue initial défini dans le code et efface les commandes de démonstration. Les produits simples portent le stock; les formules ont un prix propre et consomment les composants choisis à la validation. Le serveur contrôle les groupes, catégories, bornes, choix distincts et quantités disponibles avant d’enregistrer une commande.

La vitrine ne lit que les catégories et les produits ; les commandes ne sont servies qu’à l’administration.

## Vérifications

```bash
npx nx typecheck demo-ecommerce --skipSync
npx nx effect-check demo-ecommerce --skipSync
npx nx lint demo-ecommerce --skipSync
npx nx test demo-ecommerce --skipSync
npx nx build demo-ecommerce --skipSync
```
