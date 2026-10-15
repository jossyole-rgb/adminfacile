# Plan de développement — AdminFacile 2.0

Référence : `Cahier_des_charges_AdminFacile_2_0.md` (13 octobre 2026) et `docs/AUDIT_TECHNIQUE.md`.
Règle : chaque lot = modification cohérente + tests + commit + mise à jour de `docs/SUIVI_AVANCEMENT.md`.

## Phase 1 — Audit ✅
- Audit complet, classement P0/P1/P2, distinction vérifié / à confirmer.

## Phase 2 — Sécurisation (P0) ✅ sauf publication des règles (Joss)
1. Auth Firebase sur toutes les routes privées (A01).
2. Quota serveur transactionnel (A02).
3. Checkout et portail Stripe fondés sur le token (A03, A04).
4. Règles Firestore + tests d'isolation (A05) — **déploiement à valider**.
5. Échappement HTML (A06).
6. Webhooks idempotents, validation des entrées, uploads, erreurs (A07–A10).

## Phase 3 — Refactorisation progressive
1. ✅ Backend modulaire (`backend/app`, `routes`, `services`, `middleware`, `tests`).
2. ✅ Frontend : extraire de `script.js` les modules `js/api.js`, `js/auth.js`, `js/letters.js`, `js/documents.js`, `js/billing.js` (ES modules, sans changer Netlify).
3. ✅ `API_URL` configurable par environnement (test / production).
4. ✅ Supprimer les doublons `firebase.js`/`script.js` et dépendances inutilisées (A24, A25).

## Phase 4 — Fonctions principales ✅
1. ✅ API historique `GET/DELETE /api/letters[/:id]` paginée, avec contrôle de propriété ; sauvegarde des lettres par le serveur (LETTER-05).
2. ✅ Édition de la lettre générée avant export ; sauvegarde des modifications (LETTER-04).
3. ✅ Quota serveur de l'assistant IA (CHAT-02, décision P-03).
4. ✅ Page `success.html` qui attend la confirmation réelle du Premium (A22).
5. ✅ Suppression de compte et de ses données (AUTH-05).

## Phase 5 — Interface (WCAG 2.2 AA) ✅ (essai lecteur d'écran restant)
- Libellés de champs, focus visibles, contrastes, navigation clavier, remplacement de `prompt()`/`alert()`, responsive mobile, statut Premium et historique plus lisibles, indicateurs de chargement homogènes.

## Phase 6 — Analyse documentaire
- ✅ Délai maximal OCR et données de langue embarquées (A19, A31). ○ File d'attente si la charge l'exige. ○ Export de l'analyse. ○ Politique de conservation (DOC-06, décision P-04).

## Phase 7 — Réponses aux courriers
- ✅ Édition de la réponse, export DOCX, rappel « aucun envoi automatique » (REPLY-02/03). ○ Choix du ton depuis l'analyse en cours (aujourd'hui depuis les analyses sauvegardées).

## Phase 8 — Livraison
- ✅ Rapport des risques résiduels et liste des validations (`docs/RAPPORT_FINAL.md`). ○ Environnement de test et recette manuelle (Joss : identifiants requis).
