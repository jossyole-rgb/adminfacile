# Tests et recette — AdminFacile 2.0

## Commandes

| Commande | Contenu | Prérequis |
|---|---|---|
| `npm test` | Tests API et services (86) — faux services, aucun réseau | Node ≥ 20 |
| `npm run test:interface` | Tests navigateur Chromium (19, + contrôle d'absence d'erreur JavaScript à chaque test) et accessibilité axe-core WCAG 2.2 AA (10) — Firebase, API et CDN simulés | Playwright 1.56 + Chromium (`npx playwright install chromium` en local) |
| `npm run test:emulateur` | Règles Firestore (31) + quotas, webhooks, historique et suppression de compte sur Firestore réel (26) | Java 11+, `firebase-tools` (devDependency) |
| `npm run test:tout` | Les trois suites | — |

Aucun test n'utilise de clé réelle, de vrai paiement ni la base de production (projet `demo-adminfacile` sur émulateur).

## Dernière exécution

**15 octobre 2026**, Node 22.22, Java disponible (commit `66ed607` et suivants) :

| Suite | Résultat |
|---|---|
| `npm test` | 86 / 86 réussis |
| `npm run test:interface` | 29 / 29 réussis (19 navigateur + 10 accessibilité) |
| `npm run test:emulateur` | 57 / 57 réussis |

Contrôles de pertinence : les tests d'interface « XSS » et « Passer Premium » **échouent** sur l'ancien `script.js` ; les tests « OCR qui dépasse le délai » et « rejet tardif non géré » **échouent** sur l'ancien `documents.js`.

Essai réel hors suite (15/10/2026) : OCR Tesseract sur une image PNG générée → texte « Avis de taxe foncière » reconnu en 0,4 s avec les données de langue livrées ; délai de 5 ms → erreur `OCR_TIMEOUT` sans arrêt du processus.

## Couverture par exigence

| Exigence | Tests |
|---|---|
| AUTH-03 routes privées | `api.test.js` : 13 routes × (sans token, token invalide) |
| AUTH-04 isolation | `regles.test.js` : lecture/suppression/création/liste croisées sur `users`, `lettres`, `analyses`, `documentChats`, `usage`, `stripeEvents` |
| LETTER-02 validation | champs vides, trop longs, non textuels, type inconnu, ton inconnu |
| LETTER-06 quota concurrent | `serveur.test.js` : 20 requêtes simultanées → 3 acceptées |
| LETTER-07 échec IA | `api.test.js` : 502 + libération ; `services.test.js` : réponse vide, erreur réseau |
| DOC-01/02 fichiers | type interdit, taille > 8 Mo, exécutable déguisé, PNG déclaré PDF, PDF illisible, sans fichier |
| BILLING-01/02 | Checkout/portail fondés sur le token ; client existant réutilisé ; 409 si Premium ; 404 sans client |
| BILLING-03/04/05 | signature invalide, doublon, désordre, impayé, annulation, réactivation, `metadata.uid` |
| LETTER-05 historique | API : pagination bornée, 404 croisé ; émulateur : tri anciennes/nouvelles lettres, propriété ; UI : échappement, « Afficher plus », suppression confirmée |
| Erreurs réseau (UI) | `interface.test.js` : coupure réseau → message lisible, bouton réactivé |
| XSS (UI) | `interface.test.js` : HTML dans réponse IA et question affiché en texte |
| CHAT-01/02 | avertissement visible ; 6e message refusé (402), concurrence 10 → 5, remise à zéro à minuit (Paris), Premium illimité |
| AUTH-05 suppression | confirmation, connexion récente, données d'un autre intactes, arrêt si Stripe échoue, interface |
| LETTER-04 / REPLY-02 | modification enregistrée (propriétaire uniquement, validation), export DOCX de la version modifiée, brouillon de réponse modifiable sans appel serveur |
| DOC-03 OCR | délai maximal, arrêt du moteur, absence de rejet non géré, données de langue présentes |
| Accessibilité | axe-core WCAG 2.2 AA : connexion, tableau de bord (clair/sombre), paiement réussi, modale, lettre en édition ; 375 px sans défilement horizontal ; Échap et retour du focus |

