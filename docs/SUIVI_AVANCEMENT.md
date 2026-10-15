# Suivi d'avancement — AdminFacile 2.0

Statuts : **À faire** · **En cours** · **Terminé** · **Bloqué**

## État au 15 octobre 2026

- **Dernière tâche terminée :** T16 — avertissement sur les limites de l'IA (CHAT-01).
- **Prochaine étape :** actions de Joss listées dans `docs/RAPPORT_FINAL.md` (publication des règles, environnement de test, recette manuelle, décisions P-02, P-04, P-05).
- **Tests validés :** `npm test` 86/86, `npm run test:emulateur` 57/57, `npm run test:interface` 29/29 (19 navigateur + 10 accessibilité).
- **Blocages :**
  - B1 — ~~Push GitHub refusé~~ résolu le 13 octobre 2026.
  - B2 — Aucun identifiant Firebase, Stripe ou Render dans l'environnement de Claude : publication des règles, environnement de test et recette manuelle à faire par Joss.
- **Décisions en attente :** P-02, P-04, P-05 (`docs/DECISIONS_TECHNIQUES.md`).

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
### T10 · `API_URL` par environnement — Terminé (environnement de test : Bloqué, B2)
- **Fichiers :** `js/config.js`, `js/api.js`.
- **Modifications :** URL de l'API choisie selon l'adresse du site : `localhost`/`127.0.0.1` → API locale ; déploiement Netlify de prévisualisation (`…--….netlify.app`) → `https://adminfacile-test.onrender.com` ; sinon production.
- **Tests :** test navigateur sur les trois cas. **Résultat :** réussi.
- **Restant :** créer le service Render de test, le projet Firebase de test et les clés Stripe test (Joss).

### T11 · Quota serveur de l'assistant (A16, CHAT-02) — Terminé
- **Fichiers :** `backend/services/comptes.js`, `backend/routes/ia.js`, `js/assistant.js`.
- **Modifications :** 5 messages / jour en gratuit (heure de Paris, `FREE_CHAT_DAILY_LIMIT`), illimité en Premium, transaction Firestore, message rendu si l'IA échoue ; assistant et chat document concernés.
- **Tests :** API (402, libération), émulateur (concurrence, changement de jour, cohabitation avec le quota de lettres). **Résultat :** réussi.

### T12 · Accessibilité et responsive (A20) — Terminé
- **Fichiers :** `dashboard.html`, `index.html`, `success.html`, `style.css`, `js/ui.js`, `js/auth.js`, `js/documents.js`.
- **Modifications :** libellés, lien d'évitement, régions `aria-live`, modales accessibles (focus, Échap), contrastes clair/sombre, `prefers-reduced-motion`, suppression de `prompt()`/`alert()`.
- **Tests :** 10 tests axe-core WCAG 2.2 AA (pages, thèmes, modale, lettre en édition) et absence de défilement horizontal à 375 px. **Résultat :** réussi.
- **Restant :** contrôle manuel au lecteur d'écran (non automatisable).

### T13 · Suppression de compte (A18, AUTH-05) — Terminé (conservation : décision P-04)
- **Fichiers :** `backend/services/suppression.js`, `backend/routes/compte.js`, `js/compte.js`, `dashboard.html`.
- **Modifications :** `DELETE /api/me` avec saisie « SUPPRIMER » et connexion de moins de 10 minutes ; résiliation des abonnements Stripe, suppression des lettres, analyses, conversations, compteurs, profil puis compte Firebase Auth ; arrêt complet si Stripe échoue.
- **Tests :** API (confirmation, connexion récente) et émulateur (données d'un autre utilisateur intactes, échec Stripe). **Résultat :** réussi.

### T14 · OCR limité et code mort (A19, A24, A25, A31) — Terminé
- **Fichiers :** `backend/services/documents.js`, `backend/services/ocr.js`, `server.js`, `firebase.js`, `js/auth.js`, `package.json`.
- **Modifications :** délai maximal OCR (30 s) avec arrêt du moteur ; correction d'un arrêt complet du serveur sur erreur Tesseract ; données de langue française livrées ; doublons de `firebase.js` et dépendances `docx`/`file-saver` retirés.
- **Tests :** 4 tests unitaires (dont 2 qui échouent sur l'ancien code) et essai réel avec une image (texte reconnu en 0,4 s, délai dépassé sans arrêt du processus). **Résultat :** réussi.

### T15 · Édition avant export (LETTER-04, REPLY-02) — Terminé
- **Fichiers :** `backend/services/lettres.js`, `backend/routes/compte.js`, `js/letters.js`, `js/documents.js`, `js/exports.js`, `dashboard.html`.
- **Modifications :** lettre modifiable dans la page et enregistrable (`PUT /api/letters/:id`) ; copie et exports utilisent la version modifiée ; réponse IA en brouillon modifiable avec export DOCX et rappel « aucun envoi automatique ».
- **Tests :** 4 API, 1 émulateur, 2 navigateur, 2 accessibilité. **Résultat :** réussi.

### T16 · Avertissement IA (CHAT-01) — Terminé
- **Fichiers :** `dashboard.html`, `style.css`. **Tests :** 1 navigateur + contrastes axe-core. **Résultat :** réussi.
