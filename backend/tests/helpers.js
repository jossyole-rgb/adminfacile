/* =========================
   OUTILS DE TEST
   Faux services : aucun appel réseau vers Firebase, OpenAI ou Stripe.
========================= */

const { creerApp } = require("../app");
const { chargerConfig } = require("../config");

const TOKENS = {
  "token-alice": { uid: "alice", email: "alice@example.test", email_verified: true },
  "token-bob": { uid: "bob", email: "bob@example.test", email_verified: true },
  "token-non-verifie": { uid: "carol", email: "carol@example.test", email_verified: false },
};

async function fauxVerifyIdToken(token) {
  if (TOKENS[token]) return TOKENS[token];
  throw new Error("invalid token");
}

const silencieux = { log() {}, warn() {}, error() {} };

function creerFauxServices(surcharges = {}) {
  const appels = [];

  const ia = new Proxy(
    {},
    {
      get(_, methode) {
        if (methode === "then") return undefined;
        return async (...args) => {
          appels.push({ methode, args });
          if (surcharges.iaEchoue) throw Object.assign(new Error("IA indisponible"), { status: 502, code: "AI_ERROR", expose: true });
          return `réponse-${String(methode)}`;
        };
      },
    }
  );

  const quota = { utilisees: 0, limite: 3, premium: false, liberations: 0 };

  const comptes = {
    async reserverGeneration() {
      if (!quota.premium && quota.utilisees >= quota.limite) {
        return { autorise: false, premium: false, utilisees: quota.utilisees, limite: quota.limite };
      }
      quota.utilisees += 1;
      return { autorise: true, premium: quota.premium, utilisees: quota.utilisees, limite: quota.limite };
    },
    async libererGeneration() {
      quota.utilisees -= 1;
      quota.liberations += 1;
    },
    async lireEtatCompte(uid) {
      return { premium: quota.premium, lettersUsed: quota.utilisees, freeLimit: quota.limite, uidLu: uid };
    },
  };

  const facturation = {
    async creerSessionCheckout(args) {
      appels.push({ methode: "checkout", args: [args] });
      return "https://checkout.stripe.test/session";
    },
    async creerSessionPortail(args) {
      appels.push({ methode: "portail", args: [args] });
      return "https://billing.stripe.test/session";
    },
    async traiterEvenement(event) {
      appels.push({ methode: "webhook", args: [event] });
      return { statut: "traite" };
    },
  };

  const documents = {
    async extraireTextes(fichiers) {
      appels.push({ methode: "extraireTextes", args: [fichiers] });
      return "texte extrait";
    },
  };

  return { services: { ia, comptes, facturation, documents }, appels, quota };
}

function creerAppTest(options = {}) {
  const faux = creerFauxServices(options);

  const stripe = {
    webhooks: {
      constructEvent(body, signature) {
        if (signature !== "signature-valide") throw new Error("bad signature");
        return JSON.parse(body.toString("utf8"));
      },
    },
  };

  const app = creerApp({
    config: { ...chargerConfig({}), stripeWebhookSecret: "whsec_test" },
    verifyIdToken: fauxVerifyIdToken,
    stripe,
    services: options.services || faux.services,
    logger: silencieux,
    limites: options.limites,
  });

  return { app, ...faux };
}

module.exports = { creerAppTest, creerFauxServices, silencieux, TOKENS };
