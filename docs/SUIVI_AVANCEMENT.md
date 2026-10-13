# Suivi d'avancement — AdminFacile 2.0

Statuts : **À faire** · **En cours** · **Terminé** · **Bloqué**

## État au 13 octobre 2026

- **Dernière tâche terminée :** T9 — Découpage de `script.js` en modules ES.
- **Prochaine tâche :** T5 — publication des règles Firestore par Joss (identifiants Firebase requis), puis T10 `API_URL` par environnement et environnement de test.
- **Fichiers modifiés :** `server.js`, `script.js`, `dashboard.html`, `package.json`, `package-lock.json`, `.gitignore` ; nouveaux : `backend/**`, `tests-frontend/**`, `firestore.rules`, `firebase.json`, `.env.example`, `docs/**`.
- **Tests validés :** `npm test` 70/70, `npm run test:interface` 12/12, `npm run test:emulateur` 49/49.
- **Blocages :**
  - B1 — ~~Push GitHub refusé~~ résolu le 13 octobre 2026 : commits poussés sur `develop`.
  - B2 — Configuration Firebase/Stripe/Render non accessible : points « À confirmer » de l'audit.
- **Décisions en attente :** P-01 à P-05 (`docs/DECISIONS_TECHNIQUES.md`).

## Tâches

### T1 · Audit technique — Terminé
- **Objectif :** état des lieux complet, priorisé.
- **Fichiers :** `docs/AUDIT_TECHNIQUE.md`.
- **Résultat :** 6 P0, 15 P1, 9 P2.

### T2 · Backend modulaire et testable — Terminé
- **Objectif :** séparer les responsabilités sans changer le démarrage Render.
- **Fichiers :** `server.js`, `backend/app.js`, `backend/config.js`, `backend/routes/*`, `backend/services/*`, `backend/middleware/*`.
- **Modifications :** injection des dépendances ; routes historiques conservées ; alias `/api/letters`, `/api/me`, `/api/health`, `/api/billing/*`.
- **Tests :** `npm test`. **Résultat :** réussi.

### T3 · Sécurisation de l'API (A01, A03, A04, A07–A10, A15) — Terminé
- **Fichiers :** `backend/middleware/auth.js`, `validation.js`, `erreurs.js`, `backend/services/facturation.js`, `documents.js`, `ia.js`.
- **Tests :** `api.test.js`, `services.test.js`, `serveur.test.js`. **Résultat :** réussi.
- **Restant :** OCR dans le processus web (A19).

### T4 · Quota serveur (A02) — Terminé
- **Fichiers :** `backend/services/comptes.js`, `backend/routes/ia.js`, `script.js`.
- **Tests :** concurrence 20 requêtes sur émulateur, échec IA, Premium, past_due, comptes existants. **Résultat :** réussi.

### T5 · Règles Firestore (A05) — Bloqué (identifiants Firebase)
- **Fichiers :** `firestore.rules`, `firebase.json`, `backend/tests/emulateur/regles.test.js`.
- **Tests :** 31 tests d'isolation. **Résultat :** réussi sur émulateur.
- **Restant :** déploiement validé par Joss le 13/10/2026, mais l'environnement de Claude n'a aucun identifiant Firebase : publication par Joss via la console ou `npm run deploy:regles` (procédure dans `docs/DEPLOIEMENT.md`). Compatibles avec le frontend en production.

### T6 · Dépendances (A13) — Terminé
- **Modifications :** `npm audit fix` sans rupture (multer 2.4.0, compression 1.8.2, express 4.22.3, firebase-admin 13.10.0…).
- **Résultat :** production 22 → 8 vulnérabilités modérées (`uuid` via `google-gax`, correctif nécessitant une version majeure).

### T7 · Frontend sécurisé (A06, A10, A11, A16) — Terminé
- **Fichiers :** `script.js`, `dashboard.html`, `tests-frontend/interface.test.js`.
- **Modifications :** `appelerAPI()` avec token ; quota depuis `/api/me` ; Stripe sans identifiants client ; échappement HTML ; gestion d'erreurs.
- **Tests :** 8 tests Playwright. **Résultat :** réussi ; contrôle : XSS et Checkout échouent sur l'ancien code.

### T8 · Historique via l'API, paginé — Terminé
- **Objectif :** LETTER-05 — historique paginé, consultation et suppression contrôlées par le serveur.
- **Fichiers :** `backend/services/lettres.js`, `backend/routes/compte.js`, `backend/routes/ia.js`, `script.js`, tests.
- **Modifications :** `GET /api/letters`, `GET/DELETE /api/letters/:id` ; lettre enregistrée par le serveur à la génération ; interface : « Ouvrir », « Afficher plus », confirmation avant suppression ; compteur du tableau de bord via l'API.
- **Tests :** 11 API, 3 émulateur, 3 navigateur. **Résultat :** réussi.
- **Restant :** retirer l'écriture de lettres par le navigateur des règles Firestore après la mise en production (D-12).
### T9 · Modularisation de `script.js` — Terminé
- **Objectif :** séparer les responsabilités du frontend (architecture cible du cahier des charges).
- **Fichiers :** `script.js` (point d'entrée), `js/etat.js`, `ui.js`, `api.js`, `auth.js`, `letters.js`, `dashboard.js`, `billing.js`, `assistant.js`, `documents.js`.
- **Modifications :** découpage sans changement de comportement ; état partagé explicite ; pages HTML inchangées.
- **Tests :** 12 tests navigateur (dont chargement sans erreur et existence de toutes les fonctions `onclick`), ESLint `no-undef` sans erreur. **Résultat :** réussi.
### T10 · `API_URL` par environnement + environnement de test — À faire
### T11 · Quota serveur de l'assistant — À faire (décision P-03)
### T12 · Accessibilité et responsive — À faire
### T13 · Suppression de compte et conservation des données — À faire (décision P-04)
