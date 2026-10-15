# Rapport final — AdminFacile 2.0 (branche `develop`)

**Date :** 15 octobre 2026
**État :** développement terminé sur `develop`, testé automatiquement ; **rien n'est déployé en production** et `main` n'a pas été modifiée.

## 1. Ce qui a été livré

| Domaine | Résultat | Preuve |
|---|---|---|
| Sécurité de l'API | Token Firebase vérifié sur toutes les routes privées ; email vérifié exigé pour la génération et le paiement ; limites de débit ; validation des entrées ; erreurs sans fuite technique | `api.test.js` (routes × sans token / token invalide) |
| Quotas | 3 lettres gratuites et 5 messages d'assistant par jour, appliqués par le serveur dans des transactions Firestore ; rendus si l'IA échoue | `serveur.test.js` : 20 requêtes simultanées → 3 acceptées ; 10 messages → 5 |
| Stripe | Checkout et portail fondés sur le token ; webhooks signés, idempotents, ordre des événements géré ; page de succès qui attend la confirmation du serveur | 7 tests émulateur + tests API et navigateur |
| Données | Règles Firestore « propriétaire uniquement », Premium et compteurs écrits seulement par le serveur | 31 tests de règles sur émulateur |
| Lettres | Génération sans faits inventés (`[à compléter]`), historique paginé côté serveur, modification et enregistrement, copie et exports TXT/PDF/DOCX de la version modifiée | tests API, émulateur, navigateur |
| Documents | PDF/PNG/JPG, 8 Mo, type réel contrôlé, OCR limité à 30 s, analyse avec points à vérifier | tests unitaires + essai OCR réel |
| Réponses | Brouillon modifiable, export PDF/DOCX, **jamais d'envoi automatique** | test navigateur (aucun appel serveur à l'export) |
| Compte | Suppression du compte et de ses données (confirmation + connexion récente, abonnement résilié) | tests API et émulateur |
| Interface | Modules ES, échappement HTML (XSS), WCAG 2.2 AA automatisé, mobile 375 px, avertissement sur les limites de l'IA | 19 tests navigateur + 10 axe-core |

**Tests au 15/10/2026 :** `npm test` 86/86, `npm run test:emulateur` 57/57, `npm run test:interface` 29/29 — 172 tests, tous réussis. Détails : `docs/TESTS_ET_RECETTE.md`.

## 2. Risques résiduels

Classés du plus au moins important. « Vérifié » = constaté dans le code ou par un test ; « Supposé » = dépend d'une configuration que je ne peux pas voir.

