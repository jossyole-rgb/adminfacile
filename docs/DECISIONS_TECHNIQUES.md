# Décisions techniques — AdminFacile 2.0

Chaque décision indique son contexte, le choix retenu et ses conséquences. Les décisions marquées **En attente** nécessitent une validation de Joss.

## Décisions prises

### D-01 · Conserver la stack et `server.js` comme point d'entrée
- **Contexte :** Render lance `npm start` (`node server.js`) ; Netlify sert les fichiers HTML à la racine.
- **Choix :** `server.js` reste à la racine et ne fait qu'initialiser les services réels ; la logique passe dans `backend/` (`app.js`, `routes/`, `services/`, `middleware/`, `tests/`). Les fichiers frontend restent à la racine pour l'instant.
- **Conséquence :** aucune modification de configuration Render/Netlify requise. Le déplacement du frontend vers `frontend/` est reporté (il impose de changer le dossier de publication Netlify).

### D-02 · Injection de dépendances pour tester sans services réels
- **Choix :** `creerApp({ config, verifyIdToken, stripe, services })`. Les tests fournissent de faux services ; aucun test n'appelle OpenAI, Stripe ou Firebase en production.

### D-03 · Quota gratuit : compteur serveur à vie, non restitué à la suppression
- **Contexte :** l'ancien quota comptait les lettres présentes dans l'historique ; supprimer une lettre redonnait une génération.
- **Choix :** `usage/{uid}.lettersUsed` compte les **générations réussies**. Pour un compte existant sans compteur, la valeur initiale est le nombre de lettres déjà enregistrées (plafonné à la limite). Le compteur est incrémenté dans une transaction avant l'appel IA et décrémenté si l'IA échoue.
- **Conséquence :** un utilisateur qui avait supprimé des lettres pour « récupérer » des essais ne le peut plus. Période `lifetime` (pas de remise à zéro mensuelle) ; modifiable via `FREE_LETTER_LIMIT`.

### D-04 · Comportement en cas d'échec de génération
- Erreur OpenAI, délai dépassé (60 s, 1 nouvelle tentative) ou réponse vide → HTTP `502 AI_ERROR`, message français, **quota non consommé**.
- Requête invalide → `400 INVALID_INPUT`, quota non consommé.
- Quota atteint → `402 QUOTA_EXCEEDED`, l'IA n'est pas appelée.

### D-05 · Statut Premium stocké dans `users/{uid}` (pas de nouvelle collection `subscriptions`)
- **Contexte :** le cahier des charges propose `subscriptions/{uid}` ; le code existant et le frontend lisent `users/{uid}.premium`.
- **Choix :** garder `users/{uid}` (`premium`, `subscriptionStatus`, `stripeCustomerId`, `stripeSubscriptionId`, `stripeEventCreated`), écrit uniquement par le serveur. Premium = `premium === true` **et** `subscriptionStatus === "active"`.
- **Conséquence :** aucune migration de données nécessaire.

### D-06 · Webhooks Stripe
- Signature vérifiée sur le corps brut ; événements journalisés dans `stripeEvents/{eventId}` (`processed` / `failed`) ; un doublon déjà traité renvoie 200 sans effet.
- Un événement plus ancien (`event.created`) que le dernier appliqué au compte est ignoré.
- En cas d'erreur de traitement : 500 → Stripe réessaie.

