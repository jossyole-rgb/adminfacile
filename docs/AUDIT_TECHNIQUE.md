# Audit technique — AdminFacile 2.0

**Date :** 13 octobre 2026 — **statuts mis à jour le 15 octobre 2026**
**Périmètre :** dépôt `jossyole-rgb/adminfacile`, branche `develop` (commit de départ `7b436fa`).
**Méthode :** lecture intégrale de `server.js`, `script.js`, `firebase.js`, `index.html`, `dashboard.html`, `success.html`, `style.css`, `package.json`, `package-lock.json` ; `npm audit` ; exécution de tests automatisés écrits pour l'occasion (voir `docs/TESTS_ET_RECETTE.md`).

**Hors périmètre (non accessible depuis le dépôt) :** console Firebase (règles réellement déployées, index, sauvegardes, restrictions de la clé web), tableau de bord Stripe (produits, webhooks configurés, mode test/live), variables d'environnement Render et Netlify, journaux de production. Les constats qui en dépendent sont marqués **« À confirmer »**.

## Légende

- **Vérifié** : constaté dans le code et, quand c'est indiqué, reproduit par un test.
- **À confirmer** : risque plausible qui dépend d'une configuration hors dépôt.
- **Statut** : *Corrigé* (avec commit et test), *Partiel*, *Ouvert*.

## Synthèse

| Priorité | Total | Corrigés | Partiels | Ouverts |
|---|---|---|---|---|
| P0 | 6 | 5 | 1 (règles à publier par Joss) | 0 |
| P1 | 16 | 13 | 3 | 0 |
| P2 | 9 | 6 | 0 | 3 (décision ou vérification hors dépôt) |

## P0 — Critique

### A01 · Routes IA appelables sans authentification
- **Fichier :** `server.js` (version initiale) : `/resumer-lettre`, `/reecrire-lettre`, `/chat-admin`, `/upload-document`, `/generer-reponse-ia`, `/chat-document`.
- **Constat (vérifié) :** aucune vérification de token ; seul `/generer-lettre` utilisait `verifierUtilisateur`.
- **Risque :** n'importe qui peut consommer l'API OpenAI aux frais du projet (dépenses illimitées hors limite par IP), et utiliser l'OCR serveur.
- **Correction :** middleware `backend/middleware/auth.js` (vérification `verifyIdToken` avec contrôle de révocation) appliqué à toutes les routes privées ; le frontend envoie le token via `appelerAPI()`.
- **Vérification :** `backend/tests/api.test.js` — 26 tests « refuse sans token / token invalide » sur les 13 routes privées.
- **Statut :** Corrigé (`f2e4f65`, `112cd71`).

### A02 · Quota gratuit de 3 lettres contrôlé uniquement dans le navigateur
- **Fichier :** `script.js` (`genererLettre`, comptage des documents `lettres`).
- **Constat (vérifié) :** le serveur génère sans limite ; le quota se contourne en appelant l'API directement, et **supprimer une lettre redonnait une génération**.
- **Risque :** perte de revenu Premium et dépenses IA.
- **Correction :** `backend/services/comptes.js` : compteur `usage/{uid}` incrémenté dans une **transaction Firestore** avant l'appel IA ; initialisé à partir des lettres existantes pour les comptes déjà actifs ; rendu (décrémenté) si l'IA échoue. Réponse `402 QUOTA_EXCEEDED`.
- **Vérification :** émulateur Firestore — 20 requêtes simultanées → exactement 3 autorisées ; suppression de lettres sans effet ; échec IA non décompté ; `past_due` limité (`backend/tests/emulateur/serveur.test.js`). Tests API 402 et libération.
- **Statut :** Corrigé.

### A03 · Checkout Stripe fondé sur `uid` et `email` envoyés par le client
- **Fichier :** `server.js`, `/create-checkout-session`.
- **Constat (vérifié) :** `client_reference_id` = `uid` du corps de requête, sans authentification.
- **Risque :** un paiement peut être rattaché à un autre compte ; création de sessions par des tiers.
- **Correction :** `uid` et `email` lus dans le token vérifié ; email vérifié exigé ; réutilisation du client Stripe existant ; `409` si déjà Premium ; `metadata.uid` posé sur la session et l'abonnement.
- **Vérification :** test API « Checkout utilise uid et email du token, jamais ceux du corps » ; tests émulateur checkout ; test navigateur (corps vide).
- **Statut :** Corrigé.

