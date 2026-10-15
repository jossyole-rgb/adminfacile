# Livraison et recette AdminFacile 2.0 — 15 octobre 2026

## Vérifié localement

- Syntaxe JavaScript et génération de `dist/`.
- 20 tests automatisés réussis, avec doubles pour les services externes.
- Connexion de démonstration, formulaire courrier en deux étapes, génération fictive, édition et enregistrement depuis le navigateur.
- Assistant : suggestion puis réponse de démonstration sur mobile.
- Tableau de bord à 1440 × 1040 et 390 × 844 ; absence de débordement horizontal à 390 px sur le tableau de bord et l’import.
- Menu mobile, navigation rapide et états vides.
- Import d’un PDF fictif, analyse de démonstration et préparation d’une réponse modifiable depuis le navigateur mobile ; question sur analyse testée par API.
- PDF et DOCX : signatures binaires, export multipage et relecture du PDF par un parseur indépendant.
- Construction de Checkout/portail : l’UID, l’e-mail et le client Stripe viennent du compte authentifié, pas du corps envoyé par le navigateur.
- Webhook : signature réelle de test, événement rejoué sans double écriture, événement antérieur sans réactivation d’un abonnement annulé.

## À exécuter dans un environnement de test distinct

1. Sauvegarder les collections réelles et les règles actuelles ; restaurer cette sauvegarde sur un projet Firebase de test.
2. Configurer les comptes de test et vérifier inscription, e-mail, récupération, déconnexion, expiration et révocation de token.
3. Charger des données anciennes dans `lettres`, `analyses` et `users`, contrôler les dates et les propriétaires.
4. Exécuter la concurrence du quota avec le vrai adaptateur Firestore, y compris l’initialisation d’un compte historique et l’échec de persistance.
5. Déployer les règles sur le projet de test, vérifier que tout accès client direct est refusé et que l’API continue de fonctionner.
6. Tester un vrai PDF texte, une image lisible, une image malformée, 8 Mo dépassés, 40 pages dépassées, PDF scanné et OCR sans texte. Mesurer le temps et la mémoire.
7. Tester le compte Stripe de test : tarif réel affiché, paiement réussi, échec, renouvellement, annulation à échéance, résiliation et événements dans le désordre. Tester les requêtes concurrentes de webhook contre Firestore réel.
8. Tester les parcours complets en 320, 390, 768 et 1440 px, au clavier et avec lecteur d’écran ; vérifier le contraste et le zoom à 200 %.
9. Contrôler la suppression complète sur données de test et définir la clôture assistée pour les comptes facturés. Vérifier la politique des sauvegardes et des sous-traitants.
10. Valider tarifs/quotas Premium, CGU, confidentialité, mentions légales, durées et sous-traitants. Ne pas annoncer une conformité certifiée.
11. Refaire l’audit des dépendances et traiter les alertes modérées restantes ; migrer Firebase Admin seulement après vérification des changements majeurs.
12. Valider cette recette avant toute fusion de `develop` dans `main` et tout déploiement réel.

## Points de conception explicites

Les fichiers originaux ne sont pas stockés. Le texte extrait (24 000 caractères maximum) et les analyses conservées peuvent contenir des données personnelles : limiter les imports et documenter la conservation. Les sources réglementaires ne sont pas recherchées automatiquement ; l’assistant doit signaler ce qu’il ne peut vérifier. Le service OpenAI n’a pas de navigation activée.

Le quota gratuit correspond à 3 générations au total, comme dans l’application initiale. La fréquence de réinitialisation et les autres limites commerciales n’ont pas été inventées. L’anti-abus IA limite à 30 requêtes par compte et par fenêtre de 15 minutes ; il est en mémoire par processus et doit être partagé (Redis ou équivalent) si plusieurs instances sont déployées.

Les requêtes IA sont limitées en longueur et ne sont pas rejouées automatiquement. La génération réservée puis interrompue brutalement doit être rapprochée avant un lancement commercial ; une file durable et un journal de tentatives restent recommandés pour cette phase.

Le mode démo n’est jamais un mode de production. Les résultats fictifs sont signalés en permanence. Aucun déploiement, migration de données, modification des règles hébergées ni paiement n’a été effectué pendant la livraison.

## Raccordement des services réels

- OpenAI : clé existante vérifiée par lecture du modèle `gpt-4o-mini`. Un appel de génération minimal, sans donnée personnelle, est utilisé pour vérifier l’inférence.
- Stripe : compte accessible et deux tarifs mensuels EUR à 9,99 € présents en mode production. À la demande de l’utilisateur, le tarif du produit « AdminFacile Premium » (sans le suffixe TEST) a été sélectionné et le mode live renseigné. Aucun paiement ni webhook distant n’a été créé. Le secret de signature manque toujours. L’application exige `STRIPE_MODE`, un tarif, le secret webhook et `STRIPE_CHECKOUT_ENABLED=true` avant de proposer Checkout.
- Firebase : configuration publique web renseignée à partir du fichier historique. Compte de service serveur raccordé depuis `.secrets/firebase-service-account.json`, ignoré par Git, permissions 600. Authentication et Firestore vérifiés en lecture avec succès.

Diagnostic réexécutable sans affichage de secrets : `npm run services:check -- --network`. Celui-ci effectue uniquement des lectures sur les services configurés. Un état EN ATTENTE/MANQUANT donne un code de sortie 1 pour ne pas laisser croire que la configuration est complète.

- Le serveur Render historique répond 404 sur `/api/health` : la nouvelle API n’y est pas encore déployée. Les webhooks Stripe existants pointent sur `/stripe-webhook` ; cette URL est désormais un alias de `/webhook` dans le code local.
- Le portail client Stripe a été créé en production après autorisation explicite : factures, mise à jour du moyen de paiement et résiliation à échéance activées. Configuration relue auprès de Stripe puis raccordée via `STRIPE_PORTAL_CONFIGURATION_ID` dans le fichier privé `.env`. Aucun paiement, résiliation ni modification d’un abonnement client n’a été effectué.

## Recette réelle complémentaire

`npm run test:live` : 13 contrôles réussis avec Firebase et OpenAI réels, dont l’isolation de deux comptes, les quotas transactionnels concurrents, la génération et sauvegarde de courrier/réponse, l’import PDF, le chat documentaire et le nettoyage des seuls comptes techniques créés. Aucun paiement effectué.

Les droits Premium proviennent désormais de subscriptions, collection inaccessible aux clients directs. Les profils users falsifiés ne peuvent pas activer Premium ; la reprise historique vérifie une session Stripe Checkout achevée et son propriétaire. Firebase Admin 14.5 utilise les imports modulaires ; audit npm de production : zéro vulnérabilité.

Les règles hébergées restent à publier : le simulateur REST a refusé l’accès (403). Le déploiement Render/Netlify et le contrôle des événements Stripe restent à terminer.