### D-07 · Email vérifié
- Exigé côté serveur pour la génération de lettre et le Checkout (comme le faisait déjà l'interface). Non exigé pour l'assistant, l'analyse documentaire et le portail, pour ne pas changer le parcours actuel.

### D-08 · Fichiers importés
- Limite 8 Mo par fichier, 5 fichiers, PDF/PNG/JPG ; type réel contrôlé par signature binaire et cohérence avec le type déclaré. Fichiers traités en mémoire, jamais écrits sur disque ni conservés par le serveur. Texte transmis à l'IA plafonné (4 000 caractères par fichier, 8 000 au total).

### D-09 · Limites de débit
- Globale : 100 requêtes / 15 min / IP (webhook exclu). IA : 30 requêtes / 15 min **par utilisateur** (repli IP).

### D-10 · Prompts IA
- Consignes communes : ne rien inventer, champs `[à compléter]`, prudence juridique, données utilisateur encadrées par `<donnees_utilisateur>` (atténuation des injections de prompt). Ajout d'une rubrique `POINTS_A_VERIFIER` à l'analyse.

### D-12 · Historique des lettres géré par le serveur
- **Choix :** la route de génération enregistre la lettre (`createdAt` serveur) ; l'interface lit, ouvre et supprime via `/api/letters` (pagination par décalage, 10 par page dans l'interface, 50 max).
- Les anciennes lettres n'ont pas de `createdAt` : le tri se fait en mémoire (date `jj/mm/aaaa` reconvertie), sur 500 lettres maximum par utilisateur. Aucun index composite ni migration de données n'est nécessaire.
- Lecture/suppression d'une lettre d'un autre → 404 (pas de 403, pour ne pas révéler son existence).
- Les règles Firestore autorisent encore la création de lettres par le navigateur (compatibilité avec l'ancien frontend pendant la transition) ; à retirer après la mise en production du nouveau frontend.

### D-13 · Frontend en modules ES
- **Choix :** `script.js` devient un simple point d'entrée qui importe `js/ui.js`, `js/api.js`, `js/auth.js`, `js/letters.js`, `js/dashboard.js`, `js/billing.js`, `js/assistant.js`, `js/documents.js` ; l'état de session est partagé via `js/etat.js`. Les pages HTML ne changent pas (toujours `script.js`), Netlify sert `js/` depuis la racine, sans outil de build.
- Les fonctions appelées par les `onclick` restent exposées sur `window` ; un test d'interface vérifie qu'elles existent toutes et qu'aucune erreur JavaScript ne survient au chargement.
- Le déplacement de tous les fichiers dans `frontend/` reste reporté (changement du dossier de publication Netlify).

### D-14 · Quota de l'assistant IA (P-03 appliquée par défaut)
- **Choix :** 5 messages gratuits par jour, remis à zéro à minuit heure de Paris (`usage/{uid}.chatDay`, `chatUsed`), illimité en Premium ; partagé entre l'assistant et le chat document ; message rendu si l'IA échoue. Valeur réglable sans code : `FREE_CHAT_DAILY_LIMIT`.
- **Conséquence :** comportement proche de l'ancien quota navigateur (5 messages), mais non contournable. Valeur commerciale à confirmer par Joss (P-05).

### D-15 · Suppression de compte
- **Choix :** `DELETE /api/me`, confirmation saisie (« SUPPRIMER ») et connexion de moins de 10 minutes. Ordre : résiliation immédiate des abonnements Stripe → lettres, analyses, conversations, compteurs, profil → compte Firebase Auth. Si Stripe échoue, rien n'est supprimé et l'utilisateur peut réessayer.
- **Conservé volontairement :** client et factures Stripe (obligations comptables), journal `stripeEvents` (identifiants techniques sans contenu personnel). **À valider juridiquement (P-04).**

### D-16 · URL de l'API par environnement
- **Choix :** `js/config.js` choisit l'API **et la configuration Firebase web** selon l'adresse du site (local, prévisualisation Netlify `--`, production). Pas d'outil de build, pas de variable Netlify nécessaire. Sans configuration Firebase de test, repli sur la production : l'API de test refuse alors les tokens (échec sans risque).
- **Conséquence :** l'environnement de test suppose un service Render nommé `adminfacile-test` et l'ajout des URL de prévisualisation Netlify dans `CORS_ORIGINS` de ce service.

### D-17 · OCR
- **Choix :** un moteur Tesseract par image, arrêté après usage ; délai maximal 30 s (`OCR_TIMEOUT_SECONDS`) ; données de langue française livrées (`@tesseract.js-data/fra`, +7 Mo dans `node_modules`), sans cache disque. Pas de file d'attente : les limites de débit par utilisateur suffisent au volume actuel, à réévaluer selon la charge.

### D-18 · Édition avant export
- **Choix :** la lettre affichée devient modifiable (`contenteditable="plaintext-only"`) ; « Enregistrer mes modifications » envoie `PUT /api/letters/:id` (propriétaire uniquement, 20 000 caractères max). Les exports utilisent toujours le texte affiché. La réponse IA est un brouillon modifiable (zone de texte), exportable en PDF et DOCX, jamais envoyée par l'application.

### D-11 · Tests
- `node:test` + `supertest` (aucun framework lourd) ; émulateur Firestore via `firebase-tools` ; Playwright pour l'interface avec Firebase/API/CDN simulés.

## Décisions en attente de validation

| ID | Sujet | Proposition par défaut |
|---|---|---|
| P-01 | Déployer `firestore.rules` en production | **Validé par Joss (13/10/2026)** ; publication à faire par Joss (identifiants requis) |
| P-02 | Paiement échoué : retirer le Premium immédiatement (actuel) ou attendre la fin des relances Stripe (`past_due` → `canceled`) | Garder l'actuel jusqu'à décision |
| P-03 | Quota serveur de l'assistant IA (CHAT-02) : nombre de messages gratuits et période | **Appliqué par défaut** : 5 messages / jour (D-14), modifiable par variable d'environnement |
| P-04 | Durée de conservation des lettres, analyses et conversations (DOC-06, RGPD) ; données conservées après suppression de compte (D-15) | À définir avec validation juridique ; aujourd'hui : conservation jusqu'à suppression par l'utilisateur |
| P-05 | Prix et limites Free/Premium (BILLING-06) | Inchangés (3 lettres, prix Stripe actuel) |
