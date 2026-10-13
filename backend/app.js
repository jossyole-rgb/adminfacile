/* =========================
   APPLICATION EXPRESS
   Les dépendances externes (Firebase, OpenAI, Stripe, OCR) sont injectées,
   ce qui permet de tester l'API sans toucher aux services réels.
========================= */

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");

const { creerVerifierUtilisateur } = require("./middleware/auth");
const { gestionnaireErreurs } = require("./middleware/erreurs");
const { creerRoutesIA } = require("./routes/ia");
const { creerRoutesCompte } = require("./routes/compte");

/**
 * @param {object} deps
 * @param {object} deps.config            résultat de chargerConfig()
 * @param {Function} deps.verifyIdToken   (token, checkRevoked) => Promise<decodedToken>
 * @param {object} deps.stripe            client Stripe (webhooks.constructEvent)
 * @param {object} deps.services          { ia, comptes, facturation, documents, lettres }
 * @param {object} [deps.logger]
 * @param {object} [deps.limites]         surcharge des limites de débit (tests)
 */
function creerApp({ config, verifyIdToken, stripe, services, logger = console, limites = {} }) {
  const app = express();

  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(compression());
  app.use(
    cors({
      origin: config.corsOrigins,
      methods: ["GET", "POST", "DELETE"],
      allowedHeaders: ["Content-Type", "Authorization"],
    })
  );

  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: limites.global || 100,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      message: { error: "Trop de requêtes. Réessaie dans quelques minutes.", code: "RATE_LIMITED" },
      skip: (req) => req.path === "/webhook",
    })
  );

  // Limite IA par utilisateur authentifié (repli sur l'IP).
  const iaLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: limites.ia || 30,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: (req) => (req.user && req.user.uid ? `uid:${req.user.uid}` : ipKeyGenerator(req.ip)),
    message: { error: "Trop de requêtes IA. Merci de patienter quelques minutes.", code: "RATE_LIMITED" },
  });

  const verifierUtilisateur = creerVerifierUtilisateur(verifyIdToken);

  /* ---------- Webhook Stripe : corps brut, AVANT express.json() ---------- */

  app.post("/webhook", express.raw({ type: "application/json", limit: "1mb" }), async (req, res) => {
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        req.headers["stripe-signature"],
        config.stripeWebhookSecret
      );
    } catch (error) {
      logger.warn("Signature webhook Stripe invalide.");
      return res.status(400).json({ error: "Signature invalide." });
    }

    try {
      const resultat = await services.facturation.traiterEvenement(event);
      return res.json({ received: true, statut: resultat.statut });
    } catch (error) {
      logger.error(`Erreur traitement webhook ${event.type} (${event.id}) :`, error && error.message);
      return res.status(500).json({ error: "Erreur lors du traitement du webhook Stripe." });
    }
  });

  app.use(express.json({ limit: "100kb" }));

  app.get("/", (req, res) => {
    res.send("Serveur AdminFacile actif 🚀");
  });

  app.use(
    creerRoutesCompte({
      verifierUtilisateur,
      comptes: services.comptes,
      facturation: services.facturation,
      lettres: services.lettres,
    })
  );

  app.use(
    creerRoutesIA({
      verifierUtilisateur,
      iaLimiter,
      ia: services.ia,
      comptes: services.comptes,
      documents: services.documents,
      lettres: services.lettres,
      config,
      logger,
    })
  );

  app.use((req, res) => {
    res.status(404).json({ error: "Route introuvable.", code: "NOT_FOUND" });
  });

  app.use(gestionnaireErreurs(logger));

  return app;
}

module.exports = { creerApp };