## Non couvert à ce jour

- Exports PDF/DOCX (bibliothèques CDN, simulées dans les tests) : recette manuelle.
- Extraction réelle `pdf-parse` (simulée) : recette manuelle avec de vrais PDF. Tesseract : un essai réel ponctuel (ci-dessus), pas dans la suite automatique.
- Appel réel OpenAI et Stripe en mode test : recette manuelle sur l'environnement de test.
- Accessibilité : les tests automatiques ne remplacent pas un essai au lecteur d'écran (NVDA/VoiceOver) et au clavier seul.

## Recette manuelle (environnement de test)

Prérequis : API de test déployée avec des clés **Stripe test** et un projet Firebase de test ; frontend pointant vers cette API.

| # | Scénario | Résultat attendu | OK ? |
|---|---|---|---|
| R1 | Créer un compte, ne pas vérifier l'email, générer une lettre | Message « Vérifie ton email » ; aucun appel IA | |
| R2 | Vérifier l'email, générer 3 lettres | 3 lettres affichées et sauvegardées ; compteur 2 → 1 → 0 | |
| R3 | Générer une 4e lettre | Message « Limite gratuite atteinte » | |
| R4 | Supprimer une lettre puis regénérer | Toujours bloqué (D-03) | |
| R4b | Historique avec plus de 10 lettres (compte Premium), dont des lettres créées avant la mise à jour | Ordre du plus récent au plus ancien, bouton « Afficher plus », ouverture et suppression | |
| R5 | Appeler `/generer-lettre` sans token (curl) | 401 | |
| R6 | Copier, télécharger TXT, PDF et DOCX une lettre avec accents et « € » | Fichiers lisibles, accents corrects | |
| R7 | Résumer et réécrire une lettre (5 styles) | Texte remplacé ; en cas d'erreur, la lettre d'origine revient | |
| R8 | Importer un PDF texte, un PDF scanné, un JPG, un PNG | Analyse avec type, organisme, date, montant, urgence, points à vérifier | |
| R9 | Importer un `.exe` renommé en `.pdf`, un fichier de 9 Mo | Message d'erreur clair, rien d'enregistré | |
| R10 | Générer une réponse à une analyse (4 tons), copier, PDF | Réponse affichée, jamais envoyée automatiquement | |
| R11 | Passer Premium avec la carte test `4242 4242 4242 4242` | Retour success ; statut Premium après réception du webhook | |
| R12 | Générer plus de 3 lettres en Premium | Illimité | |
| R13 | Ouvrir « Gérer mon abonnement », annuler | Statut repasse gratuit après webhook `customer.subscription.deleted` | |
| R14 | Carte test d'échec `4000 0000 0000 0341` au renouvellement (Stripe test clock) | Statut `payment_failed`, Premium retiré | |
| R15 | Rejouer un webhook depuis le tableau de bord Stripe | Réponse `doublon`, aucun changement | |
| R16 | Depuis la console du navigateur, tenter `updateDoc(users/<moi>, {premium:true})` | Refusé (règles déployées) | |
| R17 | Parcours complet sur mobile (375 px) | Utilisable sans défilement horizontal | |
| R18 | Modifier une lettre générée, « Enregistrer mes modifications », recharger, rouvrir depuis l'historique | Version modifiée affichée ; exports PDF/DOCX identiques | |
| R19 | Générer une réponse IA, la modifier, exporter en DOCX et PDF | Version modifiée exportée ; rien n'est envoyé | |
| R20 | Envoyer 6 messages à l'assistant en gratuit | 6e refusé avec message clair ; possible à nouveau le lendemain | |
| R21 | Supprimer son compte (Premium test) : sans saisir SUPPRIMER, puis correctement | Refus, puis abonnement résilié dans Stripe test, données et compte supprimés, déconnexion | |
| R22 | Importer une photo floue ou très grande | Analyse ou message « trop de temps » ; le serveur reste disponible (`/api/health`) | |
| R23 | Navigation au clavier seul et avec un lecteur d'écran | Tous les boutons atteignables ; modales fermées par Échap | |
