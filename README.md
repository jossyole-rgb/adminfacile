# AdminFacile 2.0

Application responsive issue du cahier des charges du 13 octobre 2026 et de la maquette SVG du projet. HTML/CSS/JavaScript natif, API Express, Firebase Authentication/Firestore, OpenAI et Stripe conservés. Cette livraison est une version locale du MVP, pas une certification de production.

## Essayer immédiatement

Prérequis : Node.js 22 ou supérieur et npm.

```sh
npm ci
npm run demo
```

Ouvrir **http://127.0.0.1:3000**, puis **Explorer la démonstration**.

Le mode démonstration ignore `.env`, n’appelle aucun prestataire, n’effectue aucun paiement et écoute uniquement sur l’interface locale. Une seule identité fictive est partagée entre les onglets. Les activités et quotas restent en mémoire jusqu’au redémarrage du serveur ; seuls l’état de connexion démo et les brouillons ouverts restent dans l’onglet. Les analyses et réponses sont explicitement fictives. N’y mettez pas de documents personnels.

## Parcours disponibles

- Connexion, inscription, récupération du mot de passe et vérification d’e-mail via Firebase en mode connecté.
- Tableau de bord, compteur de quota et dernières activités issus des données de l’utilisateur.
- Courrier en deux étapes : catégorie, situation, ton, identité et destinataire.
- Génération, édition, sauvegarde, copie, résumé, réécriture et exports PDF/DOCX multipages.
- Import d’un PDF, PNG ou JPG : vérification de signature, 8 Mo maximum, PDF texte jusqu’à 40 pages, OCR français pour les images. Les PDF scannés sans couche texte demandent un import des pages en image.
- Analyse, question sur une analyse autorisée et préparation d’une réponse modifiable/exportable. Aucun envoi de courrier.
- Historique avec recherche de titre, filtres, pagination de 20 éléments et suppression confirmée.
- Assistant administratif et avertissement sur les informations non vérifiées.
- Offre gratuite et présentation Premium sans tarif inventé. Checkout et portail disponibles uniquement après configuration.
- Compte et suppression après confirmation/reconnexion récente. Les comptes ayant un identifiant Stripe nécessitent une clôture assistée avant suppression.
- Menu et barre de navigation mobiles, formulaires fluides, navigation clavier, dialogues natifs, messages d’erreur et indicateurs de chargement.

## Configurer les services réels

Relever les variables de `.env.example` dans un **environnement de test distinct**, sans remplacer les secrets existants par des valeurs vides. Puis :

```sh
npm start
```

La page de connexion et l’état de santé restent accessibles sans Firebase configuré ; les opérations privées renvoient 503. `PUBLIC_FIREBASE_*` correspond à la configuration publique de votre application web Firebase, les clés OpenAI/Stripe et le compte de service restent uniquement côté serveur.

- Fournir `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` et les variables publiques Firebase. Autoriser le domaine de test dans Firebase Authentication et activer Email/Password.
- Fournir `OPENAI_API_KEY` et, si nécessaire, `OPENAI_MODEL`. Le modèle existant `gpt-4o-mini` reste la valeur par défaut.
- Stripe : fournir des **clés de test**, un `STRIPE_PRICE_ID` validé et `PUBLIC_APP_URL`. Configurer le webhook `/webhook` et son secret pour `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`, `invoice.paid`.
- Configurer `ALLOWED_ORIGINS` exactement. `TRUST_PROXY_HOPS=1` uniquement si l’hébergement utilise un proxy de confiance (0 par défaut). Définir `NODE_ENV=production` avec HTTPS.
- `REQUIRE_VERIFIED_EMAIL=true` permet d’exiger l’e-mail vérifié côté API.

Les collections historiques `lettres`, `analyses` et `users` restent utilisées. Le compteur `usage/{uid}` est initialisé transactionnellement à partir des courriers existants au premier appel de génération. Les suppressions ultérieures ne restituent pas le quota. Un appel IA ou une sauvegarde échouée restitue la réservation ; l’échec d’une restitution est journalisé avec un identifiant de requête, sans contenu sensible. Un arrêt brutal du processus pendant une génération peut laisser une réservation à rapprocher manuellement : prévoir une tâche de réconciliation avant exploitation à grande échelle.

## Vérifications

