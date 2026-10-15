/* =========================
   CONFIGURATION
   Toutes les valeurs sensibles viennent des variables d'environnement.
========================= */

const DEFAULT_ORIGINS = [
  "https://adminfacile-app.netlify.app",
  "https://venerable-pixie-e9c9a9.netlify.app",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
];

function lireListe(valeur, parDefaut) {
  if (!valeur) return parDefaut;

  return valeur
    .split(",")
    .map((element) => element.trim())
    .filter(Boolean);
}

function chargerConfig(env = process.env) {
  return {
    port: Number(env.PORT) || 3000,
    openaiModel: env.OPENAI_MODEL || "gpt-4o-mini",
    corsOrigins: lireListe(env.CORS_ORIGINS, DEFAULT_ORIGINS),
    frontendUrl: (env.FRONTEND_URL || "https://adminfacile-app.netlify.app").replace(/\/$/, ""),
    stripePriceId: env.STRIPE_PRICE_ID || "",
    stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET || "",
    freeLetterLimit: Number(env.FREE_LETTER_LIMIT) || 3,
    freeChatDailyLimit: Number(env.FREE_CHAT_DAILY_LIMIT) || 5,
    maxUploadBytes: (Number(env.MAX_UPLOAD_MB) || 8) * 1024 * 1024,
  };
}

module.exports = { chargerConfig };
