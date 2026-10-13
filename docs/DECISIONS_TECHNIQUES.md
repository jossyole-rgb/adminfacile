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

### D-11 · Tests
- `node:test` + `supertest` (aucun framework lourd) ; émulateur Firestore via `firebase-tools` ; Playwright pour l'interface avec Firebase/API/CDN simulés.

## Décisions en attente de validation

| ID | Sujet | Proposition par défaut |
|---|---|---|
| P-01 | Déployer `firestore.rules` en production | Oui, en même temps que le nouveau frontend (voir DEPLOIEMENT) |
| P-02 | Paiement échoué : retirer le Premium immédiatement (actuel) ou attendre la fin des relances Stripe (`past_due` → `canceled`) | Garder l'actuel jusqu'à décision |
| P-03 | Quota serveur de l'assistant IA (CHAT-02) : nombre de messages gratuits et période | 5 messages / jour en gratuit |
| P-04 | Durée de conservation des analyses et conversations (DOC-06, RGPD) | À définir avec validation juridique |
| P-05 | Prix et limites Free/Premium (BILLING-06) | Inchangés (3 lettres, prix Stripe actuel) |
