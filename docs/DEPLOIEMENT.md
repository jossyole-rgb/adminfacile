# Déploiement — AdminFacile 2.0

> Aucun déploiement en production ni fusion dans `main` sans accord explicite de Joss.

## Architecture actuelle

| Élément | Hébergement | Source |
|---|---|---|
| Frontend (`index.html`, `dashboard.html`, `success.html`, `script.js`, `firebase.js`, `style.css`) | Netlify — `https://adminfacile-app.netlify.app` | racine du dépôt |
| API (`server.js` + `backend/`) | Render — `https://adminfacile.onrender.com` | `npm start` |
| Authentification, base de données | Firebase projet `adminfacile` | — |
| Paiement | Stripe | — |

## Variables d'environnement (Render)

Voir `.env.example`. **Obligatoires** (arrêt au démarrage si absentes) : `OPENAI_API_KEY`, `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`.
**Nécessaires au Premium** : `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`.
**Optionnelles** : `FRONTEND_URL` (défaut : URL Netlify actuelle), `CORS_ORIGINS`, `OPENAI_MODEL`, `FREE_LETTER_LIMIT`, `MAX_UPLOAD_MB`.

Ne jamais committer `.env`, de clé `sk_live_…`, de secret `whsec_…` ou de compte de service Firebase.

## ⚠️ Ordre de mise en production (changement incompatible)

L'API exige désormais un token Firebase sur **toutes** les routes privées. L'ancien frontend (branche `main`) n'envoie pas de token pour le résumé, la réécriture, l'assistant, l'analyse, la réponse IA et Stripe. **Déployer l'API seule casserait ces fonctions.**

Procédure proposée :

1. **Environnement de test** (recommandé avant toute mise en production) :
   - Projet Firebase de test, clés Stripe test, service Render de test, déploiement Netlify de prévisualisation de `develop`.
   - Dans `script.js`, `API_URL` pointe vers l'API de test (à rendre configurable par environnement).
   - Exécuter la recette `docs/TESTS_ET_RECETTE.md`.
2. **Sauvegarde Firestore** avant mise en production : `gcloud firestore export gs://<bucket>/backup-<date>`.
3. **Règles Firestore** (validé par Joss le 13/10/2026). Les règles sont compatibles avec le frontend actuellement en production : elles peuvent être publiées dès maintenant, indépendamment de l'API.
   - **Avant :** console Firebase → Firestore Database → Règles → copier les règles actuelles dans un fichier (retour arrière).
   - **Option console :** coller le contenu de `firestore.rules` → « Publier ».
   - **Option ligne de commande :** `npx firebase login` puis `npm run deploy:regles`.
   - **Après :** vérifier la connexion, la génération, l'historique et les analyses ; dans le simulateur de règles de la console, vérifier qu'une mise à jour de `users/{uid}` avec `premium: true` est refusée.
4. **API Render** puis **frontend Netlify**, l'un juste après l'autre (aucun ordre n'est compatible à 100 % : l'ancien frontend avec la nouvelle API perd les fonctions IA hors génération ; le nouveau frontend avec l'ancienne API perd « Passer Premium » et « Gérer mon abonnement »). Prévoir un créneau de faible trafic.
5. **Stripe** : vérifier que le webhook est abonné à `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`.
6. Vérifier `GET /api/health`, une génération, un Checkout en mode test.

### Retour arrière
- Frontend : republier le déploiement Netlify précédent.
- API : redéployer le commit précédent sur Render.
- Règles : redéployer la version exportée.
- Données : les nouvelles collections `usage` et `stripeEvents` peuvent rester (ignorées par l'ancien code).

## Commandes utiles en local

```bash
npm ci
cp .env.example .env   # renseigner des clés de TEST
npm start              # API sur http://localhost:3000
npm run test:tout      # toutes les suites
```

## Installation de Render

`firebase-tools` et `playwright` sont des devDependencies (tests). Pour alléger le build Render, utiliser `npm ci --omit=dev` comme commande de build.