```sh
npm run check
npm test
npm run build
npm audit --omit=dev
```

Les tests HTTP utilisent des services simulés : identité, isolation, quota concurrent, échec IA, validation des fichiers, exports, identifiants de facturation, signature Stripe réelle sur événement de test, déduplication et événements anciens. Ils ne remplacent pas une recette contre Firebase/Stripe/OpenAI réels. Un parseur PDF indépendant vérifie le document multipage et les accents français. Le PDF utilise Helvetica/WinAnsi : les caractères hors alphabet occidental sont remplacés ; DOCX conserve Unicode.

L’historique est paginé dans l’API mais le stockage charge actuellement l’ensemble des activités de l’utilisateur pour le tri et la recherche. Pour de gros historiques, ajouter des index et des curseurs Firestore avant montée en charge.

## Hébergement conservé

- Render : `npm ci`, puis `npm start`, secrets dans les variables de la plateforme.
- Netlify : `npm run build`, dossier public **dist/**. `netlify.toml` relaie `/api/*` vers l’URL Render historique. Remplacer cette URL par celle de l’environnement de test avant la recette.
- Ne jamais publier la racine du dépôt en tant que dossier statique. Le build ne copie que les entrées HTML, `frontend/` et `assets/`.
- Express sert uniquement les chemins publics explicitement autorisés. `.env`, `backend/` et les sources serveur ne sont pas exposés.

Les anciennes entrées `index.html`, `dashboard.html` et `dashboard_v2.html` mènent au nouveau produit. Leur contenu initial, y compris les modifications locales présentes avant cette intervention, est conservé dans `backend/legacy-ui/`. `backend/server-v1.reference.cjs` est une archive de référence : **ne pas l’exécuter ni l’exposer**. `style.css`, `script.js`, `firebase.js` et les autres fichiers historiques ne sont plus chargés par la nouvelle application.

## Limites avant publication

Consulter [la recette](docs/RECETTE.md). Les règles Firestore fournies restreignent les anciens accès clients à leur propriétaire ; la collection subscriptions reste exclusivement gérée par le serveur. Les règles Storage interdisent les accès directs : **les tester sur un projet distinct avant leur déploiement**, en même temps que la nouvelle interface. Elles n’ont pas été publiées. Sauvegarde/restauration, politiques de conservation et suppression chez les sous-traitants, mentions légales, validation RGPD, facturation de bout en bout et accessibilité complète restent à valider. Les rappels et démarches guidées restent en V2 conformément au cahier des charges.

Le SDK Firebase Admin a été migré vers la version 14 et ses imports modulaires. Le dernier audit de production ne signale aucune vulnérabilité. La recette réelle de 13 contrôles couvre Firebase, Firestore et OpenAI, avec comptes techniques nettoyés après exécution.

## Raccordement assisté des services

Le diagnostic `npm run services:check` contrôle la configuration locale. Ajouter `-- --network` vérifie les accès réels, uniquement par lecture, sans créer de comptes, de documents ou de paiements.

Pour raccorder un **fichier JSON Firebase déjà disponible** :

```sh
npm run services:firebase -- /chemin/absolu/vers/le-compte-de-service.json
npm run services:check -- --network
```

Le fichier JSON doit rester dans un emplacement privé, hors de `dist/`, `frontend/` et `assets/`. Le script vérifie la clé et le projet, puis ajoute uniquement son chemin à `.env`. Il préserve les secrets existants et protège `.env` avec les permissions 600. En hébergement, utiliser un fichier secret et `GOOGLE_APPLICATION_CREDENTIALS`, la variable secrète `FIREBASE_SERVICE_ACCOUNT_JSON`, ou le triplet Firebase existant.

Stripe distingue explicitement `STRIPE_MODE=disabled`, `test` et `live`. En mode test, `STRIPE_TEST_SECRET_KEY` a priorité ; une clé live ne peut pas être utilisée en mode test. Le formulaire de paiement reste fermé tant que `STRIPE_CHECKOUT_ENABLED=true`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` et `PUBLIC_APP_URL` ne sont pas tous configurés. Le tarif doit appartenir au même mode que la clé. Le secret webhook provient de l’endpoint Stripe réellement raccordé : il ne peut pas être inventé. Le mode live requiert un choix volontaire, sans changement automatique du compte Stripe.
