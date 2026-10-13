# Tests et recette — AdminFacile 2.0

## Commandes

| Commande | Contenu | Prérequis |
|---|---|---|
| `npm test` | Tests API et services (70) — faux services, aucun réseau | Node ≥ 20 |
| `npm run test:interface` | Tests navigateur Chromium (11) — Firebase, API et CDN simulés | Playwright 1.56 + Chromium (`npx playwright install chromium` en local) |
| `npm run test:emulateur` | Règles Firestore (31) + quota, webhooks et historique sur Firestore réel (18) | Java 11+, `firebase-tools` (devDependency) |
| `npm run test:tout` | Les trois suites | — |

Aucun test n'utilise de clé réelle, de vrai paiement ni la base de production (projet `demo-adminfacile` sur émulateur).

## Dernière exécution

**13 octobre 2026**, Node 22.22, Java disponible (lot historique T8) :

| Suite | Résultat |
|---|---|
| `npm test` | 70 / 70 réussis |
| `npm run test:interface` | 11 / 11 réussis |
| `npm run test:emulateur` | 49 / 49 réussis |

Contrôle de pertinence : les tests d'interface « XSS » et « Passer Premium » **échouent** sur l'ancien `script.js` et réussissent sur le nouveau.

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

## Non couvert à ce jour

- Exports PDF/DOCX (bibliothèques CDN, simulées dans les tests) : recette manuelle.
- Extraction réelle `pdf-parse` / Tesseract (simulées) : recette manuelle avec de vrais fichiers.
- Appel réel OpenAI et Stripe en mode test : recette manuelle sur l'environnement de test.
- Accessibilité et affichage mobile : recette manuelle (phase 5).

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
