# Administration du site Lou Còdi

Web App Apps Script séparée du site public. Elle doit être déployée avec :

- exécution en tant que **l’utilisateur qui accède à l’application** ;
- accès accordé à **toute personne disposant d’un compte Google** ;
- propriétés de script `LC_GRIST_API_URL`, `LC_GRIST_DOC_ID` et `LC_GRIST_API_KEY`.

La publication des réglages de la page d’accueil nécessite en plus :

- `LC_GITHUB_TOKEN`, jeton finement limité au dépôt du site avec le droit d’écrire son contenu ;
- `LC_GITHUB_REPOSITORY`, facultatif, vaut `preventionpaca/loucamin` par défaut.

Le jeton reste exclusivement dans les propriétés sécurisées Apps Script. L’interface ne reçoit que l’état configuré ou non configuré. Chaque publication met à jour `assets/accueil-layouts.json` sur la branche `main`, ce qui déclenche le déploiement GitHub Pages sans modifier directement les photographies originales.

## Créateur de pages

La section « Pages du site » publie des documents JSON structurés dans
`assets/pages/`. Aucun HTML saisi par l’utilisateur n’est exécuté : la page
publique `page.html?page=identifiant` construit uniquement des blocs texte,
image et vignette avec les API DOM sûres du navigateur.

- Les blocs se réordonnent par glisser-déposer ou avec les flèches.
- La largeur `entière`, `moitié` ou `tiers` organise la grille sur ordinateur.
- Sur téléphone, tous les blocs sont automatiquement empilés.
- Une vignette peut être repliée ou dépliée par défaut.
- Les médias acceptent une URL `https://` ou un chemin `assets/` déjà présent
  dans le dépôt. Le téléversement de fichiers reste volontairement séparé.

L’index `assets/pages/index.json` permet à l’administration de retrouver les
pages déjà publiées. Le même jeton GitHub à permission `Contents: Read and
write` sert à leur création et à leur mise à jour.

L’adresse renvoyée par `Session.getActiveUser().getEmail()` est vérifiée côté serveur dans la table Grist `Administrateurs`. Le jeton Grist n’est jamais transmis au navigateur.

Le schéma attendu est décrit dans `schema-grist.json`. La suppression physique d’un produit n’est pas exposée : un produit est masqué avec la colonne `Visible`.
