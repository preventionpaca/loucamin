# Administration du site Lou Còdi

Web App Apps Script séparée du site public. Elle doit être déployée avec :

- exécution en tant que **l’utilisateur qui accède à l’application** ;
- accès accordé à **toute personne disposant d’un compte Google** ;
- propriétés de script `LC_GRIST_API_URL`, `LC_GRIST_DOC_ID` et `LC_GRIST_API_KEY`.

L’adresse renvoyée par `Session.getActiveUser().getEmail()` est vérifiée côté serveur dans la table Grist `Administrateurs`. Le jeton Grist n’est jamais transmis au navigateur.

Le schéma attendu est décrit dans `schema-grist.json`. La suppression physique d’un produit n’est pas exposée : un produit est masqué avec la colonne `Visible`.
