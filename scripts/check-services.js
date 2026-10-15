const fs = require("node:fs");
const path = require("node:path");
const env = {
  ...require("dotenv").parse(
    fs.readFileSync(path.resolve(__dirname, "../.env")),
  ),
  ...process.env,
};
const {
  firebaseCredentials,
  stripeConfig,
  billingAvailable,
} = require("../backend/config");
const remote = process.argv.includes("--network");
const report = [];
function result(service, status, detail) {
  report.push({ service, status, detail });
  console.log(`${service} : ${status} — ${detail}`);
}
async function inspect(service, fn) {
  try {
    await fn();
  } catch (e) {
    result(
      service,
      "ÉCHEC",
      e.status === 401 || e.statusCode === 401
        ? "Identifiants refusés."
        : e.code === "ENOENT"
          ? "Fichier de configuration introuvable."
          : `Vérification impossible (code ${String(e.code || e.status || e.statusCode || "connexion").replace(/[^a-zA-Z0-9/_-]/g, "")}).`,
    );
  }
}
(async () => {
  await Promise.all([
    inspect("OpenAI", async () => {
      if (!env.OPENAI_API_KEY)
        return result("OpenAI", "MANQUANT", "OPENAI_API_KEY");
      if (!remote)
        return result(
          "OpenAI",
          "CONFIGURÉ",
          `Modèle ${env.OPENAI_MODEL || "gpt-4o-mini"} ; connexion non testée.`,
        );
      const c = new (require("openai"))({
        apiKey: env.OPENAI_API_KEY,
        timeout: 15000,
        maxRetries: 0,
      });
      const model = await c.models.retrieve(env.OPENAI_MODEL || "gpt-4o-mini");
      result(
        "OpenAI",
        "CONNECTÉ",
        `Accès au modèle ${model.id} confirmé, sans génération facturée.`,
      );
    }),
    inspect("Firebase", async () => {
      const credentials = firebaseCredentials(env);
      if (!credentials)
        return result(
          "Firebase",
          "MANQUANT",
          "JSON du compte de service ou variables serveur nécessaires.",
        );
      if (!remote)
        return result(
          "Firebase",
          "CONFIGURÉ",
          "Compte de service valide localement ; connexion non testée.",
        );
      const services = require("../backend/firebase").createFirebase(
        env,
        "diagnostic-services",
      );
      try {
        await Promise.all([
          services.authAdmin.listUsers(1),
          services.db.listCollections(),
        ]);
        result(
          "Firebase",
          "CONNECTÉ",
          "Authentication et Firestore accessibles, aucune donnée modifiée.",
        );
      } finally {
        await services.db.terminate();
        await services.close();
      }
    }),
    inspect("Stripe", async () => {
      const conf = stripeConfig(env);
      if (!conf.key)
        return result(
          "Stripe",
          "EN ATTENTE",
          conf.mode === "disabled"
            ? "Activation volontaire requise ; aucune souscription ouverte."
            : "Clé de test manquante.",
        );
      if (!remote)
        return result(
          "Stripe",
          "CONFIGURÉ",
          `Mode ${conf.mode}, souscription ${billingAvailable(true, env) ? "activée" : "fermée (prix, webhook et activation nécessaires)"}.`,
        );
      const stripe = new (require("stripe"))(conf.key, {
        timeout: 15000,
        maxNetworkRetries: 0,
      });
      await stripe.accounts.retrieve();
      if (env.STRIPE_PRICE_ID) {
        const price = await stripe.prices.retrieve(env.STRIPE_PRICE_ID);
        if (
          !price.active ||
          !price.recurring ||
          price.livemode !== (conf.mode === "live")
        )
          throw Error();
      }
      result(
        "Stripe",
        "CONNECTÉ",
        `Mode ${conf.mode}, ${billingAvailable(stripe, env) ? "souscription configurée, webhook à tester de bout en bout" : "souscription fermée : prix, secret webhook et activation nécessaires"}. Aucun paiement créé.`,
      );
    }),
  ]);
  if (
    report.some((r) => ["ÉCHEC", "MANQUANT", "EN ATTENTE"].includes(r.status))
  )
    process.exitCode = 1;
})();