### A04 · Portail de facturation ouvert pour n'importe quel `customerId`
- **Fichier :** `server.js`, `/create-customer-portal-session`.
- **Constat (vérifié) :** sans authentification, le serveur ouvre le portail Stripe du `customerId` fourni et renvoie `error.message` brut en cas d'erreur.
- **Risque :** toute personne connaissant un identifiant `cus_…` accède aux factures, moyens de paiement et à la résiliation d'un autre client.
- **Correction :** authentification obligatoire ; le client Stripe est relu dans `users/{uid}` ; tout `customerId` envoyé est ignoré ; erreurs génériques.
- **Vérification :** test API « Portail ignore le customerId envoyé » ; test émulateur (client du uid, 404 sinon).
- **Statut :** Corrigé.

### A05 · Règles Firestore absentes du dépôt ; Premium potentiellement auto-attribuable
- **Fichiers :** aucun `firestore.rules` versionné ; `script.js` écrit `users/{uid}` (création) et lit `premium` côté client.
- **Constat :** les règles en production sont inconnues (**À confirmer**). Si elles autorisent le propriétaire à écrire son document `users`, un utilisateur peut se passer `premium: true` depuis la console du navigateur ; si elles sont permissives (mode test), toutes les lettres et analyses sont lisibles par tous.
- **Correction :** `firestore.rules` versionné : lecture/suppression limitées au propriétaire, création initiale sans droit Premium, aucun accès client à `usage` et `stripeEvents`, refus par défaut. Le serveur, seul, décide du Premium.
- **Vérification :** 31 tests d'isolation sur émulateur (`backend/tests/emulateur/regles.test.js`).
- **Statut :** Partiel — **le déploiement des règles en production attend ta validation** (voir `docs/DEPLOIEMENT.md`).