| # | Risque | Gravité | Nature | Atténuation actuelle | Action proposée |
|---|---|---|---|---|---|
| R1 | **Règles Firestore non publiées** : en production, la base reste protégée par les règles actuelles, inconnues (un utilisateur pourrait s'attribuer le Premium ou lire d'autres données si elles sont permissives) | Critique | Supposé (règles réelles non visibles) | Règles prêtes et testées dans `firestore.rules` | Joss : publier (procédure `docs/DEPLOIEMENT.md` §3) — indépendant du reste, compatible avec le site actuel |
| R2 | **Mise en production non progressive** : nouvelle API et nouveau frontend doivent partir ensemble ; quelques minutes de fonctions dégradées | Élevée | Vérifié | Ordre et retour arrière documentés | Créneau de faible trafic ; recette sur l'environnement de test d'abord |
| R3 | **Aucune recette sur services réels** : OpenAI, Stripe (mode test), Firebase Auth et `pdf-parse` n'ont été exercés qu'avec des simulations ; Tesseract une seule fois en réel | Élevée | Vérifié | 172 tests automatisés | Recette manuelle R1–R23 sur l'environnement de test |
| R4 | OCR dans le processus web : plusieurs images lourdes simultanées peuvent ralentir l'API (pas de file d'attente) | Moyenne | Vérifié (code) ; charge réelle inconnue | Délai 30 s, moteur arrêté, 30 requêtes IA / 15 min par utilisateur | Surveiller CPU/mémoire Render ; file d'attente ou service séparé si besoin |
| R5 | Paiement échoué : le Premium est retiré dès le premier échec alors que Stripe relance | Moyenne (commercial) | Vérifié | Comportement historique conservé | Décision P-02 |
| R6 | Conservation des données (lettres, analyses, conversations) sans durée définie ; client et factures Stripe conservés après suppression du compte | Moyenne (RGPD) | Vérifié | Suppression par l'utilisateur, suppression de compte | Décision P-04 avec validation juridique ; mettre à jour la politique de confidentialité |
| R7 | Contenu juridique produit par l'IA : erreurs possibles malgré les consignes | Moyenne | Inhérent | Consignes « ne rien inventer », `[à compléter]`, points à vérifier, avertissement visible, édition avant export | Mentions légales / CGU à valider par un juriste ; CHAT-03 (sources datées) non implémenté |
| R8 | Injection de prompt via un document importé | Faible à moyenne | Vérifié (atténuation seulement) | Données encadrées `<donnees_utilisateur>`, aucune action automatique possible (pas d'envoi, pas d'écriture hors du compte) | Surveiller ; pas de correctif complet connu |
| R9 | 8 vulnérabilités modérées (`uuid` via `google-gax`, dépendance de `firebase-admin`) | Faible | Vérifié (`npm audit`) | Pas d'usage direct de `uuid` | Mettre à jour `firebase-admin` quand une version corrigée sort |
| R10 | Clé web Firebase : publique par conception ; restrictions de domaine inconnues | Faible | Supposé | Règles Firestore + API | Vérifier les restrictions de la clé dans Google Cloud (A28) |
| R11 | Export PDF (jsPDF, police standard) : rendu de certains caractères (€, ligatures) non vérifié | Faible | Supposé | Export DOCX et TXT disponibles | Recette R6 |
| R12 | Lettres encore créables par le navigateur selon les règles (transition) | Faible | Vérifié | Propriétaire uniquement, champs contrôlés | Retirer cette autorisation après la mise en production du nouveau frontend (D-12) |
| R13 | Accessibilité : tests automatiques seulement | Faible | Vérifié | 10 tests axe-core | Essai clavier + lecteur d'écran (R23) |

## 3. Validations nécessaires avant la production

Rien de ce qui suit ne peut être fait par Claude : ces étapes touchent la production, des comptes de facturation, des clés secrètes ou des décisions juridiques et commerciales.

**Tout de suite (indépendant du reste)**
1. ☐ Publier les règles Firestore en production (P-01 validée le 13/10/2026) en sauvegardant d'abord les règles actuelles.
2. ☐ Planifier une sauvegarde Firestore (export) et tester une restauration.

**Environnement de test (avant toute mise en production)**
3. ☐ Créer le projet Firebase de test et renseigner sa configuration web dans `js/config.js` (`CONFIGS_FIREBASE.test`).
4. ☐ Créer le service Render `adminfacile-test` (branche `develop`, clés Stripe **test**, compte de service Firebase de test, `CORS_ORIGINS` = URL Netlify de `develop`).
5. ☐ Activer le déploiement Netlify de la branche `develop`.
6. ☐ Dérouler la recette manuelle R1–R23 (`docs/TESTS_ET_RECETTE.md`) avec les cartes de test Stripe uniquement.

**Décisions**
7. ☐ P-02 — paiement échoué : retrait immédiat ou après les relances Stripe.
8. ☐ P-04 — durées de conservation et données gardées après suppression de compte (avec avis juridique).
9. ☐ P-05 — prix et limites Free/Premium (aujourd'hui : 3 lettres à vie, 5 messages par jour, prix Stripe actuel).
10. ☐ Mentions légales, CGU et politique de confidentialité à jour (IA, conservation, suppression de compte).

**Mise en production (sur accord explicite)**
11. ☐ Vérifier le webhook Stripe de production (URL, 4 événements, secret) et les variables Render (`STRIPE_*`, `FRONTEND_URL`).
12. ☐ Fusion `develop` → `main` puis déploiement API Render et frontend Netlify à la suite, en créneau calme.
13. ☐ Contrôles après déploiement : `/api/health`, connexion, une génération, une analyse, l'historique, un Checkout ; surveillance des journaux Render pendant 24 h.
14. ☐ Retour arrière prêt : déploiement Netlify précédent, commit Render précédent, règles sauvegardées.