### A06 · Injection HTML (XSS) dans l'interface
- **Fichier :** `script.js` — `innerHTML` avec réponses IA, historique, analyses, questions de chat, fenêtre PDF de réponse.
- **Constat (vérifié) :** un texte `<img src=x onerror=…>` renvoyé par l'IA s'exécute. Un document piégé peut amener l'IA à produire ce code (injection de prompt).
- **Risque :** exécution de script dans la session de l'utilisateur, vol du token Firebase, lecture de ses données.
- **Correction :** `echapperHTML()` / `texteMultiligne()` appliqués à toute donnée dynamique insérée en HTML.
- **Vérification :** test navigateur « réponse IA contenant du HTML affichée comme texte » (échoue sur l'ancien `script.js`, passe sur le nouveau).
- **Statut :** Corrigé.

## P1 — Important

| ID | Constat | Fichier | Vérifié ? | Correction / vérification | Statut |
|---|---|---|---|---|---|
| A07 | Webhooks Stripe non idempotents ; ordre des événements non géré | `server.js` | Vérifié | Journal `stripeEvents/{id}` + ignore les événements plus anciens que `stripeEventCreated` ; 7 tests émulateur (doublon, désordre, impayé, annulation, réactivation) | Corrigé |
| A08 | Upload : type MIME déclaré seulement, pas d'auth, erreurs Multer en 500, un seul fichier analysé sur 5 acceptés, noms de fichiers journalisés | `server.js` | Vérifié | Contrôle des signatures (PDF/PNG/JPG), cohérence MIME/contenu, erreurs 400 lisibles, analyse de tous les fichiers (texte plafonné), plus de logs de fichiers ; tests API et unitaires | Corrigé |
| A09 | Aucune limite de taille des champs envoyés à l'IA ; ton libre injecté dans le prompt | `server.js` | Vérifié | Validation (`backend/middleware/validation.js`), listes fermées de types/tons/styles, données encadrées `<donnees_utilisateur>` | Corrigé |
| A10 | Erreurs : `analyserDocument` sans `try/catch` (interface bloquée), chat affichant `undefined`, fuite `error.message` Stripe | `script.js`, `server.js` | Vérifié | Gestionnaire d'erreurs centralisé, messages français, test navigateur erreur réseau | Corrigé |
| A11 | Scripts importés deux fois dans `dashboard.html` | `dashboard.html` | Vérifié (sans double exécution : un module ES n'est évalué qu'une fois) | Doublon supprimé | Corrigé |
| A12 | Aucun test ni commande `npm test` | `package.json` | Vérifié | 172 tests (86 API/services, 57 émulateur, 19 navigateur, 10 accessibilité axe-core) | Corrigé |
| A13 | Dépendances vulnérables : 22 en production dont 2 critiques | `package-lock.json` | Vérifié (`npm audit`) | `npm audit fix` sans rupture → 8 modérées restantes (`uuid` via `google-gax`) | Partiel |
| A14 | Prompts poussant à des lettres « juridiquement correctes », sans consigne contre l'invention de faits | `server.js` | Vérifié | Règles de fiabilité dans tous les prompts, champs `[à compléter]`, section `POINTS_A_VERIFIER` | Corrigé |
| A15 | Vérification d'email appliquée seulement dans le navigateur | `script.js` | Vérifié | Exigée côté serveur pour la génération et le Checkout | Corrigé |
| A16 | Quota du chat IA (5 messages) seulement dans le navigateur, remis à zéro au rechargement | `script.js` | Vérifié | Quota serveur transactionnel `usage/{uid}` : 5 messages / jour (heure de Paris) en gratuit, illimité en Premium, message rendu si l'IA échoue ; tests API et émulateur | Corrigé |
| A17 | Historique non paginé, relu en entier à chaque affichage ; lettres écrites par le navigateur | `script.js` | Vérifié | API `/api/letters` (liste paginée, détail, suppression, contrôle de propriété) ; lettres enregistrées par le serveur ; tests API, émulateur, navigateur | Corrigé |
| A18 | Pas de suppression de compte ni de politique de conservation des documents/analyses | — | Vérifié | Suppression de compte `DELETE /api/me` (confirmation, connexion récente, résiliation Stripe, données Firestore, compte Auth) testée sur émulateur ; **durée de conservation à décider (P-04)** | Partiel |
| A19 | OCR Tesseract exécuté dans le processus web | `server.js` | Vérifié ; charge réelle **à confirmer** | Délai maximal (30 s, `OCR_TIMEOUT_SECONDS`) avec arrêt du moteur ; données de langue livrées avec l'application ; testé avec une vraie image. Pas de file d'attente : à surveiller en production | Partiel |
| A20 | Accessibilité : champs sans libellé (chat, upload), `prompt()`/`alert()`, boutons à emoji seuls | `dashboard.html`, `script.js` | Vérifié (axe-core) | Libellés, lien d'évitement, modales `role="dialog"` avec focus et Échap, contrastes clair/sombre, `prefers-reduced-motion`, plus de `prompt()`/`alert()` ; 10 tests axe-core WCAG 2.2 AA et mobile 375 px | Corrigé |
| A31 | Une erreur Tesseract (image illisible, données de langue indisponibles) était levée hors de toute promesse et **arrêtait le processus Node** ; idem pour un rejet tardif après délai | `server.js` | Vérifié le 15/10/2026 : arrêt reproduit en local avec un échec de chargement des données de langue et avec un délai dépassé ; pour une image illisible, déduit du code de `tesseract.js` (même chemin d'erreur), non reproduit | `errorHandler` Tesseract, rejet tardif intercepté, moteur arrêté ; tests unitaires (échouent sur l'ancien code) + essai réel | Corrigé |
| A21 | Démarrage en erreur obscure si `FIREBASE_PRIVATE_KEY` manque ; journaux contenant des emails | `server.js` | Vérifié | Message explicite au démarrage ; plus d'emails dans les logs | Corrigé |

## P2 — Amélioration

| ID | Constat | Statut |
|---|---|---|
| A22 | `success.html` annonce « Premium activé » avant confirmation du webhook | Corrigé (attend la confirmation de `/api/me`, test navigateur) |
| A23 | `invoice.payment_failed` retire le Premium immédiatement, alors que Stripe relance le paiement (comportement conservé) | Ouvert — **décision P-02** |
| A24 | Dépendances serveur inutilisées (`docx`, `file-saver`) | Corrigé (retirées) |
| A25 | `firebase.js` redéfinit `creerCompte`/`connexion` aussi définies dans `script.js` | Corrigé (`firebase.js` limité à l'initialisation) |
| A26 | `.DS_Store` versionné | Corrigé |
| A27 | Origines CORS codées en dur (dont localhost) | Corrigé (variable `CORS_ORIGINS`, valeurs historiques par défaut) |
| A28 | Clé web Firebase dans `firebase.js` : publique par conception, mais ses restrictions (référents HTTP) sont **à confirmer** dans Google Cloud | Ouvert |
| A29 | Export PDF jsPDF en police standard : rendu des caractères spéciaux **à confirmer** | Ouvert |
| A30 | Données dupliquées : email et analyse complète recopiés dans chaque document | Corrigé pour les nouvelles écritures |

## Points à confirmer hors dépôt

1. Règles Firestore et Storage actuellement déployées (A05).
2. Restrictions de la clé web Firebase (A28).
3. Webhook Stripe : URL, événements abonnés (`checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`), secret.
4. Variables Render : présence de `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `FRONTEND_URL`.
5. ~~Tesseract.js télécharge ses données de langue au premier usage~~ : résolu, les données sont livrées avec l'application.
6. Sauvegardes Firestore (export planifié) et test de restauration.
